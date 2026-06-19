import { Bitsmap } from "../core/bitsmap.js";
import { PS } from "../core/namespace.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

PS.vegetation = PS.vegetation || {
  TYPES: {
    NONE: 0,
    TREE_SMALL: 1,
    TREE_MEDIUM: 2,
    TREE_BIG: 3,
    BUSH: 4,
    FLOWER: 5,
    MUSHROOM: 6,
    ROCK: 7,
    GRASS_TUFT: 8
  },
  width: 0,
  height: 0,
  data: null,
  grassDensityMap: null,
  grassDensityData: null,

  init: function (width, height) {
    this.width = Math.max(1, Math.round(Number(width) || (typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 1)));
    this.height = Math.max(1, Math.round(Number(height) || (typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 1)));
    this.data = new Uint8Array(this.width * this.height);
    this.grassDensityMap = new Bitsmap(4, this.width * this.height);
    this.grassDensityData = this.grassDensityMap.data;
    return this;
  },

  ensure: function () {
    if (!this.data) {
      this.init();
    } else if (!this.grassDensityMap || this.grassDensityMap.length !== this.data.length || this.grassDensityMap.data !== this.grassDensityData) {
      this.grassDensityMap = new Bitsmap(4, this.data.length, this.grassDensityData instanceof Uint32Array ? this.grassDensityData : null);
      this.grassDensityData = this.grassDensityMap.data;
    }

    return this;
  },

  wrapX: function (x) {
    this.ensure();
    var ix = Math.round(Number(x) || 0) % this.width;
    return ix < 0 ? ix + this.width : ix;
  },

  clampY: function (y) {
    this.ensure();
    var iy = Math.round(Number(y) || 0);
    return iy < 0 ? 0 : (iy >= this.height ? this.height - 1 : iy);
  },

  tileIndex: function (x, y) {
    this.ensure();
    return this.clampY(y) * this.width + this.wrapX(x);
  },

  pack: function (type, variant) {
    var packedType = Math.max(0, Math.min(15, Math.round(Number(type) || 0)));
    var packedVariant = Math.max(0, Math.min(15, Math.round(Number(variant) || 0)));
    return (packedVariant << 4) | packedType;
  },

  unpack: function (value) {
    var packed = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
    return {
      type: packed & 15,
      variant: (packed >> 4) & 15
    };
  },

  get: function (tx, ty) {
    this.ensure();
    return this.unpack(this.data[this.tileIndex(tx, ty)]);
  },

  getType: function (tx, ty) {
    this.ensure();
    return this.data[this.tileIndex(tx, ty)] & 15;
  },

  set: function (tx, ty, type, variant) {
    this.ensure();
    this.data[this.tileIndex(tx, ty)] = this.pack(type, variant);
    return this.get(tx, ty);
  },

  clear: function (tx, ty) {
    this.ensure();
    this.data[this.tileIndex(tx, ty)] = 0;
    return this.get(tx, ty);
  },

  getGrassDensity: function (tx, ty) {
    this.ensure();
    return this.grassDensityMap.get(this.tileIndex(tx, ty));
  },

  setGrassDensity: function (tx, ty, density) {
    this.ensure();
    return this.grassDensityMap.set(this.tileIndex(tx, ty), density);
  },

  hash: function (x, y, salt) {
    var hash = 2166136261;
    hash ^= this.wrapX(x) & 65535;
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= this.clampY(y) & 65535;
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= Math.round(Number(salt) || 0) & 65535;
    hash = Math.imul(hash, 16777619) >>> 0;
    return hash >>> 0;
  },

  roll: function (x, y, salt) {
    if (PS.ranmap && PS.ranmap.data && typeof PS.ranmap.normalizedBits === "function") {
      return PS.ranmap.normalizedBits(x + salt * 17, y + salt * 31, 0, 16);
    }

    return this.hash(x, y, salt) / 4294967295;
  },

  variant: function (x, y, salt, count) {
    var max = Math.max(1, Math.round(Number(count) || 1));

    if (PS.ranmap && PS.ranmap.data && typeof PS.ranmap.variant === "function") {
      return PS.ranmap.variant(x + salt * 11, y + salt * 23, max);
    }

    return this.hash(x, y, salt) % max;
  },

  getTileMoistureFactor: function (tile) {
    var detail = tile && tile.detail ? tile.detail : {};
    var signals = detail.materialSignals || tile && tile.materialSignals || {};
    var hasSignalMoisture = signals.moisture !== undefined;
    var raw = hasSignalMoisture ? signals.moisture : tile && tile.moisture;
    var value = Number(raw);

    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.min(1, hasSignalMoisture || value <= 1 ? value : value / 2.2));
  },

  getTileVegetationFactor: function (tile, rules) {
    var detail = tile && tile.detail ? tile.detail : {};
    var signals = detail.materialSignals || tile && tile.materialSignals || {};
    var raw = signals.vegetation !== undefined ? signals.vegetation : (
      tile && tile.vegetation !== undefined ? tile.vegetation : tile && tile.vegetationDensity
    );

    if (Number.isFinite(Number(raw))) {
      return Math.max(0, Math.min(1, Number(raw)));
    }

    return Math.max(0, Math.min(1, (rules.tree || 0) + (rules.bush || 0) + (rules.flower || 0) + (rules.tuft || 0) + 0.2));
  },

  getGrassGroundModifier: function (tile, rules) {
    var biome = rules && rules.biome ? String(rules.biome) : this.normalizeBiome(tile);

    if (biome === "ocean" || biome === "ice") { return 0; }
    if (biome === "desert") { return 0.2; }
    if (biome === "mountain") { return 0.28; }
    if (biome === "tundra") { return 0.32; }
    if (biome === "wetland") { return 0.72; }
    if (biome === "forest") { return 0.55; }
    return 1;
  },

  getTreeProximityPenalty: function (tx, ty) {
    var penalties = [0.1, 0.2, 0.2, 0.1];
    var penalty = 0;

    for (var offset = 0; offset < penalties.length; offset += 1) {
      var type = this.getType(tx, ty + offset);
      if (type === this.TYPES.TREE_SMALL || type === this.TYPES.TREE_MEDIUM || type === this.TYPES.TREE_BIG) {
        penalty += penalties[offset];
      }
    }

    return Math.min(0.6, penalty);
  },

  computeGrassDensityForTile: function (tx, ty, tile) {
    var rules = this.getRulesForTile(tile);
    var moisture = this.getTileMoistureFactor(tile);
    var vegetation = this.getTileVegetationFactor(tile, rules);
    var modifier = this.getGrassGroundModifier(tile, rules);
    var penalty = this.getTreeProximityPenalty(tx, ty);
    var jitter = (this.roll(tx, ty, 57) - 0.5) * 0.18;
    var growth = moisture * vegetation * modifier - penalty + jitter;

    return Math.max(0, Math.min(15, Math.round(growth * 15)));
  },

  normalizeBiome: function (tile) {
    var biome = tile && tile.biome ? String(tile.biome).toLowerCase() : "unknown";
    var moisture = Number(tile && tile.moisture);
    var elevation = Number(tile && tile.elevation);
    var highland = Number(tile && tile.highlandLift);
    var river = Number(tile && tile.riverStrength);

    if (biome === "temperate") { biome = "grassland"; }
    if (biome === "arid") { biome = "desert"; }
    if (biome === "ice") { biome = "tundra"; }
    if (biome === "grassland" && (moisture > 1.45 || river > 0.3)) {
      biome = "wetland";
    }
    if (biome !== "ocean" && (elevation > 0.74 || highland > 0.58 || biome === "mountain")) {
      biome = "mountain";
    }

    return biome;
  },

  getRulesForTile: function (tile) {
    var biome = this.normalizeBiome(tile);
    var moisture = Math.max(0, Math.min(1, Number(tile && tile.moisture) / 2.2 || 0));
    var elevation = Number(tile && tile.elevation) || 0;

    if (biome === "forest") {
      return {
        biome: biome,
        tree: Math.max(0.54, Math.min(0.70, 0.58 + moisture * 0.12 - Math.max(0, elevation - 0.6) * 0.10)),
        bush: 0.10,
        flower: 0.03,
        mushroom: 0.02,
        rock: 0,
        tuft: 0,
        maxTreeFootprint: 3
      };
    }

    if (biome === "grassland") {
      return {
        biome: biome,
        tree: 0.05 + moisture * 0.10,
        bush: 0.20,
        flower: 0.08,
        mushroom: 0,
        rock: 0.05,
        tuft: 0.07,
        maxTreeFootprint: 1
      };
    }

    if (biome === "desert") {
      return {
        biome: biome,
        tree: 0.02,
        bush: 0.03,
        flower: 0,
        mushroom: 0,
        rock: 0.05,
        tuft: 0,
        maxTreeFootprint: 1
      };
    }

    if (biome === "tundra") {
      return {
        biome: biome,
        tree: 0,
        bush: 0.02,
        flower: 0.03,
        mushroom: 0,
        rock: 0.05,
        tuft: 0,
        maxTreeFootprint: 1
      };
    }

    if (biome === "wetland") {
      return {
        biome: biome,
        tree: 0.10,
        bush: 0,
        flower: 0,
        mushroom: 0.05,
        rock: 0,
        tuft: 0.30,
        maxTreeFootprint: 1
      };
    }

    if (biome === "mountain") {
      return {
        biome: biome,
        tree: elevation < 0.92 ? 0.02 : 0,
        bush: 0.05,
        flower: 0,
        mushroom: 0,
        rock: 0.20,
        tuft: 0,
        maxTreeFootprint: 1
      };
    }

    return {
      biome: biome,
      tree: 0,
      bush: 0,
      flower: 0,
      mushroom: 0,
      rock: 0,
      tuft: 0,
      maxTreeFootprint: 1
    };
  },

  canPlaceFootprint: function (tx, ty, size) {
    this.ensure();
    var footprint = Math.max(1, Math.round(Number(size) || 1));

    for (var oy = 0; oy < footprint; oy++) {
      var y = this.clampY(ty + oy);
      for (var ox = 0; ox < footprint; ox++) {
        if (this.getType(tx + ox, y) !== this.TYPES.NONE) {
          return false;
        }
      }
    }

    return true;
  },

  canPlaceTreeFootprint: function (tx, ty, size) {
    return this.canPlaceFootprint(tx, ty, size);
  },

  markFootprint: function (tx, ty, size, type, variant) {
    var footprint = Math.max(1, Math.round(Number(size) || 1));
    var placed = 0;

    for (var oy = 0; oy < footprint; oy++) {
      var y = this.clampY(ty + oy);
      for (var ox = 0; ox < footprint; ox++) {
        if (this.getType(tx + ox, y) === this.TYPES.NONE) {
          this.set(tx + ox, y, type, variant);
          placed++;
        }
      }
    }

    return placed;
  },

  placeTreePass: function (tiles, footprint, type, stats) {
    for (var y = 0; y < this.height; y++) {
      for (var x = 0; x < this.width; x++) {
        var tile = tiles[y * this.width + x];
        var rules = this.getRulesForTile(tile);

        if (rules.maxTreeFootprint < footprint || this.roll(x, y, 1) >= rules.tree) {
          continue;
        }

        if (footprint === 3 && this.roll(x, y, 21) >= 0.16) {
          continue;
        }

        if (footprint === 2 && this.roll(x, y, 22) >= 0.34) {
          continue;
        }

        if (this.canPlaceTreeFootprint(x, y, footprint)) {
          var placed = this.markFootprint(x, y, footprint, type, this.variant(x, y, 31, 16));
          stats.trees += placed;
          stats.total += placed;
        }
      }
    }
  },

  placeGroundForTile: function (tx, ty, tile, stats) {
    var rules = this.getRulesForTile(tile);
    var roll = this.roll(tx, ty, 1);

    if (roll < rules.tree || this.getType(tx, ty) !== this.TYPES.NONE) {
      return;
    }

    var threshold = rules.tree + rules.bush;
    if (roll < threshold) {
      this.set(tx, ty, this.TYPES.BUSH, this.variant(tx, ty, 32, 16));
      stats.bushes++;
      stats.total++;
      return;
    }

    threshold += rules.flower;
    if (roll < threshold) {
      this.set(tx, ty, this.TYPES.FLOWER, this.variant(tx, ty, 33, 16));
      stats.flowers++;
      stats.total++;
      return;
    }

    threshold += rules.mushroom;
    if (roll < threshold) {
      this.set(tx, ty, this.TYPES.MUSHROOM, this.variant(tx, ty, 34, 16));
      stats.mushrooms++;
      stats.total++;
      return;
    }

    threshold += rules.rock;
    if (roll < threshold) {
      this.set(tx, ty, this.TYPES.ROCK, this.variant(tx, ty, 35, 16));
      stats.rocks++;
      stats.total++;
      return;
    }

    threshold += rules.tuft;
    if (roll < threshold) {
      this.set(tx, ty, this.TYPES.GRASS_TUFT, this.variant(tx, ty, 36, 16));
      stats.tufts++;
      stats.total++;
    }
  },

  populateFromTerrain: function (tiles, width, height) {
    var sourceTiles = Array.isArray(tiles) ? tiles : [];
    this.init(width, height);

    var stats = {
      total: 0,
      trees: 0,
      bushes: 0,
      flowers: 0,
      mushrooms: 0,
      rocks: 0,
      tufts: 0
    };

    this.placeTreePass(sourceTiles, 3, this.TYPES.TREE_BIG, stats);
    this.placeTreePass(sourceTiles, 2, this.TYPES.TREE_MEDIUM, stats);
    this.placeTreePass(sourceTiles, 1, this.TYPES.TREE_SMALL, stats);

    for (var y = 0; y < this.height; y++) {
      for (var x = 0; x < this.width; x++) {
        var tile = sourceTiles[y * this.width + x];
        this.placeGroundForTile(x, y, tile, stats);
      }
    }

    stats.grassDensityTotal = 0;
    stats.grassDensityTiles = 0;
    for (var gy = 0; gy < this.height; gy++) {
      for (var gx = 0; gx < this.width; gx++) {
        var density = this.computeGrassDensityForTile(gx, gy, sourceTiles[gy * this.width + gx]);
        this.setGrassDensity(gx, gy, density);
        stats.grassDensityTotal += density;
        if (density > 0) {
          stats.grassDensityTiles++;
        }
      }
    }

    stats.width = this.width;
    stats.height = this.height;
    return stats;
  }
};
