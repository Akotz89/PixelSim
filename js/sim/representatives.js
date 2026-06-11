"use strict";
PS.sim = PS.sim || {};

var REPRESENTATIVE_HISTORY_LIMIT = 12;
var REPRESENTATIVE_TERRITORY_LIMIT = 8;
var REPRESENTATIVE_TRAIT_KEYS = PS.core && PS.core.traitSchema && typeof PS.core.traitSchema.getKeys === "function"
  ? PS.core.traitSchema.getKeys()
  : [
    "vision",
    "metabolism",
    "reproductionEnergy",
    "movementTendency",
    "terrainAffinity",
    "intelligence",
    "sociality",
    "carnivory",
    "bodySize",
    "limbCount",
    "bodyShape",
    "appendageType",
    "camouflage",
    "thermalTolerance",
    "waterDependency"
  ];

var representativePerfStats = {
  lastRefreshMs: 0,
  lastRefreshOrganisms: 0,
  lastTraitEnsureCalls: 0,
  lastFullSyncCount: 0,
  lastSummarySyncCount: 0,
  lastFoodSearchCount: 0,
  lastSkippedOrganisms: 0
};

function ensureRepresentativeState() {
  world.biologyPopulations = Array.isArray(world.biologyPopulations) ? world.biologyPopulations : [];
  world.biologyPopulationById = world.biologyPopulationById || {};
  world.biologyRepresentatives = Array.isArray(world.biologyRepresentatives) ? world.biologyRepresentatives : [];
  world.biologyRepresentativeById = world.biologyRepresentativeById || {};
  world.biologyWatchedRepresentativeIds = world.biologyWatchedRepresentativeIds || {};
}

function getBiologyPopulationById(populationId) {
  ensureRepresentativeState();
  return world.biologyPopulationById[String(populationId)] || null;
}

function getBiologyRepresentativeById(representativeId) {
  ensureRepresentativeState();
  return world.biologyRepresentativeById[String(representativeId)] || null;
}

function markWatchedRepresentative(representativeId, watched) {
  ensureRepresentativeState();
  var key = String(Math.max(1, Math.round(Number(representativeId) || 0)));

  if (watched === false) {
    delete world.biologyWatchedRepresentativeIds[key];
  } else {
    world.biologyWatchedRepresentativeIds[key] = true;
  }
}

function getRepresentativeAggregateSignature() {
  return [
    Array.isArray(world.organisms) ? world.organisms.length : 0,
    Math.max(0, Math.round(Number(world.totalBirths) || 0)),
    Math.max(0, Math.round(Number(world.totalDeaths) || 0)),
    Math.max(0, Math.round(Number(world.nextBiologyRepresentativeId) || 0)),
    Math.max(0, Math.round(Number(world.nextBiologyPopulationId) || 0)),
    Math.max(0, Math.round(Number(world.nextSpeciesId) || 0)),
    getTerrainPressureEnvironmentSignature()
  ].join(":");
}

function getTerrainPressureEnvironmentSignature() {
  var atmosphere = world.atmosphere || {};
  var geology = world.geology || {};

  return [
    Array.isArray(world.planetTiles) ? world.planetTiles.length : 0,
    Math.round(Number(world.fertileTiles) || 0),
    Math.round((Number(atmosphere.temperatureC) || 0) * 10),
    Math.round((Number(atmosphere.oxygenStress) || 0) * 100),
    Math.round(Number(geology.ageTicks) || 0)
  ].join(".");
}

function refreshTerrainPressureForExistingPopulations() {
  if (!PS.sim || !PS.sim.terrainPressure || typeof PS.sim.terrainPressure.refreshSummary !== "function") {
    return null;
  }

  var populations = Array.isArray(world.biologyPopulations) ? world.biologyPopulations : [];
  var organismsByPopulationId = {};
  var traitsByPopulationId = {};

  for (var i = 0; i < world.organisms.length; i++) {
    var organism = world.organisms[i];
    var populationId = String(Math.max(1, Math.round(Number(organism.populationId) || organism.lineageId || 1)));
    var traits = ensureOrganismTraits(organism);

    if (!organismsByPopulationId[populationId]) {
      organismsByPopulationId[populationId] = [];
      traitsByPopulationId[populationId] = [];
    }

    organismsByPopulationId[populationId].push(organism);
    traitsByPopulationId[populationId].push(traits);
  }

  for (var populationIndex = 0; populationIndex < populations.length; populationIndex++) {
    var population = populations[populationIndex];
    var key = String(Math.max(1, Math.round(Number(population && population.id) || 1)));
    var organisms = organismsByPopulationId[key] || [];

    population.terrainPressure = organisms.length > 0 && typeof PS.sim.terrainPressure.summarizePopulation === "function"
      ? PS.sim.terrainPressure.summarizePopulation(organisms, traitsByPopulationId[key])
      : null;
  }

  var summary = PS.sim.terrainPressure.refreshSummary(populations);
  if (typeof PS.sim.terrainPressure.emitMilestones === "function") {
    PS.sim.terrainPressure.emitMilestones(summary);
  }
  return summary;
}

