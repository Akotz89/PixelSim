"use strict";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { world } from "../systems/state.js";
import { canvas } from "../ui/dom-refs.js";

PS.render = PS.render || {};

PS.render.webgpuEntity = PS.render.webgpuEntity || {
  shaderName: "entity-atlas",
  shaderPath: "shaders/entity-atlas.wgsl",
  spriteShaderName: "sprite-batch",
  spriteShaderPath: "shaders/sprite-batch.wgsl",
  particleShaderName: "particle",
  particleShaderPath: "shaders/particle.wgsl",
  shadowShaderName: "shadow",
  shadowShaderPath: "shaders/shadow.wgsl",
  displacementShaderName: "sprite-displace",
  displacementShaderPath: "shaders/sprite-displace.wgsl",
  strideFloats: 20,
  rectStrideFloats: 8,
  displacementStrideFloats: 16,
  maxInstances: 8192,
  state: {
    pipeline: null,
    gbufferPipeline: null,
    particlePipeline: null,
    shadowPipeline: null,
    displacementPipeline: null,
    sampler: null,
    uniformBuffer: null,
    particleUniformBuffer: null,
    shadowUniformBuffer: null,
    displacementUniformBuffer: null,
    instanceBuffer: null,
    particleInstanceBuffer: null,
    shadowInstanceBuffer: null,
    displacementInstanceBuffer: null,
    bindGroups: {},
    rectBindGroups: {},
    textureViews: {},
    uniformData: null,
    rectUniformData: null,
    displacementUniformData: null,
    rectDataScratch: {},
    instanceCapacity: 0,
    particleInstanceCapacity: 0,
    shadowInstanceCapacity: 0,
    displacementInstanceCapacity: 0,
    instanceBufferVersion: 0,
    particleInstanceBufferVersion: 0,
    shadowInstanceBufferVersion: 0,
    displacementInstanceBufferVersion: 0,
    textures: {},
    textureUploadCount: 0,
    bindGroupCacheHits: 0,
    bindGroupCacheMisses: 0,
    rectBindGroupCacheHits: 0,
    rectBindGroupCacheMisses: 0,
    drawCount: 0,
    gbufferDrawCount: 0,
    particleDrawCount: 0,
    displacementDrawCount: 0,
    displacementLastFrameMs: 0,
    frameInstanceDrawCount: 0,
    pageDrawCount: 0,
    foodDrawCount: 0,
    organismDrawCount: 0,
    settlementDrawCount: 0,
    routeDrawCount: 0,
    influenceDrawCount: 0,
    intentDrawCount: 0,
    readinessDrawCount: 0,
    eventMarkerDrawCount: 0,
    shadowDrawCount: 0,
    worldUiDrawCount: 0,
    stockpileDrawCount: 0,
    workStatusDrawCount: 0,
    effectDrawCount: 0,
    vegetationDrawCount: 0,
    citizenDrawCount: 0,
    pageBuffers: {},
    pageBufferToken: 0,
    lastBatchBufferReallocations: 0,
    lastFrameMs: 0,
    lastError: ""
  },

  registerManifest: function () {
    var manifest = PS.render.wgslShaderManifest = PS.render.wgslShaderManifest || [];
    var entries = [
      { name: this.spriteShaderName, path: this.spriteShaderPath },
      { name: this.shaderName, path: this.shaderPath },
      { name: this.particleShaderName, path: this.particleShaderPath },
      { name: this.shadowShaderName, path: this.shadowShaderPath },
      { name: this.displacementShaderName, path: this.displacementShaderPath }
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

  getDevice: function (device) {
    return device || (PS.gpu && PS.gpu.device);
  },

  getFormat: function () {
    return (PS.gpu && PS.gpu.format) || "bgra8unorm";
  },

  resetFrameStats: function () {
    this.state.frameInstanceDrawCount = 0;
    this.state.pageDrawCount = 0;
    this.state.particleDrawCount = 0;
    this.state.displacementDrawCount = 0;
    this.state.displacementLastFrameMs = 0;
    this.state.foodDrawCount = 0;
    this.state.organismDrawCount = 0;
    this.state.settlementDrawCount = 0;
    this.state.routeDrawCount = 0;
    this.state.influenceDrawCount = 0;
    this.state.intentDrawCount = 0;
    this.state.readinessDrawCount = 0;
    this.state.eventMarkerDrawCount = 0;
    this.state.shadowDrawCount = 0;
    this.state.worldUiDrawCount = 0;
    this.state.stockpileDrawCount = 0;
    this.state.workStatusDrawCount = 0;
    this.state.effectDrawCount = 0;
    this.state.vegetationDrawCount = 0;
    this.state.citizenDrawCount = 0;
    this.state.lastBatchBufferReallocations = 0;
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
        label: "entity-atlas.sampler",
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
        label: "entity-atlas.uniforms",
        size: 16,
        usage: 64 | 8
      });
    }
    return this.state.uniformBuffer;
  },

  ensureRectUniformBuffer: function (device, kind) {
    var field = kind === "shadow"
      ? "shadowUniformBuffer"
      : (kind === "displacement" ? "displacementUniformBuffer" : "particleUniformBuffer");

    if (!this.state[field]) {
      this.state[field] = device.createBuffer({
        label: kind + ".uniforms",
        size: kind === "displacement" ? 32 : 16,
        usage: 64 | 8
      });
    }

    return this.state[field];
  },

  ensureInstanceBuffer: function (device, instanceCount) {
    var needed = Math.max(1, Math.ceil(Number(instanceCount) || 1));
    var capacity = this.state.instanceCapacity || 0;
    var strideBytes = this.strideFloats * Float32Array.BYTES_PER_ELEMENT;

    if (!this.state.instanceBuffer || capacity < needed) {
      capacity = Math.max(needed, this.maxInstances);
      this.state.instanceBuffer = device.createBuffer({
        label: "entity-atlas.instances.storage",
        size: capacity * strideBytes,
        usage: 128 | 8
      });
      this.state.instanceCapacity = capacity;
      this.state.instanceBufferVersion = (this.state.instanceBufferVersion || 0) + 1;
      this.state.bindGroups = {};
    }

    return this.state.instanceBuffer;
  },

  ensureRectInstanceBuffer: function (device, instanceCount, kind) {
    var needed = Math.max(1, Math.ceil(Number(instanceCount) || 1));
    var bufferField = kind === "shadow"
      ? "shadowInstanceBuffer"
      : (kind === "displacement" ? "displacementInstanceBuffer" : "particleInstanceBuffer");
    var capacityField = kind === "shadow"
      ? "shadowInstanceCapacity"
      : (kind === "displacement" ? "displacementInstanceCapacity" : "particleInstanceCapacity");
    var versionField = kind === "shadow"
      ? "shadowInstanceBufferVersion"
      : (kind === "displacement" ? "displacementInstanceBufferVersion" : "particleInstanceBufferVersion");
    var capacity = this.state[capacityField] || 0;
    var strideFloats = kind === "displacement" ? this.displacementStrideFloats : this.rectStrideFloats;
    var strideBytes = strideFloats * Float32Array.BYTES_PER_ELEMENT;

    if (!this.state[bufferField] || capacity < needed) {
      capacity = Math.max(needed, this.maxInstances);
      this.state[bufferField] = device.createBuffer({
        label: kind + ".instances.storage",
        size: capacity * strideBytes,
        usage: 128 | 8
      });
      this.state[capacityField] = capacity;
      this.state[versionField] = (this.state[versionField] || 0) + 1;
      this.state.rectBindGroups = {};
    }

    return this.state[bufferField];
  },

  ensurePipeline: function (device) {
    return PS.render.ensureAlphaBlendPipeline(this, device, {
      label: "entity-atlas.pipeline"
    });
  },

  ensureGbufferPipeline: function (device) {
    var module;

    if (!this.state.gbufferPipeline) {
      module = PS.render.wgslShaders.getShaderModule(device, this.shaderName);
      this.state.gbufferPipeline = PS.render.wgslShaders.getRenderPipeline({
        label: "entity-atlas.gbuffer.pipeline",
        layout: "auto",
        vertex: {
          module: module,
          entryPoint: "vs_main"
        },
        fragment: {
          module: module,
          entryPoint: "fs_gbuffer",
          targets: [
            {
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
            },
            {
              format: "rgba16float"
            }
          ]
        },
        primitive: {
          topology: "triangle-strip"
        }
      }, device);
    }

    return this.state.gbufferPipeline;
  },

  ensureRectPipeline: function (device, kind) {
    var pipelineField = kind === "shadow"
      ? "shadowPipeline"
      : (kind === "displacement" ? "displacementPipeline" : "particlePipeline");
    var shaderName = kind === "shadow"
      ? this.shadowShaderName
      : (kind === "displacement" ? this.displacementShaderName : this.particleShaderName);

    return PS.render.ensureAlphaBlendPipeline(this, device, {
      field: pipelineField,
      label: kind + ".pipeline",
      shaderName: shaderName
    });
  },

  writeUniforms: function (device, width, height) {
    var data = this.state.uniformData;

    if (!data) {
      data = new Float32Array(4);
      this.state.uniformData = data;
    }

    data[0] = Math.max(1, Number(width) || 1);
    data[1] = Math.max(1, Number(height) || 1);
    data[2] = 0;
    data[3] = 0;

    device.queue.writeBuffer(
      this.ensureUniformBuffer(device),
      0,
      data
    );
  },

  writeRectUniforms: function (device, width, height, kind) {
    var data = kind === "displacement" ? this.state.displacementUniformData : this.state.rectUniformData;

    if (!data) {
      data = new Float32Array(kind === "displacement" ? 8 : 4);
      if (kind === "displacement") {
        this.state.displacementUniformData = data;
      } else {
        this.state.rectUniformData = data;
      }
    }

    data[0] = Math.max(1, Number(width) || 1);
    data[1] = Math.max(1, Number(height) || 1);
    data[2] = kind === "displacement" ? this.getNowSeconds() : 0;
    data[3] = 0;
    if (kind === "displacement") {
      data[4] = 0;
      data[5] = 0;
      data[6] = 0;
      data[7] = 0;
    }

    device.queue.writeBuffer(this.ensureRectUniformBuffer(device, kind), 0, data);
  },

  getScratchFloatData: function (kind, values) {
    var source = values || [];
    var length = source.length || 0;
    var scratch = this.state.rectDataScratch[kind];
    var i;

    if (source instanceof Float32Array) {
      return source;
    }

    if (!scratch || scratch.length < length) {
      scratch = new Float32Array(Math.max(length, 64));
      this.state.rectDataScratch[kind] = scratch;
    }

    for (i = 0; i < length; i += 1) {
      scratch[i] = Number(source[i]) || 0;
    }

    return scratch.subarray(0, length);
  },

  getNowSeconds: function () {
    if (typeof world !== "undefined" && world && Number.isFinite(Number(world.timeMs))) {
      return Number(world.timeMs) / 1000;
    }

    return (Date.now ? Date.now() : 0) / 1000;
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
      label: "entity-atlas.page." + key,
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
    texture._pixeldariumEntityTextureCacheKey = cacheKey;
    this.state.textureUploadCount += 1;
    return texture;
  },

  createBindGroup: function (device, pipeline, texture, instanceBuffer) {
    var textureKey = texture && texture._pixeldariumEntityTextureCacheKey
      ? texture._pixeldariumEntityTextureCacheKey
      : String(texture && (texture.label || texture.id || texture.descriptor && texture.descriptor.label) || "texture");
    var pipelineKey = pipeline && pipeline.descriptor && pipeline.descriptor.label
      ? pipeline.descriptor.label
      : "pipeline";
    var cacheKey = pipelineKey + "|" + textureKey + "|" +
      String(this.state.instanceCapacity || 0) + "|" +
      String(this.state.instanceBufferVersion || 0);
    var cached = this.state.bindGroups && this.state.bindGroups[cacheKey];
    var textureView;
    var bindGroup;

    if (cached) {
      this.state.bindGroupCacheHits += 1;
      return cached;
    }

    this.state.bindGroups = this.state.bindGroups || {};
    this.state.textureViews = this.state.textureViews || {};
    textureView = this.state.textureViews[textureKey];
    if (!textureView) {
      textureView = texture.createView();
      this.state.textureViews[textureKey] = textureView;
    }

    bindGroup = device.createBindGroup({
      label: "entity-atlas.bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: textureView },
        { binding: 1, resource: this.ensureSampler(device) },
        { binding: 2, resource: { buffer: this.ensureUniformBuffer(device) } },
        { binding: 3, resource: { buffer: instanceBuffer } }
      ]
    });
    this.state.bindGroups[cacheKey] = bindGroup;
    this.state.bindGroupCacheMisses += 1;
    return bindGroup;
  },

  createRectBindGroup: function (device, pipeline, instanceBuffer, kind) {
    var pipelineKey = pipeline && pipeline.descriptor && pipeline.descriptor.label
      ? pipeline.descriptor.label
      : "pipeline";
    var capacityField = kind === "shadow"
      ? "shadowInstanceCapacity"
      : (kind === "displacement" ? "displacementInstanceCapacity" : "particleInstanceCapacity");
    var versionField = kind === "shadow"
      ? "shadowInstanceBufferVersion"
      : (kind === "displacement" ? "displacementInstanceBufferVersion" : "particleInstanceBufferVersion");
    var cacheKey = kind + "|" + pipelineKey + "|" +
      String(this.state[capacityField] || 0) + "|" +
      String(this.state[versionField] || 0);
    var cached = this.state.rectBindGroups && this.state.rectBindGroups[cacheKey];
    var bindGroup;

    if (cached) {
      this.state.rectBindGroupCacheHits += 1;
      return cached;
    }

    this.state.rectBindGroups = this.state.rectBindGroups || {};
    bindGroup = device.createBindGroup({
      label: kind + ".bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.ensureRectUniformBuffer(device, kind) } },
        { binding: 1, resource: { buffer: instanceBuffer } }
      ]
    });
    this.state.rectBindGroups[cacheKey] = bindGroup;
    this.state.rectBindGroupCacheMisses += 1;
    return bindGroup;
  },

  drawRectInstances: function (values, options) {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var spec = options || {};
    var kind = spec.kind === "shadow"
      ? "shadow"
      : (spec.kind === "displacement" ? "displacement" : "particle");
    var counterName = kind === "shadow"
      ? "shadowDrawCount"
      : (kind === "displacement" ? "displacementDrawCount" : "particleDrawCount");
    var device = this.getDevice(spec.device);
    var context = spec.context || (PS.gpu && PS.gpu.context);
    var targetCanvas = PS.gpu && PS.gpu.canvas ? PS.gpu.canvas : (typeof canvas !== "undefined" ? canvas : null);
    var width = spec.width || (targetCanvas ? targetCanvas.width : 1);
    var height = spec.height || (targetCanvas ? targetCanvas.height : 1);
    var data = this.getScratchFloatData(kind, values);
    var strideFloats = kind === "displacement" ? this.displacementStrideFloats : this.rectStrideFloats;
    var instanceCount = Math.floor(data.length / strideFloats);
    var pipeline;
    var instanceBuffer;
    var encoder;
    var pass;

    if (!device || typeof device.createCommandEncoder !== "function") {
      throw new Error("WebGPU " + kind + " draw requires GPUDevice");
    }

    if (!context || typeof context.getCurrentTexture !== "function") {
      throw new Error("WebGPU " + kind + " draw requires a configured WebGPU context");
    }

    if (instanceCount <= 0) {
      return false;
    }

    pipeline = this.ensureRectPipeline(device, kind);
    this.writeRectUniforms(device, width, height, kind);
    instanceBuffer = this.ensureRectInstanceBuffer(device, instanceCount, kind);
    device.queue.writeBuffer(instanceBuffer, 0, data, 0, instanceCount * strideFloats);

    encoder = spec.commandEncoder || device.createCommandEncoder({ label: kind + ".encoder" });
    pass = encoder.beginRenderPass({
      label: kind + ".render-pass",
      colorAttachments: [{
        view: spec.textureView || context.getCurrentTexture().createView(),
        loadOp: "load",
        storeOp: "store"
      }]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.createRectBindGroup(device, pipeline, instanceBuffer, kind));
    pass.draw(4, instanceCount, 0, 0);
    pass.end();

    if (!spec.commandEncoder) {
      device.queue.submit([encoder.finish()]);
    }

    this.state.drawCount += 1;
    this.state[counterName] += instanceCount;
    this.state.lastFrameMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    if (kind === "displacement") {
      this.state.displacementLastFrameMs = this.state.lastFrameMs;
    }
    this.state.lastError = "";
    return true;
  },

  drawParticleRects: function (values, options) {
    var spec = options || {};
    spec.kind = "particle";
    return this.drawRectInstances(values, spec);
  },

  drawShadowRects: function (values, options) {
    var spec = options || {};
    spec.kind = "shadow";
    return this.drawRectInstances(values, spec);
  },

  drawDisplacementRects: function (values, options) {
    var spec = options || {};
    spec.kind = "displacement";
    return this.drawRectInstances(values, spec);
  },

  beginBatches: function () {
    return {
      count: 0,
      pages: {},
      pageBufferToken: ++this.state.pageBufferToken
    };
  },

  getPageBuffer: function (batches, pageIndex) {
    var stride = this.strideFloats;
    var key = String(pageIndex);
    var page = this.state.pageBuffers[key];

    if (!page) {
      page = {
        data: new Float32Array(Math.max(stride * 64, stride)),
        length: 0,
        token: 0
      };
      this.state.pageBuffers[key] = page;
      this.state.lastBatchBufferReallocations += 1;
    }

    if (page.token !== batches.pageBufferToken) {
      page.length = 0;
      page.token = batches.pageBufferToken;
    }

    if (page.length + stride > page.data.length) {
      var nextLength = page.data.length;
      var nextData;

      while (page.length + stride > nextLength) {
        nextLength *= 2;
      }

      nextData = new Float32Array(nextLength);
      nextData.set(page.data.subarray(0, page.length), 0);
      page.data = nextData;
      this.state.lastBatchBufferReallocations += 1;
    }

    batches.pages[key] = page;
    return page;
  },

  getKindCounterName: function (kind) {
    var names = {
      food: "food",
      organism: "organism",
      settlement: "settlement",
      route: "route",
      influence: "influence",
      intent: "intent",
      readiness: "readiness",
      eventMarker: "eventMarker",
      shadow: "shadow",
      worldUi: "worldUi",
      stockpile: "stockpile",
      workStatus: "workStatus",
      effect: "effect",
      vegetation: "vegetation",
      citizen: "citizen"
    };

    return names[kind] || "";
  },

  incrementBatchKind: function (target, kind, count) {
    var counterName = this.getKindCounterName(kind);

    if (!counterName) {
      return;
    }

    target.kinds = target.kinds || {};
    target.kinds[counterName] = (target.kinds[counterName] || 0) + (Number(count) || 1);
  },

  getCellUvRects: function (cell) {
    var safeCell = cell || {};
    var page = PS.atlas && PS.atlas.pages ? PS.atlas.pages[Number(safeCell.pageIndex) || 0] : null;
    var pageWidth = page && Number(page.width) ? Number(page.width) : 1;
    var pageHeight = page && Number(page.height) ? Number(page.height) : 1;
    var hasNormalRect = Number.isFinite(Number(safeCell.normalX)) && Number.isFinite(Number(safeCell.normalY));
    var split = !hasNormalRect && Number(safeCell.w) >= Math.max(2, Number(safeCell.h) || 1) * 2;
    var diffuseX0 = Number(safeCell.x) || 0;
    var diffuseY0 = Number(safeCell.y) || 0;
    var diffuseX1 = diffuseX0 + Math.max(1, split ? Math.floor((Number(safeCell.w) || 1) / 2) : (Number(safeCell.w) || 1));
    var diffuseY1 = diffuseY0 + Math.max(1, Number(safeCell.h) || 1);
    var normalX0 = hasNormalRect ? Number(safeCell.normalX) || 0 : (split ? diffuseX1 : diffuseX0);
    var normalY0 = hasNormalRect ? Number(safeCell.normalY) || 0 : diffuseY0;
    var normalX1 = hasNormalRect
      ? normalX0 + Math.max(1, Number(safeCell.normalW) || Number(safeCell.w) || 1)
      : (split ? diffuseX0 + (Number(safeCell.w) || 1) : diffuseX1);
    var normalY1 = hasNormalRect
      ? normalY0 + Math.max(1, Number(safeCell.normalH) || Number(safeCell.h) || 1)
      : diffuseY1;

    return {
      displayWidth: Math.max(1, diffuseX1 - diffuseX0),
      diffuse: [
        diffuseX0 / pageWidth,
        diffuseY0 / pageHeight,
        diffuseX1 / pageWidth,
        diffuseY1 / pageHeight
      ],
      normal: [
        normalX0 / pageWidth,
        normalY0 / pageHeight,
        normalX1 / pageWidth,
        normalY1 / pageHeight
      ]
    };
  },

  getCellMaterialUvRect: function (cell) {
    var safeCell = cell || {};
    var page = PS.atlas && PS.atlas.pages ? PS.atlas.pages[Number(safeCell.pageIndex) || 0] : null;
    var pageWidth = page && Number(page.width) ? Number(page.width) : 1;
    var pageHeight = page && Number(page.height) ? Number(page.height) : 1;
    var materialX = Number.isFinite(Number(safeCell.materialX))
      ? Number(safeCell.materialX)
      : (Number(safeCell.x) || 0) + (Number(safeCell.materialOffsetX) || 0);
    var materialY = Number.isFinite(Number(safeCell.materialY))
      ? Number(safeCell.materialY)
      : (Number(safeCell.y) || 0) + (Number(safeCell.materialOffsetY) || 0);
    var materialW = Math.max(1, Number(safeCell.materialW) || Number(safeCell.w) || 1);
    var materialH = Math.max(1, Number(safeCell.materialH) || Number(safeCell.h) || 1);

    return [
      materialX / pageWidth,
      materialY / pageHeight,
      (materialX + materialW) / pageWidth,
      (materialY + materialH) / pageHeight
    ];
  },

  appendCell: function (batches, cell, x, y, width, height, alpha, tint, kind) {
    var target = batches || this.beginBatches();
    var safeCell = cell || null;
    var pageIndex = safeCell ? Number(safeCell.pageIndex) || 0 : 0;
    var page = PS.atlas && PS.atlas.pages ? PS.atlas.pages[pageIndex] : null;
    var list;
    var offset;
    var color = tint || [1, 1, 1, 1];
    var uvRects;
    var materialUvRect;

    if (!safeCell || !page || !page.data) {
      return target;
    }

    uvRects = this.getCellUvRects(safeCell);
    materialUvRect = this.getCellMaterialUvRect(safeCell);
    list = this.getPageBuffer(target, pageIndex);
    offset = list.length;
    list.data[offset] = Number(x) || 0;
    list.data[offset + 1] = Number(y) || 0;
    list.data[offset + 2] = Math.max(1, Number(width) || uvRects.displayWidth || safeCell.w || 1);
    list.data[offset + 3] = Math.max(1, Number(height) || safeCell.h || 1);
    list.data[offset + 4] = uvRects.diffuse[0];
    list.data[offset + 5] = uvRects.diffuse[1];
    list.data[offset + 6] = uvRects.diffuse[2];
    list.data[offset + 7] = uvRects.diffuse[3];
    list.data[offset + 8] = uvRects.normal[0];
    list.data[offset + 9] = uvRects.normal[1];
    list.data[offset + 10] = uvRects.normal[2];
    list.data[offset + 11] = uvRects.normal[3];
    list.data[offset + 12] = materialUvRect[0];
    list.data[offset + 13] = materialUvRect[1];
    list.data[offset + 14] = materialUvRect[2];
    list.data[offset + 15] = materialUvRect[3];
    list.data[offset + 16] = Number(color[0]) || 1;
    list.data[offset + 17] = Number(color[1]) || 1;
    list.data[offset + 18] = Number(color[2]) || 1;
    list.data[offset + 19] = Math.max(0, Math.min(1, Number(alpha === undefined ? color[3] : alpha) || 1));
    list.length += this.strideFloats;
    target.count += 1;

    this.incrementBatchKind(target, kind, 1);

    return target;
  },

  drawCell: function (cell, x, y, width, height, options) {
    var spec = options || {};
    var batches = this.beginBatches();
    this.appendCell(batches, cell, x, y, width, height, spec.alpha, spec.tint, spec.kind);
    return this.drawBatches(batches, spec);
  },

  /**
   * @description Uploads entity sprite batches, atlas pages, lighting uniforms, and instance buffers to WebGPU before issuing entity draw calls.
   * @param {Object|null} batches Entity batches grouped by atlas page and visual layer.
   * @param {Object|null} options Render options including device, context, viewport, alpha, and lighting state.
   * @returns {boolean} True when any entity batch is submitted to WebGPU.
   */
  drawBatches: function (batches, options) {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var spec = options || {};
    var device = this.getDevice(spec.device);
    var context = spec.context || (PS.gpu && PS.gpu.context);
    var targetCanvas = PS.gpu && PS.gpu.canvas ? PS.gpu.canvas : (typeof canvas !== "undefined" ? canvas : null);
    var width = spec.width || (targetCanvas ? targetCanvas.width : 1);
    var height = spec.height || (targetCanvas ? targetCanvas.height : 1);
    var pageKeys = batches && batches.pages ? Object.keys(batches.pages) : [];
    var pipeline;
    var gbuffer;
    var encoder;
    var drawnInstances = 0;
    var pageDraws = 0;
    var useGbuffer = spec.useGbuffer === true;

    if (!device || typeof device.createCommandEncoder !== "function") {
      throw new Error("WebGPU entity draw requires GPUDevice");
    }

    if (!context || typeof context.getCurrentTexture !== "function") {
      throw new Error("WebGPU entity draw requires a configured WebGPU context");
    }

    if (!batches || batches.count <= 0 || pageKeys.length === 0) {
      return false;
    }

    if (useGbuffer) {
      if (!PS.render.webgpuGbuffer || typeof PS.render.webgpuGbuffer.beginTerrainPass !== "function") {
        throw new Error("WebGPU entity G-buffer draw requires webgpuGbuffer");
      }

      if (!PS.render.webgpuCompositor || typeof PS.render.webgpuCompositor.draw !== "function") {
        throw new Error("WebGPU entity G-buffer draw requires webgpuCompositor");
      }

      gbuffer = PS.render.webgpuGbuffer.ensure(width, height, device);
    }

    pipeline = useGbuffer ? this.ensureGbufferPipeline(device) : this.ensurePipeline(device);
    this.writeUniforms(device, width, height);
    encoder = spec.commandEncoder || device.createCommandEncoder({ label: "entity-atlas.encoder" });

    for (var i = 0; i < pageKeys.length; i += 1) {
      var pageIndex = pageKeys[i];
      var values = batches.pages[pageIndex];
      var pageData = values && values.data instanceof Float32Array
        ? values.data
        : (values instanceof Float32Array ? values : new Float32Array(values || []));
      var pageLength = values && values.data instanceof Float32Array ? values.length : pageData.length;
      var instanceCount = Math.floor(pageLength / this.strideFloats);
      var texture = this.getTexture(pageIndex, device);
      var instanceBuffer;
      var pass;

      if (!texture || instanceCount <= 0) {
        continue;
      }

      instanceBuffer = this.ensureInstanceBuffer(device, instanceCount);
      device.queue.writeBuffer(instanceBuffer, 0, pageData, 0, instanceCount * this.strideFloats);
      if (useGbuffer) {
        pass = PS.render.webgpuGbuffer.beginTerrainPass(encoder, width, height, device, {
          label: "gbuffer.entity-pass",
          loadOp: pageDraws === 0 ? "clear" : "load",
          includeDepth: false
        });
      } else {
        pass = encoder.beginRenderPass({
          label: "entity-atlas.render-pass",
          colorAttachments: [{
            view: spec.textureView || context.getCurrentTexture().createView(),
            loadOp: "load",
            storeOp: "store"
          }]
        });
      }
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, this.createBindGroup(device, pipeline, texture, instanceBuffer));
      pass.draw(4, instanceCount, 0, 0);
      pass.end();
      drawnInstances += instanceCount;
      pageDraws += 1;
    }

    if (drawnInstances <= 0) {
      return false;
    }

    if (useGbuffer) {
      PS.render.webgpuCompositor.draw({
        commandEncoder: encoder,
        device: device,
        context: context,
        textureView: spec.textureView,
        loadOp: spec.compositeLoadOp || "load",
        albedoTexture: gbuffer.albedo.texture,
        normalHeightTexture: gbuffer.normalHeight.texture,
        sunDirection: spec.sunDirection,
        timeOfDay: spec.timeOfDay,
        lightingCycleState: spec.lightingCycleState,
        ambient: spec.ambient,
        ambientColor: spec.ambientColor,
        directionalStrength: spec.directionalStrength,
        wrapStrength: spec.wrapStrength,
        heightTintStrength: spec.heightTintStrength
      });
    }

    if (!spec.commandEncoder) {
      device.queue.submit([encoder.finish()]);
    }

    this.state.drawCount += 1;
    if (useGbuffer) {
      this.state.gbufferDrawCount += drawnInstances;
    }
    this.state.frameInstanceDrawCount += drawnInstances;
    this.state.pageDrawCount += pageDraws;
    this.state.foodDrawCount += Number(batches.kinds && batches.kinds.food) || 0;
    this.state.organismDrawCount += Number(batches.kinds && batches.kinds.organism) || 0;
    this.state.settlementDrawCount += Number(batches.kinds && batches.kinds.settlement) || 0;
    this.state.routeDrawCount += Number(batches.kinds && batches.kinds.route) || 0;
    this.state.influenceDrawCount += Number(batches.kinds && batches.kinds.influence) || 0;
    this.state.intentDrawCount += Number(batches.kinds && batches.kinds.intent) || 0;
    this.state.readinessDrawCount += Number(batches.kinds && batches.kinds.readiness) || 0;
    this.state.eventMarkerDrawCount += Number(batches.kinds && batches.kinds.eventMarker) || 0;
    this.state.shadowDrawCount += Number(batches.kinds && batches.kinds.shadow) || 0;
    this.state.worldUiDrawCount += Number(batches.kinds && batches.kinds.worldUi) || 0;
    this.state.stockpileDrawCount += Number(batches.kinds && batches.kinds.stockpile) || 0;
    this.state.workStatusDrawCount += Number(batches.kinds && batches.kinds.workStatus) || 0;
    this.state.effectDrawCount += Number(batches.kinds && batches.kinds.effect) || 0;
    this.state.vegetationDrawCount += Number(batches.kinds && batches.kinds.vegetation) || 0;
    this.state.citizenDrawCount += Number(batches.kinds && batches.kinds.citizen) || 0;
    this.state.lastFrameMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    this.state.lastError = "";
    return true;
  },

  getStats: function () {
    return {
      drawCount: this.state.drawCount,
      gbufferDrawCount: this.state.gbufferDrawCount,
      particleDrawCount: this.state.particleDrawCount,
      displacementDrawCount: this.state.displacementDrawCount,
      displacementLastFrameMs: this.state.displacementLastFrameMs,
      frameInstanceDrawCount: this.state.frameInstanceDrawCount,
      pageDrawCount: this.state.pageDrawCount,
      foodDrawCount: this.state.foodDrawCount,
      organismDrawCount: this.state.organismDrawCount,
      settlementDrawCount: this.state.settlementDrawCount,
      routeDrawCount: this.state.routeDrawCount,
      influenceDrawCount: this.state.influenceDrawCount,
      intentDrawCount: this.state.intentDrawCount,
      readinessDrawCount: this.state.readinessDrawCount,
      eventMarkerDrawCount: this.state.eventMarkerDrawCount,
      shadowDrawCount: this.state.shadowDrawCount,
      worldUiDrawCount: this.state.worldUiDrawCount,
      stockpileDrawCount: this.state.stockpileDrawCount,
      workStatusDrawCount: this.state.workStatusDrawCount,
      effectDrawCount: this.state.effectDrawCount,
      vegetationDrawCount: this.state.vegetationDrawCount,
      citizenDrawCount: this.state.citizenDrawCount,
      textureUploadCount: this.state.textureUploadCount,
      instanceCapacity: this.state.instanceCapacity,
      particleInstanceCapacity: this.state.particleInstanceCapacity,
      shadowInstanceCapacity: this.state.shadowInstanceCapacity,
      displacementInstanceCapacity: this.state.displacementInstanceCapacity,
      bindGroupCacheHits: this.state.bindGroupCacheHits,
      bindGroupCacheMisses: this.state.bindGroupCacheMisses,
      rectBindGroupCacheHits: this.state.rectBindGroupCacheHits,
      rectBindGroupCacheMisses: this.state.rectBindGroupCacheMisses,
      lastBatchBufferReallocations: this.state.lastBatchBufferReallocations,
      lastFrameMs: this.state.lastFrameMs,
      lastError: this.state.lastError
    };
  },

  rebuildShaders: function () {
    this.state.pipeline = null;
    this.state.gbufferPipeline = null;
    this.state.particlePipeline = null;
    this.state.shadowPipeline = null;
    this.state.displacementPipeline = null;
  },

  rebuildTextures: function () {
    this.state.textures = {};
    this.state.textureUploadCount = 0;
  }
};
