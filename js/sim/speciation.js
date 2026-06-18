"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getClampedWorldY, getWrappedWorldX } from "../render/planet-grid.js";
import { getPlanetLatitudeForTile, getPlanetLongitudeForTile } from "../render/planet-view.js";
import { normalizeOrganismTraits } from "./organisms-traits.js";
import { getBiologyRepresentativeById } from "./representatives.js";
import { clonePersistencePlainValue } from "../systems/persistence-db.js";
import { world } from "../systems/state.js";

PS.sim = PS.sim || {};

export var SPECIATION_DISTANCE_DEFAULT = 0.58;
export var SPECIATION_ISOLATION_WEIGHT_DEFAULT = 0.28;
export var SPECIATION_MIN_POPULATION_DEFAULT = 2;
export var SPECIATION_MIN_INTERVAL_DEFAULT = 180;
export var SPECIATION_MAX_SPECIES_DEFAULT = 512;

export function ensureSpeciesState() {
  world.species = Array.isArray(world.species) ? world.species : [];
  world.speciesById = world.speciesById || {};
  world.speciationEvents = Array.isArray(world.speciationEvents) ? world.speciationEvents : [];

  for (var i = 0; i < world.species.length; i++) {
    var record = world.species[i];
    if (record && record.id) {
      world.speciesById[String(record.id)] = record;
      world.nextSpeciesId = Math.max(world.nextSpeciesId, Math.max(1, Math.round(Number(record.id) || 1)) + 1);
    }
  }
}

export function getSpeciesConfigValue(key, fallback) {
  var config = PS.config && PS.config.evolution ? PS.config.evolution : {};
  return Number.isFinite(Number(config[key])) ? Number(config[key]) : fallback;
}

export function getSpeciesById(speciesId) {
  ensureSpeciesState();
  return world.speciesById[String(Math.max(1, Math.round(Number(speciesId) || 1)))] || null;
}

export function allocateSpeciesRecordId() {
  var speciesId = Math.max(1, Math.round(Number(world.nextSpeciesId) || 1));
  world.nextSpeciesId = speciesId + 1;
  return speciesId;
}

export function getSpeciationLocation(population, organisms) {
  var cell = population && Array.isArray(population.territoryCells) && population.territoryCells.length > 0
    ? population.territoryCells[0]
    : null;
  var organism = Array.isArray(organisms) && organisms.length > 0 ? organisms[0] : null;
  var x = cell ? cell.x : (organism ? organism.x : 0);
  var y = cell ? cell.y : (organism ? organism.y : 0);

  return {
    x: getWrappedWorldX(x),
    y: getClampedWorldY(y),
    latitude: typeof getPlanetLatitudeForTile === "function" ? getPlanetLatitudeForTile(y) : 0,
    longitude: typeof getPlanetLongitudeForTile === "function" ? getPlanetLongitudeForTile(x) : 0
  };
}

export function makeSpeciesRecord(options) {
  options = options || {};

  return {
    id: Math.max(1, Math.round(Number(options.id) || allocateSpeciesRecordId())),
    parentId: Math.max(0, Math.round(Number(options.parentId) || 0)),
    lineageId: Math.max(1, Math.round(Number(options.lineageId) || 1)),
    parentPopulationId: Math.max(0, Math.round(Number(options.parentPopulationId) || 0)),
    createdTick: Math.max(0, Math.round(Number(options.createdTick != null ? options.createdTick : world.tick) || 0)),
    lastSeenTick: Math.max(0, Math.round(Number(options.lastSeenTick != null ? options.lastSeenTick : world.tick) || 0)),
    founderTraits: PS.core.traitSchema.copy(options.founderTraits || {}),
    traitMean: PS.core.traitSchema.copy(options.traitMean || options.founderTraits || {}),
    divergence: Math.max(0, Number(options.divergence) || 0),
    cause: String(options.cause || "founder"),
    location: options.location || null,
    range: options.range || null,
    population: Math.max(0, Math.round(Number(options.population) || 0)),
    activePopulation: Math.max(0, Math.round(Number(options.activePopulation) || 0)),
    isActive: options.isActive !== false,
    isExtinct: Boolean(options.isExtinct)
  };
}

export function ensureSpeciesRecord(speciesId, options) {
  ensureSpeciesState();
  var normalizedId = Math.max(1, Math.round(Number(speciesId) || 1));
  var record = getSpeciesById(normalizedId);

  if (!record) {
    options = options || {};
    options.id = normalizedId;
    record = makeSpeciesRecord(options);
    world.species.push(record);
    world.speciesById[String(record.id)] = record;
  }

  if (record.id >= world.nextSpeciesId) {
    world.nextSpeciesId = record.id + 1;
  }

  return record;
}

