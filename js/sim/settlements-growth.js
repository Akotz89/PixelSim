"use strict";
function normalizeSettlementGrowth(settlement) {
  settlement.storedFood = Math.max(0, Math.round(restoreSettlementGrowthNumber(settlement.storedFood, 0)));
  settlement.development = Math.max(0, restoreSettlementGrowthNumber(settlement.development, 0));
  settlement.level = Math.max(
    1,
    Math.round(restoreSettlementGrowthNumber(settlement.level, getSettlementLevelForDevelopment(settlement.development)))
  );
  settlement.lastGrowthTick = Math.max(
    0,
    Math.round(restoreSettlementGrowthNumber(settlement.lastGrowthTick, settlement.foundedTick || 0))
  );
  settlement.parentSettlementId = Math.max(0, Math.round(restoreSettlementGrowthNumber(settlement.parentSettlementId, 0)));
  settlement.isOutpost = Boolean(settlement.isOutpost);
  settlement.isColony = Boolean(settlement.isColony);
  settlement.lastOutpostTick = Math.max(
    0,
    Math.round(restoreSettlementGrowthNumber(settlement.lastOutpostTick, settlement.foundedTick || 0))
  );
  settlement.lastSupplyGrowthTick = Math.max(
    0,
    Math.round(restoreSettlementGrowthNumber(settlement.lastSupplyGrowthTick, settlement.foundedTick || 0))
  );
  settlement.influenceRadius = Math.max(
    1,
    Math.round(restoreSettlementGrowthNumber(settlement.influenceRadius, getSettlementInfluenceRadius(settlement)))
  );
  settlement.claimedTiles = Math.max(0, Math.round(restoreSettlementGrowthNumber(settlement.claimedTiles, 0)));
  settlement.claimedFood = Math.max(0, Math.round(restoreSettlementGrowthNumber(settlement.claimedFood, 0)));
}

function updateSettlementLevel(settlement) {
  settlement.level = getSettlementLevelForDevelopment(settlement.development);

  if (settlement.isOutpost && settlement.level >= CONFIG.SETTLEMENT_COLONY_LEVEL) {
    settlement.isColony = true;
  }

  updateSettlementInfluence(settlement);
}

function countSettlementFoodStock(settlement) {
  return countFoodInRadius(settlement.x, settlement.y, settlement.radius);
}

function countSettlementPopulation(settlement) {
  return countOrganismsInRadiusForLineage(settlement.x, settlement.y, settlement.radius, settlement.lineageId);
}

function updateSettlementMetrics(settlement) {
  normalizeSettlementGrowth(settlement);
  settlement.population = countSettlementPopulation(settlement);
  settlement.foodStock = countSettlementFoodStock(settlement);
  settlement.isActive = settlement.population > 0;
  updateSettlementLevel(settlement);
  updateSettlementInfluence(settlement);

  if (settlement.isActive) {
    settlement.lastActiveTick = world.tick;
  }
}

function harvestSettlementFood(settlement) {
  var harvestLimit = Math.max(0, Math.round(Number(CONFIG.SETTLEMENT_FOOD_HARVEST_PER_GROWTH) || 0));
  var harvestedFood = removeFoodInRadius(settlement.x, settlement.y, settlement.radius, harvestLimit);

  settlement.storedFood += harvestedFood;
  settlement.foodStock = countSettlementFoodStock(settlement);

  if (typeof recordFoodHarvested === "function") {
    recordFoodHarvested(harvestedFood);
  }

  return harvestedFood;
}

function runSettlementGrowth(settlement) {
  normalizeSettlementGrowth(settlement);

  if (!settlement.isActive) {
    return;
  }

  var growthInterval = Math.max(1, Math.round(Number(CONFIG.SETTLEMENT_GROWTH_INTERVAL) || 1));

  if (world.tick - settlement.lastGrowthTick < growthInterval) {
    return;
  }

  harvestSettlementFood(settlement);

  settlement.development +=
    settlement.population * CONFIG.SETTLEMENT_DEVELOPMENT_PER_POPULATION +
    settlement.storedFood * CONFIG.SETTLEMENT_DEVELOPMENT_PER_STORED_FOOD;
  settlement.lastGrowthTick = world.tick;
  updateSettlementLevel(settlement);
}

