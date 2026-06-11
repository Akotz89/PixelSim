"use strict";
function applySubsystemSaveFallbacks(saveData) {
  var source = saveData || {};
  var subsystems = source.subsystems || {};
  var meta = subsystems.meta || {};
  var bio = subsystems.bio || {};
  var civ = subsystems.civ || {};
  var render = subsystems.render || {};
  var ui = subsystems.ui || {};
  var history = subsystems.history || {};

  function fallback(key, value) {
    if (source[key] === undefined && value !== undefined) {
      source[key] = value;
    }
  }

  fallback("tick", meta.tick);
  fallback("deepTimeYears", meta.deepTimeYears);
  fallback("timeScale", meta.timeScale);
  fallback("speed", meta.speed);
  fallback("era", meta.era);
  fallback("isExtinct", meta.isExtinct);
  fallback("extinctionTick", meta.extinctionTick);
  fallback("seedText", meta.seedText);
  fallback("rngState", meta.rngState);
  fallback("nextLineageId", bio.nextLineageId);
  fallback("nextSpeciesId", bio.nextSpeciesId);
  fallback("nextBiologyPopulationId", bio.nextBiologyPopulationId);
  fallback("nextBiologyRepresentativeId", bio.nextBiologyRepresentativeId);
  fallback("organisms", bio.organisms);
  fallback("food", bio.food);
  fallback("lineages", bio.lineages);
  fallback("species", bio.species);
  fallback("speciationEvents", bio.speciationEvents);
  fallback("massExtinction", bio.massExtinction);
  fallback("extinctionEvents", bio.extinctionEvents);
  fallback("biologyPopulations", bio.biologyPopulations);
  fallback("biologyRepresentatives", bio.biologyRepresentatives);
  fallback("trackedLineage", bio.trackedLineage);
  fallback("abiogenesis", bio.abiogenesis);
  fallback("microbial", bio.microbial);
  fallback("microbialReady", bio.microbialReady);
  fallback("nextSettlementId", civ.nextSettlementId);
  fallback("nextSettlementRouteId", civ.nextSettlementRouteId);
  fallback("nextOrbitalAssetId", civ.nextOrbitalAssetId);
  fallback("nextPlanetaryBodyId", civ.nextPlanetaryBodyId);
  fallback("nextProbeMissionId", civ.nextProbeMissionId);
  fallback("nextStarSystemId", civ.nextStarSystemId);
  fallback("nextInterstellarFleetId", civ.nextInterstellarFleetId);
  fallback("nextEmpireSectorId", civ.nextEmpireSectorId);
  fallback("colonyNetworkScore", civ.colonyNetworkScore);
  fallback("colonyNetworkColonies", civ.colonyNetworkColonies);
  fallback("colonyNetworkActiveRoutes", civ.colonyNetworkActiveRoutes);
  fallback("colonyNetworkClaimedTiles", civ.colonyNetworkClaimedTiles);
  fallback("settlements", civ.settlements);
  fallback("settlementRoutes", civ.settlementRoutes);
  fallback("orbitalAssets", civ.orbitalAssets);
  fallback("planetaryBodies", civ.planetaryBodies);
  fallback("probeMissions", civ.probeMissions);
  fallback("starSystems", civ.starSystems);
  fallback("interstellarFleets", civ.interstellarFleets);
  fallback("empireSectors", civ.empireSectors);
  fallback("camera", render.camera);
  fallback("eventLog", ui.eventLog);
  fallback("timelineEvents", ui.timelineEvents);
  fallback("traitHistory", history.traitHistory);
  fallback("ecosystemHistory", history.ecosystemHistory);
  fallback("milestonesReached", history.milestonesReached);

  return source;
}

