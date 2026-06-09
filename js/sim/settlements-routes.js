"use strict";
function transferSettlementRouteFood(route, parentSettlement, childSettlement) {
  var transferInterval = Math.max(1, Math.round(Number(CONFIG.SETTLEMENT_ROUTE_TRANSFER_INTERVAL) || 1));

  if (world.tick - route.lastTransferTick < transferInterval) {
    return 0;
  }

  var minStoredFood = Math.max(0, Math.round(Number(CONFIG.SETTLEMENT_ROUTE_MIN_PARENT_STORED_FOOD) || 0));
  var transferLimit = Math.max(0, Math.round(Number(CONFIG.SETTLEMENT_ROUTE_FOOD_TRANSFER) || 0));
  var transferableFood = Math.max(0, parentSettlement.storedFood - minStoredFood);
  var transferAmount = Math.min(transferLimit, transferableFood);

  route.lastTransferTick = world.tick;

  if (transferAmount <= 0) {
    return 0;
  }

  parentSettlement.storedFood -= transferAmount;
  childSettlement.storedFood += transferAmount;
  route.foodTransferred += transferAmount;
  return transferAmount;
}

function updateSettlementRoute(route) {
  normalizeSettlementRoute(route);

  var parentSettlement = getSettlementById(route.parentSettlementId);
  var childSettlement = getSettlementById(route.childSettlementId);

  route.isActive = Boolean(parentSettlement && childSettlement);

  if (!route.isActive) {
    return;
  }

  route.lineageId = parentSettlement.lineageId;
  route.distance = getDistanceBetweenSettlements(parentSettlement, childSettlement);
  transferSettlementRouteFood(route, parentSettlement, childSettlement);
}

function ensureOutpostRoutes() {
  ensureSettlementState();

  for (var i = 0; i < world.settlements.length; i++) {
    var settlement = world.settlements[i];

    if (!settlement.isOutpost || settlement.parentSettlementId <= 0) {
      continue;
    }

    var parentSettlement = getSettlementById(settlement.parentSettlementId);

    if (parentSettlement) {
      ensureSettlementRoute(parentSettlement, settlement);
    }
  }
}

function updateSettlementRoutes() {
  ensureOutpostRoutes();

  for (var i = 0; i < world.settlementRoutes.length; i++) {
    updateSettlementRoute(world.settlementRoutes[i]);
  }

  rebuildSettlementRouteStats();
}

function runSuppliedOutpostGrowth(settlement) {
  normalizeSettlementGrowth(settlement);

  if (!settlement.isOutpost || countActiveRoutesForSettlement(settlement.id) === 0) {
    return;
  }

  var supplyGrowthInterval = Math.max(1, Math.round(Number(CONFIG.SETTLEMENT_SUPPLY_GROWTH_INTERVAL) || 1));

  if (world.tick - settlement.lastSupplyGrowthTick < supplyGrowthInterval) {
    return;
  }

  var foodCost = Math.max(0, Math.round(Number(CONFIG.SETTLEMENT_SUPPLY_GROWTH_FOOD_COST) || 0));

  settlement.lastSupplyGrowthTick = world.tick;

  if (foodCost <= 0 || settlement.storedFood < foodCost) {
    return;
  }

  settlement.storedFood -= foodCost;
  settlement.development += foodCost * CONFIG.SETTLEMENT_DEVELOPMENT_PER_SUPPLIED_FOOD;
  updateSettlementLevel(settlement);
}

function updateSuppliedOutpostGrowth() {
  for (var i = 0; i < world.settlements.length; i++) {
    runSuppliedOutpostGrowth(world.settlements[i]);
  }
}

