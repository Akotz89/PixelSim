"use strict";
PS.render = PS.render || {};
PS.render.surfaceRender = PS.render.surfaceRender || {};

PS.render.surfaceRender.createCacheState = function () {
  return {
    chunks: {},
    pendingChunks: {},
    placeholderColors: {},
    placeholderColorOrder: [],
    placeholderPreviews: {},
    placeholderPreviewOrder: [],
    dirtyChunks: {},
    order: [],
    stats: {
      hits: 0,
      misses: 0,
      generatedChunks: 0,
      evictions: 0,
      lastVisibleChunks: 0,
      lastVisibleQueueChunks: 0,
      lastPrefetchQueueChunks: 0,
      lastVisibleCandidateChunks: 0,
      lastWorkingSetLimit: 0,
      lastCulledChunks: 0,
      lastPendingChunks: 0,
      lastGeneratedThisPass: 0,
      lastFallbackChunks: 0,
      lastFallbackGeneratedThisPass: 0,
      lastFallbackPendingChunks: 0,
      lastPlaceholderChunks: 0,
      lastPreloadAttemptedChunks: 0,
      lastPreloadCacheHits: 0,
      lastPreloadedChunks: 0,
      lastPreloadZoomLevel: 0,
      dirtyChunks: 0,
      dirtyInvalidations: 0,
      lastChunkKey: "-"
    }
  };
};

var terrainCache = null;
var localTerrainCacheSignature = null;
var localSurfaceRenderChunkCache = PS.render.surfaceRender.createCacheState();

function getLocalSurfaceRenderChunkKey(address) {
  if (!address) {
    return "-";
  }

  return address.chunkKey || [
    address.zoomLevel,
    address.sampleMeters,
    address.chunkSamples,
    address.chunkX,
    address.chunkY
  ].join(":");
}

PS.render.surfaceRender.invalidateTerrainCache = function () {
  terrainCache = null;
  localTerrainCacheSignature = null;
};

PS.render.surfaceRender.getChunkCacheLimit = function () {
  return Math.max(16, Math.round(Number(CONFIG.PLANET_SURFACE_RENDER_CHUNK_CACHE_LIMIT) || 256));
};

PS.render.surfaceRender.isSimulationBusy = function () {
  var population = Array.isArray(world.organisms) ? world.organisms.length : 0;
  var speed = Math.max(1, Math.round(Number(world.speed) || 1));
  var busySimLoad = Math.max(1, Number(CONFIG.PLANET_SURFACE_RENDER_BUSY_SIM_LOAD) || 5000);
  var busyUpdateMs = Math.max(0, Number(CONFIG.PLANET_SURFACE_RENDER_BUSY_UPDATE_MS) || 4);
  var measuredUpdateMs = Math.max(
    Number(world.updateMs) || 0,
    Number(world.maxUpdateMs) || 0
  );
  var measuredFps = Number(world.fps) || 0;

  if (population * speed >= busySimLoad) {
    return true;
  }

  if (busyUpdateMs > 0 && measuredUpdateMs >= busyUpdateMs) {
    return true;
  }

  return measuredFps > 0 && measuredFps < 54;
};

PS.render.surfaceRender.isIdleDetailZoom = function () {
  var idleMaxZoom = Number(CONFIG.PLANET_SURFACE_RENDER_IDLE_MAX_ZOOM);

  if (!Number.isFinite(idleMaxZoom)) {
    return true;
  }

  return getPlanetView().zoomLevel <= idleMaxZoom;
};

PS.render.surfaceRender.getChunksPerPass = function () {
  var busyChunks = Math.max(1, Math.round(Number(CONFIG.PLANET_SURFACE_RENDER_CHUNKS_PER_PASS) || 1));
  var idleChunks = Math.max(
    busyChunks,
    Math.round(Number(CONFIG.PLANET_SURFACE_RENDER_IDLE_CHUNKS_PER_PASS) || busyChunks)
  );

  if (world.isCameraInteracting) {
    return busyChunks;
  }

  return idleChunks;
};

