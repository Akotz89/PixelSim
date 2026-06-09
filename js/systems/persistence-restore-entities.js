
function restorePlanetaryBodies(bodies) {
  if (!Array.isArray(bodies)) {
    return [];
  }

  return bodies.map(restorePlanetaryBody);
}

function restoreProbeMission(mission) {
  mission = mission || {};

  var restoredMission = {
    id: Math.max(1, Math.round(restoreNumber(mission.id, world.nextProbeMissionId))),
    targetBodyId: Math.max(0, Math.round(restoreNumber(mission.targetBodyId, 0))),
    launchedTick: Math.max(0, Math.round(restoreNumber(mission.launchedTick, 0))),
    arrivalTick: Math.max(0, Math.round(restoreNumber(mission.arrivalTick, 0))),
    progress: Math.max(0, Math.min(1, restoreNumber(mission.progress, 0))),
    isComplete: Boolean(mission.isComplete)
  };

  if (restoredMission.arrivalTick < restoredMission.launchedTick) {
    restoredMission.arrivalTick = restoredMission.launchedTick;
  }

  if (restoredMission.id >= world.nextProbeMissionId) {
    world.nextProbeMissionId = restoredMission.id + 1;
  }

  return restoredMission;
}

function restoreProbeMissions(missions) {
  if (!Array.isArray(missions)) {
    return [];
  }

  return missions.map(restoreProbeMission);
}

function restoreStarSystem(system) {
  system = system || {};

  var id = Math.max(1, Math.round(restoreNumber(system.id, world.nextStarSystemId)));
  var restoredSystem = {
    id: id,
    name: String(system.name || "S-" + String(200 + id)),
    discoveredTick: Math.max(0, Math.round(restoreNumber(system.discoveredTick, 0))),
    mapValue: Math.max(1, Math.round(restoreNumber(system.mapValue, 40 + id * 11))),
    mapX: Math.max(-1, Math.min(1, restoreNumber(system.mapX, Math.cos(id * 2.1)))),
    mapY: Math.max(-1, Math.min(1, restoreNumber(system.mapY, Math.sin(id * 2.1)))),
    isMapped: system.isMapped !== false,
    influenceValue: Math.max(1, Math.round(restoreNumber(system.influenceValue, restoreNumber(system.mapValue, 40 + id * 11)))),
    isClaimed: Boolean(system.isClaimed),
    claimedTick: Math.max(0, Math.round(restoreNumber(system.claimedTick, 0)))
  };

  if (restoredSystem.id >= world.nextStarSystemId) {
    world.nextStarSystemId = restoredSystem.id + 1;
  }

  return restoredSystem;
}

function restoreStarSystems(systems) {
  if (!Array.isArray(systems)) {
    return [];
  }

  return systems.map(restoreStarSystem);
}

function restoreInterstellarFleet(fleet) {
  fleet = fleet || {};

  var restoredFleet = {
    id: Math.max(1, Math.round(restoreNumber(fleet.id, world.nextInterstellarFleetId))),
    sourceSystemId: Math.max(1, Math.round(restoreNumber(fleet.sourceSystemId, 1))),
    targetSystemId: Math.max(1, Math.round(restoreNumber(fleet.targetSystemId, 1))),
    launchedTick: Math.max(0, Math.round(restoreNumber(fleet.launchedTick, 0))),
    arrivalTick: Math.max(0, Math.round(restoreNumber(fleet.arrivalTick, 0))),
    progress: Math.max(0, Math.min(1, restoreNumber(fleet.progress, 0))),
    isComplete: Boolean(fleet.isComplete)
  };

  if (restoredFleet.arrivalTick < restoredFleet.launchedTick) {
    restoredFleet.arrivalTick = restoredFleet.launchedTick;
  }

  if (restoredFleet.id >= world.nextInterstellarFleetId) {
    world.nextInterstellarFleetId = restoredFleet.id + 1;
  }

  return restoredFleet;
}

function restoreInterstellarFleets(fleets) {
  if (!Array.isArray(fleets)) {
    return [];
  }

  return fleets.map(restoreInterstellarFleet);
}

function restoreEmpireSector(sector) {
  sector = sector || {};

  var restoredSector = {
    id: Math.max(1, Math.round(restoreNumber(sector.id, world.nextEmpireSectorId))),
    systemId: Math.max(1, Math.round(restoreNumber(sector.systemId, 1))),
    foundedTick: Math.max(0, Math.round(restoreNumber(sector.foundedTick, 0))),
    controlValue: Math.max(1, Math.round(restoreNumber(sector.controlValue, 40))),
    controlRadius: Math.max(0.08, restoreNumber(sector.controlRadius, 0.18)),
    isActive: sector.isActive !== false
  };

  if (restoredSector.id >= world.nextEmpireSectorId) {
    world.nextEmpireSectorId = restoredSector.id + 1;
  }

  return restoredSector;
}

function restoreEmpireSectors(sectors) {
  if (!Array.isArray(sectors)) {
    return [];
  }

  return sectors.map(restoreEmpireSector);
}

