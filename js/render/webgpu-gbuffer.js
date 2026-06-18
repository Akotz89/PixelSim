import { PS } from "../core/namespace.js";

PS.render = PS.render || {};

PS.render.webgpuGbuffer = PS.render.webgpuGbuffer || {
  attachments: {
    albedo: "gbuffer.albedo",
    normalHeight: "gbuffer.normal-height",
    depth: "gbuffer.depth"
  },
  state: {
    width: 0,
    height: 0,
    format: "",
    ready: false,
    resizeCount: 0,
    lastError: ""
  },

  getDevice: function (device) {
    return device || (PS.gpu && PS.gpu.device);
  },

  getFormat: function () {
    return (PS.gpu && PS.gpu.format) || "bgra8unorm";
  },

  getUsage: function () {
    return 16 | 4 | 2;
  },

  needsResize: function (target, width, height, format) {
    return !target || target.width !== width || target.height !== height || target.format !== format;
  },

  destroyAttachments: function () {
    if (PS.render.webgpuTargets) {
      PS.render.webgpuTargets.destroy(this.attachments.albedo);
      PS.render.webgpuTargets.destroy(this.attachments.normalHeight);
      PS.render.webgpuTargets.destroy(this.attachments.depth);
    }
    this.state.ready = false;
  },

  ensure: function (width, height, device) {
    var targetDevice = this.getDevice(device);
    var targetWidth = Math.max(1, Math.round(Number(width) || 1));
    var targetHeight = Math.max(1, Math.round(Number(height) || 1));
    var format = this.getFormat();
    var targets = PS.render.webgpuTargets;
    var albedo;
    var normalHeight;
    var depth;

    if (!targets || typeof targets.create !== "function") {
      throw new Error("WebGPU targets are required for G-buffer attachments");
    }

    if (!targetDevice || typeof targetDevice.createTexture !== "function") {
      throw new Error("GPUDevice.createTexture is required for G-buffer attachments");
    }

    albedo = targets.get(this.attachments.albedo);
    normalHeight = targets.get(this.attachments.normalHeight);
    depth = targets.get(this.attachments.depth);

    if (
      this.needsResize(albedo, targetWidth, targetHeight, format) ||
      this.needsResize(normalHeight, targetWidth, targetHeight, "rgba16float") ||
      this.needsResize(depth, targetWidth, targetHeight, "depth24plus")
    ) {
      this.destroyAttachments();
      albedo = null;
      normalHeight = null;
      depth = null;
    }

    if (!albedo) {
      albedo = targets.create(this.attachments.albedo, targetWidth, targetHeight, format, this.getUsage(), targetDevice);
      this.state.resizeCount += 1;
    }

    if (!normalHeight) {
      normalHeight = targets.create(this.attachments.normalHeight, targetWidth, targetHeight, "rgba16float", this.getUsage(), targetDevice);
      this.state.resizeCount += 1;
    }

    if (!depth) {
      depth = targets.create(this.attachments.depth, targetWidth, targetHeight, "depth24plus", 16, targetDevice);
      this.state.resizeCount += 1;
    }

    this.state.width = targetWidth;
    this.state.height = targetHeight;
    this.state.format = format;
    this.state.ready = true;
    this.state.lastError = "";

    return {
      albedo: albedo,
      normalHeight: normalHeight,
      depth: depth
    };
  },

  getAttachmentViews: function () {
    return {
      albedo: PS.render.webgpuTargets.getView(this.attachments.albedo),
      normalHeight: PS.render.webgpuTargets.getView(this.attachments.normalHeight),
      depth: PS.render.webgpuTargets.getView(this.attachments.depth)
    };
  },

  beginTerrainPass: function (encoder, width, height, device, options) {
    var spec = options || {};
    var attachments = this.ensure(width, height, device);
    var views = this.getAttachmentViews();
    var descriptor;

    if (!encoder || typeof encoder.beginRenderPass !== "function") {
      throw new Error("GPUCommandEncoder.beginRenderPass is required for G-buffer terrain pass");
    }

    descriptor = {
      label: spec.label || "gbuffer.terrain-pass",
      colorAttachments: [
        {
          view: views.albedo,
          clearValue: spec.clearColor || { r: 0, g: 0, b: 0, a: 0 },
          loadOp: spec.loadOp || "clear",
          storeOp: "store"
        },
        {
          view: views.normalHeight,
          clearValue: { r: 0.5, g: 0.5, b: 1, a: 0 },
          loadOp: spec.loadOp || "clear",
          storeOp: "store"
        }
      ]
    };

    if (spec.includeDepth !== false) {
      descriptor.depthStencilAttachment = {
        view: views.depth,
        depthClearValue: 1,
        depthLoadOp: spec.loadOp || "clear",
        depthStoreOp: "store"
      };
    }

    return encoder.beginRenderPass(descriptor);
  },

  getStats: function () {
    return Object.assign({}, this.state);
  },

  rebuildTextures: function () {
    this.destroyAttachments();
  }
};
