function ensureSettlementState() {
  if (!Array.isArray(world.settlements)) {
    world.settlements = [];
  }

  if (typeof world.nextSettlementId !== "number" || world.nextSettlementId < 1) {
    world.nextSettlementId = 1;
  }

  if (!Array.isArray(world.settlementRoutes)) {
    world.settlementRoutes = [];
  }

  if (typeof world.nextSettlementRouteId !== "number" || world.nextSettlementRouteId < 1) {
    world.nextSettlementRouteId = 1;
  }

  if (
    !world.settlementsById ||
    !world.settlementBuckets ||
    !world.settlementByLineage ||
    !world.rootSettlementByLineage ||
    !world.settlementChildOutpostCountByParentId ||
    !world.settlementRoutesByKey ||
    !world.settlementRouteStatsById
  ) {
    rebuildSettlementIndexes();
  }
}

function getSettlementRouteKey(parentSettlementId, childSettlementId) {
  return parentSettlementId + ":" + childSettlementId;
}

function getSettlementBucketSize() {
  return Math.max(1, Math.round(Number(CONFIG.SETTLEMENT_SPATIAL_BUCKET_SIZE) || 18));
}

function getSettlementBucketKey(x, y) {
  var bucketSize = getSettlementBucketSize();
  return Math.floor(x / bucketSize) + ":" + Math.floor(y / bucketSize);
}

function registerSettlementInIndexes(settlement) {
  if (!settlement) {
    return;
  }

  if (!world.settlementsById) {
    world.settlementsById = {};
  }

  if (!world.settlementBuckets) {
    world.settlementBuckets = {};
  }

  if (!world.settlementByLineage) {
    world.settlementByLineage = {};
  }

  if (!world.rootSettlementByLineage) {
    world.rootSettlementByLineage = {};
  }

  if (!world.settlementChildOutpostCountByParentId) {
    world.settlementChildOutpostCountByParentId = {};
  }

  var idKey = String(settlement.id);
  var lineageKey = String(settlement.lineageId);
  var previousSettlement = world.settlementsById[idKey];

  if (previousSettlement === settlement) {
    return;
  }

  world.settlementsById[idKey] = settlement;

  var bucketKey = getSettlementBucketKey(settlement.x, settlement.y);

  if (!world.settlementBuckets[bucketKey]) {
    world.settlementBuckets[bucketKey] = [];
  }

  world.settlementBuckets[bucketKey].push(settlement);

  if (!world.settlementByLineage[lineageKey]) {
    world.settlementByLineage[lineageKey] = settlement;
  }

  if (!settlement.isOutpost && !world.rootSettlementByLineage[lineageKey]) {
    world.rootSettlementByLineage[lineageKey] = settlement;
  }

  var parentSettlementId = Math.max(0, Math.round(Number(settlement.parentSettlementId) || 0));

  if (parentSettlementId > 0) {
    var parentKey = String(parentSettlementId);
    world.settlementChildOutpostCountByParentId[parentKey] =
      (world.settlementChildOutpostCountByParentId[parentKey] || 0) + 1;
  }
}

function registerSettlementRouteInIndex(route) {
  if (!route) {
    return;
  }

  if (!world.settlementRoutesByKey) {
    world.settlementRoutesByKey = {};
  }

  route._indexKey = getSettlementRouteKey(route.parentSettlementId, route.childSettlementId);
  world.settlementRoutesByKey[route._indexKey] = route;
}

function makeSettlementRouteStats() {
  return {
    routeCount: 0,
    activeRoutes: 0,
    foodTransferred: 0
  };
}

function getMutableSettlementRouteStats(settlementId) {
  if (!world.settlementRouteStatsById) {
    world.settlementRouteStatsById = {};
  }

  var key = String(settlementId);

  if (!world.settlementRouteStatsById[key]) {
    world.settlementRouteStatsById[key] = makeSettlementRouteStats();
  }

  return world.settlementRouteStatsById[key];
}

function addRouteToSettlementRouteStats(route, settlementId) {
  var stats = getMutableSettlementRouteStats(settlementId);
  stats.routeCount++;
  stats.foodTransferred += Math.max(0, Number(route.foodTransferred) || 0);

  if (route.isActive) {
    stats.activeRoutes++;
  }
}

function registerSettlementRouteStats(route) {
  if (!route) {
    return;
  }

  addRouteToSettlementRouteStats(route, route.parentSettlementId);

  if (route.childSettlementId !== route.parentSettlementId) {
    addRouteToSettlementRouteStats(route, route.childSettlementId);
  }
}

function rebuildSettlementRouteStats() {
  world.settlementRouteStatsById = {};

  for (var i = 0; i < world.settlementRoutes.length; i++) {
    registerSettlementRouteStats(world.settlementRoutes[i]);
  }
}

function getSettlementRouteStats(settlementId) {
  ensureSettlementState();

  var stats = world.settlementRouteStatsById[String(settlementId)];

  if (!stats) {
    return makeSettlementRouteStats();
  }

  return stats;
}

function rebuildSettlementIndexes() {
  world.settlementsById = {};
  world.settlementBuckets = {};
  world.settlementByLineage = {};
  world.rootSettlementByLineage = {};
  world.settlementChildOutpostCountByParentId = {};
  world.settlementRoutesByKey = {};
  world.settlementRouteStatsById = {};

  for (var i = 0; i < world.settlements.length; i++) {
    registerSettlementInIndexes(world.settlements[i]);
  }

  for (var routeIndex = 0; routeIndex < world.settlementRoutes.length; routeIndex++) {
    registerSettlementRouteInIndex(world.settlementRoutes[routeIndex]);
    registerSettlementRouteStats(world.settlementRoutes[routeIndex]);
  }
}

