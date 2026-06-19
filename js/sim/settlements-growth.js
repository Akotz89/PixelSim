import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { recordFoodHarvested } from "../main-ecosystem-summary.js";
import { updateOrbitalInfrastructureState } from "./civilizations-orbital.js";
import { removeFoodInRadius } from "./food-growth.js";
import { countFoodInRadius } from "./food-runtime.js";
import { countOrganismsInRadiusForLineage } from "./organisms-indexes.js";
import { resourceRegistry } from "./resource-registry.js";
import { ensureSettlementState, getSettlementById, getSettlementInfluenceRadius, getSettlementLevelForDevelopment, getSettlementRouteStats, restoreSettlementGrowthNumber, updateSettlementInfluence } from "./settlements-state.js";
import { world } from "../systems/state.js";

export function normalizeSettlementGrowth(settlement) {
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
  settlement.declineTicks = Math.max(0, Math.round(restoreSettlementGrowthNumber(settlement.declineTicks, 0)));
  settlement.lastDeclineTick = Math.max(
    0,
    Math.round(restoreSettlementGrowthNumber(settlement.lastDeclineTick, 0))
  );
  settlement.declinePressure = clamp(restoreSettlementGrowthNumber(settlement.declinePressure, 0), 0, 1);
  settlement.isAbandoned = Boolean(settlement.isAbandoned);
  settlement.influenceRadius = Math.max(
    1,
    Math.round(restoreSettlementGrowthNumber(settlement.influenceRadius, getSettlementInfluenceRadius(settlement)))
  );
  settlement.claimedTiles = Math.max(0, Math.round(restoreSettlementGrowthNumber(settlement.claimedTiles, 0)));
  settlement.claimedFood = Math.max(0, Math.round(restoreSettlementGrowthNumber(settlement.claimedFood, 0)));

  resourceRegistry.normalizeSettlement(settlement);
}

export function updateSettlementLevel(settlement) {
  settlement.level = getSettlementLevelForDevelopment(settlement.development);

  if (settlement.isOutpost && settlement.level >= CONFIG.SETTLEMENT_COLONY_LEVEL) {
    settlement.isColony = true;
  }

  updateSettlementInfluence(settlement);
}

export function countSettlementFoodStock(settlement) {
  return countFoodInRadius(settlement.x, settlement.y, settlement.radius);
}

export function countSettlementPopulation(settlement) {
  return countOrganismsInRadiusForLineage(settlement.x, settlement.y, settlement.radius, settlement.lineageId);
}

export function updateSettlementMetrics(settlement) {
  normalizeSettlementGrowth(settlement);
  settlement.population = countSettlementPopulation(settlement);
  settlement.foodStock = countSettlementFoodStock(settlement);
  settlement.isActive = settlement.population > 0;
  if (settlement.isActive) {
    settlement.isAbandoned = false;
  }
  updateSettlementLevel(settlement);
  updateSettlementInfluence(settlement);

  if (settlement.isActive) {
    settlement.lastActiveTick = world.tick;
  }
}

export function harvestSettlementFood(settlement) {
  var harvestLimit = Math.max(0, Math.round(Number(CONFIG.SETTLEMENT_FOOD_HARVEST_PER_GROWTH) || 0));
  var harvestedFood = removeFoodInRadius(settlement.x, settlement.y, settlement.radius, harvestLimit);

  settlement.storedFood += harvestedFood;
  resourceRegistry.recordFlow(settlement, "food", "produced", harvestedFood);
  settlement.foodStock = countSettlementFoodStock(settlement);

  if (typeof recordFoodHarvested === "function") {
    recordFoodHarvested(harvestedFood);
  }

  return harvestedFood;
}

export function getSettlementMaintenancePopulation(settlement) {
  var populationPerLevel = Math.max(
    0,
    Number(CONFIG.SETTLEMENT_MAINTENANCE_POPULATION_PER_LEVEL) || 0
  );

  return Math.max(0, Math.round(Math.max(1, Number(settlement.level) || 1) * populationPerLevel));
}

