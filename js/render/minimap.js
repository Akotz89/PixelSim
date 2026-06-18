"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp, getTileIndex } from "../core/utils.js";
import { getPlanetTile } from "./planet-grid.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";
import { markCameraInteracting } from "../ui/camera-input.js";
import { canvas } from "../ui/dom-refs.js";

PS.render = PS.render || {};

PS.render.minimap = PS.render.minimap || {
  width: 220,
  padding: 14,
  maxColumns: 64,
  colors: {
    fallback: "#26313a",
    settlement: "#e4c86a",
    organism: "#f4f7ff",
    viewport: "#ffffff",
    border: "#0b1016",
    panel: "#071019"
  },
  stats: {
    cellCount: 0,
    settlementCount: 0,
    organismCount: 0,
    lastDrawn: false,
    dirtyTileCount: 0
  },
  dirtyTiles: {},

  representativeTileByBiome: {
    barren: "grass_dead",
    coastal: "river_shallow",
    desert: "sand",
    forest: "forest_floor",
    grassland: "grass_lush",
    ice: "ice",
    lake: "water_shallow",
    mountain: "rock",
    ocean: "water_deep",
    temperate: "grass_lush",
    tundra: "lichen_tundra",
    volcanic: "volcanic",
    wetland: "wetland"
  },

  parseHexColor: function (hexColor, fallback) {
    var color = /^#[0-9a-fA-F]{6}$/.test(String(hexColor || "")) ? String(hexColor) : String(fallback || this.colors.fallback);

    return {
      red: parseInt(color.slice(1, 3), 16) / 255,
      green: parseInt(color.slice(3, 5), 16) / 255,
      blue: parseInt(color.slice(5, 7), 16) / 255
    };
  },

  toRectColor: function (hexColor, alpha, brightness) {
    var parsed = this.parseHexColor(hexColor, this.colors.fallback);
    var scale = Math.max(0, Number(brightness) || 0);

    return [
      Math.min(1, parsed.red * scale),
      Math.min(1, parsed.green * scale),
      Math.min(1, parsed.blue * scale),
      Math.max(0, Math.min(1, alpha === undefined ? 1 : Number(alpha) || 0))
    ];
  },

  getSettlementColor: function (settlement) {
    var colors = typeof CONFIG !== "undefined" && CONFIG && Array.isArray(CONFIG.LINEAGE_COLORS)
      ? CONFIG.LINEAGE_COLORS
      : null;
    var lineageId = Math.max(1, Math.round(Number(settlement && settlement.lineageId) || 1));

    return colors && colors.length > 0
      ? colors[(lineageId - 1) % colors.length]
      : this.colors.settlement;
  },

  getWaterWaveBrightness: function (tileX, tileY, tick) {
    var phase = (Number(tileX) || 0) * 0.37 + (Number(tileY) || 0) * 0.19 + (Number(tick) || 0) * 0.045;
    return 0.92 + Math.sin(phase) * 0.08;
  },

  getTreeDensity: function (tileX, tileY, tile) {
    var vegetation = PS.vegetation || null;
    var density = 0;
    var type = 0;

    if (vegetation && typeof vegetation.getGrassDensity === "function") {
      density = Math.max(density, (Number(vegetation.getGrassDensity(tileX, tileY)) || 0) / 15);
    }

    if (vegetation && typeof vegetation.getType === "function") {
      type = Number(vegetation.getType(tileX, tileY)) || 0;
      if (type >= 1 && type <= 3) {
        density = Math.max(density, 1);
      } else if (type === 4) {
        density = Math.max(density, 0.55);
      }
    }

    if (tile && String(tile.biome || "").toLowerCase().indexOf("forest") >= 0) {
      density = Math.max(density, 0.65);
    }

    return Math.max(0, Math.min(1, density));
  },

  inferTileId: function (tile) {
    var biome = String(tile && tile.biome || "").toLowerCase();
    var elevation = Number(tile && tile.elevation);
    var seaLevelDelta = Number(tile && tile.seaLevelDelta);
    var fertility = Number(tile && tile.fertilityScore);
    var highlandLift = Number(tile && tile.highlandLift);

    if (tile && (tile.tileId || tile.id || tile.type)) {
      return String(tile.tileId || tile.id || tile.type);
    }

    if (biome === "ocean" || biome === "lake" || (Number.isFinite(seaLevelDelta) && seaLevelDelta <= 0)) {
      return Number.isFinite(seaLevelDelta) && seaLevelDelta > -0.22 ? "water_shallow" : "water_deep";
    }

    if (Number.isFinite(elevation) && elevation > 0.82 || Number.isFinite(highlandLift) && highlandLift > 0.72) {
      return "rock";
    }

    if (biome === "desert" && Number.isFinite(elevation) && elevation > 0.35) {
      return "sand_dune";
    }

    if (biome === "grassland" && Number.isFinite(fertility) && fertility < 0.5) {
      return "grass_dry";
    }

    return this.representativeTileByBiome[biome] || null;
  },

  getTileColor: function (tile, tileX, tileY, options) {
    var registry = PS.core && PS.core.TileRegistry ? PS.core.TileRegistry : null;
    var tileId = this.inferTileId(tile);
    var definition = registry && tileId && typeof registry.get === "function" ? registry.get(tileId) : null;
    var color = definition && definition.minimapColor ? definition.minimapColor : this.colors.fallback;
    var waterDepth = definition ? Number(definition.waterDepth) || 0 : 0;
    var brightness = 1;
    var treeDensity;

    if (waterDepth > 0 || /water|ocean|river|lake/.test(tileId || "")) {
      brightness = this.getWaterWaveBrightness(tileX, tileY, options && options.tick);
    } else {
      treeDensity = this.getTreeDensity(tileX, tileY, tile);
      if (treeDensity > 0) {
        brightness = 1 - treeDensity * 0.22;
      }
    }

    return {
      tileId: tileId,
      color: color,
      brightness: brightness,
      rgba: this.toRectColor(color, options && options.alpha === undefined ? 0.92 : options.alpha, brightness),
      isWater: waterDepth > 0 || /water|ocean|river|lake/.test(tileId || "")
    };
  },

  getLayout: function () {
    var targetCanvas = PS.gpu && PS.gpu.canvas ? PS.gpu.canvas : (typeof canvas !== "undefined" ? canvas : null);
    var canvasWidth = targetCanvas ? Number(targetCanvas.width) || 1 : 1;
    var canvasHeight = targetCanvas ? Number(targetCanvas.height) || 1 : 1;
    var worldWidth = Math.max(1, typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 1);
    var worldHeight = Math.max(1, typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 1);
    var minimapWidth = Math.min(this.width, Math.max(120, Math.floor(canvasWidth * 0.18)));
    var minimapHeight = Math.max(64, Math.round(minimapWidth * (worldHeight / worldWidth)));
    var columns = Math.min(this.maxColumns, worldWidth, Math.max(24, Math.round(minimapWidth / 2)));
    var rows = Math.max(12, Math.round(columns * (worldHeight / worldWidth)));

    return {
      x: Math.round(canvasWidth - minimapWidth - this.padding),
      y: Math.round(canvasHeight - minimapHeight - this.padding),
      width: minimapWidth,
      height: minimapHeight,
      columns: columns,
      rows: Math.min(rows, worldHeight),
      cellWidth: minimapWidth / columns,
      cellHeight: minimapHeight / Math.min(rows, worldHeight),
      worldWidth: worldWidth,
      worldHeight: worldHeight
    };
  },

  getTileFromCanvasPoint: function (canvasX, canvasY, layout) {
    var currentLayout = layout || this.getLayout();
    var x = Number(canvasX) || 0;
    var y = Number(canvasY) || 0;

    if (
      x < currentLayout.x ||
      y < currentLayout.y ||
      x > currentLayout.x + currentLayout.width ||
      y > currentLayout.y + currentLayout.height
    ) {
      return null;
    }

    return {
      x: clamp(Math.floor((x - currentLayout.x) / currentLayout.width * currentLayout.worldWidth), 0, currentLayout.worldWidth - 1),
      y: clamp(Math.floor((y - currentLayout.y) / currentLayout.height * currentLayout.worldHeight), 0, currentLayout.worldHeight - 1)
    };
  },

  focusFromCanvasPoint: function (canvasX, canvasY, layout) {
    var tile = this.getTileFromCanvasPoint(canvasX, canvasY, layout);

    if (!tile || !PS.camera || typeof PS.camera.focusTile !== "function") {
      return false;
    }

    PS.camera.focusTile(tile.x, tile.y);
    if (typeof markCameraInteracting === "function") {
      markCameraInteracting();
    }
    if (world) {
      world.needsRender = true;
    }
    return true;
  },

  markTileDirty: function (tileX, tileY) {
    var x = Math.round(Number(tileX) || 0);
    var y = Math.round(Number(tileY) || 0);
    var key = x + "," + y;

    if (!this.dirtyTiles[key]) {
      this.dirtyTiles[key] = { x: x, y: y };
      this.stats.dirtyTileCount += 1;
    }

    return this.dirtyTiles[key];
  },

  clearDirtyTiles: function () {
    this.dirtyTiles = {};
    this.stats.dirtyTileCount = 0;
  },

  getTileAt: function (tileX, tileY) {
    if (typeof getPlanetTile === "function") {
      return getPlanetTile(tileX, tileY);
    }
    if (world && Array.isArray(world.planetTiles) && typeof getTileIndex === "function") {
      return world.planetTiles[getTileIndex(tileX, tileY)] || null;
    }
    return null;
  },

  pushRect: function (values, x, y, width, height, color) {
    values.push(x, y, width, height, color[0], color[1], color[2], color[3]);
  },

  buildTerrainRects: function (layout, alpha) {
    var values = [];
    var tick = world ? Number(world.tick) || 0 : 0;
    var cellCount = 0;

    this.pushRect(values, layout.x - 3, layout.y - 3, layout.width + 6, layout.height + 6, this.toRectColor(this.colors.border, 0.72, 1));
    this.pushRect(values, layout.x - 1, layout.y - 1, layout.width + 2, layout.height + 2, this.toRectColor(this.colors.panel, 0.88, 1));

    for (var row = 0; row < layout.rows; row += 1) {
      for (var column = 0; column < layout.columns; column += 1) {
        var tileX = Math.min(layout.worldWidth - 1, Math.floor((column + 0.5) / layout.columns * layout.worldWidth));
        var tileY = Math.min(layout.worldHeight - 1, Math.floor((row + 0.5) / layout.rows * layout.worldHeight));
        var tile = this.getTileAt(tileX, tileY);
        var info = this.getTileColor(tile, tileX, tileY, { tick: tick, alpha: alpha });

        this.pushRect(
          values,
          layout.x + column * layout.cellWidth,
          layout.y + row * layout.cellHeight,
          Math.ceil(layout.cellWidth) + 0.25,
          Math.ceil(layout.cellHeight) + 0.25,
          info.rgba
        );
        cellCount += 1;
      }
    }

    this.stats.cellCount = cellCount;
    return values;
  },

  pushSettlementRects: function (values, layout, alpha) {
    var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
    var size = Math.max(2, Math.min(5, layout.width / 48));
    var count = 0;

    for (var i = 0; i < settlements.length; i += 1) {
      var settlement = settlements[i];
      var color;

      if (!settlement || settlement.active === false) {
        continue;
      }

      color = this.toRectColor(this.getSettlementColor(settlement), alpha === undefined ? 0.95 : alpha, 1);
      this.pushRect(
        values,
        layout.x + ((Number(settlement.x) || 0) / layout.worldWidth) * layout.width - size / 2,
        layout.y + ((Number(settlement.y) || 0) / layout.worldHeight) * layout.height - size / 2,
        size,
        size,
        color
      );
      count += 1;
    }

    this.stats.settlementCount = count;
  },

  pushOrganismRects: function (values, layout, alpha) {
    var organisms = world && Array.isArray(world.organisms) ? world.organisms : [];
    var color = this.toRectColor(this.colors.organism, alpha === undefined ? 0.72 : alpha * 0.72, 1);
    var stride = Math.max(1, Math.ceil(organisms.length / 96));
    var size = Math.max(1.5, Math.min(3, layout.width / 90));
    var count = 0;

    for (var i = 0; i < organisms.length; i += stride) {
      var organism = organisms[i];
      if (!organism || Number(organism.energy) <= 0) {
        continue;
      }

      this.pushRect(
        values,
        layout.x + ((Number(organism.x) || 0) / layout.worldWidth) * layout.width - size / 2,
        layout.y + ((Number(organism.y) || 0) / layout.worldHeight) * layout.height - size / 2,
        size,
        size,
        color
      );
      count += 1;
    }

    this.stats.organismCount = count;
  },

  draw: function (lodState, alpha) {
    var layout = this.getLayout();
    var values = this.buildTerrainRects(layout, alpha === undefined ? 0.92 : alpha * 0.92);

    this.pushSettlementRects(values, layout, alpha);
    this.pushOrganismRects(values, layout, alpha);

    if (!values.length || !PS.render.webgpuEntity || typeof PS.render.webgpuEntity.drawParticleRects !== "function") {
      this.stats.lastDrawn = false;
      return false;
    }

    this.stats.lastDrawn = PS.render.webgpuEntity.drawParticleRects(new Float32Array(values));
    return this.stats.lastDrawn;
  },

  getStats: function () {
    return Object.assign({}, this.stats);
  }
};
