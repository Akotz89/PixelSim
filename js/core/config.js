"use strict";
PS.config = PS.config || {};

PS.config.defaults = PS.config.defaults || {};

PS.config.snapshotConstants = function () {
  var constants = {};
  var key;

  for (key in CONFIG) {
    if (Object.prototype.hasOwnProperty.call(CONFIG, key)) {
      constants[key] = CONFIG[key];
    }
  }

  return constants;
};

PS.config.captureDefaults = function () {
  if (Object.keys(PS.config.defaults).length === 0) {
    PS.config.defaults = PS.config.snapshotConstants();
  }

  return PS.config.defaults;
};

PS.config.applyConstants = function (values) {
  var key;

  if (!values || typeof values !== "object") {
    throw new Error("PS.config.applyConstants expects a values object");
  }

  for (key in values) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      CONFIG[key] = values[key];
    }
  }

  return PS.config.refreshFromConstants();
};

PS.config.resetConstants = function () {
  return PS.config.applyConstants(PS.config.captureDefaults());
};

PS.config.setConstant = function (key, value) {
  var name = String(key || "").replace(/^CONFIG\./, "");
  var patch = {};

  if (!Object.prototype.hasOwnProperty.call(CONFIG, name)) {
    throw new Error("Unknown CONFIG key: " + name);
  }

  patch[name] = value;
  PS.config.applyConstants(patch);
  return CONFIG[name];
};

