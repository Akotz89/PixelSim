
function makeSettlement(lineage, organisms) {
  var center = getLineageCenter(organisms);
  return makeSettlementAt(lineage.id, center.x, center.y, {
    parentSettlementId: 0,
    isOutpost: false
  });
}

function makeSettlementAt(lineageId, x, y, options) {
  options = options || {};
  return {
    id: allocateSettlementId(),
    lineageId: lineageId,
    x: getSettlementWrappedX(x),
    y: getSettlementClampedY(y),
    foundedTick: world.tick,
    radius: CONFIG.SETTLEMENT_RADIUS,
    population: 0,
    foodStock: 0,
    storedFood: 0,
    development: 0,
    level: 1,
    lastGrowthTick: world.tick,
    influenceRadius: CONFIG.SETTLEMENT_INFLUENCE_BASE_RADIUS,
    claimedTiles: 0,
    claimedFood: 0,
    parentSettlementId: Math.max(0, Math.round(options.parentSettlementId || 0)),
    isOutpost: Boolean(options.isOutpost),
    isColony: Boolean(options.isColony),
    lastOutpostTick: world.tick,
    lastSupplyGrowthTick: world.tick,
    isActive: true,
    lastActiveTick: world.tick
  };
}

function canFoundSettlement(lineage) {
  return (
    lineage &&
    lineage.activeCount >= CONFIG.SETTLEMENT_MIN_LINEAGE_POPULATION &&
    lineage.peakPopulation >= CONFIG.SETTLEMENT_MIN_LINEAGE_PEAK_POPULATION &&
    !lineage.isExtinct &&
    !getRootSettlementForLineage(lineage.id)
  );
}

function foundSettlementForLineage(lineage) {
  var organisms = getOrganismsForLineage(lineage.id);

  if (organisms.length === 0) {
    return null;
  }

  var settlement = makeSettlement(lineage, organisms);
  updateSettlementMetrics(settlement);
  world.settlements.push(settlement);
  registerSettlementInIndexes(settlement);
  return settlement;
}

function getDistanceToNearestSettlement(x, y, searchRadius) {
  ensureSettlementState();

  var buckets = world.settlementBuckets;
  var bucketSize = getSettlementBucketSize();
  var isBoundedSearch = typeof searchRadius === "number" && searchRadius >= 0;
  var normalizedRadius =
    isBoundedSearch
      ? searchRadius
      : Math.max(WORLD_WIDTH, WORLD_HEIGHT);
  var bucketXs = PS.worldGrid && typeof PS.worldGrid.getWrappedBucketIndexes === "function"
    ? PS.worldGrid.getWrappedBucketIndexes(x, normalizedRadius, bucketSize, WORLD_WIDTH)
    : [Math.floor(getSettlementWrappedX(x) / bucketSize)];
  var bucketYs = PS.worldGrid && typeof PS.worldGrid.getClampedBucketIndexes === "function"
    ? PS.worldGrid.getClampedBucketIndexes(y, normalizedRadius, bucketSize, WORLD_HEIGHT)
    : [Math.floor(getSettlementClampedY(y) / bucketSize)];
  var nearestDistance = Infinity;

  for (var bucketYIndex = 0; bucketYIndex < bucketYs.length; bucketYIndex++) {
    for (var bucketXIndex = 0; bucketXIndex < bucketXs.length; bucketXIndex++) {
      var bucketY = bucketYs[bucketYIndex];
      var bucketX = bucketXs[bucketXIndex];
      var bucket = buckets[bucketX + ":" + bucketY];

      if (!bucket) {
        continue;
      }

      for (var i = 0; i < bucket.length; i++) {
        var settlement = bucket[i];
        var distance = getDistanceToSettlement(settlement, x, y);

        if (isBoundedSearch && distance > normalizedRadius) {
          continue;
        }

        if (distance < nearestDistance) {
          nearestDistance = distance;
        }
      }
    }
  }

  return nearestDistance;
}

