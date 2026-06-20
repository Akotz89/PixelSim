const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  geochemistry: null,
  window: {
    addEventListener() {},
    geochemistry: null
  },
  world: {
    tick: 42,
    era: "primordial",
    eventLog: []
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/core/config.js",
  "js/core/assert.js",
  "js/core/event-types.js",
  "js/core/events.js",
  "js/epochs/registry.js",
  "js/layers/registry.js",
  "js/layers/geology.js",
  "js/layers/atmosphere.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

assert.ok(layerRegistry.get("geology"), "geology layer should register");
assert.ok(layerRegistry.get("atmosphere"), "atmosphere layer should register");

var layerManifest = layerRegistry.getManifest();
assert.strictEqual(layerManifest.length, 2, "layer manifest should include always-on layer contracts");
assert.deepStrictEqual(
  layerManifest.map(function(layer) { return layer.id; }),
  ["geology", "atmosphere"],
  "layer manifest should preserve static loader order"
);
assert.strictEqual(layerManifest[0].alwaysOn, true, "geology should be always-on");
assert.ok(layerManifest[0].watcherOutputs.indexOf("timeline") >= 0, "geology should identify watcher outputs");

var updatedLayers = layerRegistry.updateAll(33);
assert.deepStrictEqual(updatedLayers, ["geology", "atmosphere"], "all always-on layers should update");
assert.strictEqual(world.geology.ageTicks, 1, "geology state should update");
assert.strictEqual(world.atmosphere.ageTicks, 1, "atmosphere state should update");

var entered = [];
var exited = [];
var updates = [];

PS.epochs.register("primordial", {
  detect: function() {
    return false;
  },
  enter: function(previous) {
    entered.push(previous);
  },
  update: function(dt) {
    updates.push(dt);
  },
  exit: function(next) {
    exited.push(next);
  }
});

PS.epochs.register("microbial", {
  detect: function(currentWorld) {
    return currentWorld.microbialReady === true;
  },
  enter: function(previous) {
    entered.push(previous);
  },
  update: function(dt) {
    updates.push(dt);
  }
});

PS.epochs.setEra("primordial");
PS.epochs.updateCurrent(50);
assert.deepStrictEqual(updates, [50], "current epoch update should run");

world.microbialReady = true;
assert.strictEqual(PS.epochs.detectTransition(), "microbial", "epoch detection should use registered detect hooks");
PS.epochs.setEra("microbial");
assert.deepStrictEqual(exited, ["microbial"], "previous epoch exit hook should run");
assert.deepStrictEqual(entered, ["primordial"], "next epoch enter hook should receive previous id");

var receivedPayload = null;
PS.events.on(PS.eventTypes.MILESTONE_REACHED, function(payload) {
  receivedPayload = payload;
});

var milestone = PS.events.emitMilestone({
  type: "abiogenesis.first-life",
  label: "First life",
  detail: "Chemical complexity crossed the threshold.",
  location: { latitude: 12.5, longitude: -45 },
  source: "geology",
  severity: "major",
  inspectTarget: { type: "tile", x: 12, y: 9 },
  watcher: {
    notification: true,
    spotlight: true,
    overlays: ["chemistry"]
  }
});

assert.strictEqual(milestone.payload.tick, 42, "milestone should default to world tick");
assert.strictEqual(milestone.payload.type, "abiogenesis.first-life", "milestone type should normalize");
assert.strictEqual(milestone.payload.watcher.timeline, true, "timeline watcher output should default on");
assert.strictEqual(milestone.payload.watcher.notification, true, "notification watcher output should be preserved");
assert.strictEqual(receivedPayload.label, "First life", "milestone event should emit normalized payload");
assert.strictEqual(world.eventLog.length, 1, "milestone should append to world event log");
assert.strictEqual(world.eventLog[0].source, "geology", "event log should preserve milestone source");
assert.strictEqual(PS.events.history[0].name, "milestone.reached", "event history should include milestone event");

console.log("phase 2 contract checks passed");
`, context);
