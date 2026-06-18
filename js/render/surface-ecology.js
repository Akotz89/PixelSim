"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getClampedWorldY, getWrappedWorldX } from "./planet-grid.js";
import { getPlanetView } from "./planet-view.js";
import { countFoodInRadius } from "../sim/food-runtime.js";
import { countOrganismsInRadiusForLineage } from "../sim/organisms-indexes.js";
import { getNearestInfluencingSettlement } from "../sim/settlements-founding.js";
import { getSettlementById } from "../sim/settlements-state.js";
import { world } from "../systems/state.js";

PS.render = PS.render || {};
PS.render.surface = PS.render.surface || {};
PS.render.surface.ecology = PS.render.surface.ecology || {
  cache: {},
  frameKey: "",
  stats: {
    sampledCells: 0,
    activeCells: 0,
    foodPressureCells: 0,
    organismPressureCells: 0
  }
};
PS.render.surface.civilization = PS.render.surface.civilization || {
  cache: {},
  frameKey: "",
  stats: {
    sampledCells: 0,
    activeCells: 0,
    settlementCells: 0,
    routeCells: 0,
    borderCells: 0,
    farmCells: 0,
    yardCells: 0,
    blockCells: 0,
    productionCells: 0,
    roadCells: 0,
    trackCells: 0
  }
};

PS.render.surface.getEcologyFrameKey = function () {
  var view = typeof getPlanetView === "function" ? getPlanetView() : null;
  var zoom = view ? Math.round((Number(view.zoomLevel) || 0) * 10) / 10 : 0;
  var tickBucket = Math.floor(Math.max(0, Math.round(Number(world && world.tick) || 0)) / 30);
  return [
    tickBucket,
    zoom,
    Array.isArray(world && world.food) ? world.food.length : 0,
    Array.isArray(world && world.organisms) ? world.organisms.length : 0
  ].join(":");
};

PS.render.surface.ensureEcologyFrame = function () {
  var state = PS.render.surface.ecology;
  var frameKey = PS.render.surface.getEcologyFrameKey();

  if (state.frameKey !== frameKey) {
    state.cache = {};
    state.frameKey = frameKey;
    state.stats.sampledCells = 0;
    state.stats.activeCells = 0;
    state.stats.foodPressureCells = 0;
    state.stats.organismPressureCells = 0;
  }

  return state;
};

PS.render.surface.shouldEncodeEcology = function () {
  var view = typeof getPlanetView === "function" ? getPlanetView() : null;
  var minZoom = Math.max(0, Number(CONFIG.PLANET_SURFACE_ECOLOGY_MIN_ZOOM) || 4);

  return CONFIG.PLANET_SURFACE_ECOLOGY_ENABLED !== false &&
    view &&
    Number(view.zoomLevel) >= minZoom &&
    typeof countFoodInRadius === "function" &&
    typeof countOrganismsInRadiusForLineage === "function";
};

PS.render.surface.getEcologyBucket = function (count) {
  var safeCount = Math.max(0, Math.round(Number(count) || 0));

  if (safeCount >= 6) { return 3; }
  if (safeCount >= 3) { return 2; }
  if (safeCount >= 1) { return 1; }
  return 0;
};

PS.render.surface.getSampleEcology = function (sample) {
  if (!sample || !PS.render.surface.shouldEncodeEcology()) {
    return null;
  }

  var state = PS.render.surface.ensureEcologyFrame();
  var radius = Math.max(1, Math.round(Number(CONFIG.PLANET_SURFACE_ECOLOGY_RADIUS_TILES) || 4));
  var tileX = getWrappedWorldX(sample.x);
  var tileY = getClampedWorldY(sample.y);
  var key = tileX + ":" + tileY + ":" + radius;
  var cached = state.cache[key];

  if (cached !== undefined) {
    return cached;
  }

  var foodCount = countFoodInRadius(tileX, tileY, radius);
  var organismCount = countOrganismsInRadiusForLineage(tileX, tileY, radius, 0);
  var foodBucket = PS.render.surface.getEcologyBucket(foodCount);
  var organismBucket = PS.render.surface.getEcologyBucket(organismCount);
  var pressure = Math.max(foodBucket, organismBucket) / 3;

  state.stats.sampledCells++;

  if (foodBucket <= 0 && organismBucket <= 0) {
    state.cache[key] = null;
    return null;
  }

  cached = {
    key: "eco." + foodBucket + "." + organismBucket,
    foodCount: foodCount,
    organismCount: organismCount,
    foodBucket: foodBucket,
    organismBucket: organismBucket,
    foodPressure: foodBucket / 3,
    organismPressure: organismBucket / 3,
    organicMatter: Math.max(organismBucket / 3, foodBucket / 3),
    resourceRichness: foodBucket / 3,
    pressure: pressure
  };

  state.activeCells++;
  if (foodBucket > 0) {
    state.foodPressureCells++;
  }
  if (organismBucket > 0) {
    state.organismPressureCells++;
  }

  state.cache[key] = cached;
  return cached;
};