function syncWatchedRepresentativesFromActiveOrganisms() {
  var watched = world.biologyWatchedRepresentativeIds || {};
  var watchedKeys = Object.keys(watched);

  if (watchedKeys.length <= 0) {
    return 0;
  }

  var wanted = {};
  var synced = 0;

  for (var keyIndex = 0; keyIndex < watchedKeys.length; keyIndex++) {
    wanted[watchedKeys[keyIndex]] = true;
  }

  for (var i = 0; i < world.organisms.length; i++) {
    var organism = world.organisms[i];
    var representativeId = String(Math.max(1, Math.round(Number(organism.representativeId) || 0)));

    if (wanted[representativeId]) {
      syncBiologyRepresentative(organism);
      representativePerfStats.lastFullSyncCount++;
      synced++;
      delete wanted[representativeId];

      if (synced >= watchedKeys.length) {
        break;
      }
    }
  }

  return synced;
}

function ensureRepresentativeIdentity(organism) {
  if (typeof organism.lineageId !== "number" || organism.lineageId < 1) {
    organism.lineageId = allocateLineageId();
  }

  if (typeof organism.lineageParentId !== "number") {
    organism.lineageParentId = 0;
  }

  if (typeof organism.generation !== "number") {
    organism.generation = 0;
  }

  if (typeof organism.speciesId !== "number" || organism.speciesId < 1) {
    organism.speciesId = organism.lineageId;
  }

  if (typeof organism.populationId !== "number" || organism.populationId < 1) {
    organism.populationId = organism.lineageId;
  }

  if (typeof organism.representativeId !== "number" || organism.representativeId < 1) {
    organism.representativeId = allocateBiologyRepresentativeId();
  }

  if (organism.lineageId >= world.nextLineageId) {
    world.nextLineageId = organism.lineageId + 1;
  }

  if (organism.speciesId >= world.nextSpeciesId) {
    world.nextSpeciesId = organism.speciesId + 1;
  }

  if (organism.populationId >= world.nextBiologyPopulationId) {
    world.nextBiologyPopulationId = organism.populationId + 1;
  }

  if (organism.representativeId >= world.nextBiologyRepresentativeId) {
    world.nextBiologyRepresentativeId = organism.representativeId + 1;
  }

  return organism.lineageId;
}

function makeBiologyPopulation(organism) {
  var lineageId = ensureRepresentativeIdentity(organism);
  var populationId = Math.max(1, Math.round(Number(organism.populationId) || lineageId));
  var record = {
    id: populationId,
    speciesId: Math.max(1, Math.round(Number(organism.speciesId) || lineageId)),
    lineageId: lineageId,
    parentSpeciesId: Math.max(0, Math.round(Number(organism.parentSpeciesId) || 0)),
    parentPopulationId: Math.max(0, Math.round(Number(organism.parentPopulationId) || 0)),
    count: 0,
    biomass: 0,
    energyReserve: 0,
    territoryCells: [],
    traitMean: {},
    traitVariance: {},
    pressure: {},
    representativeIds: [],
    createdTick: Math.max(0, Math.round(Number(world.tick) || 0)),
    lastUpdatedTick: Math.max(0, Math.round(Number(world.tick) || 0)),
    isActive: true
  };

  world.biologyPopulations.push(record);
  world.biologyPopulationById[String(record.id)] = record;

  if (record.id >= world.nextBiologyPopulationId) {
    world.nextBiologyPopulationId = record.id + 1;
  }

  return record;
}

