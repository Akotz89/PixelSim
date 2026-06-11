"use strict";
function getProbeMissionsForSave() {
  if (!Array.isArray(world.probeMissions)) {
    return [];
  }

  return world.probeMissions.map(copyProbeMissionForSave);
}

function getStarSystemsForSave() {
  if (!Array.isArray(world.starSystems)) {
    return [];
  }

  return world.starSystems.map(copyStarSystemForSave);
}

function getInterstellarFleetsForSave() {
  if (!Array.isArray(world.interstellarFleets)) {
    return [];
  }

  return world.interstellarFleets.map(copyInterstellarFleetForSave);
}

function getEmpireSectorsForSave() {
  if (!Array.isArray(world.empireSectors)) {
    return [];
  }

  return world.empireSectors.map(copyEmpireSectorForSave);
}

function copyCameraForSave() {
  var view = typeof getPlanetView === "function"
    ? getPlanetView()
    : (world.planetView || {});

  return {
    zoomLevel: Number(view.zoomLevel) || 0,
    latitude: clamp(Number(view.latitude) || 0, -90, 90),
    longitude: normalizeLongitude(view.longitude),
    panEastMeters: Number(view.panEastMeters) || 0,
    panNorthMeters: Number(view.panNorthMeters) || 0
  };
}

function copyLayerStateForSave(layerState) {
  if (!layerState) {
    return null;
  }

  return clonePersistencePlainValue(layerState);
}

function createSaveConfigDelta() {
  return PS.systems.persistenceConfig.createDelta();
}

function createWorldSubsystemSaveData() {
  return {
    meta: {
      tick: world.tick,
      deepTimeYears: Math.max(0, Number(world.deepTimeYears) || 0),
      timeScale: PS.time && PS.time.timeScale ? copyLayerStateForSave(PS.time.timeScale) : null,
      speed: world.speed,
      era: world.era,
      isExtinct: Boolean(world.isExtinct),
      extinctionTick: Math.max(0, Math.round(Number(world.extinctionTick) || 0)),
      seedText: normalizeSeedText(world.seedText),
      rngState: Math.max(1, Math.round(Number(world.rngState) || 1)) >>> 0
    },
    bio: {
      nextLineageId: world.nextLineageId,
      nextSpeciesId: Math.max(1, Math.round(Number(world.nextSpeciesId) || 1)),
      nextBiologyPopulationId: Math.max(1, Math.round(Number(world.nextBiologyPopulationId) || 1)),
      nextBiologyRepresentativeId: Math.max(1, Math.round(Number(world.nextBiologyRepresentativeId) || 1)),
      organisms: world.organisms.map(copyOrganismForSave),
      food: world.food.map(copyFoodForSave),
      lineages: getLineagesForSave(),
      species: copyLayerStateForSave(Array.isArray(world.species) ? world.species : []),
      speciationEvents: copyLayerStateForSave(Array.isArray(world.speciationEvents) ? world.speciationEvents : []),
      biologyPopulations: copyLayerStateForSave(Array.isArray(world.biologyPopulations) ? world.biologyPopulations : []),
      biologyRepresentatives: copyLayerStateForSave(Array.isArray(world.biologyRepresentatives) ? world.biologyRepresentatives : []),
      abiogenesis: copyLayerStateForSave(world.abiogenesis),
      microbial: copyLayerStateForSave(world.microbial),
      microbialReady: Boolean(world.microbialReady)
    },
    civ: {
      nextSettlementId: world.nextSettlementId,
      nextSettlementRouteId: world.nextSettlementRouteId,
      nextOrbitalAssetId: Math.max(1, Math.round(Number(world.nextOrbitalAssetId) || 1)),
      nextPlanetaryBodyId: Math.max(1, Math.round(Number(world.nextPlanetaryBodyId) || 1)),
      nextProbeMissionId: Math.max(1, Math.round(Number(world.nextProbeMissionId) || 1)),
      nextStarSystemId: Math.max(1, Math.round(Number(world.nextStarSystemId) || 1)),
      nextInterstellarFleetId: Math.max(1, Math.round(Number(world.nextInterstellarFleetId) || 1)),
      nextEmpireSectorId: Math.max(1, Math.round(Number(world.nextEmpireSectorId) || 1)),
      colonyNetworkScore: Math.max(0, Math.round(Number(world.colonyNetworkScore) || 0)),
      colonyNetworkColonies: Math.max(0, Math.round(Number(world.colonyNetworkColonies) || 0)),
      colonyNetworkActiveRoutes: Math.max(0, Math.round(Number(world.colonyNetworkActiveRoutes) || 0)),
      colonyNetworkClaimedTiles: Math.max(0, Math.round(Number(world.colonyNetworkClaimedTiles) || 0)),
      settlements: getSettlementsForSave(),
      settlementRoutes: getSettlementRoutesForSave(),
      orbitalAssets: getOrbitalAssetsForSave(),
      planetaryBodies: getPlanetaryBodiesForSave(),
      probeMissions: getProbeMissionsForSave(),
      starSystems: getStarSystemsForSave(),
      interstellarFleets: getInterstellarFleetsForSave(),
      empireSectors: getEmpireSectorsForSave()
    },
    render: {
      camera: copyCameraForSave()
    },
    ui: {
      eventLog: (Array.isArray(world.eventLog) ? world.eventLog : []).map(copySimulationEventForSave),
      timelineEvents: (Array.isArray(world.timelineEvents) ? world.timelineEvents : []).map(copySimulationEventForSave),
      activeObservationOverlay: world.activeObservationOverlay || "none"
    },
    history: {
      traitHistory: world.traitHistory.map(copyTraitHistorySampleForSave),
      ecosystemHistory: (Array.isArray(world.ecosystemHistory) ? world.ecosystemHistory : []).map(copyEcosystemHistorySampleForSave),
      milestonesReached: copyLayerStateForSave(world.milestonesReached || {})
    }
  };
}

