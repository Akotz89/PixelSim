"use strict";
function reportRuntimeError(error) {
  var box = document.getElementById("debug-output");
  var message = error && error.stack ? error.stack : String(error);

  if (!box) {
    alert(message);
    return;
  }

  box.style.display = "block";
  box.textContent += message + String.fromCharCode(10) + String.fromCharCode(10);
}

function clearWorld() {
  if (PS.pools && typeof PS.pools.reset === "function") {
    PS.pools.reset();
  }

  // Initialize tile grid (AZR-491)
  if (PS.tileGrid && typeof PS.tileGrid.init === "function") {
    PS.tileGrid.init(WORLD_WIDTH, WORLD_HEIGHT);
  }

  // Initialize RANMAP for visual variety (AZR-499)
  if (PS.ranmap && typeof PS.ranmap.init === "function") {
    PS.ranmap.init(WORLD_WIDTH, WORLD_HEIGHT, world.rngState || 0x9E3779B9);
  }

  if (PS.render && PS.render.particles && typeof PS.render.particles.reset === "function") {
    PS.render.particles.reset(world.rngState || 0x9E3779B9);
  }

  if (PS.atlas && typeof PS.atlas.reset === "function" && typeof PS.atlas.init === "function") {
    PS.atlas.reset();
    PS.atlas.init();
  }

  world.tick = 0;
  world.deepTimeYears = 0;
  world.era = "Organisms";
  if (PS.epochs) {
    PS.epochs.activeId = world.era;
  }
  world.organisms = [];
  world.organismBuckets = {};
  world.organismsByLineage = {};
  world.food = [];
  world.foodPositions = {};
  world.foodBuckets = {};
  world.terrain = [];
  world.planetTiles = [];
  world.planetSummary = null;
  world.planetView = null;
  world.fertileTiles = 0;
  world.birthsThisTick = 0;
  world.deathsThisTick = 0;
  world.populationDeltaThisTick = 0;
  world.reproductionScarcityPressure = 0;
  world.totalBirths = 0;
  world.totalDeaths = 0;
  world.foodSpawnedThisTick = 0;
  world.foodConsumedThisTick = 0;
  world.foodHarvestedThisTick = 0;
  world.foodRecoveryPressure = 0;
  world.foodRecoveryAttemptsThisTick = 0;
  world.totalFoodSpawned = 0;
  world.totalFoodConsumed = 0;
  world.totalFoodHarvested = 0;
  world.isPaused = false;
  world.isExtinct = false;
  world.isCameraInteracting = false;
  world.extinctionTick = 0;
  world.needsRender = true;
  setWorldSeed(world.seedText);
  world.interpolation = 0;
  world.fps = 0;
  world.tps = 0;
  world.updateMs = 0;
  world.drawMs = 0;
  world.maxUpdateMs = 0;
  world.maxDrawMs = 0;
  world.tickProfileMs = {
    organisms: 0,
    food: 0,
    settlements: 0,
    terrain: 0,
    events: 0
  };
  world.inspectedTile = null;
  world.inspectedSurface = null;
  world.inspectedEntity = null;
  world.ecosystemSummary = null;
  world.ecosystemHistory = [];
  world.simulationAlerts = [];
  world.populationTraitSummary = null;
  world.lineageSummary = null;
  world.lineageSummaryText = "LINEAGES: -";
  world.nextLineageId = 1;
  world.nextSpeciesId = 1;
  world.nextBiologyPopulationId = 1;
  world.nextBiologyRepresentativeId = 1;
  world.biologyPopulations = [];
  world.biologyPopulationById = {};
  world.biologyRepresentatives = [];
  world.biologyRepresentativeById = {};
  world.trackedLineage = null;
  world.abiogenesis = null;
  world.microbial = null;
  world.microbialReady = false;
  world.eventLog = [];
  world.timelineEvents = [];
  world.milestonesReached = {};
  world.spotlightEvent = null;
  world.lineages = {};
  world.nextSettlementId = 1;
  world.settlements = [];
  world.settlementsById = {};
  world.settlementBuckets = {};
  world.settlementByLineage = {};
  world.rootSettlementByLineage = {};
  world.settlementChildOutpostCountByParentId = {};
  world.settlementSummary = null;
  world.earlyProgressionSummary = null;
  world.nextSettlementRouteId = 1;
  world.settlementRoutes = [];
  world.settlementRoutesByKey = {};
  world.settlementRouteStatsById = {};
  world.colonyNetworkScore = 0;
  world.colonyNetworkColonies = 0;
  world.colonyNetworkActiveRoutes = 0;
  world.colonyNetworkClaimedTiles = 0;
  world.spaceProgramProgress = 0;
  world.orbitalLaunches = 0;
  world.lastSpaceProgramTick = 0;
  world.spaceProgramReady = false;
  world.nextOrbitalAssetId = 1;
  world.orbitalAssets = [];
  world.orbitalInfrastructureScore = 0;
  world.orbitalPlatformReady = false;
  world.nextPlanetaryBodyId = 1;
  world.planetaryBodies = [];
  world.planetaryBodiesById = {};
  world.planetarySurveyProgress = 0;
  world.planetarySurveyReady = false;
  world.lastPlanetarySurveyTick = 0;
  world.nextProbeMissionId = 1;
  world.probeMissions = [];
  world.probeMissionProgress = 0;
  world.probeMissionReady = false;
  world.lastProbeMissionTick = 0;
  world.nextStarSystemId = 1;
  world.starSystems = [];
  world.starSystemsById = {};
  world.starMapProgress = 0;
  world.starMapReady = false;
  world.lastStarMapTick = 0;
  world.galacticInfluenceProgress = 0;
  world.galacticInfluenceReady = false;
  world.galacticClaimedSystems = 0;
  world.lastGalacticInfluenceTick = 0;
  world.nextInterstellarFleetId = 1;
  world.interstellarFleets = [];
  world.interstellarFleetProgress = 0;
  world.interstellarFleetReady = false;
  world.interstellarFleetActive = 0;
  world.interstellarFleetCompleted = 0;
  world.lastInterstellarFleetTick = 0;
  world.nextEmpireSectorId = 1;
  world.empireSectors = [];
  world.empireSectorBySystemId = {};
  world.empireSectorProgress = 0;
  world.empireSectorReady = false;
  world.empireSectorCount = 0;
  world.lastEmpireSectorTick = 0;
  world.empireLegacyProgress = 0;
  world.empireLegacyLevel = 0;
  world.empireLegacyReady = false;
  world.empireLegacyComplete = false;
  world.lastEmpireLegacyTick = 0;

  if (PS.render && PS.render.particles && typeof PS.render.particles.loadDefinitions === "function") {
    PS.render.particles.loadDefinitions(PS.assets ? PS.assets.particlesData : null);
    if (CONFIG.PARTICLE_AMBIENT_ENABLED !== false) {
      PS.render.particles.createEmitter("rain", {
        id: "ambient.rain",
        active: true,
        bounds: { x: 0, y: -40, width: canvas.width, height: canvas.height + 80 }
      });
      PS.render.particles.createEmitter("snow", {
        id: "ambient.snow",
        active: true,
        rate: 24,
        bounds: { x: 0, y: -40, width: canvas.width, height: canvas.height + 80 }
      });
    }
    PS.render.particles.birthEmitter = PS.render.particles.createEmitter("birth_sparkle", {
      id: "event.birth_sparkle",
      active: false,
      position: { x: canvas.width * 0.5, y: canvas.height * 0.5 }
    });
  }

  if (typeof resetTraitHistory === "function") {
    resetTraitHistory();
  }

  if (PS.time && typeof PS.time.reset === "function") {
    PS.time.reset();
  }
}

