import { PS } from "../core/namespace.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";
import { canvas } from "../ui/dom-refs.js";

PS.render = PS.render || {};

PS.render.WebGPURenderer = function () {
  PS.render.Renderer.call(this, "webgpu");
  this.frameStartMs = 0;
  this.camera = null;
  this.frameStartGlobeDraws = 0;
  this.frameStartTileDraws = 0;
  this.frameStartUnderlayDraws = 0;
  this.tilemapDrawsThisFrame = 0;
  this.tilemapMissesThisFrame = 0;
  this.shadowRectScratch = new Float32Array(8);
  this.particleRectScratch = new Float32Array(8);
};

PS.render.WebGPURenderer.prototype = Object.create(PS.render.Renderer.prototype);
PS.render.WebGPURenderer.prototype.constructor = PS.render.WebGPURenderer;

function getFiniteNumber(value, fallback) {
  var number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function getRendererStateDrawCount(surface) {
  return surface && surface.state ? Number(surface.state.drawCount) || 0 : 0;
}

function getAtlasRectSize(cell, spec, fallbackWidth, fallbackHeight) {
  return {
    width: Math.max(1, Number(spec.width !== undefined ? spec.width : spec.w) || (cell ? cell.w : fallbackWidth)),
    height: Math.max(1, Number(spec.height !== undefined ? spec.height : spec.h) || (cell ? cell.h : fallbackHeight))
  };
}

function writeRectValues(target, x, y, width, height, color) {
  target[0] = Number(x) || 0;
  target[1] = Number(y) || 0;
  target[2] = width;
  target[3] = height;
  target[4] = color[0];
  target[5] = color[1];
  target[6] = color[2];
  target[7] = color[3];
  return target;
}

function getRendererModuleStats(module, methodName) {
  return module && typeof module[methodName] === "function" ? module[methodName]() : null;
}

var WEBGPU_ENTITY_FRAME_STAT_ENTRIES = [
  ["entityDraws", "frameInstanceDrawCount", false],
  ["particleDraws", "particleDrawCount", true],
  ["displacementDraws", "displacementDrawCount", false],
  ["displacementLastFrameMs", "displacementLastFrameMs", false],
  ["foodEntityDraws", "foodDrawCount", false],
  ["organismEntityDraws", "organismDrawCount", false],
  ["settlementEntityDraws", "settlementDrawCount", false],
  ["routeEntityDraws", "routeDrawCount", false],
  ["influenceEntityDraws", "influenceDrawCount", false],
  ["intentEntityDraws", "intentDrawCount", false],
  ["settlementReadinessEntityDraws", "readinessDrawCount", false],
  ["orbitEventMarkerDraws", "eventMarkerDrawCount", false],
  ["shadowEntityDraws", "shadowDrawCount", false],
  ["worldUiEntityDraws", "worldUiDrawCount", false],
  ["stockpileEntityDraws", "stockpileDrawCount", false],
  ["workStatusEntityDraws", "workStatusDrawCount", false],
  ["effectEntityDraws", "effectDrawCount", false],
  ["vegetationEntityDraws", "vegetationDrawCount", false],
  ["citizenEntityDraws", "citizenDrawCount", false]
];

function assignNumericStatsFromEntries(stats, source, entries) {
  for (var i = 0; i < entries.length; i += 1) {
    var entry = entries[i];
    var targetKey = entry[0];
    var sourceKey = entry[1];
    var keepExisting = entry[2] === true;

    stats[targetKey] = source
      ? Number(source[sourceKey]) || 0
      : (keepExisting ? stats[targetKey] : 0);
  }
}

function assignTerrainFrameStats(stats, surfaceState, terrainMs) {
  stats.terrainDraws = surfaceState ? Number(surfaceState.tileDrawCount) || 0 : 0;
  stats.terrainPageDraws = surfaceState ? Number(surfaceState.pageDrawCount) || 0 : 0;
  stats.terrainLastFrameMs = terrainMs;
  stats.districtMaterialDrawCount = surfaceState ? Number(surfaceState.districtMaterialDrawCount) || 0 : 0;
  stats.civilizationCounts = surfaceState ? Object.assign({}, surfaceState.civilizationCounts || {}) : {};
}

function assignEntityFrameStats(stats, entityStats) {
  assignNumericStatsFromEntries(stats, entityStats, WEBGPU_ENTITY_FRAME_STAT_ENTRIES);
}

function assignAssetFrameStats(stats, equivalenceStats) {
  stats.equivalenceAssetSelections = equivalenceStats ? Number(equivalenceStats.selected) || 0 : 0;
  stats.equivalenceAssetRendered = equivalenceStats ? Number(equivalenceStats.rendered) || 0 : 0;
  stats.equivalenceAssetMissing = equivalenceStats ? Number(equivalenceStats.missing) || 0 : 0;
  stats.equivalenceAssetUses = equivalenceStats ? Object.assign({}, equivalenceStats.byUse || {}) : {};
  stats.equivalenceAssetSheets = equivalenceStats ? Object.assign({}, equivalenceStats.bySheet || {}) : {};
}

function assignLightFrameStats(stats, pointLightStats, tileLightStats) {
  stats.pointLightDraws = pointLightStats ? Number(pointLightStats.drawCount) || 0 : 0;
  stats.pointLightsSubmitted = pointLightStats ? Number(pointLightStats.submittedLights) || 0 : 0;
  stats.pointLightsCulled = pointLightStats ? Number(pointLightStats.culledLights) || 0 : 0;
  stats.tileLightDraws = tileLightStats ? Number(tileLightStats.drawCount) || 0 : 0;
  stats.tileLightsSubmitted = tileLightStats ? Number(tileLightStats.submittedTiles) || 0 : 0;
  stats.tileLightGridCells = tileLightStats ? Number(tileLightStats.gridCells) || 0 : 0;
}

function assignGlobeFrameStats(renderer, globeState, globeMs) {
  var stats = renderer.stats;

  stats.globeDraws = globeState ? Number(globeState.drawCount) || 0 : 0;
  stats.globeLastFrameMs = globeMs;
  stats.observationOverlayActive = globeState && globeState.lastUsedObservationOverlay
    ? globeState.lastUsedObservationOverlay
    : "none";
  stats.observationOverlayUploads = globeState ? Number(globeState.overlayUploadCount) || 0 : 0;
  stats.observationOverlaySamples = stats.observationOverlayActive !== "none" &&
    typeof WORLD_WIDTH !== "undefined" &&
    typeof WORLD_HEIGHT !== "undefined"
    ? WORLD_WIDTH * WORLD_HEIGHT
    : 0;
  stats.observationOverlayFrameMs = globeState ? Number(globeState.lastOverlayUploadMs) || 0 : 0;
  stats.observationOverlayCompositor = "webgpu";
}

function assignContextFrameStats(stats, clearSubmitted) {
  stats.webgpuContextActive = Boolean(PS.gpu && PS.gpu.context);
  stats.webgpuClearSubmitted = clearSubmitted;
  stats.singleVisibleCanvas = Boolean(PS.gpu && PS.gpu.canvas);
  stats.directSingleCanvas = stats.singleVisibleCanvas;
}

function getEndFrameInputs(renderer) {
  var now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  var globeState = PS.render.webgpuGlobe ? PS.render.webgpuGlobe.state : null;
  var surfaceState = PS.render.webgpuSurfaceTile ? PS.render.webgpuSurfaceTile.state : null;
  var terrainMs = surfaceState ? Number(surfaceState.lastFrameMs) || 0 : 0;
  var globeMs = globeState ? Number(globeState.lastFrameMs) || 0 : 0;

  return {
    now: now,
    globeState: globeState,
    surfaceState: surfaceState,
    entityStats: getRendererModuleStats(PS.render.webgpuEntity, "getStats"),
    equivalenceStats: getRendererModuleStats(PS.assets && PS.assets.equivalence, "getStats"),
    pointLightStats: getRendererModuleStats(PS.render.webgpuPointLights, "getStats"),
    tileLightStats: getRendererModuleStats(PS.render.webgpuTileLights, "getStats"),
    clearSubmitted: renderer.clearIfNoWebGpuPassDrew(),
    terrainMs: terrainMs,
    globeMs: globeMs,
    rendererMs: Math.max(terrainMs, globeMs, Math.max(0, now - renderer.frameStartMs))
  };
}

function assignFrameTimingStats(renderer, inputs) {
  var stats = renderer.stats;

  stats.frameCount++;
  stats.pipelineFrameMs = Math.max(0, inputs.now - renderer.frameStartMs);
  stats.gpuFrameMs = inputs.rendererMs;
  stats.rendererGpuFrameMs = inputs.rendererMs;
  stats.lastFrameMs = inputs.rendererMs;
  stats.overBudget = inputs.rendererMs > stats.frameBudgetMs;
  stats.rendererOverBudget = stats.overBudget;
  stats.tilemapWebgpuDraws = renderer.tilemapDrawsThisFrame;
  stats.tilemapMisses = renderer.tilemapMissesThisFrame;
}

PS.render.WebGPURenderer.prototype.ensureContext = function ensureWebgpuRendererContext() {
  if (!PS.gpu || PS.gpu.status !== "ready" || !PS.gpu.device) {
    return false;
  }

  if (!PS.gpu.context && typeof PS.gpu.configureContext === "function") {
    PS.gpu.configureContext(PS.gpu.canvas || null);
  }

  return Boolean(PS.gpu.context);
};

PS.render.WebGPURenderer.prototype.beginFrame = function beginWebgpuRendererFrame(camera) {
  this.camera = camera || (PS.camera && PS.camera.unified ? PS.camera.unified.getState() : null);
  this.frameStartMs = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  this.frameStartGlobeDraws = getRendererStateDrawCount(PS.render.webgpuGlobe);
  this.frameStartTileDraws = getRendererStateDrawCount(PS.render.webgpuSurfaceTile);
  this.frameStartUnderlayDraws = getRendererStateDrawCount(PS.render.webgpuSurfaceUnderlay);
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

PS.render.WebGPURenderer.prototype.drawTilemap = function drawWebgpuRendererTilemap(tileBuffer, camera) {
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

PS.render.WebGPURenderer.prototype.getAtlasCell = function getWebgpuRendererAtlasCell(spriteId, opts) {
  var spec = opts || {};

  if (spec.cell) {
    return spec.cell;
  }

  if (spec.cellName && PS.atlas && PS.atlas.cells) {
    return PS.atlas.cells[String(spec.cellName)] || null;
  }

  if (spriteId && PS.atlas && PS.atlas.cells) {
    return PS.atlas.cells[String(spriteId)] || null;
  }

  return null;
};

PS.render.WebGPURenderer.prototype.normalizeColor = function normalizeWebgpuRendererColor(color, fallbackAlpha) {
  var alpha = getFiniteNumber(fallbackAlpha, 1);

  if (Array.isArray(color)) {
    return [
      getFiniteNumber(color[0], 1),
      getFiniteNumber(color[1], 1),
      getFiniteNumber(color[2], 1),
      getFiniteNumber(color[3], alpha)
    ];
  }

  if (color && typeof color === "object") {
    return [
      getFiniteNumber(color.r !== undefined ? color.r : color.red, 1),
      getFiniteNumber(color.g !== undefined ? color.g : color.green, 1),
      getFiniteNumber(color.b !== undefined ? color.b : color.blue, 1),
      getFiniteNumber(color.a !== undefined ? color.a : color.alpha, alpha)
    ];
  }

  return [1, 1, 1, alpha];
};

PS.render.WebGPURenderer.prototype.drawSprite = function drawWebgpuRendererSprite(spriteId, x, y, opts) {
  var spec = opts || {};
  var cell = this.getAtlasCell(spriteId, spec);
  var size = getAtlasRectSize(cell, spec, 1, 1);
  var drawn = false;

  if (!cell || !PS.render.webgpuEntity || typeof PS.render.webgpuEntity.drawCell !== "function") {
    return false;
  }

  drawn = PS.render.webgpuEntity.drawCell(
    cell,
    Number(x) || 0,
    Number(y) || 0,
    size.width,
    size.height,
    {
      alpha: Number.isFinite(Number(spec.alpha)) ? Number(spec.alpha) : 1,
      tint: spec.tint || spec.color,
      kind: spec.kind || "sprite",
      useGbuffer: spec.useGbuffer === true,
      textureView: spec.textureView,
      commandEncoder: spec.commandEncoder,
      device: spec.device,
      context: spec.context,
      width: spec.canvasWidth,
      height: spec.canvasHeight
    }
  );

  if (drawn) {
    this.stats.spriteDraws++;
  }

  return drawn;
};

PS.render.WebGPURenderer.prototype.batchSprites = function batchWebgpuRendererSprites(spriteList) {
  var list = Array.isArray(spriteList) ? spriteList : [];
  var batches;
  var drawn;

  if (!PS.render.webgpuEntity || typeof PS.render.webgpuEntity.beginBatches !== "function") {
    return 0;
  }

  batches = PS.render.webgpuEntity.beginBatches();

  for (var i = 0; i < list.length; i += 1) {
    var item = list[i] || {};
    var cell = this.getAtlasCell(item.spriteId || item.id || item.name, item);
    var size = getAtlasRectSize(cell, item, 1, 1);

    PS.render.webgpuEntity.appendCell(
      batches,
      cell,
      Number(item.x) || 0,
      Number(item.y) || 0,
      size.width,
      size.height,
      Number.isFinite(Number(item.alpha)) ? Number(item.alpha) : 1,
      item.tint || item.color,
      item.kind || "sprite"
    );
  }

  if (batches.count <= 0 || typeof PS.render.webgpuEntity.drawBatches !== "function") {
    return 0;
  }

  drawn = PS.render.webgpuEntity.drawBatches(batches, {});

  if (drawn) {
    this.stats.spriteDraws += batches.count;
    this.stats.batchFlushes++;
    return batches.count;
  }

  return 0;
};

PS.render.WebGPURenderer.prototype.drawShadow = function drawWebgpuRendererShadow(spriteId, x, y, dir) {
  var spec = dir && typeof dir === "object" ? dir : {};
  var cell = this.getAtlasCell(spriteId, spec);
  var size = getAtlasRectSize(cell, spec, 8, 4);
  var color = this.normalizeColor(spec.color || [0, 0, 0, 0.35], spec.alpha !== undefined ? spec.alpha : 0.35);
  var values = this.shadowRectScratch;
  var drawn;

  writeRectValues(values, x, y, size.width, size.height, color);

  if (!PS.render.webgpuEntity || typeof PS.render.webgpuEntity.drawShadowRects !== "function") {
    return false;
  }

  drawn = PS.render.webgpuEntity.drawShadowRects(values, spec);

  if (drawn) {
    this.stats.shadowDraws++;
  }

  return drawn;
};

PS.render.WebGPURenderer.prototype.drawParticle = function drawWebgpuRendererParticle(x, y, color, size) {
  var spec = size && typeof size === "object" ? size : {};
  var particleSize = Math.max(1, Number(spec.size !== undefined ? spec.size : size) || 1);
  var rgba = this.normalizeColor(color, spec.alpha !== undefined ? spec.alpha : 1);
  var values = this.particleRectScratch;
  var drawn;

  writeRectValues(
    values,
    x,
    y,
    Math.max(1, Number(spec.width) || particleSize),
    Math.max(1, Number(spec.height) || particleSize),
    rgba
  );

  if (!PS.render.webgpuEntity || typeof PS.render.webgpuEntity.drawParticleRects !== "function") {
    return false;
  }

  drawn = PS.render.webgpuEntity.drawParticleRects(values, spec);

  if (drawn) {
    this.stats.particleDraws++;
  }

  return drawn;
};

PS.render.WebGPURenderer.prototype.addLight = function addWebgpuRendererLight() {
  var light;

  if (!PS.render.webgpuPointLights || typeof PS.render.webgpuPointLights.queueLight !== "function") {
    return false;
  }

  light = PS.render.webgpuPointLights.queueLight.apply(PS.render.webgpuPointLights, arguments);

  if (light) {
    this.stats.lightCount++;
    return true;
  }

  return false;
};

PS.render.WebGPURenderer.prototype.clearIfNoWebGpuPassDrew = function clearIfNoWebgpuPassDrew() {
  var device = PS.gpu && PS.gpu.device;
  var context = PS.gpu && PS.gpu.context;
  var currentGlobeDraws = getRendererStateDrawCount(PS.render.webgpuGlobe);
  var currentTileDraws = getRendererStateDrawCount(PS.render.webgpuSurfaceTile);
  var currentUnderlayDraws = getRendererStateDrawCount(PS.render.webgpuSurfaceUnderlay);
  var encoder;
  var pass;

  if (
    currentGlobeDraws > this.frameStartGlobeDraws ||
    currentTileDraws > this.frameStartTileDraws ||
    currentUnderlayDraws > this.frameStartUnderlayDraws
  ) {
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

PS.render.WebGPURenderer.prototype.endFrame = function endWebgpuRendererFrame() {
  var inputs = getEndFrameInputs(this);

  assignFrameTimingStats(this, inputs);
  assignTerrainFrameStats(this.stats, inputs.surfaceState, inputs.terrainMs);
  assignEntityFrameStats(this.stats, inputs.entityStats);
  assignAssetFrameStats(this.stats, inputs.equivalenceStats);
  assignLightFrameStats(this.stats, inputs.pointLightStats, inputs.tileLightStats);
  assignGlobeFrameStats(this, inputs.globeState, inputs.globeMs);
  assignContextFrameStats(this.stats, inputs.clearSubmitted);
  return this.getStats();
};

PS.render.webgpuRenderer = PS.render.webgpuRenderer || new PS.render.WebGPURenderer();
PS.render.renderer.setActive(PS.render.webgpuRenderer);