function ensureBiologyPopulation(organism) {
  ensureRepresentativeState();
  ensureRepresentativeIdentity(organism);

  var populationId = Math.max(1, Math.round(Number(organism.populationId) || organism.lineageId));
  var record = getBiologyPopulationById(populationId);

  if (!record) {
    return makeBiologyPopulation(organism);
  }

  record.speciesId = Math.max(1, Math.round(Number(organism.speciesId) || record.speciesId || organism.lineageId));
  record.lineageId = Math.max(1, Math.round(Number(organism.lineageId) || record.lineageId || record.speciesId));
  record.isActive = true;
  return record;
}

function copyRepresentativeTraits(organism) {
  return copyRepresentativeTraitsFrom(organism, ensureOrganismTraits(organism));
}

function copyRepresentativeTraitsFrom(organism, traits) {
  var source = traits || ensureOrganismTraits(organism);
  var copy = {};

  for (var i = 0; i < REPRESENTATIVE_TRAIT_KEYS.length; i++) {
    var key = REPRESENTATIVE_TRAIT_KEYS[i];
    copy[key] = source[key];
  }

  return copy;
}

function getRepresentativeBehavior(organism, traits) {
  if (Number(organism.energy) <= 0) {
    return "retiring";
  }

  if (typeof foodExistsAt === "function" && foodExistsAt(organism.x, organism.y)) {
    return "feeding";
  }

  if (Number(organism.energy) >= Number(traits.reproductionEnergy)) {
    return "breeding";
  }

  if (Number(organism.directionX) || Number(organism.directionY)) {
    return "foraging";
  }

  return "watching";
}

function getRepresentativeTarget(organism, traits) {
  if (typeof findNearestFoodInBuckets !== "function") {
    return null;
  }

  representativePerfStats.lastFoodSearchCount++;
  var food = findNearestFoodInBuckets(organism.x, organism.y, traits.vision);

  if (!food) {
    return null;
  }

  return {
    type: "food",
    x: food.x,
    y: food.y
  };
}

function getRepresentativeMorphologyPreview(organism, traits) {
  var renderEntities = PS.render && PS.render.entities ? PS.render.entities : null;

  if (renderEntities && typeof renderEntities.getOrganismMorphologyPreview === "function") {
    return renderEntities.getOrganismMorphologyPreview(organism, 0);
  }

  var bodySize = Number(traits && traits.bodySize) || 1;
  var waterDependency = Number(traits && traits.waterDependency) || 0;
  var terrainAffinity = Number(traits && traits.terrainAffinity) || 0;
  var thermalTolerance = Number(traits && traits.thermalTolerance) || 0;
  var carnivory = Number(traits && traits.carnivory) || 0;
  var camouflage = Number(traits && traits.camouflage) || 0;
  var movementTendency = Number(traits && traits.movementTendency) || 0;
  var movementMin = Number(CONFIG && CONFIG.TRAIT_MOVEMENT_TENDENCY_MIN);
  var movementMax = Number(CONFIG && CONFIG.TRAIT_MOVEMENT_TENDENCY_MAX);
  var movementRange = Number.isFinite(movementMax - movementMin) && movementMax > movementMin
    ? (movementTendency - movementMin) / (movementMax - movementMin)
    : movementTendency;
  var sociality = Number(traits && traits.sociality) || 0;
  var intelligence = Number(traits && traits.intelligence) || 0;
  var scale = bodySize >= 2 ? "large" : (bodySize <= 0.75 ? "tiny" : "mid");
  var habitat = waterDependency >= 0.75 ? "aquatic" : (terrainAffinity <= 0.25 ? "coastal" : (terrainAffinity >= 0.75 ? "upland" : "terrestrial"));
  var climate = thermalTolerance >= 0.75 ? "heat-adapted" : (thermalTolerance <= 0.25 ? "cold-adapted" : "temperate");
  var defense = carnivory >= 0.75 ? "predator" : "soft";
  var cover = camouflage >= 0.75 ? "camouflaged" : "visible";
  var motion = movementRange >= 0.75 ? "fast" : (movementRange <= 0.25 ? "slow" : "mobile");
  var mind = sociality >= 0.5 ? "social" : (intelligence >= 0.5 ? "alert" : "instinctive");

  return {
    key: [
      "representative.morphology",
      Math.round(bodySize * 2),
      Math.round(waterDependency * 4),
      Math.round(terrainAffinity * 4),
      Math.round(thermalTolerance * 4),
      Math.round(carnivory * 4),
      Math.round(camouflage * 4),
      Math.round(movementRange * 4),
      Math.round(sociality * 3),
      Math.round(intelligence * 3)
    ].join("."),
    label: [scale, habitat, climate, defense, cover, motion, mind].join(" "),
    tags: {
      scale: scale,
      habitat: habitat,
      climate: climate,
      defense: defense,
      cover: cover,
      motion: motion,
      mind: mind
    }
  };
}

