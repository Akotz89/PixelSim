const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  notifications: [],
  focusedTiles: [],
  focusedLocations: [],
  window: {
    addEventListener() {}
  },
  world: {
    tick: 88,
    deepTimeYears: 250000,
    eventLog: [],
    timelineEvents: [],
    milestonesReached: {},
    needsRender: false
  }
};

context.focusPlanetViewOnTile = function(x, y) {
  context.focusedTiles.push({ x, y });
};

context.focusPlanetViewOnLatLon = function(latitude, longitude) {
  context.focusedLocations.push({ latitude, longitude });
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/core/config.js",
  "js/core/assert.js",
  "js/core/event-types.js",
  "js/core/events.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

PS.ui = {
  notifications: {
    show: function(label, detail, level) {
      notifications.push({ label: label, detail: detail, level: level });
      return notifications[notifications.length - 1];
    }
  }
};

var contract = PS.events.getMilestoneContract();
["type", "label", "detail", "tick", "deepTime", "location", "source", "category", "severity", "inspectTarget", "watcher", "terrainDriver", "trait", "lineageId", "speciesId", "populationId", "pressure", "effect", "id", "parentId", "cause", "divergence", "traits", "eventType", "severityScore", "killRate", "prePopulation", "postPopulation", "affectedSpecies", "affectedPopulations", "survivors", "losses", "recoveryWindow", "survivorPopulationIds", "radiationCandidateIds", "durationTicks"].forEach(function(field) {
  assert.ok(contract.payloadFields.indexOf(field) >= 0, "contract should include " + field);
});
["eventLog", "timeline", "notification", "spotlight", "overlays"].forEach(function(route) {
  assert.ok(contract.watcherRoutes.indexOf(route) >= 0, "contract should include watcher route " + route);
});
["biology", "geology", "atmosphere", "civilization", "extinction"].forEach(function(category) {
  assert.ok(PS.events.getEventCategories().indexOf(category) >= 0, "event categories should include " + category);
});

var timelineOnly = PS.events.emitMilestone({
  type: "geology.test",
  label: "Geology test",
  detail: "timeline only",
  source: "geology",
  severity: "major",
  inspectTarget: { type: "tile", x: 4, y: 5 },
  terrainDriver: "mountain",
  trait: "thermalTolerance",
  lineageId: 7,
  speciesId: 8,
  populationId: 9,
  pressure: 0.73,
  effect: "survival-cost",
  id: 10,
  parentId: 6,
  cause: "geographic-isolation",
  divergence: 0.82,
  traits: { terrainAffinity: 0.4 },
  watcher: {
    eventLog: false,
    timeline: true,
    notification: true,
    spotlight: true,
    overlays: ["tectonics"]
  }
});

assert.strictEqual(timelineOnly.payload.category, "geology", "category should infer from source");
assert.strictEqual(world.eventLog.length, 0, "eventLog route should be independently optional");
assert.strictEqual(world.timelineEvents.length, 1, "timeline route should ingest event independently");
assert.strictEqual(world.timelineEvents[0].category, "geology", "timeline event should preserve category");
assert.strictEqual(world.timelineEvents[0].terrainDriver, "mountain", "timeline event should preserve terrain driver");
assert.strictEqual(world.timelineEvents[0].trait, "thermalTolerance", "timeline event should preserve affected trait");
assert.strictEqual(world.timelineEvents[0].lineageId, 7, "timeline event should preserve lineage id");
assert.strictEqual(world.timelineEvents[0].speciesId, 8, "timeline event should preserve species id");
assert.strictEqual(world.timelineEvents[0].populationId, 9, "timeline event should preserve population id");
assert.strictEqual(world.timelineEvents[0].pressure, 0.73, "timeline event should preserve pressure");
assert.strictEqual(world.timelineEvents[0].effect, "survival-cost", "timeline event should preserve effect");
assert.strictEqual(world.timelineEvents[0].id, 10, "timeline event should preserve species/event id");
assert.strictEqual(world.timelineEvents[0].parentId, 6, "timeline event should preserve parent id");
assert.strictEqual(world.timelineEvents[0].cause, "geographic-isolation", "timeline event should preserve cause");
assert.strictEqual(world.timelineEvents[0].divergence, 0.82, "timeline event should preserve divergence");
assert.strictEqual(world.timelineEvents[0].traits.terrainAffinity, 0.4, "timeline event should preserve trait payload");
assert.strictEqual(notifications.length, 1, "notification route should use notification UI");
assert.strictEqual(focusedTiles[0].x, 4, "spotlight route should focus inspect target tile x");
assert.strictEqual(focusedTiles[0].y, 5, "spotlight route should focus inspect target tile y");
assert.strictEqual(world.spotlightEvent.type, "geology.test", "spotlight route should store current spotlight event");
assert.strictEqual(world.needsRender, true, "spotlight should request redraw");

PS.events.emitMilestone({
  type: "atmosphere.location",
  label: "Atmosphere test",
  detail: "location spotlight",
  source: "atmosphere",
  location: { latitude: 12.5, longitude: -44 },
  watcher: {
    spotlight: true
  }
});

assert.strictEqual(focusedLocations[0].latitude, 12.5, "spotlight route should focus latitude");
assert.strictEqual(focusedLocations[0].longitude, -44, "spotlight route should focus longitude");
assert.strictEqual(world.eventLog.length, 1, "default watcher route should enter visible event log");
assert.strictEqual(world.timelineEvents.length, 2, "default watcher route should enter timeline");

PS.events.emitMilestone({
  type: "extinction.event",
  label: "Mass extinction",
  detail: "volcanic winter",
  source: "extinction",
  eventType: "volcanic-winter",
  severityScore: 0.62,
  killRate: 0.58,
  prePopulation: 20,
  postPopulation: 8,
  affectedSpecies: [{ id: 1, losses: 8, survivors: 2 }],
  affectedPopulations: [{ id: 3, losses: 6, survivors: 1 }],
  survivors: { total: 8, bySpecies: { "1": 2 }, byPopulation: { "3": 1 } },
  losses: { total: 12, bySpecies: { "1": 8 }, byPopulation: { "3": 6 } },
  recoveryWindow: { startTick: 88, endTick: 188 },
  survivorPopulationIds: [3],
  radiationCandidateIds: [3],
  durationTicks: 100,
  watcher: {
    eventLog: true,
    timeline: true,
    overlays: ["observation.extinction"]
  }
});

var extinctionEvent = world.timelineEvents[world.timelineEvents.length - 1];
assert.strictEqual(extinctionEvent.category, "extinction", "extinction source should infer extinction category");
assert.strictEqual(extinctionEvent.eventType, "volcanic-winter", "extinction event should preserve event type");
assert.strictEqual(extinctionEvent.severityScore, 0.62, "extinction event should preserve severity score");
assert.strictEqual(extinctionEvent.killRate, 0.58, "extinction event should preserve kill rate");
assert.strictEqual(extinctionEvent.prePopulation, 20, "extinction event should preserve pre-population");
assert.strictEqual(extinctionEvent.postPopulation, 8, "extinction event should preserve post-population");
assert.strictEqual(extinctionEvent.losses.total, 12, "extinction event should preserve loss ledger");
assert.strictEqual(extinctionEvent.survivorPopulationIds[0], 3, "extinction event should preserve survivor population ids");
assert.strictEqual(extinctionEvent.radiationCandidateIds[0], 3, "extinction event should preserve radiation candidates");
assert.strictEqual(extinctionEvent.durationTicks, 100, "extinction event should preserve recovery duration");

console.log("watcher event contract checks passed");
`, context);
