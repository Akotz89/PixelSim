"use strict";
// SCAFFOLDING: This file is a progress bar, not a game system. Redesign required.
// Freeze new features here until intelligence, predation/body traits, and real technology progression exist.

import { CONFIG } from "../../config.js";
// fallow-ignore-next-line circular-dependency
import { getCompletedProbeMissionCount } from "./civilizations-probes.js";
// fallow-ignore-next-line circular-dependency
import { ensureOrbitalState } from "./settlements-growth.js";
import { restoreSettlementGrowthNumber } from "./settlements-state.js";
import { world } from "../systems/state.js";

export function allocateOrbitalAssetId() {
  ensureOrbitalState();

  var assetId = world.nextOrbitalAssetId;
  world.nextOrbitalAssetId++;
  return assetId;
}

export function normalizeOrbitalAsset(asset) {
  asset.id = Math.max(1, Math.round(restoreSettlementGrowthNumber(asset.id, world.nextOrbitalAssetId)));
  asset.launchNumber = Math.max(1, Math.round(restoreSettlementGrowthNumber(asset.launchNumber, asset.id)));
  asset.launchedTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(asset.launchedTick, world.tick)));
  asset.infrastructureScore = Math.max(0, Math.round(restoreSettlementGrowthNumber(asset.infrastructureScore, CONFIG.ORBITAL_ASSET_SCORE)));
  asset.orbitAngle = Math.max(0, Math.round(restoreSettlementGrowthNumber(asset.orbitAngle, asset.launchNumber * 137))) % 360;
  asset.orbitBand = Math.max(1, Math.round(restoreSettlementGrowthNumber(asset.orbitBand, ((asset.launchNumber - 1) % 3) + 1)));
  asset.isActive = asset.isActive !== false;

  if (asset.id >= world.nextOrbitalAssetId) {
    world.nextOrbitalAssetId = asset.id + 1;
  }
}

export function makeOrbitalAsset(launchNumber) {
  var assetId = allocateOrbitalAssetId();

  return {
    id: assetId,
    launchNumber: Math.max(1, Math.round(launchNumber)),
    launchedTick: world.tick,
    infrastructureScore: Math.max(1, Math.round(Number(CONFIG.ORBITAL_ASSET_SCORE) || 1)),
    orbitAngle: (assetId * 137) % 360,
    orbitBand: ((assetId - 1) % 3) + 1,
    isActive: true
  };
}

export function ensureOrbitalAssetsForLaunches() {
  ensureOrbitalState();

  for (var i = 0; i < world.orbitalAssets.length; i++) {
    normalizeOrbitalAsset(world.orbitalAssets[i]);
  }

  while (world.orbitalAssets.length < world.orbitalLaunches) {
    world.orbitalAssets.push(makeOrbitalAsset(world.orbitalAssets.length + 1));
  }
}

export function updateOrbitalInfrastructureState() {
  ensureOrbitalAssetsForLaunches();

  var infrastructureScore = 0;
  var activeAssets = 0;

  for (var i = 0; i < world.orbitalAssets.length; i++) {
    var asset = world.orbitalAssets[i];

    if (!asset.isActive) {
      continue;
    }

    activeAssets++;
    infrastructureScore += Math.max(0, Number(asset.infrastructureScore) || 0);
  }

  world.orbitalInfrastructureScore = Math.round(infrastructureScore);
  world.orbitalPlatformReady = world.orbitalInfrastructureScore >= CONFIG.ORBITAL_PLATFORM_SCORE && activeAssets > 0;

  if (world.orbitalPlatformReady) {
    world.era = "Orbital Platform";
  } else if (world.orbitalLaunches > 0) {
    world.era = "Orbital";
  }

  updatePlanetarySurveyReadiness();
}

