"use strict";
import { PS } from "../core/namespace.js";
import { canvas } from "../ui/dom-refs.js";

PS.render = PS.render || {};

PS.render.canvasResize = PS.render.canvasResize || {
  observer: null,
  debounceTimer: 0,
  debounceMs: 100,
  lastW: 0,
  lastH: 0,
  lastDpr: 0,

  syncSize: function () {
    var targetCanvas = PS.gpu && PS.gpu.canvas;
    var device = PS.gpu && PS.gpu.device;
    var context = PS.gpu && PS.gpu.context;

    if (!targetCanvas || !device || !context) {
      return false;
    }

    var dpr = globalThis.devicePixelRatio || 1;
    var rect = targetCanvas.getBoundingClientRect();
    var physicalW = Math.round(rect.width * dpr);
    var physicalH = Math.round(rect.height * dpr);

    var maxDim = (device.limits && device.limits.maxTextureDimension2D) || 8192;
    physicalW = Math.max(1, Math.min(physicalW, maxDim));
    physicalH = Math.max(1, Math.min(physicalH, maxDim));

    if (targetCanvas.width === physicalW && targetCanvas.height === physicalH) {
      return false;
    }

    targetCanvas.width = physicalW;
    targetCanvas.height = physicalH;

    context.configure({
      device: device,
      format: PS.gpu.format || "bgra8unorm",
      alphaMode: "opaque"
    });

    this.lastW = physicalW;
    this.lastH = physicalH;
    this.lastDpr = dpr;

    if (PS.render.webgpuGbuffer && typeof PS.render.webgpuGbuffer.rebuildTextures === "function") {
      PS.render.webgpuGbuffer.rebuildTextures();
    }

    if (PS.events && typeof PS.events.emit === "function" && PS.events.types) {
      PS.events.emit(PS.events.types.CANVAS_RESIZED || "canvas-resized", {
        width: physicalW,
        height: physicalH,
        dpr: dpr
      });
    }

    return true;
  },

  onResize: function () {
    var self = PS.render.canvasResize;

    clearTimeout(self.debounceTimer);
    self.debounceTimer = setTimeout(function () {
      self.syncSize();
    }, self.debounceMs);
  },

  start: function () {
    var targetCanvas = PS.gpu && PS.gpu.canvas;

    if (!targetCanvas) {
      return false;
    }

    this.syncSize();

    if (typeof ResizeObserver === "function") {
      this.observer = new ResizeObserver(this.onResize);
      this.observer.observe(targetCanvas);
    } else {
      window.addEventListener("resize", this.onResize);
    }

    if (typeof window.matchMedia === "function") {
      var dprQuery = globalThis.matchMedia("(resolution: " + (globalThis.devicePixelRatio || 1) + "dppx)");

      if (dprQuery && typeof dprQuery.addEventListener === "function") {
        dprQuery.addEventListener("change", this.onResize);
      }
    }

    return true;
  },

  stop: function () {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    window.removeEventListener("resize", this.onResize);
    clearTimeout(this.debounceTimer);
  }
};
