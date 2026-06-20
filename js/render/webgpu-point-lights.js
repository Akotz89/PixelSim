import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { lightingCycle } from "./lighting-cycle.js";
import { canvas } from "../ui/dom-refs.js";

PS.render = PS.render || {};

export var webgpuPointLightsState = PS.render.webgpuPointLights && PS.render.webgpuPointLights.state
  ? PS.render.webgpuPointLights.state
  : null;

PS.render.webgpuPointLights = Object.assign(PS.render.webgpuPointLights || {}, {
  shaderName: "point-light",
  shaderPath: "shaders/point-light.wgsl",
  strideFloats: 8,
  maxLights: 64,
  state: Object.assign({
    pipeline: null,
    sampler: null,
    uniformBuffer: null,
    lightBuffer: null,
    lightCapacity: 0,
    queuedLights: [],
    drawCount: 0,
    submittedLights: 0,
    culledLights: 0,
    queuedLightCount: 0,
    lastFrameMs: 0,
    lastError: ""
  }, webgpuPointLightsState || {}),

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
        label: "point-light.sampler",
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
        label: "point-light.uniforms",
        size: 16,
        usage: 64 | 8
      });
    }

    return this.state.uniformBuffer;
  },

  ensureLightBuffer: function (device, count) {
    var lightCount = Math.max(1, Math.min(this.maxLights, Math.ceil(Number(count) || 1)));
    var neededBytes = lightCount * this.strideFloats * Float32Array.BYTES_PER_ELEMENT;

    if (!this.state.lightBuffer || this.state.lightCapacity < lightCount) {
      this.state.lightCapacity = Math.max(lightCount, this.maxLights);
      this.state.lightBuffer = device.createBuffer({
        label: "point-light.instances.storage",
        size: this.state.lightCapacity * this.strideFloats * Float32Array.BYTES_PER_ELEMENT,
        usage: 128 | 8
      });
    }

    return this.state.lightBuffer;
  },

  ensurePipeline: function (device) {
    var module;

    if (!this.state.pipeline) {
      module = PS.render.wgslShaders.getShaderModule(device, this.shaderName);
      this.state.pipeline = PS.render.wgslShaders.getRenderPipeline({
        label: "point-light.pipeline",
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
                srcFactor: "one",
                dstFactor: "one",
                operation: "add"
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one",
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

  normalizeColor: function (color) {
    var value = color || {};

    if (Array.isArray(value)) {
      return [
        Number(value[0]) || 1,
        Number(value[1]) || 1,
        Number(value[2]) || 1
      ];
    }

    return [
      Number(value.r !== undefined ? value.r : value.red) || 1,
      Number(value.g !== undefined ? value.g : value.green) || 1,
      Number(value.b !== undefined ? value.b : value.blue) || 1
    ];
  },

  normalizeLight: function (light) {
    var color = this.normalizeColor(light && light.color);

    return {
      x: Number(light && light.x) || 0,
      y: Number(light && light.y) || 0,
      radius: Math.max(1, Number(light && light.radius) || 1),
      color: color,
      intensity: Math.max(0, Number(light && light.intensity) || 1),
      kind: light && light.kind ? String(light.kind) : ""
    };
  },

  queueLight: function (x, y, radius, color, intensity, kind) {
    var light = this.normalizeLight({
      x: x,
      y: y,
      radius: radius,
      color: color,
      intensity: intensity,
      kind: kind
    });

    this.state.queuedLights.push(light);
    this.state.queuedLightCount = this.state.queuedLights.length;
    return light;
  },

  takeQueuedLights: function () {
    var lights = this.state.queuedLights.slice();

    this.state.queuedLights.length = 0;
    this.state.queuedLightCount = 0;
    return lights;
  },

  cullLights: function (lights, width, height) {
    var source = Array.isArray(lights) ? lights : [];
    var visible = [];
    var culled = 0;

    for (var i = 0; i < source.length; i += 1) {
      var light = this.normalizeLight(source[i]);

      if (
        light.radius <= 0 ||
        light.x + light.radius < 0 ||
        light.y + light.radius < 0 ||
        light.x - light.radius > width ||
        light.y - light.radius > height
      ) {
        culled += 1;
        continue;
      }

      if (visible.length >= this.maxLights) {
        culled += 1;
        continue;
      }

      visible.push(light);
    }

    return {
      visible: visible,
      culled: culled
    };
  },

  getLightingState: function (options) {
    var spec = options || {};

    if (spec.lightingCycleState) {
      return spec.lightingCycleState;
    }

    if (lightingCycle && typeof lightingCycle.getState === "function") {
      return lightingCycle.getState(spec);
    }

    return null;
  },

  getSceneExposure: function (options) {
    var spec = options || {};
    var cycle = this.getLightingState(spec);
    var ambient = spec.ambient !== undefined
      ? Number(spec.ambient)
      : (cycle && cycle.ambient !== undefined ? Number(cycle.ambient) : 1);
    var scale = spec.pointLightExposureScale !== undefined
      ? Number(spec.pointLightExposureScale)
      : ambient;

    if (!Number.isFinite(scale)) {
      scale = 1;
    }

    return Math.max(0, Math.min(1, scale));
  },

  writeUniforms: function (device, width, height, options) {
    var exposure = this.getSceneExposure(options);
    var cycle = this.getLightingState(options);
    var ambient = options && options.ambient !== undefined
      ? Number(options.ambient)
      : (cycle && cycle.ambient !== undefined ? Number(cycle.ambient) : exposure);

    if (!Number.isFinite(ambient)) {
      ambient = exposure;
    }

    device.queue.writeBuffer(
      this.ensureUniformBuffer(device),
      0,
      new Float32Array([
        Math.max(1, Number(width) || 1),
        Math.max(1, Number(height) || 1),
        exposure,
        Math.max(0, Math.min(1, ambient))
      ])
    );
  },

  writeLights: function (device, lights) {
    var buffer = this.ensureLightBuffer(device, lights.length);
    var data = new Float32Array(Math.max(1, lights.length) * this.strideFloats);

    for (var i = 0; i < lights.length; i += 1) {
      var light = lights[i];
      var offset = i * this.strideFloats;

      data[offset] = light.x;
      data[offset + 1] = light.y;
      data[offset + 2] = light.radius;
      data[offset + 3] = 0;
      data[offset + 4] = light.color[0];
      data[offset + 5] = light.color[1];
      data[offset + 6] = light.color[2];
      data[offset + 7] = light.intensity;
    }

    device.queue.writeBuffer(buffer, 0, data, 0, lights.length * this.strideFloats);
    return buffer;
  },

  createBindGroup: function (device, pipeline, albedoTexture, normalHeightTexture, lightBuffer) {
    return device.createBindGroup({
      label: "point-light.bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: albedoTexture.createView() },
        { binding: 1, resource: normalHeightTexture.createView() },
        { binding: 2, resource: this.ensureSampler(device) },
        { binding: 3, resource: { buffer: this.ensureUniformBuffer(device) } },
        { binding: 4, resource: { buffer: lightBuffer } }
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
    var cullResult = this.cullLights(spec.lights || [], width, height);
    var lights = cullResult.visible;
    var gbuffer;
    var pipeline;
    var encoder;
    var outputView;
    var pass;
    var lightBuffer;

    this.state.culledLights = cullResult.culled;
    this.state.submittedLights = lights.length;

    if (lights.length <= 0) {
      this.state.lastError = "";
      return false;
    }

    if (!device || typeof device.createCommandEncoder !== "function") {
      throw new Error("WebGPU point light draw requires GPUDevice");
    }

    gbuffer = PS.render.webgpuGbuffer && typeof PS.render.webgpuGbuffer.ensure === "function"
      ? PS.render.webgpuGbuffer.ensure(width, height, device)
      : null;

    if (!gbuffer || !gbuffer.albedo || !gbuffer.normalHeight) {
      throw new Error("WebGPU point light draw requires G-buffer attachments");
    }

    if (!spec.textureView && (!context || typeof context.getCurrentTexture !== "function")) {
      throw new Error("WebGPU point light draw requires an output texture view or context");
    }

    pipeline = this.ensurePipeline(device);
    this.writeUniforms(device, width, height, spec);
    lightBuffer = this.writeLights(device, lights);
    encoder = spec.commandEncoder || device.createCommandEncoder({ label: "point-light.encoder" });
    outputView = spec.textureView || context.getCurrentTexture().createView();
    pass = encoder.beginRenderPass({
      label: "point-light.render-pass",
      colorAttachments: [{
        view: outputView,
        loadOp: spec.loadOp || "load",
        storeOp: "store"
      }]
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.createBindGroup(device, pipeline, gbuffer.albedo.texture, gbuffer.normalHeight.texture, lightBuffer));
    pass.draw(4, lights.length, 0, 0);
    pass.end();

    if (!spec.commandEncoder) {
      device.queue.submit([encoder.finish()]);
    }

    this.state.drawCount += 1;
    this.state.lastFrameMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    this.state.lastError = "";
    return true;
  },

  scaleLights: function (lights, scale) {
    var value = Number(scale);
    var list = Array.isArray(lights) ? lights : [];

    if (!Number.isFinite(value)) {
      value = 1;
    }

    value = Math.max(0, Math.min(1, value));

    if (value <= 0 || list.length <= 0) {
      return [];
    }

    if (value >= 0.999) {
      return list;
    }

    return list.map(function (light) {
      return Object.assign({}, light, {
        radius: Math.max(1, Number(light.radius) || 1) * value,
        intensity: Math.max(0, Number(light.intensity) || 0) * value
      });
    });
  },

  drawQueued: function (options) {
    var spec = options || {};
    var scale = spec.pointLightScale !== undefined ? spec.pointLightScale : 1;
    var lights = this.scaleLights(this.takeQueuedLights(), scale);

    if (lights.length <= 0) {
      this.state.submittedLights = 0;
      this.state.lastError = "";
      return false;
    }

    return this.draw(Object.assign({}, spec, { lights: lights }));
  },

  getStats: function () {
    return {
      drawCount: this.state.drawCount,
      submittedLights: this.state.submittedLights,
      culledLights: this.state.culledLights,
      queuedLightCount: this.state.queuedLightCount,
      lastFrameMs: this.state.lastFrameMs,
      lastError: this.state.lastError
    };
  },

  rebuildShaders: function () {
    this.state.pipeline = null;
  }
});
