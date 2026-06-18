import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { getClampedBucketIndexes, getWrappedBucketIndexes } from "../render/planet-grid.js";
import { isFertile } from "../render/terrain-hydrology.js";
import { countFoodInRadius } from "./food-runtime.js";
import { ensureOrganismTraits } from "./organisms-traits.js";
import { countChildOutposts, updateSettlementLevel, updateSettlementMetrics } from "./settlements-growth.js";
// fallow-ignore-next-line circular-dependency
import { refreshSettlementSummaryCache } from "./settlements-routes.js";
import { allocateSettlementId, allocateSettlementRouteId, ensureSettlementState, getDistanceBetweenSettlements, getDistanceToSettlement, getLineageCenter, getOrganismsForLineage, getRootSettlementForLineage, getSettlementBucketSize, getSettlementClampedY, getSettlementRouteKey, getSettlementWrappedManhattanDistance, getSettlementWrappedX, registerSettlementInIndexes, registerSettlementRouteInIndex, registerSettlementRouteStats, restoreSettlementGrowthNumber } from "./settlements-state.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

export function makeSettlement(lineage, organisms) {
  var center = getLineageCenter(organisms);
  return makeSettlementAt(lineage.id, center.x, center.y, {
    parentSettlementId: 0,
    isOutpost: false
  });
}

export function makeSettlementAt(lineageId, x, y, options) {
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

export function getLineageSettlementTraitReadiness(lineageId) {
  var organisms = getOrganismsForLineage(lineageId);
  var count = organisms.length;
  var totalIntelligence = 0;
  var totalSociality = 0;

  for (var i = 0; i < organisms.length; i++) {
    var traits = ensureOrganismTraits(organisms[i]);
    totalIntelligence += Number(traits.intelligence) || 0;
    totalSociality += Number(traits.sociality) || 0;
  }

  return {
    population: count,
    intelligence: count > 0 ? totalIntelligence / count : 0,
    sociality: count > 0 ? totalSociality / count : 0
  };
}

export function isLineageSettlementReady(lineage) {
  if (!lineage) {
    return false;
  }

  var readiness = getLineageSettlementTraitReadiness(lineage.id);

  lineage.settlementReadiness = readiness;
  return (
    readiness.intelligence >= CONFIG.SETTLEMENT_MIN_LINEAGE_INTELLIGENCE &&
    readiness.sociality >= CONFIG.SETTLEMENT_MIN_LINEAGE_SOCIALITY
  );
}

export function canFoundSettlement(lineage) {
  return (
    lineage &&
    lineage.activeCount >= CONFIG.SETTLEMENT_MIN_LINEAGE_POPULATION &&
    lineage.peakPopulation >= CONFIG.SETTLEMENT_MIN_LINEAGE_PEAK_POPULATION &&
    isLineageSettlementReady(lineage) &&
    !lineage.isExtinct &&
    !getRootSettlementForLineage(lineage.id)
  );
}

export function foundSettlementForLineage(lineage) {
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

export function getDistanceToNearestSettlement(x, y, searchRadius) {
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

export function getNearestSettlementInRadius(x, y, searchRadius, requireInfluence) {
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

export function getNearestInfluencingSettlement(x, y) {
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

export function countFoodNearTile(x, y, radius) {
  return countFoodInRadius(x, y, radius);
}

export function getOutpostPlacement(parentSettlement) {
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

export function canFoundOutpost(settlement) {
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

export function foundOutpostFromSettlement(parentSettlement) {
  if (!canFoundOutpost(parentSettlement)) {
    return null;
  }

  var placement = getOutpostPlacement(parentSettlement);

  if (!placement) {
    return null;
  }

  if (PS.sim && PS.sim.resources && typeof PS.sim.resources.recordFlow === "function") {
    PS.sim.resources.recordFlow(parentSettlement, "food", "consumed", CONFIG.SETTLEMENT_OUTPOST_FOOD_COST);
  } else {
    parentSettlement.storedFood = Math.max(0, parentSettlement.storedFood - CONFIG.SETTLEMENT_OUTPOST_FOOD_COST);
  }
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

export function updateSettlementOutposts() {
  var settlementCount = world.settlements.length;

  for (var i = 0; i < settlementCount; i++) {
    foundOutpostFromSettlement(world.settlements[i]);
  }
}

export function getSettlementRoute(parentSettlementId, childSettlementId) {
  ensureSettlementState();
  return world.settlementRoutesByKey[getSettlementRouteKey(parentSettlementId, childSettlementId)] || null;
}

export function makeSettlementRoute(parentSettlement, childSettlement) {
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

export function ensureSettlementRoute(parentSettlement, childSettlement) {
  var route = getSettlementRoute(parentSettlement.id, childSettlement.id);

  if (!route) {
    route = makeSettlementRoute(parentSettlement, childSettlement);
    world.settlementRoutes.push(route);
    registerSettlementRouteInIndex(route);
    registerSettlementRouteStats(route);
  }

  return route;
}

export function normalizeSettlementRoute(route) {
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
