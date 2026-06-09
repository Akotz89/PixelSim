const canvas = document.getElementById("game-webgpu");

const gameWrap = document.getElementById("game-wrap");
const uiMenu = document.getElementById("ui-menu");
const menuBackdrop = document.getElementById("menu-backdrop");
const menuToggleButton = document.getElementById("menu-toggle-button");
const menuToggleText = menuToggleButton.querySelector(".menu-toggle-text");
const menuTabs = document.getElementById("menu-tabs");
const eraText = document.getElementById("era");
const populationText = document.getElementById("population");
const foodText = document.getElementById("food");
const ecosystemSummaryText = document.getElementById("ecosystem-summary");
const simulationAlertsText = document.getElementById("simulation-alerts");
const inspectSummaryText = document.getElementById("inspect-summary");
const inspectDetailsText = document.getElementById("inspect-details");
const traitSummaryText = document.getElementById("trait-summary");
const lineageSummaryText = document.getElementById("lineage-summary");
const settlementSummaryText = document.getElementById("settlement-summary");
const eventLogText = document.getElementById("event-log");
const observationOverlayButtons = typeof document.querySelectorAll === "function"
  ? document.querySelectorAll("[data-observation-overlay]")
  : [];
const observationOverlayStatus = document.getElementById("observation-overlay-status");
const timelineFilterButtons = typeof document.querySelectorAll === "function"
  ? document.querySelectorAll("[data-timeline-filter]")
  : [];
const timelineList = document.getElementById("timeline-list");
const ecosystemHistoryCanvas = document.getElementById("ecosystem-history");
const traitHistoryCanvas = document.getElementById("trait-history");

const pauseButton = document.getElementById("pause-button");
const stepButton = document.getElementById("step-button");
const speedDownButton = document.getElementById("speed-down-button");
const speedUpButton = document.getElementById("speed-up-button");
const restartButton = document.getElementById("restart-button");
const saveButton = document.getElementById("save-button");
const loadButton = document.getElementById("load-button");
const exportJsonButton = document.getElementById("export-json-button");
const importJsonButton = document.getElementById("import-json-button");
const importJsonFile = document.getElementById("import-json-file");
const speedLabel = document.getElementById("speed-label");
const persistenceStatus = document.getElementById("persistence-status");
const speedSlider = document.getElementById("speed-slider");
const speedValue = document.getElementById("speed-value");
const timeScaleSlider = document.getElementById("time-scale-slider");
const timeScaleValue = document.getElementById("time-scale-value");
const organismSizeSlider = document.getElementById("organism-size-slider");
const organismSizeValue = document.getElementById("organism-size-value");
const foodSizeSlider = document.getElementById("food-size-slider");
const foodSizeValue = document.getElementById("food-size-value");
const startingFoodSlider = document.getElementById("starting-food-slider");
const startingFoodValue = document.getElementById("starting-food-value");
const foodGrowthSlider = document.getElementById("food-growth-slider");
const foodGrowthValue = document.getElementById("food-growth-value");
const seedInput = document.getElementById("seed-input");
const seedRandomButton = document.getElementById("seed-random-button");
const controlsPanel = document.getElementById("controls");
const spotlightPanel = document.getElementById("spotlight-panel");
const spotlightTitle = document.getElementById("spotlight-title");
const spotlightDetail = document.getElementById("spotlight-detail");
const spotlightInvestigateButton = document.getElementById("spotlight-investigate-button");
const spotlightDismissButton = document.getElementById("spotlight-dismiss-button");

canvas.width = CONFIG.CANVAS_WIDTH;
canvas.height = CONFIG.CANVAS_HEIGHT;

const WORLD_WIDTH = Math.floor(canvas.width / CONFIG.TILE_SIZE);
const WORLD_HEIGHT = Math.floor(canvas.height / CONFIG.TILE_SIZE);

const world = {
  tick: 0,
  era: "Organisms",
  organisms: [],
  organismBuckets: {},
  organismsByLineage: {},
  food: [],
  foodPositions: {},
  foodBuckets: {},
  terrain: [],
  planetTiles: [],
  planetSummary: null,
  planetView: null,
  fertileTiles: 0,
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
  totalFoodHarvested: 0,
  isPaused: false,
  isExtinct: false,
  isCameraInteracting: false,
  isMenuOpen: false,
  menuPage: "controls",
  extinctionTick: 0,
  needsRender: true,
  speed: 1,
  deepTimeYears: 0,
  seedText: CONFIG.DEFAULT_SEED,
  prng: null,
  rngState: 1,
  interpolation: 0,
  fps: 0,
  tps: 0,
  updateMs: 0,
  drawMs: 0,
  maxUpdateMs: 0,
  maxDrawMs: 0,
  inspectedTile: null,
  inspectedSurface: null,
  inspectedEntity: null,
  ecosystemSummary: null,
  ecosystemHistory: [],
  simulationAlerts: [],
  populationTraitSummary: null,
  lineageSummary: null,
  lineageSummaryText: "LINEAGES: -",
  traitHistory: [],
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
  milestonesReached: {},
  spotlightEvent: null,
  spotlightState: {
    active: false,
    previousSpeed: null,
    startedTick: 0,
    expiresAt: 0,
    autoPan: true,
    slowdown: true
  },
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
  microbialReady: false,
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
  colonyNetworkClaimedTiles: 0,
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
};
