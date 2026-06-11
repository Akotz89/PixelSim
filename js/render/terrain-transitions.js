"use strict";
PS.render = PS.render || {};

PS.render.Autotile = PS.render.Autotile || {};

PS.render.Autotile.ORTHO_BITS = {
  N: 1,
  E: 2,
  S: 4,
  W: 8
};

PS.render.Autotile.CORNER_BITS = {
  NE: 16,
  SE: 32,
  SW: 64,
  NW: 128
};

PS.render.Autotile.ORTHO_DIRECTIONS = [
  { id: "N", dx: 0, dy: -1, bit: PS.render.Autotile.ORTHO_BITS.N },
  { id: "E", dx: 1, dy: 0, bit: PS.render.Autotile.ORTHO_BITS.E },
  { id: "S", dx: 0, dy: 1, bit: PS.render.Autotile.ORTHO_BITS.S },
  { id: "W", dx: -1, dy: 0, bit: PS.render.Autotile.ORTHO_BITS.W }
];

PS.render.Autotile.CORNER_DIRECTIONS = [
  {
    id: "NE",
    dx: 1,
    dy: -1,
    bit: PS.render.Autotile.CORNER_BITS.NE,
    adjacent: [PS.render.Autotile.ORTHO_BITS.N, PS.render.Autotile.ORTHO_BITS.E]
  },
  {
    id: "SE",
    dx: 1,
    dy: 1,
    bit: PS.render.Autotile.CORNER_BITS.SE,
    adjacent: [PS.render.Autotile.ORTHO_BITS.S, PS.render.Autotile.ORTHO_BITS.E]
  },
  {
    id: "SW",
    dx: -1,
    dy: 1,
    bit: PS.render.Autotile.CORNER_BITS.SW,
    adjacent: [PS.render.Autotile.ORTHO_BITS.S, PS.render.Autotile.ORTHO_BITS.W]
  },
  {
    id: "NW",
    dx: -1,
    dy: -1,
    bit: PS.render.Autotile.CORNER_BITS.NW,
    adjacent: [PS.render.Autotile.ORTHO_BITS.N, PS.render.Autotile.ORTHO_BITS.W]
  }
];

PS.render.Autotile.computeAutotileMask = function (tileX, tileY, matchFn) {
  var x = Math.round(Number(tileX) || 0);
  var y = Math.round(Number(tileY) || 0);
  var ortho = PS.render.Autotile.ORTHO_DIRECTIONS;
  var corners = PS.render.Autotile.CORNER_DIRECTIONS;
  var mask = 0;
  var i;
  var corner;

  if (typeof matchFn !== "function") {
    return 0;
  }

  for (i = 0; i < ortho.length; i += 1) {
    if (matchFn(x + ortho[i].dx, y + ortho[i].dy, ortho[i].id, x, y)) {
      mask |= ortho[i].bit;
    }
  }

  for (i = 0; i < corners.length; i += 1) {
    corner = corners[i];
    if (
      (mask & corner.adjacent[0]) &&
      (mask & corner.adjacent[1]) &&
      !matchFn(x + corner.dx, y + corner.dy, corner.id, x, y)
    ) {
      mask |= corner.bit;
    }
  }

  return mask & 255;
};

PS.render.Autotile.getOrthogonalMask = function (mask) {
  return Math.round(Number(mask) || 0) & 15;
};

PS.render.Autotile.getCornerMask = function (mask) {
  return (Math.round(Number(mask) || 0) >>> 4) & 15;
};

PS.render.Autotile.getVariant = function (tileX, tileY, ranFn) {
  var raw;

  if (typeof ranFn === "function") {
    raw = ranFn(tileX, tileY);
  } else if (PS.ranmap && typeof PS.ranmap.get === "function") {
    raw = PS.ranmap.get(tileX, tileY);
  } else {
    raw = Math.imul(Math.round(Number(tileX) || 0) + 374761393, 668265263) ^
      Math.imul(Math.round(Number(tileY) || 0) + 2246822519, 1274126177);
  }

  return (Number(raw) >>> 0) & 3;
};

