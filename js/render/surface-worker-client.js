"use strict";
PS.render = PS.render || {};
PS.render.surfaceWorker = PS.render.surfaceWorker || {};

PS.render.surfaceWorker.state = {
  worker: null,
  nextId: 1,
  pending: {},
  supported: null,
  inFlight: 0,
  scheduled: 0,
  completed: 0,
  failed: 0,
  lastWorkerMs: 0,
  lastRoundTripMs: 0,
  lastError: ""
};

PS.render.surfaceWorker.subcellPackedColors = {
  waterLight: 0x8cccdc,
  waterDark: 0x02152e,
  rockLight: 0xaaa798,
  rockDark: 0x2b2d28,
  sandLight: 0xd6bd78,
  sandDark: 0x665329,
  vegLight: 0x7fa850,
  vegDark: 0x122619,
  snowLight: 0xf8feff,
  snowDark: 0x8dbed0
};

PS.render.surfaceWorker.getSubcellBasePatchSize = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);

  if (CONFIG.TILE_SIZE < 5 || sampleMeters > 5) {
    return 0;
  }

  return sampleMeters <= 1 ? 1 : 2;
};

PS.render.surfaceWorker.getSubcellBasePatchColorPacked = function (sample, baseColorPacked, localX, localY) {
  var packed = PS.render.surfaceWorker.subcellPackedColors;
  var blend = PS.render.terrain.blendPacked;
  var shade = PS.render.terrain.shadePacked;
  var detail = sample && sample.detail ? sample.detail : {};
  var strata = detail.materialStrata || {};
  var surface = detail.surface || "ground";
  var seedEast = Math.round(Number(sample && sample.surfaceSampleX) || 0);
  var seedNorth = Math.round(Number(sample && sample.surfaceSampleY) || 0);
  var noise = getDeterministicUnitNoise(
    seedEast + localX * 17,
    seedNorth - localY * 19,
    getPlanetVisualSeedOffset() + 7103 + localX * 23 + localY * 29
  );
  var grain = getDeterministicUnitNoise(
    seedEast - localY * 31,
    seedNorth + localX * 37,
    getPlanetVisualSeedOffset() + 7349 + localX * 11 + localY * 13
  );
  var roughness = clamp(Number(detail.roughness) || 0, 0, 1);
  var slope = clamp(Number(detail.slope) || 0, 0, 1);
  var granularity = clamp(Number(strata.granularity) || 0, 0, 1);
  var organicCover = clamp(Number(strata.organicCover) || 0, 0, 1);
  var rockExposure = clamp(Number(strata.rockExposure) || 0, 0, 1);
  var wetness = clamp(Number(strata.wetness) || 0, 0, 1);
  var patchShade = clamp(
    0.45 + (noise - 0.5) * (0.18 + granularity * 0.16 + roughness * 0.10) +
      (grain - 0.5) * (0.10 + slope * 0.08),
    0.18,
    0.82
  );
  var color = shade(baseColorPacked, patchShade);
  var tintAmount = clamp(0.04 + granularity * 0.08 + organicCover * 0.05 + rockExposure * 0.06 + wetness * 0.03, 0, 0.22);

  if (strata.tintColor) {
    var tintPacked = strata._tintPacked;
    if (typeof tintPacked !== "number") {
      tintPacked = PS.render.terrain.hexToPacked(strata.tintColor);
      strata._tintPacked = tintPacked;
    }
    color = blend(color, tintPacked, tintAmount);
  }

  if (surface === "open water" || surface === "deep water" || surface === "whitecap") {
    color = blend(color, noise > 0.55 ? packed.waterLight : packed.waterDark, clamp(0.08 + wetness * 0.07, 0.08, 0.18));
  } else if (surface === "rock" || surface === "stone" || surface === "ridge ice") {
    color = blend(color, noise > 0.52 ? packed.rockLight : packed.rockDark, clamp(0.08 + rockExposure * 0.10, 0.08, 0.20));
  } else if (surface === "sand" || surface === "dune") {
    color = blend(color, noise > 0.52 ? packed.sandLight : packed.sandDark, clamp(0.08 + granularity * 0.08, 0.08, 0.18));
  } else if (surface === "dense canopy" || surface === "woodland" || surface === "grass" || surface === "brush" || surface === "meadow" || surface === "clearing" || surface === "moss" || surface === "scrub") {
    color = blend(color, noise > 0.52 ? packed.vegLight : packed.vegDark, clamp(0.06 + organicCover * 0.10, 0.06, 0.20));
  } else if (surface === "snow" || surface === "ice") {
    color = blend(color, noise > 0.52 ? packed.snowLight : packed.snowDark, 0.12);
  }

  return color;
};

