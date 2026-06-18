"use strict";
import { CONFIG } from "../config.js";
import { PS } from "./core/namespace.js";
import { clamp } from "./core/utils.js";
import { getActiveLineageCount, getEcosystemMomentum, getEcosystemPressure, getEcosystemStabilityProfile, getEcosystemTrend, getLatestEcosystemHistorySample } from "./main-ecosystem-stability.js";
import { ensureOrganismTraits } from "./sim/organisms-traits.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "./systems/state.js";

export function getEcosystemRecoveryAction(summary) {
  if (!summary || !summary.stabilityProfile) {
    return "observe";
  }

  var factor = summary.stabilityProfile.limitingFactor;

  if (summary.population <= 0 || factor === "population") {
    return "restart seed";
  }

  if (factor === "food") {
    if (summary.resourceBalance === "draining") {
      return "reduce food drain";
    }

    return "grow food stock";
  }

  if (factor === "energy") {
    return "restore energy";
  }

  if (factor === "maturity") {
    return "let adults form";
  }

  if (factor === "diversity") {
    return "protect lineages";
  }

  if (factor === "crowding") {
    return "relieve crowding";
  }

  return "stabilize";
}

export function getPopulationBalance(populationDelta, population) {
  if (population <= 0) {
    return "extinct";
  }

  var magnitude = Math.abs(populationDelta);
  var largeSwing = Math.max(4, Math.ceil(population * 0.08));

  if (populationDelta >= largeSwing) {
    return "surging";
  }

  if (populationDelta > 0) {
    return "growing";
  }

  if (populationDelta <= -largeSwing) {
    return "crashing";
  }

  if (populationDelta < 0) {
    return "declining";
  }

  return magnitude === 0 ? "steady" : "shifting";
}

export function getResourceBalance(foodNet, foodStock) {
  var largeSwing = Math.max(3, Math.ceil(Math.max(1, foodStock) * 0.025));

  if (foodNet >= largeSwing) {
    return "replenishing";
  }

  if (foodNet > 0) {
    return "gaining";
  }

  if (foodNet <= -largeSwing) {
    return "draining";
  }

  if (foodNet < 0) {
    return "spending";
  }

  return "steady";
}

export function getFoodRunwayTicks(foodStock, foodNet) {
  var stock = Math.max(0, Math.round(Number(foodStock) || 0));
  var net = Math.round(Number(foodNet) || 0);

  if (stock <= 0) {
    return 0;
  }

  if (net >= 0) {
    return -1;
  }

  return Math.max(1, Math.ceil(stock / Math.abs(net)));
}

export function formatFoodRunway(runwayTicks) {
  if (runwayTicks < 0) {
    return "stable";
  }

  return Math.max(0, Math.round(Number(runwayTicks) || 0)) + " ticks";
}

export function refreshEcosystemSummary() {
  var population = world.organisms.length;
  var totalEnergy = 0;
  var totalAge = 0;
  var matureOrganisms = 0;
  var pooledArrays = PS.pools && PS.pools.organism ? PS.pools.organism.arrays : null;

  for (var i = 0; i < world.organisms.length; i++) {
    var organism = world.organisms[i];
    var poolIndex = pooledArrays && Number.isFinite(Number(organism.poolIndex)) ? Math.round(organism.poolIndex) : -1;
    var energy = poolIndex >= 0 ? pooledArrays.energy[poolIndex] : Math.max(0, Number(organism.energy) || 0);
    var age = poolIndex >= 0 ? pooledArrays.age[poolIndex] : Math.max(0, Number(organism.age) || 0);
    var reproductionEnergy = poolIndex >= 0
      ? pooledArrays.reproductionEnergy[poolIndex]
      : ensureOrganismTraits(organism).reproductionEnergy;

    totalEnergy += Math.max(0, energy);
    totalAge += Math.max(0, age);

    if (energy >= reproductionEnergy) {
      matureOrganisms++;
    }
  }

  var averageEnergy = population > 0 ? totalEnergy / population : 0;
  var averageAge = population > 0 ? totalAge / population : 0;
  var foodPerOrganism = population > 0 ? world.food.length / population : world.food.length;
  var fertilePercent = (world.fertileTiles / (WORLD_WIDTH * WORLD_HEIGHT)) * 100;
  var activeLineages = world.lineageSummary && Number.isFinite(Number(world.lineageSummary.activeCount))
    ? Math.max(0, Math.round(Number(world.lineageSummary.activeCount) || 0))
    : getActiveLineageCount();
  var matureRatio = population > 0 ? matureOrganisms / population : 0;
  var foodNetThisTick = Math.max(0, Math.round(Number(world.foodSpawnedThisTick) || 0)) -
    Math.max(0, Math.round(Number(world.foodConsumedThisTick) || 0));
  var pressure = getEcosystemPressure(population, averageEnergy, foodPerOrganism);
  var stabilityProfile = getEcosystemStabilityProfile(
    population,
    averageEnergy,
    foodPerOrganism,
    activeLineages,
    matureRatio
  );

  world.ecosystemSummary = {
    population: population,
    food: world.food.length,
    foodPerOrganism: foodPerOrganism,
    averageEnergy: averageEnergy,
    averageAge: averageAge,
    matureOrganisms: matureOrganisms,
    matureRatio: matureRatio,
    activeLineages: activeLineages,
    fertilePercent: fertilePercent,
    populationBalance: getPopulationBalance(Math.round(Number(world.populationDeltaThisTick) || 0), population),
    reproductionScarcityPressure: clamp(Number(world.reproductionScarcityPressure) || 0, 0, 1),
    resourceBalance: getResourceBalance(foodNetThisTick, world.food.length),
    foodNetThisTick: foodNetThisTick,
    foodRunwayTicks: getFoodRunwayTicks(world.food.length, foodNetThisTick),
    foodRecoveryPressure: clamp(Number(world.foodRecoveryPressure) || 0, 0, 1),
    foodRecoveryAttempts: Math.max(0, Math.round(Number(world.foodRecoveryAttemptsThisTick) || 0)),
    pressure: pressure,
    stabilityScore: stabilityProfile.stabilityScore,
    stabilityProfile: stabilityProfile,
    recoveryAction: ""
  };

  world.ecosystemSummary.recoveryAction = getEcosystemRecoveryAction(world.ecosystemSummary);
  world.ecosystemSummary.trend = getEcosystemTrend(world.ecosystemSummary);
  world.ecosystemSummary.momentum = getEcosystemMomentum(world.ecosystemSummary.trend);
  return world.ecosystemSummary;
}

