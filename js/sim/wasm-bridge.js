"use strict";
import { PS } from "../core/namespace.js";

PS.sim = PS.sim || {};

PS.sim.wasmBridge = {
  moduleName: "pixeldarium-sim",
  wasmScript: "wasm/pixeldarium-sim.js",
  wasmBinary: "wasm/pixeldarium-sim_bg.wasm",
  wasmBase64Script: "wasm/pixeldarium-sim.wasm.js",

  decodeBase64: function (base64) {
    var binary;
    var bytes;
    var i;

    if (typeof atob === "function") {
      binary = atob(base64);
      bytes = new Uint8Array(binary.length);
      for (i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(base64, "base64"));
    }

    throw new Error("Base64 decoder is required for file protocol WASM init");
  },

  getBindings: function () {
    if (typeof wasm_bindgen !== "undefined") {
      return wasm_bindgen;
    }
    if (typeof window !== "undefined" && window.wasm_bindgen) {
      return window.wasm_bindgen;
    }
    throw new Error("wasm_bindgen script must load before wasm bridge");
  },

  instantiateFromBase64: function (base64) {
    var bindings = this.getBindings();
    var bytes = this.decodeBase64(base64 || window.PIXELDARIUM_SIM_WASM_B64);
    var originalWarn = typeof console !== "undefined" && console.warn;
    var exports;

    if (originalWarn) {
      console.warn = function (message) {
        if (String(message || "").indexOf("using deprecated parameters for `initSync()`") !== -1) {
          return;
        }
        originalWarn.apply(console, arguments);
      };
    }

    try {
      exports = bindings.initSync(bytes);
    } finally {
      if (originalWarn) {
        console.warn = originalWarn;
      }
    }

    return {
      bindings: bindings,
      exports: exports,
      memory: exports.memory,
      SimBuffer: bindings.SimBuffer,
      noFetch: true
    };
  },

  createBuffer: function (runtime, width, height) {
    if (!runtime || typeof runtime.SimBuffer !== "function") {
      throw new Error("WASM runtime SimBuffer constructor is required");
    }
    return new runtime.SimBuffer(width, height);
  },

  makeElevationView: function (simBuffer, wasmExports, width, height) {
    var ptr;
    var memory;
    var cellCount = Math.max(0, Math.round(Number(width) || 0)) * Math.max(0, Math.round(Number(height) || 0));

    if (!simBuffer || typeof simBuffer.get_elevation_ptr !== "function") {
      throw new Error("WASM SimBuffer get_elevation_ptr is required");
    }

    memory = wasmExports && wasmExports.memory;
    if (!memory || !memory.buffer) {
      throw new Error("WASM memory.buffer is required for zero-copy elevation upload");
    }

    ptr = simBuffer.get_elevation_ptr();
    return new Float32Array(memory.buffer, ptr, cellCount);
  },

  uploadElevationToGpu: function (spec) {
    var device = spec && spec.device;
    var target = spec && spec.targetBuffer;
    var width = spec && spec.width;
    var height = spec && spec.height;
    var view = this.makeElevationView(spec && spec.simBuffer, spec && spec.wasmExports, width, height);

    if (!device || !device.queue || typeof device.queue.writeBuffer !== "function") {
      throw new Error("GPUDevice.queue.writeBuffer is required for WASM elevation upload");
    }
    if (!target) {
      throw new Error("targetBuffer is required for WASM elevation upload");
    }

    device.queue.writeBuffer(target, 0, view, 0, view.length);
    return {
      bytes: view.byteLength,
      cells: view.length,
      format: "r32float",
      source: "wasm-linear-memory",
      copiedTo: "gpu-buffer"
    };
  },

  getFileProtocolPlan: function () {
    return {
      noFetch: true,
      loader: "script-tag + base64 sidecar",
      scripts: [this.wasmScript, this.wasmBase64Script],
      instantiate: "WebAssembly.instantiate(Uint8Array bytes, wasm_bindgen imports)"
    };
  }
};