PS.render.surfaceRender.getCellsPerPass = function () {
  var busyCells = Math.max(1, Math.round(Number(CONFIG.PLANET_SURFACE_RENDER_CELLS_PER_PASS) || 24));
  var streamingCells = Math.max(
    1,
    Math.round(Number(CONFIG.PLANET_SURFACE_STREAMING_CELLS_PER_PASS) || busyCells)
  );
  var idleCells = Math.max(
    busyCells,
    Math.round(Number(CONFIG.PLANET_SURFACE_RENDER_IDLE_CELLS_PER_PASS) || busyCells)
  );
  var chunkCells = Math.max(
    idleCells,
    Math.pow(Math.max(1, Math.round(Number(CONFIG.PLANET_SURFACE_CHUNK_SAMPLES) || 8)), 2)
  );

  if (world.isCameraInteracting) {
    return Math.min(busyCells, streamingCells);
  }

  if (!PS.render.surfaceRender.isIdleDetailZoom()) {
    return Math.min(busyCells, streamingCells);
  }

  return chunkCells;
};

PS.render.surfaceRender.getFallbackChunksPerPass = function () {
  var configuredLimit = Number(CONFIG.PLANET_SURFACE_RENDER_FALLBACK_CHUNKS_PER_PASS);

  if (!Number.isFinite(configuredLimit)) {
    return 8;
  }

  return Math.max(0, Math.round(configuredLimit));
};

PS.render.surfaceRender.resetChunkCache = function () {
  for (var chunkKey in localSurfaceRenderChunkCache.chunks) {
    if (Object.prototype.hasOwnProperty.call(localSurfaceRenderChunkCache.chunks, chunkKey)) {
      PS.render.surfaceRender.releaseRenderCanvas(localSurfaceRenderChunkCache.chunks[chunkKey]);
      PS.render.surfaceRender.releaseGpuChunkTexture(chunkKey);
      PS.render.surfaceRender.releaseGpuMaterialTexture(chunkKey);
    }
  }

  for (var pendingKey in localSurfaceRenderChunkCache.pendingChunks) {
    if (Object.prototype.hasOwnProperty.call(localSurfaceRenderChunkCache.pendingChunks, pendingKey)) {
      PS.render.surfaceRender.releaseRenderCanvas(localSurfaceRenderChunkCache.pendingChunks[pendingKey]);
    }
  }

  for (var previewKey in localSurfaceRenderChunkCache.placeholderPreviews) {
    if (Object.prototype.hasOwnProperty.call(localSurfaceRenderChunkCache.placeholderPreviews, previewKey)) {
      PS.render.surfaceRender.releaseRenderCanvas(localSurfaceRenderChunkCache.placeholderPreviews[previewKey]);
    }
  }

  localSurfaceRenderChunkCache = PS.render.surfaceRender.createCacheState();
};

