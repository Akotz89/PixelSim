import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getClampedWorldY, getWrappedWorldX } from "../render/planet-grid.js";
import { foodExistsAt } from "./food-growth.js";
import { foodWeb } from "./food-web.js";
import { findNearestFoodInBuckets } from "./food-runtime.js";
import { getTerrainMismatchForTraits } from "./organisms-behavior.js";
import { allocateBiologyRepresentativeId, allocateLineageId, ensureOrganismTraits } from "./organisms-traits.js";
import { speciation } from "./speciation.js";
import { terrainPressure } from "./terrain-pressure.js";
import { world } from "../systems/state.js";

PS.sim = PS.sim || {};

export var REPRESENTATIVE_HISTORY_LIMIT = 12;
export var REPRESENTATIVE_TERRITORY_LIMIT = 8;
export var REPRESENTATIVE_PRUNE_DEAD_AFTER_TICKS = 300;
export var REPRESENTATIVE_PRUNE_INTERVAL_TICKS = 60;
export var REPRESENTATIVE_TRAIT_KEYS = PS.core && PS.core.traitSchema && typeof PS.core.traitSchema.getKeys === "function"
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

export var representativePerfStats = {
  lastRefreshMs: 0,
  lastRefreshOrganisms: 0,
  lastTraitEnsureCalls: 0,
  lastFullSyncCount: 0,
  lastSummarySyncCount: 0,
  lastFoodSearchCount: 0,
  lastSkippedOrganisms: 0,
  lastPrunedRepresentatives: 0,
  lastPrunedPopulations: 0
};
export var lastPruneTick = 0;

export function ensureRepresentativeState() {
  world.biologyPopulations = Array.isArray(world.biologyPopulations) ? world.biologyPopulations : [];
  world.biologyPopulationById = world.biologyPopulationById || {};
  world.biologyRepresentatives = Array.isArray(world.biologyRepresentatives) ? world.biologyRepresentatives : [];
  world.biologyRepresentativeById = world.biologyRepresentativeById || {};
  world.biologyWatchedRepresentativeIds = world.biologyWatchedRepresentativeIds || {};
}

export function getBiologyPopulationById(populationId) {
  ensureRepresentativeState();
  return world.biologyPopulationById[String(populationId)] || null;
}

export function getBiologyRepresentativeById(representativeId) {
  ensureRepresentativeState();
  return world.biologyRepresentativeById[String(representativeId)] || null;
}

export function markWatchedRepresentative(representativeId, watched) {
  ensureRepresentativeState();
  var key = String(Math.max(1, Math.round(Number(representativeId) || 0)));

  if (watched === false) {
    delete world.biologyWatchedRepresentativeIds[key];
  } else {
    world.biologyWatchedRepresentativeIds[key] = true;
  }
}

export function getRepresentativeSanitizedPosition(organism) {
  var x = Number(organism && organism.x);
  var y = Number(organism && organism.y);
  var latitude = Number(organism && organism.latitude);
  var longitude = Number(organism && organism.longitude);

  return {
    x: Number.isFinite(x) ? getWrappedWorldX(x) : 0,
    y: Number.isFinite(y) ? getClampedWorldY(y) : 0,
    latitude: Number.isFinite(latitude) ? latitude : 0,
    longitude: Number.isFinite(longitude) ? longitude : 0
  };
}

export function applyRepresentativeSanitizedPosition(record, organism) {
  var position = getRepresentativeSanitizedPosition(organism);

  record.x = position.x;
  record.y = position.y;
  record.latitude = position.latitude;
  record.longitude = position.longitude;
}

