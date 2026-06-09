"use strict";
// SCAFFOLDING: This file is a progress bar, not a game system. Redesign required.
// Freeze new features here until intelligence, predation/body traits, and real technology progression exist.

function updateStarMapState() {
  if (!updateStarMapReadiness()) {
    return;
  }

  var mapInterval = Math.max(1, Math.round(Number(CONFIG.STAR_MAP_INTERVAL) || 1));

  if (world.tick - world.lastStarMapTick < mapInterval) {
    return;
  }

  world.lastStarMapTick = world.tick;
  world.starMapProgress +=
    getCompletedProbeMissionCount() * CONFIG.STAR_MAP_PROGRESS_PER_COMPLETED_PROBE +
    world.orbitalInfrastructureScore * CONFIG.STAR_MAP_PROGRESS_PER_INFRASTRUCTURE;

  var discoveryThreshold = Math.max(1, Number(CONFIG.STAR_SYSTEM_DISCOVERY_THRESHOLD) || 1);

  while (
    world.starMapProgress >= discoveryThreshold &&
    world.starSystems.length < CONFIG.STAR_MAP_MAX_SYSTEMS
  ) {
    var starSystem = makeStarSystem();
    world.starSystems.push(starSystem);
    registerStarSystemInIndex(starSystem);
    world.starMapProgress -= discoveryThreshold;
  }

  updateStarMapReadiness();
}

function ensureGalacticInfluenceState() {
  normalizeStarSystems();

  world.galacticInfluenceProgress = Math.max(0, restoreSettlementGrowthNumber(world.galacticInfluenceProgress, 0));
  world.galacticInfluenceReady = Boolean(world.galacticInfluenceReady);
  world.galacticClaimedSystems = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.galacticClaimedSystems, 0)));
  world.lastGalacticInfluenceTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.lastGalacticInfluenceTick, 0)));
}

function getNextClaimableStarSystem() {
  normalizeStarSystems();

  var claimableSystem = null;

  for (var i = 0; i < world.starSystems.length; i++) {
    var system = world.starSystems[i];

    if (!system.isMapped || system.isClaimed) {
      continue;
    }

    if (
      !claimableSystem ||
      system.influenceValue > claimableSystem.influenceValue ||
      (system.influenceValue === claimableSystem.influenceValue && system.id < claimableSystem.id)
    ) {
      claimableSystem = system;
    }
  }

  return claimableSystem;
}

function updateGalacticInfluenceEra() {
  world.galacticClaimedSystems = getClaimedStarSystemCount();

  if (getEmpireLegacyLevel() >= CONFIG.ASCENDANT_EMPIRE_LEGACY_LEVEL) {
    world.era = "Ascendant Empire";
  } else if (getEmpireSectorCount() >= CONFIG.GALACTIC_EMPIRE_SECTOR_COUNT) {
    world.era = "Galactic Empire";
  } else if (getEmpireSectorCount() > 0) {
    world.era = "Empire Sectors";
  } else if (getCompletedInterstellarFleetCount() >= CONFIG.EMPIRE_NETWORK_COMPLETED_FLEETS) {
    world.era = "Empire Network";
  } else if (getInterstellarFleetCount() > 0) {
    world.era = "Interstellar Fleets";
  } else if (world.galacticClaimedSystems >= CONFIG.PROTO_EMPIRE_SYSTEM_COUNT) {
    world.era = "Proto-Empire";
  } else if (world.galacticClaimedSystems > 0) {
    world.era = "Galactic Influence";
  } else {
    updateStarMapEra();
  }
}

function updateGalacticInfluenceReadiness() {
  ensureGalacticInfluenceState();

  world.galacticClaimedSystems = getClaimedStarSystemCount();
  world.galacticInfluenceReady = Boolean(
    getDiscoveredStarSystemCount() >= CONFIG.GALACTIC_INFLUENCE_MIN_SYSTEMS &&
    getNextClaimableStarSystem()
  );

  updateGalacticInfluenceEra();
  return world.galacticInfluenceReady;
}