PS.render.surfaceRender.getCacheStats = function () {
  return {
    chunks: localSurfaceRenderChunkCache.order.length,
    hits: localSurfaceRenderChunkCache.stats.hits,
    misses: localSurfaceRenderChunkCache.stats.misses,
    generatedChunks: localSurfaceRenderChunkCache.stats.generatedChunks,
    evictions: localSurfaceRenderChunkCache.stats.evictions,
    lastVisibleChunks: localSurfaceRenderChunkCache.stats.lastVisibleChunks,
    lastVisibleQueueChunks: localSurfaceRenderChunkCache.stats.lastVisibleQueueChunks,
    lastPrefetchQueueChunks: localSurfaceRenderChunkCache.stats.lastPrefetchQueueChunks,
    lastVisibleCandidateChunks: localSurfaceRenderChunkCache.stats.lastVisibleCandidateChunks,
    lastWorkingSetLimit: localSurfaceRenderChunkCache.stats.lastWorkingSetLimit,
    lastCulledChunks: localSurfaceRenderChunkCache.stats.lastCulledChunks,
    lastPendingChunks: localSurfaceRenderChunkCache.stats.lastPendingChunks,
    lastGeneratedThisPass: localSurfaceRenderChunkCache.stats.lastGeneratedThisPass,
    lastFallbackChunks: localSurfaceRenderChunkCache.stats.lastFallbackChunks,
    lastFallbackGeneratedThisPass: localSurfaceRenderChunkCache.stats.lastFallbackGeneratedThisPass,
    lastFallbackPendingChunks: localSurfaceRenderChunkCache.stats.lastFallbackPendingChunks,
    lastPlaceholderChunks: localSurfaceRenderChunkCache.stats.lastPlaceholderChunks,
    lastPreloadAttemptedChunks: localSurfaceRenderChunkCache.stats.lastPreloadAttemptedChunks,
    lastPreloadCacheHits: localSurfaceRenderChunkCache.stats.lastPreloadCacheHits,
    lastPreloadedChunks: localSurfaceRenderChunkCache.stats.lastPreloadedChunks,
    lastPreloadZoomLevel: localSurfaceRenderChunkCache.stats.lastPreloadZoomLevel,
    dirtyChunks: localSurfaceRenderChunkCache.stats.dirtyChunks,
    dirtyInvalidations: localSurfaceRenderChunkCache.stats.dirtyInvalidations,
    canvases: PS.render.surfaceRender.canvases && typeof PS.render.surfaceRender.canvases.getStats === "function"
      ? PS.render.surfaceRender.canvases.getStats()
      : null,
    lastChunkKey: localSurfaceRenderChunkCache.stats.lastChunkKey
  };
};

PS.render.surfaceRender.promoteChunkKey = function (renderKey) {
  var order = localSurfaceRenderChunkCache.order;
  var index = order.indexOf(renderKey);

  if (index >= 0) {
    order.splice(index, 1);
  }

  order.push(renderKey);
};

PS.render.surfaceRender.releaseRenderCanvas = function (renderItem) {
  var canvas = renderItem && renderItem.canvas ? renderItem.canvas : renderItem;

  if (
    PS.render.surfaceRender.canvases &&
    typeof PS.render.surfaceRender.canvases.release === "function"
  ) {
    return PS.render.surfaceRender.canvases.release(canvas);
  }

  return false;
};

PS.render.surfaceRender.releaseGpuChunkTexture = function (renderKey) {
  return !!renderKey && false;
};

PS.render.surfaceRender.releaseGpuMaterialTexture = function (renderKey) {
  return !!renderKey && false;
};

PS.render.surfaceRender.storeCompletedChunk = function (address, renderChunk) {
  var renderKey = getLocalSurfaceRenderChunkKey(address);

  if (!renderChunk) {
    return null;
  }

  delete localSurfaceRenderChunkCache.pendingChunks[renderKey];
  localSurfaceRenderChunkCache.stats.misses++;
  localSurfaceRenderChunkCache.stats.generatedChunks++;
  localSurfaceRenderChunkCache.chunks[renderKey] = renderChunk;
  PS.render.surfaceRender.promoteChunkKey(renderKey);

  while (localSurfaceRenderChunkCache.order.length > PS.render.surfaceRender.getChunkCacheLimit()) {
    var evictedKey = localSurfaceRenderChunkCache.order.shift();
    PS.render.surfaceRender.releaseRenderCanvas(localSurfaceRenderChunkCache.chunks[evictedKey]);
    PS.render.surfaceRender.releaseGpuChunkTexture(evictedKey);
    PS.render.surfaceRender.releaseGpuMaterialTexture(evictedKey);
    delete localSurfaceRenderChunkCache.chunks[evictedKey];
    localSurfaceRenderChunkCache.stats.evictions++;
  }

  return renderChunk;
};

PS.render.surfaceRender.makeReadyChunk = function (address, source) {
  if (!PS.render.surfaceWorker || typeof PS.render.surfaceWorker.makeChunkPayload !== "function") {
    return null;
  }

  var payload = PS.render.surfaceWorker.makeChunkPayload(address);

  return {
    readyState: "ready",
    source: source || "sync",
    address: address,
    width: payload.width,
    height: payload.height,
    cellCache: payload.cellCache,
    promotedAt: world ? world.tick : 0
  };
};