function ensureBiologyRepresentativeSummary(organism, population, traits) {
  ensureRepresentativeState();

  var representativeId = Math.max(1, Math.round(Number(organism.representativeId) || 0));
  var record = getBiologyRepresentativeById(representativeId);
  var tick = Math.max(0, Math.round(Number(world.tick) || 0));

  if (!record) {
    record = {
      id: representativeId,
      history: [],
      pinned: false,
      selected: false,
      bookmarkScore: 0,
      createdTick: tick
    };
    world.biologyRepresentatives.push(record);
    world.biologyRepresentativeById[String(representativeId)] = record;
  }

  record.populationId = population.id;
  record.speciesId = population.speciesId;
  record.lineageId = population.lineageId;
  record.x = organism.x;
  record.y = organism.y;
  record.latitude = organism.latitude;
  record.longitude = organism.longitude;
  record.energy = Math.round(Number(organism.energy) || 0);
  record.age = Math.max(0, Number(organism.age) || 0);
  record.traits = traits;
  record.morphologyPreview = getRepresentativeMorphologyPreview(organism, traits);
  record.isActive = true;
  record.lastSeenTick = tick;

  if (!record.behavior) {
    record.behavior = "watching";
  }
  if (record.target === undefined) {
    record.target = null;
  }

  return record;
}

function shouldFullSyncRepresentative(organism) {
  var representativeId = Math.max(1, Math.round(Number(organism && organism.representativeId) || 0));
  var record = getBiologyRepresentativeById(representativeId);

  return Boolean(record && (record.pinned || record.selected || record.bookmarkScore > 0));
}

function appendRepresentativeHistory(record, behavior, target) {
  var entry = {
    tick: Math.max(0, Math.round(Number(world.tick) || 0)),
    x: record.x,
    y: record.y,
    energy: record.energy,
    behavior: behavior,
    target: target
  };
  var last = record.history.length > 0 ? record.history[record.history.length - 1] : null;

  if (last && last.tick === entry.tick && last.behavior === entry.behavior) {
    return;
  }

  record.history.push(entry);

  while (record.history.length > REPRESENTATIVE_HISTORY_LIMIT) {
    record.history.shift();
  }
}

function syncBiologyRepresentative(organism, options) {
  ensureRepresentativeState();
  var population = ensureBiologyPopulation(organism);
  var traits = copyRepresentativeTraits(organism);
  var representativeId = Math.max(1, Math.round(Number(organism.representativeId) || 0));
  var behavior = getRepresentativeBehavior(organism, traits);
  var target = getRepresentativeTarget(organism, traits);
  var record = getBiologyRepresentativeById(representativeId);
  var tick = Math.max(0, Math.round(Number(world.tick) || 0));

  if (!record) {
    record = {
      id: representativeId,
      history: [],
      pinned: false,
      selected: false,
      bookmarkScore: 0,
      createdTick: tick
    };
    world.biologyRepresentatives.push(record);
    world.biologyRepresentativeById[String(representativeId)] = record;
  }

  record.populationId = population.id;
  record.speciesId = population.speciesId;
  record.lineageId = population.lineageId;
  record.x = organism.x;
  record.y = organism.y;
  record.latitude = organism.latitude;
  record.longitude = organism.longitude;
  record.energy = Math.round(Number(organism.energy) || 0);
  record.age = Math.max(0, Number(organism.age) || 0);
  record.behavior = behavior;
  record.target = target;
  record.traits = traits;
  record.morphologyPreview = getRepresentativeMorphologyPreview(organism, traits);
  record.isActive = true;
  record.lastSeenTick = tick;

  if (options && options.selected) {
    record.selected = true;
    record.lastSelectedTick = tick;
    markWatchedRepresentative(record.id, true);
  }

  appendRepresentativeHistory(record, behavior, target);
  return record;
}

