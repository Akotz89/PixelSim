"use strict";
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
    borderCells: 0
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

PS.render.surface.getSettlementCivilizationFamily = function (settlement) {
  if (!settlement) {
    return "yard";
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

PS.render.surface.getSampleCivilization = function (sample) {
  if (!sample || !PS.render.surface.shouldEncodeCivilization()) {
    return null;
  }

  var state = PS.render.surface.ensureCivilizationFrame();
  var tileX = getWrappedWorldX(sample.x);
  var tileY = getClampedWorldY(sample.y);
  var routeRadius = Math.max(1, Math.round(Number(CONFIG.PLANET_SURFACE_CIVILIZATION_ROUTE_RADIUS_TILES) || 3));
  var key = tileX + ":" + tileY + ":" + routeRadius;
  var cached = state.cache[key];
  var settlement = typeof getNearestInfluencingSettlement === "function" ? getNearestInfluencingSettlement(tileX, tileY) : null;
  var settlementDistance = settlement ? Math.abs(Number(settlement.x) - tileX) + Math.abs(Number(settlement.y) - tileY) : Infinity;
  var settlementRadius = Math.max(1, Math.round(Number(settlement && settlement.radius) || Number(CONFIG.SETTLEMENT_RADIUS) || 4));
  var influenceRadius = Math.max(settlementRadius, Math.round(Number(settlement && settlement.influenceRadius) || settlementRadius));
  var settlementPressure = settlement ? clamp(1 - settlementDistance / settlementRadius, 0, 1) : 0;
  var borderPressure = settlement ? clamp(1 - Math.abs(settlementDistance - influenceRadius) / Math.max(2, routeRadius + 1), 0, 1) : 0;
  var routePressure = 0;
  var routeLineageId = 1;
  var routeFamily = "track";
  var routeCount = Array.isArray(world && world.settlementRoutes) ? world.settlementRoutes.length : 0;
  var route;
  var distance;
  var activity;
  var bucket;
  var type = "settlement";
  var pressure = settlementPressure;

  if (cached !== undefined) {
    return cached;
  }

  state.stats.sampledCells++;

  for (var i = 0; i < routeCount; i++) {
    route = world.settlementRoutes[i];
    if (!route) {
      continue;
    }

    distance = PS.render.surface.getRouteDistanceToSample(route, tileX, tileY);
    if (distance > routeRadius) {
      continue;
    }

    activity = route.isActive === false ? 0.45 : 0.65 + Math.min(0.35, Math.max(0, Number(route.foodTransferred) || 0) / 160);
    var candidatePressure = clamp((1 - distance / routeRadius) * activity, 0, 1);

    if (candidatePressure > routePressure) {
      routePressure = candidatePressure;
      routeLineageId = Math.max(1, Math.round(Number(route.lineageId) || 1));
      routeFamily = PS.render.surface.getRouteCivilizationFamily(route);
    }
  }

  if (routePressure > pressure) {
    type = "route";
    pressure = routePressure;
  }
  if (borderPressure > pressure) {
    type = "border";
    pressure = borderPressure;
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
      : PS.render.surface.getSettlementCivilizationFamily(settlement);

  cached = {
    key: "civ." + type + "." + bucket + "." + family,
    type: type,
    bucket: bucket,
    family: family,
    pressure: pressure,
    settlementPressure: settlementPressure,
    routePressure: routePressure,
    borderPressure: borderPressure,
    lineageId: Math.max(1, Math.round(Number(settlement && settlement.lineageId) || routeLineageId || 1))
  };

  state.stats.activeCells++;
  if (type === "route") {
    state.stats.routeCells++;
  } else if (type === "border") {
    state.stats.borderCells++;
  } else {
    state.stats.settlementCells++;
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
  var keys = Object.keys(state.cache);

  for (var i = 0; i < keys.length; i++) {
    var item = state.cache[keys[i]];

    if (!item) {
      continue;
    }

    activeCells++;
    if (item.type === "route") {
      routeCells++;
    } else if (item.type === "border") {
      borderCells++;
    } else {
      settlementCells++;
    }
  }

  return {
    frameKey: state.frameKey,
    cacheEntries: keys.length,
    sampledCells: state.stats.sampledCells,
    activeCells: activeCells,
    settlementCells: settlementCells,
    routeCells: routeCells,
    borderCells: borderCells
  };
};