PS.render.surface.withEcology = function (sample) {
  var ecology = PS.render.surface.getSampleEcology(sample);

  if (!ecology) {
    return sample;
  }

  var nextSample = Object.assign({}, sample);
  var detail = sample && sample.detail ? Object.assign({}, sample.detail) : {};
  var signals = detail.materialSignals ? Object.assign({}, detail.materialSignals) : {};

  signals.organicMatter = Math.max(Number(signals.organicMatter) || 0, ecology.organicMatter);
  signals.nutrientRichness = Math.max(Number(signals.nutrientRichness) || 0, ecology.resourceRichness);
  detail.materialSignals = signals;
  detail.organicMatter = Math.max(Number(detail.organicMatter) || 0, ecology.organicMatter);
  detail.resourceFertility = Math.max(Number(detail.resourceFertility) || 0, ecology.resourceRichness);

  nextSample.detail = detail;
  nextSample.ecology = ecology;
  nextSample.resourceRichness = Math.max(Number(sample.resourceRichness) || 0, ecology.resourceRichness);
  return nextSample;
};

PS.render.surface.getCivilizationFrameKey = function () {
  var view = typeof getPlanetView === "function" ? getPlanetView() : null;
  var zoom = view ? Math.round((Number(view.zoomLevel) || 0) * 10) / 10 : 0;
  var tickBucket = Math.floor(Math.max(0, Math.round(Number(world && world.tick) || 0)) / 30);
  return [
    tickBucket,
    zoom,
    Array.isArray(world && world.settlements) ? world.settlements.length : 0,
    Array.isArray(world && world.settlementRoutes) ? world.settlementRoutes.length : 0
  ].join(":");
};

PS.render.surface.ensureCivilizationFrame = function () {
  var state = PS.render.surface.civilization;
  var frameKey = PS.render.surface.getCivilizationFrameKey();

  if (state.frameKey !== frameKey) {
    state.cache = {};
    state.frameKey = frameKey;
    state.stats.sampledCells = 0;
    state.stats.activeCells = 0;
    state.stats.settlementCells = 0;
    state.stats.routeCells = 0;
    state.stats.borderCells = 0;
    state.stats.farmCells = 0;
    state.stats.yardCells = 0;
    state.stats.blockCells = 0;
    state.stats.productionCells = 0;
    state.stats.roadCells = 0;
    state.stats.trackCells = 0;
  }

  return state;
};

PS.render.surface.shouldEncodeCivilization = function () {
  var view = typeof getPlanetView === "function" ? getPlanetView() : null;
  var minZoom = Math.max(0, Number(CONFIG.PLANET_SURFACE_CIVILIZATION_MIN_ZOOM) || 4);

  return CONFIG.PLANET_SURFACE_CIVILIZATION_ENABLED !== false &&
    view &&
    Number(view.zoomLevel) >= minZoom &&
    (Array.isArray(world && world.settlements) || Array.isArray(world && world.settlementRoutes));
};

PS.render.surface.getCivilizationBucket = function (pressure) {
  var amount = clamp(Number(pressure) || 0, 0, 1);

  if (amount >= 0.67) { return 3; }
  if (amount >= 0.34) { return 2; }
  if (amount > 0) { return 1; }
  return 0;
};

PS.render.surface.getSettlementCivilizationFamily = function (settlement, district) {
  if (!settlement) {
    return "yard";
  }
  if (district && district.family) {
    return district.family;
  }
  if (Number(settlement.productionPressure) > 0.42 || Number(settlement.development) >= 90) {
    return "production";
  }
  if (Number(settlement.farmPressure) > 0.42 || Number(settlement.storedFood) > Number(settlement.development)) {
    return "farm";
  }
  if (settlement.isColony || Number(settlement.level) >= 4) {
    return "block";
  }
  return "yard";
};

