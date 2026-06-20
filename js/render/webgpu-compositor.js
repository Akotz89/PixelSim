import { PS } from "../core/namespace.js";
import { lightingCycle } from "./lighting-cycle.js";
import { world } from "../systems/state.js";

PS.render = PS.render || {};

PS.render.webgpuCompositor = PS.render.webgpuCompositor || {
  shaderName: "gbuffer-compose",
  shaderPath: "shaders/gbuffer-compose.wgsl",
  state: {
    pipeline: null,
    sampler: null,
    cloudShadowTexture: null,
    cloudShadowTextureToken: "",
    uniformBuffer: null,
    drawCount: 0,
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

  getDevice: function (device) {
    return device || (PS.gpu && PS.gpu.device);
  },

  getFormat: function () {
    return (PS.gpu && PS.gpu.format) || "bgra8unorm";
  },

  ensureSampler: function (device) {
    if (!this.state.sampler) {
      this.state.sampler = device.createSampler({
        label: "gbuffer-compose.sampler",
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "repeat"
      });
    }

    return this.state.sampler;
  },

  ensureUniformBuffer: function (device) {
    if (!this.state.uniformBuffer) {
      this.state.uniformBuffer = device.createBuffer({
        label: "gbuffer-compose.uniforms",
        size: 80,
        usage: 64 | 8
      });
    }

    return this.state.uniformBuffer;
  },

  getSunDirection: function (options) {
    var spec = options || {};
    var currentWorld = typeof world !== "undefined" ? world : null;
    var cycle = spec.lightingCycleState || (lightingCycle && typeof lightingCycle.getState === "function"
      ? lightingCycle.getState(spec)
      : null);
    var value = spec.sunDirection || (currentWorld && currentWorld.sunDirection ? currentWorld.sunDirection : null) || (cycle ? cycle.sunDirection : null);
    var x;
    var y;
    var z;
    var length;
    var tick = currentWorld && Number.isFinite(Number(currentWorld.tick)) ? Number(currentWorld.tick) : 0;
    var angle = tick * 0.00024;

    if (value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) && Number.isFinite(Number(value.z))) {
      x = Number(value.x);
      y = Number(value.y);
      z = Number(value.z);
    } else if (Array.isArray(value) && value.length >= 3) {
      x = Number(value[0]);
      y = Number(value[1]);
      z = Number(value[2]);
    } else {
      x = Math.cos(angle) * -0.58;
      y = 0.42;
      z = Math.sin(angle) * 0.36 + 0.66;
    }

    length = Math.sqrt(x * x + y * y + z * z) || 1;
    return {
      x: x / length,
      y: y / length,
      z: z / length
    };
  },

  makeUniformData: function (options) {
    var spec = options || {};
    var cycle = spec.lightingCycleState || (lightingCycle && typeof lightingCycle.getState === "function"
      ? lightingCycle.getState(spec)
      : null);
    var previousCycle = spec.lightingCycleState;
    var sun;
    spec.lightingCycleState = cycle;
    sun = this.getSunDirection(spec);
    spec.lightingCycleState = previousCycle;
    var ambientColor = Array.isArray(spec.ambientColor) && spec.ambientColor.length >= 3
      ? spec.ambientColor
      : (cycle ? cycle.ambientColor : [1, 1, 1]);
    var normalStrength = spec.normalLightingStrength !== undefined
      ? Math.max(0, Math.min(1, Number(spec.normalLightingStrength) || 0))
      : 1;
    var normalMode = String(spec.normalMappedLighting || "");
    var cloud = spec.cloudShadow || {};
    var cloudScale = Array.isArray(cloud.scale) ? cloud.scale : [1, 1];
    var cloudScroll = Array.isArray(cloud.scroll) ? cloud.scroll : [0, 0];
    var cloudMaxAlpha = cloud.maxAlpha === undefined ? 0.2 : Math.max(0, Math.min(0.2, Number(cloud.maxAlpha) || 0));
    var data = new Float32Array(20);

    if (normalMode === "disabled") {
      normalStrength = 0;
    }

    data[0] = sun.x;
    data[1] = sun.y;
    data[2] = sun.z;
    data[3] = 0;
    data[4] = spec.ambient !== undefined ? Math.max(0, Math.min(1, Number(spec.ambient) || 0)) : (cycle ? cycle.ambient : 0.32);
    data[5] = spec.directionalStrength !== undefined ? Math.max(0, Number(spec.directionalStrength) || 0) : (cycle ? cycle.directionalStrength : 0.52);
    data[6] = spec.wrapStrength !== undefined ? Math.max(0, Number(spec.wrapStrength) || 0) : (cycle ? cycle.wrapStrength : 0.16);
    data[7] = spec.heightTintStrength !== undefined ? Math.max(0, Number(spec.heightTintStrength) || 0) : (cycle ? cycle.heightTintStrength : 0.08);
    data[8] = Math.max(0, Math.min(1, Number(ambientColor[0]) || 0));
    data[9] = Math.max(0, Math.min(1, Number(ambientColor[1]) || 0));
    data[10] = Math.max(0, Math.min(1, Number(ambientColor[2]) || 0));
    data[11] = 0;
    data[12] = normalStrength;
    data[13] = normalMode === "disabled" ? 0 : 1;
    data[14] = 0;
    data[15] = 0;
    data[16] = Math.max(0.0001, Number(cloudScale[0]) || 1);
    data[17] = cloudMaxAlpha;
    data[18] = Number(cloudScroll[0]) || 0;
    data[19] = Number(cloudScroll[1]) || 0;
    return data;
  },

  makeCloudShadowTextureData: function (cloudMap, size) {
    var mapSize = Math.max(1, Math.round(Number(size) || 1));
    var source = cloudMap instanceof Uint8Array ? cloudMap : null;
    var rgba = new Uint8Array(mapSize * mapSize * 4);

    for (var i = 0; i < mapSize * mapSize; i += 1) {
      var value = source && i < source.length ? source[i] : 0;
      var offset = i * 4;
      rgba[offset] = value;
      rgba[offset + 1] = value;
      rgba[offset + 2] = value;
      rgba[offset + 3] = 255;
    }

    return rgba;
  },

  getCloudShadowSpec: function (options) {
    var spec = options || {};
    var overlays = PS.render.environmentOverlays;
    var map = spec.cloudShadowMap || (overlays && typeof overlays.ensureCloudShadowMap === "function" ? overlays.ensureCloudShadowMap() : null);
    var size = Math.max(1, Math.round(Number(spec.cloudShadowSize || overlays && overlays.cloudShadowSize || 1)));
    var timeSeconds = spec.timeSeconds !== undefined
      ? Number(spec.timeSeconds) || 0
      : overlays && typeof overlays.getNowSeconds === "function"
        ? overlays.getNowSeconds()
        : 0;

    return {
      map: map,
      size: size,
      scale: [1, 1],
      scroll: [timeSeconds * 0.07, timeSeconds * 0.045],
      maxAlpha: 0.2
    };
  },

  ensureCloudShadowTexture: function (device, cloudSpec) {
    var spec = cloudSpec || {};
    var map = spec.map instanceof Uint8Array ? spec.map : new Uint8Array([0]);
    var size = Math.max(1, Math.round(Number(spec.size) || 1));
    var token = size + ":" + map.length + ":" + map[0] + ":" + map[Math.max(0, map.length - 1)];
    var texture;

    if (this.state.cloudShadowTexture && this.state.cloudShadowTextureToken === token) {
      return this.state.cloudShadowTexture;
    }

    texture = device.createTexture({
      label: "gbuffer-compose.cloud-shadow",
      size: { width: size, height: size },
      format: "rgba8unorm",
      usage: 4 | 2
    });

    if (device.queue && typeof device.queue.writeTexture === "function") {
      device.queue.writeTexture(
        { texture: texture },
        this.makeCloudShadowTextureData(map, size),
        { bytesPerRow: size * 4, rowsPerImage: size },
        { width: size, height: size }
      );
    }

    this.state.cloudShadowTexture = texture;
    this.state.cloudShadowTextureToken = token;
    return texture;
  },

  ensurePipeline: function (device) {
    return PS.render.ensureAlphaBlendPipeline(this, device, {
      label: "gbuffer-compose.pipeline"
    });
  },

  createBindGroup: function (device, pipeline, albedoTexture, normalHeightTexture, cloudShadowTexture) {
    return device.createBindGroup({
      label: "gbuffer-compose.bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: albedoTexture.createView() },
        { binding: 1, resource: normalHeightTexture.createView() },
        { binding: 2, resource: this.ensureSampler(device) },
        { binding: 3, resource: { buffer: this.ensureUniformBuffer(device) } },
        { binding: 4, resource: cloudShadowTexture.createView() }
      ]
    });
  },

  draw: function (options) {
    var spec = options || {};
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var device = this.getDevice(spec.device);
    var context = spec.context || (PS.gpu && PS.gpu.context);
    var encoder;
    var pipeline;
    var pass;
    var outputView;
    var cloudShadowSpec;
    var cloudShadowTexture;

    if (!device || typeof device.createCommandEncoder !== "function") {
      throw new Error("WebGPU compositor draw requires GPUDevice");
    }

    if (!spec.albedoTexture || !spec.normalHeightTexture) {
      throw new Error("WebGPU compositor draw requires G-buffer textures");
    }

    if (!spec.textureView && (!context || typeof context.getCurrentTexture !== "function")) {
      throw new Error("WebGPU compositor draw requires an output texture view or context");
    }

    pipeline = this.ensurePipeline(device);
    cloudShadowSpec = this.getCloudShadowSpec(spec);
    spec.cloudShadow = cloudShadowSpec;
    cloudShadowTexture = this.ensureCloudShadowTexture(device, cloudShadowSpec);
    device.queue.writeBuffer(this.ensureUniformBuffer(device), 0, this.makeUniformData(spec));
    encoder = spec.commandEncoder || device.createCommandEncoder({ label: "gbuffer-compose.encoder" });
    outputView = spec.textureView || context.getCurrentTexture().createView();
    pass = encoder.beginRenderPass({
      label: "gbuffer-compose.render-pass",
      colorAttachments: [{
        view: outputView,
        clearValue: { r: 8 / 255, g: 12 / 255, b: 18 / 255, a: 1 },
        loadOp: spec.loadOp || "clear",
        storeOp: "store"
      }]
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.createBindGroup(device, pipeline, spec.albedoTexture, spec.normalHeightTexture, cloudShadowTexture));
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
    return Object.assign({}, this.state);
  },

  rebuildShaders: function () {
    this.state.pipeline = null;
  }
};
