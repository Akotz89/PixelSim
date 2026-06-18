import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { isGlobeRenderMode } from "./planet-view.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

PS.render = PS.render || {};
PS.render.vegetation = PS.render.vegetation || {};

Object.assign(PS.render.vegetation, {
  layerOrder: 35,
  stats: PS.render.vegetation.stats || {
    visibleCount: 0,
    belowCount: 0,
    canopyCount: 0,
    grassOverlayCount: 0,
    shadowCount: 0,
    lastBuildMs: 0
  },
  cellCache: PS.render.vegetation.cellCache || {},
  preparedCache: PS.render.vegetation.preparedCache || null,

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

  draw: function (lodState) {
    if (!PS.render.entities || !PS.render.webgpuEntity || typeof PS.render.webgpuEntity.beginBatches !== "function") {
      return false;
    }

    return this.submitPreparedBatches(this.buildLayerBatches(lodState));
  },

  getStats: function () {
    return Object.assign({}, this.stats);
  }
});
