"use strict";
import { PS } from "../core/namespace.js";
import { world } from "../systems/state.js";
import "./draw-order.js";

PS.render = PS.render || {};
PS.render.pipeline = PS.render.pipeline || {};
PS.render.pipeline.layers = PS.render.pipeline.layers || [];
PS.render.pipeline.stats = PS.render.pipeline.stats || {
  frameCount: 0,
  zoomLevel: 0,
  zoomBand: "orbit",
  lodTier: "galaxy",
  lodTierIndex: 0,
  transitionAlpha: 0,
  preloadSurfaceLodIndex: 0,
  visualLevel: "SURFACE",
  visualBudgetMs: 16,
  submittedLayers: 0,
  skippedLayers: 0,
  blendedLayers: 0,
  lastFrameMs: 0,
  zoomFrame: null
};

PS.render.pipeline.bandOrder = {
  orbit: 0,
  planet: 1,
  continent: 2,
  region: 3,
  local: 4,
  settlement: 5
};

PS.render.pipeline.tierToBand = {
  galaxy: "orbit",
  planet: "planet",
  continent: "continent",
  region: "region",
  local: "local"
};

PS.render.pipeline.tierOrder = {
  galaxy: 0,
  planet: 1,
  continent: 2,
  region: 3,
  local: 4
};

PS.render.pipeline.registerLayer = function (id, layer) {
  var layerId = String(id || "").trim();
  var nextLayer = layer || {};

  if (!layerId) {
    throw new Error("Render layer id is required");
  }

  nextLayer.id = layerId;

  for (var i = 0; i < PS.render.pipeline.layers.length; i++) {
    if (PS.render.pipeline.layers[i].id === layerId) {
      PS.render.pipeline.layers[i] = nextLayer;
      return nextLayer;
    }
  }

  PS.render.pipeline.layers.push(nextLayer);
  PS.render.pipeline.layers.sort(function (a, b) {
    return (Number(a.order) || 0) - (Number(b.order) || 0);
  });
  return nextLayer;
};

PS.render.pipeline.getZoomBand = function (zoomLevel) {
  var zoom = Number.isFinite(Number(zoomLevel)) ? Number(zoomLevel) : Number(world && world.planetView && world.planetView.zoomLevel) || 0;
  var architectureZoom = PS.render.lod && typeof PS.render.lod.getArchitectureZoom === "function"
    ? PS.render.lod.getArchitectureZoom(zoom)
    : zoom;

  if (architectureZoom < 3) {
    return "orbit";
  }

  if (architectureZoom < 6) {
    return "planet";
  }

  if (architectureZoom < 10) {
    return "continent";
  }

  if (architectureZoom < 15) {
    return "region";
  }

  if (architectureZoom < 19) {
    return "local";
  }

  return "settlement";
};

PS.render.pipeline.getLayerManifest = function () {
  return PS.render.pipeline.layers.map(function (layer) {
    return {
      id: layer.id,
      order: layer.order,
      drawLayer: layer.drawLayer,
      drawLayerName: PS.render.DrawLayerNames && PS.render.DrawLayerNames[layer.drawLayer],
      family: layer.family,
      semantic: layer.semantic,
      minBand: layer.minBand || "orbit",
      maxBand: layer.maxBand || "settlement",
      minTier: layer.minTier || "",
      maxTier: layer.maxTier || ""
    };
  });
};

PS.render.pipeline.getBandRank = function (band) {
  var normalized = String(band || "orbit");
  return Object.prototype.hasOwnProperty.call(PS.render.pipeline.bandOrder, normalized)
    ? PS.render.pipeline.bandOrder[normalized]
    : 0;
};

PS.render.pipeline.getTierRank = function (tierName) {
  var normalized = String(tierName || "galaxy");
  return Object.prototype.hasOwnProperty.call(PS.render.pipeline.tierOrder, normalized)
    ? PS.render.pipeline.tierOrder[normalized]
    : 0;
};