function applyWorldSaveData(saveData) {
  var readySaveData = applySubsystemSaveFallbacks(PS.systems.saveMigration.migrate(saveData));

  validateWorldSaveData(readySaveData);
  saveData = readySaveData;
  applySaveConfig(saveData.config);

  world.tick = Number(saveData.tick);
  world.deepTimeYears = Math.max(0, restoreNumber(saveData.deepTimeYears, 0));
  if (PS.time && saveData.timeScale) {
    PS.time.timeScale = clonePersistencePlainValue(saveData.timeScale);
  }
  world.speed = clamp(Math.round(Number(saveData.speed)), 1, 10);
  world.era = String(saveData.era || "Organisms");
  if (PS.epochs) {
    PS.epochs.activeId = world.era;
  }
  world.isExtinct = Boolean(saveData.isExtinct);
  world.extinctionTick = Math.max(0, Math.round(restoreNumber(saveData.extinctionTick, 0)));
  world.birthsThisTick = 0;
  world.deathsThisTick = 0;
  world.populationDeltaThisTick = 0;
  world.totalBirths = Math.max(0, Math.round(restoreNumber(saveData.totalBirths, 0)));
  world.totalDeaths = Math.max(0, Math.round(restoreNumber(saveData.totalDeaths, 0)));
  world.foodSpawnedThisTick = 0;
  world.foodConsumedThisTick = 0;
  world.foodHarvestedThisTick = 0;
  world.totalFoodSpawned = Math.max(0, Math.round(restoreNumber(saveData.totalFoodSpawned, 0)));
  world.totalFoodConsumed = Math.max(0, Math.round(restoreNumber(saveData.totalFoodConsumed, 0)));
  world.totalFoodHarvested = Math.max(0, Math.round(restoreNumber(saveData.totalFoodHarvested, 0)));
  world.seedText = normalizeSeedText(saveData.seedText);
  world.rngState = Math.max(1, Math.round(restoreNumber(saveData.rngState, hashSeedText(world.seedText)))) >>> 0;
  world.prng = PS.core && typeof PS.core.createPRNG === "function"
    ? PS.core.createPRNG(world.seedText + ":restored:" + world.rngState)
    : null;
  restoreCameraState(saveData.camera);
  world.nextLineageId = Math.max(1, Math.round(restoreNumber(saveData.nextLineageId, 1)));
  world.nextSpeciesId = Math.max(1, Math.round(restoreNumber(saveData.nextSpeciesId, 1)));
  world.nextBiologyPopulationId = Math.max(1, Math.round(restoreNumber(saveData.nextBiologyPopulationId, 1)));
  world.nextBiologyRepresentativeId = Math.max(1, Math.round(restoreNumber(saveData.nextBiologyRepresentativeId, 1)));
  world.nextSettlementId = Math.max(1, Math.round(restoreNumber(saveData.nextSettlementId, 1)));
  world.nextSettlementRouteId = Math.max(1, Math.round(restoreNumber(saveData.nextSettlementRouteId, 1)));
  world.nextOrbitalAssetId = Math.max(1, Math.round(restoreNumber(saveData.nextOrbitalAssetId, 1)));
  world.nextPlanetaryBodyId = Math.max(1, Math.round(restoreNumber(saveData.nextPlanetaryBodyId, 1)));
  world.nextProbeMissionId = Math.max(1, Math.round(restoreNumber(saveData.nextProbeMissionId, 1)));
  world.nextStarSystemId = Math.max(1, Math.round(restoreNumber(saveData.nextStarSystemId, 1)));
  world.nextInterstellarFleetId = Math.max(1, Math.round(restoreNumber(saveData.nextInterstellarFleetId, 1)));
  world.nextEmpireSectorId = Math.max(1, Math.round(restoreNumber(saveData.nextEmpireSectorId, 1)));
  world.colonyNetworkScore = Math.max(0, Math.round(restoreNumber(saveData.colonyNetworkScore, 0)));
  world.colonyNetworkColonies = Math.max(0, Math.round(restoreNumber(saveData.colonyNetworkColonies, 0)));
  world.colonyNetworkActiveRoutes = Math.max(0, Math.round(restoreNumber(saveData.colonyNetworkActiveRoutes, 0)));
  world.colonyNetworkClaimedTiles = Math.max(0, Math.round(restoreNumber(saveData.colonyNetworkClaimedTiles, 0)));
  world.spaceProgramProgress = Math.max(0, restoreNumber(saveData.spaceProgramProgress, 0));
  world.orbitalLaunches = Math.max(0, Math.round(restoreNumber(saveData.orbitalLaunches, 0)));
  world.lastSpaceProgramTick = Math.max(0, Math.round(restoreNumber(saveData.lastSpaceProgramTick, 0)));
  world.spaceProgramReady = Boolean(saveData.spaceProgramReady);
  world.orbitalInfrastructureScore = Math.max(0, Math.round(restoreNumber(saveData.orbitalInfrastructureScore, 0)));
  world.orbitalPlatformReady = Boolean(saveData.orbitalPlatformReady);
  world.planetarySurveyProgress = Math.max(0, restoreNumber(saveData.planetarySurveyProgress, 0));
  world.planetarySurveyReady = Boolean(saveData.planetarySurveyReady);
  world.lastPlanetarySurveyTick = Math.max(0, Math.round(restoreNumber(saveData.lastPlanetarySurveyTick, 0)));
  world.probeMissionProgress = Math.max(0, restoreNumber(saveData.probeMissionProgress, 0));
  world.probeMissionReady = Boolean(saveData.probeMissionReady);
  world.lastProbeMissionTick = Math.max(0, Math.round(restoreNumber(saveData.lastProbeMissionTick, 0)));
  world.starMapProgress = Math.max(0, restoreNumber(saveData.starMapProgress, 0));
  world.starMapReady = Boolean(saveData.starMapReady);
  world.lastStarMapTick = Math.max(0, Math.round(restoreNumber(saveData.lastStarMapTick, 0)));
  world.galacticInfluenceProgress = Math.max(0, restoreNumber(saveData.galacticInfluenceProgress, 0));
  world.galacticInfluenceReady = Boolean(saveData.galacticInfluenceReady);
  world.galacticClaimedSystems = Math.max(0, Math.round(restoreNumber(saveData.galacticClaimedSystems, 0)));
  world.lastGalacticInfluenceTick = Math.max(0, Math.round(restoreNumber(saveData.lastGalacticInfluenceTick, 0)));
  world.interstellarFleetProgress = Math.max(0, restoreNumber(saveData.interstellarFleetProgress, 0));
  world.interstellarFleetReady = Boolean(saveData.interstellarFleetReady);
  world.interstellarFleetActive = Math.max(0, Math.round(restoreNumber(saveData.interstellarFleetActive, 0)));
  world.interstellarFleetCompleted = Math.max(0, Math.round(restoreNumber(saveData.interstellarFleetCompleted, 0)));
  world.lastInterstellarFleetTick = Math.max(0, Math.round(restoreNumber(saveData.lastInterstellarFleetTick, 0)));
  world.empireSectorProgress = Math.max(0, restoreNumber(saveData.empireSectorProgress, 0));
  world.empireSectorReady = Boolean(saveData.empireSectorReady);
  world.empireSectorCount = Math.max(0, Math.round(restoreNumber(saveData.empireSectorCount, 0)));
  world.lastEmpireSectorTick = Math.max(0, Math.round(restoreNumber(saveData.lastEmpireSectorTick, 0)));
  world.empireLegacyProgress = Math.max(0, restoreNumber(saveData.empireLegacyProgress, 0));
  world.empireLegacyLevel = Math.max(0, Math.round(restoreNumber(saveData.empireLegacyLevel, 0)));
  world.empireLegacyReady = Boolean(saveData.empireLegacyReady);
  world.empireLegacyComplete = Boolean(saveData.empireLegacyComplete);
  world.lastEmpireLegacyTick = Math.max(0, Math.round(restoreNumber(saveData.lastEmpireLegacyTick, 0)));
  world.geology = saveData.geology ? clonePersistencePlainValue(saveData.geology) : null;
  world.atmosphere = saveData.atmosphere ? clonePersistencePlainValue(saveData.atmosphere) : null;
  world.abiogenesis = saveData.abiogenesis ? clonePersistencePlainValue(saveData.abiogenesis) : null;
  world.microbial = saveData.microbial ? clonePersistencePlainValue(saveData.microbial) : null;
  world.microbialReady = Boolean(saveData.microbialReady || (world.microbial && world.microbial.totalDensity > 0.1));
  restoreBiologyAggregateState(saveData);
  world.trackedLineage = saveData.trackedLineage ? clonePersistencePlainValue(saveData.trackedLineage) : null;
  world.lineages = restoreLineages(saveData.lineages);
  world.species = Array.isArray(saveData.species) ? clonePersistencePlainValue(saveData.species) : [];
  world.speciesById = {};
  for (var speciesIndex = 0; speciesIndex < world.species.length; speciesIndex++) {
    var speciesRecord = world.species[speciesIndex] || {};
    var speciesId = Math.max(1, Math.round(restoreNumber(speciesRecord.id, speciesIndex + 1)));
    speciesRecord.id = speciesId;
    world.speciesById[String(speciesId)] = speciesRecord;
    world.nextSpeciesId = Math.max(world.nextSpeciesId, speciesId + 1);
  }
  world.speciationEvents = Array.isArray(saveData.speciationEvents) ? clonePersistencePlainValue(saveData.speciationEvents) : [];
  world.massExtinction = saveData.massExtinction ? clonePersistencePlainValue(saveData.massExtinction) : null;
  world.extinctionEvents = Array.isArray(saveData.extinctionEvents) ? clonePersistencePlainValue(saveData.extinctionEvents) : [];
  world.settlements = restoreSettlements(saveData.settlements);
  world.settlementRoutes = restoreSettlementRoutes(saveData.settlementRoutes);
  rebuildSettlementIndexes();
  world.orbitalAssets = restoreOrbitalAssets(saveData.orbitalAssets);
  world.planetaryBodies = restorePlanetaryBodies(saveData.planetaryBodies);
  rebuildPlanetaryBodyIndexes();
  world.probeMissions = restoreProbeMissions(saveData.probeMissions);
  world.starSystems = restoreStarSystems(saveData.starSystems);
  rebuildStarSystemIndexes();
  world.interstellarFleets = restoreInterstellarFleets(saveData.interstellarFleets);
  world.empireSectors = restoreEmpireSectors(saveData.empireSectors);
  rebuildEmpireSectorIndexes();
  world.terrain = saveData.terrain.slice();
  world.fertileTiles = countFertileTiles();

  if (PS.pools && typeof PS.pools.reset === "function") {
    PS.pools.reset();
  }

  world.food = saveData.food.map(restoreFood);
  rebuildFoodPositions();
  world.organisms = saveData.organisms.map(restoreOrganism).filter(Boolean);
  refreshLineageRegistry();
  world.isExtinct = world.organisms.length === 0;

  if (world.isExtinct) {
    world.extinctionTick = Math.max(0, world.extinctionTick || world.tick);
    world.isPaused = true;
  } else {
    world.extinctionTick = 0;
  }

  if (typeof ensureOutpostRoutes === "function") {
    ensureOutpostRoutes();
  }

  world.traitHistory = restoreTraitHistory(saveData.traitHistory);
  world.ecosystemHistory = restoreEcosystemHistory(saveData.ecosystemHistory);
  world.eventLog = restoreSimulationEvents(saveData.eventLog);
  world.timelineEvents = restoreSimulationEvents(saveData.timelineEvents, 0);
  world.milestonesReached = saveData.milestonesReached ? clonePersistencePlainValue(saveData.milestonesReached) : {};
  world.ecosystemSummary = null;

  if (PS.sim && PS.sim.lineageTracking && typeof PS.sim.lineageTracking.update === "function") {
    PS.sim.lineageTracking.update(true);
  }

  if (typeof refreshEcosystemSummary === "function") {
    refreshEcosystemSummary();
  }

  world.interpolation = 0;
  world.fps = 0;
  world.tps = 0;
  world.updateMs = 0;
  world.drawMs = 0;
  world.maxUpdateMs = 0;
  world.maxDrawMs = 0;

  drawWorld();
  updateHud();
  return saveData;
}

