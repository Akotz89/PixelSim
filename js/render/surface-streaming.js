"use strict";
PS.render = PS.render || {};
PS.render.surfaceStreaming = PS.render.surfaceStreaming || {};

PS.render.surfaceStreaming.getPrefetchAheadCount = function () {
  return Math.max(0, Math.round(Number(CONFIG.PLANET_SURFACE_PREFETCH_AHEAD_CHUNKS) || 2));
};

PS.render.surfaceStreaming.getFrameBudgetMs = function () {
  return Math.max(1, Number(CONFIG.PLANET_SURFACE_STREAMING_FRAME_BUDGET_MS) || 4);
};

PS.render.surfaceStreaming.getChunkMapKey = function (address) {
  return [address.zoomLevel, address.chunkX, address.chunkY].join(":");
};

PS.render.surfaceStreaming.getChunkWithRect = function (address, type, priorityOffset) {
  var rect = PS.render.surface.getChunkScreenRect(address);

  return {
    address: address,
    screenX: rect.x,
    screenY: rect.y,
    width: rect.width,
    height: rect.height,
    queueType: type,
    priorityDistance: PS.render.surface.getChunkScreenPriority(rect),
    priorityScore: PS.render.surface.getChunkPriorityScore(rect) + (Number(priorityOffset) || 0)
  };
};

PS.render.surfaceStreaming.getPanStep = function () {
  var panVector = getPlanetViewPanVector();

  if (panVector.magnitude <= 0) {
    return { x: 0, y: 0 };
  }

  if (Math.abs(panVector.eastUnit) >= Math.abs(panVector.northUnit)) {
    return { x: panVector.eastUnit >= 0 ? 1 : -1, y: 0 };
  }

  return { x: 0, y: panVector.northUnit >= 0 ? -1 : 1 };
};

PS.render.surfaceStreaming.getPrefetchChunks = function (visibleChunks) {
  var prefetchLimit = PS.render.surfaceStreaming.getPrefetchAheadCount();
  var step = PS.render.surfaceStreaming.getPanStep();
  var queued = {};
  var prefetch = [];

  if (prefetchLimit <= 0 || (step.x === 0 && step.y === 0)) {
    return prefetch;
  }

  visibleChunks.forEach(function (chunk) {
    queued[PS.render.surfaceStreaming.getChunkMapKey(chunk.address)] = true;
  });

  for (var i = 0; i < visibleChunks.length && prefetch.length < prefetchLimit; i++) {
    var source = visibleChunks[i].address;

    for (var distance = 1; distance <= prefetchLimit && prefetch.length < prefetchLimit; distance++) {
      var address = PS.render.surface.makeChunkAddress(
        source.zoomLevel,
        source.chunkX + step.x * distance,
        source.chunkY + step.y * distance
      );
      var key = PS.render.surfaceStreaming.getChunkMapKey(address);

      if (queued[key]) {
        continue;
      }

      queued[key] = true;
      prefetch.push(PS.render.surfaceStreaming.getChunkWithRect(address, "prefetch", 10000 + distance));
    }
  }

  return prefetch;
};

PS.render.surfaceStreaming.makeQueue = function (guardSamples, maxChunks) {
  var visibleChunks = getPlanetVisibleSurfaceChunks(guardSamples, maxChunks);
  var visibleQueue = visibleChunks.map(function (chunk) {
    chunk.queueType = "visible";
    return chunk;
  });
  var prefetchChunks = PS.render.surfaceStreaming.getPrefetchChunks(visibleQueue);
  var queue = visibleQueue.concat(prefetchChunks);

  queue.totalCandidateChunks = Number(visibleChunks.totalCandidateChunks) || visibleChunks.length;
  queue.workingSetLimit = Number(visibleChunks.workingSetLimit) || visibleChunks.length;
  queue.culledChunks = Number(visibleChunks.culledChunks) || 0;
  queue.visibleCount = visibleQueue.length;
  queue.prefetchCount = prefetchChunks.length;
  return queue;
};

PS.render.surfaceStreaming.rebuildShaders = function () {};
PS.render.surfaceStreaming.rebuildTextures = function () {};