PS.render.pipeline.getLodState = function () {
  var zoomLevel = world && world.planetView ? Number(world.planetView.zoomLevel) || 0 : 0;
  var tier = PS.render.lod && typeof PS.render.lod.getTier === "function"
    ? PS.render.lod.getTier(zoomLevel)
    : {
      name: "galaxy",
      index: 0,
      previousName: "galaxy",
      nextName: "planet",
      blendFromPrevious: 0,
      blendToNext: 0,
      transitionAlpha: 0
    };
  var preloadIndex = PS.render.lod && typeof PS.render.lod.getPreloadSurfaceLodIndex === "function"
    ? PS.render.lod.getPreloadSurfaceLodIndex()
    : 0;
  var visualPolicy = PS.render.lod && typeof PS.render.lod.getVisualPolicy === "function"
    ? PS.render.lod.getVisualPolicy(zoomLevel)
    : { level: "SURFACE", renderBudgetMs: 16, transitionAlpha: 0 };
  var lodState;

  lodState = {
    zoomLevel: zoomLevel,
    zoomBand: PS.render.pipeline.getZoomBand(zoomLevel),
    tier: tier,
    tierName: tier.name,
    tierIndex: tier.index,
    previousTierName: tier.previousName,
    nextTierName: tier.nextName,
    previousBand: PS.render.pipeline.tierToBand[tier.previousName] || "orbit",
    nextBand: PS.render.pipeline.tierToBand[tier.nextName] || "settlement",
    transitionAlpha: Number(tier.transitionAlpha) || 0,
    blendFromPrevious: Number(tier.blendFromPrevious) || 0,
    blendToNext: Number(tier.blendToNext) || 0,
    preloadSurfaceLodIndex: preloadIndex,
    visualPolicy: visualPolicy,
    visualLevel: visualPolicy.level,
    visualBudgetMs: visualPolicy.renderBudgetMs
  };

  lodState.zoomFrame = PS.render.lod && typeof PS.render.lod.getFrameContract === "function"
    ? PS.render.lod.getFrameContract(zoomLevel, { lodState: lodState })
    : null;

  return lodState;
};

PS.render.pipeline.isLayerInBand = function (layer, band) {
  var rank = PS.render.pipeline.getBandRank(band);
  var minRank = PS.render.pipeline.getBandRank(layer.minBand || "orbit");
  var maxRank = PS.render.pipeline.getBandRank(layer.maxBand || "settlement");

  return rank >= minRank && rank <= maxRank;
};

PS.render.pipeline.isLayerInTier = function (layer, tierName) {
  if (!layer.minTier && !layer.maxTier) {
    return PS.render.pipeline.isLayerInBand(
      layer,
      PS.render.pipeline.tierToBand[tierName] || "orbit"
    );
  }

  var rank = PS.render.pipeline.getTierRank(tierName);
  var minRank = PS.render.pipeline.getTierRank(layer.minTier || "galaxy");
  var maxRank = PS.render.pipeline.getTierRank(layer.maxTier || "local");

  return rank >= minRank && rank <= maxRank;
};

PS.render.pipeline.getLayerLodAlpha = function (layer, lodState) {
  if (!layer || !lodState) {
    return 0;
  }

  if (PS.render.pipeline.isLayerInTier(layer, lodState.tierName)) {
    return 1;
  }

  if (lodState.blendFromPrevious > 0 && PS.render.pipeline.isLayerInTier(layer, lodState.previousTierName)) {
    return lodState.blendFromPrevious;
  }

  if (lodState.blendToNext > 0 && PS.render.pipeline.isLayerInTier(layer, lodState.nextTierName)) {
    return lodState.blendToNext;
  }

  return 0;
};

