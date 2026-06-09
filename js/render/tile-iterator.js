"use strict";
// ── Viewport Tile Iterator ─────────────────────────────────────────
// Zero-allocation row-by-row tile iterator for render passes.
// Walks only on-screen tiles, providing tile coords and screen positions.
//
// Usage:
//   PS.tileIterator.begin(cameraX, cameraY, zoom, canvasW, canvasH);
//   while (PS.tileIterator.next()) {
//     var tx = PS.tileIterator.tx;
//     var ty = PS.tileIterator.ty;
//     var screenX = PS.tileIterator.screenX;
//     var screenY = PS.tileIterator.screenY;
//     // draw tile...
//   }

PS.render = PS.render || {};

PS.tileIterator = {
  // Current tile coordinates
  tx: 0,
  ty: 0,

  // Screen pixel position of current tile
  screenX: 0,
  screenY: 0,

  // World tile position (for RANMAP / atlas lookups)
  tileIndex: 0,

  // Viewport bounds (tile coordinates)
  tx1: 0,
  ty1: 0,
  tx2: 0,
  ty2: 0,

  // Internal state
  _cameraX: 0,
  _cameraY: 0,
  _zoom: 1,
  _tileSize: 32,
  _started: false,
  _worldW: 0,
  _worldH: 0,

  // ── Begin iteration ──

  begin: function (cameraX, cameraY, zoom, canvasW, canvasH) {
    var tileSize = CONFIG ? CONFIG.TILE_SIZE : 32;
    var worldW = typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 100;
    var worldH = typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 100;
    var z = Math.max(0.01, zoom || 1);

    PS.tileIterator._cameraX = cameraX || 0;
    PS.tileIterator._cameraY = cameraY || 0;
    PS.tileIterator._zoom = z;
    PS.tileIterator._tileSize = tileSize;
    PS.tileIterator._worldW = worldW;
    PS.tileIterator._worldH = worldH;

    // Calculate visible tile range from camera
    var scaledTile = tileSize * z;
    var tilesVisibleX = Math.ceil((canvasW || 800) / scaledTile) + 2;
    var tilesVisibleY = Math.ceil((canvasH || 600) / scaledTile) + 2;

    var centerTileX = Math.floor(cameraX / tileSize);
    var centerTileY = Math.floor(cameraY / tileSize);

    PS.tileIterator.tx1 = centerTileX - Math.floor(tilesVisibleX / 2);
    PS.tileIterator.ty1 = Math.max(0, centerTileY - Math.floor(tilesVisibleY / 2));
    PS.tileIterator.tx2 = centerTileX + Math.ceil(tilesVisibleX / 2);
    PS.tileIterator.ty2 = Math.min(worldH - 1, centerTileY + Math.ceil(tilesVisibleY / 2));

    // Start before first tile (next() advances to first)
    PS.tileIterator.tx = PS.tileIterator.tx1 - 1;
    PS.tileIterator.ty = PS.tileIterator.ty1;
    PS.tileIterator._started = true;

    return PS.tileIterator;
  },

  // ── Advance to next tile ──
  // Returns true if there's a valid tile, false when done.

  next: function () {
    if (!PS.tileIterator._started) { return false; }

    PS.tileIterator.tx++;

    if (PS.tileIterator.tx > PS.tileIterator.tx2) {
      PS.tileIterator.tx = PS.tileIterator.tx1;
      PS.tileIterator.ty++;

      if (PS.tileIterator.ty > PS.tileIterator.ty2) {
        PS.tileIterator._started = false;
        return false;
      }
    }

    // Wrap X for cylindrical worlds
    var wrappedX = PS.tileIterator.tx % PS.tileIterator._worldW;
    if (wrappedX < 0) { wrappedX += PS.tileIterator._worldW; }

    // Compute screen position
    var tileSize = PS.tileIterator._tileSize;
    var z = PS.tileIterator._zoom;
    PS.tileIterator.screenX = (PS.tileIterator.tx * tileSize - PS.tileIterator._cameraX) * z;
    PS.tileIterator.screenY = (PS.tileIterator.ty * tileSize - PS.tileIterator._cameraY) * z;

    // Compute tile index (for array lookups)
    PS.tileIterator.tileIndex = PS.tileIterator.ty * PS.tileIterator._worldW + wrappedX;

    return true;
  },

  // ── Get wrapped X coordinate ──

  wrappedTx: function () {
    var x = PS.tileIterator.tx % PS.tileIterator._worldW;
    return x < 0 ? x + PS.tileIterator._worldW : x;
  },

  // ── Get tile count in viewport ──

  getTileCount: function () {
    var w = PS.tileIterator.tx2 - PS.tileIterator.tx1 + 1;
    var h = PS.tileIterator.ty2 - PS.tileIterator.ty1 + 1;
    return Math.max(0, w * h);
  },

  // ── Get RANMAP value for current tile ──

  ran: function () {
    if (!PS.ranmap || !PS.ranmap.data) { return 0; }
    return PS.ranmap.get(PS.tileIterator.wrappedTx(), PS.tileIterator.ty);
  },

  // ── Get stats ──

  getStats: function () {
    return {
      viewportTiles: PS.tileIterator.getTileCount(),
      range: {
        x: [PS.tileIterator.tx1, PS.tileIterator.tx2],
        y: [PS.tileIterator.ty1, PS.tileIterator.ty2]
      }
    };
  }
};

PS.render.tileIterator = PS.tileIterator;
