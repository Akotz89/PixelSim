"use strict";
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
  strideFloats: 12,
  rectStrideFloats: 8,
  maxInstances: 8192,
  state: {
    pipeline: null,
    gbufferPipeline: null,
    particlePipeline: null,
    shadowPipeline: null,
    sampler: null,
    uniformBuffer: null,
    particleUniformBuffer: null,
    shadowUniformBuffer: null,
    instanceBuffer: null,
    particleInstanceBuffer: null,
    shadowInstanceBuffer: null,
    instanceCapacity: 0,
    particleInstanceCapacity: 0,
    shadowInstanceCapacity: 0,
    textures: {},
    textureUploadCount: 0,
    drawCount: 0,
    gbufferDrawCount: 0,
    particleDrawCount: 0,
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
    lastFrameMs: 0,
    lastError: ""
  },

  registerManifest: function () {
    var manifest = PS.render.wgslShaderManifest = PS.render.wgslShaderManifest || [];
    var entries = [
      { name: this.spriteShaderName, path: this.spriteShaderPath },
      { name: this.shaderName, path: this.shaderPath },
      { name: this.particleShaderName, path: this.particleShaderPath },
      { name: this.shadowShaderName, path: this.shadowShaderPath }
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
    var field = kind === "shadow" ? "shadowUniformBuffer" : "particleUniformBuffer";

    if (!this.state[field]) {
      this.state[field] = device.createBuffer({
        label: kind + ".uniforms",
        size: 16,
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
    }

    return this.state.instanceBuffer;
  },

  ensureRectInstanceBuffer: function (device, instanceCount, kind) {
    var needed = Math.max(1, Math.ceil(Number(instanceCount) || 1));
    var bufferField = kind === "shadow" ? "shadowInstanceBuffer" : "particleInstanceBuffer";
    var capacityField = kind === "shadow" ? "shadowInstanceCapacity" : "particleInstanceCapacity";
    var capacity = this.state[capacityField] || 0;
    var strideBytes = this.rectStrideFloats * Float32Array.BYTES_PER_ELEMENT;

    if (!this.state[bufferField] || capacity < needed) {
      capacity = Math.max(needed, this.maxInstances);
      this.state[bufferField] = device.createBuffer({
        label: kind + ".instances.storage",
        size: capacity * strideBytes,
        usage: 128 | 8
      });
      this.state[capacityField] = capacity;
    }

    return this.state[bufferField];
  },

  ensurePipeline: function (device) {
    var module;

    if (!this.state.pipeline) {
      module = PS.render.wgslShaders.getShaderModule(device, this.shaderName);
      this.state.pipeline = PS.render.wgslShaders.getRenderPipeline({
        label: "entity-atlas.pipeline",
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
    var pipelineField = kind === "shadow" ? "shadowPipeline" : "particlePipeline";
    var shaderName = kind === "shadow" ? this.shadowShaderName : this.particleShaderName;
    var module;

    if (!this.state[pipelineField]) {
      module = PS.render.wgslShaders.getShaderModule(device, shaderName);
      this.state[pipelineField] = PS.render.wgslShaders.getRenderPipeline({
        label: kind + ".pipeline",
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

    return this.state[pipelineField];
  },

  writeUniforms: function (device, width, height) {
    device.queue.writeBuffer(
      this.ensureUniformBuffer(device),
      0,
      new Float32Array([
        Math.max(1, Number(width) || 1),
        Math.max(1, Number(height) || 1),
        0,
        0
      ])
    );
  },

  writeRectUniforms: function (device, width, height, kind) {
    device.queue.writeBuffer(
      this.ensureRectUniformBuffer(device, kind),
      0,
      new Float32Array([
        Math.max(1, Number(width) || 1),
        Math.max(1, Number(height) || 1),
        0,
        0
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
    this.state.textureUploadCount += 1;
    return texture;
  },

  createBindGroup: function (device, pipeline, texture, instanceBuffer) {
    return device.createBindGroup({
      label: "entity-atlas.bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: this.ensureSampler(device) },
        { binding: 2, resource: { buffer: this.ensureUniformBuffer(device) } },
        { binding: 3, resource: { buffer: instanceBuffer } }
      ]
    });
  },

  createRectBindGroup: function (device, pipeline, instanceBuffer, kind) {
    return device.createBindGroup({
      label: kind + ".bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.ensureRectUniformBuffer(device, kind) } },
        { binding: 1, resource: { buffer: instanceBuffer } }
      ]
    });
  },

  drawRectInstances: function (values, options) {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var spec = options || {};
    var kind = spec.kind === "shadow" ? "shadow" : "particle";
    var counterName = kind === "shadow" ? "shadowDrawCount" : "particleDrawCount";
    var device = this.getDevice(spec.device);
    var context = spec.context || (PS.gpu && PS.gpu.context);
    var targetCanvas = PS.gpu && PS.gpu.canvas ? PS.gpu.canvas : (typeof canvas !== "undefined" ? canvas : null);
    var width = spec.width || (targetCanvas ? targetCanvas.width : 1);
    var height = spec.height || (targetCanvas ? targetCanvas.height : 1);
    var data = values instanceof Float32Array ? values : new Float32Array(values || []);
    var instanceCount = Math.floor(data.length / this.rectStrideFloats);
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
    device.queue.writeBuffer(instanceBuffer, 0, data, 0, instanceCount * this.rectStrideFloats);

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

  beginBatches: function () {
    return {
      count: 0,
      pages: {}
    };
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

  appendCell: function (batches, cell, x, y, width, height, alpha, tint, kind) {
    var target = batches || this.beginBatches();
    var safeCell = cell || null;
    var pageIndex = safeCell ? Number(safeCell.pageIndex) || 0 : 0;
    var page = PS.atlas && PS.atlas.pages ? PS.atlas.pages[pageIndex] : null;
    var list;
    var color = tint || [1, 1, 1, 1];

    if (!safeCell || !page || !page.data) {
      return target;
    }

    list = target.pages[String(pageIndex)] = target.pages[String(pageIndex)] || [];
    list.push(
      Number(x) || 0,
      Number(y) || 0,
      Math.max(1, Number(width) || safeCell.w || 1),
      Math.max(1, Number(height) || safeCell.h || 1),
      safeCell.u0,
      safeCell.v0,
      safeCell.u1,
      safeCell.v1,
      Number(color[0]) || 1,
      Number(color[1]) || 1,
      Number(color[2]) || 1,
      Math.max(0, Math.min(1, Number(alpha === undefined ? color[3] : alpha) || 1))
    );
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
      var pageData = values instanceof Float32Array ? values : new Float32Array(values || []);
      var instanceCount = Math.floor(pageData.length / this.strideFloats);
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
        normalHeightTexture: gbuffer.normalHeight.texture
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
      lastFrameMs: this.state.lastFrameMs,
      lastError: this.state.lastError
    };
  },

  rebuildShaders: function () {
    this.state.pipeline = null;
    this.state.gbufferPipeline = null;
    this.state.particlePipeline = null;
    this.state.shadowPipeline = null;
  },

  rebuildTextures: function () {
    this.state.textures = {};
    this.state.textureUploadCount = 0;
  }
};
