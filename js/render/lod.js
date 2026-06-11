"use strict";
PS.render = PS.render || {};
PS.render.lod = PS.render.lod || {};

PS.render.lod.tiers = [
  { name: "galaxy", min: 1, max: 3 },
  { name: "planet", min: 3, max: 6 },
  { name: "continent", min: 6, max: 10 },
  { name: "region", min: 10, max: 15 },
  { name: "local", min: 15, max: 20 }
];

PS.render.lod.levels = {
  SURFACE: "SURFACE",
  AREA: "AREA",
  REGION: "REGION",
  WORLD: "WORLD"
};

PS.render.lod.levelOrder = [
  PS.render.lod.levels.SURFACE,
  PS.render.lod.levels.AREA,
  PS.render.lod.levels.REGION,
  PS.render.lod.levels.WORLD
];

PS.render.lod.levelBands = [
  { name: PS.render.lod.levels.SURFACE, minZoomOut: 0, maxZoomOut: 2 },
  { name: PS.render.lod.levels.AREA, minZoomOut: 3, maxZoomOut: 5 },
  { name: PS.render.lod.levels.REGION, minZoomOut: 6, maxZoomOut: 8 },
  { name: PS.render.lod.levels.WORLD, minZoomOut: 9, maxZoomOut: Infinity }
];

PS.render.lod.visualPolicies = {};
PS.render.lod.visualPolicies[PS.render.lod.levels.SURFACE] = {
  level: PS.render.lod.levels.SURFACE,
  renderBudgetMs: 16,
  treeSway: 1,
  crownShimmerAlpha: 0.5,
  fallingLeavesPerTree: 4,
  vegetationMode: "sprites",
  vegetationSpriteScale: 1,
  vegetationShadowAlpha: 1,
  shadowIterations: 4,
  waterUvScrollScale: 1,
  normalMappedLighting: "per-pixel",
  normalLightingStrength: 1,
  autotileTransitions: "full",
  transitionAlphaScale: 1,
  pointLightScale: 1
};
PS.render.lod.visualPolicies[PS.render.lod.levels.AREA] = {
  level: PS.render.lod.levels.AREA,
  renderBudgetMs: 12,
  treeSway: 0.35,
  crownShimmerAlpha: 0,
  fallingLeavesPerTree: 0,
  vegetationMode: "sprites",
  vegetationSpriteScale: 0.78,
  vegetationShadowAlpha: 0.55,
  shadowIterations: 2,
  waterUvScrollScale: 0.45,
  normalMappedLighting: "reduced",
  normalLightingStrength: 0.6,
  autotileTransitions: "simplified",
  transitionAlphaScale: 0.55,
  pointLightScale: 0.5
};
PS.render.lod.visualPolicies[PS.render.lod.levels.REGION] = {
  level: PS.render.lod.levels.REGION,
  renderBudgetMs: 8,
  treeSway: 0,
  crownShimmerAlpha: 0,
  fallingLeavesPerTree: 0,
  vegetationMode: "dots",
  vegetationSpriteScale: 0,
  vegetationShadowAlpha: 0,
  shadowIterations: 1,
  waterUvScrollScale: 0.2,
  normalMappedLighting: "per-tile",
  normalLightingStrength: 0.3,
  autotileTransitions: "simplified",
  transitionAlphaScale: 0.25,
  pointLightScale: 0.2
};
PS.render.lod.visualPolicies[PS.render.lod.levels.WORLD] = {
  level: PS.render.lod.levels.WORLD,
  renderBudgetMs: 4,
  treeSway: 0,
  crownShimmerAlpha: 0,
  fallingLeavesPerTree: 0,
  vegetationMode: "minimap",
  vegetationSpriteScale: 0,
  vegetationShadowAlpha: 0,
  shadowIterations: 0,
  waterUvScrollScale: 0,
  normalMappedLighting: "disabled",
  normalLightingStrength: 0,
  autotileTransitions: "disabled",
  transitionAlphaScale: 0,
  pointLightScale: 0
};

