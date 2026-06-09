"use strict";
PS.render = PS.render || {};

PS.render.webgpuTargets = PS.render.webgpuTargets || {
  targets: {},

  getDevice: function (device) {
    return device || (PS.gpu && PS.gpu.device);
  },

  create: function (id, width, height, format, usage, device) {
    var targetId = String(id || "").trim();
    var targetDevice = this.getDevice(device);
    var target;

    if (!targetId) {
      throw new Error("WebGPU target id is required");
    }

    if (!targetDevice || typeof targetDevice.createTexture !== "function") {
      throw new Error("GPUDevice.createTexture is required for WebGPU targets");
    }

    target = this.targets[targetId];

    if (target && target.texture && typeof target.texture.destroy === "function") {
      target.texture.destroy();
    }

    target = {
      id: targetId,
      width: Math.max(1, Math.round(Number(width) || 1)),
      height: Math.max(1, Math.round(Number(height) || 1)),
      format: format || (PS.gpu && PS.gpu.format) || "bgra8unorm",
      usage: usage || 0,
      texture: null,
      view: null
    };

    target.texture = targetDevice.createTexture({
      label: targetId,
      size: { width: target.width, height: target.height },
      format: target.format,
      usage: target.usage
    });

    this.targets[targetId] = target;
    return target;
  },

  get: function (id) {
    return this.targets[String(id || "")] || null;
  },

  getView: function (id) {
    var target = this.get(id);

    if (!target || !target.texture || typeof target.texture.createView !== "function") {
      return null;
    }

    if (!target.view) {
      target.view = target.texture.createView();
    }

    return target.view;
  },

  resize: function (id, width, height, device) {
    var target = this.get(id);

    if (!target) {
      return null;
    }

    if (target.width === Math.max(1, Math.round(Number(width) || 1)) &&
        target.height === Math.max(1, Math.round(Number(height) || 1))) {
      return target;
    }

    return this.create(target.id, width, height, target.format, target.usage, device);
  },

  destroy: function (id) {
    var targetId = String(id || "");
    var target = this.get(targetId);

    if (target && target.texture && typeof target.texture.destroy === "function") {
      target.texture.destroy();
    }

    delete this.targets[targetId];
  }
};