function refreshSettlementSummaryCache() {
  if (!Array.isArray(world.settlements) || world.settlements.length === 0) {
    world.settlementSummary = null;
    return world.settlementSummary;
  }

  world.earlyProgressionSummary = null;

  var activeSettlements = 0;
  var totalPopulation = 0;
  var totalFoodStock = 0;
  var totalStoredFood = 0;
  var totalDevelopment = 0;
  var totalClaimedTiles = 0;
  var totalClaimedFood = 0;
  var totalOutposts = 0;
  var totalColonies = 0;
  var maxInfluenceRadius = 0;
  var totalRoutes = Array.isArray(world.settlementRoutes) ? world.settlementRoutes.length : 0;
  var activeRoutes = 0;
  var totalRouteFoodTransferred = 0;
  var topSettlement = null;

  if (Array.isArray(world.settlementRoutes)) {
    for (var routeIndex = 0; routeIndex < world.settlementRoutes.length; routeIndex++) {
      totalRouteFoodTransferred += Math.max(0, Number(world.settlementRoutes[routeIndex].foodTransferred) || 0);

      if (world.settlementRoutes[routeIndex].isActive) {
        activeRoutes++;
      }
    }
  }

  for (var i = 0; i < world.settlements.length; i++) {
    var settlement = world.settlements[i];

    if (settlement.isOutpost) {
      totalOutposts++;
    }

    if (settlement.isColony) {
      totalColonies++;
    }

    if (settlement.isActive) {
      activeSettlements++;
    }

    totalPopulation += settlement.population;
    totalFoodStock += settlement.foodStock;
    totalStoredFood += Math.max(0, Number(settlement.storedFood) || 0);
    totalDevelopment += Math.max(0, Number(settlement.development) || 0);
    totalClaimedTiles += Math.max(0, Number(settlement.claimedTiles) || 0);
    totalClaimedFood += Math.max(0, Number(settlement.claimedFood) || 0);
    maxInfluenceRadius = Math.max(maxInfluenceRadius, Math.max(2, Math.round(Number(settlement.influenceRadius) || 0)));

    if (
      !topSettlement ||
      settlement.level > topSettlement.level ||
      (settlement.level === topSettlement.level && settlement.influenceRadius > topSettlement.influenceRadius) ||
      (settlement.level === topSettlement.level && settlement.influenceRadius === topSettlement.influenceRadius && settlement.population > topSettlement.population)
    ) {
      topSettlement = settlement;
    }
  }

  world.settlementSummary = {
    total: world.settlements.length,
    active: activeSettlements,
    totalPopulation: totalPopulation,
    totalFoodStock: totalFoodStock,
    totalStoredFood: totalStoredFood,
    totalDevelopment: totalDevelopment,
    totalClaimedTiles: totalClaimedTiles,
    totalClaimedFood: totalClaimedFood,
    maxInfluenceRadius: maxInfluenceRadius,
    totalOutposts: totalOutposts,
    totalColonies: totalColonies,
    totalRoutes: totalRoutes,
    activeRoutes: activeRoutes,
    totalRouteFoodTransferred: totalRouteFoodTransferred,
    colonyNetworkScore: Math.max(0, Math.round(Number(world.colonyNetworkScore) || 0)),
    colonyNetworkColonies: Math.max(0, Math.round(Number(world.colonyNetworkColonies) || 0)),
    colonyNetworkActiveRoutes: Math.max(0, Math.round(Number(world.colonyNetworkActiveRoutes) || 0)),
    colonyNetworkClaimedTiles: Math.max(0, Math.round(Number(world.colonyNetworkClaimedTiles) || 0)),
    spaceProgramProgress: Math.max(0, Number(world.spaceProgramProgress) || 0),
    orbitalLaunches: Math.max(0, Math.round(Number(world.orbitalLaunches) || 0)),
    spaceProgramReady: Boolean(world.spaceProgramReady),
    orbitalAssets: Array.isArray(world.orbitalAssets) ? world.orbitalAssets.length : 0,
    orbitalInfrastructureScore: Math.max(0, Math.round(Number(world.orbitalInfrastructureScore) || 0)),
    orbitalPlatformReady: Boolean(world.orbitalPlatformReady),
    planetaryBodies: Array.isArray(world.planetaryBodies) ? world.planetaryBodies.length : 0,
    planetarySurveyProgress: Math.max(0, Number(world.planetarySurveyProgress) || 0),
    planetarySurveyReady: Boolean(world.planetarySurveyReady),
    probeMissions: Array.isArray(world.probeMissions) ? world.probeMissions.length : 0,
    completedProbeMissions: typeof getCompletedProbeMissionCount === "function" ? getCompletedProbeMissionCount() : 0,
    probeMissionProgress: Math.max(0, Number(world.probeMissionProgress) || 0),
    probeMissionReady: Boolean(world.probeMissionReady),
    starSystems: Array.isArray(world.starSystems) ? world.starSystems.length : 0,
    starMapProgress: Math.max(0, Number(world.starMapProgress) || 0),
    starMapReady: Boolean(world.starMapReady),
    galacticClaimedSystems: Math.max(0, Math.round(Number(world.galacticClaimedSystems) || 0)),
    galacticInfluenceProgress: Math.max(0, Number(world.galacticInfluenceProgress) || 0),
    galacticInfluenceReady: Boolean(world.galacticInfluenceReady),
    interstellarFleets: Array.isArray(world.interstellarFleets) ? world.interstellarFleets.length : 0,
    interstellarFleetCompleted: Math.max(0, Math.round(Number(world.interstellarFleetCompleted) || 0)),
    interstellarFleetProgress: Math.max(0, Number(world.interstellarFleetProgress) || 0),
    interstellarFleetReady: Boolean(world.interstellarFleetReady),
    empireSectors: Array.isArray(world.empireSectors) ? world.empireSectors.length : 0,
    empireSectorProgress: Math.max(0, Number(world.empireSectorProgress) || 0),
    empireSectorReady: Boolean(world.empireSectorReady),
    empireLegacyLevel: Math.max(0, Math.round(Number(world.empireLegacyLevel) || 0)),
    empireLegacyProgress: Math.max(0, Number(world.empireLegacyProgress) || 0),
    empireLegacyReady: Boolean(world.empireLegacyReady),
    empireLegacyComplete: Boolean(world.empireLegacyComplete),
    topSettlement: topSettlement
  };

  return world.settlementSummary;
}