function allocateSettlementId() {
  ensureSettlementState();

  var settlementId = world.nextSettlementId;
  world.nextSettlementId++;
  return settlementId;
}

function allocateSettlementRouteId() {
  ensureSettlementState();

  var routeId = world.nextSettlementRouteId;
  world.nextSettlementRouteId++;
  return routeId;
}

function getSettlementById(settlementId) {
  ensureSettlementState();
  return world.settlementsById[String(settlementId)] || null;
}

function getSettlementForLineage(lineageId) {
  ensureSettlementState();
  return world.settlementByLineage[String(lineageId)] || null;
}

function getRootSettlementForLineage(lineageId) {
  ensureSettlementState();
  return world.rootSettlementByLineage[String(lineageId)] || null;
}

function getOrganismsForLineage(lineageId) {
  return getIndexedOrganismsForLineage(lineageId);
}

function getSettlementWrappedX(x) {
  return PS.worldGrid && typeof PS.worldGrid.getWrappedX === "function"
    ? PS.worldGrid.getWrappedX(x)
    : clamp(Math.round(Number(x) || 0), 0, WORLD_WIDTH - 1);
}

function getSettlementClampedY(y) {
  return PS.worldGrid && typeof PS.worldGrid.getClampedY === "function"
    ? PS.worldGrid.getClampedY(y)
    : clamp(Math.round(Number(y) || 0), 0, WORLD_HEIGHT - 1);
}

function getSettlementWrappedDeltaX(fromX, toX) {
  if (PS.worldGrid && typeof PS.worldGrid.getWrappedDeltaX === "function") {
    return PS.worldGrid.getWrappedDeltaX(fromX, toX);
  }

  var width = Math.max(1, WORLD_WIDTH);
  var delta = getSettlementWrappedX(toX) - getSettlementWrappedX(fromX);

  if (delta > width / 2) {
    delta -= width;
  } else if (delta < -width / 2) {
    delta += width;
  }

  return delta;
}

function getSettlementWrappedManhattanDistance(fromX, fromY, toX, toY) {
  return Math.abs(getSettlementWrappedDeltaX(fromX, toX)) +
    Math.abs(getSettlementClampedY(toY) - getSettlementClampedY(fromY));
}

function getLineageCenter(organisms) {
  var angle;
  var averageAngle;
  var sumSinX = 0;
  var sumCosX = 0;
  var totalY = 0;
  var width = Math.max(1, WORLD_WIDTH);

  for (var i = 0; i < organisms.length; i++) {
    angle = getSettlementWrappedX(organisms[i].x) / width * Math.PI * 2;
    sumSinX += Math.sin(angle);
    sumCosX += Math.cos(angle);
    totalY += organisms[i].y;
  }

  averageAngle = Math.atan2(sumSinX / organisms.length, sumCosX / organisms.length);
  if (averageAngle < 0) {
    averageAngle += Math.PI * 2;
  }

  return {
    x: getSettlementWrappedX(Math.round(averageAngle / (Math.PI * 2) * width)),
    y: getSettlementClampedY(Math.round(totalY / organisms.length))
  };
}

function getDistanceToSettlement(settlement, x, y) {
  return getSettlementWrappedManhattanDistance(settlement.x, settlement.y, x, y);
}

function getDistanceBetweenSettlements(a, b) {
  return getSettlementWrappedManhattanDistance(a.x, a.y, b.x, b.y);
}

function restoreSettlementGrowthNumber(value, fallback) {
  var numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getSettlementLevelForDevelopment(development) {
  var threshold = Math.max(1, Number(CONFIG.SETTLEMENT_LEVEL_DEVELOPMENT) || 1);
  return Math.max(1, Math.floor(Math.max(0, development) / threshold) + 1);
}

function getSettlementInfluenceRadius(settlement) {
  var level = Math.max(1, Math.round(restoreSettlementGrowthNumber(settlement.level, 1)));
  var baseRadius = Math.max(1, Math.round(Number(CONFIG.SETTLEMENT_INFLUENCE_BASE_RADIUS) || 1));
  var radiusPerLevel = Math.max(0, Math.round(Number(CONFIG.SETTLEMENT_INFLUENCE_RADIUS_PER_LEVEL) || 0));
  return baseRadius + (level - 1) * radiusPerLevel;
}

function countSettlementClaimedTiles(settlement) {
  var claimedTiles = 0;
  var radius = Math.max(1, Math.round(settlement.influenceRadius || getSettlementInfluenceRadius(settlement)));
  var minY = Math.max(0, settlement.y - radius);
  var maxY = Math.min(WORLD_HEIGHT - 1, settlement.y + radius);

  for (var y = minY; y <= maxY; y++) {
    var rowDistance = Math.abs(settlement.y - y);
    var rowRadius = radius - rowDistance;
    var rowWidth = Math.min(WORLD_WIDTH, rowRadius * 2 + 1);
    claimedTiles += rowWidth;
  }

  return Math.min(claimedTiles, WORLD_WIDTH * WORLD_HEIGHT);
}

function countSettlementClaimedFood(settlement) {
  var radius = Math.max(1, Math.round(settlement.influenceRadius || getSettlementInfluenceRadius(settlement)));
  return countFoodInRadius(settlement.x, settlement.y, radius);
}

function updateSettlementInfluence(settlement) {
  settlement.influenceRadius = getSettlementInfluenceRadius(settlement);
  settlement.claimedTiles = countSettlementClaimedTiles(settlement);
  settlement.claimedFood = countSettlementClaimedFood(settlement);
}
