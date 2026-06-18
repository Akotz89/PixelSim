import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";

PS.render = PS.render || {};
PS.render.vegetation = PS.render.vegetation || {};

Object.assign(PS.render.vegetation, {
  getShadowSpec: function (type) {
    var types = PS.vegetation && PS.vegetation.TYPES ? PS.vegetation.TYPES : {};

    if (type === types.TREE_BIG) { return { height: 8, length: 6, mode: "soft" }; }
    if (type === types.TREE_MEDIUM) { return { height: 6, length: 4, mode: "soft" }; }
    if (type === types.TREE_SMALL) { return { height: 4, length: 3, mode: "soft" }; }
    if (type === types.BUSH) { return { height: 1, length: 1, mode: "hard" }; }
    if (type === types.ROCK) { return { height: 2, length: 2, mode: "hard" }; }
    return { height: 0, length: 0, mode: "none" };
  },

  getShadowHeight: function (type) {
    return this.getShadowSpec(type).height;
  },

  getShadowLength: function (type) {
    return this.getShadowSpec(type).length;
  },

  appendShadowRect: function (rects, pointX, pointY, size, type, alpha) {
    var spec = this.getShadowSpec(type);
    var shadowHeight = spec.height;
    var shadowLength = spec.length;
    var normalizedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
    var width;
    var height;

    if (!rects || shadowHeight <= 0 || shadowLength <= 0 || normalizedAlpha <= 0) {
      return false;
    }

    width = Math.max(2, size * (this.isTreeType(type) ? 0.92 : 0.72));
    height = Math.max(1, shadowHeight * Math.max(0.4, size / Math.max(1, Number(typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) || 8)));
    if (PS.render.shadows && typeof PS.render.shadows.appendStampedRects === "function") {
      return PS.render.shadows.appendStampedRects(rects, {
        x: pointX - width * 0.5 + size * 0.06,
        y: pointY + size * 0.22,
        width: width,
        rectHeight: height,
        heightUnits: shadowHeight,
        distance2Ground: Math.max(0, shadowLength - 1) * 0.45,
        alpha: Math.min(0.42, (this.isTreeType(type) ? 0.34 : 0.22) * normalizedAlpha),
        mode: spec.mode,
        color: [0.018, 0.028, 0.045]
      }) > 0;
    }

    return false;
  }
});