function restoreBiologyAggregateState(saveData) {
  world.biologyPopulations = Array.isArray(saveData.biologyPopulations)
    ? JSON.parse(JSON.stringify(saveData.biologyPopulations))
    : [];
  world.biologyRepresentatives = Array.isArray(saveData.biologyRepresentatives)
    ? JSON.parse(JSON.stringify(saveData.biologyRepresentatives))
    : [];
  world.biologyPopulationById = {};
  world.biologyRepresentativeById = {};

  for (var populationIndex = 0; populationIndex < world.biologyPopulations.length; populationIndex++) {
    var population = world.biologyPopulations[populationIndex] || {};
    var populationId = Math.max(1, Math.round(restoreNumber(population.id, populationIndex + 1)));
    population.id = populationId;
    population.speciesId = Math.max(1, Math.round(restoreNumber(population.speciesId, populationId)));
    population.lineageId = Math.max(1, Math.round(restoreNumber(population.lineageId, population.speciesId)));
    world.biologyPopulationById[String(populationId)] = population;
    world.nextBiologyPopulationId = Math.max(world.nextBiologyPopulationId, populationId + 1);
    world.nextSpeciesId = Math.max(world.nextSpeciesId, population.speciesId + 1);
  }

  for (var representativeIndex = 0; representativeIndex < world.biologyRepresentatives.length; representativeIndex++) {
    var representative = world.biologyRepresentatives[representativeIndex] || {};
    var representativeId = Math.max(1, Math.round(restoreNumber(representative.id, representativeIndex + 1)));
    representative.id = representativeId;
    representative.populationId = Math.max(1, Math.round(restoreNumber(representative.populationId, 1)));
    representative.speciesId = Math.max(1, Math.round(restoreNumber(representative.speciesId, representative.populationId)));
    representative.lineageId = Math.max(1, Math.round(restoreNumber(representative.lineageId, representative.speciesId)));
    world.biologyRepresentativeById[String(representativeId)] = representative;
    world.nextBiologyRepresentativeId = Math.max(world.nextBiologyRepresentativeId, representativeId + 1);
    world.nextBiologyPopulationId = Math.max(world.nextBiologyPopulationId, representative.populationId + 1);
    world.nextSpeciesId = Math.max(world.nextSpeciesId, representative.speciesId + 1);
  }
}

function restoreOrganism(organism) {
  var tileX = clamp(Math.round(restoreNumber(organism.x, 0)), 0, WORLD_WIDTH - 1);
  var tileY = clamp(Math.round(restoreNumber(organism.y, 0)), 0, WORLD_HEIGHT - 1);
  var previousTileX = clamp(Math.round(restoreNumber(organism.prevX, tileX)), 0, WORLD_WIDTH - 1);
  var previousTileY = clamp(Math.round(restoreNumber(organism.prevY, tileY)), 0, WORLD_HEIGHT - 1);
  var surfacePosition = getRestoredSurfacePosition(organism, tileX, tileY);
  var previousSurfacePosition = {
    latitude: Number.isFinite(Number(organism.prevLatitude))
      ? clamp(Number(organism.prevLatitude), -90, 90)
      : surfacePosition.latitude,
    longitude: Number.isFinite(Number(organism.prevLongitude))
      ? normalizeLongitude(organism.prevLongitude)
      : surfacePosition.longitude
  };
  var restoredOrganism = makeOrganism(tileX, tileY, Math.round(restoreNumber(organism.lineageId, 0)));

  if (!restoredOrganism) {
    return null;
  }

  restoredOrganism.prevX = previousTileX;
  restoredOrganism.prevY = previousTileY;
  restoredOrganism.latitude = surfacePosition.latitude;
  restoredOrganism.longitude = surfacePosition.longitude;
  restoredOrganism.prevLatitude = previousSurfacePosition.latitude;
  restoredOrganism.prevLongitude = previousSurfacePosition.longitude;
  restoredOrganism.energy = Number(organism.energy);
  restoredOrganism.age = Number(organism.age);
  restoredOrganism.directionX = clamp(Math.round(Number(organism.directionX)), -1, 1);
  restoredOrganism.directionY = clamp(Math.round(Number(organism.directionY)), -1, 1);
  restoredOrganism.velocityX = 0;
  restoredOrganism.velocityY = 0;
  restoredOrganism.travelKm = Math.max(0, restoreNumber(organism.travelKm, 0));
  restoredOrganism.traits = restoreOrganismTraits(organism.traits);
  restoredOrganism.lineageId = Math.round(restoreNumber(organism.lineageId, 0));
  restoredOrganism.lineageParentId = Math.max(0, Math.round(restoreNumber(organism.lineageParentId, 0)));
  restoredOrganism.generation = Math.max(0, Math.round(restoreNumber(organism.generation, 0)));
  restoredOrganism.speciesId = Math.max(1, Math.round(restoreNumber(organism.speciesId, restoredOrganism.lineageId || 1)));
  restoredOrganism.populationId = Math.max(1, Math.round(restoreNumber(organism.populationId, restoredOrganism.lineageId || 1)));
  restoredOrganism.representativeId = Math.max(
    1,
    Math.round(restoreNumber(organism.representativeId, restoredOrganism.representativeId || 1))
  );

  ensureOrganismLineage(restoredOrganism);
  return restoredOrganism;
}

