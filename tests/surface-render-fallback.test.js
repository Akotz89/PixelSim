require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/render/surface-render-cache.js"), "utf8");

function makeAddress(zoomLevel, chunkX, chunkY) {
  return {
    zoomLevel,
    scaleName: "z" + zoomLevel,
    sampleMeters: Math.pow(2, 3 - zoomLevel),
    chunkSamples: 8,
    chunkX,
    chunkY,
    sampleEast: chunkX * 8,
    sampleNorth: chunkY * 8,
    chunkKey: [zoomLevel, Math.pow(2, 3 - zoomLevel), 8, chunkX, chunkY].join(":")
  };
}

const rootAddress = makeAddress(0, 0, 0);
const regionAddress = makeAddress(1, 1, 1);
const localAddress = makeAddress(2, 2, 2);
const detailAddress = makeAddress(3, 4, 4);

const context = {
  PS: {
    render: {
      surface: {
        getChunkParentAddress(address, parentZoomLevel) {
          if (!address || parentZoomLevel < 0 || parentZoomLevel >= address.zoomLevel) return null;
          var zoomDelta = address.zoomLevel - parentZoomLevel;
          var divisor = Math.pow(2, zoomDelta);
          return makeAddress(
            parentZoomLevel,
            Math.floor(address.chunkX / divisor),
            Math.floor(address.chunkY / divisor)
          );
        }
      },
      surfaceRender: {}
    }
  },
  CONFIG: {
    PLANET_SURFACE_RENDER_CHUNK_CACHE_LIMIT: 16,
    PLANET_SURFACE_WORKER_CHUNKS: false
  },
  world: {
    tick: 42,
    organisms: [],
    speed: 1,
    updateMs: 0,
    maxUpdateMs: 0,
    fps: 60,
    isCameraInteracting: false,
    planetView: { zoomLevel: 3 }
  },
  getPlanetView() {
    return this.world.planetView;
  },
  Object,
  String,
  Number,
  Boolean,
  Array,
  Math,
  console
};

vm.createContext(context);
vm.runInContext(source, context, { filename: "js/render/surface-render-cache.js" });

function readyChunk(address, sourceName) {
  return {
    readyState: "ready",
    source: sourceName || "test",
    address,
    width: 8,
    height: 8,
    cellCache: [{ id: address.chunkKey }],
    canvas: { id: address.chunkKey },
    promotedAt: 7
  };
}

const surfaceRender = context.PS.render.surfaceRender;

surfaceRender.resetChunkCache();
assert.strictEqual(surfaceRender.getChunk(detailAddress, false), null, "missing child without cached lineage should return null, not a blank placeholder");

surfaceRender.storeCompletedChunk(rootAddress, readyChunk(rootAddress, "root"));
surfaceRender.storeCompletedChunk(regionAddress, readyChunk(regionAddress, "region"));

const disabledFallback = surfaceRender.getChunk(detailAddress, false);
assert.ok(disabledFallback, "generation-disabled child lookup should return cached parent fallback");
assert.strictEqual(disabledFallback.readyState, "fallback", "generation-disabled fallback should be marked as fallback");
assert.strictEqual(disabledFallback.isFallback, true, "fallback metadata should be explicit");
assert.strictEqual(disabledFallback.address.chunkKey, regionAddress.chunkKey, "nearest cached parent should be used before coarser ancestors");
assert.strictEqual(disabledFallback.requestedAddress, detailAddress, "fallback should preserve requested child address");
assert.strictEqual(disabledFallback.fallbackZoomLevel, regionAddress.zoomLevel, "fallback zoom should be reported");
assert.strictEqual(disabledFallback.requestedZoomLevel, detailAddress.zoomLevel, "requested zoom should be reported");
assert.deepStrictEqual(disabledFallback.cellCache, [{ id: regionAddress.chunkKey }], "fallback should reuse the cached parent cell data");

const fallbackStats = surfaceRender.getCacheStats();
assert.strictEqual(fallbackStats.generatedChunks, 2, "generation-disabled fallback should not generate a child chunk");
assert.ok(fallbackStats.lastFallbackChunks >= 1, "fallback usage should be counted");