PS.render.surfaceWorker.getInlineWorkerSource = function () {
  return [
    "self.onmessage = " + function (event) {
      var message = event.data || {};

      if (message.type === "ping") {
        self.postMessage({ type: "pong", id: message.id || 0 });
        return;
      }

      if (message.type !== "buildSurfaceChunkBase") {
        self.postMessage({ type: "error", id: message.id || 0, message: "Unknown surface worker message type" });
        return;
      }

      var startedAt = performance.now();
      var width = Math.max(1, Math.round(Number(message.width) || 1));
      var height = Math.max(1, Math.round(Number(message.height) || 1));
      var tileSize = Math.max(1, Math.round(Number(message.tileSize) || 1));
      var cells = Array.isArray(message.cells) ? message.cells : [];
      var buffer = new ArrayBuffer(width * height * 4);
      var data = new Uint8ClampedArray(buffer);

      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i] || {};
        var pixelX = Math.max(0, Math.round(Number(cell.pixelX) || 0));
        var pixelY = Math.max(0, Math.round(Number(cell.pixelY) || 0));
        var packedColor = Math.max(0, Math.round(Number(cell.packedColor) || 0));
        var patches = Array.isArray(cell.patches) && cell.patches.length > 0
          ? cell.patches
          : [{ pixelX: 0, pixelY: 0, width: tileSize, height: tileSize, packedColor: packedColor }];

        for (var p = 0; p < patches.length; p++) {
          var patch = patches[p] || {};
          var patchColor = Math.max(0, Math.round(Number(patch.packedColor) || packedColor));
          var red = (patchColor >> 16) & 255;
          var green = (patchColor >> 8) & 255;
          var blue = patchColor & 255;
          var patchX = pixelX + Math.max(0, Math.round(Number(patch.pixelX) || 0));
          var patchY = pixelY + Math.max(0, Math.round(Number(patch.pixelY) || 0));
          var patchWidth = Math.max(1, Math.round(Number(patch.width) || tileSize));
          var patchHeight = Math.max(1, Math.round(Number(patch.height) || tileSize));

          for (var y = 0; y < patchHeight; y++) {
            var row = patchY + y;
            if (row < 0 || row >= height) { continue; }
            var offset = (row * width + patchX) * 4;
            for (var x = 0; x < patchWidth; x++) {
              if (patchX + x >= width) { break; }
              data[offset] = red;
              data[offset + 1] = green;
              data[offset + 2] = blue;
              data[offset + 3] = 255;
              offset += 4;
            }
          }
        }
      }

      self.postMessage({
        type: "surfaceChunkBase",
        id: message.id || 0,
        key: message.key || "",
        width: width,
        height: height,
        workerMs: performance.now() - startedAt,
        buffer: buffer
      }, [buffer]);
    }.toString() + ";"
  ].join("\n");
};

PS.render.surfaceWorker.ensure = function () {
  var state = PS.render.surfaceWorker.state;

  if (CONFIG.PLANET_SURFACE_WORKER_CHUNKS === false || typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
    state.supported = false;
    return false;
  }

  if (state.worker) {
    return true;
  }

  try {
    var source = PS.render.surfaceWorker.getInlineWorkerSource();
    var url = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));

    state.worker = new Worker(url);
    URL.revokeObjectURL(url);
    state.worker.onmessage = PS.render.surfaceWorker.handleMessage;
    state.worker.onerror = function (event) {
      state.failed++;
      state.lastError = event && event.message ? event.message : "surface worker error";
      state.supported = false;
    };
    state.supported = true;
    return true;
  } catch (error) {
    state.supported = false;
    state.lastError = String(error && error.message ? error.message : error);
    return false;
  }
};

