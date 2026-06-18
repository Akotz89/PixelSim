"use strict";
import { PS } from "../core/namespace.js";
import { canvas } from "../ui/dom-refs.js";

PS.render = PS.render || {};

PS.render.webgpuPipeline = PS.render.webgpuPipeline || {
  layers: [],
  bandOrder: {
    orbit: 0,
    planet: 1,
    continent: 2,
    region: 3,
    local: 4,
    settlement: 5
  },
  stats: {
    frameCount: 0,
    submittedLayers: 0,
    skippedLayers: 0,
    lastFrameMs: 0,
    lastBand: "orbit",
    lastError: ""
  },

  getBandRank: function (band) {
    var key = String(band || "orbit");
    return Object.prototype.hasOwnProperty.call(this.bandOrder, key) ? this.bandOrder[key] : 0;
  },

  registerLayer: function (id, layer) {
    var layerId = String(id || "").trim();
    var nextLayer = layer || {};

    if (!layerId) {
      throw new Error("WebGPU pipeline layer id is required");
    }

    nextLayer.id = layerId;
    nextLayer.band = String(nextLayer.band || "local");
    nextLayer.order = Math.max(0, Math.round(Number(nextLayer.order) || 0));

    for (var i = 0; i < this.layers.length; i++) {
      if (this.layers[i].id === layerId) {
        this.layers[i] = nextLayer;
        this.sortLayers();
        return nextLayer;
      }
    }

    this.layers.push(nextLayer);
    this.sortLayers();
    return nextLayer;
  },

  sortLayers: function () {
    var self = this;

    this.layers.sort(function (a, b) {
      return self.getBandRank(a.band) - self.getBandRank(b.band) || (Number(a.order) || 0) - (Number(b.order) || 0);
    });
  },

  getFrameBand: function (camera) {
    var source = camera || {};

    if (source.band) {
      return String(source.band);
    }

    if (PS.render.pipeline && typeof PS.render.pipeline.getZoomBand === "function") {
      return PS.render.pipeline.getZoomBand(source.zoomLevel);
    }

    return "orbit";
  },

  getCanvasSize: function (spec) {
    var canvas = spec.canvas || (PS.gpu && PS.gpu.canvas) || {};

    return {
      width: Math.max(1, Math.round(Number(spec.width || canvas.width) || 1)),
      height: Math.max(1, Math.round(Number(spec.height || canvas.height) || 1))
    };
  },

  renderFrame: function (spec) {
    var options = spec || {};
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var device = options.device || (PS.gpu && PS.gpu.device);
    var queue = options.queue || (device && device.queue) || (PS.gpu && PS.gpu.queue);
    var context = options.context || (PS.gpu && PS.gpu.context);
    var camera = options.camera || {};
    var band = this.getFrameBand(camera);
    var size = this.getCanvasSize(options);
    var attachments;
    var encoder;
    var pass;
    var submitted = 0;
    var skipped = 0;

    this.stats.lastError = "";

    if (!device || typeof device.createCommandEncoder !== "function" || !queue || typeof queue.submit !== "function") {
      this.stats.lastError = "WebGPU pipeline requires a device and queue";
      return false;
    }

    if (!PS.render.webgpuGbuffer || typeof PS.render.webgpuGbuffer.beginTerrainPass !== "function") {
      this.stats.lastError = "WebGPU pipeline requires G-buffer support";
      return false;
    }

    encoder = device.createCommandEncoder({ label: "webgpu-pipeline.frame.encoder" });
    pass = PS.render.webgpuGbuffer.beginTerrainPass(encoder, size.width, size.height, device, {
      label: "webgpu-pipeline.gbuffer-pass"
    });

    for (var i = 0; i < this.layers.length; i++) {
      var layer = this.layers[i];

      if (layer.band !== band || typeof layer.render !== "function") {
        skipped++;
        continue;
      }

      layer.render(pass, camera, {
        band: band,
        width: size.width,
        height: size.height,
        device: device,
        commandEncoder: encoder
      });
      submitted++;
    }

    pass.end();

    if (PS.render.webgpuGbuffer && typeof PS.render.webgpuGbuffer.ensure === "function") {
      attachments = PS.render.webgpuGbuffer.ensure(size.width, size.height, device);
    }

    if (attachments && PS.render.webgpuCompositor && typeof PS.render.webgpuCompositor.draw === "function") {
      PS.render.webgpuCompositor.draw({
        device: device,
        context: context,
        commandEncoder: encoder,
        albedoTexture: attachments.albedo.texture || attachments.albedo,
        normalHeightTexture: attachments.normalHeight.texture || attachments.normalHeight,
        loadOp: "clear"
      });
    }

    queue.submit([encoder.finish()]);
    this.stats.frameCount++;
    this.stats.submittedLayers = submitted;
    this.stats.skippedLayers = skipped;
    this.stats.lastBand = band;
    this.stats.lastFrameMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    return true;
  },

  getStats: function () {
    return Object.assign({}, this.stats);
  }
};