export function ensurePlanetaryState() {
  if (!Array.isArray(world.planetaryBodies)) {
    world.planetaryBodies = [];
  }

  if (!world.planetaryBodiesById) {
    rebuildPlanetaryBodyIndexes();
  }

  if (typeof world.nextPlanetaryBodyId !== "number" || world.nextPlanetaryBodyId < 1) {
    world.nextPlanetaryBodyId = 1;
  }

  world.planetarySurveyProgress = Math.max(0, restoreSettlementGrowthNumber(world.planetarySurveyProgress, 0));
  world.planetarySurveyReady = Boolean(world.planetarySurveyReady);
  world.lastPlanetarySurveyTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.lastPlanetarySurveyTick, 0)));
}

export function allocatePlanetaryBodyId() {
  ensurePlanetaryState();

  var bodyId = world.nextPlanetaryBodyId;
  world.nextPlanetaryBodyId++;
  return bodyId;
}

export function getPlanetaryBodyName(bodyId) {
  return "P-" + String(100 + bodyId);
}

export function normalizePlanetaryBody(body) {
  body.id = Math.max(1, Math.round(restoreSettlementGrowthNumber(body.id, world.nextPlanetaryBodyId)));
  body.name = String(body.name || getPlanetaryBodyName(body.id));
  body.discoveredTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(body.discoveredTick, world.tick)));
  body.surveyValue = Math.max(1, Math.round(restoreSettlementGrowthNumber(body.surveyValue, 20 + body.id * 7)));
  body.orbitAngle = Math.max(0, Math.round(restoreSettlementGrowthNumber(body.orbitAngle, body.id * 67))) % 360;
  body.orbitRadius = Math.max(1, Math.round(restoreSettlementGrowthNumber(body.orbitRadius, 64 + body.id * 10)));
  body.isSurveyed = body.isSurveyed !== false;

  if (body.id >= world.nextPlanetaryBodyId) {
    world.nextPlanetaryBodyId = body.id + 1;
  }
}

export function makePlanetaryBody() {
  var bodyId = allocatePlanetaryBodyId();

  return {
    id: bodyId,
    name: getPlanetaryBodyName(bodyId),
    discoveredTick: world.tick,
    surveyValue: 20 + bodyId * 7,
    orbitAngle: (bodyId * 67) % 360,
    orbitRadius: 64 + bodyId * 10,
    isSurveyed: true
  };
}

export function registerPlanetaryBodyInIndex(body) {
  if (!body) {
    return;
  }

  if (!world.planetaryBodiesById) {
    world.planetaryBodiesById = {};
  }

  world.planetaryBodiesById[String(body.id)] = body;
}

export function rebuildPlanetaryBodyIndexes() {
  world.planetaryBodiesById = {};

  if (!Array.isArray(world.planetaryBodies)) {
    return world.planetaryBodiesById;
  }

  for (var i = 0; i < world.planetaryBodies.length; i++) {
    registerPlanetaryBodyInIndex(world.planetaryBodies[i]);
  }

  return world.planetaryBodiesById;
}

export function normalizePlanetaryBodies() {
  ensurePlanetaryState();
  world.planetaryBodiesById = {};

  for (var i = 0; i < world.planetaryBodies.length; i++) {
    normalizePlanetaryBody(world.planetaryBodies[i]);
    registerPlanetaryBodyInIndex(world.planetaryBodies[i]);
  }
}

export function getDiscoveredPlanetaryBodyCount() {
  normalizePlanetaryBodies();

  var discoveredBodies = 0;

  for (var i = 0; i < world.planetaryBodies.length; i++) {
    if (world.planetaryBodies[i].isSurveyed) {
      discoveredBodies++;
    }
  }

  return discoveredBodies;
}

export function updatePlanetarySurveyEra() {
  var discoveredBodies = getDiscoveredPlanetaryBodyCount();

  if (getCompletedProbeMissionCount() >= CONFIG.STELLAR_CARTOGRAPHY_MISSION_COUNT) {
    world.era = "Stellar Cartography";
  } else if (discoveredBodies >= CONFIG.INTERPLANETARY_BODY_COUNT) {
    world.era = "Interplanetary";
  } else if (discoveredBodies > 0) {
    world.era = "Planetary Survey";
  } else if (world.orbitalPlatformReady) {
    world.era = "Orbital Platform";
  }
}