function getNearestSettlementInRadius(x, y, searchRadius, requireInfluence) {
  ensureSettlementState();

  var buckets = world.settlementBuckets;
  var bucketSize = getSettlementBucketSize();
  var normalizedRadius = Math.max(0, Math.round(Number(searchRadius) || 0));
  var bucketXs = PS.worldGrid && typeof PS.worldGrid.getWrappedBucketIndexes === "function"
    ? PS.worldGrid.getWrappedBucketIndexes(x, normalizedRadius, bucketSize, WORLD_WIDTH)
    : [Math.floor(getSettlementWrappedX(x) / bucketSize)];
  var bucketYs = PS.worldGrid && typeof PS.worldGrid.getClampedBucketIndexes === "function"
    ? PS.worldGrid.getClampedBucketIndexes(y, normalizedRadius, bucketSize, WORLD_HEIGHT)
    : [Math.floor(getSettlementClampedY(y) / bucketSize)];
  var nearestSettlement = null;
  var nearestDistance = Infinity;

  for (var bucketYIndex = 0; bucketYIndex < bucketYs.length; bucketYIndex++) {
    for (var bucketXIndex = 0; bucketXIndex < bucketXs.length; bucketXIndex++) {
      var bucketY = bucketYs[bucketYIndex];
      var bucketX = bucketXs[bucketXIndex];
      var bucket = buckets[bucketX + ":" + bucketY];

      if (!bucket) {
        continue;
      }

      for (var i = 0; i < bucket.length; i++) {
        var settlement = bucket[i];
        var distance = getDistanceToSettlement(settlement, x, y);

        if (distance > normalizedRadius) {
          continue;
        }

        if (requireInfluence && distance > Math.max(2, Math.round(Number(settlement.influenceRadius) || 0))) {
          continue;
        }

        if (distance < nearestDistance) {
          nearestSettlement = settlement;
          nearestDistance = distance;
        }
      }
    }
  }

  return nearestSettlement;
}

function getNearestInfluencingSettlement(x, y) {
  var summary = world.settlementSummary || refreshSettlementSummaryCache();

  if (!summary) {
    return null;
  }

  return getNearestSettlementInRadius(
    x,
    y,
    Math.max(2, Math.round(Number(summary.maxInfluenceRadius) || 0)),
    true
  );
}

function countFoodNearTile(x, y, radius) {
  return countFoodInRadius(x, y, radius);
}

function getOutpostPlacement(parentSettlement) {
  var searchRadius = Math.max(1, Math.round(Number(CONFIG.SETTLEMENT_OUTPOST_SEARCH_RADIUS) || 1));
  var minDistance = Math.max(1, Math.round(Number(CONFIG.SETTLEMENT_OUTPOST_MIN_DISTANCE) || 1));
  var bestCandidate = null;
  var bestScore = -Infinity;

  for (var distance = minDistance; distance <= searchRadius; distance++) {
    for (var dy = -distance; dy <= distance; dy++) {
      var dxMagnitude = distance - Math.abs(dy);
      var dxValues = dxMagnitude === 0 ? [0] : [-dxMagnitude, dxMagnitude];

      for (var dxIndex = 0; dxIndex < dxValues.length; dxIndex++) {
        var candidateX = getSettlementWrappedX(parentSettlement.x + dxValues[dxIndex]);
        var candidateY = getSettlementClampedY(parentSettlement.y + dy);

        if (getDistanceToNearestSettlement(candidateX, candidateY, minDistance - 1) < minDistance) {
          continue;
        }

        var score =
          countFoodNearTile(candidateX, candidateY, CONFIG.SETTLEMENT_RADIUS) * 4 +
          (isFertile(candidateX, candidateY) ? 2 : 0) -
          getSettlementWrappedManhattanDistance(parentSettlement.x, parentSettlement.y, candidateX, candidateY) * 0.01;

        if (score > bestScore) {
          bestScore = score;
          bestCandidate = {
            x: candidateX,
            y: candidateY
          };
        }
      }
    }
  }

  return bestCandidate;
}

