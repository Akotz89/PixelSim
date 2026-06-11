"use strict";
PS.render = PS.render || {};

PS.render.vegetation = PS.render.vegetation || {
  layerOrder: 35,
  stats: {
    visibleCount: 0,
    belowCount: 0,
    canopyCount: 0,
    grassOverlayCount: 0,
    shadowCount: 0,
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

  getVisualPolicy: function (lodState) {
    if (lodState && lodState.visualPolicy) {
      return lodState.visualPolicy;
    }

    return PS.render.lod && typeof PS.render.lod.getVisualPolicy === "function"
      ? PS.render.lod.getVisualPolicy()
      : {
        level: "SURFACE",
        vegetationMode: "sprites",
        vegetationSpriteScale: 1,
        vegetationShadowAlpha: 1
      };
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

  getCellDrawSize: function (cell, baseSize) {
    var width = Math.max(1, Number(baseSize) || 1);
    var cellWidth = cell && Number(cell.w) > 0 ? Number(cell.w) : width;
    var cellHeight = cell && Number(cell.h) > 0 ? Number(cell.h) : cellWidth;
    var aspect = Math.max(0.25, Math.min(4, cellHeight / Math.max(1, cellWidth)));

    return {
      width: width,
      height: Math.max(1, width * aspect)
    };
  },

  getProceduralVegetationCell: function (type, variant, part) {
    var packedKey = String((variant << 4) | type);
    var key = packedKey + ":" + String(part || "below");
    var cell = this.cellCache[key] || null;

    if (!cell && PS.atlas && typeof PS.atlas.getVegetationCell === "function") {
      cell = PS.atlas.getVegetationCell(type, variant, part);
      this.cellCache[key] = cell;
    }

    return cell || null;
  },

  getAcceptedVegetationCellName: function (type, variant, part) {
    var types = PS.vegetation && PS.vegetation.TYPES ? PS.vegetation.TYPES : {};
    var index = Math.max(0, Math.round(Number(variant) || 0));
    var normalizedPart = String(part || "below");

    if (type === types.TREE_SMALL || type === types.TREE_MEDIUM || type === types.TREE_BIG) {
      if (normalizedPart !== "canopy") {
        return "";
      }
      if (type === types.TREE_SMALL) {
        return "pine." + (index % 3);
      }
      if (type === types.TREE_MEDIUM) {
        return index % 2 === 0 ? "pine." + (index % 3) : "oak." + (index % 3);
      }
      return "oak." + (index % 3);
    }

    if (normalizedPart !== "below") {
      return "";
    }

    if (type === types.BUSH) {
      return index % 4 < 2 ? "berry-bush." + (index % 2) : "leafy-bush." + (index % 2);
    }
    if (type === types.FLOWER) {
      return "flower." + (index % 3);
    }
    if (type === types.MUSHROOM) {
      return "mushroom." + (index % 2);
    }
    if (type === types.GRASS_TUFT) {
      return "grass-tuft." + (index % 2);
    }

    return "";
  },

  selectAcceptedVegetationCell: function (type, variant, part, fallbackCell) {
    var cellName = this.getAcceptedVegetationCellName(type, variant, part);
    var selected;

    if (
      !cellName ||
      !PS.assets ||
      !PS.assets.equivalence ||
      typeof PS.assets.equivalence.selectCell !== "function"
    ) {
      return null;
    }

    selected = PS.assets.equivalence.selectCell(
      "vegetation",
      cellName,
      "vegetation",
      fallbackCell && fallbackCell.name ? fallbackCell.name : ""
    );

    return selected && selected.renderCell ? selected.renderCell : null;
  },

  getShadowHeight: function (type) {
    var types = PS.vegetation && PS.vegetation.TYPES ? PS.vegetation.TYPES : {};

    if (type === types.TREE_BIG) { return 8; }
    if (type === types.TREE_MEDIUM) { return 6; }
    if (type === types.TREE_SMALL) { return 4; }
    if (type === types.BUSH || type === types.FLOWER || type === types.MUSHROOM || type === types.GRASS_TUFT) { return 1; }
    if (type === types.ROCK) { return 2; }
    return 0;
  },

  appendShadowRect: function (rects, pointX, pointY, size, type, alpha) {
    var shadowHeight = this.getShadowHeight(type);
    var normalizedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
    var width;
    var height;

    if (!rects || shadowHeight <= 0 || normalizedAlpha <= 0) {
      return false;
    }

    width = Math.max(2, size * (this.isTreeType(type) ? 0.92 : 0.72));
    height = Math.max(1, shadowHeight * Math.max(0.4, size / Math.max(1, Number(typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) || 8)));
    rects.push(
      pointX - width * 0.5 + size * 0.06,
      pointY + size * 0.22,
      width,
      height,
      0.018,
      0.028,
      0.045,
      Math.min(0.42, (this.isTreeType(type) ? 0.34 : 0.22) * normalizedAlpha)
    );
    return true;
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

  appendDrawItem: function (items, tileX, tileY, type, variant, lodState) {
    var policy = this.getVisualPolicy(lodState);
    var point = this.getTilePoint(tileX, tileY);
    var size = this.getSpriteSize(type) * Math.max(0.2, Number(point && point.scale) || 1) * Math.max(0, Number(policy.vegetationSpriteScale) || 0);
    var visibility = point && Number.isFinite(Number(point.visibility)) ? Number(point.visibility) : 1;
    var fallbackCell = this.getProceduralVegetationCell(type, variant, "below");
    var cell = this.selectAcceptedVegetationCell(type, variant, "below", fallbackCell) || fallbackCell;

    if (!point || point.visible === false || !cell || policy.vegetationMode !== "sprites" || size <= 0) {
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
      canopyCell: this.getCanopyCell(type, variant)
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

  drawGrassOverlay: function (lodState) {
    var values = this.buildGrassOverlayRects(lodState);

    if (!values || values.length <= 0 || !PS.render.webgpuEntity || typeof PS.render.webgpuEntity.drawParticleRects !== "function") {
      return false;
    }

    return PS.render.webgpuEntity.drawParticleRects(new Float32Array(values));
  },

  getCanopyCell: function (type, variant) {
    var fallbackCell;
    var acceptedCell;

    if (!this.isTreeType(type)) {
      return null;
    }

    fallbackCell = this.getProceduralVegetationCell(type, variant, "canopy");
    acceptedCell = this.selectAcceptedVegetationCell(type, variant, "canopy", fallbackCell);

    return acceptedCell || fallbackCell || null;
  },

  buildDrawList: function (lodState) {
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
      this.stats.shadowCount = 0;
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
          if (this.appendDrawItem(items, x, y, type, variant, lodState) && this.isTreeType(type)) {
            canopyCount += 1;
          }
        }
      }
    }

    items.sort(function (a, b) {
      return a.sortY === b.sortY ? a.tileY - b.tileY || a.tileX - b.tileX : a.sortY - b.sortY;
    });

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

  makePackedBatchItem: function (tileX, tileY, type, variant, lodState) {
    var policy = this.getVisualPolicy(lodState);
    var useFlatPoint = typeof isGlobeRenderMode !== "function" || !isGlobeRenderMode();
    var tileSize = Math.max(1, Number(typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) || 8);
    var point = useFlatPoint ? null : this.getTilePoint(tileX, tileY);
    var pointX = useFlatPoint ? tileX * tileSize + tileSize / 2 : point && point.x;
    var pointY = useFlatPoint ? tileY * tileSize + tileSize / 2 : point && point.y;
    var pointScale = useFlatPoint ? 1 : Math.max(0.2, Number(point && point.scale) || 1);
    var visible = useFlatPoint || (point && point.visible !== false);
    var size = this.getSpriteSize(type) * pointScale * Math.max(0, Number(policy.vegetationSpriteScale) || 0);
    var alpha = useFlatPoint || !point || !Number.isFinite(Number(point.visibility)) ? 1 : Number(point.visibility);
    var fallbackBelowCell = this.getProceduralVegetationCell(type, variant, "below");
    var belowCell = this.selectAcceptedVegetationCell(type, variant, "below", fallbackBelowCell) || fallbackBelowCell;
    var canopyCell = this.isTreeType(type) ? this.getCanopyCell(type, variant) : null;

    if (!visible || policy.vegetationMode !== "sprites" || size <= 0) {
      return null;
    }

    return {
      tileX: tileX,
      tileY: tileY,
      type: type,
      variant: variant,
      pointX: pointX,
      pointY: pointY,
      sortY: Number(pointY) || 0,
      size: size,
      alpha: alpha,
      belowCell: belowCell,
      canopyCell: canopyCell
    };
  },

  appendBatchItem: function (belowBatches, canopyBatches, item) {
    var belowCount = 0;
    var canopyCount = 0;

    if (!item) {
      return { below: 0, canopy: 0 };
    }

    if (item.belowCell) {
      this.appendCellToBatchXY(belowBatches, item.belowCell, item.pointX, item.pointY, item.size, item.alpha, item.size * 0.12);
      belowCount = 1;
    }

    if (item.canopyCell) {
      this.appendCellToBatchXY(canopyBatches, item.canopyCell, item.pointX, item.pointY, item.size, item.alpha * 0.94, -item.size * 0.28);
      canopyCount = 1;
    }

    return { below: belowCount, canopy: canopyCount };
  },

  appendPackedToBatches: function (belowBatches, canopyBatches, tileX, tileY, type, variant, lodState) {
    return this.appendBatchItem(belowBatches, canopyBatches, this.makePackedBatchItem(tileX, tileY, type, variant, lodState));
  },

  appendItemShadowRect: function (rects, item, lodState) {
    var policy = this.getVisualPolicy(lodState);
    if (!item) {
      return false;
    }

    return this.appendShadowRect(rects, item.pointX, item.pointY, item.size, item.type, item.alpha * Math.max(0, Number(policy.vegetationShadowAlpha) || 0));
  },

  appendPackedShadowRect: function (rects, tileX, tileY, type, variant, lodState) {
    var item = this.makePackedBatchItem(tileX, tileY, type, variant, lodState);

    return this.appendItemShadowRect(rects, item, lodState);
  },

  appendCellToBatch: function (batches, cell, point, size, alpha, offsetY) {
    return this.appendCellToBatchXY(batches, cell, point.x, point.y, size, alpha, offsetY);
  },

  appendCellToBatchXY: function (batches, cell, pointX, pointY, size, alpha, offsetY) {
    var drawSize = this.getCellDrawSize(cell, size);

    if (PS.render.webgpuEntity && typeof PS.render.webgpuEntity.appendCell === "function") {
      PS.render.webgpuEntity.appendCell(
        batches,
        cell,
        pointX - drawSize.width / 2,
        pointY - drawSize.height / 2 + (Number(offsetY) || 0),
        drawSize.width,
        drawSize.height,
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
      drawSize.height,
      alpha,
      "vegetation",
      0,
      offsetY
    );
  },

  buildLayerBatches: function (lodState) {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var policy = this.getVisualPolicy(lodState);
    var grid = this.getGrid();
    var rect = this.getVisibleTileRect();
    var belowBatches;
    var canopyBatches;
    var shadowRects;
    var renderItems = [];
    var belowCount = 0;
    var canopyCount = 0;
    var shadowCount = 0;
    var cacheKey = grid && grid.data
      ? [
        rect.minX,
        rect.minY,
        rect.maxX,
        rect.maxY,
        grid.width,
        grid.height,
        grid.data.length,
        policy.level,
        policy.vegetationMode,
        policy.vegetationSpriteScale,
        policy.vegetationShadowAlpha
      ].join(":")
      : "";

    if (grid && grid.data && this.preparedCache && this.preparedCache.key === cacheKey && this.preparedCache.data === grid.data) {
      this.stats.visibleCount = this.preparedCache.prepared.belowCount;
      this.stats.belowCount = this.preparedCache.prepared.belowCount;
      this.stats.canopyCount = this.preparedCache.prepared.canopyCount;
      this.stats.shadowCount = this.preparedCache.prepared.shadowCount || 0;
      this.stats.lastBuildMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
      return this.preparedCache.prepared;
    }

    belowBatches = PS.render.entities.createEntityBatches();
    canopyBatches = PS.render.entities.createEntityBatches();
    shadowRects = [];

    if (!grid || !grid.data || !belowBatches || !canopyBatches || !PS.atlas || typeof PS.atlas.getVegetationCell !== "function") {
      this.stats.visibleCount = 0;
      this.stats.belowCount = 0;
      this.stats.canopyCount = 0;
      this.stats.shadowCount = 0;
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
          var item = this.makePackedBatchItem(x, y, type, (packed >> 4) & 15, lodState);
          if (item) {
            renderItems.push(item);
          }
        }
      }
    }

    renderItems.sort(function (a, b) {
      return a.sortY === b.sortY ? a.tileY - b.tileY || a.tileX - b.tileX : a.sortY - b.sortY;
    });

    for (var itemIndex = 0; itemIndex < renderItems.length; itemIndex += 1) {
      var renderItem = renderItems[itemIndex];
      var counts = this.appendBatchItem(belowBatches, canopyBatches, renderItem);
      belowCount += counts.below;
      canopyCount += counts.canopy;
      if (counts.below > 0 && this.appendItemShadowRect(shadowRects, renderItem, lodState)) {
        shadowCount += 1;
      }
    }

    this.stats.visibleCount = belowCount;
    this.stats.belowCount = belowCount;
    this.stats.canopyCount = canopyCount;
    this.stats.shadowCount = shadowCount;
    this.stats.lastBuildMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;

    var prepared = {
      belowBatches: belowBatches,
      canopyBatches: canopyBatches,
      shadowRects: shadowRects,
      belowCount: belowCount,
      canopyCount: canopyCount,
      shadowCount: shadowCount
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

    if (part === "shadow") {
      if (
        !prepared.shadowRects ||
        prepared.shadowRects.length <= 0 ||
        !PS.render.webgpuEntity ||
        typeof PS.render.webgpuEntity.drawShadowRects !== "function"
      ) {
        return false;
      }
      return PS.render.webgpuEntity.drawShadowRects(new Float32Array(prepared.shadowRects));
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
      this.drawPreparedBatches(prepared, "shadow");
      this.drawPreparedBatches(prepared, "below");
      this.drawPreparedBatches(prepared, "canopy");
      return true;
    }

    PS.render.drawOrder.submit(PS.render.DrawLayer.SHADOW, {
      id: "vegetation.shadows",
      sortY: 0,
      draw: function () {
        PS.render.vegetation.drawPreparedBatches(prepared, "shadow");
      }
    });

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

  draw: function (lodState) {
    if (!PS.render.entities || !PS.render.webgpuEntity || typeof PS.render.webgpuEntity.beginBatches !== "function") {
      return false;
    }

    return this.submitPreparedBatches(this.buildLayerBatches(lodState));
  },

  getStats: function () {
    return Object.assign({}, this.stats);
  }
};