PS.render.Autotile.getAtlasOffset = function (mask, variant) {
  return ((Math.round(Number(variant) || 0) & 3) * 16) + PS.render.Autotile.getOrthogonalMask(mask);
};

PS.render.Autotile.getCornerAtlasOffset = function (mask, variant) {
  return ((Math.round(Number(variant) || 0) & 3) * 16) + PS.render.Autotile.getCornerMask(mask);
};

PS.render.Autotile.getTileId = function (grid, tileX, tileY) {
  var width;
  var height;
  var tile;

  if (!grid) {
    return null;
  }

  if (typeof grid.getTileId === "function") {
    return grid.getTileId(tileX, tileY);
  }

  if (typeof grid.get === "function") {
    tile = grid.get(tileX, tileY);
    return typeof tile === "string" ? tile : tile && (tile.id || tile.tileId || tile.type);
  }

  width = Number(grid.width) || 0;
  height = Number(grid.height) || 0;
  if (Array.isArray(grid.tiles) && width > 0 && height > 0 && tileX >= 0 && tileY >= 0 && tileX < width && tileY < height) {
    tile = grid.tiles[tileY * width + tileX];
    return typeof tile === "string" ? tile : tile && (tile.id || tile.tileId || tile.type);
  }

  return null;
};

PS.render.Autotile.getTileDefinition = function (tileRegistry, tileId) {
  return tileRegistry && typeof tileRegistry.get === "function" ? tileRegistry.get(tileId) : null;
};

PS.render.Autotile.isModeMatch = function (mode, tileId, tile, centerTileId, centerTile) {
  var normalized = String(mode || "same-terrain");

  if (!tileId) {
    return false;
  }

  if (normalized === "same-terrain") {
    return tileId === centerTileId;
  }

  if (normalized === "terrain") {
    return tile && tile.category === "terrain";
  }

  if (normalized === "water") {
    return Number(tile && tile.waterDepth) > 0 || /water|ocean|shore|wetland/.test(tileId);
  }

  if (normalized === "ice") {
    return /ice|snow|frost/.test(tileId) || /ice|snow|frost/.test(String(tile && tile.biome || ""));
  }

  if (normalized === "wall") {
    return tile && tile.category === "wall" || /wall|cliff|rock_cliff/.test(tileId);
  }

  if (normalized === "floor") {
    return tile && tile.category === "floor" || /floor|road|pavement/.test(tileId);
  }

  if (normalized === "same-category") {
    return tile && centerTile && tile.category === centerTile.category;
  }

  return false;
};

PS.render.Autotile.createMatchFn = function (grid, mode, options) {
  var settings = options || {};
  var tileRegistry = settings.tileRegistry || (PS.core && PS.core.TileRegistry) || null;

  if (typeof mode === "function") {
    return mode;
  }

  return function (tileX, tileY, direction, centerX, centerY) {
    var tileId = PS.render.Autotile.getTileId(grid, tileX, tileY);
    var centerTileId = settings.tileId || PS.render.Autotile.getTileId(grid, centerX, centerY);
    var tile = PS.render.Autotile.getTileDefinition(tileRegistry, tileId);
    var centerTile = PS.render.Autotile.getTileDefinition(tileRegistry, centerTileId);

    return PS.render.Autotile.isModeMatch(mode, tileId, tile, centerTileId, centerTile, direction);
  };
};

PS.render.Autotile.MaskStore = function MaskStore(width, height, matchFn, options) {
  var settings = options || {};

  this.width = Math.max(1, Math.round(Number(width) || 1));
  this.height = Math.max(1, Math.round(Number(height) || 1));
  this.matchFn = typeof matchFn === "function" ? matchFn : function () { return false; };
  this.ranFn = settings.ranFn || null;
  this.masks = new Uint8Array(this.width * this.height);
  this.variants = new Uint8Array(this.width * this.height);
  this.recomputeCount = 0;
};

