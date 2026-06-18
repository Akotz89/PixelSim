"use strict";
import { PS } from "../core/namespace.js";

PS.render = PS.render || {};

PS.render.canvasResize = PS.render.canvasResize || {
  observer: null,
  dprMediaQuery: null,
  dprListener: null,
  debounceTimer: 0,
  debounceMs: 32,
  dirty: false,
  lastW: 0,
  lastH: 0,
  lastDpr: 0,

  requestResize: function () {
    this.dirty = true;
    return true;
  },

  getSize: function (targetCanvas, device) {
    var dpr = globalThis.devicePixelRatio || 1;
    var rect = targetCanvas.getBoundingClientRect();
    var physicalW = Math.round(rect.width * dpr);
    var physicalH = Math.round(rect.height * dpr);
    var maxDim = (device.limits && device.limits.maxTextureDimension2D) || 8192;

    return {
      width: Math.max(1, Math.min(physicalW, maxDim)),
      height: Math.max(1, Math.min(physicalH, maxDim)),
      dpr: dpr
    };
  },

  applyPendingResize: function () {
    var targetCanvas = PS.gpu && PS.gpu.canvas;
    var device = PS.gpu && PS.gpu.device;
    var context = PS.gpu && PS.gpu.context;
    var size;

    if (!this.dirty) {
      return false;
    }

    if (!targetCanvas || !device || !context || !PS.gpu || PS.gpu.status !== "ready") {
      return false;
    }

    size = this.getSize(targetCanvas, device);
    this.lastW = size.width;
    this.lastH = size.height;
    this.lastDpr = size.dpr;

    if (targetCanvas.width === size.width && targetCanvas.height === size.height) {
      this.dirty = false;
      return false;
    }

    targetCanvas.width = size.width;
    targetCanvas.height = size.height;

    context.configure({
      device: device,
      format: PS.gpu.format || "bgra8unorm",
      alphaMode: "opaque"
    });

    if (PS.render.webgpuGbuffer && typeof PS.render.webgpuGbuffer.rebuildTextures === "function") {
      PS.render.webgpuGbuffer.rebuildTextures(size.width, size.height, device);
    }

    if (PS.events && typeof PS.events.emit === "function" && PS.events.types) {
      PS.events.emit(PS.events.types.CANVAS_RESIZED, {
        width: size.width,
        height: size.height,
        dpr: size.dpr
      });
    }

    this.dirty = false;
    return true;
  },

  syncSize: function () {
    this.requestResize();
    return this.applyPendingResize();
  },

  onResize: function () {
    var self = PS.render.canvasResize;

    clearTimeout(self.debounceTimer);
    self.debounceTimer = setTimeout(function () {
      self.requestResize();
    }, self.debounceMs);
  },

  removeDprListener: function () {
    if (this.dprMediaQuery && this.dprListener && typeof this.dprMediaQuery.removeEventListener === "function") {
      this.dprMediaQuery.removeEventListener("change", this.dprListener);
    }

    this.dprMediaQuery = null;
    this.dprListener = null;
  },

  registerDprListener: function () {
    var self = this;

    this.removeDprListener();

    if (typeof globalThis.matchMedia !== "function") {
      return false;
    }

    this.dprMediaQuery = globalThis.matchMedia("(resolution: " + (globalThis.devicePixelRatio || 1) + "dppx)");
    this.dprListener = function () {
      self.registerDprListener();
      self.onResize();
    };

    if (this.dprMediaQuery && typeof this.dprMediaQuery.addEventListener === "function") {
      this.dprMediaQuery.addEventListener("change", this.dprListener);
      return true;
    }

    this.dprMediaQuery = null;
    this.dprListener = null;
    return false;
  },

  start: function () {
    var targetCanvas = PS.gpu && PS.gpu.canvas;

    this.stop();

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

    this.registerDprListener();

    return true;
  },

  stop: function () {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    window.removeEventListener("resize", this.onResize);
    this.removeDprListener();
    clearTimeout(this.debounceTimer);
    this.debounceTimer = 0;
    this.dirty = false;
  }
};