PS.render.pipeline.publishFrameStats = function (lodState, frameStats, elapsed) {
  var stats = PS.render.pipeline.stats;

  stats.frameCount++;
  stats.zoomLevel = lodState.zoomLevel;
  stats.zoomBand = lodState.zoomBand;
  stats.lodTier = lodState.tierName;
  stats.lodTierIndex = lodState.tierIndex;
  stats.transitionAlpha = lodState.transitionAlpha;
  stats.preloadSurfaceLodIndex = lodState.preloadSurfaceLodIndex;
  stats.visualLevel = lodState.visualLevel;
  stats.visualBudgetMs = lodState.visualBudgetMs;
  stats.submittedLayers = frameStats.submittedLayers;
  stats.skippedLayers = frameStats.skippedLayers;
  stats.blendedLayers = frameStats.blendedLayers;
  stats.lastFrameMs = elapsed;
  stats.zoomFrame = lodState.zoomFrame || (PS.render.lod && typeof PS.render.lod.getFrameContract === "function"
    ? PS.render.lod.getFrameContract(lodState.zoomLevel, {
      lodState: lodState,
      frameStats: frameStats,
      elapsed: elapsed
    })
    : null);
  if (stats.zoomFrame) {
    stats.zoomFrame.frameStats = {
      submittedLayers: frameStats.submittedLayers,
      skippedLayers: frameStats.skippedLayers,
      blendedLayers: frameStats.blendedLayers,
      elapsedMs: elapsed
    };
    if (PS.render.surfaceRender && typeof PS.render.surfaceRender.getCacheStats === "function") {
      stats.zoomFrame.readiness = Object.assign({}, stats.zoomFrame.readiness || {}, {
        coverage: PS.render.surfaceRender.getCacheStats()
      });
    }
  }

  if (PS.render.renderer && PS.render.renderer.active && PS.render.renderer.active.stats) {
    PS.render.renderer.active.stats.lodTier = stats.lodTier;
    PS.render.renderer.active.stats.lodTierIndex = stats.lodTierIndex;
    PS.render.renderer.active.stats.lodTransitionAlpha = stats.transitionAlpha;
    PS.render.renderer.active.stats.preloadSurfaceLodIndex = stats.preloadSurfaceLodIndex;
    PS.render.renderer.active.stats.visualLodLevel = stats.visualLevel;
    PS.render.renderer.active.stats.visualLodBudgetMs = stats.visualBudgetMs;
    PS.render.renderer.active.stats.zoomFrame = stats.zoomFrame;
  }

  return stats;
};

PS.render.pipeline.getStats = function () {
  return Object.assign({}, PS.render.pipeline.stats);
};

PS.render.pipeline.drawLayer = function (layer, lodState, frameStats) {
  var alpha = PS.render.pipeline.getLayerLodAlpha(layer, lodState);

  if (!layer || typeof layer.draw !== "function") {
    return;
  }

  if (alpha <= 0) {
    if (frameStats) {
      frameStats.skippedLayers++;
    }
    return;
  }

  if (frameStats) {
    frameStats.submittedLayers++;
    if (alpha < 1) {
      frameStats.blendedLayers++;
    }
  }

  if (PS.render.drawOrder && typeof PS.render.drawOrder.submit === "function") {
    PS.render.drawOrder.submit(layer.drawLayer, {
      id: layer.id,
      draw: function () {
        layer.draw(lodState, alpha);
      },
      lodAlpha: alpha,
      lodState: lodState
    });
    return;
  }

  layer.draw(lodState, alpha);
};

