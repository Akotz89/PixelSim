"use strict";
// SCAFFOLDING: This file is a progress bar, not a game system. Redesign required.
// Freeze new features here until intelligence, predation/body traits, and real technology progression exist.

import { CONFIG } from "../../config.js";
// fallow-ignore-next-line circular-dependency
import { getEmpireLegacyLevel, getEmpireSectorCount } from "./civilizations-empire.js";
import { allocateProbeMissionId, ensureProbeMissionState, getDiscoveredPlanetaryBodyCount, getProbeMissionTargetBodyId, normalizeProbeMission, updatePlanetarySurveyEra } from "./civilizations-orbital.js";
// fallow-ignore-next-line circular-dependency
import { getCompletedInterstellarFleetCount, getInterstellarFleetCount } from "./civilizations-stars.js";
import { restoreSettlementGrowthNumber } from "./settlements-state.js";
import { world } from "../systems/state.js";

export function makeProbeMission() {
  var missionId = allocateProbeMissionId();
  var targetBodyId = getProbeMissionTargetBodyId();
  var travelTicks = Math.max(1, Math.round(Number(CONFIG.PROBE_MISSION_COMPLETE_TICKS) || 1));

  return {
    id: missionId,
    targetBodyId: targetBodyId,
    launchedTick: world.tick,
    arrivalTick: world.tick + travelTicks,
    progress: 0,
    isComplete: false
  };
}

export function normalizeProbeMissions() {
  ensureProbeMissionState();

  for (var i = 0; i < world.probeMissions.length; i++) {
    normalizeProbeMission(world.probeMissions[i]);
  }
}

export function getCompletedProbeMissionCount() {
  normalizeProbeMissions();

  var completedMissions = 0;

  for (var i = 0; i < world.probeMissions.length; i++) {
    if (world.probeMissions[i].isComplete) {
      completedMissions++;
    }
  }

  return completedMissions;
}

export function updateProbeMissionTravel() {
  normalizeProbeMissions();

  for (var i = 0; i < world.probeMissions.length; i++) {
    var mission = world.probeMissions[i];

    if (mission.isComplete) {
      mission.progress = 1;
      continue;
    }

    var travelTicks = Math.max(1, mission.arrivalTick - mission.launchedTick);
    mission.progress = Math.max(0, Math.min(1, (world.tick - mission.launchedTick) / travelTicks));

    if (world.tick >= mission.arrivalTick) {
      mission.progress = 1;
      mission.isComplete = true;
    }
  }
}

export function updateProbeMissionEra() {
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
  } else if (getClaimedStarSystemCount() >= CONFIG.PROTO_EMPIRE_SYSTEM_COUNT) {
    world.era = "Proto-Empire";
  } else if (getClaimedStarSystemCount() > 0) {
    world.era = "Galactic Influence";
  } else if (getDiscoveredStarSystemCount() >= CONFIG.GALACTIC_MAP_SYSTEM_COUNT) {
    world.era = "Galactic Map";
  } else if (getCompletedProbeMissionCount() >= CONFIG.STELLAR_CARTOGRAPHY_MISSION_COUNT) {
    world.era = "Stellar Cartography";
  } else if (world.probeMissions.length > 0) {
    world.era = "Interplanetary Missions";
  } else {
    updatePlanetarySurveyEra();
  }
}

export function updateProbeMissionReadiness() {
  ensureProbeMissionState();
  updateProbeMissionTravel();

  world.probeMissionReady = Boolean(
    getDiscoveredPlanetaryBodyCount() >= CONFIG.PROBE_MISSION_MIN_BODIES &&
    world.orbitalPlatformReady
  );

  updateProbeMissionEra();
  return world.probeMissionReady;
}

export function updateProbeMissionState() {
  if (!updateProbeMissionReadiness()) {
    return;
  }

  var missionInterval = Math.max(1, Math.round(Number(CONFIG.PROBE_MISSION_INTERVAL) || 1));

  if (world.tick - world.lastProbeMissionTick < missionInterval) {
    return;
  }

  world.lastProbeMissionTick = world.tick;
  world.probeMissionProgress +=
    getDiscoveredPlanetaryBodyCount() * CONFIG.PROBE_MISSION_PROGRESS_PER_BODY +
    world.orbitalInfrastructureScore * CONFIG.PROBE_MISSION_PROGRESS_PER_INFRASTRUCTURE;

  var missionThreshold = Math.max(1, Number(CONFIG.PROBE_MISSION_THRESHOLD) || 1);

  while (world.probeMissionProgress >= missionThreshold) {
    world.probeMissions.push(makeProbeMission());
    world.probeMissionProgress -= missionThreshold;
  }

  updateProbeMissionReadiness();
}

export function ensureStarMapState() {
  if (!Array.isArray(world.starSystems)) {
    world.starSystems = [];
  }

  if (!world.starSystemsById) {
    rebuildStarSystemIndexes();
  }

  if (typeof world.nextStarSystemId !== "number" || world.nextStarSystemId < 1) {
    world.nextStarSystemId = 1;
  }

  world.starMapProgress = Math.max(0, restoreSettlementGrowthNumber(world.starMapProgress, 0));
  world.starMapReady = Boolean(world.starMapReady);
  world.lastStarMapTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.lastStarMapTick, 0)));
}

