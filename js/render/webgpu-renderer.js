"use strict";
PS.render = PS.render || {};

PS.render.WebGPURenderer = function () {
  PS.render.Renderer.call(this, "webgpu");
  this.frameStartMs = 0;
  this.camera = null;
  this.frameStartGlobeDraws = 0;
  this.frameStartTileDraws = 0;
  this.tilemapDrawsThisFrame = 0;
  this.tilemapMissesThisFrame = 0;
};

PS.render.WebGPURenderer.prototype = Object.create(PS.render.Renderer.prototype);
PS.render.WebGPURenderer.prototype.constructor = PS.render.WebGPURenderer;

PS.render.WebGPURenderer.prototype.ensureContext = function () {
  if (!PS.gpu || PS.gpu.status !== "ready" || !PS.gpu.device) {
    return false;
  }

  if (!PS.gpu.context && typeof PS.gpu.configureContext === "function") {
    PS.gpu.configureContext(PS.gpu.canvas || null);
  }

  return Boolean(PS.gpu.context);
};

PS.render.WebGPURenderer.prototype.beginFrame = function (camera) {
  this.camera = camera || (PS.camera && PS.camera.unified ? PS.camera.unified.getState() : null);
  this.frameStartMs = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  this.frameStartGlobeDraws = PS.render.webgpuGlobe && PS.render.webgpuGlobe.state
    ? Number(PS.render.webgpuGlobe.state.drawCount) || 0
    : 0;
  this.frameStartTileDraws = PS.render.webgpuSurfaceTile && PS.render.webgpuSurfaceTile.state
    ? Number(PS.render.webgpuSurfaceTile.state.drawCount) || 0
    : 0;
  this.tilemapDrawsThisFrame = 0;
  this.tilemapMissesThisFrame = 0;
  this.stats.lastError = "";

  if (PS.render.webgpuSurfaceTile && typeof PS.render.webgpuSurfaceTile.resetFrameStats === "function") {
    PS.render.webgpuSurfaceTile.resetFrameStats();
  }
  if (PS.render.webgpuEntity && typeof PS.render.webgpuEntity.resetFrameStats === "function") {
    PS.render.webgpuEntity.resetFrameStats();
  }

  if (!this.ensureContext()) {
    this.stats.lastError = "WebGPU context unavailable";
    return false;
  }

  return true;
};

PS.render.WebGPURenderer.prototype.drawTilemap = function (tileBuffer, camera) {
  var buffer = tileBuffer || {};
  var drawn = false;

  this.camera = camera || this.camera;

  if (PS.render.webgpuSurfaceTile && buffer.tilemapLayer && typeof PS.render.webgpuSurfaceTile.drawDataTextureTilemap === "function") {
    drawn = PS.render.webgpuSurfaceTile.drawDataTextureTilemap(
      buffer.tilemapLayer,
      buffer.options || {}
    );
  } else if (PS.render.webgpuSurfaceTile && Array.isArray(buffer.chunks)) {
    drawn = PS.render.webgpuSurfaceTile.drawTerrainAtlasBatch(
      buffer.chunks,
      buffer.alpha,
      buffer.options
    );
  } else if (PS.render.webgpuSurfaceTile && buffer.address && Array.isArray(buffer.cellCache)) {
    drawn = PS.render.webgpuSurfaceTile.drawTerrainAtlas(
      buffer.address,
      buffer.cellCache,
      buffer.alpha,
      buffer.options
    );
  }

  this.stats.tilemapDraws++;
  this.tilemapDrawsThisFrame += drawn ? 1 : 0;
  this.tilemapMissesThisFrame += drawn ? 0 : 1;
  return drawn;
};

PS.render.WebGPURenderer.prototype.drawSprite = function () {
  this.stats.spriteDraws++;
  return false;
};

PS.render.WebGPURenderer.prototype.batchSprites = function (spriteList) {
  var list = Array.isArray(spriteList) ? spriteList : [];
  this.stats.spriteDraws += list.length;
  return 0;
};

PS.render.WebGPURenderer.prototype.drawShadow = function () {
  this.stats.shadowDraws++;
  return false;
};

PS.render.WebGPURenderer.prototype.drawParticle = function () {
  this.stats.particleDraws++;
  return false;
};

