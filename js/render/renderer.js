import { PS } from "../core/namespace.js";

PS.render = PS.render || {};

PS.render.Renderer = function (name) {
  this.name = String(name || "renderer");
  this.stats = {
    frameCount: 0,
    drawCalls: 0,
    triangleCount: 0,
    tilemapDraws: 0,
    spriteDraws: 0,
    shadowDraws: 0,
    particleDraws: 0,
    lightCount: 0,
    batchFlushes: 0,
    lastFrameMs: 0,
    pipelineFrameMs: 0,
    gpuFrameMs: 0,
    rendererGpuFrameMs: 0,
    frameBudgetMs: 16,
    overBudget: false,
    rendererOverBudget: false,
    directPresentsThisFrame: 0,
    singleVisibleCanvas: false,
    directSingleCanvas: false,
    lodTier: "galaxy",
    lodTierIndex: 0,
    lodTransitionAlpha: 0,
    preloadSurfaceLodIndex: 0,
    entityDraws: 0,
    settlementEntityDraws: 0,
    routeEntityDraws: 0,
    influenceEntityDraws: 0,
    shadowEntityDraws: 0,
    vegetationEntityDraws: 0,
    citizenEntityDraws: 0,
    worldUiEntityDraws: 0,
    stockpileEntityDraws: 0,
    workStatusEntityDraws: 0,
    effectEntityDraws: 0,
    pointLightDraws: 0,
    pointLightsSubmitted: 0,
    pointLightsCulled: 0,
    orbitEventMarkerDraws: 0,
    intentEntityDraws: 0,
    settlementReadinessEntityDraws: 0,
    observationOverlayActive: "none",
    observationOverlayUploads: 0,
    observationOverlaySamples: 0,
    observationOverlayFrameMs: 0,
    observationOverlayCompositor: "",
    zoomFrame: null,
    foodEntityDraws: 0,
    organismEntityDraws: 0,
    equivalenceTerrainDraws: 0,
    equivalenceTransitionDraws: 0,
    lastError: ""
  };
};

PS.render.Renderer.prototype.beginFrame = function () {};
PS.render.Renderer.prototype.drawTilemap = function () {};
PS.render.Renderer.prototype.drawSprite = function () {};
PS.render.Renderer.prototype.batchSprites = function () {};
PS.render.Renderer.prototype.drawShadow = function () {};
PS.render.Renderer.prototype.drawParticle = function () {};
PS.render.Renderer.prototype.addLight = function () {};
PS.render.Renderer.prototype.endFrame = function () {};

PS.render.Renderer.prototype.getStats = function () {
  return Object.assign({}, this.stats);
};

PS.render.renderer = PS.render.renderer || {
  active: null,

  setActive: function (renderer) {
    this.active = renderer || null;
    return this.active;
  },

  getActive: function () {
    return this.active;
  },

  beginFrame: function (camera) {
    return this.active && typeof this.active.beginFrame === "function"
      ? this.active.beginFrame(camera)
      : false;
  },

  drawTilemap: function (tileBuffer, camera) {
    return this.active && typeof this.active.drawTilemap === "function"
      ? this.active.drawTilemap(tileBuffer, camera)
      : false;
  },

  drawSprite: function (spriteId, x, y, opts) {
    return this.active && typeof this.active.drawSprite === "function"
      ? this.active.drawSprite(spriteId, x, y, opts)
      : false;
  },

  batchSprites: function (spriteList) {
    return this.active && typeof this.active.batchSprites === "function"
      ? this.active.batchSprites(spriteList)
      : false;
  },

  drawShadow: function (spriteId, x, y, dir) {
    return this.active && typeof this.active.drawShadow === "function"
      ? this.active.drawShadow(spriteId, x, y, dir)
      : false;
  },

  drawParticle: function (x, y, color, size) {
    return this.active && typeof this.active.drawParticle === "function"
      ? this.active.drawParticle(x, y, color, size)
      : false;
  },

  addLight: function (x, y, radius, color, intensity) {
    return this.active && typeof this.active.addLight === "function"
      ? this.active.addLight(x, y, radius, color, intensity)
      : false;
  },

  endFrame: function () {
    return this.active && typeof this.active.endFrame === "function"
      ? this.active.endFrame()
      : false;
  },

  getStats: function () {
    return this.active && typeof this.active.getStats === "function"
      ? this.active.getStats()
      : null;
  }
};