function claimNextStarSystem() {
  var system = getNextClaimableStarSystem();

  if (!system) {
    return null;
  }

  system.isClaimed = true;
  system.claimedTick = world.tick;
  world.galacticClaimedSystems = getClaimedStarSystemCount();
  return system;
}

function updateGalacticInfluenceState() {
  if (!updateGalacticInfluenceReadiness()) {
    return;
  }

  var influenceInterval = Math.max(1, Math.round(Number(CONFIG.GALACTIC_INFLUENCE_INTERVAL) || 1));

  if (world.tick - world.lastGalacticInfluenceTick < influenceInterval) {
    return;
  }

  world.lastGalacticInfluenceTick = world.tick;
  world.galacticInfluenceProgress +=
    getMappedStarSystemValue() * CONFIG.GALACTIC_INFLUENCE_PROGRESS_PER_MAP_VALUE +
    getCompletedProbeMissionCount() * CONFIG.GALACTIC_INFLUENCE_PROGRESS_PER_COMPLETED_PROBE +
    world.orbitalInfrastructureScore * CONFIG.GALACTIC_INFLUENCE_PROGRESS_PER_INFRASTRUCTURE;

  var claimThreshold = Math.max(1, Number(CONFIG.GALACTIC_SYSTEM_CLAIM_THRESHOLD) || 1);

  while (world.galacticInfluenceProgress >= claimThreshold && getNextClaimableStarSystem()) {
    claimNextStarSystem();
    world.galacticInfluenceProgress -= claimThreshold;
  }

  updateGalacticInfluenceReadiness();
}

function ensureInterstellarFleetState() {
  if (!Array.isArray(world.interstellarFleets)) {
    world.interstellarFleets = [];
  }

  if (typeof world.nextInterstellarFleetId !== "number" || world.nextInterstellarFleetId < 1) {
    world.nextInterstellarFleetId = 1;
  }

  world.interstellarFleetProgress = Math.max(0, restoreSettlementGrowthNumber(world.interstellarFleetProgress, 0));
  world.interstellarFleetReady = Boolean(world.interstellarFleetReady);
  world.interstellarFleetActive = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.interstellarFleetActive, 0)));
  world.interstellarFleetCompleted = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.interstellarFleetCompleted, 0)));
  world.lastInterstellarFleetTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.lastInterstellarFleetTick, 0)));
}

function allocateInterstellarFleetId() {
  ensureInterstellarFleetState();

  var fleetId = world.nextInterstellarFleetId;
  world.nextInterstellarFleetId++;
  return fleetId;
}

function getClaimedStarSystems() {
  normalizeStarSystems();

  var claimedSystems = [];

  for (var i = 0; i < world.starSystems.length; i++) {
    if (world.starSystems[i].isMapped && world.starSystems[i].isClaimed) {
      claimedSystems.push(world.starSystems[i]);
    }
  }

  claimedSystems.sort(function(a, b) {
    return a.id - b.id;
  });

  return claimedSystems;
}

function getStarSystemById(systemId) {
  ensureStarMapState();
  var systemKey = String(systemId);

  if (world.starSystemsById[systemKey]) {
    return world.starSystemsById[systemKey];
  }

  rebuildStarSystemIndexes();
  return world.starSystemsById[systemKey] || null;
}

function getInterstellarFleetEndpoints() {
  var claimedSystems = getClaimedStarSystems();

  if (claimedSystems.length < 2) {
    return null;
  }

  var sourceIndex = world.interstellarFleets.length % claimedSystems.length;
  var targetIndex = (sourceIndex + 1 + Math.floor(world.interstellarFleets.length / claimedSystems.length)) % claimedSystems.length;

  if (targetIndex === sourceIndex) {
    targetIndex = (sourceIndex + 1) % claimedSystems.length;
  }

  return {
    sourceSystemId: claimedSystems[sourceIndex].id,
    targetSystemId: claimedSystems[targetIndex].id
  };
}

