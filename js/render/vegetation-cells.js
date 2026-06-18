"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";

PS.render = PS.render || {};
PS.render.vegetation = PS.render.vegetation || {};

Object.assign(PS.render.vegetation, {
  cellCache: PS.render.vegetation.cellCache || {},

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
      if (normalizedPart !== "canopy") { return ""; }
      if (type === types.TREE_SMALL) { return "pine." + (index % 3); }
      if (type === types.TREE_MEDIUM) {
        return index % 2 === 0 ? "pine." + (index % 3) : "oak." + (index % 3);
      }
      return "oak." + (index % 3);
    }

    if (normalizedPart !== "below") { return ""; }
    if (type === types.BUSH) {
      return index % 4 < 2 ? "berry-bush." + (index % 2) : "leafy-bush." + (index % 2);
    }
    if (type === types.FLOWER) { return "flower." + (index % 3); }
    if (type === types.MUSHROOM) { return "mushroom." + (index % 2); }
    if (type === types.GRASS_TUFT) { return "grass-tuft." + (index % 2); }

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

  getCanopyCell: function (type, variant) {
    var fallbackCell;
    var acceptedCell;

    if (!this.isTreeType(type)) { return null; }
    fallbackCell = this.getProceduralVegetationCell(type, variant, "canopy");
    acceptedCell = this.selectAcceptedVegetationCell(type, variant, "canopy", fallbackCell);

    return acceptedCell || fallbackCell || null;
  }
});