PS.render.pipeline.drawWorld = function () {
  var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  var lodState = PS.render.pipeline.getLodState();
  var frameStats = {
    submittedLayers: 0,
    skippedLayers: 0,
    blendedLayers: 0
  };

  if (PS.render.renderer && typeof PS.render.renderer.beginFrame === "function") {
    if (PS.render.renderer.active && PS.render.renderer.active.stats) {
      PS.render.renderer.active.stats.zoomFrame = lodState.zoomFrame;
    }
    PS.render.renderer.beginFrame(PS.camera && PS.camera.unified ? PS.camera.unified.getState() : null);
  }

  for (var i = 0; i < PS.render.pipeline.layers.length; i++) {
    PS.render.pipeline.drawLayer(PS.render.pipeline.layers[i], lodState, frameStats);
  }

  if (PS.render.drawOrder && typeof PS.render.drawOrder.flush === "function") {
    PS.render.drawOrder.flush(PS.render.renderer || null);
  }

  if (PS.render.renderer && typeof PS.render.renderer.endFrame === "function") {
    PS.render.renderer.endFrame();
  }

  PS.render.pipeline.publishFrameStats(
    lodState,
    frameStats,
    (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt
  );
};

if (typeof globalThis !== "undefined") {
  globalThis.drawWorld = drawWorld;
}

export function drawWorld() {
  PS.render.pipeline.drawWorld();
}

PS.render.pipeline.rebuildShaders = function () {};

PS.render.pipeline.rebuildTextures = function () {};

PS.render.rebuildShaders = function () {
  var subsystems = PS.render.getSubsystems();

  for (var i = 0; i < subsystems.length; i++) {
    if (typeof subsystems[i].rebuildShaders === "function") {
      subsystems[i].rebuildShaders();
    }
  }
};

PS.render.rebuildTextures = function () {
  var subsystems = PS.render.getSubsystems();

  for (var i = 0; i < subsystems.length; i++) {
    if (typeof subsystems[i].rebuildTextures === "function") {
      subsystems[i].rebuildTextures();
    }
  }
};

PS.render.getSubsystems = function () {
  return [
    PS.camera,
    PS.render.lod,
    PS.render.webgpuGlobe,
    PS.render.webgpuSurfaceUnderlay,
    PS.render.webgpuSurfaceTile,
    PS.render.webgpuPointLights,
    PS.render.webgpuWaterDisplacement,
    PS.render.webgpuEntity,
    PS.render.webgpuRenderer,
    PS.render.renderer,
    PS.render.terrain,
    PS.render.surfaceStreaming,
    PS.render.entities,
    PS.render.pipeline
  ];
};

PS.render.pipeline.registerLayer("terrain.base", {
  order: 20,
  drawLayer: PS.render.DrawLayer.TERRAIN_BASE,
  family: "terrain",
  semantic: "base terrain, biome, elevation, water, and local surface materials",
  minTier: "galaxy",
  maxTier: "local",
  draw: function (lodState) { PS.render.terrain.draw(lodState); }
});

PS.render.pipeline.registerLayer("overlays.reference", {
  order: 40,
  drawLayer: PS.render.DrawLayer.DEBUG_OVERLAY,
  family: "overlays",
  semantic: "scale, grid, and camera orientation",
  minTier: "galaxy",
  maxTier: "local",
  draw: function () {}
});

PS.render.pipeline.registerLayer("vegetation.world", {
  order: 35,
  drawLayer: PS.render.DrawLayer.VEGETATION_TRUNK,
  family: "vegetation",
  semantic: "Y-sorted world vegetation trunks, bushes, rocks, and tree canopy split passes",
  minTier: "continent",
  maxTier: "local",
  draw: function (lodState) { PS.render.vegetation.draw(lodState); }
});

PS.render.pipeline.registerLayer("vegetation.grass", {
  order: 34,
  drawLayer: PS.render.DrawLayer.TERRAIN_DECORATION,
  family: "vegetation",
  semantic: "4-bit grass density overlay tinted over terrain below world vegetation",
  minTier: "continent",
  maxTier: "local",
  draw: function (lodState) {
    if (PS.render.vegetation && typeof PS.render.vegetation.drawGrassOverlay === "function") {
      PS.render.vegetation.drawGrassOverlay(lodState);
    }
  }
});

PS.render.pipeline.registerLayer("environment.snow", {
  order: 33,
  drawLayer: PS.render.DrawLayer.TERRAIN_DECORATION,
  family: "environment",
  semantic: "threshold-based snow overlay with 2-bit base noise and context suppression",
  minTier: "continent",
  maxTier: "local",
  draw: function () {
    if (PS.render.environmentOverlays && typeof PS.render.environmentOverlays.drawSnowOverlay === "function") {
      PS.render.environmentOverlays.drawSnowOverlay();
    }
  }
});

PS.render.pipeline.registerLayer("water.displacement", {
  order: 32,
  drawLayer: PS.render.DrawLayer.WATER_SURFACE,
  family: "water",
  semantic: "shader-driven wind-scrolled water displacement passes",
  minTier: "continent",
  maxTier: "local",
  draw: function (lodState) {
    if (PS.render.webgpuWaterDisplacement && typeof PS.render.webgpuWaterDisplacement.draw === "function") {
      PS.render.webgpuWaterDisplacement.draw({ loadOp: "load", lodState: lodState });
    }
  }
});

PS.render.pipeline.registerLayer("environment.ice", {
  order: 32.5,
  drawLayer: PS.render.DrawLayer.WATER_SURFACE,
  family: "environment",
  semantic: "deterministic threshold ice overlay with water-local autotile masks",
  minTier: "continent",
  maxTier: "local",
  draw: function () {
    if (PS.render.environmentOverlays && typeof PS.render.environmentOverlays.drawIceOverlay === "function") {
      PS.render.environmentOverlays.drawIceOverlay();
    }
  }
});

PS.render.pipeline.registerLayer("environment.cloudShadows", {
  order: 36,
  drawLayer: PS.render.DrawLayer.SHADOW,
  family: "environment",
  semantic: "scrolling cloud shadow overlay from the environment system",
  minTier: "continent",
  maxTier: "local",
  draw: function (lodState) {
    if (PS.render.environmentOverlays && typeof PS.render.environmentOverlays.drawCloudShadowOverlay === "function") {
      PS.render.environmentOverlays.drawCloudShadowOverlay(lodState);
    }
  }
});

PS.render.pipeline.registerLayer("settlement.shadows", {
  order: 48,
  drawLayer: PS.render.DrawLayer.SHADOW,
  family: "settlement",
  semantic: "grounded shadows under settlement facades",
  minBand: "local",
  maxBand: "settlement",
  minTier: "local",
  maxTier: "local",
  draw: function () { PS.render.entities.drawSettlementShadows(); }
});

PS.render.pipeline.registerLayer("settlement.influence", {
  order: 50,
  drawLayer: PS.render.DrawLayer.ROUTE_OVERLAY,
  family: "settlement",
  semantic: "claimed land and borders",
  minTier: "region",
  maxTier: "local",
  draw: function () { PS.render.entities.drawSettlementInfluence(); }
});

PS.render.pipeline.registerLayer("settlement.routes", {
  order: 60,
  drawLayer: PS.render.DrawLayer.ROUTE_OVERLAY,
  family: "settlement",
  semantic: "routes, paths, and supply links",
  minBand: "region",
  maxBand: "settlement",
  minTier: "region",
  maxTier: "local",
  draw: function () { PS.render.entities.drawSettlementRoutes(); }
});

PS.render.pipeline.registerLayer("resources.food", {
  order: 70,
  drawLayer: PS.render.DrawLayer.ENTITY_GROUND,
  family: "resources",
  semantic: "food and resource objects",
  minTier: "continent",
  maxTier: "local",
  draw: function () { PS.render.entities.drawFood(); }
});

PS.render.pipeline.registerLayer("entities.presence", {
  order: 75,
  drawLayer: PS.render.DrawLayer.ENTITY_GROUND,
  family: "entities",
  semantic: "local-scale resource clusters, organism traces, settlement parcels, and route traffic",
  minBand: "region",
  maxBand: "settlement",
  minTier: "region",
  maxTier: "local",
  draw: function () { PS.render.entities.drawRepresentativeIntents(); }
});

PS.render.pipeline.registerLayer("settlement.readiness", {
  order: 76,
  drawLayer: PS.render.DrawLayer.ENTITY_GROUND,
  family: "settlement",
  semantic: "pre-settlement lineage pressure and founding readiness facades",
  minBand: "region",
  maxBand: "settlement",
  minTier: "region",
  maxTier: "local",
  draw: function () { PS.render.entities.drawSettlementReadiness(); }
});

PS.render.pipeline.registerLayer("settlement.structures", {
  order: 80,
  drawLayer: PS.render.DrawLayer.BUILDING_WALL,
  family: "settlement",
  semantic: "settlement cores, outposts, and colonies",
  minTier: "region",
  maxTier: "local",
  draw: function () { PS.render.entities.drawSettlements(); }
});

PS.render.pipeline.registerLayer("settlement.stockpiles", {
  order: 82,
  drawLayer: PS.render.DrawLayer.ENTITY_GROUND,
  family: "settlement",
  semantic: "accepted top-down stockpile facades around active settlements",
  minBand: "settlement",
  maxBand: "settlement",
  minTier: "local",
  maxTier: "local",
  draw: function () { PS.render.entities.drawSettlementStockpiles(); }
});

PS.render.pipeline.registerLayer("settlement.vegetation", {
  order: 84,
  drawLayer: PS.render.DrawLayer.ENTITY_GROUND,
  family: "settlement",
  semantic: "bounded vegetation facades around active settlements",
  minBand: "settlement",
  maxBand: "settlement",
  minTier: "local",
  maxTier: "local",
  draw: function () { PS.render.entities.drawSettlementVegetation(); }
});

PS.render.pipeline.registerLayer("settlement.citizens", {
  order: 86,
  drawLayer: PS.render.DrawLayer.ENTITY_SORTED,
  family: "settlement",
  semantic: "bounded citizen facades around active settlements",
  minBand: "settlement",
  maxBand: "settlement",
  minTier: "local",
  maxTier: "local",
  draw: function () { PS.render.entities.drawSettlementCitizens(); }
});

PS.render.pipeline.registerLayer("settlement.effects", {
  order: 88,
  drawLayer: PS.render.DrawLayer.PARTICLE_BELOW,
  family: "settlement",
  semantic: "accepted material and activity effect overlays for settlement proof scenes",
  minBand: "settlement",
  maxBand: "settlement",
  minTier: "local",
  maxTier: "local",
  draw: function () { PS.render.entities.drawSettlementEffects(); }
});

PS.render.pipeline.registerLayer("entities.organisms", {
  order: 90,
  drawLayer: PS.render.DrawLayer.ENTITY_SORTED,
  family: "entities",
  semantic: "living organisms and later citizens",
  minTier: "region",
  maxTier: "local",
  draw: function () { PS.render.entities.drawOrganisms(); }
});

PS.render.pipeline.registerLayer("weather.particles", {
  order: 95,
  drawLayer: PS.render.DrawLayer.WEATHER,
  family: "weather",
  semantic: "rain, snow, and weather particle effects",
  minBand: "region",
  maxBand: "settlement",
  minTier: "region",
  maxTier: "local",
  draw: function () {
    if (PS.render.particles) {
      PS.render.particles.emitFallingLeaves(PS.render.pipeline.getLodState());
      PS.render.particles.update(1 / 60);
      PS.render.particles.render(PS.camera && PS.camera.unified ? PS.camera.unified.getState() : null);
    }
  }
});

PS.render.pipeline.registerLayer("world.space", {
  order: 100,
  drawLayer: PS.render.DrawLayer.UI_WORLD,
  family: "world",
  semantic: "orbital assets, bodies, probes, sectors, fleets, and star maps",
  minTier: "galaxy",
  maxTier: "planet",
  draw: function () {}
});

PS.render.pipeline.registerLayer("world.events", {
  order: 104,
  drawLayer: PS.render.DrawLayer.UI_WORLD,
  family: "world",
  semantic: "orbit-scale milestone and watcher event markers",
  minBand: "orbit",
  maxBand: "planet",
  minTier: "galaxy",
  maxTier: "planet",
  draw: function () { PS.render.entities.drawOrbitEventMarkers(); }
});

PS.render.pipeline.registerLayer("lighting.ambient", {
  order: 110,
  drawLayer: PS.render.DrawLayer.PARTICLE_BELOW,
  family: "lighting",
  semantic: "additive point lights over the deferred WebGPU terrain composite",
  minTier: "galaxy",
  maxTier: "local",
  draw: function (lodState) {
    if (PS.render.webgpuPointLights && typeof PS.render.webgpuPointLights.drawQueued === "function") {
      var policy = lodState && lodState.visualPolicy ? lodState.visualPolicy : {};
      var pointLightScale = policy.pointLightScale !== undefined ? policy.pointLightScale : 1;

      if (Math.max(0, Number(pointLightScale) || 0) <= 0) {
        if (typeof PS.render.webgpuPointLights.takeQueuedLights === "function") {
          PS.render.webgpuPointLights.takeQueuedLights();
        }
        return;
      }

      PS.render.webgpuPointLights.drawQueued({
        loadOp: "load",
        pointLightScale: pointLightScale,
        pointLightExposureScale: pointLightScale,
        lodState: lodState
      });
    }
  }
});

PS.render.pipeline.registerLayer("status.selection", {
  order: 120,
  drawLayer: PS.render.DrawLayer.SELECTION_OVERLAY,
  family: "icons",
  semantic: "selection rings, status icons, warnings, and scanlines",
  minTier: "galaxy",
  maxTier: "local",
  draw: function () {}
});

PS.render.pipeline.registerLayer("settlement.workStatus", {
  order: 122,
  drawLayer: PS.render.DrawLayer.SELECTION_OVERLAY,
  family: "settlement",
  semantic: "accepted top-down work and room status overlays for settlement proof scenes",
  minBand: "settlement",
  maxBand: "settlement",
  minTier: "local",
  maxTier: "local",
  draw: function () { PS.render.entities.drawSettlementWorkStatus(); }
});

PS.render.pipeline.registerLayer("settlement.worldUi", {
  order: 124,
  drawLayer: PS.render.DrawLayer.UI_WORLD,
  family: "settlement",
  semantic: "world-space settlement status badges",
  minBand: "settlement",
  maxBand: "settlement",
  minTier: "local",
  maxTier: "local",
  draw: function () { PS.render.entities.drawSettlementWorldUi(); }
});

PS.render.pipeline.registerLayer("ui.minimap", {
  order: 130,
  drawLayer: PS.render.DrawLayer.UI_SCREEN,
  family: "ui",
  semantic: "world overview minimap with organism positions and viewport rectangle",
  minBand: "region",
  maxBand: "settlement",
  minTier: "region",
  maxTier: "local",
  draw: function (lodState, alpha) {
    if (PS.render.minimap && typeof PS.render.minimap.draw === "function") {
      PS.render.minimap.draw(lodState, alpha);
    }
  }
});
