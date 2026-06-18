import { PS } from "../core/namespace.js";
import { refreshLineageRegistry } from "../sim/organisms-indexes.js";
import { getOrganismsForLineage } from "../sim/settlements-state.js";
import { getSpatialDistance } from "./spatial.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "./state.js";

// ── Spatial Tile Grid (AZR-491) ────────────────────────────────────
// Intrusive doubly-linked list per tile. O(1) insert/remove/move.
// Replaces the string-keyed hash-bucket spatial index.
//
// Each tile holds the poolIndex of the head organism. Each organism
// stores nextInTile/prevInTile in the pool typed arrays.
//
// Grid coordinates: tileIndex = y * WORLD_WIDTH + x
//   x wraps around (toroidal), y clamps to [0, WORLD_HEIGHT-1]

PS.systems = PS.systems || {};

PS.tileGrid = {
  grid: null,
  lineageHeads: null,
  width: 0,
  height: 0,

  init: function (width, height) {
    this.width = Math.max(1, Math.round(Number(width) || WORLD_WIDTH));
    this.height = Math.max(1, Math.round(Number(height) || WORLD_HEIGHT));
    this.grid = new Int32Array(this.width * this.height);
    this.grid.fill(-1);
    this.lineageHeads = {};
    return this;
  },

  clear: function () {
    if (this.grid) {
      this.grid.fill(-1);
    }
    this.lineageHeads = {};

    // Reset organism tile pointers
    if (PS.pools && PS.pools.organism) {
      PS.pools.organism.arrays.nextInTile.fill(-1);
      PS.pools.organism.arrays.prevInTile.fill(-1);
    }
  },

  // ── Coordinate helpers ──

  wrapX: function (x) {
    var ix = Math.round(Number(x) || 0) % this.width;
    return ix < 0 ? ix + this.width : ix;
  },

  clampY: function (y) {
    var iy = Math.round(Number(y) || 0);
    return iy < 0 ? 0 : (iy >= this.height ? this.height - 1 : iy);
  },

  tileIndex: function (x, y) {
    return this.clampY(y) * this.width + this.wrapX(x);
  },

  // ── Tile linked-list operations ──

  insertAt: function (poolIndex, tileIdx) {
    if (!PS.pools || !PS.pools.organism) { return; }
    var arrays = PS.pools.organism.arrays;
    var head = this.grid[tileIdx];

    arrays.prevInTile[poolIndex] = -1;
    arrays.nextInTile[poolIndex] = head;

    if (head >= 0) {
      arrays.prevInTile[head] = poolIndex;
    }

    this.grid[tileIdx] = poolIndex;
  },

  removeFrom: function (poolIndex, tileIdx) {
    if (!PS.pools || !PS.pools.organism) { return; }
    var arrays = PS.pools.organism.arrays;
    var prev = arrays.prevInTile[poolIndex];
    var next = arrays.nextInTile[poolIndex];

    if (prev >= 0) {
      arrays.nextInTile[prev] = next;
    } else {
      // This was the head
      this.grid[tileIdx] = next;
    }

    if (next >= 0) {
      arrays.prevInTile[next] = prev;
    }

    arrays.nextInTile[poolIndex] = -1;
    arrays.prevInTile[poolIndex] = -1;
  },

  // ── Public API ──

  insert: function (organism) {
    var poolIndex = organism && Number.isFinite(Number(organism.poolIndex))
      ? Math.round(organism.poolIndex)
      : -1;

    if (poolIndex < 0) { return; }

    var tileIdx = this.tileIndex(organism.x, organism.y);
    this.insertAt(poolIndex, tileIdx);

    // Also insert into lineage chain
    this.insertLineage(poolIndex, organism);
  },

  remove: function (organism) {
    var poolIndex = organism && Number.isFinite(Number(organism.poolIndex))
      ? Math.round(organism.poolIndex)
      : -1;

    if (poolIndex < 0) { return; }

    var tileIdx = this.tileIndex(organism.x, organism.y);
    this.removeFrom(poolIndex, tileIdx);

    // Also remove from lineage chain
    this.removeLineage(poolIndex, organism);
  },

  move: function (organism, oldX, oldY) {
    var poolIndex = organism && Number.isFinite(Number(organism.poolIndex))
      ? Math.round(organism.poolIndex)
      : -1;

    if (poolIndex < 0) { return; }

    var oldTile = this.tileIndex(oldX, oldY);
    var newTile = this.tileIndex(organism.x, organism.y);

    if (oldTile === newTile) { return; }

    this.removeFrom(poolIndex, oldTile);
    this.insertAt(poolIndex, newTile);
  },

  // ── Query functions ──

  getEntitiesInTile: function (x, y) {
    if (!PS.pools || !PS.pools.organism) { return []; }
    var arrays = PS.pools.organism.arrays;
    var facades = PS.pools.organism.facades;
    var tileIdx = this.tileIndex(x, y);
    var head = this.grid[tileIdx];
    var result = [];
    var current = head;

    while (current >= 0) {
      if (arrays.active[current]) {
        result.push(facades[current]);
      }
      current = arrays.nextInTile[current];
    }

    return result;
  },

  countEntitiesInTile: function (x, y) {
    if (!PS.pools || !PS.pools.organism) { return 0; }
    var arrays = PS.pools.organism.arrays;
    var tileIdx = this.tileIndex(x, y);
    var current = this.grid[tileIdx];
    var count = 0;

    while (current >= 0) {
      if (arrays.active[current]) {
        count++;
      }
      current = arrays.nextInTile[current];
    }

    return count;
  },

  collectInRadius: function (cx, cy, radius, lineageId, limit) {
    if (!PS.pools || !PS.pools.organism) { return []; }
    var arrays = PS.pools.organism.arrays;
    var facades = PS.pools.organism.facades;
    var r = Math.max(0, Math.round(Number(radius) || 0));
    var maxResults = Number.isFinite(Number(limit)) ? Math.max(0, Math.round(Number(limit))) : Infinity;
    var filterLineage = Number(lineageId) > 0 ? Math.round(Number(lineageId)) : 0;
    var result = [];

    for (var dy = -r; dy <= r; dy++) {
      var ty = this.clampY(cy + dy);
      if (ty !== cy + dy && dy !== 0) {
        // Y went out of bounds and was clamped — skip duplicates
        continue;
      }

      for (var dx = -r; dx <= r; dx++) {
        var tx = this.wrapX(cx + dx);
        var tileIdx = ty * this.width + tx;
        var current = this.grid[tileIdx];

        while (current >= 0) {
          if (arrays.active[current]) {
            var orgX = arrays.x[current];
            var orgY = arrays.y[current];

            if (
              (filterLineage <= 0 || arrays.lineageId[current] === filterLineage) &&
              getSpatialDistance(cx, cy, orgX, orgY) <= r
            ) {
              result.push(facades[current]);

              if (result.length >= maxResults) {
                return result;
              }
            }
          }

          current = arrays.nextInTile[current];
        }
      }
    }

    return result;
  },

  countInRadius: function (cx, cy, radius, lineageId) {
    if (!PS.pools || !PS.pools.organism) { return 0; }
    var arrays = PS.pools.organism.arrays;
    var r = Math.max(0, Math.round(Number(radius) || 0));
    var filterLineage = Number(lineageId) > 0 ? Math.round(Number(lineageId)) : 0;
    var count = 0;

    for (var dy = -r; dy <= r; dy++) {
      var ty = this.clampY(cy + dy);
      if (ty !== cy + dy && dy !== 0) { continue; }

      for (var dx = -r; dx <= r; dx++) {
        var tx = this.wrapX(cx + dx);
        var tileIdx = ty * this.width + tx;
        var current = this.grid[tileIdx];

        while (current >= 0) {
          if (arrays.active[current]) {
            if (
              (filterLineage <= 0 || arrays.lineageId[current] === filterLineage) &&
              getSpatialDistance(cx, cy, arrays.x[current], arrays.y[current]) <= r
            ) {
              count++;
            }
          }

          current = arrays.nextInTile[current];
        }
      }
    }

    return count;
  },

  nearestInRadius: function (cx, cy, radius) {
    if (!PS.pools || !PS.pools.organism) { return null; }
    var arrays = PS.pools.organism.arrays;
    var facades = PS.pools.organism.facades;
    var r = Math.max(0, Math.round(Number(radius) || 0));
    var nearestIndex = -1;
    var nearestDist = Infinity;

    for (var dy = -r; dy <= r; dy++) {
      var ty = this.clampY(cy + dy);
      if (ty !== cy + dy && dy !== 0) { continue; }

      for (var dx = -r; dx <= r; dx++) {
        var tx = this.wrapX(cx + dx);
        var tileIdx = ty * this.width + tx;
        var current = this.grid[tileIdx];

        while (current >= 0) {
          if (arrays.active[current]) {
            var dist = getSpatialDistance(cx, cy, arrays.x[current], arrays.y[current]);

            if (dist < nearestDist && dist <= r) {
              nearestIndex = current;
              nearestDist = dist;
            }
          }

          current = arrays.nextInTile[current];
        }
      }
    }

    return nearestIndex >= 0 ? facades[nearestIndex] : null;
  },

  // ── Lineage linked list ──
  // Separate linked list per lineage for fast lineage-only queries.
  // Uses simple object heads map (lineageId → first poolIndex).
  // We re-use nextInTile/prevInTile only for tile chains. Lineage chains
  // are maintained as simple arrays since they're rebuilt per-tick anyway
  // by refreshLineageRegistry. The tile grid is the critical O(1) path.

  insertLineage: function (poolIndex, organism) {
    var lineageId = Math.max(1, Math.round(Number(organism.lineageId) || 1));
    var key = lineageId;

    if (!this.lineageHeads[key]) {
      this.lineageHeads[key] = [];
    }

    this.lineageHeads[key].push(poolIndex);
  },

  removeLineage: function (poolIndex, organism) {
    var lineageId = Math.max(1, Math.round(Number(organism.lineageId) || 1));
    var arr = this.lineageHeads[lineageId];

    if (!arr) { return; }

    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === poolIndex) {
        arr.splice(i, 1);
        return;
      }
    }
  },

  getOrganismsForLineage: function (lineageId) {
    if (!PS.pools || !PS.pools.organism) { return []; }
    var facades = PS.pools.organism.facades;
    var arrays = PS.pools.organism.arrays;
    var arr = this.lineageHeads[lineageId];
    var result = [];

    if (!arr) { return result; }

    for (var i = 0; i < arr.length; i++) {
      if (arrays.active[arr[i]]) {
        result.push(facades[arr[i]]);
      }
    }

    return result;
  },

  // ── Rebuild from world.organisms ──
  // Used once at startup or save load. After this, all changes are incremental.

  rebuildFromOrganisms: function () {
    this.clear();

    if (!world || !world.organisms) { return; }

    for (var i = 0; i < world.organisms.length; i++) {
      this.insert(world.organisms[i]);
    }
  },

  getStats: function () {
    var occupiedTiles = 0;

    if (this.grid) {
      for (var i = 0; i < this.grid.length; i++) {
        if (this.grid[i] >= 0) {
          occupiedTiles++;
        }
      }
    }

    return {
      width: this.width,
      height: this.height,
      totalTiles: this.width * this.height,
      occupiedTiles: occupiedTiles,
      lineageCount: Object.keys(this.lineageHeads || {}).length
    };
  }
};

PS.systems.tileGrid = PS.tileGrid;