export function getNormalizedTraitDistance(a, b) {
  var definitions = PS.core && PS.core.traitSchema && typeof PS.core.traitSchema.getDefinitions === "function"
    ? PS.core.traitSchema.getDefinitions()
    : [];
  var traitsA = normalizeOrganismTraits(a || {});
  var traitsB = normalizeOrganismTraits(b || {});
  var total = 0;
  var count = 0;

  for (var i = 0; i < definitions.length; i++) {
    var definition = definitions[i];
    var minValue = Number(CONFIG[definition.configPrefix + "_MIN"]);
    var maxValue = Number(CONFIG[definition.configPrefix + "_MAX"]);
    var range = Number.isFinite(maxValue - minValue) && maxValue > minValue ? maxValue - minValue : 1;
    var valueA = Number(traitsA[definition.key]);
    var valueB = Number(traitsB[definition.key]);

    if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
      continue;
    }

    total += Math.abs(valueB - valueA) / range;
    count++;
  }

  return count > 0 ? clamp(total / count, 0, 1) : 0;
}

export function getPopulationRange(population) {
  var cells = population && Array.isArray(population.territoryCells) ? population.territoryCells : [];

  if (cells.length === 0) {
    return null;
  }

  var minX = cells[0].x;
  var maxX = cells[0].x;
  var minY = cells[0].y;
  var maxY = cells[0].y;

  for (var i = 1; i < cells.length; i++) {
    minX = Math.min(minX, cells[i].x);
    maxX = Math.max(maxX, cells[i].x);
    minY = Math.min(minY, cells[i].y);
    maxY = Math.max(maxY, cells[i].y);
  }

  return {
    minX: minX,
    maxX: maxX,
    minY: minY,
    maxY: maxY,
    cells: cells.length
  };
}

export function getSpeciationCause(distance, isolation, threshold) {
  if (isolation >= 0.5 && distance >= threshold * 0.55) {
    return "geographic-isolation";
  }

  if (distance >= threshold) {
    return "trait-divergence";
  }

  return "selection-pressure";
}

export function canSpeciatePopulation(population, parentSpecies, divergence) {
  var maxSpecies = Math.max(1, Math.round(getSpeciesConfigValue("speciationMaxSpecies", SPECIATION_MAX_SPECIES_DEFAULT)));
  var minPopulation = Math.max(1, Math.round(getSpeciesConfigValue("speciationMinPopulation", SPECIATION_MIN_POPULATION_DEFAULT)));
  var minInterval = Math.max(1, Math.round(getSpeciesConfigValue("speciationMinIntervalTicks", SPECIATION_MIN_INTERVAL_DEFAULT)));
  var tick = Math.max(0, Math.round(Number(world.tick) || 0));

  if (!population || population.count < minPopulation || world.species.length >= maxSpecies) {
    return false;
  }

  if (population.lastSpeciationTick && tick - population.lastSpeciationTick < minInterval) {
    return false;
  }

  if (parentSpecies && parentSpecies.createdTick && tick - parentSpecies.createdTick < minInterval) {
    return false;
  }

  return divergence >= getSpeciesConfigValue("speciationDistance", SPECIATION_DISTANCE_DEFAULT);
}

export function emitSpeciationEvent(record, parentSpecies, population) {
  if (!PS.events || typeof PS.events.emitMilestone !== "function") {
    return null;
  }

  var payload = {
    type: "biology.speciation",
    label: "Speciation",
    detail: "S" + record.id + " split from S" + record.parentId + " by " + record.cause,
    source: "biology",
    category: "biology",
    severity: record.divergence >= 0.78 ? "major" : "info",
    id: record.id,
    parentId: record.parentId,
    lineageId: record.lineageId,
    speciesId: record.id,
    populationId: population.id,
    location: record.location,
    traits: record.traitMean,
    cause: record.cause,
    divergence: record.divergence,
    effect: "species-split",
    inspectTarget: record.location ? { type: "tile", x: record.location.x, y: record.location.y } : null,
    watcher: {
      eventLog: true,
      timeline: true,
      notification: record.divergence >= 0.78,
      spotlight: record.divergence >= 0.78,
      overlays: ["observation.selection"]
    }
  };
  var result = PS.events.emitMilestone(payload);

  if (PS.eventTypes && PS.eventTypes.SPECIES_NEW && typeof PS.events.emit === "function") {
    PS.events.emit(PS.eventTypes.SPECIES_NEW, result.payload);
  }

  return result;
}

