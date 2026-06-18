"use strict";
self.PS = self.PS || {};

var wasmState = {
  runtime: null,
  simBuffer: null,
  width: 0,
  height: 0
};

function postError(id, message) {
  self.postMessage({
    type: "error",
    id: id || 0,
    message: message
  });
}

function makeInlineClassicSource(source) {
  return String(source || "")
    .replace(/^\s*import\s+\{\s*PS\s*\}\s+from\s+["'][^"']+["'];\s*/m, "var PS = self.PS;\n")
    .replace(/^\s*export\s+let\s+wasm_bindgen\s*=/m, "var wasm_bindgen =")
    .replace(/\bwindow\.wasm_bindgen\s*=/g, "self.wasm_bindgen =");
}

function evaluateInlineWasmSources(message) {
  var source = [
    makeInlineClassicSource(message.wasmGlueSource),
    makeInlineClassicSource(message.wasmSidecarSource),
    makeInlineClassicSource(message.wasmBridgeSource)
  ].join("\n;\n");

  if (!source.trim()) {
    return;
  }
  self.window = self;
  Function(source + "\n//# sourceURL=js/workers/inline-wasm-worker.js")();
}

function ensureWasmRuntime(message) {
  if (wasmState.runtime && wasmState.simBuffer) {
    return;
  }

  if (message.wasmGlueSource || message.wasmSidecarSource || message.wasmBridgeSource) {
    evaluateInlineWasmSources(message);
  } else if (message.scripts && typeof importScripts === "function") {
    importScripts.apply(null, message.scripts);
  }

  if (!self.PS || !self.PS.sim || !self.PS.sim.wasmBridge) {
    throw new Error("PS.sim.wasmBridge is required before wasmInit");
  }

  wasmState.runtime = self.PS.sim.wasmBridge.instantiateFromBase64(message.wasmBase64);
  wasmState.simBuffer = self.PS.sim.wasmBridge.createBuffer(wasmState.runtime, message.width, message.height);
}

function copyElevationIntoWasm(buffer, cellCount) {
  var input;
  var index;

  if (!buffer) {
    return;
  }
  input = new Float32Array(buffer);
  for (index = 0; index < Math.min(input.length, cellCount); index += 1) {
    wasmState.simBuffer.set_elevation(index, input[index]);
  }
}

function makeElevationTransfer(cellCount) {
  var view = self.PS.sim.wasmBridge.makeElevationView(
    wasmState.simBuffer,
    wasmState.runtime.exports,
    wasmState.width,
    wasmState.height
  );
  var transferred = new Float32Array(cellCount);

  transferred.set(view.subarray(0, cellCount));
  return transferred;
}

function handleWasmInit(message) {
  var width = Math.max(1, Math.round(Number(message.width) || 1));
  var height = Math.max(1, Math.round(Number(message.height) || 1));

  wasmState.runtime = null;
  wasmState.simBuffer = null;
  wasmState.width = width;
  wasmState.height = height;
  ensureWasmRuntime({
    id: message.id,
    width: width,
    height: height,
    wasmBase64: message.wasmBase64,
    wasmGlueSource: message.wasmGlueSource,
    wasmSidecarSource: message.wasmSidecarSource,
    wasmBridgeSource: message.wasmBridgeSource,
    scripts: message.scripts
  });

  self.postMessage({
    type: "wasmReady",
    id: message.id || 0,
    width: width,
    height: height,
    cells: width * height,
    noFetch: Boolean(wasmState.runtime.noFetch),
    transfer: "transferable-array-buffer",
    crossOriginIsolated: Boolean(self.crossOriginIsolated),
    hasSharedArrayBuffer: typeof SharedArrayBuffer !== "undefined"
  });
}

function handleWasmTick(message) {
  var startedAt = performance.now();
  var cellCount;
  var elevation;

  if (!wasmState.runtime || !wasmState.simBuffer) {
    throw new Error("wasmInit must complete before wasmTick");
  }

  cellCount = wasmState.width * wasmState.height;
  copyElevationIntoWasm(message.elevation, cellCount);

  if (message.runTectonics !== false) {
    wasmState.simBuffer.run_tectonics(Math.max(0, Number(message.tectonicsDt) || 0));
  }
  if (message.runRivers !== false) {
    wasmState.simBuffer.run_d8_rivers();
  }
  if (message.erosionSteps) {
    wasmState.simBuffer.run_erosion(Math.max(0, Math.round(Number(message.erosionSteps) || 0)));
  }

  elevation = makeElevationTransfer(cellCount);
  self.postMessage({
    type: "wasmTickComplete",
    id: message.id || 0,
    width: wasmState.width,
    height: wasmState.height,
    cells: cellCount,
    workerMs: performance.now() - startedAt,
    elevation: elevation.buffer,
    transfer: "transferable-array-buffer",
    source: "wasm-linear-memory-snapshot"
  }, [elevation.buffer]);
}

self.onmessage = function(event) {
  var message = event.data || {};

  if (message.type === "ping") {
    self.postMessage({
      type: "pong",
      id: message.id || 0,
      crossOriginIsolated: Boolean(self.crossOriginIsolated),
      hasSharedArrayBuffer: typeof SharedArrayBuffer !== "undefined"
    });
    return;
  }

  if (message.type === "wasmInit") {
    try {
      handleWasmInit(message);
    } catch (error) {
      postError(message.id, error && error.message ? error.message : String(error));
    }
    return;
  }

  if (message.type === "wasmTick") {
    try {
      handleWasmTick(message);
    } catch (error) {
      postError(message.id, error && error.message ? error.message : String(error));
    }
    return;
  }

  if (message.type !== "tick") {
    postError(message.id, "Unknown worker message type");
    return;
  }

  var startedAt = performance.now();
  var count = Math.max(0, Math.round(Number(message.count) || 0));
  var width = Math.max(1, Math.round(Number(message.width) || 1));
  var height = Math.max(1, Math.round(Number(message.height) || 1));
  var dt = Math.max(0, Number(message.dt) || 0);
  var x = new Float32Array(message.x);
  var y = new Float32Array(message.y);
  var energy = new Float32Array(message.energy);
  var directionX = new Float32Array(message.directionX);
  var directionY = new Float32Array(message.directionY);
  var age = new Float32Array(message.age);
  var consumed = 0;

  for (var i = 0; i < count; i++) {
    var nextX = x[i] + directionX[i];
    var nextY = y[i] + directionY[i];

    if (nextX < 0) {
      nextX += width;
    } else if (nextX >= width) {
      nextX -= width;
    }

    if (nextY < 0) {
      nextY = 0;
      directionY[i] = 1;
    } else if (nextY >= height) {
      nextY = height - 1;
      directionY[i] = -1;
    }

    x[i] = nextX;
    y[i] = nextY;
    age[i] += 1;
    energy[i] = Math.max(0, energy[i] - 0.01 * dt);

    if (energy[i] === 0) {
      consumed++;
    }
  }

  self.postMessage({
    type: "tickComplete",
    id: message.id || 0,
    count: count,
    consumed: consumed,
    workerMs: performance.now() - startedAt,
    x: x.buffer,
    y: y.buffer,
    energy: energy.buffer,
    directionX: directionX.buffer,
    directionY: directionY.buffer,
    age: age.buffer
  }, [
    x.buffer,
    y.buffer,
    energy.buffer,
    directionX.buffer,
    directionY.buffer,
    age.buffer
  ]);
};