PS.render.surface.getRouteCivilizationFamily = function (route) {
  if (!route) {
    return "track";
  }
  if (Number(route.waterPressure) > 0.45) {
    return "canal";
  }
  if (Number(route.dockPressure) > 0.45) {
    return "dock";
  }
  return Number(route.foodTransferred) >= 24 || route.isActive !== false ? "road" : "track";
};

PS.render.surface.getSampleSurfaceMeters = function (sample) {
  if (!sample || !Number.isFinite(Number(sample.latitude)) || !Number.isFinite(Number(sample.longitude))) {
    return null;
  }

  return PS.render && PS.render.globe && typeof PS.render.globe.getSurfaceMeters === "function"
    ? PS.render.globe.getSurfaceMeters(sample.latitude, sample.longitude)
    : null;
};

PS.render.surface.getSettlementSurfaceMeters = function (settlement) {
  if (!settlement || !Number.isFinite(Number(settlement.latitude)) || !Number.isFinite(Number(settlement.longitude))) {
    return null;
  }

  return PS.render && PS.render.globe && typeof PS.render.globe.getSurfaceMeters === "function"
    ? PS.render.globe.getSurfaceMeters(settlement.latitude, settlement.longitude)
    : null;
};

PS.render.surface.getSettlementDistrictRadiusMeters = function (settlement) {
  var radius = Math.max(1, Number(settlement && settlement.radius) || Number(CONFIG.SETTLEMENT_RADIUS) || 4);
  var claimedTiles = Math.max(0, Number(settlement && settlement.claimedTiles) || 0);
  var population = Math.max(0, Number(settlement && settlement.population) || 0);
  return Math.max(18, Math.min(118, radius * 5 + Math.sqrt(claimedTiles) * 0.45 + Math.sqrt(population) * 0.45));
};

PS.render.surface.getSettlementInfluenceRadiusMeters = function (settlement) {
  var influenceRadius = Math.max(
    Number(settlement && settlement.radius) || Number(CONFIG.SETTLEMENT_RADIUS) || 4,
    Number(settlement && settlement.influenceRadius) || 0
  );
  return Math.max(34, Math.min(240, influenceRadius * 8));
};

PS.render.surface.getSettlementMetricContext = function (sample, settlement) {
  var sampleMeters = PS.render.surface.getSampleSurfaceMeters(sample);
  var settlementMeters = PS.render.surface.getSettlementSurfaceMeters(settlement);
  var dx;
  var dy;
  var distance;
  var angle;
  var radiusMeters;

  if (!sampleMeters || !settlementMeters) {
    return null;
  }

  dx = Number(sampleMeters.eastMeters) - Number(settlementMeters.eastMeters);
  dy = Number(sampleMeters.northMeters) - Number(settlementMeters.northMeters);
  distance = Math.sqrt(dx * dx + dy * dy);
  angle = Math.atan2(dy, dx);
  radiusMeters = PS.render.surface.getSettlementDistrictRadiusMeters(settlement);

  return {
    dxMeters: dx,
    dyMeters: dy,
    distanceMeters: distance,
    angle: angle,
    ring: clamp(distance / Math.max(1, radiusMeters), 0, 2),
    radiusMeters: radiusMeters,
    influenceRadiusMeters: PS.render.surface.getSettlementInfluenceRadiusMeters(settlement)
  };
};

PS.render.surface.getNearestMetricSettlement = function (sample, fallbackTileX, fallbackTileY) {
  var settlements = Array.isArray(world && world.settlements) ? world.settlements : [];
  var best = null;
  var bestContext = null;
  var bestDistance = Infinity;

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var context = PS.render.surface.getSettlementMetricContext(sample, settlement);

    if (!context || settlement && settlement.isActive === false) {
      continue;
    }

    if (context.distanceMeters < bestDistance && context.distanceMeters <= context.influenceRadiusMeters * 1.15) {
      best = settlement;
      bestContext = context;
      bestDistance = context.distanceMeters;
    }
  }

  if (best) {
    return {
      settlement: best,
      context: bestContext
    };
  }

  return {
    settlement: typeof getNearestInfluencingSettlement === "function" ? getNearestInfluencingSettlement(fallbackTileX, fallbackTileY) : null,
    context: null
  };
};

