"use strict";
PS.autotile = PS.autotile || {};

PS.autotile.getMask = function (tileX, tileY, grid) {
  var x = Math.round(Number(tileX) || 0);
  var y = Math.round(Number(tileY) || 0);
  var bits = PS.render && PS.render.TerrainTransitionResolver
    ? PS.render.TerrainTransitionResolver.BITS
    : { NW: 1, N: 2, NE: 4, E: 8, SE: 16, S: 32, SW: 64, W: 128 };
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
  var centerId = PS.render.Autotile.getTileId(grid, x, y);
  var mask = 0;
  var i;
  var neighborId;

  if (!centerId) {
    return 0;
  }

  for (i = 0; i < offsets.length; i += 1) {
    neighborId = PS.render.Autotile.getTileId(grid, x + offsets[i].dx, y + offsets[i].dy);
    if (neighborId && neighborId !== centerId) {
      mask |= offsets[i].bit;
    }
  }

  return mask & 255;
};

PS.autotile.getTransitionIndex = function (tileX, tileY, gridOrNeighborType, neighborType) {
  var grid = typeof gridOrNeighborType === "object" ? gridOrNeighborType : null;
  var requestedNeighbor = String(grid ? neighborType || "" : gridOrNeighborType || "").trim();
  var mask = grid ? PS.autotile.getMask(tileX, tileY, grid) : 0;
  var bits = PS.render.TerrainTransitionResolver.BITS;
  var directionBits = {
    NW: bits.NW,
    N: bits.N,
    NE: bits.NE,
    E: bits.E,
    SE: bits.SE,
    S: bits.S,
    SW: bits.SW,
    W: bits.W
  };
  var direction = requestedNeighbor.toUpperCase();

  if (direction && Object.prototype.hasOwnProperty.call(directionBits, direction)) {
    return PS.render.TerrainTransitionResolver.prototype.maskToSpriteIndex.call(null, directionBits[direction]);
  }

  return PS.render.TerrainTransitionResolver.prototype.maskToSpriteIndex.call(null, mask);
};