PS.render.lod.getZoomOutValue = function (zoomLevel) {
  if (PS.camera && typeof PS.camera.getZoomLevels === "function") {
    var levels = PS.camera.getZoomLevels();
    var maxIndex = Math.max(0, levels.length - 1);
    var normalizedZoom = clamp(Number(zoomLevel) || 0, 0, maxIndex);

    return Math.max(0, maxIndex - normalizedZoom);
  }

  if (PS.camera && typeof PS.camera.getZoomOutShift === "function") {
    return PS.camera.getZoomOutShift(zoomLevel);
  }

  return Math.max(0, Number(zoomLevel) || 0);
};

PS.render.lod.getVisualLevel = function (zoomLevel) {
  var zoom = zoomLevel !== undefined
    ? Number(zoomLevel) || 0
    : typeof world !== "undefined" && world && world.planetView
      ? Number(world.planetView.zoomLevel) || 0
      : 0;
  var zoomOut = PS.render.lod.getZoomOutValue(zoom);

  for (var i = 0; i < PS.render.lod.levelBands.length; i += 1) {
    var band = PS.render.lod.levelBands[i];
    if (zoomOut >= band.minZoomOut && zoomOut <= band.maxZoomOut) {
      return band.name;
    }
  }

  return PS.render.lod.levels.WORLD;
};

PS.render.lod.getTransitionAmount = function (zoomLevel) {
  var zoom = zoomLevel !== undefined
    ? Number(zoomLevel) || 0
    : typeof world !== "undefined" && world && world.planetView
      ? Number(world.planetView.zoomLevel) || 0
      : 0;
  var zoomOut = PS.render.lod.getZoomOutValue(zoom);
  var fraction = Math.abs(zoomOut - Math.round(zoomOut));
  var edgeDistance = Math.min(fraction, 1 - fraction);

  return PS.render.lod.smoothstep(0.28, 0, edgeDistance);
};

PS.render.lod.getVisualPolicy = function (zoomLevel) {
  var zoom = zoomLevel !== undefined
    ? Number(zoomLevel) || 0
    : typeof world !== "undefined" && world && world.planetView
      ? Number(world.planetView.zoomLevel) || 0
      : 0;
  var level = PS.render.lod.getVisualLevel(zoom);
  var policy = PS.render.lod.visualPolicies[level] || PS.render.lod.visualPolicies[PS.render.lod.levels.SURFACE];

  return Object.assign({}, policy, {
    zoomOut: PS.render.lod.getZoomOutValue(zoom),
    transitionAlpha: PS.render.lod.getTransitionAmount(zoom)
  });
};

PS.render.lod.getArchitectureZoom = function (zoomLevel) {
  var levels = PS.camera && typeof PS.camera.getZoomLevels === "function"
    ? PS.camera.getZoomLevels()
    : [{}, {}];
  var maxIndex = Math.max(1, levels.length - 1);
  var normalizedZoom = clamp(Number(zoomLevel) || 0, 0, maxIndex);

  return 1 + normalizedZoom / maxIndex * 19;
};

PS.render.lod.getTierIndexForArchitectureZoom = function (architectureZoom) {
  var zoom = clamp(Number(architectureZoom) || 1, 1, 20);

  for (var i = 0; i < PS.render.lod.tiers.length; i++) {
    var tier = PS.render.lod.tiers[i];

    if (zoom >= tier.min && (zoom < tier.max || i === PS.render.lod.tiers.length - 1)) {
      return i;
    }
  }

  return PS.render.lod.tiers.length - 1;
};

PS.render.lod.getTier = function (zoomLevel) {
  var architectureZoom = PS.render.lod.getArchitectureZoom(zoomLevel);
  var tierIndex = PS.render.lod.getTierIndexForArchitectureZoom(architectureZoom);
  var tier = PS.render.lod.tiers[tierIndex];
  var span = Math.max(0.0001, tier.max - tier.min);
  var amount = clamp((architectureZoom - tier.min) / span, 0, 1);
  var blendWindow = 0.18;
  var nextTier = PS.render.lod.tiers[Math.min(PS.render.lod.tiers.length - 1, tierIndex + 1)];
  var previousTier = PS.render.lod.tiers[Math.max(0, tierIndex - 1)];
  var blendToNext = tierIndex < PS.render.lod.tiers.length - 1
    ? clamp((amount - (1 - blendWindow)) / blendWindow, 0, 1)
    : 0;
  var blendFromPrevious = tierIndex > 0
    ? clamp((blendWindow - amount) / blendWindow, 0, 1)
    : 0;

  return {
    name: tier.name,
    index: tierIndex,
    architectureZoom: architectureZoom,
    min: tier.min,
    max: tier.max,
    amount: amount,
    previousName: previousTier.name,
    nextName: nextTier.name,
    blendFromPrevious: blendFromPrevious,
    blendToNext: blendToNext,
    transitionAlpha: Math.max(blendFromPrevious, blendToNext)
  };
};