PS.render.surface.getMetricRouteDistanceToSample = function (route, sample) {
  var sampleMeters = PS.render.surface.getSampleSurfaceMeters(sample);
  var parent = typeof getSettlementById === "function" ? getSettlementById(route.parentSettlementId) : null;
  var child = typeof getSettlementById === "function" ? getSettlementById(route.childSettlementId) : null;
  var parentMeters;
  var childMeters;
  var dx;
  var dy;
  var lengthSq;
  var t;
  var px;
  var py;

  if (!parent && world && world.settlementsById) {
    parent = world.settlementsById[String(route.parentSettlementId)] || null;
  }
  if (!child && world && world.settlementsById) {
    child = world.settlementsById[String(route.childSettlementId)] || null;
  }

  parentMeters = PS.render.surface.getSettlementSurfaceMeters(parent);
  childMeters = PS.render.surface.getSettlementSurfaceMeters(child);

  if (!sampleMeters || !parentMeters || !childMeters) {
    return Infinity;
  }

  dx = Number(childMeters.eastMeters) - Number(parentMeters.eastMeters);
  dy = Number(childMeters.northMeters) - Number(parentMeters.northMeters);
  lengthSq = dx * dx + dy * dy;

  if (lengthSq <= 0) {
    return Math.sqrt(
      Math.pow(Number(sampleMeters.eastMeters) - Number(parentMeters.eastMeters), 2) +
      Math.pow(Number(sampleMeters.northMeters) - Number(parentMeters.northMeters), 2)
    );
  }

  t = ((Number(sampleMeters.eastMeters) - Number(parentMeters.eastMeters)) * dx + (Number(sampleMeters.northMeters) - Number(parentMeters.northMeters)) * dy) / lengthSq;
  t = clamp(t, 0, 1);
  px = Number(parentMeters.eastMeters) + dx * t;
  py = Number(parentMeters.northMeters) + dy * t;

  return Math.sqrt(
    Math.pow(Number(sampleMeters.eastMeters) - px, 2) +
    Math.pow(Number(sampleMeters.northMeters) - py, 2)
  );
};

PS.render.surface.getSettlementDistrictFamilyForSample = function (settlement, context, tileX, tileY, sample) {
  var development = Math.max(0, Math.min(1, Number(settlement && settlement.development) || 0));
  var storedFood = Math.max(Number(settlement && settlement.storedFood) || 0, Number(settlement && settlement.foodStock) || 0);
  var claimedFood = Math.max(0, Number(settlement && settlement.claimedFood) || 0);
  var population = Math.max(1, Number(settlement && settlement.population) || 1);
  var level = Math.max(1, Number(settlement && settlement.level) || 1);
  var ring = context ? Number(context.ring) || 0 : 0;
  var sampleX = Number.isFinite(Number(sample && sample.surfaceSampleX)) ? Number(sample.surfaceSampleX) : Number(tileX) || 0;
  var sampleY = Number.isFinite(Number(sample && sample.surfaceSampleY)) ? Number(sample.surfaceSampleY) : Number(tileY) || 0;
  var angle = context ? Number(context.angle) || 0 : (sampleX * 0.41 + sampleY * 0.29);
  var sector = Math.abs(Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 8 + sampleX * 0.07 + sampleY * 0.11)) % 8;
  var phase = Math.abs(Math.round(sampleX * 3 + sampleY * 5 + sector)) % 11;
  var foodBias = storedFood / Math.max(1, population * 1.2) + claimedFood / Math.max(1, population * 0.9);
  var explicitFarmPressure = Number(settlement && settlement.farmPressure) > 0.42;

  if (Number(settlement && settlement.productionPressure) > 0.42 || (development > 0.78 && (sector === 1 || sector === 5) && ring > 0.18 && ring < 0.64 && phase <= 3)) {
    return "production";
  }
  if (level >= 4 && development > 0.5 && ring < 0.56 && phase <= 6) {
    return "block";
  }
  if (
    explicitFarmPressure && (phase >= 6 || ring > 0.48 && (sector === 2 || sector === 3 || sector === 6)) ||
    foodBias > 1.25 && phase >= 5 ||
    ring > 0.56 && (sector === 2 || sector === 3 || sector === 6 || phase >= 8)
  ) {
    return "farm";
  }
  return "yard";
};

