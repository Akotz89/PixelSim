"use strict";
PS.render = PS.render || {};

PS.render.webgpuGlobe = PS.render.webgpuGlobe || {
  shaderName: "globe-sphere",
  shaderPath: "shaders/globe-sphere.wgsl",
  state: {
    pipeline: null,
    sampler: null,
    uniformBuffer: null,
    bindGroup: null,
    terrainTexture: null,
    overlayTexture: null,
    textureSignature: null,
    overlaySignature: null,
    drawCount: 0,
    textureUploadCount: 0,
    overlayUploadCount: 0,
    lastTextureUploadMs: 0,
    lastOverlayUploadMs: 0,
    lastUsedObservationOverlay: "none",
    lastFrameMs: 0,
    lastError: ""
  },

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

  loadAssets: function (loader) {
    this.registerManifest();
    return PS.render.wgslShaders.loadFromFile(this.shaderName, this.shaderPath, loader);
  },

  getDevice: function (device) {
    return device || (PS.gpu && PS.gpu.device);
  },

  getFormat: function () {
    return (PS.gpu && PS.gpu.format) || "bgra8unorm";
  },

  getTextureSignature: function () {
    return [
      typeof world !== "undefined" && world && world.seedText ? world.seedText : "",
      typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 0,
      typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 0,
      typeof world !== "undefined" && world && world.planetTiles ? world.planetTiles.length : 0,
      typeof world !== "undefined" && world && world.terrain ? world.terrain.length : 0
    ].join(":");
  },

  getObservationOverlaySignature: function () {
    var activeId = typeof world !== "undefined" && world && world.activeObservationOverlay
      ? world.activeObservationOverlay
      : "none";

    return [
      activeId,
      typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 0,
      typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 0,
      typeof world !== "undefined" && world && world.tick ? world.tick : 0,
      typeof world !== "undefined" && world && world.organisms ? world.organisms.length : 0,
      typeof world !== "undefined" && world && world.food ? world.food.length : 0,
      typeof world !== "undefined" && world && world.atmosphere ? JSON.stringify(world.atmosphere.gases || {}) : "",
      typeof world !== "undefined" && world && world.microbial ? String(world.microbial.ageTicks || 0) + ":" + String(world.microbial.totalDensity || 0) : ""
    ].join(":");
  },

  createRgbaTexture: function (device, label, width, height, data) {
    var texture = device.createTexture({
      label: label,
      size: { width: width, height: height },
      format: "rgba8unorm",
      usage: 4 | 2
    });

    if (device.queue && typeof device.queue.writeTexture === "function") {
      device.queue.writeTexture(
        { texture: texture },
        data,
        { bytesPerRow: width * 4, rowsPerImage: height },
        { width: width, height: height }
      );
    }

    return texture;
  },

  uploadTerrainTexture: function (device) {
    var state = this.state;
    var targetDevice = this.getDevice(device);
    var signature = this.getTextureSignature();
    var width = typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 0;
    var height = typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 0;
    var startedAt;
    var data;
    var x;
    var y;
    var index;
    var rgb;

    if (state.terrainTexture && state.textureSignature === signature) {
      return state.terrainTexture;
    }

    if (!targetDevice || !width || !height) {
      throw new Error("WebGPU globe terrain upload requires world dimensions");
    }

    startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    data = new Uint8Array(width * height * 4);

    for (y = 0; y < height; y += 1) {
      for (x = 0; x < width; x += 1) {
        index = (y * width + x) * 4;
        rgb = PS.render.terrain.getRgbFromHex(
          getPlanetTileCompositedColor(getPlanetTile(x, y))
        );

        data[index] = rgb.red;
        data[index + 1] = rgb.green;
        data[index + 2] = rgb.blue;
        data[index + 3] = 255;
      }
    }

    if (state.terrainTexture && typeof state.terrainTexture.destroy === "function") {
      state.terrainTexture.destroy();
    }

    state.terrainTexture = this.createRgbaTexture(targetDevice, "globe-sphere.terrain", width, height, data);
    state.textureSignature = signature;
    state.textureUploadCount += 1;
    state.lastTextureUploadMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    return state.terrainTexture;
  },

  uploadObservationOverlayTexture: function (device) {
    var state = this.state;
    var targetDevice = this.getDevice(device);
    var activeId = PS.render.observationOverlays ? PS.render.observationOverlays.getActiveId() : "none";
    var overlay = PS.render.overlays && typeof PS.render.overlays.get === "function"
      ? PS.render.overlays.get(activeId)
      : null;
    var signature = this.getObservationOverlaySignature();
    var width = typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 0;
    var height = typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 0;
    var startedAt;
    var data;
    var sample;
    var x;
    var y;
    var index;

    if (state.overlayTexture && state.overlaySignature === signature) {
      return state.overlayTexture;
    }

    if (!targetDevice || !width || !height) {
      throw new Error("WebGPU globe overlay upload requires world dimensions");
    }

    startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    data = new Uint8Array(width * height * 4);

    if (overlay && activeId !== "none" && PS.render.observationOverlays) {
      for (y = 0; y < height; y += 1) {
        for (x = 0; x < width; x += 1) {
          index = (y * width + x) * 4;
          sample = PS.render.observationOverlays.getOverlaySample(activeId, x, y, getPlanetTile(x, y));
          data[index] = sample.red;
          data[index + 1] = sample.green;
          data[index + 2] = sample.blue;
          data[index + 3] = sample.alpha;
        }
      }
    }

    if (state.overlayTexture && typeof state.overlayTexture.destroy === "function") {
      state.overlayTexture.destroy();
    }

    state.overlayTexture = this.createRgbaTexture(targetDevice, "globe-sphere.overlay", width, height, data);
    state.overlaySignature = signature;
    state.overlayUploadCount += 1;
    state.lastOverlayUploadMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    state.lastUsedObservationOverlay = activeId;
    return state.overlayTexture;
  },

  ensureSampler: function (device) {
    if (!this.state.sampler) {
      this.state.sampler = device.createSampler({
        label: "globe-sphere.sampler",
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
        label: "globe-sphere.uniforms",
        size: 64,
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
        label: "globe-sphere.pipeline",
        layout: "auto",
        vertex: {
          module: module,
          entryPoint: "vs_main"
        },
        fragment: {
          module: module,
          entryPoint: "fs_main",
          targets: [{
            format: this.getFormat(),
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add"
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add"
              }
            }
          }]
        },
        primitive: {
          topology: "triangle-strip"
        }
      }, device);
    }

    return this.state.pipeline;
  },

  getOverlayMode: function (overlay) {
    var blendMode = overlay ? String(overlay.blendMode || "") : "";

    if (blendMode === "screen") {
      return 1;
    }

    if (blendMode === "lighter" || blendMode === "plus-lighter") {
      return 2;
    }

    return 0;
  },

  getSunDirection: function (projection, options) {
    var spec = options || {};
    var currentWorld = typeof world !== "undefined" ? world : null;
    var value = spec.sunDirection || (currentWorld && currentWorld.sunDirection ? currentWorld.sunDirection : null);
    var tick = currentWorld && Number.isFinite(Number(currentWorld.tick)) ? Number(currentWorld.tick) : 0;
    var angle = tick * 0.00024;
    var latitudeBias = projection && Number.isFinite(Number(projection.viewLatitudeDeg))
      ? Math.sin(Number(projection.viewLatitudeDeg) * Math.PI / 180) * 0.18
      : 0.12;
    var x;
    var y;
    var z;
    var length;

    if (value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) && Number.isFinite(Number(value.z))) {
      x = Number(value.x);
      y = Number(value.y);
      z = Number(value.z);
    } else if (Array.isArray(value) && value.length >= 3) {
      x = Number(value[0]);
      y = Number(value[1]);
      z = Number(value[2]);
    } else {
      x = Math.cos(angle) * 0.72;
      y = latitudeBias;
      z = Math.sin(angle) * 0.46 + 0.58;
    }

    length = Math.sqrt(x * x + y * y + z * z) || 1;
    return {
      x: x / length,
      y: y / length,
      z: z / length
    };
  },

  makeUniformData: function (projection, overlay, options) {
    var data = new Float32Array(16);
    var viewLatDeg = Number(projection && projection.viewLatitudeDeg) || 0;
    var viewLonDeg = Number(projection && projection.viewLongitudeDeg) || 0;
    var sun = this.getSunDirection(projection, options);

    data[0] = Number((PS.gpu && PS.gpu.canvas && PS.gpu.canvas.width) || (typeof canvas !== "undefined" && canvas ? canvas.width : 1)) || 1;
    data[1] = Number((PS.gpu && PS.gpu.canvas && PS.gpu.canvas.height) || (typeof canvas !== "undefined" && canvas ? canvas.height : 1)) || 1;
    data[4] = Number(projection && projection.centerX) || data[0] * 0.5;
    data[5] = Number(projection && projection.centerY) || data[1] * 0.5;
    data[6] = Number(projection && projection.radius) || Math.min(data[0], data[1]) * 0.45;
    data[8] = viewLatDeg * Math.PI / 180;
    data[9] = viewLonDeg * Math.PI / 180;
    data[10] = this.getOverlayMode(overlay);
    data[11] = overlay ? Math.max(0, Math.min(1, Number(overlay.alpha) || 1)) : 0;
    data[12] = sun.x;
    data[13] = sun.y;
    data[14] = sun.z;
    data[15] = Math.max(0, Math.min(1, options && options.alpha !== undefined ? Number(options.alpha) || 0 : 1));
    return data;
  },

  createBindGroup: function (device, pipeline, terrainTexture, overlayTexture) {
    var terrainView = terrainTexture && typeof terrainTexture.createView === "function" ? terrainTexture.createView() : terrainTexture;
    var overlayView = overlayTexture && typeof overlayTexture.createView === "function" ? overlayTexture.createView() : overlayTexture;

    return device.createBindGroup({
      label: "globe-sphere.bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: terrainView },
        { binding: 1, resource: overlayView },
        { binding: 2, resource: this.ensureSampler(device) },
        { binding: 3, resource: { buffer: this.ensureUniformBuffer(device) } }
      ]
    });
  },

  drawGlobe: function (projection, options) {
    return this.draw(projection, options);
  },

  draw: function (projection, options) {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var spec = options || {};
    var device = this.getDevice(spec.device);
    var context = spec.context || (PS.gpu && PS.gpu.context);
    var textureView = spec.textureView || (context && typeof context.getCurrentTexture === "function" ? context.getCurrentTexture().createView() : null);
    var terrainTexture = spec.terrainTexture || this.uploadTerrainTexture(device);
    var overlayTexture = spec.overlayTexture || this.uploadObservationOverlayTexture(device) || terrainTexture;
    var overlay = spec.overlay || null;
    var pipeline;
    var encoder;
    var pass;
    var commandBuffer;

    if (!projection) {
      throw new Error("WebGPU globe draw requires a projection");
    }

    if (!device || typeof device.createCommandEncoder !== "function") {
      throw new Error("WebGPU globe draw requires GPUDevice");
    }

    if (!textureView) {
      throw new Error("WebGPU globe draw requires a render target view");
    }

    if (!terrainTexture || !overlayTexture) {
      throw new Error("WebGPU globe draw requires terrain and overlay textures");
    }

    pipeline = this.ensurePipeline(device);
    device.queue.writeBuffer(this.ensureUniformBuffer(device), 0, this.makeUniformData(projection, overlay, spec));
    this.state.bindGroup = this.createBindGroup(device, pipeline, terrainTexture, overlayTexture);
    encoder = spec.commandEncoder || device.createCommandEncoder({ label: "globe-sphere.encoder" });
    pass = encoder.beginRenderPass({
      label: "globe-sphere.render-pass",
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 1 / 255, g: 3 / 255, b: 10 / 255, a: 1 },
          loadOp: spec.loadOp || "clear",
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
      textureUploadCount: this.state.textureUploadCount,
      overlayUploadCount: this.state.overlayUploadCount,
      lastTextureUploadMs: this.state.lastTextureUploadMs,
      lastOverlayUploadMs: this.state.lastOverlayUploadMs,
      lastUsedObservationOverlay: this.state.lastUsedObservationOverlay,
      lastFrameMs: this.state.lastFrameMs,
      lastError: this.state.lastError
    };
  },

  rebuildShaders: function () {
    this.state.pipeline = null;
    this.state.bindGroup = null;
  }
};