function countChildOutposts(settlement) {
  if (!settlement) {
    return 0;
  }

  ensureSettlementState();

  return Math.max(
    0,
    Math.round(Number(world.settlementChildOutpostCountByParentId[String(settlement.id)]) || 0)
  );
}

function countRoutesForSettlement(settlementId) {
  return getSettlementRouteStats(settlementId).routeCount;
}

function countActiveRoutesForSettlement(settlementId) {
  return getSettlementRouteStats(settlementId).activeRoutes;
}

function getColonyNetworkSummary() {
  ensureSettlementState();

  var colonies = 0;
  var activeColonies = 0;
  var activeColonyRoutes = 0;
  var colonyRouteFoodTransferred = 0;
  var colonyStoredFood = 0;
  var colonyDevelopment = 0;
  var colonyClaimedTiles = 0;

  for (var i = 0; i < world.settlements.length; i++) {
    var settlement = world.settlements[i];

    if (!settlement.isColony) {
      continue;
    }

    colonies++;
    colonyStoredFood += Math.max(0, Number(settlement.storedFood) || 0);
    colonyDevelopment += Math.max(0, Number(settlement.development) || 0);
    colonyClaimedTiles += Math.max(0, Number(settlement.claimedTiles) || 0);

    if (settlement.isActive) {
      activeColonies++;
    }
  }

  for (var routeIndex = 0; routeIndex < world.settlementRoutes.length; routeIndex++) {
    var route = world.settlementRoutes[routeIndex];

    if (!route.isActive) {
      continue;
    }

    var parentSettlement = getSettlementById(route.parentSettlementId);
    var childSettlement = getSettlementById(route.childSettlementId);

    if (!parentSettlement || !childSettlement || (!parentSettlement.isColony && !childSettlement.isColony)) {
      continue;
    }

    activeColonyRoutes++;
    colonyRouteFoodTransferred += Math.max(0, Number(route.foodTransferred) || 0);
  }

  var score =
    colonyDevelopment +
    colonyStoredFood * CONFIG.COLONY_NETWORK_STORED_FOOD_SCORE +
    activeColonyRoutes * CONFIG.COLONY_NETWORK_ROUTE_SCORE +
    colonyRouteFoodTransferred * CONFIG.COLONY_NETWORK_TRANSFERRED_FOOD_SCORE +
    colonyClaimedTiles * CONFIG.COLONY_NETWORK_CLAIMED_TILE_SCORE;

  return {
    colonies: colonies,
    activeColonies: activeColonies,
    activeRoutes: activeColonyRoutes,
    foodTransferred: Math.round(colonyRouteFoodTransferred),
    storedFood: Math.round(colonyStoredFood),
    development: colonyDevelopment,
    claimedTiles: Math.round(colonyClaimedTiles),
    score: Math.max(0, Math.round(score))
  };
}

function updateColonyNetworkState() {
  var summary = getColonyNetworkSummary();

  world.colonyNetworkScore = summary.score;
  world.colonyNetworkColonies = summary.colonies;
  world.colonyNetworkActiveRoutes = summary.activeRoutes;
  world.colonyNetworkClaimedTiles = summary.claimedTiles;

  if (summary.colonies > 0) {
    world.era = summary.score >= CONFIG.COLONY_NETWORK_ERA_SCORE && summary.activeRoutes > 0 ? "Networks" : "Colonies";
    return summary;
  }

  if (world.settlements.length > 0) {
    world.era = "Settlements";
    return summary;
  }

  world.era = "Organisms";
  return summary;
}

function getSpaceProgramInvestmentColonies(foodCost) {
  var colonies = [];

  for (var i = 0; i < world.settlements.length; i++) {
    var settlement = world.settlements[i];

    if (settlement.isColony && settlement.isActive && settlement.storedFood >= foodCost) {
      colonies.push(settlement);
    }
  }

  return colonies;
}

