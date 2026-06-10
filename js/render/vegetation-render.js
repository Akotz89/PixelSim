"use strict";
PS.render = PS.render || {};

PS.render.vegetation = PS.render.vegetation || {
  layerOrder: 35,
  stats: {
    visibleCount: 0,
    belowCount: 0,
    canopyCount: 0,
    grassOverlayCount: 0,
    lastBuildMs: 0
  },
  cellCache: {},
  preparedCache: null,

  invalidateCache: function () {
    this.preparedCache = null;
  },

  getVisibleTileRect: function () {
    if (PS.camera && PS.camera.unified && typeof PS.camera.unified.getVisibleTileRect === "function") {
      return PS.camera.unified.getVisibleTileRect();
    }

    return {
      minX: 0,
      minY: 0,
      maxX: Math.max(0, (typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 1) - 1),
      maxY: Math.max(0, (typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 1) - 1)
    };
  },

  getGrid: function () {
    if (PS.vegetation && PS.vegetation.data) {
      if (!PS.vegetation.grassDensityData && typeof world !== "undefined" && world && world.vegetationGrass) {
        PS.vegetation.grassDensityData = world.vegetationGrass;
      }
      if (!PS.vegetation.grassDensityData && typeof PS.vegetation.ensure === "function") {
        PS.vegetation.ensure();
      }
      return PS.vegetation;
    }

    if (typeof world !== "undefined" && world && world.vegetation && PS.vegetation) {
      PS.vegetation.data = world.vegetation;
      PS.vegetation.grassDensityData = world.vegetationGrass || PS.vegetation.grassDensityData;
      PS.vegetation.width = PS.vegetation.width || WORLD_WIDTH;
      PS.vegetation.height = PS.vegetation.height || WORLD_HEIGHT;
      if (!PS.vegetation.grassDensityData && typeof PS.vegetation.ensure === "function") {
        PS.vegetation.ensure();
      }
      return PS.vegetation;
    }

    return null;
  },

  isTreeType: function (type) {
    var types = PS.vegetation && PS.vegetation.TYPES ? PS.vegetation.TYPES : {};
    return type === types.TREE_SMALL || type === types.TREE_MEDIUM || type === types.TREE_BIG;
  },

  getSpriteSize: function (type) {
    var types = PS.vegetation && PS.vegetation.TYPES ? PS.vegetation.TYPES : {};
    var tileSize = Math.max(1, Number(typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) || 8);

    if (type === types.TREE_BIG) { return tileSize * 2.4; }
    if (type === types.TREE_MEDIUM) { return tileSize * 1.85; }
    if (type === types.TREE_SMALL) { return tileSize * 1.35; }
    if (type === types.ROCK) { return tileSize * 0.92; }
    return tileSize * 0.82;
  },

  getTilePoint: function (tileX, tileY) {
    if (typeof isGlobeRenderMode !== "function" || !isGlobeRenderMode()) {
      var tileSize = Math.max(1, Number(typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) || 8);
      return {
        x: tileX * tileSize + tileSize / 2,
        y: tileY * tileSize + tileSize / 2,
        scale: 1,
        visibility: 1,
        visible: true
      };
    }

    return PS.render.entities && typeof PS.render.entities.getTileRenderPosition === "function"
      ? PS.render.entities.getTileRenderPosition(tileX, tileY)
      : {
        x: tileX * (typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) + (typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) / 2,
        y: tileY * (typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) + (typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) / 2,
        scale: 1,
        visibility: 1,
        visible: true
      };
  },

  appendDrawItem: function (items, tileX, tileY, type, variant) {
    var point = this.getTilePoint(tileX, tileY);
    var size = this.getSpriteSize(type) * Math.max(0.2, Number(point && point.scale) || 1);
    var visibility = point && Number.isFinite(Number(point.visibility)) ? Number(point.visibility) : 1;
    var packedKey = String((variant << 4) | type);
    var cell = this.cellCache[packedKey + ":below"] || null;

    if (!cell && PS.atlas && typeof PS.atlas.getVegetationCell === "function") {
      cell = PS.atlas.getVegetationCell(type, variant, "below");
      this.cellCache[packedKey + ":below"] = cell;
    }

    if (!point || point.visible === false || !cell) {
      return false;
    }

    items.push({
      tileX: tileX,
      tileY: tileY,
      type: type,
      variant: variant,
      point: point,
      size: size,
      alpha: visibility,
      sortY: point.y,
      belowCell: cell,
      canopyCell: this.getCanopyCell(type, variant, packedKey)
    });
    return true;
  },

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

  buildGrassOverlayRects: function () {
    var grid = this.getGrid();
    var rect = this.getVisibleTileRect();
    var tileSize = Math.max(1, Number(typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) || 8);
    var values = [];
    var count = 0;

    if (!grid || !grid.grassDensityData || typeof grid.getGrassDensity !== "function") {
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

        if (density <= 0) {
          continue;
        }

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

  drawGrassOverlay: function () {
    var values = this.buildGrassOverlayRects();

    if (!values || values.length <= 0 || !PS.render.webgpuEntity || typeof PS.render.webgpuEntity.drawParticleRects !== "function") {
      return false;
    }

    return PS.render.webgpuEntity.drawParticleRects(new Float32Array(values));
  },

  getCanopyCell: function (type, variant, packedKey) {
    var key = (packedKey || String((variant << 4) | type)) + ":canopy";

    if (!this.isTreeType(type)) {
      return null;
    }

    if (!this.cellCache[key] && PS.atlas && typeof PS.atlas.getVegetationCell === "function") {
      this.cellCache[key] = PS.atlas.getVegetationCell(type, variant, "canopy");
    }

    return this.cellCache[key] || null;
  },

  buildDrawList: function () {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var grid = this.getGrid();
    var rect = this.getVisibleTileRect();
    var items = [];
    var data;
    var width;
    var minX;
    var maxX;
    var minY;
    var maxY;
    var canopyCount = 0;

    if (!grid || !grid.data || !PS.atlas || typeof PS.atlas.getVegetationCell !== "function") {
      this.stats.visibleCount = 0;
      this.stats.belowCount = 0;
      this.stats.canopyCount = 0;
      this.stats.lastBuildMs = 0;
      return items;
    }

    data = grid.data;
    width = Math.max(1, Number(grid.width) || WORLD_WIDTH);
    minX = Math.max(0, Math.min(width - 1, Math.floor(Number(rect.minX) || 0)));
    maxX = Math.max(0, Math.min(width - 1, Math.ceil(Number(rect.maxX) || 0)));
    minY = Math.max(0, Math.min(grid.height - 1, Math.floor(Number(rect.minY) || 0)));
    maxY = Math.max(0, Math.min(grid.height - 1, Math.ceil(Number(rect.maxY) || 0)));

    for (var y = minY; y <= maxY; y += 1) {
      var rowOffset = y * width;
      for (var x = minX; x <= maxX; x += 1) {
        var packed = data[rowOffset + x] || 0;
        var type = packed & 15;
        var variant = (packed >> 4) & 15;

        if (type !== grid.TYPES.NONE) {
          if (this.appendDrawItem(items, x, y, type, variant) && this.isTreeType(type)) {
            canopyCount += 1;
          }
        }
      }
    }

    this.stats.visibleCount = items.length;
    this.stats.belowCount = items.length;
    this.stats.canopyCount = canopyCount;
    this.stats.lastBuildMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    return items;
  },

  appendItemCell: function (batches, item, cell, yOffset, alphaScale) {
    return PS.render.entities.appendEntityCell(
      batches,
      cell,
      item.point,
      item.size,
      item.alpha * (Number(alphaScale) || 1),
      "vegetation",
      0,
      Number(yOffset) || 0
    );
  },

  drawBatchItems: function (items, part) {
    var batches = PS.render.entities.createEntityBatches();
    var drawn = 0;

    if (!batches || !PS.render.entities || typeof PS.render.entities.appendEntityCell !== "function") {
      return false;
    }

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var isCanopy = part === "canopy";
      var cell = isCanopy ? item.canopyCell : item.belowCell;
      var offset = isCanopy ? -item.size * 0.28 : item.size * 0.12;
      var alphaScale = isCanopy ? 0.94 : 1;

      if (cell && this.appendItemCell(batches, item, cell, offset, alphaScale)) {
        drawn += 1;
      }
    }

    return PS.render.entities.drawEntityBatches(batches, drawn);
  },

  appendPackedToBatches: function (belowBatches, canopyBatches, tileX, tileY, type, variant) {
    var useFlatPoint = typeof isGlobeRenderMode !== "function" || !isGlobeRenderMode();
    var tileSize = Math.max(1, Number(typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) || 8);
    var point = useFlatPoint ? null : this.getTilePoint(tileX, tileY);
    var pointX = useFlatPoint ? tileX * tileSize + tileSize / 2 : point && point.x;
    var pointY = useFlatPoint ? tileY * tileSize + tileSize / 2 : point && point.y;
    var pointScale = useFlatPoint ? 1 : Math.max(0.2, Number(point && point.scale) || 1);
    var visible = useFlatPoint || (point && point.visible !== false);
    var packedKey = String((variant << 4) | type);
    var size = this.getSpriteSize(type) * pointScale;
    var alpha = useFlatPoint || !point || !Number.isFinite(Number(point.visibility)) ? 1 : Number(point.visibility);
    var belowCell = this.cellCache[packedKey + ":below"] || null;

    if (!visible) {
      return { below: 0, canopy: 0 };
    }

    if (!belowCell && PS.atlas && typeof PS.atlas.getVegetationCell === "function") {
      belowCell = PS.atlas.getVegetationCell(type, variant, "below");
      this.cellCache[packedKey + ":below"] = belowCell;
    }

    if (belowCell) {
      this.appendCellToBatchXY(belowBatches, belowCell, pointX, pointY, size, alpha, size * 0.12);
    }

    if (this.isTreeType(type)) {
      var canopyCell = this.getCanopyCell(type, variant, packedKey);
      if (canopyCell) {
        this.appendCellToBatchXY(canopyBatches, canopyCell, pointX, pointY, size, alpha * 0.94, -size * 0.28);
        return { below: belowCell ? 1 : 0, canopy: 1 };
      }
    }

    return { below: belowCell ? 1 : 0, canopy: 0 };
  },

  appendCellToBatch: function (batches, cell, point, size, alpha, offsetY) {
    return this.appendCellToBatchXY(batches, cell, point.x, point.y, size, alpha, offsetY);
  },

  appendCellToBatchXY: function (batches, cell, pointX, pointY, size, alpha, offsetY) {
    if (PS.render.webgpuEntity && typeof PS.render.webgpuEntity.appendCell === "function") {
      PS.render.webgpuEntity.appendCell(
        batches,
        cell,
        pointX - size / 2,
        pointY - size / 2 + (Number(offsetY) || 0),
        size,
        size,
        alpha,
        null,
        "vegetation"
      );
      return true;
    }

    return PS.render.entities.appendEntityCell(
      batches,
      cell,
      { x: pointX, y: pointY, scale: 1, visibility: alpha, visible: true },
      size,
      alpha,
      "vegetation",
      0,
      offsetY
    );
  },

  buildLayerBatches: function () {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var grid = this.getGrid();
    var rect = this.getVisibleTileRect();
    var belowBatches;
    var canopyBatches;
    var belowCount = 0;
    var canopyCount = 0;
    var cacheKey = grid && grid.data
      ? [
        rect.minX,
        rect.minY,
        rect.maxX,
        rect.maxY,
        grid.width,
        grid.height,
        grid.data.length
      ].join(":")
      : "";

    if (grid && grid.data && this.preparedCache && this.preparedCache.key === cacheKey && this.preparedCache.data === grid.data) {
      this.stats.visibleCount = this.preparedCache.prepared.belowCount;
      this.stats.belowCount = this.preparedCache.prepared.belowCount;
      this.stats.canopyCount = this.preparedCache.prepared.canopyCount;
      this.stats.lastBuildMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
      return this.preparedCache.prepared;
    }

    belowBatches = PS.render.entities.createEntityBatches();
    canopyBatches = PS.render.entities.createEntityBatches();

    if (!grid || !grid.data || !belowBatches || !canopyBatches || !PS.atlas || typeof PS.atlas.getVegetationCell !== "function") {
      this.stats.visibleCount = 0;
      this.stats.belowCount = 0;
      this.stats.canopyCount = 0;
      this.stats.lastBuildMs = 0;
      return null;
    }

    var data = grid.data;
    var width = Math.max(1, Number(grid.width) || WORLD_WIDTH);
    var minX = Math.max(0, Math.min(width - 1, Math.floor(Number(rect.minX) || 0)));
    var maxX = Math.max(0, Math.min(width - 1, Math.ceil(Number(rect.maxX) || 0)));
    var minY = Math.max(0, Math.min(grid.height - 1, Math.floor(Number(rect.minY) || 0)));
    var maxY = Math.max(0, Math.min(grid.height - 1, Math.ceil(Number(rect.maxY) || 0)));

    for (var y = minY; y <= maxY; y += 1) {
      var rowOffset = y * width;
      for (var x = minX; x <= maxX; x += 1) {
        var packed = data[rowOffset + x] || 0;
        var type = packed & 15;

        if (type !== grid.TYPES.NONE) {
          var counts = this.appendPackedToBatches(belowBatches, canopyBatches, x, y, type, (packed >> 4) & 15);
          belowCount += counts.below;
          canopyCount += counts.canopy;
        }
      }
    }

    this.stats.visibleCount = belowCount;
    this.stats.belowCount = belowCount;
    this.stats.canopyCount = canopyCount;
    this.stats.lastBuildMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;

    var prepared = {
      belowBatches: belowBatches,
      canopyBatches: canopyBatches,
      belowCount: belowCount,
      canopyCount: canopyCount
    };

    this.preparedCache = {
      key: cacheKey,
      data: grid.data,
      prepared: prepared
    };

    return prepared;
  },

  drawPreparedBatches: function (prepared, part) {
    if (!prepared) {
      return false;
    }

    if (part === "canopy") {
      return PS.render.entities.drawEntityBatches(prepared.canopyBatches, prepared.canopyCount);
    }

    return PS.render.entities.drawEntityBatches(prepared.belowBatches, prepared.belowCount);
  },

  submitPreparedBatches: function (prepared) {
    if (!prepared || prepared.belowCount <= 0) {
      return false;
    }

    if (!PS.render.drawOrder || typeof PS.render.drawOrder.submit !== "function") {
      this.drawPreparedBatches(prepared, "below");
      this.drawPreparedBatches(prepared, "canopy");
      return true;
    }

    PS.render.drawOrder.submit(PS.render.DrawLayer.VEGETATION_TRUNK, {
      id: "vegetation.below",
      sortY: 0,
      draw: function () {
        PS.render.vegetation.drawPreparedBatches(prepared, "below");
      }
    });

    PS.render.drawOrder.submit(PS.render.DrawLayer.VEGETATION_CANOPY, {
      id: "vegetation.canopy",
      sortY: 0,
      draw: function () {
        PS.render.vegetation.drawPreparedBatches(prepared, "canopy");
      }
    });

    return true;
  },

  submitDraws: function (items) {
    if (!items || items.length <= 0) {
      return false;
    }

    if (!PS.render.drawOrder || typeof PS.render.drawOrder.submit !== "function") {
      this.drawBatchItems(items, "below");
      this.drawBatchItems(items, "canopy");
      return items.length > 0;
    }

    PS.render.drawOrder.submit(PS.render.DrawLayer.VEGETATION_TRUNK, {
      id: "vegetation.below",
      sortY: 0,
      draw: function () {
        PS.render.vegetation.drawBatchItems(items, "below");
      }
    });

    PS.render.drawOrder.submit(PS.render.DrawLayer.VEGETATION_CANOPY, {
      id: "vegetation.canopy",
      sortY: 0,
      draw: function () {
        PS.render.vegetation.drawBatchItems(items, "canopy");
      }
    });

    return items.length > 0;
  },

  draw: function () {
    if (!PS.render.entities || !PS.render.webgpuEntity || typeof PS.render.webgpuEntity.beginBatches !== "function") {
      return false;
    }

    return this.submitPreparedBatches(this.buildLayerBatches());
  },

  getStats: function () {
    return Object.assign({}, this.stats);
  }
};