function normalizeInterstellarFleet(fleet) {
  fleet.id = Math.max(1, Math.round(restoreSettlementGrowthNumber(fleet.id, world.nextInterstellarFleetId)));
  fleet.sourceSystemId = Math.max(1, Math.round(restoreSettlementGrowthNumber(fleet.sourceSystemId, 1)));
  fleet.targetSystemId = Math.max(1, Math.round(restoreSettlementGrowthNumber(fleet.targetSystemId, fleet.sourceSystemId)));
  fleet.launchedTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(fleet.launchedTick, world.tick)));
  fleet.arrivalTick = Math.max(fleet.launchedTick, Math.round(restoreSettlementGrowthNumber(fleet.arrivalTick, fleet.launchedTick)));
  fleet.progress = Math.max(0, Math.min(1, restoreSettlementGrowthNumber(fleet.progress, 0)));
  fleet.isComplete = Boolean(fleet.isComplete);

  if (fleet.id >= world.nextInterstellarFleetId) {
    world.nextInterstellarFleetId = fleet.id + 1;
  }
}

function makeInterstellarFleet() {
  var endpoints = getInterstellarFleetEndpoints();

  if (!endpoints) {
    return null;
  }

  var fleetId = allocateInterstellarFleetId();
  var travelTicks = Math.max(1, Math.round(Number(CONFIG.INTERSTELLAR_FLEET_TRAVEL_TICKS) || 1));

  return {
    id: fleetId,
    sourceSystemId: endpoints.sourceSystemId,
    targetSystemId: endpoints.targetSystemId,
    launchedTick: world.tick,
    arrivalTick: world.tick + travelTicks,
    progress: 0,
    isComplete: false
  };
}

function normalizeInterstellarFleets() {
  ensureInterstellarFleetState();

  for (var i = 0; i < world.interstellarFleets.length; i++) {
    normalizeInterstellarFleet(world.interstellarFleets[i]);
  }
}

function updateInterstellarFleetTravel() {
  normalizeInterstellarFleets();

  var activeFleets = 0;
  var completedFleets = 0;

  for (var i = 0; i < world.interstellarFleets.length; i++) {
    var fleet = world.interstellarFleets[i];

    if (fleet.isComplete) {
      fleet.progress = 1;
      completedFleets++;
      continue;
    }

    var travelTicks = Math.max(1, fleet.arrivalTick - fleet.launchedTick);
    fleet.progress = Math.max(0, Math.min(1, (world.tick - fleet.launchedTick) / travelTicks));

    if (world.tick >= fleet.arrivalTick) {
      fleet.progress = 1;
      fleet.isComplete = true;
      completedFleets++;
    } else {
      activeFleets++;
    }
  }

  world.interstellarFleetActive = activeFleets;
  world.interstellarFleetCompleted = completedFleets;
}

function getInterstellarFleetCount() {
  ensureInterstellarFleetState();
  return world.interstellarFleets.length;
}

function getCompletedInterstellarFleetCount() {
  updateInterstellarFleetTravel();
  return world.interstellarFleetCompleted;
}

function updateInterstellarFleetEra() {
  updateInterstellarFleetTravel();

  if (getEmpireLegacyLevel() >= CONFIG.ASCENDANT_EMPIRE_LEGACY_LEVEL) {
    world.era = "Ascendant Empire";
  } else if (getEmpireSectorCount() >= CONFIG.GALACTIC_EMPIRE_SECTOR_COUNT) {
    world.era = "Galactic Empire";
  } else if (getEmpireSectorCount() > 0) {
    world.era = "Empire Sectors";
  } else if (world.interstellarFleetCompleted >= CONFIG.EMPIRE_NETWORK_COMPLETED_FLEETS) {
    world.era = "Empire Network";
  } else if (world.interstellarFleets.length > 0) {
    world.era = "Interstellar Fleets";
  } else {
    updateGalacticInfluenceEra();
  }
}