surfaceRender.resetChunkCache();
surfaceRender.storeCompletedChunk(rootAddress, readyChunk(rootAddress, "root"));
for (let zoomLevel = 1; zoomLevel <= 8; zoomLevel += 1) {
  const childCoord = Math.pow(2, zoomLevel) - 1;
  const zoomAddress = makeAddress(zoomLevel, childCoord, childCoord);
  const zoomFallback = surfaceRender.getChunk(zoomAddress, false);
  assert.ok(zoomFallback && zoomFallback.isFallback, "zoom " + zoomLevel + " should use cached lineage fallback");
  assert.strictEqual(zoomFallback.fallbackZoomLevel, 0, "zoom " + zoomLevel + " should fall back to cached root when no nearer parent exists");
}

const perfAddress = makeAddress(8, 128, 128);
const perfIterations = 2000;
const startedAt = process.hrtime.bigint();
for (let i = 0; i < perfIterations; i += 1) {
  surfaceRender.findFallbackChunk(perfAddress);
}
const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
assert.ok(elapsedMs / perfIterations < 0.1, "lineage fallback lookup should stay below 0.1ms per missing chunk");

context.CONFIG.PLANET_SURFACE_WORKER_CHUNKS = true;
context.PS.render.surfaceWorker = {
  requested: [],
  requestChunk(address) {
    this.requested.push(address.chunkKey);
    return true;
  },
  makeChunkPayload() {
    throw new Error("worker-pending path should not sync-generate");
  }
};

const pendingFallback = surfaceRender.getChunk(detailAddress, true);
assert.ok(pendingFallback && pendingFallback.isFallback, "worker-pending child should draw cached parent fallback");
assert.strictEqual(context.PS.render.surfaceWorker.requested.length, 1, "first pending lookup should enqueue child generation");
const repeatedPendingFallback = surfaceRender.getChunk(detailAddress, true);
assert.ok(repeatedPendingFallback && repeatedPendingFallback.isFallback, "repeated pending lookup should keep drawing fallback");
assert.strictEqual(context.PS.render.surfaceWorker.requested.length, 1, "repeated pending lookup should not enqueue duplicate worker requests");

surfaceRender.resetChunkCache();
context.CONFIG.PLANET_SURFACE_WORKER_CHUNKS = false;
context.PS.render.surfaceWorker = {
  requestChunk() {
    return false;
  },
  makeChunkPayload(address) {
    return {
      width: 8,
      height: 8,
      cellCache: [{ id: "generated:" + address.chunkKey }]
    };
  }
};

surfaceRender.storeCompletedChunk(regionAddress, readyChunk(regionAddress, "region"));
const readyChild = surfaceRender.getChunk(detailAddress, true);
assert.ok(readyChild && readyChild.readyState === "ready", "ready generated child should win over parent fallback");
assert.strictEqual(readyChild.isFallback, undefined, "ready generated child should not be marked as fallback");
assert.strictEqual(readyChild.address, detailAddress, "ready generated child should preserve requested address");
assert.strictEqual(surfaceRender.getChunk(detailAddress, true), readyChild, "ready generated child should be reused on later lookups");

const terrainSource = fs.readFileSync(path.join(root, "js/render/terrain.js"), "utf8");
assert.strictEqual(
  terrainSource.indexOf("queueReadyChunk(fineAddress, fallbackChunk"),
  -1,
  "local tilemap rendering should not smear parent fallback cells into missing child chunks"
);
const stableUnderlaySource = terrainSource.slice(
  terrainSource.indexOf("PS.render.terrain.drawStableUnderlay"),
  terrainSource.indexOf("PS.render.terrain.drawLocalSurface")
);
assert.strictEqual(
  stableUnderlaySource.indexOf("world.isCameraInteracting"),
  -1,
  "stable terrain underlay must not be disabled during camera interaction"
);
const terrainDrawSource = terrainSource.slice(
  terrainSource.indexOf("PS.render.terrain.draw = function"),
  terrainSource.indexOf("PS.render.terrain.advanceSurfaceWork")
);
assert.strictEqual(
  terrainDrawSource.indexOf("&& !interactiveUnderlay"),
  -1,
  "terrain draw must keep stable parent underlay visible while camera interaction streams child chunks"
);
assert.ok(
  terrainSource.indexOf("lastHiddenReadyChunks") >= 0,
  "local tilemap rendering should report ready child chunks hidden behind parent underlay"
);
assert.ok(
  terrainSource.indexOf("lastVisibleCoverageComplete") >= 0,
  "local tilemap rendering should expose visible child coverage completeness"
);
assert.ok(
  terrainSource.indexOf("coveredByUnderlayChunks") >= 0,
  "local tilemap rendering should count chunks protected by stable underlay"
);

console.log("surface render fallback checks passed");
