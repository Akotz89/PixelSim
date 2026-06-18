"use strict";
import { PS } from "../core/namespace.js";
import { world } from "../systems/state.js";
import { canvas } from "../ui/dom-refs.js";

PS.render = PS.render || {};

export var webgpuWaterDisplacementState = PS.render.webgpuWaterDisplacement && PS.render.webgpuWaterDisplacement.state
  ? PS.render.webgpuWaterDisplacement.state
  : null;

PS.render.webgpuWaterDisplacement = Object.assign(PS.render.webgpuWaterDisplacement || {}, {
  shaderName: "water-displace",
  shaderPath: "shaders/water-displace.wgsl",
  strideFloats: 12,
  passCount: 2,
  state: Object.assign({
    pipeline: null,
    uniformBuffer: null,
    instanceBuffer: null,
    instanceCapacity: 0,
    drawCount: 0,
    passDrawCount: 0,
    lastFrameMs: 0,
    lastError: ""
  }, webgpuWaterDisplacementState || {}),

  registerManifest: function () {
    var manifest = PS.render.wgslShaderManifest = PS.render.wgslShaderManifest || [];
    var found = false;

    for (var i = 0; i < manifest.length; i += 1) {
      if (manifest[i] && manifest[i].name === this.shaderName) {
        found = true;
        break;
      }
    }

    if (!found) {
      manifest.push({ name: this.shaderName, path: this.shaderPath });
    }

    return manifest;
  },

  getDevice: function (device) {
    return device || (PS.gpu && PS.gpu.device);
  },

  getFormat: function () {
    return (PS.gpu && PS.gpu.format) || "bgra8unorm";
  },

  ensureUniformBuffer: function (device) {
    if (!this.state.uniformBuffer) {
      this.state.uniformBuffer = device.createBuffer({
        label: "water-displace.uniforms",
        size: 32,
        usage: 64 | 8
      });
    }

    return this.state.uniformBuffer;
  },

  ensureInstanceBuffer: function (device, count) {
    var instanceCount = Math.max(1, Math.ceil(Number(count) || 1));

    if (!this.state.instanceBuffer || this.state.instanceCapacity < instanceCount) {
      this.state.instanceCapacity = Math.max(instanceCount, this.passCount);
      this.state.instanceBuffer = device.createBuffer({
        label: "water-displace.instances.storage",
        size: this.state.instanceCapacity * this.strideFloats * Float32Array.BYTES_PER_ELEMENT,
        usage: 128 | 8
      });
    }

    return this.state.instanceBuffer;
  },

  ensurePipeline: function (device) {
    return PS.render.ensureAlphaBlendPipeline(this, device, {
      label: "water-displace.pipeline"
    });
  },

  getNowSeconds: function () {
    if (typeof world !== "undefined" && world && Number.isFinite(Number(world.timeMs))) {
      return Number(world.timeMs) / 1000;
    }

    return (Date.now ? Date.now() : 0) / 1000;
  },

  getWind: function () {
    var wx = 0.55;
    var wy = 0.22;
    var speed = 1;

    if (typeof world !== "undefined" && world) {
      if (world.wind) {
        wx = Number(world.wind.x !== undefined ? world.wind.x : world.wind.dx);
        wy = Number(world.wind.y !== undefined ? world.wind.y : world.wind.dy);
        speed = Number(world.wind.speed !== undefined ? world.wind.speed : speed);
      } else if (world.weather && world.weather.wind) {
        wx = Number(world.weather.wind.x !== undefined ? world.weather.wind.x : world.weather.wind.dx);
        wy = Number(world.weather.wind.y !== undefined ? world.weather.wind.y : world.weather.wind.dy);
        speed = Number(world.weather.wind.speed !== undefined ? world.weather.wind.speed : speed);
      }
    }

    if (!Number.isFinite(wx)) { wx = 0.55; }
    if (!Number.isFinite(wy)) { wy = 0.22; }
    if (!Number.isFinite(speed)) { speed = 1; }

    return {
      x: wx,
      y: wy,
      speed: Math.max(0, speed)
    };
  },

  getVisualPolicy: function (lodState) {
    if (!(PS.render.lod && typeof PS.render.lod.resolveVisualPolicy === "function") && lodState && lodState.visualPolicy) {
      return lodState.visualPolicy;
    }

    return PS.render.lod && typeof PS.render.lod.resolveVisualPolicy === "function"
      ? PS.render.lod.resolveVisualPolicy(lodState, { level: "SURFACE", waterUvScrollScale: 1 })
      : { level: "SURFACE", waterUvScrollScale: 1 };
  },

  writeUniforms: function (device, width, height, timeSeconds, wind, speedScale) {
    device.queue.writeBuffer(
      this.ensureUniformBuffer(device),
      0,
      new Float32Array([
        Math.max(1, Number(width) || 1),
        Math.max(1, Number(height) || 1),
        Number(timeSeconds) || 0,
        0,
        Number(wind.x) || 0,
        Number(wind.y) || 0,
        Math.max(0, Number(wind.speed) || 0) * Math.max(0, Number(speedScale === undefined ? 1 : speedScale) || 0),
        0
      ])
    );
  },

  createInstances: function (lodState) {
    var policy = this.getVisualPolicy(lodState);
    var scale = Math.max(0, Number(policy.waterUvScrollScale) || 0);
    var data = [
      1.1, -1.1, 1.5, 1.5,
      1, 0.018 * scale, 0.55, 0.72 * scale,
      0.10, 0.20, 0.28, 0.0,
      -0.72, 0.88, -2.1, 1.6,
      0.25, 0.008 * scale, 0.82, 1.15 * scale,
      0.18, 0.34, 0.42, 1.0
    ];

    if (scale <= 0) {
      return new Float32Array([]);
    }

    if (scale < 0.5) {
      return new Float32Array(data.slice(0, this.strideFloats));
    }

    return new Float32Array(data);
  },

  createBindGroup: function (device, pipeline, instanceBuffer) {
    return device.createBindGroup({
      label: "water-displace.bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.ensureUniformBuffer(device) } },
        { binding: 1, resource: { buffer: instanceBuffer } }
      ]
    });
  },

  draw: function (options) {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var spec = options || {};
    var device = this.getDevice(spec.device);
    var context = spec.context || (PS.gpu && PS.gpu.context);
    var targetCanvas = PS.gpu && PS.gpu.canvas ? PS.gpu.canvas : (typeof canvas !== "undefined" ? canvas : null);
    var width = spec.width || (targetCanvas ? targetCanvas.width : 1);
    var height = spec.height || (targetCanvas ? targetCanvas.height : 1);
    var policy = this.getVisualPolicy(spec.lodState);
    var data = this.createInstances(spec.lodState);
    var instanceCount = Math.floor(data.length / this.strideFloats);
    var wind = spec.wind || this.getWind();
    var pipeline;
    var instanceBuffer;
    var encoder;
    var pass;

    if (!device || typeof device.createCommandEncoder !== "function") {
      throw new Error("WebGPU water displacement draw requires GPUDevice");
    }

    if (!context || typeof context.getCurrentTexture !== "function") {
      throw new Error("WebGPU water displacement draw requires a configured WebGPU context");
    }

    if (instanceCount <= 0 || Math.max(0, Number(policy.waterUvScrollScale) || 0) <= 0) {
      this.state.passDrawCount = 0;
      this.state.lastFrameMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
      this.state.lastError = "";
      return false;
    }

    pipeline = this.ensurePipeline(device);
    this.writeUniforms(device, width, height, spec.timeSeconds === undefined ? this.getNowSeconds() : spec.timeSeconds, wind, policy.waterUvScrollScale);
    instanceBuffer = this.ensureInstanceBuffer(device, instanceCount);
    device.queue.writeBuffer(instanceBuffer, 0, data, 0, instanceCount * this.strideFloats);

    encoder = spec.commandEncoder || device.createCommandEncoder({ label: "water-displace.encoder" });
    pass = encoder.beginRenderPass({
      label: "water-displace.render-pass",
      colorAttachments: [{
        view: spec.textureView || context.getCurrentTexture().createView(),
        loadOp: spec.loadOp || "load",
        storeOp: "store"
      }]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.createBindGroup(device, pipeline, instanceBuffer));
    pass.draw(4, instanceCount, 0, 0);
    pass.end();

    if (!spec.commandEncoder) {
      device.queue.submit([encoder.finish()]);
    }

    this.state.drawCount += 1;
    this.state.passDrawCount = instanceCount;
    this.state.lastFrameMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    this.state.lastError = "";
    return true;
  },

  getStats: function () {
    return {
      drawCount: this.state.drawCount,
      passDrawCount: this.state.passDrawCount,
      lastFrameMs: this.state.lastFrameMs,
      lastError: this.state.lastError
    };
  },

  rebuildShaders: function () {
    this.state.pipeline = null;
  }
});