function updateSpaceProgramReadiness(networkSummary) {
  networkSummary = networkSummary || getColonyNetworkSummary();

  world.spaceProgramProgress = Math.max(0, restoreSettlementGrowthNumber(world.spaceProgramProgress, 0));
  world.orbitalLaunches = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.orbitalLaunches, 0)));
  world.lastSpaceProgramTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.lastSpaceProgramTick, 0)));

  var minScore = Math.max(0, Math.round(Number(CONFIG.SPACE_PROGRAM_MIN_NETWORK_SCORE) || 0));
  var minColonies = Math.max(0, Math.round(Number(CONFIG.SPACE_PROGRAM_MIN_COLONIES) || 0));
  var minRoutes = Math.max(0, Math.round(Number(CONFIG.SPACE_PROGRAM_MIN_ACTIVE_ROUTES) || 0));

  world.spaceProgramReady = Boolean(
    networkSummary.score >= minScore &&
    networkSummary.colonies >= minColonies &&
    networkSummary.activeRoutes >= minRoutes
  );

  if (world.orbitalLaunches > 0 && typeof updateOrbitalInfrastructureState === "function") {
    updateOrbitalInfrastructureState();
  } else if (world.orbitalLaunches > 0) {
    world.era = "Orbital";
  } else if (world.spaceProgramReady) {
    world.era = "Space Program";
  }

  return world.spaceProgramReady;
}

function updateSpaceProgramState(networkSummary) {
  var isReady = updateSpaceProgramReadiness(networkSummary);

  if (!isReady) {
    return;
  }

  var progressInterval = Math.max(1, Math.round(Number(CONFIG.SPACE_PROGRAM_PROGRESS_INTERVAL) || 1));
  var foodCost = Math.max(0, Math.round(Number(CONFIG.SPACE_PROGRAM_COLONY_FOOD_COST) || 0));
  var launchThreshold = Math.max(1, Number(CONFIG.SPACE_PROGRAM_LAUNCH_THRESHOLD) || 1);

  if (world.tick - world.lastSpaceProgramTick < progressInterval) {
    world.era = world.orbitalLaunches > 0 ? "Orbital" : "Space Program";
    return;
  }

  world.lastSpaceProgramTick = world.tick;

  var investmentColonies = getSpaceProgramInvestmentColonies(foodCost);

  if (investmentColonies.length === 0) {
    world.era = world.orbitalLaunches > 0 ? "Orbital" : "Space Program";
    return;
  }

  for (var i = 0; i < investmentColonies.length; i++) {
    investmentColonies[i].storedFood = Math.max(0, investmentColonies[i].storedFood - foodCost);
  }

  world.spaceProgramProgress +=
    networkSummary.score * CONFIG.SPACE_PROGRAM_PROGRESS_PER_NETWORK_SCORE +
    networkSummary.activeRoutes * CONFIG.SPACE_PROGRAM_PROGRESS_PER_ACTIVE_ROUTE +
    investmentColonies.length;

  if (world.spaceProgramProgress >= launchThreshold) {
    var launches = Math.floor(world.spaceProgramProgress / launchThreshold);
    world.orbitalLaunches += launches;
    world.spaceProgramProgress = world.spaceProgramProgress % launchThreshold;
  }

  world.era = world.orbitalLaunches > 0 ? "Orbital" : "Space Program";

  if (world.orbitalLaunches > 0) {
    updateOrbitalInfrastructureState();
  }
}

function ensureOrbitalState() {
  if (!Array.isArray(world.orbitalAssets)) {
    world.orbitalAssets = [];
  }

  if (typeof world.nextOrbitalAssetId !== "number" || world.nextOrbitalAssetId < 1) {
    world.nextOrbitalAssetId = 1;
  }

  world.orbitalInfrastructureScore = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.orbitalInfrastructureScore, 0)));
  world.orbitalPlatformReady = Boolean(world.orbitalPlatformReady);
}