function getPopulationTraitStats(organisms, traitsList) {
  var mean = {};
  var variance = {};

  var state = {};
  var keyIndex;
  var i;

  for (keyIndex = 0; keyIndex < REPRESENTATIVE_TRAIT_KEYS.length; keyIndex++) {
    state[REPRESENTATIVE_TRAIT_KEYS[keyIndex]] = {
      count: 0,
      mean: 0,
      m2: 0
    };
  }

  for (i = 0; i < organisms.length; i++) {
    var traits = traitsList && traitsList[i] ? traitsList[i] : ensureOrganismTraits(organisms[i]);

    if (!traitsList || !traitsList[i]) {
      representativePerfStats.lastTraitEnsureCalls++;
    }

    for (keyIndex = 0; keyIndex < REPRESENTATIVE_TRAIT_KEYS.length; keyIndex++) {
      var key = REPRESENTATIVE_TRAIT_KEYS[keyIndex];
      var value = Number(traits[key]);
      var item = state[key];
      var delta;

      if (!Number.isFinite(value)) {
        continue;
      }

      item.count++;
      delta = value - item.mean;
      item.mean += delta / item.count;
      item.m2 += delta * (value - item.mean);
    }
  }

  for (keyIndex = 0; keyIndex < REPRESENTATIVE_TRAIT_KEYS.length; keyIndex++) {
    var statKey = REPRESENTATIVE_TRAIT_KEYS[keyIndex];
    var stat = state[statKey];

    mean[statKey] = stat.count > 0 ? stat.mean : 0;
    variance[statKey] = stat.count > 0 ? stat.m2 / stat.count : 0;
  }

  return {
    mean: mean,
    variance: variance
  };
}

function getPopulationTerritoryCells(organisms) {
  var cellsByKey = {};
  var cells = [];

  for (var i = 0; i < organisms.length; i++) {
    var key = organisms[i].x + ":" + organisms[i].y;

    if (!cellsByKey[key]) {
      cellsByKey[key] = {
        x: organisms[i].x,
        y: organisms[i].y,
        density: 0
      };
      cells.push(cellsByKey[key]);
    }

    cellsByKey[key].density++;
  }

  cells.sort(function(a, b) {
    if (b.density !== a.density) {
      return b.density - a.density;
    }

    return a.x - b.x || a.y - b.y;
  });

  return cells.slice(0, REPRESENTATIVE_TERRITORY_LIMIT);
}

function getPopulationPressure(organisms, energyReserve, traitsList) {
  var foodCount = 0;
  var terrainMismatch = 0;

  for (var i = 0; i < organisms.length; i++) {
    if (typeof foodExistsAt === "function" && foodExistsAt(organisms[i].x, organisms[i].y)) {
      foodCount++;
    }

    if (typeof getTerrainMismatchForTraits === "function") {
      var traits = traitsList && traitsList[i] ? traitsList[i] : ensureOrganismTraits(organisms[i]);
      if (!traitsList || !traitsList[i]) {
        representativePerfStats.lastTraitEnsureCalls++;
      }
      terrainMismatch += getTerrainMismatchForTraits(traits, organisms[i].x, organisms[i].y);
    }
  }

  return {
    food: foodCount,
    scarcity: organisms.length > 0 ? Math.max(0, 1 - foodCount / organisms.length) : 0,
    terrain: organisms.length > 0 ? terrainMismatch / organisms.length : 0,
    energyReserve: energyReserve
  };
}