export function evaluatePopulationForSpeciation(population, organisms, traitsList) {
  ensureSpeciesState();
  var currentSpeciesId = Math.max(1, Math.round(Number(population && population.speciesId) || 1));
  var parentSpecies = ensureSpeciesRecord(currentSpeciesId, {
    lineageId: population.lineageId,
    parentPopulationId: population.parentPopulationId,
    founderTraits: population.traitMean,
    traitMean: population.traitMean,
    location: getSpeciationLocation(population, organisms),
    population: population.count,
    activePopulation: population.count
  });
  var distance = getNormalizedTraitDistance(parentSpecies.founderTraits, population.traitMean);
  var isolation = clamp(Number(population.terrainPressure && population.terrainPressure.isolation) || 0, 0, 1);
  var isolationWeight = getSpeciesConfigValue("speciationIsolationWeight", SPECIATION_ISOLATION_WEIGHT_DEFAULT);
  var divergence = clamp(distance + isolation * isolationWeight, 0, 1);
  var cause = getSpeciationCause(distance, isolation, getSpeciesConfigValue("speciationDistance", SPECIATION_DISTANCE_DEFAULT));

  population.parentSpeciesId = Math.max(0, Math.round(Number(population.parentSpeciesId) || parentSpecies.parentId || 0));
  population.speciation = {
    parentSpeciesId: parentSpecies.id,
    traitDistance: distance,
    isolation: isolation,
    divergence: divergence,
    cause: cause
  };

  parentSpecies.traitMean = PS.core.traitSchema.copy(population.traitMean || parentSpecies.traitMean);
  parentSpecies.lastSeenTick = Math.max(0, Math.round(Number(world.tick) || 0));
  parentSpecies.population = Math.max(0, Math.round(Number(population.count) || 0));
  parentSpecies.activePopulation = parentSpecies.population;
  parentSpecies.range = getPopulationRange(population);
  parentSpecies.isActive = population.isActive !== false;
  parentSpecies.isExtinct = !parentSpecies.isActive;

  if (!canSpeciatePopulation(population, parentSpecies, divergence)) {
    return null;
  }

  var newSpeciesId = allocateSpeciesRecordId();
  var childPopulationId = Math.max(1, Math.round(Number(world.nextBiologyPopulationId) || 1));
  var record = makeSpeciesRecord({
    id: newSpeciesId,
    parentId: parentSpecies.id,
    lineageId: population.lineageId,
    parentPopulationId: childPopulationId,
    founderTraits: population.traitMean,
    traitMean: population.traitMean,
    divergence: divergence,
    cause: cause,
    location: getSpeciationLocation(population, organisms),
    range: getPopulationRange(population),
    population: population.count,
    activePopulation: population.count
  });

  world.species.push(record);
  world.speciesById[String(record.id)] = record;
  var canClonePlainValue = typeof clonePersistencePlainValue === "function";
  var childPopulation = {
    id: childPopulationId,
    speciesId: record.id,
    lineageId: population.lineageId,
    parentSpeciesId: parentSpecies.id,
    parentPopulationId: population.id,
    count: 0,
    biomass: 0,
    energyReserve: 0,
    territoryCells: [],
    traitMean: PS.core.traitSchema.copy(population.traitMean || {}),
    traitVariance: canClonePlainValue ? clonePersistencePlainValue(population.traitVariance || {}) : Object.assign({}, population.traitVariance || {}),
    pressure: canClonePlainValue ? clonePersistencePlainValue(population.pressure || {}) : Object.assign({}, population.pressure || {}),
    terrainPressure: canClonePlainValue ? clonePersistencePlainValue(population.terrainPressure || null) : population.terrainPressure,
    speciation: {
      parentSpeciesId: parentSpecies.id,
      traitDistance: distance,
      isolation: isolation,
      divergence: divergence,
      cause: cause,
      createdSpeciesId: record.id
    },
    foodWeb: null,
    representativeIds: [],
    createdTick: Math.max(0, Math.round(Number(world.tick) || 0)),
    lastUpdatedTick: Math.max(0, Math.round(Number(world.tick) || 0)),
    lastSpeciationTick: Math.max(0, Math.round(Number(world.tick) || 0)),
    refreshSignature: "",
    isActive: true
  };
  population.speciation = {
    parentSpeciesId: parentSpecies.id,
    traitDistance: distance,
    isolation: isolation,
    divergence: divergence,
    cause: cause,
    createdSpeciesId: record.id
  };
  population.lastSpeciationTick = Math.max(0, Math.round(Number(world.tick) || 0));

  for (var i = 0; i < organisms.length; i++) {
    if (i % 2 === 1 || organisms.length === 1) {
      organisms[i].speciesId = record.id;
      organisms[i].populationId = childPopulation.id;
      childPopulation.count++;
      childPopulation.biomass += Math.max(0, Number(organisms[i].energy) || 0);
      childPopulation.representativeIds.push(Math.max(1, Math.round(Number(organisms[i].representativeId) || 0)));
      childPopulation.territoryCells.push({
        x: organisms[i].x,
        y: organisms[i].y,
        density: 1
      });
      if (typeof getBiologyRepresentativeById === "function") {
        var representative = getBiologyRepresentativeById(organisms[i].representativeId);
        if (representative) {
          representative.speciesId = record.id;
          representative.populationId = childPopulation.id;
        }
      }
    }
  }

  if (childPopulation.count <= 0) {
    childPopulation.count = population.count;
  }

  childPopulation.energyReserve = childPopulation.count > 0 ? childPopulation.biomass / childPopulation.count : 0;
  population.count = Math.max(0, Math.round(Number(population.count) || 0) - childPopulation.count);
  population.parentSpeciesId = Math.max(0, Math.round(Number(population.parentSpeciesId) || parentSpecies.parentId || 0));
  population.isActive = population.count > 0;
  world.nextBiologyPopulationId = childPopulation.id + 1;
  world.biologyPopulations.push(childPopulation);
  world.biologyPopulationById[String(childPopulation.id)] = childPopulation;

  var eventResult = emitSpeciationEvent(record, parentSpecies, childPopulation);
  world.speciationEvents.push({
    tick: record.createdTick,
    id: record.id,
    parentId: record.parentId,
    lineageId: record.lineageId,
    populationId: childPopulation.id,
    cause: record.cause,
    divergence: record.divergence,
    location: record.location
  });

  while (world.speciationEvents.length > CONFIG.EVENT_LOG_MAX_ENTRIES) {
    world.speciationEvents.shift();
  }

  return {
    species: record,
    parent: parentSpecies,
    event: eventResult
  };
}