PS.config.refreshFromConstants = function () {
  var constants = PS.config.snapshotConstants();

  PS.config.constants = Object.freeze(constants);

  PS.config.sim = {
    updateIntervalMs: CONFIG.SIM_UPDATE_INTERVAL_MS,
    fixedDeltaMs: CONFIG.SIM_UPDATE_INTERVAL_MS,
    maxUpdatesPerFrame: CONFIG.MAX_SIM_UPDATES_PER_FRAME,
    frameBudgetMs: CONFIG.FRAME_BUDGET_MS,
    frameBudgetHistoryLimit: CONFIG.FRAME_BUDGET_HISTORY_LIMIT,
    hudUpdateIntervalMs: CONFIG.HUD_UPDATE_INTERVAL_MS,
    daysPerTick: CONFIG.SIM_DAYS_PER_TICK,
    ticksPerUpdate: CONFIG.TICKS_PER_SIM_UPDATE,
    speedMultiplier: CONFIG.SIM_SPEED_MULTIPLIER
  };

  PS.config.render = {
    canvasWidth: CONFIG.CANVAS_WIDTH,
    canvasHeight: CONFIG.CANVAS_HEIGHT,
    tileSize: CONFIG.TILE_SIZE,
    organismDrawSize: CONFIG.ORGANISM_DRAW_SIZE,
    foodDrawSize: CONFIG.FOOD_DRAW_SIZE,
    showScanlines: CONFIG.SHOW_SCANLINES
  };

  PS.config.terrain = {
    barren: CONFIG.TERRAIN_BARREN,
    fertile: CONFIG.TERRAIN_FERTILE,
    fertilityCutoff: CONFIG.TERRAIN_FERTILITY_CUTOFF,
    initialFoodFertileChance: CONFIG.INITIAL_FOOD_FERTILE_CHANCE
  };

  PS.config.organisms = {
    startingCount: CONFIG.STARTING_ORGANISMS,
    populationUnit: CONFIG.ORGANISM_POPULATION_UNIT,
    maxCount: CONFIG.MAX_ORGANISMS,
    startingEnergy: CONFIG.STARTING_ORGANISM_ENERGY,
    childEnergy: CONFIG.CHILD_ORGANISM_ENERGY,
    reproductionEnergy: CONFIG.REPRODUCTION_ENERGY,
    parentEnergyAfterReproduction: CONFIG.PARENT_ENERGY_AFTER_REPRODUCTION,
    foodSearchRadius: CONFIG.ORGANISM_FOOD_SEARCH_RADIUS,
    spatialBucketSize: CONFIG.ORGANISM_SPATIAL_BUCKET_SIZE,
    maxAge: CONFIG.ORGANISM_MAX_AGE,
    travelKmPerDay: CONFIG.ORGANISM_TRAVEL_KM_PER_DAY
  };

  PS.config.food = {
    startingCount: CONFIG.STARTING_FOOD,
    maxCount: CONFIG.MAX_FOOD,
    energyValue: CONFIG.FOOD_ENERGY_VALUE,
    fertileGrowthChance: CONFIG.FERTILE_FOOD_GROWTH_CHANCE,
    barrenGrowthChance: CONFIG.BARREN_FOOD_GROWTH_CHANCE,
    recoveryTargetPerOrganism: CONFIG.FOOD_RECOVERY_TARGET_PER_ORGANISM,
    spatialBucketSize: CONFIG.FOOD_SPATIAL_BUCKET_SIZE
  };

  PS.config.traits = {
    mutationChance: CONFIG.TRAIT_MUTATION_CHANCE,
    visionMin: CONFIG.TRAIT_VISION_MIN,
    visionMax: CONFIG.TRAIT_VISION_MAX,
    metabolismMin: CONFIG.TRAIT_METABOLISM_MIN,
    metabolismMax: CONFIG.TRAIT_METABOLISM_MAX,
    reproductionEnergyMin: CONFIG.TRAIT_REPRODUCTION_ENERGY_MIN,
    reproductionEnergyMax: CONFIG.TRAIT_REPRODUCTION_ENERGY_MAX,
    movementTendencyMin: CONFIG.TRAIT_MOVEMENT_TENDENCY_MIN,
    movementTendencyMax: CONFIG.TRAIT_MOVEMENT_TENDENCY_MAX,
    terrainAffinityMin: CONFIG.TRAIT_TERRAIN_AFFINITY_MIN,
    terrainAffinityMax: CONFIG.TRAIT_TERRAIN_AFFINITY_MAX,
    intelligenceMin: CONFIG.TRAIT_INTELLIGENCE_MIN,
    intelligenceMax: CONFIG.TRAIT_INTELLIGENCE_MAX,
    socialityMin: CONFIG.TRAIT_SOCIALITY_MIN,
    socialityMax: CONFIG.TRAIT_SOCIALITY_MAX,
    carnivoryMin: CONFIG.TRAIT_CARNIVORY_MIN,
    carnivoryMax: CONFIG.TRAIT_CARNIVORY_MAX
  };

  PS.config.settlements = {
    spatialBucketSize: CONFIG.SETTLEMENT_SPATIAL_BUCKET_SIZE,
    minLineagePopulation: CONFIG.SETTLEMENT_MIN_LINEAGE_POPULATION,
    minLineageIntelligence: CONFIG.SETTLEMENT_MIN_LINEAGE_INTELLIGENCE,
    minLineageSociality: CONFIG.SETTLEMENT_MIN_LINEAGE_SOCIALITY,
    radius: CONFIG.SETTLEMENT_RADIUS,
    growthInterval: CONFIG.SETTLEMENT_GROWTH_INTERVAL,
    colonyLevel: CONFIG.SETTLEMENT_COLONY_LEVEL
  };

  PS.config.spatial = {
    chunkSize: CONFIG.SPATIAL_CHUNK_SIZE || CONFIG.ORGANISM_SPATIAL_BUCKET_SIZE
  };

  PS.config.pools = {
    maxOrganisms: CONFIG.POOL_MAX_ORGANISMS || 20000,
    maxFoodParticles: CONFIG.POOL_MAX_FOOD_PARTICLES || CONFIG.MAX_FOOD,
    memoryBudgetMb: CONFIG.MEMORY_BUDGET_MB || 96
  };

  PS.config.planet = {
    name: CONFIG.PLANET_NAME,
    radiusKm: CONFIG.PLANET_RADIUS_KM,
    axialTiltDeg: CONFIG.PLANET_AXIAL_TILT_DEG,
    targetWaterPercent: CONFIG.PLANET_TARGET_WATER_PERCENT,
    targetFertileLandPercent: CONFIG.PLANET_TARGET_FERTILE_LAND_PERCENT,
    renderMode: CONFIG.PLANET_RENDER_MODE,
    viewLongitudeDeg: CONFIG.PLANET_VIEW_LONGITUDE_DEG,
    viewLatitudeDeg: CONFIG.PLANET_VIEW_LATITUDE_DEG,
    zoomLevel: CONFIG.PLANET_ZOOM_LEVEL,
    zoomLevels: CONFIG.PLANET_ZOOM_LEVELS,
    surfaceChunkSamples: CONFIG.PLANET_SURFACE_CHUNK_SAMPLES,
    surfaceChunkCacheLimit: CONFIG.PLANET_SURFACE_CHUNK_CACHE_LIMIT
  };

  PS.config.geology = {
    plateMin: CONFIG.GEOLOGY_PLATE_MIN,
    plateMax: CONFIG.GEOLOGY_PLATE_MAX,
    driftRateTilesPerMy: CONFIG.GEOLOGY_DRIFT_RATE_TILES_PER_MY,
    erosionRate: CONFIG.GEOLOGY_EROSION_RATE,
    sedimentRate: CONFIG.GEOLOGY_SEDIMENT_RATE
  };

  PS.config.atmosphere = {
    ozoneO2Threshold: CONFIG.ATMOSPHERE_OZONE_O2_THRESHOLD,
    organismO2Requirement: CONFIG.ATMOSPHERE_ORGANISM_O2_REQUIREMENT,
    anoxiaEnergyCost: CONFIG.ATMOSPHERE_ANOXIA_ENERGY_COST,
    photosynthesisO2Rate: CONFIG.ATMOSPHERE_PHOTOSYNTHESIS_O2_RATE,
    outgassingRate: CONFIG.ATMOSPHERE_OUTGASSING_RATE
  };

  PS.config.spotlight = {
    autoPan: CONFIG.SPOTLIGHT_AUTO_PAN !== false,
    slowdownEnabled: CONFIG.SPOTLIGHT_SLOWDOWN_ENABLED !== false,
    slowdownSpeed: CONFIG.SPOTLIGHT_SLOWDOWN_SPEED,
    durationMs: CONFIG.SPOTLIGHT_DURATION_MS
  };

  PS.config.milestones = Array.isArray(CONFIG.MILESTONE_DEFINITIONS)
    ? CONFIG.MILESTONE_DEFINITIONS.map(function(milestone) {
      return Object.assign({}, milestone);
    })
    : [];

  PS.config.persistence = {
    saveFormatVersion: CONFIG.SAVE_FORMAT_VERSION
  };

  PS.config.log = PS.config.log || {
    level: "WARN",
    categories: {}
  };

  return PS.config;
};

PS.config.captureDefaults();
PS.config.refreshFromConstants();