function restoreTraitHistorySample(sample) {
  return {
    tick: Math.max(0, Math.round(restoreNumber(sample.tick, 0))),
    population: Math.max(0, Math.round(restoreNumber(sample.population, 0))),
    vision: restoreClampedNumber(
      sample.vision,
      CONFIG.TRAIT_VISION_DEFAULT,
      CONFIG.TRAIT_VISION_MIN,
      CONFIG.TRAIT_VISION_MAX
    ),
    metabolism: restoreClampedNumber(
      sample.metabolism,
      CONFIG.TRAIT_METABOLISM_DEFAULT,
      CONFIG.TRAIT_METABOLISM_MIN,
      CONFIG.TRAIT_METABOLISM_MAX
    ),
    reproductionEnergy: restoreClampedNumber(
      sample.reproductionEnergy,
      CONFIG.TRAIT_REPRODUCTION_ENERGY_DEFAULT,
      CONFIG.TRAIT_REPRODUCTION_ENERGY_MIN,
      CONFIG.TRAIT_REPRODUCTION_ENERGY_MAX
    ),
    movementTendency: restoreClampedNumber(
      sample.movementTendency,
      CONFIG.TRAIT_MOVEMENT_TENDENCY_DEFAULT,
      CONFIG.TRAIT_MOVEMENT_TENDENCY_MIN,
      CONFIG.TRAIT_MOVEMENT_TENDENCY_MAX
    ),
    terrainAffinity: restoreClampedNumber(
      sample.terrainAffinity,
      CONFIG.TRAIT_TERRAIN_AFFINITY_DEFAULT,
      CONFIG.TRAIT_TERRAIN_AFFINITY_MIN,
      CONFIG.TRAIT_TERRAIN_AFFINITY_MAX
    )
  };
}

function restoreTraitHistory(traitHistory) {
  if (!Array.isArray(traitHistory)) {
    return [];
  }

  return traitHistory
    .slice(-CONFIG.TRAIT_HISTORY_MAX_SAMPLES)
    .map(restoreTraitHistorySample);
}

function restoreSimulationEvent(event) {
  event = event || {};

  return {
    tick: Math.max(0, Math.round(restoreNumber(event.tick, 0))),
    type: String(event.type || "sim"),
    label: String(event.label || "Event"),
    detail: String(event.detail || ""),
    details: event.details || null,
    deepTime: event.deepTime || null,
    location: event.location || null,
    source: event.source || null,
    category: event.category || null,
    severity: event.severity || null,
    inspectTarget: event.inspectTarget || null
  };
}

function restoreSimulationEvents(eventLog, limit) {
  if (!Array.isArray(eventLog)) {
    return [];
  }

  var normalizedLimit = limit == null
    ? CONFIG.EVENT_LOG_MAX_ENTRIES
    : Math.max(0, Math.round(Number(limit) || 0));
  var source = normalizedLimit > 0 ? eventLog.slice(-normalizedLimit) : eventLog.slice();

  return source.map(restoreSimulationEvent);
}

function restoreEcosystemHistorySample(sample) {
  sample = sample || {};

  return {
    tick: Math.max(0, Math.round(restoreNumber(sample.tick, 0))),
    population: Math.max(0, Math.round(restoreNumber(sample.population, 0))),
    food: Math.max(0, Math.round(restoreNumber(sample.food, 0))),
    averageEnergy: Math.max(0, restoreNumber(sample.averageEnergy, 0)),
    foodPerOrganism: Math.max(0, restoreNumber(sample.foodPerOrganism, 0)),
    populationBalance: String(sample.populationBalance || "steady"),
    resourceBalance: String(sample.resourceBalance || "steady"),
    foodNetThisTick: Math.round(restoreNumber(sample.foodNetThisTick, 0)),
    foodRunwayTicks: Math.round(restoreNumber(sample.foodRunwayTicks, -1)),
    pressure: String(sample.pressure || "balanced"),
    stabilityScore: clamp(Math.round(restoreNumber(sample.stabilityScore, 0)), 0, 100)
  };
}

function restoreEcosystemHistory(ecosystemHistory) {
  if (!Array.isArray(ecosystemHistory)) {
    return [];
  }

  return ecosystemHistory
    .slice(-CONFIG.ECOSYSTEM_HISTORY_MAX_SAMPLES)
    .map(restoreEcosystemHistorySample);
}

function countFertileTiles() {
  var fertileTiles = 0;

  for (var i = 0; i < world.terrain.length; i++) {
    if (world.terrain[i] === CONFIG.TERRAIN_FERTILE) {
      fertileTiles++;
    }
  }

  return fertileTiles;
}

function applySaveConfig(saveConfig) {
  PS.systems.persistenceConfig.apply(saveConfig);
}