export function refreshSpeciesSummary(populations) {
  ensureSpeciesState();
  var activePopulations = Array.isArray(populations) ? populations : [];
  var activeSpecies = {};
  var topSpecies = [];
  var recentCount = 0;
  var tick = Math.max(0, Math.round(Number(world.tick) || 0));

  for (var i = 0; i < world.species.length; i++) {
    world.species[i].activePopulation = 0;
    world.species[i].isActive = false;
  }

  for (var p = 0; p < activePopulations.length; p++) {
    var population = activePopulations[p];
    var species = ensureSpeciesRecord(population.speciesId, {
      lineageId: population.lineageId,
      founderTraits: population.traitMean,
      traitMean: population.traitMean,
      population: population.count
    });

    species.activePopulation += Math.max(0, Math.round(Number(population.count) || 0));
    species.population = Math.max(species.population || 0, species.activePopulation);
    species.traitMean = PS.core.traitSchema.copy(population.traitMean || species.traitMean);
    species.range = getPopulationRange(population);
    species.lastSeenTick = tick;
    species.isActive = population.isActive !== false && species.activePopulation > 0;
    species.isExtinct = !species.isActive;
    activeSpecies[String(species.id)] = true;
  }

  for (var s = 0; s < world.species.length; s++) {
    var record = world.species[s];

    if (tick - Math.max(0, Math.round(Number(record.createdTick) || 0)) <= CONFIG.EVENT_LOG_MAX_ENTRIES * 10) {
      recentCount++;
    }

    if (record.isActive) {
      topSpecies.push(record);
      topSpecies.sort(function(a, b) {
        if (b.activePopulation !== a.activePopulation) {
          return b.activePopulation - a.activePopulation;
        }

        return a.id - b.id;
      });

      if (topSpecies.length > 5) {
        topSpecies.length = 5;
      }
    }
  }

  world.speciesSummary = {
    totalCount: world.species.length,
    activeCount: Object.keys(activeSpecies).length,
    extinctCount: Math.max(0, world.species.length - Object.keys(activeSpecies).length),
    recentSpeciationCount: recentCount,
    topSpecies: topSpecies.map(function(species) {
      return {
        id: species.id,
        parentId: species.parentId,
        lineageId: species.lineageId,
        activePopulation: species.activePopulation,
        cause: species.cause,
        divergence: species.divergence
      };
    })
  };

  return world.speciesSummary;
}

PS.sim.speciation = {
  ensureState: ensureSpeciesState,
  ensureSpecies: ensureSpeciesRecord,
  getSpecies: getSpeciesById,
  traitDistance: getNormalizedTraitDistance,
  evaluatePopulation: evaluatePopulationForSpeciation,
  refreshSummary: refreshSpeciesSummary
};