function updatePopulationFromOrganisms(population, organisms, signature) {
  var traitsList = new Array(organisms.length);
  var stats;
  var biomass = 0;
  var representativeIds = [];

  for (var i = 0; i < organisms.length; i++) {
    traitsList[i] = ensureOrganismTraits(organisms[i]);
    representativePerfStats.lastTraitEnsureCalls++;

    var record = shouldFullSyncRepresentative(organisms[i])
      ? syncBiologyRepresentative(organisms[i])
      : ensureBiologyRepresentativeSummary(organisms[i], population, copyRepresentativeTraitsFrom(organisms[i], traitsList[i]));

    if (record.selected || record.pinned || record.bookmarkScore > 0) {
      representativePerfStats.lastFullSyncCount++;
    } else {
      representativePerfStats.lastSummarySyncCount++;
    }

    representativeIds.push(record.id);
    biomass += Math.max(0, Number(organisms[i].energy) || 0);
  }

  stats = getPopulationTraitStats(organisms, traitsList);
  population.count = organisms.length;
  population.biomass = Math.round(biomass);
  population.energyReserve = organisms.length > 0 ? biomass / organisms.length : 0;
  population.territoryCells = getPopulationTerritoryCells(organisms);
  population.traitMean = stats.mean;
  population.traitVariance = stats.variance;
  population.pressure = getPopulationPressure(organisms, population.energyReserve, traitsList);
  population.terrainPressure = PS.sim && PS.sim.terrainPressure && typeof PS.sim.terrainPressure.summarizePopulation === "function"
    ? PS.sim.terrainPressure.summarizePopulation(organisms, traitsList)
    : null;
  if (PS.sim && PS.sim.speciation && typeof PS.sim.speciation.evaluatePopulation === "function") {
    PS.sim.speciation.evaluatePopulation(population, organisms, traitsList);
    for (var speciesIndex = 0; speciesIndex < representativeIds.length; speciesIndex++) {
      var representative = getBiologyRepresentativeById(representativeIds[speciesIndex]);
      if (representative) {
        representative.speciesId = population.speciesId;
      }
    }
  }
  population.foodWeb = PS.sim && PS.sim.foodWeb && typeof PS.sim.foodWeb.getPopulationMetrics === "function"
    ? PS.sim.foodWeb.getPopulationMetrics(organisms, traitsList, population.pressure)
    : null;
  population.representativeIds = representativeIds;
  population.lastUpdatedTick = Math.max(0, Math.round(Number(world.tick) || 0));
  population.isActive = organisms.length > 0;
  population.refreshSignature = signature || "";
}

function refreshBiologyRepresentatives() {
  var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  ensureRepresentativeState();
  representativePerfStats.lastTraitEnsureCalls = 0;
  representativePerfStats.lastFullSyncCount = 0;
  representativePerfStats.lastSummarySyncCount = 0;
  representativePerfStats.lastFoodSearchCount = 0;
  representativePerfStats.lastSkippedOrganisms = 0;
  representativePerfStats.lastRefreshOrganisms = world.organisms.length;

  var aggregateSignature = getRepresentativeAggregateSignature();

  if (world.biologyAggregateRefreshSignature === aggregateSignature && world.biologyPopulations.length > 0) {
    representativePerfStats.lastSkippedOrganisms = world.organisms.length;
    syncWatchedRepresentativesFromActiveOrganisms();
    refreshTerrainPressureForExistingPopulations();
    representativePerfStats.lastRefreshMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    return world.biologyPopulations;
  }

  var activeIds = {};
  var grouped = {};

  for (var i = 0; i < world.organisms.length; i++) {
    var organism = world.organisms[i];
    ensureRepresentativeIdentity(organism);
    var key = String(Math.max(1, Math.round(Number(organism.populationId) || organism.lineageId)));
    var group = grouped[key];
    var representativeId = Math.max(1, Math.round(Number(organism.representativeId) || 0));
    var watchedRecord = getBiologyRepresentativeById(representativeId);

    if (!group) {
      group = {
        population: ensureBiologyPopulation(organism),
        organisms: [],
        count: 0,
        energySum: 0,
        xSum: 0,
        ySum: 0,
        representativeIdSum: 0,
        watched: []
      };
      grouped[key] = group;
    }

    group.organisms.push(organism);
    group.count++;
    group.energySum += Math.round(Number(organism.energy) || 0);
    group.xSum += Math.round(Number(organism.x) || 0);
    group.ySum += Math.round(Number(organism.y) || 0);
    group.representativeIdSum += representativeId;

    if (watchedRecord && (watchedRecord.pinned || watchedRecord.selected || watchedRecord.bookmarkScore > 0)) {
      group.watched.push(organism);
    }

    activeIds[String(representativeId)] = true;
  }

  for (var populationKey in grouped) {
    if (Object.prototype.hasOwnProperty.call(grouped, populationKey)) {
      var groupedPopulation = grouped[populationKey];
      var signature = [
        groupedPopulation.count,
        groupedPopulation.energySum,
        groupedPopulation.xSum,
        groupedPopulation.ySum,
        groupedPopulation.representativeIdSum
      ].join(":");

      if (
        groupedPopulation.population.refreshSignature === signature &&
        Array.isArray(groupedPopulation.population.representativeIds) &&
        groupedPopulation.population.representativeIds.length === groupedPopulation.count
      ) {
        groupedPopulation.population.lastUpdatedTick = Math.max(0, Math.round(Number(world.tick) || 0));
        groupedPopulation.population.isActive = groupedPopulation.count > 0;
        representativePerfStats.lastSkippedOrganisms += groupedPopulation.count;

        for (var watchedIndex = 0; watchedIndex < groupedPopulation.watched.length; watchedIndex++) {
          syncBiologyRepresentative(groupedPopulation.watched[watchedIndex]);
          representativePerfStats.lastFullSyncCount++;
        }
      } else {
        updatePopulationFromOrganisms(groupedPopulation.population, groupedPopulation.organisms, signature);
      }
    }
  }

  for (var j = 0; j < world.biologyRepresentatives.length; j++) {
    var record = world.biologyRepresentatives[j];
    record.isActive = Boolean(activeIds[String(record.id)]);
  }

  representativePerfStats.lastRefreshMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
  world.biologyAggregateRefreshSignature = getRepresentativeAggregateSignature();
  if (PS.sim && PS.sim.foodWeb && typeof PS.sim.foodWeb.refreshSummary === "function") {
    PS.sim.foodWeb.refreshSummary(world.biologyPopulations);
    if (typeof PS.sim.foodWeb.emitMilestones === "function") {
      PS.sim.foodWeb.emitMilestones(world.foodWebSummary);
    }
  }
  if (PS.sim && PS.sim.terrainPressure && typeof PS.sim.terrainPressure.refreshSummary === "function") {
    PS.sim.terrainPressure.refreshSummary(world.biologyPopulations);
    if (typeof PS.sim.terrainPressure.emitMilestones === "function") {
      PS.sim.terrainPressure.emitMilestones(world.terrainPressureSummary);
    }
  }
  if (PS.sim && PS.sim.speciation && typeof PS.sim.speciation.refreshSummary === "function") {
    PS.sim.speciation.refreshSummary(world.biologyPopulations);
  }
  return world.biologyPopulations;
}

