const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const browserHelperPath = path.join(root, "tests", "helpers", "persistence-parity-browser.js");
const browserHelperSource = fs.readFileSync(browserHelperPath, "utf8");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png"
};

function getContentType(filePath) {
  return contentTypes[path.extname(filePath)] || "application/octet-stream";
}

function createStaticServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const fullPath = path.join(root, relativePath);

    if (!fullPath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(fullPath, (error, data) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500);
        response.end(error.code || "Error");
        return;
      }

      response.writeHead(200, { "Content-Type": getContentType(fullPath) });
      response.end(data);
    });
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function trackBrowserErrors(page) {
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  return { consoleErrors, pageErrors };
}

async function openPersistencePage(browser, baseUrl) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.ensureOrganismLineage = window.ensureOrganismLineage || function(organism) {
      return Math.max(1, Math.round(Number(organism && organism.lineageId) || 1));
    };
    window.ensureOrganismTraits = window.ensureOrganismTraits || function(organism) {
      return organism && organism.traits ? organism.traits : {};
    };
    window.normalizeLongitude = window.normalizeLongitude || function(longitude) {
      const value = Number(longitude) || 0;
      return ((value + 180) % 360 + 360) % 360 - 180;
    };
  });
  await page.goto(baseUrl + "/index.html", { waitUntil: "load" });
  await page.waitForFunction(
    () => window.world &&
      window.PS &&
      window.PS.persistence &&
      typeof window.makeOrganism === "function" &&
      typeof window.normalizeOrganismTraits === "function",
    null,
    { timeout: 10000 }
  );

  return page;
}

function collectPersistenceEvidence(page) {
  return page.evaluate((source) => {
    eval(source);
    return window.__pixeldariumPersistenceParity.collectEvidence();
  }, browserHelperSource);
}

function assertNoBrowserErrors(consoleErrors, pageErrors) {
  assert.deepStrictEqual(consoleErrors, [], "browser console should have no errors");
  assert.deepStrictEqual(pageErrors, [], "browser page should have no errors");
}

function assertSaveEnvelope(evidence) {
  assert.strictEqual(evidence.saveData.id, "latest", "save id should use latest key");
  assert.strictEqual(evidence.saveData.version, 3, "save version should remain current");
  assert.strictEqual(evidence.saveData.terrainTileIds.length, evidence.saveData.terrain.length, "save should include terrain tile ids");
  assert.strictEqual(evidence.saveData.worldWidth, 320, "metadata should preserve world width");
  assert.strictEqual(evidence.saveData.worldHeight, 170, "metadata should preserve world height");
  assert.strictEqual(evidence.saveData.tileSize, 5, "metadata should preserve tile size");
  assert.strictEqual(evidence.saveData.subsystems.meta.tick, evidence.saveData.tick, "subsystem save metadata should mirror legacy tick");
  assert.strictEqual(evidence.saveData.subsystems.bio.organisms.length, evidence.saveData.organisms.length, "subsystem bio save should mirror organisms");
  assert.strictEqual(evidence.saveData.subsystems.civ.settlements.length, evidence.saveData.settlements.length, "subsystem civ save should mirror settlements");
  assert.strictEqual(evidence.saveData.subsystems.render.camera.zoomLevel, evidence.saveData.camera.zoomLevel, "subsystem render save should mirror camera");
  assert.strictEqual(evidence.saveData.subsystems.ui.timelineEvents.length, evidence.saveData.timelineEvents.length, "subsystem UI save should mirror timeline events");
  assert.strictEqual(evidence.exportData.tick, evidence.saveData.tick, "export should return the same save tick");
  assert.strictEqual(evidence.importedData.tick, evidence.saveData.tick, "JSON import should resolve imported save data");
  assert.strictEqual(evidence.importedEvidence.tick, 4242, "JSON import should restore tick");
  assert.strictEqual(evidence.saveData.deepTimeYears, 123456789, "deep time should serialize");
  assert.strictEqual(evidence.importedEvidence.deepTimeYears, 123456789, "deep time should restore");
  assert.strictEqual(evidence.importedEvidence.timeScale.targetYearsPerTick, 10000, "manual time scale should restore");
}

function assertWorldRoundTrip(evidence) {
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
}