PS.render.WebGPURenderer.prototype.addLight = function () {
  if (PS.render.webgpuPointLights && typeof PS.render.webgpuPointLights.queueLight === "function") {
    PS.render.webgpuPointLights.queueLight.apply(PS.render.webgpuPointLights, arguments);
  }
  this.stats.lightCount++;
  return true;
};

PS.render.WebGPURenderer.prototype.clearIfNoWebGpuPassDrew = function () {
  var device = PS.gpu && PS.gpu.device;
  var context = PS.gpu && PS.gpu.context;
  var currentGlobeDraws = PS.render.webgpuGlobe && PS.render.webgpuGlobe.state
    ? Number(PS.render.webgpuGlobe.state.drawCount) || 0
    : 0;
  var currentTileDraws = PS.render.webgpuSurfaceTile && PS.render.webgpuSurfaceTile.state
    ? Number(PS.render.webgpuSurfaceTile.state.drawCount) || 0
    : 0;
  var encoder;
  var pass;

  if (currentGlobeDraws > this.frameStartGlobeDraws || currentTileDraws > this.frameStartTileDraws) {
    return false;
  }

  if (!device || !context || typeof context.getCurrentTexture !== "function") {
    return false;
  }

  encoder = device.createCommandEncoder({ label: "webgpu-renderer.clear.encoder" });
  pass = encoder.beginRenderPass({
    label: "webgpu-renderer.clear-pass",
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 8 / 255, g: 12 / 255, b: 18 / 255, a: 1 },
      loadOp: "clear",
      storeOp: "store"
    }]
  });
  pass.end();
  device.queue.submit([encoder.finish()]);
  return true;
};

