"use strict";

canvas.width = CONFIG.CANVAS_WIDTH;
canvas.height = CONFIG.CANVAS_HEIGHT;

const WORLD_WIDTH = Math.floor(canvas.width / CONFIG.TILE_SIZE);
const WORLD_HEIGHT = Math.floor(canvas.height / CONFIG.TILE_SIZE);

function defineWorldAlias(target, groupName, key) {
  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: false,
    get: function() {
      return target[groupName][key];
    },
    set: function(value) {
      target[groupName][key] = value;
    }
  });
}

function defineWorldAliases(target, groupName) {
  Object.keys(target[groupName]).forEach(function(key) {
    defineWorldAlias(target, groupName, key);
  });
}

const world = {
  simulation: {
    tick: 0,
    era: "Organisms",
    organisms: [],
    food: [],
    isExtinct: false,
    extinctionTick: 0,
    speed: 1,
    deepTimeYears: 0,
    seedText: CONFIG.DEFAULT_SEED,
    prng: null,
    rngState: 1,
    milestonesReached: {}
  },
  spatial: {
    organismBuckets: {},
    organismsByLineage: {},
    foodPositions: {},
    foodBuckets: {},
    terrain: [],
    planetTiles: [],
    planetSummary: null,
    fertileTiles: 0
  },
  flow: {
    birthsThisTick: 0,
    deathsThisTick: 0,
    populationDeltaThisTick: 0,
    reproductionScarcityPressure: 0,
    totalBirths: 0,
    totalDeaths: 0,
    foodSpawnedThisTick: 0,
    foodConsumedThisTick: 0,
    foodHarvestedThisTick: 0,
    foodRecoveryPressure: 0,
    foodRecoveryAttemptsThisTick: 0,
    totalFoodSpawned: 0,
    totalFoodConsumed: 0,
    totalFoodHarvested: 0
  },
  ui: {
    isPaused: false,
    isMenuOpen: false,
    menuPage: "controls",
    inspectedTile: null,
    inspectedSurface: null,
    inspectedEntity: null,
    ecosystemSummary: null,
    simulationAlerts: [],
    populationTraitSummary: null,
    lineageSummary: null,
    lineageSummaryText: "LINEAGES: -",
    eventLog: [],
    timelineEvents: [],
    timelineFilter: "all",
    selectedTimelineEvent: null,
    activeObservationOverlay: "none",
    overlayPerformance: {
      active: "none",
      lastFrameMs: 0,
      lastSampleCount: 0
    },
    spotlightEvent: null,
    spotlightState: {
      active: false,
      previousSpeed: null,
      startedTick: 0,
      expiresAt: 0,
      autoPan: true,
      slowdown: true
    }
  },
  camera: {
    isCameraInteracting: false,
    planetView: null
  },
  render: {
    needsRender: true,
    interpolation: 0,
    fps: 0,
    tps: 0,
    updateMs: 0,
    drawMs: 0,
    maxUpdateMs: 0,
    maxDrawMs: 0
  },
  history: {
    ecosystemHistory: [],
    traitHistory: []
  },
  biology: {
    nextLineageId: 1,
    lineages: {},
    nextSpeciesId: 1,
    nextBiologyPopulationId: 1,
    nextBiologyRepresentativeId: 1,
    biologyPopulations: [],
    biologyPopulationById: {},
    biologyRepresentatives: [],
    biologyRepresentativeById: {},
    abiogenesis: null,
    microbial: null,
    microbialReady: false
  },
  settlementState: {
    nextSettlementId: 1,
    settlements: [],
    settlementsById: {},
    settlementBuckets: {},
    settlementByLineage: {},
    rootSettlementByLineage: {},
    settlementChildOutpostCountByParentId: {},
    settlementSummary: null,
    earlyProgressionSummary: null,
    nextSettlementRouteId: 1,
    settlementRoutes: [],
    settlementRoutesByKey: {},
    settlementRouteStatsById: {},
    colonyNetworkScore: 0,
    colonyNetworkColonies: 0,
    colonyNetworkActiveRoutes: 0,
    colonyNetworkClaimedTiles: 0
  },
  space: {
    spaceProgramProgress: 0,
    orbitalLaunches: 0,
    lastSpaceProgramTick: 0,
    spaceProgramReady: false,
    nextOrbitalAssetId: 1,
    orbitalAssets: [],
    orbitalInfrastructureScore: 0,
    orbitalPlatformReady: false,
    nextPlanetaryBodyId: 1,
    planetaryBodies: [],
    planetaryBodiesById: {},
    planetarySurveyProgress: 0,
    planetarySurveyReady: false,
    lastPlanetarySurveyTick: 0,
    nextProbeMissionId: 1,
    probeMissions: [],
    probeMissionProgress: 0,
    probeMissionReady: false,
    lastProbeMissionTick: 0,
    nextStarSystemId: 1,
    starSystems: [],
    starSystemsById: {},
    starMapProgress: 0,
    starMapReady: false,
    lastStarMapTick: 0,
    galacticInfluenceProgress: 0,
    galacticInfluenceReady: false,
    galacticClaimedSystems: 0,
    lastGalacticInfluenceTick: 0,
    nextInterstellarFleetId: 1,
    interstellarFleets: [],
    interstellarFleetProgress: 0,
    interstellarFleetReady: false,
    interstellarFleetActive: 0,
    interstellarFleetCompleted: 0,
    lastInterstellarFleetTick: 0,
    nextEmpireSectorId: 1,
    empireSectors: [],
    empireSectorBySystemId: {},
    empireSectorProgress: 0,
    empireSectorReady: false,
    empireSectorCount: 0,
    lastEmpireSectorTick: 0,
    empireLegacyProgress: 0,
    empireLegacyLevel: 0,
    empireLegacyReady: false,
    empireLegacyComplete: false,
    lastEmpireLegacyTick: 0
  }
};

[
  "simulation",
  "spatial",
  "flow",
  "ui",
  "camera",
  "render",
  "history",
  "biology",
  "settlementState",
  "space"
].forEach(function(groupName) {
  defineWorldAliases(world, groupName);
});