export function allocateStarSystemId() {
  ensureStarMapState();

  var systemId = world.nextStarSystemId;
  world.nextStarSystemId++;
  return systemId;
}

export function getStarSystemName(systemId) {
  return "S-" + String(200 + systemId);
}

export function normalizeStarSystem(system) {
  system.id = Math.max(1, Math.round(restoreSettlementGrowthNumber(system.id, world.nextStarSystemId)));
  system.name = String(system.name || getStarSystemName(system.id));
  system.discoveredTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(system.discoveredTick, world.tick)));
  system.mapValue = Math.max(1, Math.round(restoreSettlementGrowthNumber(system.mapValue, 40 + system.id * 11)));
  system.mapX = Math.max(-1, Math.min(1, restoreSettlementGrowthNumber(system.mapX, Math.cos(system.id * 2.1))));
  system.mapY = Math.max(-1, Math.min(1, restoreSettlementGrowthNumber(system.mapY, Math.sin(system.id * 2.1))));
  system.isMapped = system.isMapped !== false;
  system.influenceValue = Math.max(1, Math.round(restoreSettlementGrowthNumber(system.influenceValue, system.mapValue)));
  system.isClaimed = Boolean(system.isClaimed);
  system.claimedTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(system.claimedTick, 0)));

  if (system.id >= world.nextStarSystemId) {
    world.nextStarSystemId = system.id + 1;
  }
}

export function makeStarSystem() {
  var systemId = allocateStarSystemId();
  var angle = systemId * 2.1;
  var distance = 0.34 + (systemId % 4) * 0.16;

  return {
    id: systemId,
    name: getStarSystemName(systemId),
    discoveredTick: world.tick,
    mapValue: 40 + systemId * 11,
    mapX: Math.cos(angle) * distance,
    mapY: Math.sin(angle) * distance,
    isMapped: true,
    influenceValue: 40 + systemId * 11,
    isClaimed: false,
    claimedTick: 0
  };
}

export function registerStarSystemInIndex(system) {
  if (!system) {
    return;
  }

  if (!world.starSystemsById) {
    world.starSystemsById = {};
  }

  world.starSystemsById[String(system.id)] = system;
}

export function rebuildStarSystemIndexes() {
  world.starSystemsById = {};

  if (!Array.isArray(world.starSystems)) {
    return world.starSystemsById;
  }

  for (var i = 0; i < world.starSystems.length; i++) {
    registerStarSystemInIndex(world.starSystems[i]);
  }

  return world.starSystemsById;
}

export function normalizeStarSystems() {
  ensureStarMapState();
  world.starSystemsById = {};

  for (var i = 0; i < world.starSystems.length; i++) {
    normalizeStarSystem(world.starSystems[i]);
    registerStarSystemInIndex(world.starSystems[i]);
  }
}

export function getDiscoveredStarSystemCount() {
  normalizeStarSystems();

  var discoveredSystems = 0;

  for (var i = 0; i < world.starSystems.length; i++) {
    if (world.starSystems[i].isMapped) {
      discoveredSystems++;
    }
  }

  return discoveredSystems;
}

export function getMappedStarSystemValue() {
  normalizeStarSystems();

  var mapValue = 0;

  for (var i = 0; i < world.starSystems.length; i++) {
    if (world.starSystems[i].isMapped) {
      mapValue += Math.max(0, Number(world.starSystems[i].mapValue) || 0);
    }
  }

  return mapValue;
}

export function getClaimedStarSystemCount() {
  normalizeStarSystems();

  var claimedSystems = 0;

  for (var i = 0; i < world.starSystems.length; i++) {
    if (world.starSystems[i].isMapped && world.starSystems[i].isClaimed) {
      claimedSystems++;
    }
  }

  return claimedSystems;
}

export function updateStarMapEra() {
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
  } else if (getClaimedStarSystemCount() >= CONFIG.PROTO_EMPIRE_SYSTEM_COUNT) {
    world.era = "Proto-Empire";
  } else if (getClaimedStarSystemCount() > 0) {
    world.era = "Galactic Influence";
  } else if (getDiscoveredStarSystemCount() >= CONFIG.GALACTIC_MAP_SYSTEM_COUNT) {
    world.era = "Galactic Map";
  } else if (getCompletedProbeMissionCount() >= CONFIG.STELLAR_CARTOGRAPHY_MISSION_COUNT) {
    world.era = "Stellar Cartography";
  }
}

export function updateStarMapReadiness() {
  ensureStarMapState();

  world.starMapReady = Boolean(
    getCompletedProbeMissionCount() >= CONFIG.STAR_MAP_MIN_COMPLETED_PROBES &&
    world.starSystems.length < CONFIG.STAR_MAP_MAX_SYSTEMS
  );

  updateStarMapEra();
  return world.starMapReady;
}
