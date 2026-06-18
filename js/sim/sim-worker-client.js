"use strict";
import { PS } from "../core/namespace.js";

PS.sim = PS.sim || {};

PS.sim.simWorkerClient = {
  createBlobWorker: function (source) {
    var blob;
    var url;

    if (typeof Worker !== "function" || typeof Blob !== "function" || !window.URL || typeof window.URL.createObjectURL !== "function") {
      throw new Error("Worker, Blob, and URL.createObjectURL are required for the simulation worker client");
    }
    if (!source) {
      throw new Error("Worker source is required for blob worker creation");
    }

    blob = new Blob([source], { type: "application/javascript" });
    url = window.URL.createObjectURL(blob);
    return {
      worker: new Worker(url),
      url: url,
      revoke: function () {
        window.URL.revokeObjectURL(url);
      }
    };
  },

  createRequestClient: function (worker) {
    var nextId = 1;
    var pending = {};

    if (!worker || typeof worker.postMessage !== "function") {
      throw new Error("Worker instance is required");
    }

    worker.onmessage = function (event) {
      var message = event.data || {};
      var slot = pending[message.id];

      if (!slot) {
        return;
      }
      delete pending[message.id];
      if (message.type === "error") {
        slot.reject(new Error(message.message || "Simulation worker error"));
        return;
      }
      slot.resolve(message);
    };

    worker.onerror = function (event) {
      Object.keys(pending).forEach(function (id) {
        pending[id].reject(new Error(event.message || "Simulation worker error"));
        delete pending[id];
      });
    };

    return {
      request: function (message, transfer) {
        var id = nextId;
        nextId += 1;
        message = message || {};
        message.id = id;
        return new Promise(function (resolve, reject) {
          pending[id] = { resolve: resolve, reject: reject };
          worker.postMessage(message, transfer || []);
        });
      },

      terminate: function () {
        if (typeof worker.terminate === "function") {
          worker.terminate();
        }
      }
    };
  },

  makeWasmInitMessage: function (spec) {
    spec = spec || {};
    return {
      type: "wasmInit",
      width: Math.max(1, Math.round(Number(spec.width) || 1)),
      height: Math.max(1, Math.round(Number(spec.height) || 1)),
      wasmGlueSource: spec.wasmGlueSource,
      wasmSidecarSource: spec.wasmSidecarSource,
      wasmBridgeSource: spec.wasmBridgeSource,
      wasmBase64: spec.wasmBase64,
      scripts: spec.scripts
    };
  },

  makeWasmTickMessage: function (spec) {
    spec = spec || {};
    return {
      type: "wasmTick",
      elevation: spec.elevation,
      runTectonics: spec.runTectonics,
      tectonicsDt: spec.tectonicsDt,
      runRivers: spec.runRivers,
      erosionSteps: spec.erosionSteps
    };
  },

  makeElevationResultView: function (result) {
    if (!result || !result.elevation) {
      throw new Error("WASM worker elevation result buffer is required");
    }
    return new Float32Array(result.elevation, 0, Math.max(0, Math.round(Number(result.cells) || 0)));
  },

  uploadElevationResultToGpu: function (spec) {
    var device = spec && spec.device;
    var target = spec && spec.targetBuffer;
    var result = spec && spec.result;
    var view = this.makeElevationResultView(result);

    if (!device || !device.queue || typeof device.queue.writeBuffer !== "function") {
      throw new Error("GPUDevice.queue.writeBuffer is required for worker elevation upload");
    }
    if (!target) {
      throw new Error("targetBuffer is required for worker elevation upload");
    }

    device.queue.writeBuffer(target, 0, view, 0, view.length);
    return {
      bytes: view.byteLength,
      cells: view.length,
      format: "r32float",
      source: result.source || "worker-transferable-array-buffer",
      transfer: result.transfer || "transferable-array-buffer",
      copiedTo: "gpu-buffer"
    };
  }
};
