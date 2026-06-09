"use strict";
function recordBalanceTransition(previousSnapshot, currentSnapshot, key, target, label, valueKey) {
  if (
    previousSnapshot[key] !== "unknown" &&
    previousSnapshot[key] !== target &&
    currentSnapshot[key] === target
  ) {
    recordSimulationEvent(
      "ecosystem",
      label,
      "net " + formatMilestoneSignedNumber(currentSnapshot[valueKey])
    );
  }
}

function recordBalanceMilestones(previousSnapshot, currentSnapshot) {
  recordBalanceTransition(
    previousSnapshot,
    currentSnapshot,
    "populationBalance",
    "surging",
    "Population surge",
    "populationDelta"
  );
  recordBalanceTransition(
    previousSnapshot,
    currentSnapshot,
    "populationBalance",
    "crashing",
    "Population crash",
    "populationDelta"
  );
  recordBalanceTransition(
    previousSnapshot,
    currentSnapshot,
    "resourceBalance",
    "replenishing",
    "Food replenishing",
    "foodNetThisTick"
  );
  recordBalanceTransition(
    previousSnapshot,
    currentSnapshot,
    "resourceBalance",
    "draining",
    "Food draining",
    "foodNetThisTick"
  );
}

function recordLifecycleMilestones(previousSnapshot, currentSnapshot) {
  if (!previousSnapshot.isExtinct && currentSnapshot.isExtinct) {
    recordSimulationEvent("lifecycle", "Extinction", "population 0");
  }

  if (previousSnapshot.isExtinct && !currentSnapshot.isExtinct && currentSnapshot.population > 0) {
    recordSimulationEvent("lifecycle", "Population recovered", "population " + currentSnapshot.population);
  }
}

function recordSimulationMilestones(previousSnapshot) {
  var currentSnapshot = getSimulationMilestoneSnapshot();

  if (currentSnapshot.era !== previousSnapshot.era) {
    recordSimulationEvent("era", currentSnapshot.era, previousSnapshot.era + " -> " + currentSnapshot.era);
  }

  recordLifecycleMilestones(previousSnapshot, currentSnapshot);
  recordEcosystemMilestones(previousSnapshot, currentSnapshot);
  recordBalanceMilestones(previousSnapshot, currentSnapshot);
  recordCountMilestone(previousSnapshot, currentSnapshot, "settlements", "settlement", "Settlement founded", "total");
  recordCountMilestone(previousSnapshot, currentSnapshot, "outposts", "settlement", "Outpost founded", "total");
  recordCountMilestone(previousSnapshot, currentSnapshot, "colonies", "settlement", "Colony matured", "total");
  recordCountMilestone(previousSnapshot, currentSnapshot, "routes", "network", "Trade route opened", "total");
  recordCountMilestone(previousSnapshot, currentSnapshot, "orbitalLaunches", "space", "Orbital launch", "launches");
  recordCountMilestone(previousSnapshot, currentSnapshot, "planetaryBodies", "space", "Planet discovered", "bodies");
  recordCountMilestone(previousSnapshot, currentSnapshot, "completedProbeMissions", "space", "Probe arrived", "completed");
  recordCountMilestone(previousSnapshot, currentSnapshot, "starSystems", "galaxy", "Star mapped", "systems");
  recordCountMilestone(previousSnapshot, currentSnapshot, "claimedSystems", "galaxy", "System claimed", "claimed");
  recordCountMilestone(previousSnapshot, currentSnapshot, "interstellarFleets", "galaxy", "Fleet launched", "fleets");
  recordCountMilestone(previousSnapshot, currentSnapshot, "completedInterstellarFleets", "galaxy", "Fleet arrived", "completed");
  recordCountMilestone(previousSnapshot, currentSnapshot, "empireSectors", "empire", "Sector founded", "sectors");
  recordCountMilestone(previousSnapshot, currentSnapshot, "empireLegacyLevel", "empire", "Legacy advanced", "level");

  if (currentSnapshot.empireLegacyComplete && !previousSnapshot.empireLegacyComplete) {
    recordSimulationEvent("empire", "Ascendant empire", "legacy complete");
  }
}

function getActiveLineageCount() {
  var activeLineages = 0;
  var lineages = world.lineages || {};

  for (var lineageKey in lineages) {
    if (
      Object.prototype.hasOwnProperty.call(lineages, lineageKey) &&
      Math.max(0, Math.round(Number(lineages[lineageKey].activeCount) || 0)) > 0
    ) {
      activeLineages++;
    }
  }

  return activeLineages;
}

function getEcosystemPressure(population, averageEnergy, foodPerOrganism) {
  if (population <= 0) {
    return "extinct";
  }

  if (population >= CONFIG.MAX_ORGANISMS * 0.92) {
    return "crowded";
  }

  if (foodPerOrganism < 0.18 || averageEnergy < CONFIG.CHILD_ORGANISM_ENERGY * 0.45) {
    return "starving";
  }

  if (foodPerOrganism < 0.55 || averageEnergy < CONFIG.CHILD_ORGANISM_ENERGY * 0.8) {
    return "strained";
  }

  if (foodPerOrganism >= 1.2 && averageEnergy >= CONFIG.STARTING_ORGANISM_ENERGY * 0.85) {
    return "growing";
  }

  return "balanced";
}

