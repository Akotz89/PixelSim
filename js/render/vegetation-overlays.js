"use strict";
PS.render = PS.render || {};
PS.render.vegetation = PS.render.vegetation || {};

Object.assign(PS.render.vegetation, {
  getGrassOverlayColor: function (density) {
    var level = Math.max(0, Math.min(15, Math.round(Number(density) || 0)));
    var opacity = level <= 0 ? 0 : (127 * level / 15) / 255;

    return [
      0.22 + level * 0.008,
      0.48 + level * 0.014,
      0.18 + level * 0.006,
      opacity
    ];
  },

  buildGrassOverlayRects: function (lodState) {
    var policy = this.getVisualPolicy(lodState);
    var grid = this.getGrid();
    var rect = this.getVisibleTileRect();
    var tileSize = Math.max(1, Number(typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) || 8);
    var values = [];
    var count = 0;

    if (!grid || !grid.grassDensityData || typeof grid.getGrassDensity !== "function" || policy.vegetationMode === "minimap") {
      this.stats.grassOverlayCount = 0;
      return values;
    }

    var width = Math.max(1, Number(grid.width) || WORLD_WIDTH);
    var minX = Math.max(0, Math.min(width - 1, Math.floor(Number(rect.minX) || 0)));
    var maxX = Math.max(0, Math.min(width - 1, Math.ceil(Number(rect.maxX) || 0)));
    var minY = Math.max(0, Math.min(grid.height - 1, Math.floor(Number(rect.minY) || 0)));
    var maxY = Math.max(0, Math.min(grid.height - 1, Math.ceil(Number(rect.maxY) || 0)));

    for (var y = minY; y <= maxY; y += 1) {
      for (var x = minX; x <= maxX; x += 1) {
        var density = grid.getGrassDensity(x, y);
        var color;
        var jitterX;
        var jitterY;

        if (density <= 0) { continue; }
        color = this.getGrassOverlayColor(density);
        jitterX = (grid.variant(x, y, 71, 5) - 2) * tileSize * 0.025;
        jitterY = (grid.variant(x, y, 72, 5) - 2) * tileSize * 0.025;
        values.push(
          x * tileSize + jitterX,
          y * tileSize + jitterY,
          tileSize,
          tileSize,
          color[0],
          color[1],
          color[2],
          color[3]
        );
        count += 1;
      }
    }

    this.stats.grassOverlayCount = count;
    return values;
  },

  drawGrassOverlay: function (lodState) {
    var values = this.buildGrassOverlayRects(lodState);

    if (!values || values.length <= 0 || !PS.render.webgpuEntity || typeof PS.render.webgpuEntity.drawParticleRects !== "function") {
      return false;
    }

    return PS.render.webgpuEntity.drawParticleRects(new Float32Array(values));
  }
});