PS.render.WebGPURenderer.prototype.endFrame = function () {
  var now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  var globeState = PS.render.webgpuGlobe ? PS.render.webgpuGlobe.state : null;
  var surfaceState = PS.render.webgpuSurfaceTile ? PS.render.webgpuSurfaceTile.state : null;
  var entityStats = PS.render.webgpuEntity && typeof PS.render.webgpuEntity.getStats === "function"
    ? PS.render.webgpuEntity.getStats()
    : null;
  var equivalenceStats = PS.assets && PS.assets.equivalence && typeof PS.assets.equivalence.getStats === "function"
    ? PS.assets.equivalence.getStats()
    : null;
  var pointLightStats = PS.render.webgpuPointLights && typeof PS.render.webgpuPointLights.getStats === "function"
    ? PS.render.webgpuPointLights.getStats()
    : null;
  var clearSubmitted = this.clearIfNoWebGpuPassDrew();
  var terrainMs = surfaceState ? Number(surfaceState.lastFrameMs) || 0 : 0;
  var globeMs = globeState ? Number(globeState.lastFrameMs) || 0 : 0;
  var rendererMs = Math.max(terrainMs, globeMs, Math.max(0, now - this.frameStartMs));

  this.stats.frameCount++;
  this.stats.pipelineFrameMs = Math.max(0, now - this.frameStartMs);
  this.stats.gpuFrameMs = rendererMs;
  this.stats.rendererGpuFrameMs = rendererMs;
  this.stats.lastFrameMs = rendererMs;
  this.stats.overBudget = rendererMs > this.stats.frameBudgetMs;
  this.stats.rendererOverBudget = this.stats.overBudget;
  this.stats.tilemapWebgpuDraws = this.tilemapDrawsThisFrame;
  this.stats.tilemapMisses = this.tilemapMissesThisFrame;
  this.stats.terrainDraws = surfaceState ? Number(surfaceState.tileDrawCount) || 0 : 0;
  this.stats.terrainPageDraws = surfaceState ? Number(surfaceState.pageDrawCount) || 0 : 0;
  this.stats.terrainLastFrameMs = terrainMs;
  this.stats.entityDraws = entityStats ? Number(entityStats.frameInstanceDrawCount) || 0 : 0;
  this.stats.particleDraws = entityStats ? Number(entityStats.particleDrawCount) || 0 : this.stats.particleDraws;
  this.stats.foodEntityDraws = entityStats ? Number(entityStats.foodDrawCount) || 0 : 0;
  this.stats.organismEntityDraws = entityStats ? Number(entityStats.organismDrawCount) || 0 : 0;
  this.stats.settlementEntityDraws = entityStats ? Number(entityStats.settlementDrawCount) || 0 : 0;
  this.stats.routeEntityDraws = entityStats ? Number(entityStats.routeDrawCount) || 0 : 0;
  this.stats.influenceEntityDraws = entityStats ? Number(entityStats.influenceDrawCount) || 0 : 0;
  this.stats.intentEntityDraws = entityStats ? Number(entityStats.intentDrawCount) || 0 : 0;
  this.stats.settlementReadinessEntityDraws = entityStats ? Number(entityStats.readinessDrawCount) || 0 : 0;
  this.stats.orbitEventMarkerDraws = entityStats ? Number(entityStats.eventMarkerDrawCount) || 0 : 0;
  this.stats.shadowEntityDraws = entityStats ? Number(entityStats.shadowDrawCount) || 0 : 0;
  this.stats.worldUiEntityDraws = entityStats ? Number(entityStats.worldUiDrawCount) || 0 : 0;
  this.stats.stockpileEntityDraws = entityStats ? Number(entityStats.stockpileDrawCount) || 0 : 0;
  this.stats.workStatusEntityDraws = entityStats ? Number(entityStats.workStatusDrawCount) || 0 : 0;
  this.stats.effectEntityDraws = entityStats ? Number(entityStats.effectDrawCount) || 0 : 0;
  this.stats.vegetationEntityDraws = entityStats ? Number(entityStats.vegetationDrawCount) || 0 : 0;
  this.stats.citizenEntityDraws = entityStats ? Number(entityStats.citizenDrawCount) || 0 : 0;
  this.stats.equivalenceAssetSelections = equivalenceStats ? Number(equivalenceStats.selected) || 0 : 0;
  this.stats.equivalenceAssetRendered = equivalenceStats ? Number(equivalenceStats.rendered) || 0 : 0;
  this.stats.equivalenceAssetMissing = equivalenceStats ? Number(equivalenceStats.missing) || 0 : 0;
  this.stats.equivalenceAssetUses = equivalenceStats ? Object.assign({}, equivalenceStats.byUse || {}) : {};
  this.stats.equivalenceAssetSheets = equivalenceStats ? Object.assign({}, equivalenceStats.bySheet || {}) : {};
  this.stats.pointLightDraws = pointLightStats ? Number(pointLightStats.drawCount) || 0 : 0;
  this.stats.pointLightsSubmitted = pointLightStats ? Number(pointLightStats.submittedLights) || 0 : 0;
  this.stats.pointLightsCulled = pointLightStats ? Number(pointLightStats.culledLights) || 0 : 0;
  this.stats.globeDraws = globeState ? Number(globeState.drawCount) || 0 : 0;
  this.stats.globeLastFrameMs = globeMs;
  this.stats.observationOverlayActive = globeState && globeState.lastUsedObservationOverlay
    ? globeState.lastUsedObservationOverlay
    : "none";
  this.stats.observationOverlayUploads = globeState ? Number(globeState.overlayUploadCount) || 0 : 0;
  this.stats.observationOverlaySamples = this.stats.observationOverlayActive !== "none" &&
    typeof WORLD_WIDTH !== "undefined" &&
    typeof WORLD_HEIGHT !== "undefined"
    ? WORLD_WIDTH * WORLD_HEIGHT
    : 0;
  this.stats.observationOverlayFrameMs = globeState ? Number(globeState.lastOverlayUploadMs) || 0 : 0;
  this.stats.observationOverlayCompositor = "webgpu";
  this.stats.webgpuContextActive = Boolean(PS.gpu && PS.gpu.context);
  this.stats.webgpuClearSubmitted = clearSubmitted;
  this.stats.singleVisibleCanvas = Boolean(PS.gpu && PS.gpu.canvas);
  this.stats.directSingleCanvas = this.stats.singleVisibleCanvas;
  return this.getStats();
};

PS.render.webgpuRenderer = PS.render.webgpuRenderer || new PS.render.WebGPURenderer();
PS.render.renderer.setActive(PS.render.webgpuRenderer);