function refreshEarlyProgressionSummaryCache() {
  if (Array.isArray(world.settlements) && world.settlements.length > 0) {
    world.earlyProgressionSummary = null;
    return world.earlyProgressionSummary;
  }

  var lineages = world.lineages || {};
  var activeLineages = 0;
  var totalLineages = 0;
  var extinctLineages = 0;
  var topLineage = null;

  for (var lineageKey in lineages) {
    if (!Object.prototype.hasOwnProperty.call(lineages, lineageKey)) {
      continue;
    }

    var lineage = lineages[lineageKey];
    var activeCount = Math.max(0, Math.round(Number(lineage.activeCount) || 0));
    var peakPopulation = Math.max(0, Math.round(Number(lineage.peakPopulation) || 0));

    totalLineages++;

    if (activeCount > 0) {
      activeLineages++;
    } else {
      extinctLineages++;
    }

    if (
      !topLineage ||
      activeCount > topLineage.activeCount ||
      (activeCount === topLineage.activeCount && peakPopulation > topLineage.peakPopulation) ||
      (activeCount === topLineage.activeCount && peakPopulation === topLineage.peakPopulation && lineage.id < topLineage.id)
    ) {
      topLineage = {
        id: Math.max(1, Math.round(Number(lineage.id) || 1)),
        activeCount: activeCount,
        peakPopulation: peakPopulation,
        isExtinct: Boolean(lineage.isExtinct)
      };
    }
  }

  var populationTarget = Math.max(1, Math.round(Number(CONFIG.SETTLEMENT_MIN_LINEAGE_POPULATION) || 1));
  var peakTarget = Math.max(1, Math.round(Number(CONFIG.SETTLEMENT_MIN_LINEAGE_PEAK_POPULATION) || 1));
  var topActive = topLineage ? topLineage.activeCount : 0;
  var topPeak = topLineage ? topLineage.peakPopulation : 0;
  var settlementReady = Boolean(
    topLineage &&
    !topLineage.isExtinct &&
    topActive >= populationTarget &&
    topPeak >= peakTarget &&
    !world.isExtinct
  );
  var status = "growing";

  if (world.isExtinct) {
    status = "extinct";
  } else if (settlementReady) {
    status = "ready";
  } else if (activeLineages > 1) {
    status = "diversifying";
  } else if (topActive >= populationTarget || topPeak >= peakTarget) {
    status = "consolidating";
  }

  world.earlyProgressionSummary = {
    status: status,
    population: Array.isArray(world.organisms) ? world.organisms.length : 0,
    activeLineages: activeLineages,
    totalLineages: totalLineages,
    extinctLineages: extinctLineages,
    topLineage: topLineage,
    topActive: topActive,
    topPeak: topPeak,
    populationTarget: populationTarget,
    peakTarget: peakTarget,
    settlementReady: settlementReady
  };

  return world.earlyProgressionSummary;
}