PS.render.Autotile.MaskStore.prototype.index = function (tileX, tileY) {
  var x = Math.round(Number(tileX) || 0);
  var y = Math.round(Number(tileY) || 0);

  if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
    return -1;
  }

  return y * this.width + x;
};

PS.render.Autotile.MaskStore.prototype.recomputeTile = function (tileX, tileY) {
  var index = this.index(tileX, tileY);
  var mask;

  if (index < 0) {
    return null;
  }

  mask = PS.render.Autotile.computeAutotileMask(tileX, tileY, this.matchFn);
  this.masks[index] = mask;
  this.variants[index] = PS.render.Autotile.getVariant(tileX, tileY, this.ranFn);
  this.recomputeCount += 1;

  return {
    x: Math.round(Number(tileX) || 0),
    y: Math.round(Number(tileY) || 0),
    mask: this.masks[index],
    variant: this.variants[index],
    atlasOffset: PS.render.Autotile.getAtlasOffset(this.masks[index], this.variants[index])
  };
};

PS.render.Autotile.MaskStore.prototype.recomputeAll = function () {
  var updates = [];
  var x;
  var y;

  for (y = 0; y < this.height; y += 1) {
    for (x = 0; x < this.width; x += 1) {
      updates.push(this.recomputeTile(x, y));
    }
  }

  return updates;
};

PS.render.Autotile.MaskStore.prototype.recomputeChanged = function (tileX, tileY) {
  var updates = [];
  var dx;
  var dy;
  var update;

  for (dy = -1; dy <= 1; dy += 1) {
    for (dx = -1; dx <= 1; dx += 1) {
      update = this.recomputeTile(tileX + dx, tileY + dy);
      if (update) {
        updates.push(update);
      }
    }
  }

  return updates;
};

PS.render.Autotile.MaskStore.prototype.getMask = function (tileX, tileY) {
  var index = this.index(tileX, tileY);
  return index >= 0 ? this.masks[index] : 0;
};

PS.render.Autotile.MaskStore.prototype.getVariant = function (tileX, tileY) {
  var index = this.index(tileX, tileY);
  return index >= 0 ? this.variants[index] : 0;
};

PS.render.Autotile.MaskStore.prototype.getAtlasOffset = function (tileX, tileY) {
  return PS.render.Autotile.getAtlasOffset(this.getMask(tileX, tileY), this.getVariant(tileX, tileY));
};

PS.render.TerrainTransitionResolver = function (tileRegistry, transitionData) {
  this.tileRegistry = tileRegistry || (PS.core && PS.core.TileRegistry) || null;
  this.transitionData = transitionData || { pairs: [] };
  this.lookup = new Map();
  this.cache = new Map();
  this.chunkCache = new Map();
  this.gridIds = typeof WeakMap === "function" ? new WeakMap() : null;
  this.nextGridId = 1;
  this.cacheHits = 0;
  this.cacheMisses = 0;
  this.buildLookupTable();
};

PS.render.TerrainTransitionResolver.BITS = {
  NW: 1,
  N: 2,
  NE: 4,
  E: 8,
  SE: 16,
  S: 32,
  SW: 64,
  W: 128
};

PS.render.TerrainTransitionResolver.prototype.getTileId = function (tileX, tileY, grid) {
  var width;
  var tile;
  var index;

  if (!grid) {
    return null;
  }

  if (typeof grid.getTileId === "function") {
    return grid.getTileId(tileX, tileY);
  }

  if (typeof grid.get === "function") {
    tile = grid.get(tileX, tileY);
    return typeof tile === "string" ? tile : tile && (tile.id || tile.tileId || tile.type);
  }

  width = Number(grid.width) || 0;
  if (Array.isArray(grid.tiles) && width > 0 && tileX >= 0 && tileY >= 0 && tileX < width) {
    index = tileY * width + tileX;
    tile = grid.tiles[index];
    return typeof tile === "string" ? tile : tile && (tile.id || tile.tileId || tile.type);
  }

  return null;
};