function createWorldSaveData() {
  return {
    id: PIXELDARIUM_SAVE_ID,
    version: PIXELDARIUM_SAVE_VERSION,
    savedAt: new Date().toISOString(),
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    tileSize: CONFIG.TILE_SIZE,
    subsystems: createWorldSubsystemSaveData(),
    tick: world.tick,
    deepTimeYears: Math.max(0, Number(world.deepTimeYears) || 0),
    timeScale: PS.time && PS.time.timeScale ? copyLayerStateForSave(PS.time.timeScale) : null,
    speed: world.speed,
    era: world.era,
    isExtinct: Boolean(world.isExtinct),
    extinctionTick: Math.max(0, Math.round(Number(world.extinctionTick) || 0)),
    totalBirths: Math.max(0, Math.round(Number(world.totalBirths) || 0)),
    totalDeaths: Math.max(0, Math.round(Number(world.totalDeaths) || 0)),
    totalFoodSpawned: Math.max(0, Math.round(Number(world.totalFoodSpawned) || 0)),
    totalFoodConsumed: Math.max(0, Math.round(Number(world.totalFoodConsumed) || 0)),
    totalFoodHarvested: Math.max(0, Math.round(Number(world.totalFoodHarvested) || 0)),
    seedText: normalizeSeedText(world.seedText),
    rngState: Math.max(1, Math.round(Number(world.rngState) || 1)) >>> 0,
    nextLineageId: world.nextLineageId,
    nextSpeciesId: Math.max(1, Math.round(Number(world.nextSpeciesId) || 1)),
    nextBiologyPopulationId: Math.max(1, Math.round(Number(world.nextBiologyPopulationId) || 1)),
    nextBiologyRepresentativeId: Math.max(1, Math.round(Number(world.nextBiologyRepresentativeId) || 1)),
    nextSettlementId: world.nextSettlementId,
    nextSettlementRouteId: world.nextSettlementRouteId,
    nextOrbitalAssetId: Math.max(1, Math.round(Number(world.nextOrbitalAssetId) || 1)),
    nextPlanetaryBodyId: Math.max(1, Math.round(Number(world.nextPlanetaryBodyId) || 1)),
    nextProbeMissionId: Math.max(1, Math.round(Number(world.nextProbeMissionId) || 1)),
    nextStarSystemId: Math.max(1, Math.round(Number(world.nextStarSystemId) || 1)),
    colonyNetworkScore: Math.max(0, Math.round(Number(world.colonyNetworkScore) || 0)),
    colonyNetworkColonies: Math.max(0, Math.round(Number(world.colonyNetworkColonies) || 0)),
    colonyNetworkActiveRoutes: Math.max(0, Math.round(Number(world.colonyNetworkActiveRoutes) || 0)),
    colonyNetworkClaimedTiles: Math.max(0, Math.round(Number(world.colonyNetworkClaimedTiles) || 0)),
    spaceProgramProgress: Math.max(0, Number(world.spaceProgramProgress) || 0),
    orbitalLaunches: Math.max(0, Math.round(Number(world.orbitalLaunches) || 0)),
    lastSpaceProgramTick: Math.max(0, Math.round(Number(world.lastSpaceProgramTick) || 0)),
    spaceProgramReady: Boolean(world.spaceProgramReady),
    orbitalInfrastructureScore: Math.max(0, Math.round(Number(world.orbitalInfrastructureScore) || 0)),
    orbitalPlatformReady: Boolean(world.orbitalPlatformReady),
    planetarySurveyProgress: Math.max(0, Number(world.planetarySurveyProgress) || 0),
    planetarySurveyReady: Boolean(world.planetarySurveyReady),
    lastPlanetarySurveyTick: Math.max(0, Math.round(Number(world.lastPlanetarySurveyTick) || 0)),
    probeMissionProgress: Math.max(0, Number(world.probeMissionProgress) || 0),
    probeMissionReady: Boolean(world.probeMissionReady),
    lastProbeMissionTick: Math.max(0, Math.round(Number(world.lastProbeMissionTick) || 0)),
    starMapProgress: Math.max(0, Number(world.starMapProgress) || 0),
    starMapReady: Boolean(world.starMapReady),
    lastStarMapTick: Math.max(0, Math.round(Number(world.lastStarMapTick) || 0)),
    galacticInfluenceProgress: Math.max(0, Number(world.galacticInfluenceProgress) || 0),
    galacticInfluenceReady: Boolean(world.galacticInfluenceReady),
    galacticClaimedSystems: Math.max(0, Math.round(Number(world.galacticClaimedSystems) || 0)),
    lastGalacticInfluenceTick: Math.max(0, Math.round(Number(world.lastGalacticInfluenceTick) || 0)),
    nextInterstellarFleetId: Math.max(1, Math.round(Number(world.nextInterstellarFleetId) || 1)),
    interstellarFleetProgress: Math.max(0, Number(world.interstellarFleetProgress) || 0),
    interstellarFleetReady: Boolean(world.interstellarFleetReady),
    interstellarFleetActive: Math.max(0, Math.round(Number(world.interstellarFleetActive) || 0)),
    interstellarFleetCompleted: Math.max(0, Math.round(Number(world.interstellarFleetCompleted) || 0)),
    lastInterstellarFleetTick: Math.max(0, Math.round(Number(world.lastInterstellarFleetTick) || 0)),
    nextEmpireSectorId: Math.max(1, Math.round(Number(world.nextEmpireSectorId) || 1)),
    empireSectorProgress: Math.max(0, Number(world.empireSectorProgress) || 0),
    empireSectorReady: Boolean(world.empireSectorReady),
    empireSectorCount: Math.max(0, Math.round(Number(world.empireSectorCount) || 0)),
    lastEmpireSectorTick: Math.max(0, Math.round(Number(world.lastEmpireSectorTick) || 0)),
    empireLegacyProgress: Math.max(0, Number(world.empireLegacyProgress) || 0),
    empireLegacyLevel: Math.max(0, Math.round(Number(world.empireLegacyLevel) || 0)),
    empireLegacyReady: Boolean(world.empireLegacyReady),
    empireLegacyComplete: Boolean(world.empireLegacyComplete),
    lastEmpireLegacyTick: Math.max(0, Math.round(Number(world.lastEmpireLegacyTick) || 0)),
    geology: copyLayerStateForSave(world.geology),
    atmosphere: copyLayerStateForSave(world.atmosphere),
    abiogenesis: copyLayerStateForSave(world.abiogenesis),
    microbial: copyLayerStateForSave(world.microbial),
    microbialReady: Boolean(world.microbialReady),
    config: createSaveConfigDelta(),
    terrain: world.terrain.slice(),
    terrainTileIds: getTerrainTileIdsForSave(world.terrain),
    food: world.food.map(copyFoodForSave),
    biologyPopulations: copyLayerStateForSave(Array.isArray(world.biologyPopulations) ? world.biologyPopulations : []),
    biologyRepresentatives: copyLayerStateForSave(
      Array.isArray(world.biologyRepresentatives) ? world.biologyRepresentatives : []
    ),
    species: copyLayerStateForSave(Array.isArray(world.species) ? world.species : []),
    speciationEvents: copyLayerStateForSave(Array.isArray(world.speciationEvents) ? world.speciationEvents : []),
    camera: copyCameraForSave(),
    organisms: world.organisms.map(copyOrganismForSave),
    traitHistory: world.traitHistory.map(copyTraitHistorySampleForSave),
    ecosystemHistory: (Array.isArray(world.ecosystemHistory) ? world.ecosystemHistory : []).map(copyEcosystemHistorySampleForSave),
    eventLog: (Array.isArray(world.eventLog) ? world.eventLog : []).map(copySimulationEventForSave),
    timelineEvents: (Array.isArray(world.timelineEvents) ? world.timelineEvents : []).map(copySimulationEventForSave),
    milestonesReached: copyLayerStateForSave(world.milestonesReached || {}),
    lineages: getLineagesForSave(),
    settlements: getSettlementsForSave(),
    settlementRoutes: getSettlementRoutesForSave(),
    orbitalAssets: getOrbitalAssetsForSave(),
    planetaryBodies: getPlanetaryBodiesForSave(),
    probeMissions: getProbeMissionsForSave(),
    starSystems: getStarSystemsForSave(),
    interstellarFleets: getInterstellarFleetsForSave(),
    empireSectors: getEmpireSectorsForSave()
  };
}