PS.render.lod.getZoomDirection = function () {
  var view = PS.camera && typeof PS.camera.getView === "function"
    ? PS.camera.getView()
    : world && world.planetView
      ? world.planetView
      : {};

  return Number(view.zoomDirection) || 0;
};

PS.render.lod.getPreloadSurfaceLodIndex = function () {
  if (!PS.camera || typeof PS.camera.getSurfaceLodZoomIndex !== "function" || typeof PS.camera.getZoomLevels !== "function") {
    return 0;
  }

  var direction = PS.render.lod.getZoomDirection();
  var view = typeof PS.camera.getView === "function"
    ? PS.camera.getView()
    : world && world.planetView
      ? world.planetView
      : {};
  var current = PS.camera.getSurfaceLodZoomIndex(view.zoomLevel);
  var levels = PS.camera.getZoomLevels();

  if (direction > 0) {
    return clamp(current + 1, 1, levels.length - 1);
  }

  if (direction < 0) {
    return clamp(current - 1, 1, levels.length - 1);
  }

  return current;
};

PS.render.lod.smoothstep = function (edge0, edge1, value) {
  var span = Number(edge1) - Number(edge0);
  var t = span === 0
    ? 0
    : clamp((Number(value) - Number(edge0)) / span, 0, 1);

  return t * t * (3 - 2 * t);
};

PS.render.lod.interpolateAlphaKeyframes = function (keyframes, zoomLevel) {
  var zoom = Number.isFinite(Number(zoomLevel)) ? Number(zoomLevel) : 0;
  var frames = Array.isArray(keyframes) ? keyframes : [];

  if (frames.length <= 0) {
    return 0;
  }

  if (zoom <= frames[0].zoom) {
    return frames[0].value;
  }

  for (var i = 1; i < frames.length; i += 1) {
    var previous = frames[i - 1];
    var next = frames[i];

    if (zoom <= next.zoom) {
      var amount = PS.render.lod.smoothstep(previous.zoom, next.zoom, zoom);
      return previous.value + (next.value - previous.value) * amount;
    }
  }

  return frames[frames.length - 1].value;
};

PS.render.lod.getLayerAlphas = function (zoomLevel) {
  var zoom = Number.isFinite(Number(zoomLevel))
    ? Number(zoomLevel)
    : world && world.planetView
      ? Number(world.planetView.zoomLevel) || 0
      : 0;
  var globe = PS.render.lod.interpolateAlphaKeyframes([
    { zoom: 0.0, value: 1.0 },
    { zoom: 0.9, value: 0.7 },
    { zoom: 1.1, value: 0.2 },
    { zoom: 1.4, value: 0.0 },
    { zoom: 2.5, value: 0.0 }
  ], zoom);
  var underlay = PS.render.lod.interpolateAlphaKeyframes([
    { zoom: 0.0, value: 0.0 },
    { zoom: 0.9, value: 0.2 },
    { zoom: 1.1, value: 0.8 },
    { zoom: 1.4, value: 0.4 },
    { zoom: 2.5, value: 0.0 }
  ], zoom);
  var tiles = PS.render.lod.interpolateAlphaKeyframes([
    { zoom: 0.0, value: 0.0 },
    { zoom: 0.9, value: 0.0 },
    { zoom: 1.1, value: 0.3 },
    { zoom: 1.4, value: 1.0 },
    { zoom: 2.5, value: 1.0 }
  ], zoom);

  return {
    globe: clamp(globe, 0, 1),
    continent: clamp(Math.max(underlay, 1 - Math.max(globe, tiles)), 0, 1),
    underlay: clamp(underlay, 0, 1),
    tiles: clamp(tiles, 0, 1),
    sprites: clamp(tiles, 0, 1)
  };
};

PS.render.lod.rebuildShaders = function () {};
PS.render.lod.rebuildTextures = function () {};