PS.render.surface.getRouteDistanceToSample = function (route, tileX, tileY) {
  var parent = typeof getSettlementById === "function" ? getSettlementById(route.parentSettlementId) : null;
  var child = typeof getSettlementById === "function" ? getSettlementById(route.childSettlementId) : null;
  var dx;
  var dy;
  var lengthSq;
  var t;
  var px;
  var py;

  if (!parent && world && world.settlementsById) {
    parent = world.settlementsById[String(route.parentSettlementId)] || null;
  }
  if (!child && world && world.settlementsById) {
    child = world.settlementsById[String(route.childSettlementId)] || null;
  }

  if (!parent || !child) {
    return Infinity;
  }

  dx = Number(child.x) - Number(parent.x);
  dy = Number(child.y) - Number(parent.y);
  lengthSq = dx * dx + dy * dy;

  if (lengthSq <= 0) {
    return Math.abs(tileX - Number(parent.x)) + Math.abs(tileY - Number(parent.y));
  }

  t = ((tileX - Number(parent.x)) * dx + (tileY - Number(parent.y)) * dy) / lengthSq;
  t = clamp(t, 0, 1);
  px = Number(parent.x) + dx * t;
  py = Number(parent.y) + dy * t;
  return Math.sqrt((tileX - px) * (tileX - px) + (tileY - py) * (tileY - py));
};

/**
 * @description Resolves the civilization overlay affecting a surface sample by checking settlement cores, influence fields, routes, outposts, and cached frame state.
 * @param {Object|null} sample Surface sample containing tile coordinates and terrain detail.
 * @returns {Object|null} Civilization overlay descriptor for the sample, or null when none applies.
 */
