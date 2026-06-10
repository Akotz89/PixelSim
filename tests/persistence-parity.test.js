const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "load" });

  const evidence = await page.evaluate(async () => {
    function resetTestDatabase() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase("pixeldarium");

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error("Could not delete test database"));
        request.onblocked = () => resolve();
      });
    }

    function installRepresentativeWorldState() {
      world.isPaused = true;
      world.tick = 4242;
      world.deepTimeYears = 123456789;
      world.speed = 4;
      world.era = "Empire";
      world.seedText = "AZR-355-PARITY";
      world.rngState = 987654321;
      world.terrain = Array.from({ length: WORLD_WIDTH * WORLD_HEIGHT }, (_, index) => {
        return index % 7 === 0 ? CONFIG.TERRAIN_FERTILE : CONFIG.TERRAIN_BARREN;
      });
      world.planetView = {
        zoomLevel: 3.5,
        latitude: 21.25,
        longitude: -73.5,
        panEastMeters: 420,
        panNorthMeters: -155
      };
      world.nextLineageId = 12;
      world.nextSpeciesId = 18;
      world.nextBiologyPopulationId = 19;
      world.nextBiologyRepresentativeId = 20;
      world.nextSettlementId = 22;
      world.nextSettlementRouteId = 32;
      world.nextOrbitalAssetId = 42;
      world.nextPlanetaryBodyId = 52;
      world.nextProbeMissionId = 62;
      world.nextStarSystemId = 72;
      world.nextInterstellarFleetId = 82;
      world.nextEmpireSectorId = 92;
      world.totalBirths = 101;
      world.totalDeaths = 33;
      world.totalFoodSpawned = 700;
      world.totalFoodConsumed = 320;
      world.totalFoodHarvested = 95;
      world.colonyNetworkScore = 88;
      world.colonyNetworkColonies = 2;
      world.colonyNetworkActiveRoutes = 1;
      world.colonyNetworkClaimedTiles = 34;
      world.spaceProgramProgress = 0.82;
      world.orbitalLaunches = 3;
      world.lastSpaceProgramTick = 4000;
      world.spaceProgramReady = true;
      world.orbitalInfrastructureScore = 67;
      world.orbitalPlatformReady = true;
      world.planetarySurveyProgress = 0.74;
      world.planetarySurveyReady = true;
      world.lastPlanetarySurveyTick = 4050;
      world.probeMissionProgress = 0.66;
      world.probeMissionReady = true;
      world.lastProbeMissionTick = 4100;
      world.starMapProgress = 0.58;
      world.starMapReady = true;
      world.lastStarMapTick = 4150;
      world.galacticInfluenceProgress = 0.49;
      world.galacticInfluenceReady = true;
      world.galacticClaimedSystems = 4;
      world.lastGalacticInfluenceTick = 4180;
      world.interstellarFleetProgress = 0.35;
      world.interstellarFleetReady = true;
      world.interstellarFleetActive = 1;
      world.interstellarFleetCompleted = 2;
      world.lastInterstellarFleetTick = 4200;
      world.empireSectorProgress = 0.27;
      world.empireSectorReady = true;
      world.empireSectorCount = 2;
      world.lastEmpireSectorTick = 4210;
      world.empireLegacyProgress = 0.19;
      world.empireLegacyLevel = 1;
      world.empireLegacyReady = true;
      world.empireLegacyComplete = false;
      world.lastEmpireLegacyTick = 4220;
      world.lineages = {
        "7": {
          id: 7,
          parentId: 0,
          createdTick: 100,
          founderGeneration: 2,
          founderTraits: normalizeOrganismTraits({}),
          activeCount: 14,
          lastSeenTick: 4200,
          peakPopulation: 30,
          isExtinct: false
        }
      };
      world.biologyPopulations = [{
        id: 17,
        speciesId: 13,
        lineageId: 7,
        parentPopulationId: 0,
        count: 44,
        biomass: 120,
        energyReserve: 88,
        territoryCells: [{ x: 12, y: 9, density: 0.8 }],
        traitMean: { vision: 22, bodySize: 1.4 },
        traitVariance: { vision: 2, bodySize: 0.1 },
        pressure: { food: 0.3, terrain: 0.2 },
        representativeIds: [19],
        createdTick: 250,
        lastUpdatedTick: 4240
      }];
      world.biologyPopulationById = { "17": world.biologyPopulations[0] };
      world.biologyRepresentatives = [{
        id: 19,
        populationId: 17,
        speciesId: 13,
        lineageId: 7,
        x: 12,
        y: 9,
        latitude: 21.2,
        longitude: -73.4,
        energy: 150,
        age: 12,
        behavior: "forage",
        target: { type: "food", x: 13, y: 9 },
        traits: { vision: 22, bodySize: 1.4 },
        history: [{ tick: 4238, label: "sampled" }],
        pinned: true,
        createdTick: 4200,
        lastSeenTick: 4240
      }];
      world.biologyRepresentativeById = { "19": world.biologyRepresentatives[0] };
      if (!Array.isArray(world.organisms) || world.organisms.length === 0) {
        const seededOrganism = makeOrganism(12, 9, 7);
        if (seededOrganism) {
          world.organisms = [seededOrganism];
        }
      }
      if (world.organisms[0]) {
        world.organisms[0].speciesId = 13;
        world.organisms[0].populationId = 17;
        world.organisms[0].representativeId = 19;
        world.organisms[0].traits.bodySize = 1.5;
        world.organisms[0].traits.limbCount = 6;
        world.organisms[0].traits.camouflage = 0.75;
        world.organisms[0].traits.carnivory = 0.6;
      }
      world.settlements = [{
        id: 21,
        lineageId: 7,
        x: 12,
        y: 9,
        foundedTick: 300,
        radius: CONFIG.SETTLEMENT_RADIUS,
        population: 44,
        foodStock: 80,
        storedFood: 95,
        development: 120,
        level: CONFIG.SETTLEMENT_COLONY_LEVEL,
        lastGrowthTick: 3900,
        influenceRadius: CONFIG.SETTLEMENT_INFLUENCE_BASE_RADIUS,
        claimedTiles: 10,
        claimedFood: 5,
        parentSettlementId: 0,
        isOutpost: true,
        isColony: true,
        lastOutpostTick: 3500,
        lastSupplyGrowthTick: 3700,
        isActive: true,
        lastActiveTick: 4240
      }];
      world.settlementRoutes = [{
        id: 31,
        parentSettlementId: 21,
        childSettlementId: 21,
        lineageId: 7,
        foundedTick: 3600,
        distance: 12,
        foodTransferred: 18,
        lastTransferTick: 4230,
        isActive: true
      }];
      world.orbitalAssets = [{
        id: 41,
        launchNumber: 3,
        launchedTick: 3900,
        infrastructureScore: 67,
        orbitAngle: 1.25,
        orbitBand: 2,
        isActive: true
      }];
      world.planetaryBodies = [{
        id: 51,
        name: "Test Moon",
        discoveredTick: 3960,
        surveyValue: 77,
        orbitAngle: 2.2,
        orbitRadius: 88,
        isSurveyed: true
      }];
      world.probeMissions = [{
        id: 61,
        targetBodyId: 51,
        launchedTick: 4000,
        arrivalTick: 4100,
        progress: 1,
        isComplete: true
      }];
      world.starSystems = [{
        id: 71,
        name: "S-Parity",
        discoveredTick: 4120,
        mapValue: 90,
        mapX: 0.25,
        mapY: -0.45,
        isMapped: true,
        influenceValue: 91,
        isClaimed: true,
        claimedTick: 4180
      }];
      world.interstellarFleets = [{
        id: 81,
        sourceSystemId: 71,
        targetSystemId: 71,
        launchedTick: 4190,
        arrivalTick: 4230,
        progress: 1,
        isComplete: true
      }];
      world.empireSectors = [{
        id: 91,
        systemId: 71,
        foundedTick: 4235,
        controlValue: 120,
        controlRadius: 0.3,
        isActive: true
      }];
      world.traitHistory = [{
        tick: 4200,
        population: 44,
        vision: CONFIG.TRAIT_VISION_DEFAULT,
        metabolism: CONFIG.TRAIT_METABOLISM_DEFAULT,
        reproductionEnergy: CONFIG.TRAIT_REPRODUCTION_ENERGY_DEFAULT,
        movementTendency: CONFIG.TRAIT_MOVEMENT_TENDENCY_DEFAULT,
        terrainAffinity: CONFIG.TRAIT_TERRAIN_AFFINITY_DEFAULT,
        carnivory: CONFIG.TRAIT_CARNIVORY_DEFAULT
      }];
      world.ecosystemHistory = [{
        tick: 4200,
        population: 44,
        food: 30,
        averageEnergy: 120,
        foodPerOrganism: 0.7,
        populationBalance: "growing",
        resourceBalance: "stable",
        foodNetThisTick: 3,
        foodRunwayTicks: 120,
        pressure: "balanced",
        stabilityScore: 85
      }];
      world.eventLog = [{
        tick: 4210,
        type: "empire",
        label: "Parity event",
        detail: "Persistence parity coverage"
      }];
      world.timelineEvents = [{
        tick: 4211,
        type: "life.first",
        label: "First life",
        detail: "organisms 1",
        details: { value: 1 },
        deepTime: { years: 123456789 },
        source: "milestone-detector",
        severity: "major"
      }];
      world.milestonesReached = {
        "life.first": {
          tick: 4211,
          value: 1
        }
      };
      world.geology = {
        ageTicks: 12,
        plates: [{ id: "plate-test", driftX: 1.25 }],
        volcanicActivity: 0.42,
        erosionSediment: 3.5,
        continentFormation: 0.18
      };
      world.atmosphere = {
        ageTicks: 14,
        gases: {
          co2: 0.12,
          o2: 0.2,
          n2: 0.67,
          ch4: 0.004,
          h2o: 0.005,
          o3: 0.001,
          sulfur: 0
        },
        oxygen: 0.2,
        temperatureC: 19.5,
        oxygenStress: 0
      };
      world.microbialReady = true;
      world.microbial = {
        model: "field-population-hybrid",
        ageTicks: 8,
        fieldWidth: 2,
        fieldHeight: 2,
        fields: {
          density: [0.1, 0.2, 0.3, 0.4],
          chemicalEnergy: [0.5, 0.6, 0.7, 0.8],
          oxygenProduction: [0.01, 0.02, 0.03, 0.04],
          stress: [0.1, 0.2, 0.3, 0.4],
          bloomIntensity: [0.2, 0.4, 0.6, 0.8]
        },
        populations: [{
          id: 5,
          name: "Microbial mat 5",
          lineageId: "microbial-5",
          x: 44,
          y: 22,
          bloomIntensity: 0.8,
          morphology: "mat",
          isVisible: true
        }],
        populationById: {
          "5": {
            id: 5,
            name: "Microbial mat 5"
          }
        },
        nextPopulationId: 6,
        visibleBlooms: [{
          id: 5,
          x: 44,
          y: 22,
          intensity: 0.8,
          morphology: "mat"
        }],
        selectedPrototype: "field-population-hybrid",
        totalDensity: 1,
        totalOxygenProduction: 0.1
      };
      if (PS.time) {
        PS.time.setManualTimeScale(2);
      }
    }

    await resetTestDatabase();
    installRepresentativeWorldState();
    window.drawWorld = function() {};

    const saveData = PS.persistence.createSaveData();
    const exportData = PS.persistence.exportJson();
    const file = new File([JSON.stringify(saveData)], "pixeldarium-parity.json", {
      type: "application/json"
    });

    world.tick = 1;
    world.planetView = { zoomLevel: 0, latitude: 0, longitude: 0, panEastMeters: 0, panNorthMeters: 0 };
    world.settlements = [];
    world.empireSectorCount = 0;

    const importedData = await PS.persistence.importJsonFile(file);
    const importedEvidence = {
      tick: world.tick,
      camera: Object.assign({}, world.planetView),
      settlementCount: world.settlements.length,
      settlement: Object.assign({}, world.settlements[0]),
      routeCount: world.settlementRoutes.length,
      orbitalAssets: world.orbitalAssets.length,
      planetaryBodies: world.planetaryBodies.length,
      probeMissions: world.probeMissions.length,
      starSystems: world.starSystems.length,
      interstellarFleets: world.interstellarFleets.length,
      empireSectors: world.empireSectors.length,
      progression: {
        colonyNetworkScore: world.colonyNetworkScore,
        spaceProgramReady: world.spaceProgramReady,
        orbitalPlatformReady: world.orbitalPlatformReady,
        planetarySurveyReady: world.planetarySurveyReady,
        probeMissionReady: world.probeMissionReady,
        starMapReady: world.starMapReady,
        galacticInfluenceReady: world.galacticInfluenceReady,
        interstellarFleetReady: world.interstellarFleetReady,
        empireSectorReady: world.empireSectorReady,
        empireLegacyReady: world.empireLegacyReady
      },
      deepTimeYears: world.deepTimeYears,
      timeScale: PS.time && PS.time.timeScale ? Object.assign({}, PS.time.timeScale) : null,
      timelineEvents: world.timelineEvents.slice(),
      milestonesReached: Object.assign({}, world.milestonesReached),
      biologyPopulations: world.biologyPopulations.slice(),
      biologyPopulationByIdKeys: Object.keys(world.biologyPopulationById),
      biologyRepresentatives: world.biologyRepresentatives.slice(),
      biologyRepresentativeByIdKeys: Object.keys(world.biologyRepresentativeById),
      microbial: Object.assign({}, world.microbial, {
        fields: Object.assign({}, world.microbial && world.microbial.fields),
        populations: world.microbial && world.microbial.populations ? world.microbial.populations.slice() : [],
        visibleBlooms: world.microbial && world.microbial.visibleBlooms ? world.microbial.visibleBlooms.slice() : []
      }),
      microbialReady: world.microbialReady,
      nextBiologyPopulationId: world.nextBiologyPopulationId,
      nextBiologyRepresentativeId: world.nextBiologyRepresentativeId,
      nextSpeciesId: world.nextSpeciesId,
      organismIdentity: world.organisms[0] ? {
        speciesId: world.organisms[0].speciesId,
        populationId: world.organisms[0].populationId,
        representativeId: world.organisms[0].representativeId,
        bodySize: world.organisms[0].traits.bodySize,
        limbCount: world.organisms[0].traits.limbCount,
        camouflage: world.organisms[0].traits.camouflage,
        carnivory: world.organisms[0].traits.carnivory
      } : null,
      geology: Object.assign({}, world.geology),
      atmosphere: Object.assign({}, world.atmosphere)
    };

    world.tick = 2;
    await PS.persistence.save();
    world.tick = 3;
    const loadedData = await PS.persistence.load();

    await resetTestDatabase();

    return {
      saveData,
      exportData,
      importedData,
      loadedData,
      importedEvidence,
      loadedTick: world.tick
    };
  });

  await browser.close();

  assert.deepStrictEqual(consoleErrors, [], "browser console should have no errors");
  assert.deepStrictEqual(pageErrors, [], "browser page should have no errors");
  assert.strictEqual(evidence.saveData.id, "latest", "save id should use latest key");
  assert.strictEqual(evidence.saveData.version, 3, "save version should remain current");
  assert.strictEqual(evidence.saveData.terrainTileIds.length, evidence.saveData.terrain.length, "save should include terrain tile ids");
  assert.strictEqual(evidence.saveData.worldWidth, 320, "metadata should preserve world width");
  assert.strictEqual(evidence.saveData.worldHeight, 170, "metadata should preserve world height");
  assert.strictEqual(evidence.saveData.tileSize, 5, "metadata should preserve tile size");
  assert.strictEqual(evidence.exportData.tick, evidence.saveData.tick, "export should return the same save tick");
  assert.strictEqual(evidence.importedData.tick, evidence.saveData.tick, "JSON import should resolve imported save data");
  assert.strictEqual(evidence.importedEvidence.tick, 4242, "JSON import should restore tick");
  assert.strictEqual(evidence.saveData.deepTimeYears, 123456789, "deep time should serialize");
  assert.strictEqual(evidence.importedEvidence.deepTimeYears, 123456789, "deep time should restore");
  assert.strictEqual(evidence.importedEvidence.timeScale.targetYearsPerTick, 10000, "manual time scale should restore");
  assert.strictEqual(evidence.importedEvidence.camera.zoomLevel, 3.5, "camera zoom should round-trip");
  assert.strictEqual(evidence.importedEvidence.camera.latitude, 21.25, "camera latitude should round-trip");
  assert.strictEqual(evidence.importedEvidence.camera.longitude, -73.5, "camera longitude should round-trip");
  assert.strictEqual(evidence.importedEvidence.camera.panEastMeters, 420, "camera east pan should round-trip");
  assert.strictEqual(evidence.importedEvidence.camera.panNorthMeters, -155, "camera north pan should round-trip");
  assert.strictEqual(evidence.importedEvidence.settlementCount, 1, "settlements should round-trip");
  assert.strictEqual(evidence.importedEvidence.settlement.id, 21, "settlement id should round-trip");
  assert.strictEqual(evidence.importedEvidence.settlement.lineageId, 7, "settlement lineage should round-trip");
  assert.strictEqual(evidence.importedEvidence.settlement.isColony, true, "settlement colony flag should round-trip");
  assert.strictEqual(evidence.importedEvidence.routeCount, 1, "settlement routes should round-trip");
  assert.strictEqual(evidence.importedEvidence.orbitalAssets, evidence.saveData.orbitalAssets.length, "orbital assets should round-trip");
  assert.strictEqual(evidence.importedEvidence.planetaryBodies, evidence.saveData.planetaryBodies.length, "planetary bodies should round-trip");
  assert.strictEqual(evidence.importedEvidence.probeMissions, evidence.saveData.probeMissions.length, "probe missions should round-trip");
  assert.strictEqual(evidence.importedEvidence.starSystems, evidence.saveData.starSystems.length, "star systems should round-trip");
  assert.strictEqual(evidence.importedEvidence.interstellarFleets, evidence.saveData.interstellarFleets.length, "interstellar fleets should round-trip");
  assert.strictEqual(evidence.importedEvidence.empireSectors, evidence.saveData.empireSectors.length, "empire sectors should round-trip");
  assert.strictEqual(evidence.saveData.geology.volcanicActivity, 0.42, "geology layer state should serialize");
  assert.strictEqual(evidence.importedEvidence.geology.continentFormation, 0.18, "geology layer state should restore");
  assert.strictEqual(evidence.saveData.atmosphere.gases.o2, 0.2, "atmosphere gas state should serialize");
  assert.strictEqual(evidence.importedEvidence.atmosphere.temperatureC, 19.5, "atmosphere layer state should restore");
  assert.strictEqual(evidence.saveData.microbial.model, "field-population-hybrid", "microbial model should serialize");
  assert.strictEqual(evidence.importedEvidence.microbial.fields.bloomIntensity[3], 0.8, "microbial fields should restore");
  assert.strictEqual(evidence.importedEvidence.microbial.populations[0].morphology, "mat", "microbial populations should restore");
  assert.strictEqual(evidence.importedEvidence.microbialReady, true, "microbial readiness should restore");
  assert.strictEqual(evidence.saveData.timelineEvents.length, 1, "timeline events should serialize");
  assert.strictEqual(evidence.importedEvidence.timelineEvents[0].details.value, 1, "timeline events should restore details");
  assert.strictEqual(evidence.importedEvidence.milestonesReached["life.first"].value, 1, "milestone fired state should restore");
  assert.strictEqual(evidence.saveData.nextSpeciesId, 18, "species counter should serialize");
  assert.strictEqual(evidence.saveData.nextBiologyPopulationId, 19, "biology population counter should serialize");
  assert.ok(evidence.saveData.nextBiologyRepresentativeId >= 20, "biology representative counter should serialize past restored records");
  assert.ok(evidence.importedEvidence.nextSpeciesId >= 18, "species counter should advance past restored records");
  assert.ok(evidence.importedEvidence.nextBiologyPopulationId >= 19, "population counter should advance past restored records");
  assert.ok(evidence.importedEvidence.nextBiologyRepresentativeId >= 20, "representative counter should advance past restored records");
  assert.strictEqual(evidence.saveData.biologyPopulations[0].id, 17, "biology populations should serialize");
  assert.strictEqual(evidence.importedEvidence.biologyPopulations[0].traitMean.bodySize, 1.4, "biology populations should restore trait means");
  assert.deepStrictEqual(evidence.importedEvidence.biologyPopulationByIdKeys, ["17"], "biology population index should rebuild");
  assert.strictEqual(evidence.saveData.biologyRepresentatives[0].id, 19, "biology representatives should serialize");
  assert.strictEqual(evidence.importedEvidence.biologyRepresentatives[0].target.type, "food", "biology representatives should restore target data");
  assert.deepStrictEqual(evidence.importedEvidence.biologyRepresentativeByIdKeys, ["19"], "biology representative index should rebuild");
  assert.strictEqual(evidence.saveData.organisms[0].speciesId, 13, "organism species id should serialize");
  assert.strictEqual(evidence.saveData.organisms[0].populationId, 17, "organism population id should serialize");
  assert.strictEqual(evidence.saveData.organisms[0].representativeId, 19, "organism representative id should serialize");
  assert.strictEqual(evidence.importedEvidence.organismIdentity.speciesId, 13, "organism species id should restore");
  assert.strictEqual(evidence.importedEvidence.organismIdentity.populationId, 17, "organism population id should restore");
  assert.strictEqual(evidence.importedEvidence.organismIdentity.representativeId, 19, "organism representative id should restore");
  assert.strictEqual(evidence.importedEvidence.organismIdentity.bodySize, 1.5, "organism body size should restore");
  assert.strictEqual(evidence.importedEvidence.organismIdentity.limbCount, 6, "organism limb count should restore");
  assert.strictEqual(evidence.importedEvidence.organismIdentity.camouflage, 0.75, "organism camouflage should restore");
  assert.ok(
    Math.abs(evidence.importedEvidence.organismIdentity.carnivory - 0.6) < 0.0001,
    "organism carnivory should restore"
  );
  assert.ok(Number.isFinite(evidence.saveData.colonyNetworkScore), "colony score should serialize");
  assert.ok(evidence.importedEvidence.progression.colonyNetworkScore > 0, "colony score should restore to an active progression state");
  [
    "spaceProgramReady",
    "orbitalPlatformReady",
    "planetarySurveyReady",
    "probeMissionReady",
    "starMapReady",
    "galacticInfluenceReady",
    "interstellarFleetReady",
    "empireSectorReady",
    "empireLegacyReady"
  ].forEach((field) => {
    assert.strictEqual(typeof evidence.saveData[field], "boolean", field + " should serialize as a boolean");
    assert.strictEqual(typeof evidence.importedEvidence.progression[field], "boolean", field + " should restore as a boolean");
  });
  assert.strictEqual(evidence.importedEvidence.progression.spaceProgramReady, true, "space readiness should restore active");
  assert.strictEqual(evidence.loadedData.tick, 2, "IndexedDB load should resolve saved data");
  assert.strictEqual(evidence.loadedTick, 2, "IndexedDB load should apply saved data");

  console.log("persistence parity checks passed");
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