export function updatePlanetarySurveyReadiness() {
  ensurePlanetaryState();

  world.planetarySurveyReady = Boolean(
    world.orbitalPlatformReady &&
    world.orbitalInfrastructureScore >= CONFIG.PLANETARY_SURVEY_MIN_INFRASTRUCTURE &&
    world.planetaryBodies.length < CONFIG.PLANETARY_SURVEY_MAX_BODIES
  );

  updatePlanetarySurveyEra();
  return world.planetarySurveyReady;
}

export function updatePlanetarySurveyState() {
  if (!updatePlanetarySurveyReadiness()) {
    return;
  }

  var surveyInterval = Math.max(1, Math.round(Number(CONFIG.PLANETARY_SURVEY_INTERVAL) || 1));

  if (world.tick - world.lastPlanetarySurveyTick < surveyInterval) {
    return;
  }

  world.lastPlanetarySurveyTick = world.tick;
  world.planetarySurveyProgress +=
    world.orbitalInfrastructureScore * CONFIG.PLANETARY_SURVEY_PROGRESS_PER_INFRASTRUCTURE +
    world.orbitalAssets.length * CONFIG.PLANETARY_SURVEY_PROGRESS_PER_ORBITAL_ASSET;

  var discoveryThreshold = Math.max(1, Number(CONFIG.PLANETARY_DISCOVERY_THRESHOLD) || 1);

  while (
    world.planetarySurveyProgress >= discoveryThreshold &&
    world.planetaryBodies.length < CONFIG.PLANETARY_SURVEY_MAX_BODIES
  ) {
    var planetaryBody = makePlanetaryBody();
    world.planetaryBodies.push(planetaryBody);
    registerPlanetaryBodyInIndex(planetaryBody);
    world.planetarySurveyProgress -= discoveryThreshold;
  }

  updatePlanetarySurveyReadiness();
}

export function ensureProbeMissionState() {
  if (!Array.isArray(world.probeMissions)) {
    world.probeMissions = [];
  }

  if (typeof world.nextProbeMissionId !== "number" || world.nextProbeMissionId < 1) {
    world.nextProbeMissionId = 1;
  }

  world.probeMissionProgress = Math.max(0, restoreSettlementGrowthNumber(world.probeMissionProgress, 0));
  world.probeMissionReady = Boolean(world.probeMissionReady);
  world.lastProbeMissionTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.lastProbeMissionTick, 0)));
}

export function allocateProbeMissionId() {
  ensureProbeMissionState();

  var missionId = world.nextProbeMissionId;
  world.nextProbeMissionId++;
  return missionId;
}

export function getPlanetaryBodyById(bodyId) {
  ensurePlanetaryState();
  var bodyKey = String(bodyId);

  if (world.planetaryBodiesById[bodyKey]) {
    return world.planetaryBodiesById[bodyKey];
  }

  rebuildPlanetaryBodyIndexes();
  return world.planetaryBodiesById[bodyKey] || null;
}

export function getProbeMissionTargetBodyId() {
  normalizePlanetaryBodies();

  if (world.planetaryBodies.length === 0) {
    return 0;
  }

  var targetIndex = world.probeMissions.length % world.planetaryBodies.length;
  return world.planetaryBodies[targetIndex].id;
}

export function normalizeProbeMission(mission) {
  mission.id = Math.max(1, Math.round(restoreSettlementGrowthNumber(mission.id, world.nextProbeMissionId)));
  mission.targetBodyId = Math.max(0, Math.round(restoreSettlementGrowthNumber(mission.targetBodyId, 0)));
  mission.launchedTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(mission.launchedTick, world.tick)));
  mission.arrivalTick = Math.max(mission.launchedTick, Math.round(restoreSettlementGrowthNumber(mission.arrivalTick, mission.launchedTick)));
  mission.progress = Math.max(0, Math.min(1, restoreSettlementGrowthNumber(mission.progress, 0)));
  mission.isComplete = Boolean(mission.isComplete);

  if (mission.id >= world.nextProbeMissionId) {
    world.nextProbeMissionId = mission.id + 1;
  }
}