function restoreCameraState(cameraState) {
  var maxZoom = typeof getPlanetZoomLevels === "function" ? getPlanetZoomLevels().length - 1 : 0;
  var camera = cameraState || {};

  world.planetView = {
    zoomLevel: clamp(restoreNumber(camera.zoomLevel, Number(CONFIG.PLANET_ZOOM_LEVEL) || 0), 0, Math.max(0, maxZoom)),
    latitude: clamp(restoreNumber(camera.latitude, Number(CONFIG.PLANET_VIEW_LATITUDE_DEG) || 0), -90, 90),
    longitude: normalizeLongitude(restoreNumber(camera.longitude, Number(CONFIG.PLANET_VIEW_LONGITUDE_DEG) || 0)),
    panEastMeters: restoreNumber(camera.panEastMeters, 0),
    panNorthMeters: restoreNumber(camera.panNorthMeters, 0)
  };
}

function loadWorldFromIndexedDB() {
  return openPixeldariumDatabase().then(function(db) {
    return new Promise(function(resolve, reject) {
      var transaction = db.transaction(PIXELDARIUM_SAVE_STORE, "readonly");
      var store = transaction.objectStore(PIXELDARIUM_SAVE_STORE);
      var request = store.get(PIXELDARIUM_SAVE_ID);

      request.onsuccess = function(event) {
        try {
          var saveData = event.target.result;
          var readySaveData = applyWorldSaveData(saveData);
          db.close();
          resolve(readySaveData);
        } catch (error) {
          db.close();
          reject(error);
        }
      };

      request.onerror = function() {
        db.close();
        reject(new Error(request.error ? request.error.message : "Could not load world"));
      };
    });
  });
}

function exportWorldToJsonFile() {
  var saveData = createWorldSaveData();
  var json = JSON.stringify(saveData, null, 2);
  var blob = new Blob([json], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");

  link.href = url;
  link.download = "pixeldarium-world-tick-" + world.tick + ".json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(function() {
    URL.revokeObjectURL(url);
  }, 0);

  return saveData;
}

function importWorldFromJsonFile(file) {
  return new Promise(function(resolve, reject) {
    if (!file) {
      reject(new Error("No JSON file selected"));
      return;
    }

    var reader = new FileReader();

    reader.onload = function(event) {
      try {
        var saveData = JSON.parse(event.target.result);
        var readySaveData = applyWorldSaveData(saveData);
        resolve(readySaveData);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = function() {
      reject(new Error(reader.error ? reader.error.message : "Could not read JSON file"));
    };

    reader.readAsText(file);
  });
}
