const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

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
["type", "label", "detail", "tick", "deepTime", "location", "source", "category", "severity", "inspectTarget", "watcher", "terrainDriver", "trait", "lineageId", "speciesId", "populationId", "pressure", "effect"].forEach(function(field) {
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

console.log("watcher event contract checks passed");
`, context);