function canFoundOutpost(settlement) {
  return (
    settlement &&
    settlement.isActive &&
    settlement.level >= CONFIG.SETTLEMENT_OUTPOST_MIN_LEVEL &&
    settlement.storedFood >= CONFIG.SETTLEMENT_OUTPOST_MIN_STORED_FOOD &&
    settlement.development >= CONFIG.SETTLEMENT_OUTPOST_MIN_DEVELOPMENT &&
    world.tick - settlement.lastOutpostTick >= CONFIG.SETTLEMENT_OUTPOST_COOLDOWN &&
    countChildOutposts(settlement) < CONFIG.SETTLEMENT_OUTPOST_MAX_CHILDREN
  );
}

function foundOutpostFromSettlement(parentSettlement) {
  if (!canFoundOutpost(parentSettlement)) {
    return null;
  }

  var placement = getOutpostPlacement(parentSettlement);

  if (!placement) {
    return null;
  }

  parentSettlement.storedFood = Math.max(0, parentSettlement.storedFood - CONFIG.SETTLEMENT_OUTPOST_FOOD_COST);
  parentSettlement.development = Math.max(0, parentSettlement.development - CONFIG.SETTLEMENT_OUTPOST_DEVELOPMENT_COST);
  parentSettlement.lastOutpostTick = world.tick;
  updateSettlementLevel(parentSettlement);

  var outpost = makeSettlementAt(parentSettlement.lineageId, placement.x, placement.y, {
    parentSettlementId: parentSettlement.id,
    isOutpost: true
  });
  updateSettlementMetrics(outpost);
  world.settlements.push(outpost);
  registerSettlementInIndexes(outpost);
  return outpost;
}

function updateSettlementOutposts() {
  var settlementCount = world.settlements.length;

  for (var i = 0; i < settlementCount; i++) {
    foundOutpostFromSettlement(world.settlements[i]);
  }
}

function getSettlementRoute(parentSettlementId, childSettlementId) {
  ensureSettlementState();
  return world.settlementRoutesByKey[getSettlementRouteKey(parentSettlementId, childSettlementId)] || null;
}

function makeSettlementRoute(parentSettlement, childSettlement) {
  return {
    id: allocateSettlementRouteId(),
    parentSettlementId: parentSettlement.id,
    childSettlementId: childSettlement.id,
    lineageId: parentSettlement.lineageId,
    foundedTick: world.tick,
    distance: getDistanceBetweenSettlements(parentSettlement, childSettlement),
    foodTransferred: 0,
    lastTransferTick: world.tick,
    isActive: true
  };
}

function ensureSettlementRoute(parentSettlement, childSettlement) {
  var route = getSettlementRoute(parentSettlement.id, childSettlement.id);

  if (!route) {
    route = makeSettlementRoute(parentSettlement, childSettlement);
    world.settlementRoutes.push(route);
    registerSettlementRouteInIndex(route);
    registerSettlementRouteStats(route);
  }

  return route;
}

function normalizeSettlementRoute(route) {
  var previousRouteKey = route._indexKey || getSettlementRouteKey(route.parentSettlementId, route.childSettlementId);
  route.parentSettlementId = Math.max(1, Math.round(restoreSettlementGrowthNumber(route.parentSettlementId, 1)));
  route.childSettlementId = Math.max(1, Math.round(restoreSettlementGrowthNumber(route.childSettlementId, 1)));
  route.lineageId = Math.max(1, Math.round(restoreSettlementGrowthNumber(route.lineageId, 1)));
  route.foundedTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(route.foundedTick, 0)));
  route.distance = Math.max(0, Math.round(restoreSettlementGrowthNumber(route.distance, 0)));
  route.foodTransferred = Math.max(0, Math.round(restoreSettlementGrowthNumber(route.foodTransferred, 0)));
  route.lastTransferTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(route.lastTransferTick, route.foundedTick)));
  route.isActive = Boolean(route.isActive);

  if (
    world.settlementRoutesByKey &&
    previousRouteKey !== getSettlementRouteKey(route.parentSettlementId, route.childSettlementId)
  ) {
    delete world.settlementRoutesByKey[previousRouteKey];
  }

  registerSettlementRouteInIndex(route);
}