PS.render.TerrainTransitionResolver.prototype.getPriority = function (tileId) {
  var tile = this.tileRegistry && typeof this.tileRegistry.get === "function" ? this.tileRegistry.get(tileId) : null;
  return tile && Number.isFinite(Number(tile.transitionPriority)) ? Number(tile.transitionPriority) : 0;
};

PS.render.TerrainTransitionResolver.prototype.getPairKey = function (from, to) {
  return from + ">" + to;
};

PS.render.TerrainTransitionResolver.prototype.buildLookupTable = function () {
  var pairs = this.transitionData && Array.isArray(this.transitionData.pairs) ? this.transitionData.pairs : [];
  var i;
  var pair;
  var forward;
  var reverse;

  this.lookup.clear();

  for (i = 0; i < pairs.length; i += 1) {
    pair = pairs[i];
    forward = {
      from: pair.from,
      to: pair.to,
      sheet: pair.sheet,
      priority: Array.isArray(pair.priority) ? pair.priority.slice() : [this.getPriority(pair.from), this.getPriority(pair.to)],
      reversed: false
    };
    reverse = {
      from: pair.to,
      to: pair.from,
      sheet: pair.sheet,
      priority: [forward.priority[1], forward.priority[0]],
      reversed: true
    };
    this.lookup.set(this.getPairKey(pair.from, pair.to), forward);
    this.lookup.set(this.getPairKey(pair.to, pair.from), reverse);
  }

  return this.lookup;
};

PS.render.TerrainTransitionResolver.prototype.getPair = function (from, to) {
  return this.lookup.get(this.getPairKey(from, to)) || null;
};

PS.render.TerrainTransitionResolver.prototype.getNeighborMask = function (tileX, tileY, tileId, grid) {
  var bits = PS.render.TerrainTransitionResolver.BITS;
  var offsets = [
    { dx: -1, dy: -1, bit: bits.NW },
    { dx: 0, dy: -1, bit: bits.N },
    { dx: 1, dy: -1, bit: bits.NE },
    { dx: 1, dy: 0, bit: bits.E },
    { dx: 1, dy: 1, bit: bits.SE },
    { dx: 0, dy: 1, bit: bits.S },
    { dx: -1, dy: 1, bit: bits.SW },
    { dx: -1, dy: 0, bit: bits.W }
  ];
  var mask = 0;
  var i;
  var neighborId;

  for (i = 0; i < offsets.length; i += 1) {
    neighborId = this.getTileId(tileX + offsets[i].dx, tileY + offsets[i].dy, grid);
    if (neighborId && neighborId !== tileId && this.getPair(tileId, neighborId)) {
      mask |= offsets[i].bit;
    }
  }

  return mask;
};

PS.render.TerrainTransitionResolver.prototype.maskToSpriteIndex = function (mask) {
  var bits = PS.render.TerrainTransitionResolver.BITS;

  if (mask & bits.N) {
    return 0;
  }
  if (mask & bits.E) {
    return 1;
  }
  if (mask & bits.S) {
    return 2;
  }
  if (mask & bits.W) {
    return 3;
  }
  if (mask & bits.NE) {
    return 4;
  }
  if (mask & bits.SE) {
    return 5;
  }
  if (mask & bits.SW) {
    return 6;
  }
  if (mask & bits.NW) {
    return 7;
  }

  return -1;
};