function ensureEventLog() {
  if (!Array.isArray(world.eventLog)) {
    world.eventLog = [];
  }
}

function countItems(array, predicate) {
  var count = 0;

  if (!Array.isArray(array)) {
    return count;
  }

  for (var i = 0; i < array.length; i++) {
    if (predicate(array[i])) {
      count++;
    }
  }

  return count;
}

function getSimulationMilestoneSnapshot() {
  var ecosystemSummary = world.ecosystemSummary || null;
  var stabilityProfile = ecosystemSummary ? ecosystemSummary.stabilityProfile : null;
  var foodNetThisTick = ecosystemSummary
    ? ecosystemSummary.foodNetThisTick
    : (Number(world.foodSpawnedThisTick) || 0) - (Number(world.foodConsumedThisTick) || 0);

  return {
    era: world.era,
    population: Array.isArray(world.organisms) ? world.organisms.length : 0,
    isExtinct: Boolean(world.isExtinct),
    populationDelta: Math.round(Number(world.populationDeltaThisTick) || 0),
    populationBalance: ecosystemSummary ? ecosystemSummary.populationBalance : "unknown",
    foodNetThisTick: Math.round(Number(foodNetThisTick) || 0),
    resourceBalance: ecosystemSummary ? ecosystemSummary.resourceBalance : "unknown",
    ecosystemPressure: ecosystemSummary ? ecosystemSummary.pressure : "unknown",
    ecosystemStabilityBand: ecosystemSummary ? getEcosystemStabilityBand(ecosystemSummary.stabilityScore) : -1,
    ecosystemLimitingFactor: stabilityProfile ? stabilityProfile.limitingFactor : "unknown",
    ecosystemLimitingFactorDetail: stabilityProfile ? formatEcosystemStabilityFactorScore(stabilityProfile) : "unknown",
    recoveryAction: ecosystemSummary ? String(ecosystemSummary.recoveryAction || "observe") : "unknown",
    ecosystemMomentum: ecosystemSummary ? String(ecosystemSummary.momentum || "steady") : "unknown",
    settlements: Array.isArray(world.settlements) ? world.settlements.length : 0,
    outposts: countItems(world.settlements, function(settlement) {
      return settlement && settlement.isOutpost;
    }),
    colonies: countItems(world.settlements, function(settlement) {
      return settlement && settlement.isColony;
    }),
    routes: Array.isArray(world.settlementRoutes) ? world.settlementRoutes.length : 0,
    orbitalLaunches: Math.max(0, Math.round(Number(world.orbitalLaunches) || 0)),
    planetaryBodies: Array.isArray(world.planetaryBodies) ? world.planetaryBodies.length : 0,
    completedProbeMissions: countItems(world.probeMissions, function(mission) {
      return mission && mission.isComplete;
    }),
    starSystems: Array.isArray(world.starSystems) ? world.starSystems.length : 0,
    claimedSystems: Math.max(0, Math.round(Number(world.galacticClaimedSystems) || 0)),
    interstellarFleets: Array.isArray(world.interstellarFleets) ? world.interstellarFleets.length : 0,
    completedInterstellarFleets: Math.max(0, Math.round(Number(world.interstellarFleetCompleted) || 0)),
    empireSectors: Array.isArray(world.empireSectors) ? world.empireSectors.length : 0,
    empireLegacyLevel: Math.max(0, Math.round(Number(world.empireLegacyLevel) || 0)),
    empireLegacyComplete: Boolean(world.empireLegacyComplete)
  };
}