export function getRepresentativeAggregateSignature() {
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

export function getTerrainPressureEnvironmentSignature() {
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

export function refreshTerrainPressureForExistingPopulations() {
  if (typeof terrainPressure.refreshSummary !== "function") {
    return null;
  }

  var populations = Array.isArray(world.biologyPopulations) ? world.biologyPopulations : [];

  for (var populationIndex = 0; populationIndex < populations.length; populationIndex++) {
    var population = populations[populationIndex];
    population.terrainPressure = population && population.isActive
      ? getPopulationTerrainPressureFromTerritory(population)
      : null;
  }

  var summary = terrainPressure.refreshSummary(populations);
  if (typeof terrainPressure.emitMilestones === "function") {
    terrainPressure.emitMilestones(summary);
  }
  return summary;
}

export function getPopulationTerrainPressureFromTerritory(population) {
  if (typeof terrainPressure.getMismatchSample !== "function") {
    return null;
  }

  var cells = Array.isArray(population && population.territoryCells) ? population.territoryCells : [];
  var traits = population && population.traitMean ? population.traitMean : {};
  var driverCounts = {};
  var traitCounts = {};
  var totalPressure = 0;
  var totalMismatch = 0;
  var totalIsolation = 0;
  var totalWeight = 0;
  var topDriver = "none";
  var topDriverWeight = 0;
  var sample = null;

  for (var i = 0; i < cells.length; i++) {
    var cell = cells[i];
    var weight = Math.max(1, Math.round(Number(cell && cell.density) || 1));
    var cellSample = terrainPressure.getMismatchSample(traits, cell.x, cell.y);
    var driver = cellSample.terrainDriver;

    driverCounts[driver] = (driverCounts[driver] || 0) + weight;
    if (driverCounts[driver] > topDriverWeight) {
      topDriver = driver;
      topDriverWeight = driverCounts[driver];
      sample = cellSample;
    }

    for (var traitIndex = 0; traitIndex < cellSample.affectedTraits.length; traitIndex++) {
      var trait = cellSample.affectedTraits[traitIndex];
      traitCounts[trait] = (traitCounts[trait] || 0) + weight;
    }

    totalPressure += cellSample.pressure * weight;
    totalMismatch += cellSample.mismatch * weight;
    totalIsolation += cellSample.isolation * weight;
    totalWeight += weight;
  }

  var dominantTrait = "terrainAffinity";
  var dominantTraitWeight = 0;
  var traitKeys = Object.keys(traitCounts);

  for (var keyIndex = 0; keyIndex < traitKeys.length; keyIndex++) {
    var key = traitKeys[keyIndex];
    if (traitCounts[key] > dominantTraitWeight) {
      dominantTrait = key;
      dominantTraitWeight = traitCounts[key];
    }
  }

  return {
    terrainDriver: topDriver,
    regionId: sample ? sample.regionId : "none",
    dominantTrait: dominantTrait,
    affectedTraits: traitKeys,
    pressure: totalWeight > 0 ? totalPressure / totalWeight : 0,
    mismatch: totalWeight > 0 ? totalMismatch / totalWeight : 0,
    isolation: totalWeight > 0 ? totalIsolation / totalWeight : 0,
    innovationPressure: sample ? sample.innovationPressure : 0,
    location: sample ? sample.location : null,
    driverCounts: driverCounts
  };
}

export function syncWatchedRepresentativesFromActiveOrganisms() {
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

export function ensureRepresentativeIdentity(organism) {
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

export function makeBiologyPopulation(organism) {
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

export function ensureBiologyPopulation(organism) {
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

export function copyRepresentativeTraits(organism) {
  return copyRepresentativeTraitsFrom(organism, ensureOrganismTraits(organism));
}

export function copyRepresentativeTraitsFrom(organism, traits) {
  var source = traits || ensureOrganismTraits(organism);
  var copy = {};

  for (var i = 0; i < REPRESENTATIVE_TRAIT_KEYS.length; i++) {
    var key = REPRESENTATIVE_TRAIT_KEYS[i];
    copy[key] = source[key];
  }

  return copy;
}

export function getRepresentativeBehavior(organism, traits) {
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

export function getRepresentativeTarget(organism, traits) {
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

export function getRepresentativeMorphologyPreview(organism, traits) {
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

export function ensureBiologyRepresentativeSummary(organism, population, traits) {
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
  applyRepresentativeSanitizedPosition(record, organism);
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

export function shouldFullSyncRepresentative(organism) {
  var representativeId = Math.max(1, Math.round(Number(organism && organism.representativeId) || 0));
  var record = getBiologyRepresentativeById(representativeId);

  return Boolean(record && (record.pinned || record.selected || record.bookmarkScore > 0));
}

export function appendRepresentativeHistory(record, behavior, target) {
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

export function syncBiologyRepresentative(organism, options) {
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
  applyRepresentativeSanitizedPosition(record, organism);
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

export function getPopulationTraitStats(organisms, traitsList) {
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

export function compareTerritoryCells(a, b) {
  if (b.density !== a.density) {
    return b.density - a.density;
  }

  return a.x - b.x || a.y - b.y;
}

export function insertTopTerritoryCell(topCells, cell) {
  var inserted = false;

  for (var i = 0; i < topCells.length; i++) {
    if (compareTerritoryCells(cell, topCells[i]) < 0) {
      topCells.splice(i, 0, cell);
      inserted = true;
      break;
    }
  }

  if (!inserted && topCells.length < REPRESENTATIVE_TERRITORY_LIMIT) {
    topCells.push(cell);
  }

  if (topCells.length > REPRESENTATIVE_TERRITORY_LIMIT) {
    topCells.length = REPRESENTATIVE_TERRITORY_LIMIT;
  }
}

export function getPopulationTerritoryCells(organisms) {
  var cellsByKey = {};
  var cells = [];
  var topCells = [];

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

  for (var cellIndex = 0; cellIndex < cells.length; cellIndex++) {
    insertTopTerritoryCell(topCells, cells[cellIndex]);
  }

  return topCells;
}

export function getPopulationPressure(organisms, energyReserve, traitsList) {
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

export function updatePopulationFromOrganisms(population, organisms, signature) {
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
  population.terrainPressure = typeof terrainPressure.summarizePopulation === "function"
    ? terrainPressure.summarizePopulation(organisms, traitsList)
    : null;
  if (speciation && typeof speciation.evaluatePopulation === "function") {
    speciation.evaluatePopulation(population, organisms, traitsList);
    for (var speciesIndex = 0; speciesIndex < representativeIds.length; speciesIndex++) {
      var representative = getBiologyRepresentativeById(representativeIds[speciesIndex]);
      if (representative) {
        representative.speciesId = population.speciesId;
      }
    }
  }
  population.foodWeb = foodWeb && typeof foodWeb.getPopulationMetrics === "function"
    ? foodWeb.getPopulationMetrics(organisms, traitsList, population.pressure)
    : null;
  population.representativeIds = representativeIds;
  population.lastUpdatedTick = Math.max(0, Math.round(Number(world.tick) || 0));
  population.isActive = organisms.length > 0;
  population.refreshSignature = signature || "";
}

export function pruneDeadRecords() {
  var tick = Math.max(0, Math.round(Number(world.tick) || 0));

  if (tick - lastPruneTick < REPRESENTATIVE_PRUNE_INTERVAL_TICKS) {
    return;
  }

  lastPruneTick = tick;
  representativePerfStats.lastPrunedRepresentatives = 0;
  representativePerfStats.lastPrunedPopulations = 0;

  var threshold = tick - REPRESENTATIVE_PRUNE_DEAD_AFTER_TICKS;
  var reps = world.biologyRepresentatives;
  var keptReps = [];
  var activePopulationIds = {};

  for (var r = 0; r < reps.length; r++) {
    var rep = reps[r];

    if (rep.isActive || rep.pinned || rep.selected || rep.bookmarkScore > 0) {
      keptReps.push(rep);
      if (rep.populationId) {
        activePopulationIds[String(rep.populationId)] = true;
      }
      continue;
    }

    var lastSeen = Math.max(0, Math.round(Number(rep.lastSeenTick) || 0));

    if (lastSeen > threshold) {
      keptReps.push(rep);
      if (rep.populationId) {
        activePopulationIds[String(rep.populationId)] = true;
      }
      continue;
    }

    delete world.biologyRepresentativeById[String(rep.id)];
    delete world.biologyWatchedRepresentativeIds[String(rep.id)];
    representativePerfStats.lastPrunedRepresentatives++;
  }

  if (representativePerfStats.lastPrunedRepresentatives > 0) {
    world.biologyRepresentatives = keptReps;
  }

  var pops = world.biologyPopulations;

  for (var p = 0; p < pops.length; p++) {
    var pop = pops[p];

    if (pop.isActive) {
      activePopulationIds[String(pop.id)] = true;
    }
  }

  var keptPops = [];

  for (var pi = 0; pi < pops.length; pi++) {
    var population = pops[pi];

    if (population.isActive || activePopulationIds[String(population.id)]) {
      keptPops.push(population);
      continue;
    }

    var popLastUpdated = Math.max(0, Math.round(Number(population.lastUpdatedTick) || 0));

    if (popLastUpdated > threshold) {
      keptPops.push(population);
      continue;
    }

    delete world.biologyPopulationById[String(population.id)];
    representativePerfStats.lastPrunedPopulations++;
  }

  if (representativePerfStats.lastPrunedPopulations > 0) {
    world.biologyPopulations = keptPops;
  }
}

/**
 * @description Synchronizes representative organisms and population summaries for rendering, biology telemetry, terrain pressure previews, and lineage pruning.
 * @returns {Object} Representative performance statistics for the completed refresh.
 */
export function refreshBiologyRepresentatives() {
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
    pruneDeadRecords();
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

  for (var populationIndex = 0; populationIndex < world.biologyPopulations.length; populationIndex++) {
    var populationRecord = world.biologyPopulations[populationIndex];
    var populationRecordKey = String(Math.max(1, Math.round(Number(populationRecord && populationRecord.id) || 1)));

    if (!grouped[populationRecordKey]) {
      populationRecord.count = 0;
      populationRecord.biomass = 0;
      populationRecord.energyReserve = 0;
      populationRecord.representativeIds = [];
      populationRecord.lastUpdatedTick = Math.max(0, Math.round(Number(world.tick) || 0));
      populationRecord.isActive = false;
      populationRecord.refreshSignature = "0:0:0:0:0";
    }
  }

  for (var j = 0; j < world.biologyRepresentatives.length; j++) {
    var record = world.biologyRepresentatives[j];
    record.isActive = Boolean(activeIds[String(record.id)]);
  }

  pruneDeadRecords();

  representativePerfStats.lastRefreshMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
  world.biologyAggregateRefreshSignature = getRepresentativeAggregateSignature();
  if (foodWeb && typeof foodWeb.refreshSummary === "function") {
    foodWeb.refreshSummary(world.biologyPopulations);
    if (typeof foodWeb.emitMilestones === "function") {
      foodWeb.emitMilestones(world.foodWebSummary);
    }
  }
  if (typeof terrainPressure.refreshSummary === "function") {
    terrainPressure.refreshSummary(world.biologyPopulations);
    if (typeof terrainPressure.emitMilestones === "function") {
      terrainPressure.emitMilestones(world.terrainPressureSummary);
    }
  }
  if (speciation && typeof speciation.refreshSummary === "function") {
    speciation.refreshSummary(world.biologyPopulations);
  }
  return world.biologyPopulations;
}

export function setRepresentativePinned(organismOrId, pinned) {
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

export function setRepresentativeBookmark(organismOrId, score) {
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

export function selectRepresentative(organismOrId) {
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

export function inspectBiologyRepresentative(organismOrId) {
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