PS.render.surfaceRender.markDirty = function (address) {
  var renderKey = typeof address === "string"
    ? address
    : getLocalSurfaceRenderChunkKey(address);

  localSurfaceRenderChunkCache.dirtyChunks[renderKey] = true;
  localSurfaceRenderChunkCache.stats.dirtyChunks = Object.keys(localSurfaceRenderChunkCache.dirtyChunks).length;
  return renderKey;
};

PS.render.surfaceRender.clearDirty = function (renderKey) {
  if (localSurfaceRenderChunkCache.dirtyChunks[renderKey]) {
    delete localSurfaceRenderChunkCache.dirtyChunks[renderKey];
    localSurfaceRenderChunkCache.stats.dirtyChunks = Object.keys(localSurfaceRenderChunkCache.dirtyChunks).length;
    return true;
  }

  return false;
};

PS.render.surfaceRender.getChunk = function (address, allowGenerate) {
  var renderKey = getLocalSurfaceRenderChunkKey(address);
  var cachedChunk = localSurfaceRenderChunkCache.chunks[renderKey];
  var renderChunk = null;

  localSurfaceRenderChunkCache.stats.lastChunkKey = renderKey;

  if (PS.render.surfaceRender.clearDirty(renderKey)) {
    PS.render.surfaceRender.releaseRenderCanvas(localSurfaceRenderChunkCache.chunks[renderKey]);
    PS.render.surfaceRender.releaseRenderCanvas(localSurfaceRenderChunkCache.pendingChunks[renderKey]);
    PS.render.surfaceRender.releaseGpuChunkTexture(renderKey);
    PS.render.surfaceRender.releaseGpuMaterialTexture(renderKey);
    delete localSurfaceRenderChunkCache.chunks[renderKey];
    delete localSurfaceRenderChunkCache.pendingChunks[renderKey];
    cachedChunk = null;
    localSurfaceRenderChunkCache.stats.dirtyInvalidations++;
  }

  if (cachedChunk) {
    localSurfaceRenderChunkCache.stats.hits++;
    PS.render.surfaceRender.promoteChunkKey(renderKey);
    return cachedChunk;
  }

  if (allowGenerate === false) {
    return null;
  }

  var pendingBuilder = localSurfaceRenderChunkCache.pendingChunks[renderKey];

  if (!pendingBuilder) {
    if (
      CONFIG.PLANET_SURFACE_WORKER_CHUNKS !== false &&
      PS.render.surfaceWorker &&
      PS.render.surfaceWorker.requestChunk(address)
    ) {
      localSurfaceRenderChunkCache.pendingChunks[renderKey] = {
        workerPending: true,
        address: address
      };
      return null;
    }

    renderChunk = PS.render.surfaceRender.makeReadyChunk(address, "sync");
    if (!renderChunk) {
      return null;
    }
    return PS.render.surfaceRender.storeCompletedChunk(address, renderChunk);
  }

  if (pendingBuilder.workerPending) {
    return null;
  }

  return null;
};

PS.render.surfaceRender.getPlaceholderColorCacheLimit = function () {
  return Math.max(64, PS.render.surfaceRender.getChunkCacheLimit() * 4);
};

PS.render.surfaceRender.getPlaceholderPreviewsPerPass = function () {
  if (world.isCameraInteracting || PS.render.surfaceRender.isSimulationBusy()) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(Number(CONFIG.PLANET_SURFACE_PLACEHOLDER_PREVIEWS_PER_PASS) || 2)
  );
};

PS.render.surfaceRender.rebuildShaders = function () {};

PS.render.surfaceRender.rebuildTextures = function () {
  PS.render.surfaceRender.resetChunkCache();
  PS.render.surfaceRender.invalidateTerrainCache();
};