function recordSimulationEvent(type, label, detail) {
  ensureEventLog();

  var lastEvent = world.eventLog[world.eventLog.length - 1];

  if (
    lastEvent &&
    lastEvent.tick === world.tick &&
    lastEvent.type === type &&
    lastEvent.label === label &&
    lastEvent.detail === detail
  ) {
    return;
  }

  world.eventLog.push({
    tick: world.tick,
    type: type,
    label: label,
    detail: detail
  });

  while (world.eventLog.length > CONFIG.EVENT_LOG_MAX_ENTRIES) {
    world.eventLog.shift();
  }
}

function recordCountMilestone(previous, current, key, type, label, detailPrefix) {
  if (current[key] > previous[key]) {
    recordSimulationEvent(type, label, detailPrefix + " " + current[key]);
  }
}

function formatMilestoneSignedNumber(value) {
  var numberValue = Math.round(Number(value) || 0);

  if (numberValue > 0) {
    return "+" + numberValue;
  }

  return String(numberValue);
}

function getEcosystemStabilityBand(stabilityScore) {
  return clamp(Math.floor(Math.max(0, Math.round(Number(stabilityScore) || 0)) / 20), 0, 5);
}

function getEcosystemStabilityBandLabel(stabilityBand) {
  if (stabilityBand <= 0) {
    return "critical";
  }

  if (stabilityBand === 1) {
    return "fragile";
  }

  if (stabilityBand === 2) {
    return "strained";
  }

  if (stabilityBand === 3) {
    return "stable";
  }

  if (stabilityBand === 4) {
    return "strong";
  }

  return "thriving";
}

