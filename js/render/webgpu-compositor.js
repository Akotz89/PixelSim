PS.render = PS.render || {};

PS.render.webgpuCompositor = PS.render.webgpuCompositor || {
  shaderName: "gbuffer-compose",
  shaderPath: "shaders/gbuffer-compose.wgsl",
  state: {
    pipeline: null,
    sampler: null,
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
        magFilter: "nearest",
        minFilter: "nearest",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge"
      });
    }

    return this.state.sampler;
  },

  ensurePipeline: function (device) {
    var module;

    if (!this.state.pipeline) {
      module = PS.render.wgslShaders.getShaderModule(device, this.shaderName);
      this.state.pipeline = PS.render.wgslShaders.getRenderPipeline({
        label: "gbuffer-compose.pipeline",
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

  createBindGroup: function (device, pipeline, albedoTexture, normalHeightTexture) {
    return device.createBindGroup({
      label: "gbuffer-compose.bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: albedoTexture.createView() },
        { binding: 1, resource: normalHeightTexture.createView() },
        { binding: 2, resource: this.ensureSampler(device) }
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
    pass.setBindGroup(0, this.createBindGroup(device, pipeline, spec.albedoTexture, spec.normalHeightTexture));
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