PS.render.surfaceWorker.makeChunkPayload = function (address) {
  var chunkPixels = address.chunkSamples * CONFIG.TILE_SIZE;
  var cellCount = address.chunkSamples * address.chunkSamples;
  var cells = [];
  var cellCache = new Array(cellCount);

  for (var y = 0; y < address.chunkSamples; y++) {
    for (var x = 0; x < address.chunkSamples; x++) {
      var sample = getPlanetSurfaceChunkSampleAtAddress(address, x, y);
      var screenX = x * CONFIG.TILE_SIZE;
      var screenY = (address.chunkSamples - 1 - y) * CONFIG.TILE_SIZE;
      var packedColor = PS.render.surfaceColor.getSurfaceColorPacked(sample);
      var patchSize = PS.render.surfaceWorker.getSubcellBasePatchSize(sample);
      var patches = [];
      var index = y * address.chunkSamples + x;

      cellCache[index] = {
        sample: sample,
        packedColor: packedColor,
        screenX: screenX,
        screenY: screenY
      };

      if (patchSize > 0) {
        for (var py = 0; py < CONFIG.TILE_SIZE; py += patchSize) {
          for (var px = 0; px < CONFIG.TILE_SIZE; px += patchSize) {
            patches.push({
              pixelX: px,
              pixelY: py,
              width: Math.min(patchSize, CONFIG.TILE_SIZE - px),
              height: Math.min(patchSize, CONFIG.TILE_SIZE - py),
              packedColor: PS.render.surfaceWorker.getSubcellBasePatchColorPacked(sample, packedColor, px, py)
            });
          }
        }
      }

      cells.push({
        pixelX: screenX,
        pixelY: screenY,
        packedColor: packedColor,
        patches: patches
      });
    }
  }

  return {
    width: chunkPixels,
    height: chunkPixels,
    cellCache: cellCache,
    cells: cells
  };
};

PS.render.surfaceWorker.requestChunk = function (address) {
  var state = PS.render.surfaceWorker.state;
  var renderKey = getLocalSurfaceRenderChunkKey(address);
  var maxInFlight = Math.max(1, Math.round(Number(CONFIG.PLANET_SURFACE_WORKER_CHUNKS_PER_PASS) || 1));

  if (!PS.render.surfaceWorker.ensure() || state.inFlight >= maxInFlight || state.pending[renderKey]) {
    return false;
  }

  var payload = PS.render.surfaceWorker.makeChunkPayload(address);
  var id = state.nextId++;

  state.pending[id] = {
    key: renderKey,
    address: address,
    cellCache: payload.cellCache,
    sentAt: performance.now()
  };
  state.pending[renderKey] = true;
  state.inFlight++;
  state.scheduled++;

  state.worker.postMessage({
    type: "buildSurfaceChunkBase",
    id: id,
    key: renderKey,
    width: payload.width,
    height: payload.height,
    tileSize: CONFIG.TILE_SIZE,
    cells: payload.cells
  });
  return true;
};

PS.render.surfaceWorker.handleMessage = function (event) {
  var state = PS.render.surfaceWorker.state;
  var message = event.data || {};
  var pending = state.pending[message.id];

  if (message.type === "error") {
    state.failed++;
    state.lastError = message.message || "surface worker error";
    if (pending) {
      delete state.pending[pending.key];
      delete state.pending[message.id];
      state.inFlight = Math.max(0, state.inFlight - 1);
    }
    return;
  }

  if (message.type !== "surfaceChunkBase" || !pending) {
    return;
  }

  delete state.pending[pending.key];
  delete state.pending[message.id];
  state.inFlight = Math.max(0, state.inFlight - 1);
  state.completed++;
  state.lastWorkerMs = Number(message.workerMs) || 0;
  state.lastRoundTripMs = performance.now() - pending.sentAt;

  var renderChunk = {
    readyState: "ready",
    source: "worker",
    address: pending.address,
    width: message.width,
    height: message.height,
    cellCache: pending.cellCache,
    workerMs: state.lastWorkerMs,
    roundTripMs: state.lastRoundTripMs,
    promotedAt: world ? world.tick : 0
  };

  if (renderChunk) {
    PS.render.surfaceRender.storeCompletedChunk(pending.address, renderChunk);
    PS.render.surfaceRender.invalidateTerrainCache();
    world.needsRender = true;
  } else {
    state.failed++;
  }
};

PS.render.surfaceWorker.getStats = function () {
  var state = PS.render.surfaceWorker.state;

  return {
    supported: state.supported,
    inFlight: state.inFlight,
    scheduled: state.scheduled,
    completed: state.completed,
    failed: state.failed,
    lastWorkerMs: state.lastWorkerMs,
    lastRoundTripMs: state.lastRoundTripMs,
    lastError: state.lastError
  };
};