function recordEcosystemMilestones(previousSnapshot, currentSnapshot) {
  if (
    previousSnapshot.ecosystemPressure !== "unknown" &&
    currentSnapshot.ecosystemPressure !== previousSnapshot.ecosystemPressure
  ) {
    recordSimulationEvent(
      "ecosystem",
      "Pressure " + currentSnapshot.ecosystemPressure,
      previousSnapshot.ecosystemPressure + " -> " + currentSnapshot.ecosystemPressure
    );
  }

  if (
    previousSnapshot.ecosystemStabilityBand >= 0 &&
    currentSnapshot.ecosystemStabilityBand !== previousSnapshot.ecosystemStabilityBand
  ) {
    var direction = currentSnapshot.ecosystemStabilityBand > previousSnapshot.ecosystemStabilityBand
      ? "improved"
      : "dropped";

    recordSimulationEvent(
      "ecosystem",
      "Stability " + direction,
      getEcosystemStabilityBandLabel(previousSnapshot.ecosystemStabilityBand) +
        " -> " +
        getEcosystemStabilityBandLabel(currentSnapshot.ecosystemStabilityBand)
    );
  }

  if (
    previousSnapshot.ecosystemLimitingFactor !== "unknown" &&
    currentSnapshot.ecosystemLimitingFactor !== "unknown" &&
    currentSnapshot.ecosystemLimitingFactor !== previousSnapshot.ecosystemLimitingFactor
  ) {
    recordSimulationEvent(
      "ecosystem",
      "Limiter " + formatEcosystemStabilityFactor(currentSnapshot.ecosystemLimitingFactor),
      formatEcosystemStabilityFactor(previousSnapshot.ecosystemLimitingFactor) +
        " -> " +
        currentSnapshot.ecosystemLimitingFactorDetail
    );
  }

  if (
    previousSnapshot.recoveryAction !== "unknown" &&
    currentSnapshot.recoveryAction !== "unknown" &&
    currentSnapshot.recoveryAction !== previousSnapshot.recoveryAction
  ) {
    recordSimulationEvent(
      "ecosystem",
      "Recovery " + currentSnapshot.recoveryAction,
      previousSnapshot.recoveryAction + " -> " + currentSnapshot.recoveryAction
    );
  }

  if (
    previousSnapshot.ecosystemMomentum !== "unknown" &&
    currentSnapshot.ecosystemMomentum !== "unknown" &&
    currentSnapshot.ecosystemMomentum !== previousSnapshot.ecosystemMomentum
  ) {
    recordSimulationEvent(
      "ecosystem",
      "Momentum " + currentSnapshot.ecosystemMomentum,
      previousSnapshot.ecosystemMomentum + " -> " + currentSnapshot.ecosystemMomentum
    );
  }
}
