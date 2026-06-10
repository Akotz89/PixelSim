"use strict";
PS.render = PS.render || {};

var webgpuSurfaceTileState = PS.render.webgpuSurfaceTile && PS.render.webgpuSurfaceTile.state
  ? PS.render.webgpuSurfaceTile.state
  : null;

PS.render.webgpuSurfaceTile = Object.assign(PS.render.webgpuSurfaceTile || {}, {
  shaderName: "terrain-tile",
  shaderPath: "shaders/terrain-tile.wgsl",
  terrainShaderName: "terrain",
  terrainShaderPath: "shaders/terrain.wgsl",
  gbufferShaderName: "gbuffer-terrain",
  gbufferShaderPath: "shaders/gbuffer-terrain.wgsl",
  strideFloats: 10,
  maxInstances: 8192,
  state: Object.assign({
    pipeline: null,
    gbufferPipeline: null,
    sampler: null,
    uniformBuffer: null,
    quadBuffer: null,
    instanceBuffer: null,
    instanceCapacity: 0,
    textures: {},
    textureUploadCount: 0,
    drawCount: 0,
    tileDrawCount: 0,
    pageDrawCount: 0,
    culledCount: 0,
    materialCounts: {},
    equivalenceTerrainDrawCount: 0,
    equivalenceTransitionDrawCount: 0,
    equivalenceSelectedUses: {},
    equivalenceSelectedSheets: {},
    lastFrameMs: 0,
    lastError: ""
  }, webgpuSurfaceTileState || {}),

  registerManifest: function () {
    var manifest = PS.render.wgslShaderManifest = PS.render.wgslShaderManifest || [];
    var entries = [
      { name: this.terrainShaderName, path: this.terrainShaderPath },
      { name: this.shaderName, path: this.shaderPath },
      { name: this.gbufferShaderName, path: this.gbufferShaderPath }
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
      { name: this.terrainShaderName, path: this.terrainShaderPath },
      { name: this.shaderName, path: this.shaderPath },
      { name: this.gbufferShaderName, path: this.gbufferShaderPath }
    ], loader);
  },

  getDevice: function (device) {
    return device || (PS.gpu && PS.gpu.device);
  },

  getFormat: function () {
    return (PS.gpu && PS.gpu.format) || "bgra8unorm";
  },

  resetFrameStats: function () {
    var state = this.state;
    state.tileDrawCount = 0;
    state.pageDrawCount = 0;
    state.culledCount = 0;
    state.materialCounts = {};
    state.equivalenceTerrainDrawCount = 0;
    state.equivalenceTransitionDrawCount = 0;
    state.equivalenceSelectedUses = {};
    state.equivalenceSelectedSheets = {};
  },

  ensureAtlas: function () {
    if (PS.atlas && !PS.atlas.initialized && typeof PS.atlas.init === "function") {
      PS.atlas.init();
    }

    return Boolean(PS.atlas && PS.atlas.pages && PS.atlas.pages.length > 0);
  },

  ensureSampler: function (device) {
    if (!this.state.sampler) {
      this.state.sampler = device.createSampler({
        label: "terrain-tile.sampler",
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
        label: "terrain-tile.uniforms",
        size: 16,
        usage: 64 | 8
      });
    }
    return this.state.uniformBuffer;
  },

  ensureQuadBuffer: function (device) {
    if (!this.state.quadBuffer) {
      this.state.quadBuffer = device.createBuffer({
        label: "terrain-tile.quad",
        size: 8 * Float32Array.BYTES_PER_ELEMENT,
        usage: 32 | 8
      });
      device.queue.writeBuffer(this.state.quadBuffer, 0, new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        1, 1
      ]));
    }
    return this.state.quadBuffer;
  },

  ensureInstanceBuffer: function (device, instanceCount) {
    var needed = Math.max(1, Math.ceil(Number(instanceCount) || 1));
    var capacity = this.state.instanceCapacity || 0;
    var strideBytes = this.strideFloats * Float32Array.BYTES_PER_ELEMENT;

    if (!this.state.instanceBuffer || capacity < needed) {
      capacity = Math.max(needed, this.maxInstances);
      this.state.instanceBuffer = device.createBuffer({
        label: "terrain-tile.instances",
        size: capacity * strideBytes,
        usage: 32 | 8
      });
      this.state.instanceCapacity = capacity;
    }

    return this.state.instanceBuffer;
  },

  ensurePipeline: function (device) {
    var module;

    if (!this.state.pipeline) {
      module = PS.render.wgslShaders.getShaderModule(device, this.shaderName);
      this.state.pipeline = PS.render.wgslShaders.getRenderPipeline({
        label: "terrain-tile.pipeline",
        layout: "auto",
        vertex: {
          module: module,
          entryPoint: "vs_main",
          buffers: [
            {
              arrayStride: 8,
              stepMode: "vertex",
              attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x2" }
              ]
            },
            {
              arrayStride: this.strideFloats * Float32Array.BYTES_PER_ELEMENT,
              stepMode: "instance",
              attributes: [
                { shaderLocation: 1, offset: 0, format: "float32x4" },
                { shaderLocation: 2, offset: 16, format: "float32x4" },
                { shaderLocation: 3, offset: 32, format: "float32" },
                { shaderLocation: 4, offset: 36, format: "float32" }
              ]
            }
          ]
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

  ensureGbufferPipeline: function (device) {
    var module;

    if (!this.state.gbufferPipeline) {
      module = PS.render.wgslShaders.getShaderModule(device, this.gbufferShaderName);
      this.state.gbufferPipeline = PS.render.wgslShaders.getRenderPipeline({
        label: "terrain-tile.gbuffer.pipeline",
        layout: "auto",
        vertex: {
          module: module,
          entryPoint: "vs_main",
          buffers: [
            {
              arrayStride: 8,
              stepMode: "vertex",
              attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x2" }
              ]
            },
            {
              arrayStride: this.strideFloats * Float32Array.BYTES_PER_ELEMENT,
              stepMode: "instance",
              attributes: [
                { shaderLocation: 1, offset: 0, format: "float32x4" },
                { shaderLocation: 2, offset: 16, format: "float32x4" },
                { shaderLocation: 3, offset: 32, format: "float32" },
                { shaderLocation: 4, offset: 36, format: "float32" }
              ]
            }
          ]
        },
        fragment: {
          module: module,
          entryPoint: "fs_main",
          targets: [
            { format: this.getFormat() },
            { format: "rgba16float" }
          ]
        },
        primitive: {
          topology: "triangle-strip"
        },
        depthStencil: {
          format: "depth24plus",
          depthWriteEnabled: false,
          depthCompare: "always"
        }
      }, device);
    }

    return this.state.gbufferPipeline;
  },

  writeUniforms: function (device, width, height, texture) {
    var descriptor = texture && texture.descriptor ? texture.descriptor : {};
    var textureSize = descriptor.size || {};
    var textureWidth = Math.max(1, Number(textureSize.width) || Number(texture.width) || 1);
    var textureHeight = Math.max(1, Number(textureSize.height) || Number(texture.height) || 1);

    device.queue.writeBuffer(
      this.ensureUniformBuffer(device),
      0,
      new Float32Array([
        Math.max(1, Number(width) || 1),
        Math.max(1, Number(height) || 1),
        1 / textureWidth,
        1 / textureHeight
      ])
    );
  },

  getTexture: function (pageIndex, device) {
    var key = String(pageIndex);
    var page = PS.atlas && PS.atlas.pages ? PS.atlas.pages[Number(pageIndex)] : null;
    var version = page ? String(page.version || 0) : "0";
    var cacheKey = key + ":" + version;
    var cached = this.state.textures[cacheKey];
    var texture;

    if (cached) {
      return cached;
    }

    if (!page || !page.data || !page.width || !page.height) {
      return null;
    }

    texture = device.createTexture({
      label: "terrain-tile.atlas." + key,
      size: { width: page.width, height: page.height },
      format: "rgba8unorm",
      usage: 4 | 2
    });

    if (device.queue && typeof device.queue.writeTexture === "function") {
      device.queue.writeTexture(
        { texture: texture },
        page.data,
        { bytesPerRow: page.width * 4, rowsPerImage: page.height },
        { width: page.width, height: page.height }
      );
    }

    this.state.textures[cacheKey] = texture;
    this.state.textureUploadCount += 1;
    return texture;
  },

  createBindGroup: function (device, pipeline, texture) {
    return device.createBindGroup({
      label: "terrain-tile.bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: this.ensureSampler(device) },
        { binding: 2, resource: { buffer: this.ensureUniformBuffer(device) } }
      ]
    });
  },

  finalizeBatchPages: function (batches) {
    if (PS.render.surfaceTileBatcher && typeof PS.render.surfaceTileBatcher.finalizeBatchPages === "function") {
      return PS.render.surfaceTileBatcher.finalizeBatchPages(batches);
    }

    return batches;
  },

  beginBatches: function () {
    if (!PS.render.surfaceTileBatcher || typeof PS.render.surfaceTileBatcher.beginBatches !== "function") {
      throw new Error("Terrain batch builder is unavailable");
    }

    return PS.render.surfaceTileBatcher.beginBatches();
  },

  appendBatches: function (batches, address, cellCache, alpha) {
    if (!PS.render.surfaceTileBatcher || typeof PS.render.surfaceTileBatcher.appendBatches !== "function") {
      throw new Error("Terrain batch builder is unavailable");
    }

    return PS.render.surfaceTileBatcher.appendBatches(batches, address, cellCache, alpha);
  },

  makeBatches: function (address, cellCache, alpha) {
    return this.appendBatches(this.beginBatches(), address, cellCache, alpha);
  },

  drawBatches: function (batches, options) {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var spec = options || {};
    var device = this.getDevice(spec.device);
    var context = spec.context || (PS.gpu && PS.gpu.context);
    var targetCanvas = PS.gpu && PS.gpu.canvas ? PS.gpu.canvas : (typeof canvas !== "undefined" ? canvas : null);
    var width = spec.width || (targetCanvas ? targetCanvas.width : 1);
    var height = spec.height || (targetCanvas ? targetCanvas.height : 1);
    var readyBatches = this.finalizeBatchPages(batches);
    var pageKeys = readyBatches && readyBatches.pages ? Object.keys(readyBatches.pages) : [];
    var pipeline;
    var encoder;
    var drawnInstances = 0;
    var pageDraws = 0;
    var firstPass = true;

    if (!device || typeof device.createCommandEncoder !== "function") {
      throw new Error("WebGPU surface tile draw requires GPUDevice");
    }

    if (!context || typeof context.getCurrentTexture !== "function") {
      throw new Error("WebGPU surface tile draw requires a configured WebGPU context");
    }

    if (!readyBatches || readyBatches.count <= 0 || pageKeys.length === 0) {
      return false;
    }

    var useGbuffer = spec.gbuffer !== false;

    pipeline = useGbuffer ? this.ensureGbufferPipeline(device) : this.ensurePipeline(device);
    this.ensureQuadBuffer(device);
    encoder = spec.commandEncoder || device.createCommandEncoder({ label: "terrain-tile.encoder" });

    for (var i = 0; i < pageKeys.length; i += 1) {
      var pageIndex = pageKeys[i];
      var pageData = readyBatches.pages[pageIndex];
      var texture = this.getTexture(pageIndex, device);
      var instanceCount = pageData ? Math.floor(pageData.length / this.strideFloats) : 0;
      var instanceBuffer;
      var pass;

      if (!texture || !pageData || instanceCount <= 0) {
        continue;
      }

      instanceBuffer = this.ensureInstanceBuffer(device, instanceCount);
      device.queue.writeBuffer(instanceBuffer, 0, pageData, 0, instanceCount * this.strideFloats);
      this.writeUniforms(device, width, height, texture);
      if (useGbuffer) {
        pass = PS.render.webgpuGbuffer.beginTerrainPass(
          encoder,
          width,
          height,
          device,
          { loadOp: firstPass ? "clear" : "load" }
        );
      } else {
        pass = encoder.beginRenderPass({
          label: "terrain-tile.render-pass",
          colorAttachments: [{
            view: spec.textureView || context.getCurrentTexture().createView(),
            clearValue: { r: 8 / 255, g: 12 / 255, b: 18 / 255, a: 1 },
            loadOp: firstPass && spec.loadOp !== "load" ? "clear" : "load",
            storeOp: "store"
          }]
        });
      }
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, this.createBindGroup(device, pipeline, texture));
      pass.setVertexBuffer(0, this.state.quadBuffer);
      pass.setVertexBuffer(1, instanceBuffer);
      pass.draw(4, instanceCount, 0, 0);
      pass.end();

      drawnInstances += instanceCount;
      pageDraws += 1;
      firstPass = false;
    }

    if (drawnInstances <= 0) {
      return false;
    }

    if (useGbuffer) {
      var gbufferTargets = PS.render.webgpuGbuffer.ensure(width, height, device);

      PS.render.webgpuCompositor.draw({
        device: device,
        context: context,
        commandEncoder: encoder,
        albedoTexture: gbufferTargets.albedo.texture,
        normalHeightTexture: gbufferTargets.normalHeight.texture,
        textureView: spec.textureView || null,
        loadOp: spec.loadOp || "clear",
        sunDirection: spec.sunDirection,
        ambient: spec.ambient,
        directionalStrength: spec.directionalStrength,
        wrapStrength: spec.wrapStrength,
        heightTintStrength: spec.heightTintStrength
      });

      if (PS.render.webgpuPointLights && typeof PS.render.webgpuPointLights.draw === "function") {
        PS.render.webgpuPointLights.draw({
          device: device,
          context: context,
          commandEncoder: encoder,
          lights: readyBatches.pointLights || [],
          textureView: spec.textureView || null,
          loadOp: "load",
          width: width,
          height: height
        });
      }
    }

    if (!spec.commandEncoder) {
      device.queue.submit([encoder.finish()]);
    }

    this.state.drawCount += 1;
    this.state.tileDrawCount = drawnInstances;
    this.state.pageDrawCount = pageDraws;
    this.state.culledCount = readyBatches.culled || 0;
    this.state.materialCounts = Object.assign({}, readyBatches.materialCounts || {});
    this.state.equivalenceTerrainDrawCount += readyBatches.equivalenceTerrain || 0;
    this.state.equivalenceTransitionDrawCount += readyBatches.equivalenceTransitions || 0;

    if (PS.assets && PS.assets.equivalence && typeof PS.assets.equivalence.getStats === "function") {
      var equivalenceStats = PS.assets.equivalence.getStats();
      this.state.equivalenceSelectedUses = equivalenceStats.byUse;
      this.state.equivalenceSelectedSheets = equivalenceStats.bySheet;
    }

    this.state.lastFrameMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    this.state.lastError = "";
    return true;
  },

  drawTerrainAtlasBatch: function (chunks, alpha, options) {
    var list = Array.isArray(chunks) ? chunks : [];

    try {
      if (list.length <= 0 || !this.ensureAtlas()) {
        return false;
      }

      var batches = this.beginBatches();

      for (var i = 0; i < list.length; i += 1) {
        var item = list[i];

        if (!item || !item.address || !Array.isArray(item.cellCache)) {
          batches.culled++;
          continue;
        }

        this.appendBatches(
          batches,
          item.address,
          item.cellCache,
          item.alpha === undefined ? alpha : item.alpha
        );
      }

      return this.drawBatches(batches, options);
    } catch (error) {
      this.state.lastError = String(error && error.message ? error.message : error);
      return false;
    }
  },

  drawTerrainAtlas: function (address, cellCache, alpha, options) {
    try {
      if (!Array.isArray(cellCache) || !this.ensureAtlas()) {
        return false;
      }

      return this.drawBatches(this.makeBatches(address, cellCache, alpha), options);
    } catch (error) {
      this.state.lastError = String(error && error.message ? error.message : error);
      return false;
    }
  },

  getStats: function () {
    return {
      drawCount: this.state.drawCount,
      tileDrawCount: this.state.tileDrawCount,
      pageDrawCount: this.state.pageDrawCount,
      textureUploadCount: this.state.textureUploadCount,
      culledCount: this.state.culledCount,
      materialCounts: Object.assign({}, this.state.materialCounts || {}),
      equivalenceTerrainDrawCount: this.state.equivalenceTerrainDrawCount,
      equivalenceTransitionDrawCount: this.state.equivalenceTransitionDrawCount,
      lastFrameMs: this.state.lastFrameMs,
      lastError: this.state.lastError
    };
  },

  rebuildShaders: function () {
    this.state.pipeline = null;
    this.state.gbufferPipeline = null;
  },

  rebuildTextures: function () {
    this.state.textures = {};
    this.state.textureUploadCount = 0;
  }
});
