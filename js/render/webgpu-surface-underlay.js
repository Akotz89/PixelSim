"use strict";
PS.render = PS.render || {};

PS.render.webgpuSurfaceUnderlay = PS.render.webgpuSurfaceUnderlay || {
  shaderName: "surface-underlay",
  shaderPath: "shaders/surface-underlay.wgsl",
  chunkShaderName: "surface-chunk",
  chunkShaderPath: "shaders/surface-chunk.wgsl",
  state: {
    pipeline: null,
    sampler: null,
    uniformBuffer: null,
    bindGroup: null,
    terrainTexture: null,
    drawCount: 0,
    lastFrameMs: 0,
    lastError: ""
  },

  registerManifest: function () {
    var manifest = PS.render.wgslShaderManifest = PS.render.wgslShaderManifest || [];
    var entries = [
      { name: this.shaderName, path: this.shaderPath },
      { name: this.chunkShaderName, path: this.chunkShaderPath }
    ];

    entries.forEach(function (entry) {
      var found = false;
      for (var i = 0; i < manifest.length; i += 1) {
        if (manifest[i] && manifest[i].name === entry.name) {
          found = true;
          break;
        }
      }
      if (!found) {
        manifest.push(entry);
      }
    });

    return manifest;
  },

  loadAssets: function (loader) {
    this.registerManifest();
    return PS.render.wgslShaders.loadManifest([
      { name: this.shaderName, path: this.shaderPath },
      { name: this.chunkShaderName, path: this.chunkShaderPath }
    ], loader);
  },

  getDevice: function (device) {
    return device || (PS.gpu && PS.gpu.device);
  },

  ensureSampler: function (device) {
    if (!this.state.sampler) {
      this.state.sampler = device.createSampler({
        label: "surface-underlay.sampler",
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "clamp-to-edge"
      });
    }
    return this.state.sampler;
  },

  ensureUniformBuffer: function (device) {
    if (!this.state.uniformBuffer) {
      this.state.uniformBuffer = device.createBuffer({
        label: "surface-underlay.uniforms",
        size: 32,
        usage: 64 | 8
      });
    }
    return this.state.uniformBuffer;
  },

  ensurePipeline: function (device) {
    var module;

    if (!this.state.pipeline) {
      module = PS.render.wgslShaders.getShaderModule(device, this.shaderName);
      this.state.pipeline = PS.render.wgslShaders.getRenderPipeline({
        label: "surface-underlay.pipeline",
        layout: "auto",
        vertex: {
          module: module,
          entryPoint: "vs_main"
        },
        fragment: {
          module: module,
          entryPoint: "fs_main",
          targets: [{ format: (PS.gpu && PS.gpu.format) || "bgra8unorm" }]
        },
        primitive: {
          topology: "triangle-strip"
        }
      }, device);
    }

    return this.state.pipeline;
  },

  makeUniformData: function (view, degreesPerPixel) {
    var data = new Float32Array(8);

    data[0] = Number(view && view.latitude) || 0;
    data[1] = Number(view && view.longitude) || 0;
    data[2] = Number(degreesPerPixel && degreesPerPixel.longitude) || 0;
    data[3] = Number(degreesPerPixel && degreesPerPixel.latitude) || 0;
    data[4] = Number((PS.gpu && PS.gpu.canvas && PS.gpu.canvas.width) || (typeof canvas !== "undefined" && canvas ? canvas.width : 1)) || 1;
    data[5] = Number((PS.gpu && PS.gpu.canvas && PS.gpu.canvas.height) || (typeof canvas !== "undefined" && canvas ? canvas.height : 1)) || 1;
    return data;
  },

  createBindGroup: function (device, pipeline, terrainTexture) {
    var terrainView = terrainTexture && typeof terrainTexture.createView === "function" ? terrainTexture.createView() : terrainTexture;

    return device.createBindGroup({
      label: "surface-underlay.bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: terrainView },
        { binding: 1, resource: this.ensureSampler(device) },
        { binding: 2, resource: { buffer: this.ensureUniformBuffer(device) } }
      ]
    });
  },

  draw: function (options) {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var spec = options || {};
    var device = this.getDevice(spec.device);
    var context = spec.context || (PS.gpu && PS.gpu.context);
    var textureView = spec.textureView || (context && typeof context.getCurrentTexture === "function" ? context.getCurrentTexture().createView() : null);
    var terrainTexture = spec.terrainTexture || this.state.terrainTexture;
    var view = spec.view || (PS.camera && typeof PS.camera.getView === "function" ? PS.camera.getView() : null);
    var degreesPerPixel = spec.degreesPerPixel || { longitude: 0, latitude: 0 };
    var pipeline;
    var encoder;
    var pass;
    var commandBuffer;

    if (!device || typeof device.createCommandEncoder !== "function") {
      throw new Error("WebGPU surface underlay draw requires GPUDevice");
    }

    if (!textureView) {
      throw new Error("WebGPU surface underlay draw requires a render target view");
    }

    if (!terrainTexture) {
      throw new Error("WebGPU surface underlay draw requires a terrain texture");
    }

    pipeline = this.ensurePipeline(device);
    device.queue.writeBuffer(this.ensureUniformBuffer(device), 0, this.makeUniformData(view, degreesPerPixel));
    this.state.bindGroup = this.createBindGroup(device, pipeline, terrainTexture);
    encoder = spec.commandEncoder || device.createCommandEncoder({ label: "surface-underlay.encoder" });
    pass = encoder.beginRenderPass({
      label: "surface-underlay.render-pass",
      colorAttachments: [{
        view: textureView,
        loadOp: "load",
        storeOp: "store"
      }]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.state.bindGroup);
    pass.draw(4, 1, 0, 0);
    pass.end();

    if (!spec.commandEncoder) {
      commandBuffer = encoder.finish();
      device.queue.submit([commandBuffer]);
    }

    this.state.drawCount += 1;
    this.state.lastFrameMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    this.state.lastError = "";
    return true;
  },

  getStats: function () {
    return {
      drawCount: this.state.drawCount,
      lastFrameMs: this.state.lastFrameMs,
      lastError: this.state.lastError
    };
  },

  rebuildShaders: function () {
    this.state.pipeline = null;
    this.state.bindGroup = null;
  }
};