function assertHistoryRoundTrip(evidence) {
  assert.strictEqual(evidence.saveData.timelineEvents.length, 1, "timeline events should serialize");
  assert.strictEqual(evidence.importedEvidence.timelineEvents[0].details.value, 1, "timeline events should restore details");
  assert.strictEqual(evidence.saveData.timelineEvents[0].id, 13, "timeline species event id should serialize");
  assert.strictEqual(evidence.importedEvidence.timelineEvents[0].cause, "geographic-isolation", "timeline species event cause should restore");
  assert.strictEqual(evidence.importedEvidence.timelineEvents[0].traits.bodySize, 1.5, "timeline species event traits should restore");
  assert.strictEqual(evidence.saveData.bookmarks.length, 1, "bookmarks should serialize");
  assert.strictEqual(evidence.saveData.subsystems.history.bookmarks[0].id, "B4", "subsystem history save should mirror bookmarks");
  assert.strictEqual(evidence.saveData.nextBookmarkId, 5, "bookmark counter should serialize");
  assert.strictEqual(evidence.saveData.subsystems.history.nextBookmarkId, 5, "subsystem history save should mirror bookmark counter");
  assert.strictEqual(evidence.importedEvidence.bookmarks[0].label, "First life marker", "bookmarks should restore labels");
  assert.strictEqual(evidence.importedEvidence.bookmarks[0].target.eventType, "life.first", "bookmark event target should restore");
  assert.strictEqual(evidence.importedEvidence.bookmarks[0].camera.latitude, 21.25, "bookmark camera should restore");
  assert.strictEqual(evidence.importedEvidence.nextBookmarkId, 5, "bookmark counter should restore");
  assert.strictEqual(evidence.importedEvidence.milestonesReached["life.first"].value, 1, "milestone fired state should restore");
}

function assertBiologyRoundTrip(evidence) {
  assert.strictEqual(evidence.saveData.nextSpeciesId, 18, "species counter should serialize");
  assert.strictEqual(evidence.saveData.nextBiologyPopulationId, 19, "biology population counter should serialize");
  assert.ok(evidence.saveData.nextBiologyRepresentativeId >= 20, "biology representative counter should serialize past restored records");
  assert.ok(evidence.importedEvidence.nextSpeciesId >= 18, "species counter should advance past restored records");
  assert.ok(evidence.importedEvidence.nextBiologyPopulationId >= 19, "population counter should advance past restored records");
  assert.ok(evidence.importedEvidence.nextBiologyRepresentativeId >= 20, "representative counter should advance past restored records");
  assert.strictEqual(evidence.saveData.biologyPopulations[0].id, 17, "biology populations should serialize");
  assert.strictEqual(evidence.importedEvidence.biologyPopulations[0].traitMean.bodySize, 1.4, "biology populations should restore trait means");
  assert.strictEqual(evidence.saveData.species[0].parentId, 5, "species parent id should serialize");
  assert.strictEqual(evidence.importedEvidence.species[0].cause, "geographic-isolation", "species records should restore");
  assert.deepStrictEqual(evidence.importedEvidence.speciesByIdKeys, ["13"], "species index should rebuild");
  assert.strictEqual(evidence.importedEvidence.speciationEvents[0].id, 13, "speciation event history should restore");
  assert.strictEqual(evidence.saveData.extinctionEvents[0].eventType, "volcanic-winter", "extinction event history should serialize");
  assert.strictEqual(evidence.importedEvidence.extinctionEvents[0].losses.total, 55, "extinction event history should restore losses");
  assert.strictEqual(evidence.importedEvidence.massExtinction.recoveryWindow.endTick, 5100, "active extinction recovery window should restore");
  assert.deepStrictEqual(evidence.importedEvidence.biologyPopulationByIdKeys, ["17"], "biology population index should rebuild");
  assert.strictEqual(evidence.saveData.biologyRepresentatives[0].id, 19, "biology representatives should serialize");
  assert.strictEqual(evidence.importedEvidence.biologyRepresentatives[0].target.type, "food", "biology representatives should restore target data");
  assert.deepStrictEqual(evidence.importedEvidence.biologyRepresentativeByIdKeys, ["19"], "biology representative index should rebuild");
  assert.strictEqual(evidence.saveData.trackedLineage.speciesId, 13, "tracked lineage should serialize");
  assert.strictEqual(evidence.saveData.subsystems.bio.trackedLineage.lineageId, 7, "subsystem bio save should mirror tracked lineage");
  assert.strictEqual(evidence.importedEvidence.trackedLineage.pinned, true, "tracked lineage pin should restore");
  assert.strictEqual(evidence.importedEvidence.trackedLineage.status, "active", "tracked lineage status should refresh after restore");
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
}

function assertProgressionAndLoad(evidence) {
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
}

function assertPersistenceParity(evidence, browserErrors) {
  assertNoBrowserErrors(browserErrors.consoleErrors, browserErrors.pageErrors);
  assertSaveEnvelope(evidence);
  assertWorldRoundTrip(evidence);
  assertHistoryRoundTrip(evidence);
  assertBiologyRoundTrip(evidence);
  assertProgressionAndLoad(evidence);
}

async function run() {
  const server = createStaticServer();
  const port = await listen(server);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await openPersistencePage(browser, "http://127.0.0.1:" + port);
    const browserErrors = trackBrowserErrors(page);
    const evidence = await collectPersistenceEvidence(page);

    assertPersistenceParity(evidence, browserErrors);
    console.log("persistence parity checks passed");
  } finally {
    await browser.close();
    await closeServer(server);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
