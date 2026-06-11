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
  window: {
    addEventListener() {}
  },
  world: {
    tick: 30,
    deepTimeYears: 100000,
    eventLog: [],
    timelineEvents: [],
    milestonesReached: {},
    organisms: [],
    settlements: [],
    orbitalLaunches: 0
  }
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

var registry = PS.events.getMilestoneRegistry();
assert.ok(Array.isArray(registry.primordial), "milestone registry should group significant events per epoch");
assert.ok(registry.primordial.some(function(definition) {
  return definition.type === "life.first";
}), "first life milestone should be registered");

var emittedPayloads = [];
PS.events.on(PS.eventTypes.MILESTONE_REACHED, function(payload) {
  emittedPayloads.push(payload);
});

assert.deepStrictEqual(PS.events.detectMilestones(), [], "empty world should not emit milestones");

world.organisms = [{ id: 1 }];
var firstLife = PS.events.detectMilestones();
assert.strictEqual(firstLife.length, 1, "first organism should emit first-life milestone");
assert.strictEqual(firstLife[0].payload.type, "life.first", "first life milestone type should emit");
assert.strictEqual(firstLife[0].payload.details.value, 1, "milestone payload should include details");
assert.strictEqual(PS.events.history[0].name, PS.eventTypes.MILESTONE_REACHED, "milestone detector should emit milestone.reached");
assert.strictEqual(world.eventLog.length, 1, "milestones should log to visible event log");
assert.strictEqual(world.timelineEvents.length, 1, "milestones should log to timeline playback stream");
assert.strictEqual(PS.events.detectMilestones().length, 0, "milestones should not duplicate after firing once");

while (world.organisms.length < 24) {
  world.organisms.push({ id: world.organisms.length + 1 });
}
var multicellular = PS.events.detectMilestones();
assert.ok(multicellular.some(function(result) {
  return result.payload.type === "life.multicellular";
}), "population threshold should detect first multicellular milestone");

world.settlements = [{ id: 1, development: 12, level: 3 }];
var settlementMilestones = PS.events.detectMilestones();
assert.ok(settlementMilestones.some(function(result) {
  return result.payload.type === "intelligence.tool-use";
}), "settlement development should detect first tool use");
assert.ok(settlementMilestones.some(function(result) {
  return result.payload.type === "civilization.first-city";
}), "settlement level should detect first city");

world.orbitalLaunches = 1;
var spaceMilestones = PS.events.detectMilestones();
assert.ok(spaceMilestones.some(function(result) {
  return result.payload.type === "space.first-launch";
}), "orbital launch should detect first space milestone");

PS.config.milestones.push({
  type: "test.configurable",
  epoch: "test",
  label: "Configurable test",
  condition: "organismsAtLeast",
  threshold: 1,
  detail: "value {value}"
});
var configurable = PS.events.detectMilestones();
assert.ok(configurable.some(function(result) {
  return result.payload.type === "test.configurable";
}), "milestone list should be configurable through PS.config.milestones");
assert.ok(emittedPayloads.every(function(payload) {
  return payload.type && payload.details;
}), "every emitted milestone should include type and details");

var terrainPayload = PS.events.emitMilestone({
  type: "biology.terrain-pressure.test",
  label: "Terrain test",
  detail: "desert pressure",
  source: "biology",
  terrainDriver: "desert",
  trait: "waterDependency",
  lineageId: 3,
  speciesId: 4,
  populationId: 5,
  pressure: 0.91,
  effect: "adaptation-pressure"
}).payload;

assert.strictEqual(terrainPayload.terrainDriver, "desert", "milestone payload should preserve terrain driver");
assert.strictEqual(terrainPayload.trait, "waterDependency", "milestone payload should preserve affected terrain trait");
assert.strictEqual(terrainPayload.populationId, 5, "milestone payload should preserve population id");
assert.strictEqual(world.timelineEvents[world.timelineEvents.length - 1].effect, "adaptation-pressure", "timeline should preserve terrain event effect");

console.log("milestone event checks passed");
`, context);
