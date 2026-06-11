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
  tilemapShaderName: "terrain-tilemap",
  tilemapShaderPath: "shaders/terrain-tilemap.wgsl",
  gbufferShaderName: "gbuffer-terrain",
  gbufferShaderPath: "shaders/gbuffer-terrain.wgsl",
  strideFloats: 15,
  maxInstances: 8192,
  state: Object.assign({
    pipeline: null,
    gbufferPipeline: null,
    sampler: null,
    uniformBuffer: null,
    tilemapUniformBuffer: null,
    quadBuffer: null,
    instanceBuffer: null,
    tilemapPipeline: null,
    tilemapBindGroups: {},
    tilemapTextures: {},
    nextTilemapTextureId: 1,
    instanceCapacity: 0,
    textures: {},
    textureUploadCount: 0,
    drawCount: 0,
    tileDrawCount: 0,
    tilemapDataTextureDraws: 0,
    tilemapDirtyUploadMs: 0,
    tilemapDirtyUploadCount: 0,
    tilemapDirtyUploadBytes: 0,
    tilemapMemoryBytes: 0,
    tilemapVisibleTiles: 0,
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
      { name: this.tilemapShaderName, path: this.tilemapShaderPath },
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
      { name: this.tilemapShaderName, path: this.tilemapShaderPath },
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
    state.tilemapDataTextureDraws = 0;
    state.tilemapDirtyUploadMs = 0;
    state.tilemapDirtyUploadCount = 0;
    state.tilemapDirtyUploadBytes = 0;
    state.tilemapVisibleTiles = 0;
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

  ensureTilemapUniformBuffer: function (device) {
    if (!this.state.tilemapUniformBuffer) {
      this.state.tilemapUniformBuffer = device.createBuffer({
        label: "terrain-tilemap.uniforms",
        size: 64,
        usage: 64 | 8
      });
    }
    return this.state.tilemapUniformBuffer;
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
                { shaderLocation: 4, offset: 36, format: "float32" },
                { shaderLocation: 5, offset: 40, format: "float32" },
                { shaderLocation: 6, offset: 44, format: "float32" },
                { shaderLocation: 7, offset: 48, format: "float32" },
                { shaderLocation: 8, offset: 52, format: "float32" },
                { shaderLocation: 9, offset: 56, format: "float32" }
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
                { shaderLocation: 4, offset: 36, format: "float32" },
                { shaderLocation: 5, offset: 40, format: "float32" },
                { shaderLocation: 6, offset: 44, format: "float32" },
                { shaderLocation: 7, offset: 48, format: "float32" },
                { shaderLocation: 8, offset: 52, format: "float32" },
                { shaderLocation: 9, offset: 56, format: "float32" }
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

  ensureTilemapPipeline: function (device) {
    var module;

    if (!this.state.tilemapPipeline) {
      module = PS.render.wgslShaders.getShaderModule(device, this.tilemapShaderName);
      this.state.tilemapPipeline = PS.render.wgslShaders.getRenderPipeline({
        label: "terrain-tilemap.pipeline",
        layout: "auto",
        vertex: {
          module: module,
          entryPoint: "vs_main"
        },
        fragment: {
          module: module,
          entryPoint: "fs_main",
          targets: [{
            format: this.getFormat()
          }]
        },
        primitive: {
          topology: "triangle-strip"
        }
      }, device);
    }

    return this.state.tilemapPipeline;
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

  createTilemapLayer: function (width, height, initialData) {
    var layerWidth = Math.max(1, Math.round(Number(width) || 1));
    var layerHeight = Math.max(1, Math.round(Number(height) || 1));
    var byteLength = layerWidth * layerHeight * 4;
    var estimatedBytes = byteLength * 2 + 64;
    var data = initialData instanceof Uint8Array && initialData.length === byteLength
      ? new Uint8Array(initialData)
      : new Uint8Array(byteLength);

    if (estimatedBytes > 32 * 1024 * 1024) {
      throw new Error("Tilemap data textures exceed 32MB budget");
    }

    return {
      width: layerWidth,
      height: layerHeight,
      data: data,
      dirtyRects: [{ x: 0, y: 0, width: layerWidth, height: layerHeight }],
      texture: null,
      textureId: 0,
      textureVersion: 0,
      lastUploadMs: 0
    };
  },

  markTilemapDirtyRect: function (layer, x, y, width, height) {
    var rect;

    if (!layer) {
      return null;
    }

    rect = {
      x: Math.max(0, Math.round(Number(x) || 0)),
      y: Math.max(0, Math.round(Number(y) || 0)),
      width: Math.max(1, Math.round(Number(width) || 1)),
      height: Math.max(1, Math.round(Number(height) || 1))
    };
    rect.width = Math.min(rect.width, Math.max(0, layer.width - rect.x));
    rect.height = Math.min(rect.height, Math.max(0, layer.height - rect.y));

    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    layer.dirtyRects.push(rect);
    return rect;
  },

  setTilemapCell: function (layer, tileX, tileY, tileType, autotileMask, variation, flags) {
    var x = Math.round(Number(tileX) || 0);
    var y = Math.round(Number(tileY) || 0);
    var offset;

    if (!layer || x < 0 || y < 0 || x >= layer.width || y >= layer.height) {
      return false;
    }

    offset = (y * layer.width + x) * 4;
    layer.data[offset] = Math.max(0, Math.min(255, Math.round(Number(tileType) || 0)));
    layer.data[offset + 1] = Math.max(0, Math.min(255, Math.round(Number(autotileMask) || 0)));
    layer.data[offset + 2] = Math.max(0, Math.min(255, Math.round(Number(variation) || 0)));
    layer.data[offset + 3] = Math.max(0, Math.min(255, Math.round(Number(flags) || 0)));
    this.markTilemapDirtyRect(layer, x, y, 1, 1);
    return true;
  },

  ensureTilemapTexture: function (device, layer) {
    if (!layer.texture) {
      layer.texture = device.createTexture({
        label: "terrain-tilemap.data-texture",
        size: { width: layer.width, height: layer.height },
        format: "rgba8uint",
        usage: 4 | 2
      });
      layer.textureId = this.state.nextTilemapTextureId;
      this.state.nextTilemapTextureId += 1;
      layer.textureVersion += 1;
    }

    return layer.texture;
  },

  getTilemapRectData: function (layer, rect) {
    var rowBytes = rect.width * 4;
    var data = new Uint8Array(rowBytes * rect.height);
    var row;
    var srcStart;
    var srcEnd;

    for (row = 0; row < rect.height; row += 1) {
      srcStart = ((rect.y + row) * layer.width + rect.x) * 4;
      srcEnd = srcStart + rowBytes;
      data.set(layer.data.subarray(srcStart, srcEnd), row * rowBytes);
    }

    return data;
  },

  uploadTilemapDirtyRects: function (device, layer) {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var texture = this.ensureTilemapTexture(device, layer);
    var rects = layer.dirtyRects || [];
    var uploaded = 0;
    var uploadedBytes = 0;
    var i;
    var rect;
    var data;

    if (!device.queue || typeof device.queue.writeTexture !== "function") {
      layer.dirtyRects = [];
      return { count: 0, elapsedMs: 0 };
    }

    for (i = 0; i < rects.length; i += 1) {
      rect = rects[i];
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      data = this.getTilemapRectData(layer, rect);
      device.queue.writeTexture(
        { texture: texture, origin: { x: rect.x, y: rect.y, z: 0 } },
        data,
        { bytesPerRow: rect.width * 4, rowsPerImage: rect.height },
        { width: rect.width, height: rect.height }
      );
      uploaded += 1;
      uploadedBytes += data.byteLength;
    }

    layer.dirtyRects = [];
    layer.lastUploadMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    this.state.tilemapDirtyUploadMs = layer.lastUploadMs;
    this.state.tilemapDirtyUploadCount = uploaded;
    this.state.tilemapDirtyUploadBytes = uploadedBytes;
    return { count: uploaded, bytes: uploadedBytes, elapsedMs: layer.lastUploadMs };
  },

  writeTilemapUniforms: function (device, options, layer, atlasPage) {
    var spec = options || {};
    var canvasWidth = Math.max(1, Number(spec.width) || 1);
    var canvasHeight = Math.max(1, Number(spec.height) || 1);
    var tileSize = Math.max(1, Number(spec.tileSize) || Number(typeof CONFIG !== "undefined" && CONFIG.TILE_SIZE) || 16);
    var cameraX = Number(spec.cameraX) || 0;
    var cameraY = Number(spec.cameraY) || 0;
    var zoom = Math.max(0.001, Number(spec.zoom) || 1);
    var atlasWidth = Math.max(1, Number(atlasPage && atlasPage.width) || 1);
    var atlasHeight = Math.max(1, Number(atlasPage && atlasPage.height) || 1);

    device.queue.writeBuffer(
      this.ensureTilemapUniformBuffer(device),
      0,
      new Float32Array([
        canvasWidth, canvasHeight, cameraX, cameraY,
        tileSize, zoom, layer.width, layer.height,
        atlasWidth, atlasHeight, Number(spec.atlasTileSize) || tileSize, 0,
        0, 0, 0, 0
      ])
    );
  },

  createTilemapBindGroup: function (device, pipeline, dataTexture, atlasTexture) {
    var key = String(dataTexture && dataTexture.__psTilemapTextureId || dataTexture && dataTexture.label || "data") + ":" +
      String(atlasTexture && atlasTexture.__psTilemapTextureId || atlasTexture && atlasTexture.label || "atlas");

    if (!this.state.tilemapBindGroups[key]) {
      this.state.tilemapBindGroups[key] = device.createBindGroup({
        label: "terrain-tilemap.bind-group",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: dataTexture.createView() },
          { binding: 1, resource: atlasTexture.createView() },
          { binding: 2, resource: this.ensureSampler(device) },
          { binding: 3, resource: { buffer: this.ensureTilemapUniformBuffer(device) } }
        ]
      });
    }

    return this.state.tilemapBindGroups[key];
  },

  getTilemapMemoryBytes: function (layers) {
    var list = Array.isArray(layers) ? layers : [layers];
    var total = 0;

    list.forEach(function (layer) {
      if (layer && layer.data) {
        total += layer.data.byteLength * 2 + 64;
      }
    });

    return total;
  },

  drawDataTextureTilemap: function (layer, options) {
    var spec = options || {};
    var device = this.getDevice(spec.device);
    var context = spec.context || (PS.gpu && PS.gpu.context);
    var targetCanvas = PS.gpu && PS.gpu.canvas ? PS.gpu.canvas : (typeof canvas !== "undefined" ? canvas : null);
    var width = spec.width || (targetCanvas ? targetCanvas.width : 1);
    var height = spec.height || (targetCanvas ? targetCanvas.height : 1);
    var atlasPageIndex = Math.max(0, Math.round(Number(spec.atlasPageIndex) || 0));
    var atlasPage = PS.atlas && PS.atlas.pages ? PS.atlas.pages[atlasPageIndex] : null;
    var atlasTexture;
    var dataTexture;
    var pipeline;
    var encoder;
    var pass;

    if (!device || typeof device.createCommandEncoder !== "function" || !layer || !layer.data) {
      return false;
    }

    if (!context || typeof context.getCurrentTexture !== "function") {
      return false;
    }

    atlasTexture = this.getTexture(atlasPageIndex, device);
    if (!atlasTexture) {
      return false;
    }

    dataTexture = this.ensureTilemapTexture(device, layer);
    dataTexture.__psTilemapTextureId = "data:" + layer.textureId + ":" + layer.textureVersion;
    this.uploadTilemapDirtyRects(device, layer);
    this.writeTilemapUniforms(device, { width: width, height: height, tileSize: spec.tileSize, cameraX: spec.cameraX, cameraY: spec.cameraY, zoom: spec.zoom, atlasTileSize: spec.atlasTileSize }, layer, atlasPage);
    pipeline = this.ensureTilemapPipeline(device);
    encoder = spec.commandEncoder || device.createCommandEncoder({ label: "terrain-tilemap.encoder" });
    pass = encoder.beginRenderPass({
      label: "terrain-tilemap.render-pass",
      colorAttachments: [{
        view: spec.textureView || context.getCurrentTexture().createView(),
        clearValue: { r: 8 / 255, g: 12 / 255, b: 18 / 255, a: 1 },
        loadOp: spec.loadOp === "load" ? "load" : "clear",
        storeOp: "store"
      }]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.createTilemapBindGroup(device, pipeline, dataTexture, atlasTexture));
    pass.draw(4, 1, 0, 0);
    pass.end();

    if (!spec.commandEncoder) {
      device.queue.submit([encoder.finish()]);
    }

    this.state.drawCount += 1;
    this.state.tilemapDataTextureDraws += 1;
    this.state.tilemapVisibleTiles = layer.width * layer.height;
    this.state.tilemapMemoryBytes = this.getTilemapMemoryBytes(layer);
    this.state.tileDrawCount = layer.width * layer.height;
    this.state.pageDrawCount = 1;
    this.state.lastError = "";
    return true;
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

  appendBatches: function (batches, address, cellCache, alpha, lodState) {
    if (!PS.render.surfaceTileBatcher || typeof PS.render.surfaceTileBatcher.appendBatches !== "function") {
      throw new Error("Terrain batch builder is unavailable");
    }

    return PS.render.surfaceTileBatcher.appendBatches(batches, address, cellCache, alpha, lodState);
  },

  makeBatches: function (address, cellCache, alpha, lodState) {
    return this.appendBatches(this.beginBatches(), address, cellCache, alpha, lodState);
  },

  drawRectBatches: function (readyBatches, spec, device, context, encoder, width, height) {
    var textureView = spec.textureView || null;

    if (!PS.render.webgpuEntity) {
      return;
    }

    if (
      readyBatches.shadowRects &&
      readyBatches.shadowRects.length > 0 &&
      typeof PS.render.webgpuEntity.drawShadowRects === "function"
    ) {
      PS.render.webgpuEntity.drawShadowRects(new Float32Array(readyBatches.shadowRects), {
        device: device,
        context: context,
        commandEncoder: encoder,
        textureView: textureView,
        width: width,
        height: height
      });
    }

    if (
      readyBatches.waterDecorationRects &&
      readyBatches.waterDecorationRects.length > 0 &&
      typeof PS.render.webgpuEntity.drawParticleRects === "function"
    ) {
      PS.render.webgpuEntity.drawParticleRects(new Float32Array(readyBatches.waterDecorationRects), {
        device: device,
        context: context,
        commandEncoder: encoder,
        textureView: textureView,
        width: width,
        height: height
      });
    }
  },

  getVisualPolicy: function (lodState) {
    if (lodState && lodState.visualPolicy) {
      return lodState.visualPolicy;
    }

    return PS.render.lod && typeof PS.render.lod.getVisualPolicy === "function"
      ? PS.render.lod.getVisualPolicy()
      : { level: "SURFACE", pointLightScale: 1, normalLightingStrength: 1 };
  },

  drawBatches: function (batches, options) {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var spec = options || {};
    var policy = this.getVisualPolicy(spec.lodState);
    var cycle = PS.render.lightingCycle && typeof PS.render.lightingCycle.getState === "function"
      ? PS.render.lightingCycle.getState(spec)
      : null;
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
        sunDirection: spec.sunDirection || (cycle ? cycle.sunDirection : undefined),
        timeOfDay: spec.timeOfDay,
        lightingCycleState: cycle,
        ambient: spec.ambient !== undefined ? spec.ambient : (cycle ? cycle.ambient : undefined),
        ambientColor: spec.ambientColor || (cycle ? cycle.ambientColor : undefined),
        directionalStrength: (spec.directionalStrength === undefined ? (cycle ? cycle.directionalStrength : 0.52) : Math.max(0, Number(spec.directionalStrength) || 0)) *
          Math.max(0, Number(policy.normalLightingStrength) || 0),
        wrapStrength: (spec.wrapStrength === undefined ? (cycle ? cycle.wrapStrength : 0.16) : Math.max(0, Number(spec.wrapStrength) || 0)) *
          Math.max(0, Number(policy.normalLightingStrength) || 0),
        heightTintStrength: (spec.heightTintStrength === undefined ? (cycle ? cycle.heightTintStrength : 0.08) : Math.max(0, Number(spec.heightTintStrength) || 0)) *
          Math.max(0, Number(policy.normalLightingStrength) || 0)
      });

      if (PS.render.webgpuPointLights && typeof PS.render.webgpuPointLights.draw === "function") {
        PS.render.webgpuPointLights.draw({
          device: device,
          context: context,
          commandEncoder: encoder,
          lights: Math.max(0, Number(policy.pointLightScale) || 0) > 0 ? readyBatches.pointLights || [] : [],
          textureView: spec.textureView || null,
          loadOp: "load",
          width: width,
          height: height
        });
      }
    }

    this.drawRectBatches(readyBatches, spec, device, context, encoder, width, height);

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
      var lodState = options && options.lodState ? options.lodState : null;

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
          item.alpha === undefined ? alpha : item.alpha,
          item.lodState || lodState
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

      return this.drawBatches(this.makeBatches(address, cellCache, alpha, options && options.lodState), options);
    } catch (error) {
      this.state.lastError = String(error && error.message ? error.message : error);
      return false;
    }
  },

  getStats: function () {
    return {
      drawCount: this.state.drawCount,
      tileDrawCount: this.state.tileDrawCount,
      tilemapDataTextureDraws: this.state.tilemapDataTextureDraws,
      tilemapDirtyUploadMs: this.state.tilemapDirtyUploadMs,
      tilemapDirtyUploadCount: this.state.tilemapDirtyUploadCount,
      tilemapDirtyUploadBytes: this.state.tilemapDirtyUploadBytes,
      tilemapMemoryBytes: this.state.tilemapMemoryBytes,
      tilemapVisibleTiles: this.state.tilemapVisibleTiles,
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
    this.state.tilemapPipeline = null;
  },

  rebuildTextures: function () {
    this.state.textures = {};
    this.state.tilemapTextures = {};
    this.state.tilemapBindGroups = {};
    this.state.textureUploadCount = 0;
  }
});