export function makeEcosystemHistorySample(summary) {
  summary = summary || refreshEcosystemSummary();

  return {
    tick: world.tick,
    population: summary.population,
    food: summary.food,
    averageEnergy: summary.averageEnergy,
    foodPerOrganism: summary.foodPerOrganism,
    populationBalance: summary.populationBalance,
    resourceBalance: summary.resourceBalance,
    foodNetThisTick: summary.foodNetThisTick,
    foodRunwayTicks: summary.foodRunwayTicks,
    pressure: summary.pressure,
    stabilityScore: summary.stabilityScore
  };
}

export function recordEcosystemHistorySample(force) {
  if (!Array.isArray(world.ecosystemHistory)) {
    world.ecosystemHistory = [];
  }

  if (!force && world.tick % CONFIG.ECOSYSTEM_HISTORY_SAMPLE_INTERVAL !== 0) {
    return;
  }

  var lastSample = getLatestEcosystemHistorySample();

  if (lastSample && lastSample.tick === world.tick) {
    return;
  }

  world.ecosystemHistory.push(makeEcosystemHistorySample(world.ecosystemSummary));

  while (world.ecosystemHistory.length > CONFIG.ECOSYSTEM_HISTORY_MAX_SAMPLES) {
    world.ecosystemHistory.shift();
  }
}

export function resetPopulationFlowCounters() {
  world.birthsThisTick = 0;
  world.deathsThisTick = 0;
  world.populationDeltaThisTick = 0;
  world.reproductionScarcityPressure = 0;
}

export function resetFoodFlowCounters() {
  world.foodSpawnedThisTick = 0;
  world.foodConsumedThisTick = 0;
  world.foodHarvestedThisTick = 0;
  world.foodRecoveryPressure = 0;
  world.foodRecoveryAttemptsThisTick = 0;
}

export function recordOrganismBirth(count) {
  var birthCount = Math.max(0, Math.round(Number(count) || 0));

  if (birthCount <= 0) {
    return;
  }

  world.birthsThisTick += birthCount;
  world.totalBirths += birthCount;
}

export function recordOrganismDeath(count) {
  var deathCount = Math.max(0, Math.round(Number(count) || 0));

  if (deathCount <= 0) {
    return;
  }

  world.deathsThisTick += deathCount;
  world.totalDeaths += deathCount;
}

export function recordFoodSpawned(count) {
  var foodCount = Math.max(0, Math.round(Number(count) || 0));

  if (foodCount <= 0) {
    return;
  }

  world.foodSpawnedThisTick += foodCount;
  world.totalFoodSpawned += foodCount;
}

export function recordFoodConsumed(count) {
  var foodCount = Math.max(0, Math.round(Number(count) || 0));

  if (foodCount <= 0) {
    return;
  }

  world.foodConsumedThisTick += foodCount;
  world.totalFoodConsumed += foodCount;
}

export function recordFoodHarvested(count) {
  var foodCount = Math.max(0, Math.round(Number(count) || 0));

  if (foodCount <= 0) {
    return;
  }

  world.foodHarvestedThisTick += foodCount;
  world.totalFoodHarvested += foodCount;
  recordFoodConsumed(foodCount);
}

export function makeSimulationAlert(severity, label, detail, priority) {
  return {
    severity: String(severity || "info"),
    label: String(label || "Simulation"),
    detail: String(detail || ""),
    priority: Math.max(0, Math.round(Number(priority) || 100))
  };
}

export function getSimulationAlertSeverityRank(severity) {
  if (severity === "danger") {
    return 0;
  }

  if (severity === "warning") {
    return 1;
  }

  if (severity === "ready") {
    return 2;
  }

  return 3;
}
