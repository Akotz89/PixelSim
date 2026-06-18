import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { canvas } from "../ui/dom-refs.js";

PS.render = PS.render || {};

export var webgpuTileLightsState = PS.render.webgpuTileLights && PS.render.webgpuTileLights.state
  ? PS.render.webgpuTileLights.state
  : null;

PS.render.webgpuTileLights = Object.assign(PS.render.webgpuTileLights || {}, {
  shaderName: "tile-light",
  shaderPath: "shaders/tile-light.wgsl",
  maxGridCells: 16384,
  state: Object.assign({
    pipeline: null,
    sampler: null,
    uniformBuffer: null,
    lightGridBuffer: null,
    lightGridCapacity: 0,
    drawCount: 0,
    submittedTiles: 0,
    gridCells: 0,
    gridWidth: 0,
    gridHeight: 0,
    lastFrameMs: 0,
    lastError: ""
  }, webgpuTileLightsState || {}),

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

  ensureSampler: function (device) {
    if (!this.state.sampler) {
      this.state.sampler = device.createSampler({
        label: "tile-light.sampler",
        magFilter: "nearest",
        minFilter: "nearest",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge"
      });
    }

    return this.state.sampler;
  },

  ensureUniformBuffer: function (device) {
    if (!this.state.uniformBuffer) {
      this.state.uniformBuffer = device.createBuffer({
        label: "tile-light.uniforms",
        size: 32,
        usage: 64 | 8
      });
    }

    return this.state.uniformBuffer;
  },

  ensureLightGridBuffer: function (device, cellCount) {
    var count = Math.max(4, Math.min(this.maxGridCells, Math.ceil(Number(cellCount) || 4)));

    if (!this.state.lightGridBuffer || this.state.lightGridCapacity < count) {
      this.state.lightGridCapacity = Math.max(count, 256);
      this.state.lightGridBuffer = device.createBuffer({
        label: "tile-light.grid.storage",
        size: this.state.lightGridCapacity * Float32Array.BYTES_PER_ELEMENT,
        usage: 128 | 8
      });
    }

    return this.state.lightGridBuffer;
  },

  ensurePipeline: function (device) {
    return PS.render.ensureAlphaBlendPipeline(this, device, {
      label: "tile-light.pipeline"
    });
  },

  normalizeTileLight: function (light) {
    return {
      x: Number(light && light.x) || 0,
      y: Number(light && light.y) || 0,
      width: Math.max(1, Number(light && light.width) || 1),
      height: Math.max(1, Number(light && light.height) || 1),
      intensity: Math.max(0, Math.min(1, Number(light && light.intensity) || 1)),
      kind: light && light.kind ? String(light.kind) : ""
    };
  },

  buildLightGrid: function (lights, width, height, tileSize) {
    var size = Math.max(1, Number(tileSize) || 16);
    var gridWidth = Math.max(2, Math.ceil(Math.max(1, Number(width) || 1) / size) + 1);
    var gridHeight = Math.max(2, Math.ceil(Math.max(1, Number(height) || 1) / size) + 1);
    var cellCount = Math.min(this.maxGridCells, gridWidth * gridHeight);
    var data = new Float32Array(cellCount);
    var submitted = 0;

    data.fill(1);

    for (var i = 0; i < (Array.isArray(lights) ? lights.length : 0); i += 1) {
      var light = this.normalizeTileLight(lights[i]);
      var x0 = Math.max(0, Math.min(gridWidth - 1, Math.floor(light.x / size)));
      var y0 = Math.max(0, Math.min(gridHeight - 1, Math.floor(light.y / size)));
      var x1 = Math.max(0, Math.min(gridWidth - 1, Math.ceil((light.x + light.width) / size)));
      var y1 = Math.max(0, Math.min(gridHeight - 1, Math.ceil((light.y + light.height) / size)));

      if (light.intensity >= 0.999) {
        continue;
      }

      for (var y = y0; y <= y1; y += 1) {
        for (var x = x0; x <= x1; x += 1) {
          var index = y * gridWidth + x;
          if (index < data.length) {
            data[index] = Math.min(data[index], light.intensity);
          }
        }
      }
      submitted += 1;
    }

    return {
      data: data,
      width: gridWidth,
      height: gridHeight,
      cellCount: cellCount,
      submitted: submitted,
      tileSize: size
    };
  },

  writeUniforms: function (device, width, height, grid, options) {
    var spec = options || {};
    var strength = spec.tileLightStrength !== undefined ? Number(spec.tileLightStrength) : 1;
    var ambientFloor = spec.tileLightAmbientFloor !== undefined ? Number(spec.tileLightAmbientFloor) : 0.24;

    device.queue.writeBuffer(
      this.ensureUniformBuffer(device),
      0,
      new Float32Array([
        Math.max(1, Number(width) || 1),
        Math.max(1, Number(height) || 1),
        grid.width,
        grid.height,
        grid.tileSize,
        Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 1)),
        Math.max(0, Math.min(1, Number.isFinite(ambientFloor) ? ambientFloor : 0.24)),
        0
      ])
    );
  },

  writeLightGrid: function (device, grid) {
    var buffer = this.ensureLightGridBuffer(device, grid.cellCount);

    device.queue.writeBuffer(buffer, 0, grid.data, 0, grid.cellCount);
    return buffer;
  },

  createBindGroup: function (device, pipeline, albedoTexture, normalHeightTexture, lightGridBuffer) {
    return device.createBindGroup({
      label: "tile-light.bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: albedoTexture.createView() },
        { binding: 1, resource: normalHeightTexture.createView() },
        { binding: 2, resource: this.ensureSampler(device) },
        { binding: 3, resource: { buffer: this.ensureUniformBuffer(device) } },
        { binding: 4, resource: { buffer: lightGridBuffer } }
      ]
    });
  },

  draw: function (options) {
    var spec = options || {};
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var device = this.getDevice(spec.device);
    var context = spec.context || (PS.gpu && PS.gpu.context);
    var targetCanvas = PS.gpu && PS.gpu.canvas ? PS.gpu.canvas : (typeof canvas !== "undefined" ? canvas : null);
    var width = spec.width || (targetCanvas ? targetCanvas.width : 1);
    var height = spec.height || (targetCanvas ? targetCanvas.height : 1);
    var tileSize = spec.tileSize || (typeof CONFIG !== "undefined" && CONFIG.TILE_SIZE) || 16;
    var grid = this.buildLightGrid(spec.tileLights || [], width, height, tileSize);
    var gbuffer;
    var pipeline;
    var encoder;
    var outputView;
    var pass;
    var lightGridBuffer;

    this.state.submittedTiles = grid.submitted;
    this.state.gridCells = grid.cellCount;
    this.state.gridWidth = grid.width;
    this.state.gridHeight = grid.height;

    if (grid.submitted <= 0) {
      this.state.lastError = "";
      return false;
    }

    if (!device || typeof device.createCommandEncoder !== "function") {
      throw new Error("WebGPU tile light draw requires GPUDevice");
    }

    gbuffer = PS.render.webgpuGbuffer && typeof PS.render.webgpuGbuffer.ensure === "function"
      ? PS.render.webgpuGbuffer.ensure(width, height, device)
      : null;

    if (!gbuffer || !gbuffer.albedo || !gbuffer.normalHeight) {
      throw new Error("WebGPU tile light draw requires G-buffer attachments");
    }

    if (!spec.textureView && (!context || typeof context.getCurrentTexture !== "function")) {
      throw new Error("WebGPU tile light draw requires an output texture view or context");
    }

    pipeline = this.ensurePipeline(device);
    this.writeUniforms(device, width, height, grid, spec);
    lightGridBuffer = this.writeLightGrid(device, grid);
    encoder = spec.commandEncoder || device.createCommandEncoder({ label: "tile-light.encoder" });
    outputView = spec.textureView || context.getCurrentTexture().createView();
    pass = encoder.beginRenderPass({
      label: "tile-light.render-pass",
      colorAttachments: [{
        view: outputView,
        loadOp: spec.loadOp || "load",
        storeOp: "store"
      }]
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.createBindGroup(device, pipeline, gbuffer.albedo.texture, gbuffer.normalHeight.texture, lightGridBuffer));
    pass.draw(4, 1, 0, 0);
    pass.end();

    if (!spec.commandEncoder) {
      device.queue.submit([encoder.finish()]);
    }

    this.state.drawCount += 1;
    this.state.lastFrameMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    this.state.lastError = "";
    return true;
  },

  getStats: function () {
    return {
      drawCount: this.state.drawCount,
      submittedTiles: this.state.submittedTiles,
      gridCells: this.state.gridCells,
      gridWidth: this.state.gridWidth,
      gridHeight: this.state.gridHeight,
      lastFrameMs: this.state.lastFrameMs,
      lastError: this.state.lastError
    };
  },

  rebuildShaders: function () {
    this.state.pipeline = null;
  }
});
