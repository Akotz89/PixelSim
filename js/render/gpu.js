"use strict";
PS.gpu = PS.gpu || {};

PS.gpu.required = true;
PS.gpu.status = PS.gpu.status || "idle";
PS.gpu.isWebGPU = false;
PS.gpu.adapter = null;
PS.gpu.device = null;
PS.gpu.queue = null;
PS.gpu.canvas = null;
PS.gpu.context = null;
PS.gpu.format = "";
PS.gpu.initAttempts = 0;
PS.gpu.error = null;

PS.gpu.getNotice = function () {
  return document.getElementById("webgpu-required-notice");
};

PS.gpu.showRequiredNotice = function (message) {
  var notice = PS.gpu.getNotice();
  var loadingText = document.getElementById("loading-progress-text");

  if (!notice) {
    notice = document.createElement("section");
    notice.id = "webgpu-required-notice";
    notice.setAttribute("role", "alert");
    notice.style.position = "fixed";
    notice.style.inset = "0";
    notice.style.zIndex = "10000";
    notice.style.display = "grid";
    notice.style.placeItems = "center";
    notice.style.padding = "24px";
    notice.style.background = "#07090c";
    notice.style.color = "#f2f5f8";
    notice.style.font = "16px system-ui, sans-serif";
    notice.style.textAlign = "center";
    document.body.appendChild(notice);
  }

  notice.textContent = message;

  if (loadingText) {
    loadingText.textContent = message;
  }
};

PS.gpu.failRequired = function (message) {
  var requiredMessage = String(message || "WebGPU is required.");
  var error;

  if (requiredMessage.indexOf("WebGPU Required") < 0) {
    requiredMessage = "WebGPU Required: " + requiredMessage;
  }

  error = new Error(requiredMessage);

  PS.gpu.status = "failed";
  PS.gpu.isWebGPU = false;
  PS.gpu.error = requiredMessage;
  PS.gpu.showRequiredNotice(requiredMessage);

  if (PS.runtime && typeof PS.runtime.recordError === "function") {
    PS.runtime.recordError("webgpu.required", { message: requiredMessage });
  }

  throw error;
};

PS.gpu.getCanvas = function (canvas) {
  return canvas || document.getElementById("game-webgpu");
};

PS.gpu.setPreferredFormat = function () {
  PS.gpu.format = navigator.gpu && typeof navigator.gpu.getPreferredCanvasFormat === "function"
    ? navigator.gpu.getPreferredCanvasFormat()
    : "bgra8unorm";

  return PS.gpu.format;
};

PS.gpu.configureContext = function (canvas) {
  var targetCanvas = PS.gpu.getCanvas(canvas);

  if (!targetCanvas || typeof targetCanvas.getContext !== "function") {
    PS.gpu.failRequired("WebGPU canvas #game-webgpu is unavailable.");
  }

  PS.gpu.context = targetCanvas.getContext("webgpu");

  if (!PS.gpu.context || typeof PS.gpu.context.configure !== "function") {
    PS.gpu.failRequired("WebGPU canvas context could not be created.");
  }

  PS.gpu.canvas = targetCanvas;
  PS.gpu.setPreferredFormat();

  PS.gpu.context.configure({
    device: PS.gpu.device,
    format: PS.gpu.format,
    alphaMode: "opaque"
  });

  return PS.gpu.context;
};

PS.gpu.handleDeviceLost = function (info) {
  var reason = info && info.reason ? String(info.reason) : "unknown";

  PS.gpu.status = "lost";
  PS.gpu.error = "WebGPU device lost: " + reason;

  if (typeof world !== "undefined" && world) {
    world.isPaused = true;
  }

  if (PS.world) {
    PS.world.isPaused = true;
  }

  if (PS.events && typeof PS.events.emit === "function") {
    PS.events.emit(PS.events.types.RENDER_CONTEXT_LOST, { reason: reason });
  }

  if (PS.gpu.shouldRecoverDeviceLost(reason)) {
    PS.gpu.initialize(PS.gpu.canvas);
  }
};

PS.gpu.shouldRecoverDeviceLost = function (reason) {
  var lossReason = String(reason || "unknown");
  var visibility = typeof document !== "undefined" ? String(document.visibilityState || "visible") : "visible";

  if (!PS.gpu.canvas) {
    return false;
  }

  if (lossReason !== "destroyed") {
    return true;
  }

  return visibility !== "hidden";
};

PS.gpu.initialize = function (canvas) {
  var gpu = typeof navigator !== "undefined" ? navigator.gpu : null;

  PS.gpu.initAttempts += 1;
  PS.gpu.status = "initializing";
  PS.gpu.error = null;

  if (!gpu || typeof gpu.requestAdapter !== "function") {
    return Promise.resolve().then(function () {
      PS.gpu.failRequired("WebGPU Required: this browser does not expose navigator.gpu.");
    });
  }

  return gpu.requestAdapter().then(function (adapter) {
    if (!adapter || typeof adapter.requestDevice !== "function") {
      PS.gpu.failRequired("WebGPU Required: no compatible GPU adapter is available.");
    }

    PS.gpu.adapter = adapter;
    return adapter.requestDevice();
  }).then(function (device) {
    if (!device) {
      PS.gpu.failRequired("WebGPU Required: device creation failed.");
    }

    PS.gpu.device = device;
    PS.gpu.queue = device.queue || null;
    PS.gpu.setPreferredFormat();
    PS.gpu.configureContext(canvas);

    PS.gpu.isWebGPU = true;
    PS.gpu.status = "ready";

    if (PS.events && typeof PS.events.emit === "function") {
      PS.events.emit(PS.events.types.RENDER_BACKEND_READY, { backend: "webgpu" });
    }

    if (device.lost && typeof device.lost.then === "function") {
      device.lost.then(PS.gpu.handleDeviceLost);
    }

    return PS.gpu;
  }).catch(function (error) {
    if (PS.gpu.status === "failed") {
      throw error;
    }
    PS.gpu.failRequired(error && error.message ? error.message : String(error));
  });
};
