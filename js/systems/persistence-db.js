"use strict";
const PIXELDARIUM_DB_NAME = "pixeldarium";
const PIXELDARIUM_DB_VERSION = 1;
const PIXELDARIUM_SAVE_STORE = "saves";
const PIXELDARIUM_SAVE_ID = "latest";
const PIXELDARIUM_SAVE_VERSION = 3;

function clonePersistencePlainValue(value) {
  var key;
  var clone;

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    clone = new Array(value.length);

    for (var i = 0; i < value.length; i++) {
      clone[i] = clonePersistencePlainValue(value[i]);
    }

    return clone;
  }

  clone = {};

  for (key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      clone[key] = clonePersistencePlainValue(value[key]);
    }
  }

  return clone;
}

function openPixeldariumDatabase() {
  return new Promise(function(resolve, reject) {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    var request = window.indexedDB.open(PIXELDARIUM_DB_NAME, PIXELDARIUM_DB_VERSION);

    request.onupgradeneeded = function(event) {
      var db = event.target.result;

      if (!db.objectStoreNames.contains(PIXELDARIUM_SAVE_STORE)) {
        db.createObjectStore(PIXELDARIUM_SAVE_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = function(event) {
      resolve(event.target.result);
    };

    request.onerror = function() {
      reject(new Error(request.error ? request.error.message : "Could not open IndexedDB"));
    };
  });
}

function copyOrganismTraitsForSave(traits) {
  return PS.core.traitSchema.copy(traits);
}

function copyOrganismForSave(organism) {
  var traits = ensureOrganismTraits(organism);

  return {
    x: organism.x,
    y: organism.y,
    prevX: organism.prevX,
    prevY: organism.prevY,
    latitude: organism.latitude,
    longitude: organism.longitude,
    prevLatitude: organism.prevLatitude,
    prevLongitude: organism.prevLongitude,
    energy: organism.energy,
    age: organism.age,
    directionX: organism.directionX,
    directionY: organism.directionY,
    travelKm: Math.max(0, Number(organism.travelKm) || 0),
    traits: copyOrganismTraitsForSave(traits),
    lineageId: ensureOrganismLineage(organism),
    lineageParentId: organism.lineageParentId,
    generation: organism.generation,
    speciesId: Math.max(1, Math.round(Number(organism.speciesId) || organism.lineageId || 1)),
    populationId: Math.max(1, Math.round(Number(organism.populationId) || organism.lineageId || 1)),
    representativeId: Math.max(1, Math.round(Number(organism.representativeId) || 1))
  };
}

function copyFoodForSave(food) {
  return {
    x: food.x,
    y: food.y,
    latitude: food.latitude,
    longitude: food.longitude
  };
}

function copyTraitHistorySampleForSave(sample) {
  var traits = PS.core.traitSchema.copy(sample || {});
  traits.tick = sample.tick;
  traits.population = sample.population;
  return traits;
}

function copySimulationEventForSave(event) {
  return {
    tick: Math.max(0, Math.round(Number(event.tick) || 0)),
    type: String(event.type || "sim"),
    label: String(event.label || "Event"),
    detail: String(event.detail || ""),
    details: event.details || null,
    deepTime: event.deepTime || null,
    location: event.location || null,
    source: event.source || null,
    category: event.category || null,
    severity: event.severity || null,
    terrainDriver: event.terrainDriver || null,
    trait: event.trait || null,
    lineageId: event.lineageId == null ? null : Math.max(0, Math.round(Number(event.lineageId) || 0)),
    speciesId: event.speciesId == null ? null : Math.max(0, Math.round(Number(event.speciesId) || 0)),
    populationId: event.populationId == null ? null : Math.max(0, Math.round(Number(event.populationId) || 0)),
    pressure: event.pressure == null ? null : Math.max(0, Math.min(1, Number(event.pressure) || 0)),
    effect: event.effect || null,
    id: event.id == null ? null : Math.max(0, Math.round(Number(event.id) || 0)),
    parentId: event.parentId == null ? null : Math.max(0, Math.round(Number(event.parentId) || 0)),
    cause: event.cause || null,
    divergence: event.divergence == null ? null : Math.max(0, Math.min(1, Number(event.divergence) || 0)),
    traits: event.traits ? copyOrganismTraitsForSave(event.traits) : null,
    inspectTarget: event.inspectTarget || null
  };
}

function copyEcosystemHistorySampleForSave(sample) {
  var foodRunwayTicks = Number(sample.foodRunwayTicks);

  return {
    tick: Math.max(0, Math.round(Number(sample.tick) || 0)),
    population: Math.max(0, Math.round(Number(sample.population) || 0)),
    food: Math.max(0, Math.round(Number(sample.food) || 0)),
    averageEnergy: Math.max(0, Number(sample.averageEnergy) || 0),
    foodPerOrganism: Math.max(0, Number(sample.foodPerOrganism) || 0),
    populationBalance: String(sample.populationBalance || "steady"),
    resourceBalance: String(sample.resourceBalance || "steady"),
    foodNetThisTick: Math.round(Number(sample.foodNetThisTick) || 0),
    foodRunwayTicks: Number.isFinite(foodRunwayTicks) ? Math.round(foodRunwayTicks) : -1,
    pressure: String(sample.pressure || "balanced"),
    stabilityScore: clamp(Math.round(Number(sample.stabilityScore) || 0), 0, 100)
  };
}

function copyLineageForSave(lineage) {
  return {
    id: lineage.id,
    parentId: lineage.parentId,
    createdTick: lineage.createdTick,
    founderGeneration: lineage.founderGeneration,
    founderTraits: copyOrganismTraitsForSave(lineage.founderTraits),
    activeCount: lineage.activeCount,
    lastSeenTick: lineage.lastSeenTick,
    peakPopulation: lineage.peakPopulation,
    isExtinct: lineage.isExtinct
  };
}

function copySettlementForSave(settlement) {
  return {
    id: settlement.id,
    lineageId: settlement.lineageId,
    x: settlement.x,
    y: settlement.y,
    foundedTick: settlement.foundedTick,
    radius: settlement.radius,
    population: settlement.population,
    foodStock: settlement.foodStock,
    storedFood: settlement.storedFood,
    development: settlement.development,
    level: settlement.level,
    lastGrowthTick: settlement.lastGrowthTick,
    influenceRadius: settlement.influenceRadius,
    claimedTiles: settlement.claimedTiles,
    claimedFood: settlement.claimedFood,
    parentSettlementId: settlement.parentSettlementId,
    isOutpost: settlement.isOutpost,
    isColony: settlement.isColony,
    lastOutpostTick: settlement.lastOutpostTick,
    lastSupplyGrowthTick: settlement.lastSupplyGrowthTick,
    isActive: settlement.isActive,
    lastActiveTick: settlement.lastActiveTick
  };
}

function copySettlementRouteForSave(route) {
  return {
    id: route.id,
    parentSettlementId: route.parentSettlementId,
    childSettlementId: route.childSettlementId,
    lineageId: route.lineageId,
    foundedTick: route.foundedTick,
    distance: route.distance,
    foodTransferred: route.foodTransferred,
    lastTransferTick: route.lastTransferTick,
    isActive: route.isActive
  };
}

function copyOrbitalAssetForSave(asset) {
  return {
    id: asset.id,
    launchNumber: asset.launchNumber,
    launchedTick: asset.launchedTick,
    infrastructureScore: asset.infrastructureScore,
    orbitAngle: asset.orbitAngle,
    orbitBand: asset.orbitBand,
    isActive: asset.isActive
  };
}

function copyPlanetaryBodyForSave(body) {
  return {
    id: body.id,
    name: body.name,
    discoveredTick: body.discoveredTick,
    surveyValue: body.surveyValue,
    orbitAngle: body.orbitAngle,
    orbitRadius: body.orbitRadius,
    isSurveyed: body.isSurveyed
  };
}

function copyProbeMissionForSave(mission) {
  return {
    id: mission.id,
    targetBodyId: mission.targetBodyId,
    launchedTick: mission.launchedTick,
    arrivalTick: mission.arrivalTick,
    progress: mission.progress,
    isComplete: mission.isComplete
  };
}

function copyStarSystemForSave(system) {
  return {
    id: system.id,
    name: system.name,
    discoveredTick: system.discoveredTick,
    mapValue: system.mapValue,
    mapX: system.mapX,
    mapY: system.mapY,
    isMapped: system.isMapped,
    influenceValue: system.influenceValue,
    isClaimed: system.isClaimed,
    claimedTick: system.claimedTick
  };
}

function copyInterstellarFleetForSave(fleet) {
  return {
    id: fleet.id,
    sourceSystemId: fleet.sourceSystemId,
    targetSystemId: fleet.targetSystemId,
    launchedTick: fleet.launchedTick,
    arrivalTick: fleet.arrivalTick,
    progress: fleet.progress,
    isComplete: fleet.isComplete
  };
}

function copyEmpireSectorForSave(sector) {
  return {
    id: sector.id,
    systemId: sector.systemId,
    foundedTick: sector.foundedTick,
    controlValue: sector.controlValue,
    controlRadius: sector.controlRadius,
    isActive: sector.isActive
  };
}

function getLineagesForSave() {
  if (typeof refreshLineageRegistry === "function") {
    refreshLineageRegistry();
  }

  var lineages = [];
  var lineageRecords = world.lineages || {};

  for (var lineageKey in lineageRecords) {
    if (Object.prototype.hasOwnProperty.call(lineageRecords, lineageKey)) {
      lineages.push(copyLineageForSave(lineageRecords[lineageKey]));
    }
  }

  lineages.sort(function(a, b) {
    return a.id - b.id;
  });

  return lineages;
}

function getSettlementsForSave() {
  if (!Array.isArray(world.settlements)) {
    return [];
  }

  return world.settlements.map(copySettlementForSave);
}

function getSettlementRoutesForSave() {
  if (!Array.isArray(world.settlementRoutes)) {
    return [];
  }

  return world.settlementRoutes.map(copySettlementRouteForSave);
}

function getOrbitalAssetsForSave() {
  if (!Array.isArray(world.orbitalAssets)) {
    return [];
  }

  return world.orbitalAssets.map(copyOrbitalAssetForSave);
}

function getPlanetaryBodiesForSave() {
  if (!Array.isArray(world.planetaryBodies)) {
    return [];
  }

  return world.planetaryBodies.map(copyPlanetaryBodyForSave);
}