PS.render.TerrainTransitionResolver.prototype.getOverlayEdges = function (mask) {
  var bits = PS.render.TerrainTransitionResolver.BITS;
  var edges = [];

  if (mask & bits.N) {
    edges.push({ spriteIndex: 0, rotation: 0, edge: "N" });
  }
  if (mask & bits.E) {
    edges.push({ spriteIndex: 1, rotation: 90, edge: "E" });
  }
  if (mask & bits.S) {
    edges.push({ spriteIndex: 2, rotation: 180, edge: "S" });
  }
  if (mask & bits.W) {
    edges.push({ spriteIndex: 3, rotation: 270, edge: "W" });
  }

  if (!(mask & bits.N) && !(mask & bits.E) && (mask & bits.NE)) {
    edges.push({ spriteIndex: 4, rotation: 0, edge: "NE" });
  }
  if (!(mask & bits.S) && !(mask & bits.E) && (mask & bits.SE)) {
    edges.push({ spriteIndex: 5, rotation: 90, edge: "SE" });
  }
  if (!(mask & bits.S) && !(mask & bits.W) && (mask & bits.SW)) {
    edges.push({ spriteIndex: 6, rotation: 180, edge: "SW" });
  }
  if (!(mask & bits.N) && !(mask & bits.W) && (mask & bits.NW)) {
    edges.push({ spriteIndex: 7, rotation: 270, edge: "NW" });
  }

  if ((mask & bits.N) && (mask & bits.E) && !(mask & bits.NE)) {
    edges.push({ spriteIndex: 8, rotation: 0, edge: "innerNE" });
  }
  if ((mask & bits.S) && (mask & bits.E) && !(mask & bits.SE)) {
    edges.push({ spriteIndex: 9, rotation: 90, edge: "innerSE" });
  }
  if ((mask & bits.S) && (mask & bits.W) && !(mask & bits.SW)) {
    edges.push({ spriteIndex: 10, rotation: 180, edge: "innerSW" });
  }
  if ((mask & bits.N) && (mask & bits.W) && !(mask & bits.NW)) {
    edges.push({ spriteIndex: 11, rotation: 270, edge: "innerNW" });
  }

  return edges;
};

PS.render.TerrainTransitionResolver.prototype.getNeighborSignature = function (tileX, tileY, grid) {
  var ids = [];
  var offsets = [
    [0, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]
  ];
  var i;

  for (i = 0; i < offsets.length; i += 1) {
    ids.push(this.getTileId(tileX + offsets[i][0], tileY + offsets[i][1], grid) || "");
  }

  return ids.join("|");
};

PS.render.TerrainTransitionResolver.prototype.getGridCacheId = function (grid) {
  if (!grid || typeof grid !== "object") {
    return "grid:none";
  }

  if (grid.cacheKey || grid.id) {
    return String(grid.cacheKey || grid.id);
  }

  if (this.gridIds) {
    if (!this.gridIds.has(grid)) {
      this.gridIds.set(grid, "grid:" + this.nextGridId);
      this.nextGridId += 1;
    }
    return this.gridIds.get(grid);
  }

  if (!grid.__psTransitionGridId) {
    grid.__psTransitionGridId = "grid:" + this.nextGridId;
    this.nextGridId += 1;
  }
  return grid.__psTransitionGridId;
};

PS.render.TerrainTransitionResolver.prototype.getCacheKey = function (tileX, tileY, grid) {
  var revision = grid && (grid.revision || grid.version || grid.changedAt || 0);
  var gridId = this.getGridCacheId(grid);
  if (revision) {
    return gridId + ":" + revision + ":" + tileX + "," + tileY;
  }
  return gridId + ":" + revision + ":" + tileX + "," + tileY + ":" + this.getNeighborSignature(tileX, tileY, grid);
};