export function applySettlementDevelopmentDecay(settlement) {
  var beforeDevelopment = Math.max(0, Number(settlement.development) || 0);
  var maintenancePopulation = getSettlementMaintenancePopulation(settlement);
  var decay = 1;
  var pressure = 0;

  if (beforeDevelopment <= 0) {
    settlement.declinePressure = 0;
    settlement.isAbandoned = !settlement.isActive;
    return false;
  }

  if (maintenancePopulation > 0 && settlement.population < maintenancePopulation) {
    decay *= clamp(Number(CONFIG.SETTLEMENT_UNDERPOPULATED_DEVELOPMENT_DECAY) || 1, 0, 1);
    pressure = Math.max(
      pressure,
      clamp((maintenancePopulation - settlement.population) / maintenancePopulation, 0, 1)
    );
  }

  if (settlement.storedFood <= 0) {
    decay *= clamp(Number(CONFIG.SETTLEMENT_FAMINE_DEVELOPMENT_DECAY) || 1, 0, 1);
    pressure = Math.max(pressure, 0.5);
  }

  if (!settlement.isActive) {
    decay *= clamp(Number(CONFIG.SETTLEMENT_ABANDONED_DEVELOPMENT_DECAY) || 1, 0, 1);
    pressure = 1;
  }

  if (decay >= 1) {
    settlement.declinePressure = 0;
    return false;
  }

  settlement.development = Math.max(0, beforeDevelopment * decay);
  settlement.declineTicks++;
  settlement.lastDeclineTick = world.tick;
  settlement.declinePressure = pressure;
  settlement.isAbandoned = !settlement.isActive && settlement.development < 1;
  return settlement.development < beforeDevelopment;
}

export function runSettlementGrowth(settlement) {
  normalizeSettlementGrowth(settlement);

  var growthInterval = Math.max(1, Math.round(Number(CONFIG.SETTLEMENT_GROWTH_INTERVAL) || 1));

  if (world.tick - settlement.lastGrowthTick < growthInterval) {
    return;
  }

  resourceRegistry.applySpoilage(settlement, world.tick);

  applySettlementDevelopmentDecay(settlement);

  if (settlement.isActive) {
    harvestSettlementFood(settlement);

    settlement.development +=
      settlement.population * CONFIG.SETTLEMENT_DEVELOPMENT_PER_POPULATION +
      settlement.storedFood * CONFIG.SETTLEMENT_DEVELOPMENT_PER_STORED_FOOD;
  }

  settlement.lastGrowthTick = world.tick;
  updateSettlementLevel(settlement);
}

export function countChildOutposts(settlement) {
  if (!settlement) {
    return 0;
  }

  ensureSettlementState();

  return Math.max(
    0,
    Math.round(Number(world.settlementChildOutpostCountByParentId[String(settlement.id)]) || 0)
  );
}

export function countRoutesForSettlement(settlementId) {
  return getSettlementRouteStats(settlementId).routeCount;
}

export function countActiveRoutesForSettlement(settlementId) {
  return getSettlementRouteStats(settlementId).activeRoutes;
}

export function getColonyNetworkSummary() {
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

export function updateColonyNetworkState() {
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

export function getSpaceProgramInvestmentColonies(foodCost) {
  var colonies = [];

  for (var i = 0; i < world.settlements.length; i++) {
    var settlement = world.settlements[i];

    if (settlement.isColony && settlement.isActive && settlement.storedFood >= foodCost) {
      colonies.push(settlement);
    }
  }

  return colonies;
}

export function updateSpaceProgramReadiness(networkSummary) {
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

export function updateSpaceProgramState(networkSummary) {
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
    resourceRegistry.recordFlow(investmentColonies[i], "food", "consumed", foodCost);
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

export function ensureOrbitalState() {
  if (!Array.isArray(world.orbitalAssets)) {
    world.orbitalAssets = [];
  }

  if (typeof world.nextOrbitalAssetId !== "number" || world.nextOrbitalAssetId < 1) {
    world.nextOrbitalAssetId = 1;
  }

  world.orbitalInfrastructureScore = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.orbitalInfrastructureScore, 0)));
  world.orbitalPlatformReady = Boolean(world.orbitalPlatformReady);
}
