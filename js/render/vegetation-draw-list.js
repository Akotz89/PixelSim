import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { isGlobeRenderMode } from "./planet-view.js";
import { WORLD_WIDTH } from "../systems/state.js";

PS.render = PS.render || {};
PS.render.vegetation = PS.render.vegetation || {};

Object.assign(PS.render.vegetation, {
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

  buildDrawList: function (lodState) {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var grid = this.getGrid();
    var rect = this.getVisibleTileRect();
    var items = [];
    var canopyCount = 0;

    if (!grid || !grid.data || !PS.atlas || typeof PS.atlas.getVegetationCell !== "function") {
      this.stats.visibleCount = 0;
      this.stats.belowCount = 0;
      this.stats.canopyCount = 0;
      this.stats.shadowCount = 0;
      this.stats.lastBuildMs = 0;
      return items;
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

  submitDraws: function (items) {
    if (!items || items.length <= 0) { return false; }
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
  }
});