function setRepresentativePinned(organismOrId, pinned) {
  var record = typeof organismOrId === "object"
    ? syncBiologyRepresentative(organismOrId)
    : getBiologyRepresentativeById(organismOrId);

  if (!record) {
    return null;
  }

  record.pinned = pinned !== false;
  markWatchedRepresentative(record.id, record.pinned || record.selected || record.bookmarkScore > 0);
  return record;
}

function setRepresentativeBookmark(organismOrId, score) {
  var record = typeof organismOrId === "object"
    ? syncBiologyRepresentative(organismOrId)
    : getBiologyRepresentativeById(organismOrId);

  if (!record) {
    return null;
  }

  record.bookmarkScore = clamp(Number(score), 0, 1);
  markWatchedRepresentative(record.id, record.pinned || record.selected || record.bookmarkScore > 0);
  return record;
}

function selectRepresentative(organismOrId) {
  var record = typeof organismOrId === "object"
    ? syncBiologyRepresentative(organismOrId, { selected: true })
    : getBiologyRepresentativeById(organismOrId);

  if (record) {
    record.selected = true;
    record.lastSelectedTick = Math.max(0, Math.round(Number(world.tick) || 0));
    markWatchedRepresentative(record.id, true);
  }

  return record;
}

function inspectBiologyRepresentative(organismOrId) {
  var record = typeof organismOrId === "object"
    ? syncBiologyRepresentative(organismOrId)
    : getBiologyRepresentativeById(organismOrId);

  if (!record) {
    return null;
  }

  return {
    representative: record,
    population: getBiologyPopulationById(record.populationId)
  };
}

PS.sim.representatives = {
  refresh: refreshBiologyRepresentatives,
  syncOrganism: syncBiologyRepresentative,
  pin: setRepresentativePinned,
  bookmark: setRepresentativeBookmark,
  select: selectRepresentative,
  inspect: inspectBiologyRepresentative,
  getRepresentative: getBiologyRepresentativeById,
  getPopulation: getBiologyPopulationById,
  getPerfStats: function () {
    return Object.assign({}, representativePerfStats);
  }
};