PS.render.surface.getSampleCivilization = function (sample) {
  if (!sample || !PS.render.surface.shouldEncodeCivilization()) {
    return null;
  }

  var state = PS.render.surface.ensureCivilizationFrame();
  var tileX = getWrappedWorldX(sample.x);
  var tileY = getClampedWorldY(sample.y);
  var routeRadius = Math.max(1, Math.round(Number(CONFIG.PLANET_SURFACE_CIVILIZATION_ROUTE_RADIUS_TILES) || 3));
  var sampleKeyX = Number.isFinite(Number(sample.surfaceSampleX))
    ? Math.round(Number(sample.surfaceSampleX) * 4) / 4
    : tileX;
  var sampleKeyY = Number.isFinite(Number(sample.surfaceSampleY))
    ? Math.round(Number(sample.surfaceSampleY) * 4) / 4
    : tileY;
  var key = tileX + ":" + tileY + ":" + sampleKeyX + ":" + sampleKeyY + ":" + routeRadius;
  var cached = state.cache[key];

  if (cached !== undefined) {
    return cached;
  }

  var nearestSettlement = PS.render.surface.getNearestMetricSettlement(sample, tileX, tileY);
  var settlement = nearestSettlement.settlement;
  var metricContext = nearestSettlement.context;
  var settlementDistance = metricContext ? metricContext.distanceMeters : (settlement ? Math.abs(Number(settlement.x) - tileX) + Math.abs(Number(settlement.y) - tileY) : Infinity);
  var settlementRadius = Math.max(1, Math.round(Number(settlement && settlement.radius) || Number(CONFIG.SETTLEMENT_RADIUS) || 4));
  var influenceRadius = Math.max(settlementRadius, Math.round(Number(settlement && settlement.influenceRadius) || settlementRadius));
  var settlementPressure = settlement ? clamp(1 - settlementDistance / (metricContext ? metricContext.radiusMeters : settlementRadius), 0, 1) : 0;
  var borderPressure = settlement ? clamp(
    1 - Math.abs(settlementDistance - (metricContext ? metricContext.influenceRadiusMeters : influenceRadius)) / Math.max(2, metricContext ? 18 : routeRadius + 1),
    0,
    1
  ) : 0;
  var routePressure = 0;
  var routeLineageId = 1;
  var routeFamily = "track";
  var settlementFamily = PS.render.surface.getSettlementCivilizationFamily(settlement, {
    family: PS.render.surface.getSettlementDistrictFamilyForSample(settlement, metricContext, tileX, tileY, sample)
  });
  var districtHash = Math.abs(Math.round(sampleKeyX * 17 + sampleKeyY * 31 + Math.max(1, Number(settlement && settlement.lineageId) || 1) * 13));
  var districtLane = false;
  var routeCount = Array.isArray(world && world.settlementRoutes) ? world.settlementRoutes.length : 0;
  var route;
  var distance;
  var activity;
  var bucket;
  var type = "settlement";
  var pressure = settlementPressure;

  state.stats.sampledCells++;

  for (var i = 0; i < routeCount; i++) {
    route = world.settlementRoutes[i];
    if (!route) {
      continue;
    }

    distance = PS.render.surface.getMetricRouteDistanceToSample(route, sample);
    if (!Number.isFinite(distance)) {
      distance = PS.render.surface.getRouteDistanceToSample(route, tileX, tileY);
    }
    var usingMetricDistance = Number.isFinite(PS.render.surface.getMetricRouteDistanceToSample(route, sample));
    var effectiveRouteRadius = usingMetricDistance ? Math.max(4, routeRadius * 2) : routeRadius;
    if (distance > effectiveRouteRadius) {
      continue;
    }

    activity = route.isActive === false ? 0.45 : 0.65 + Math.min(0.35, Math.max(0, Number(route.foodTransferred) || 0) / 160);
    var candidatePressure = clamp((1 - distance / effectiveRouteRadius) * activity, 0, 1);

    if (candidatePressure > routePressure) {
      routePressure = candidatePressure;
      routeLineageId = Math.max(1, Math.round(Number(route.lineageId) || 1));
      routeFamily = PS.render.surface.getRouteCivilizationFamily(route);
    }
  }

  if (settlementPressure > 0.18 &&
      routePressure < Math.max(0.92, settlementPressure + 0.34)) {
    type = "settlement";
    pressure = settlementPressure;
  } else if (routePressure > 0.58 && routePressure >= pressure * 0.95) {
    type = "route";
    pressure = Math.max(routePressure, pressure * 0.42);
  } else if (routePressure > 0.58 && routePressure > pressure * 1.1) {
    type = "route";
    pressure = routePressure;
  }
  if (borderPressure > pressure &&
      borderPressure >= Math.max(0.96, settlementPressure + 0.42)) {
    type = "border";
    pressure = borderPressure;
  }

  if (type === "settlement" && settlementPressure > 0.18) {
    var localSettlementX = metricContext ? Number(metricContext.dxMeters) || 0 : sampleKeyX * 7;
    var localSettlementY = metricContext ? Number(metricContext.dyMeters) || 0 : sampleKeyY * 7;
    var blockSpacing = settlementFamily === "block" ? 18 : (settlementFamily === "farm" ? 24 : 21);
    var laneOffsetX = (districtHash % 9) - 4;
    var laneOffsetY = ((districtHash >> 3) % 9) - 4;
    var parcelX = Math.abs((((localSettlementX + laneOffsetX) % blockSpacing) + blockSpacing * 1.5) % blockSpacing - blockSpacing * 0.5);
    var parcelY = Math.abs((((localSettlementY + laneOffsetY) % blockSpacing) + blockSpacing * 1.5) % blockSpacing - blockSpacing * 0.5);
    var metricLane = metricContext &&
      Number(metricContext.ring) > 0.10 &&
      Number(metricContext.ring) < 0.94 &&
      (parcelX <= 1.8 || parcelY <= 1.8 || (parcelX <= 3.2 && parcelY <= 3.2 && districtHash % 5 === 0));
    districtLane = (
      districtHash % 19 === 0 ||
      (Math.round(sampleKeyX + sampleKeyY * 2) + districtHash) % 31 === 0 ||
      (metricContext && Number(metricContext.ring) > 0.24 && Number(metricContext.ring) < 0.72 && districtHash % 29 === 3) ||
      metricLane
    );
    if (districtLane && settlementFamily !== "production") {
      pressure = 0;
    }
  }

  bucket = PS.render.surface.getCivilizationBucket(pressure);
  if (bucket <= 0) {
    state.cache[key] = null;
    return null;
  }

  var family = type === "route"
    ? routeFamily
    : type === "border"
      ? "border"
      : settlementFamily;

  cached = {
    key: "civ." + type + "." + bucket + "." + family,
    type: type,
    bucket: bucket,
    family: family,
    pressure: pressure,
    settlementPressure: settlementPressure,
    routePressure: routePressure,
    borderPressure: borderPressure,
    farmPressure: family === "farm" ? pressure : 0,
    yardPressure: family === "yard" ? pressure : 0,
    blockPressure: family === "block" ? pressure : 0,
    productionPressure: family === "production" ? pressure : 0,
    lineageId: Math.max(1, Math.round(Number(settlement && settlement.lineageId) || routeLineageId || 1))
  };

  state.stats.activeCells++;
  if (type === "route") {
    state.stats.routeCells++;
    if (family === "road") {
      state.stats.roadCells++;
    } else if (family === "track") {
      state.stats.trackCells++;
    }
  } else if (type === "border") {
    state.stats.borderCells++;
  } else {
    state.stats.settlementCells++;
    if (family === "farm") {
      state.stats.farmCells++;
    } else if (family === "yard") {
      state.stats.yardCells++;
    } else if (family === "block") {
      state.stats.blockCells++;
    } else if (family === "production") {
      state.stats.productionCells++;
    }
  }

  state.cache[key] = cached;
  return cached;
};