PS.render.TerrainTransitionResolver.prototype.resolve = function (tileX, tileY, grid) {
  var cacheKey = this.getCacheKey(tileX, tileY, grid);
  var cached = this.cache.get(cacheKey);
  var tileId;
  var mask;
  var neighborIds;
  var overlays = [];
  var basePriority;
  var i;
  var pair;
  var neighborId;
  var edges;
  var edge;
  var result;

  if (cached) {
    this.cacheHits += 1;
    return cached;
  }

  this.cacheMisses += 1;
  tileId = this.getTileId(tileX, tileY, grid);
  if (!tileId) {
    result = { baseTile: null, mask: 0, overlays: [] };
    this.cache.set(cacheKey, result);
    return result;
  }

  mask = this.getNeighborMask(tileX, tileY, tileId, grid);
  basePriority = this.getPriority(tileId);
  neighborIds = this.getNeighborTileIds(tileX, tileY, tileId, grid);

  for (i = 0; i < neighborIds.length; i += 1) {
    neighborId = neighborIds[i];
    pair = this.getPair(tileId, neighborId);
    if (!pair) {
      continue;
    }
    if (this.getPriority(neighborId) < basePriority) {
      continue;
    }
    edges = this.getOverlayEdges(this.getDirectionalMaskForNeighbor(tileX, tileY, tileId, neighborId, grid));
    for (var e = 0; e < edges.length; e += 1) {
      edge = edges[e];
      overlays.push({
        spriteId: pair.sheet.replace(/\//g, ".") + "." + edge.spriteIndex,
        sheet: pair.sheet,
        spriteIndex: edge.spriteIndex,
        rotation: edge.rotation,
        from: tileId,
        to: neighborId,
        edge: edge.edge,
        alpha: 0.72
      });
    }
  }

  result = { baseTile: tileId, mask: mask, overlays: overlays };
  this.cache.set(cacheKey, result);
  return result;
};

PS.render.TerrainTransitionResolver.prototype.getNeighborTileIds = function (tileX, tileY, tileId, grid) {
  var ids = [];
  var seen = {};
  var offsets = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  var i;
  var neighborId;

  for (i = 0; i < offsets.length; i += 1) {
    neighborId = this.getTileId(tileX + offsets[i][0], tileY + offsets[i][1], grid);
    if (neighborId && neighborId !== tileId && !seen[neighborId]) {
      seen[neighborId] = true;
      ids.push(neighborId);
    }
  }

  return ids;
};

PS.render.TerrainTransitionResolver.prototype.getDirectionalMaskForNeighbor = function (tileX, tileY, tileId, neighborId, grid) {
  var bits = PS.render.TerrainTransitionResolver.BITS;
  var mask = 0;
  var checks = [
    { dx: -1, dy: -1, bit: bits.NW },
    { dx: 0, dy: -1, bit: bits.N },
    { dx: 1, dy: -1, bit: bits.NE },
    { dx: 1, dy: 0, bit: bits.E },
    { dx: 1, dy: 1, bit: bits.SE },
    { dx: 0, dy: 1, bit: bits.S },
    { dx: -1, dy: 1, bit: bits.SW },
    { dx: -1, dy: 0, bit: bits.W }
  ];
  var i;

  for (i = 0; i < checks.length; i += 1) {
    if (this.getTileId(tileX + checks[i].dx, tileY + checks[i].dy, grid) === neighborId) {
      mask |= checks[i].bit;
    }
  }

  return mask;
};

PS.render.TerrainTransitionResolver.prototype.invalidate = function () {
  this.cache.clear();
  this.chunkCache.clear();
  this.cacheHits = 0;
  this.cacheMisses = 0;
};

PS.render.TerrainTransitionResolver.prototype.resolveChunk = function (grid, width, height) {
  var revision = grid && (grid.revision || grid.version || grid.changedAt || 0);
  var chunkKey = this.getGridCacheId(grid) + ":" + revision + ":" + width + "x" + height;
  var cached = this.chunkCache.get(chunkKey);
  var resolved = new Array(width * height);
  var x;
  var y;

  if (cached) {
    this.cacheHits += width * height;
    return cached;
  }

  for (y = 0; y < height; y += 1) {
    for (x = 0; x < width; x += 1) {
      resolved[y * width + x] = this.resolve(x, y, grid);
    }
  }

  this.chunkCache.set(chunkKey, resolved);
  return resolved;
};

PS.render.TerrainTransitionResolver.prototype.getTransitionOverlayBatch = function (resolved) {
  return resolved && Array.isArray(resolved.overlays) ? resolved.overlays : [];
};