function getLatestEcosystemHistorySample() {
  if (!Array.isArray(world.ecosystemHistory) || world.ecosystemHistory.length === 0) {
    return null;
  }

  return world.ecosystemHistory[world.ecosystemHistory.length - 1];
}

function getEcosystemTrend(summary) {
  var sample = getLatestEcosystemHistorySample();

  if (!sample || sample.tick === world.tick) {
    return {
      populationDelta: 0,
      energyDelta: 0,
      foodDelta: 0,
      stabilityDelta: 0,
      foodNetDelta: 0,
      foodRunwayDelta: 0
    };
  }

  var currentRunway = Number(summary.foodRunwayTicks);
  var sampleRunway = Number(sample.foodRunwayTicks);
  var foodRunwayDelta = currentRunway >= 0 && sampleRunway >= 0
    ? currentRunway - sampleRunway
    : 0;

  return {
    populationDelta: summary.population - sample.population,
    energyDelta: summary.averageEnergy - sample.averageEnergy,
    foodDelta: summary.food - sample.food,
    stabilityDelta: summary.stabilityScore - (Number(sample.stabilityScore) || 0),
    foodNetDelta: summary.foodNetThisTick - (Number(sample.foodNetThisTick) || 0),
    foodRunwayDelta: foodRunwayDelta
  };
}

function getEcosystemMomentum(trend) {
  trend = trend || {};

  if ((Number(trend.stabilityDelta) || 0) >= 8 && (Number(trend.foodNetDelta) || 0) >= 0) {
    return "recovering";
  }

  if ((Number(trend.stabilityDelta) || 0) <= -12) {
    return "sliding";
  }

  if ((Number(trend.foodNetDelta) || 0) <= -18) {
    return "draining";
  }

  if ((Number(trend.populationDelta) || 0) >= 8 && (Number(trend.foodNetDelta) || 0) >= 0) {
    return "expanding";
  }

  return "steady";
}

function formatEcosystemTrendDelta(trend, key) {
  if (!trend) {
    return "0";
  }

  return formatMilestoneSignedNumber(trend[key]);
}

function getLowestStabilityFactor(componentScores) {
  var lowestKey = "population";
  var lowestScore = componentScores.population;

  for (var key in componentScores) {
    if (
      Object.prototype.hasOwnProperty.call(componentScores, key) &&
      componentScores[key] < lowestScore
    ) {
      lowestKey = key;
      lowestScore = componentScores[key];
    }
  }

  return lowestKey;
}

function getEcosystemStabilityProfile(population, averageEnergy, foodPerOrganism, activeLineages, matureRatio) {
  if (population <= 0) {
    return {
      stabilityScore: 0,
      limitingFactor: "population",
      population: 0,
      energy: 0,
      food: 0,
      diversity: 0,
      maturity: 0,
      crowdPenalty: 1
    };
  }

  var componentRatios = {
    population: clamp(population / Math.max(1, CONFIG.MAX_ORGANISMS * 0.45), 0, 1),
    energy: clamp(averageEnergy / Math.max(1, CONFIG.STARTING_ORGANISM_ENERGY), 0, 1),
    food: clamp(foodPerOrganism / 1.2, 0, 1),
    diversity: clamp(activeLineages / 5, 0, 1),
    maturity: clamp(matureRatio / 0.25, 0, 1)
  };
  var componentScores = {
    population: Math.round(componentRatios.population * 100),
    energy: Math.round(componentRatios.energy * 100),
    food: Math.round(componentRatios.food * 100),
    diversity: Math.round(componentRatios.diversity * 100),
    maturity: Math.round(componentRatios.maturity * 100)
  };
  var crowdPenalty = population > CONFIG.MAX_ORGANISMS * 0.9 ? 0.72 : 1;
  var limitingFactor = getLowestStabilityFactor(componentScores);

  if (crowdPenalty < 1 && componentScores.population >= 90) {
    limitingFactor = "crowding";
  }

  return {
    stabilityScore: Math.round(
      (
        componentRatios.population * 24 +
        componentRatios.energy * 26 +
        componentRatios.food * 22 +
        componentRatios.diversity * 14 +
        componentRatios.maturity * 14
      ) * crowdPenalty
    ),
    limitingFactor: limitingFactor,
    population: componentScores.population,
    energy: componentScores.energy,
    food: componentScores.food,
    diversity: componentScores.diversity,
    maturity: componentScores.maturity,
    crowdPenalty: crowdPenalty
  };
}

function getEcosystemStabilityScore(population, averageEnergy, foodPerOrganism, activeLineages, matureRatio) {
  return getEcosystemStabilityProfile(
    population,
    averageEnergy,
    foodPerOrganism,
    activeLineages,
    matureRatio
  ).stabilityScore;
}

function formatEcosystemStabilityFactor(factor) {
  if (factor === "crowding") {
    return "crowding";
  }

  if (factor === "diversity") {
    return "lineage diversity";
  }

  return String(factor || "stability");
}

function formatEcosystemStabilityFactorScore(profile) {
  if (!profile) {
    return "stability";
  }

  if (profile.limitingFactor === "crowding") {
    return "crowding penalty " + Math.round((1 - profile.crowdPenalty) * 100) + "%";
  }

  return (
    formatEcosystemStabilityFactor(profile.limitingFactor) +
    " " +
    Math.max(0, Math.round(Number(profile[profile.limitingFactor]) || 0)) +
    "/100"
  );
}