PS.render.surface.withCivilization = function (sample) {
  var civilization = PS.render.surface.getSampleCivilization(sample);

  if (!civilization) {
    return sample;
  }

  var nextSample = Object.assign({}, sample);
  var detail = sample && sample.detail ? Object.assign({}, sample.detail) : {};
  var signals = detail.materialSignals ? Object.assign({}, detail.materialSignals) : {};

  signals.settlementDensity = Math.max(Number(signals.settlementDensity) || 0, civilization.settlementPressure);
  signals.routeTraffic = Math.max(Number(signals.routeTraffic) || 0, civilization.routePressure);
  signals.borderInfluence = Math.max(Number(signals.borderInfluence) || 0, civilization.borderPressure);
  signals.farmPressure = Math.max(Number(signals.farmPressure) || 0, civilization.farmPressure);
  signals.yardPressure = Math.max(Number(signals.yardPressure) || 0, civilization.yardPressure);
  signals.blockPressure = Math.max(Number(signals.blockPressure) || 0, civilization.blockPressure);
  signals.productionPressure = Math.max(Number(signals.productionPressure) || 0, civilization.productionPressure);
  signals.workedGround = Math.max(
    Number(signals.workedGround) || 0,
    civilization.pressure * (civilization.type === "route" ? 0.64 : 0.82)
  );
  detail.materialSignals = signals;

  nextSample.detail = detail;
  nextSample.civilization = civilization;
  return nextSample;
};

PS.render.surface.getEcologyStats = function () {
  var state = PS.render.surface.ecology;
  var activeCells = 0;
  var foodPressureCells = 0;
  var organismPressureCells = 0;
  var keys = Object.keys(state.cache);

  for (var i = 0; i < keys.length; i++) {
    var item = state.cache[keys[i]];

    if (!item) {
      continue;
    }

    activeCells++;
    if (item.foodBucket > 0) {
      foodPressureCells++;
    }
    if (item.organismBucket > 0) {
      organismPressureCells++;
    }
  }

  return {
    frameKey: state.frameKey,
    cacheEntries: keys.length,
    sampledCells: state.stats.sampledCells,
    activeCells: activeCells,
    foodPressureCells: foodPressureCells,
    organismPressureCells: organismPressureCells
  };
};

PS.render.surface.getCivilizationStats = function () {
  var state = PS.render.surface.civilization;
  var activeCells = 0;
  var settlementCells = 0;
  var routeCells = 0;
  var borderCells = 0;
  var farmCells = 0;
  var yardCells = 0;
  var blockCells = 0;
  var productionCells = 0;
  var roadCells = 0;
  var trackCells = 0;
  var keys = Object.keys(state.cache);

  for (var i = 0; i < keys.length; i++) {
    var item = state.cache[keys[i]];

    if (!item) {
      continue;
    }

    activeCells++;
    if (item.type === "route") {
      routeCells++;
      if (item.family === "road") {
        roadCells++;
      } else if (item.family === "track") {
        trackCells++;
      }
    } else if (item.type === "border") {
      borderCells++;
    } else {
      settlementCells++;
      if (item.family === "farm") {
        farmCells++;
      } else if (item.family === "yard") {
        yardCells++;
      } else if (item.family === "block") {
        blockCells++;
      } else if (item.family === "production") {
        productionCells++;
      }
    }
  }

  return {
    frameKey: state.frameKey,
    cacheEntries: keys.length,
    sampledCells: state.stats.sampledCells,
    activeCells: activeCells,
    settlementCells: settlementCells,
    routeCells: routeCells,
    borderCells: borderCells,
    farmCells: farmCells,
    yardCells: yardCells,
    blockCells: blockCells,
    productionCells: productionCells,
    roadCells: roadCells,
    trackCells: trackCells
  };
};
