const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  console,
  window: {
    addEventListener() {}
  },
  world: {
    tick: 10,
    settlements: []
  }
};
context.window.window = context.window;

vm.createContext(context);
vm.runInContext(read("js/core/namespace.js"), context, { filename: "js/core/namespace.js" });
vm.runInContext(read("config.js"), context, { filename: "config.js" });
vm.runInContext(read("js/core/utils.js"), context, { filename: "js/core/utils.js" });
vm.runInContext(read("js/sim/resource-registry.js"), context, { filename: "js/sim/resource-registry.js" });

const registry = context.resourceRegistry;
const definitions = registry.getDefinitions();
assert.ok(JSON.parse(read("package.json")).scripts.test.includes("tests/resource-registry.test.js"), "npm test should include resource registry checks");
assert.ok(read("js/core/manifest.js").includes("js/sim/resource-registry.js"), "manifest should load resource registry");
assert.ok(definitions.length >= 5, "registry should define at least five resources");
assert.deepStrictEqual(
  Array.from(definitions, (definition) => definition.id),
  ["food", "wood", "stone", "metal", "knowledge"],
  "initial registry should expose the AZR-495 resource set"
);
assert.ok(new Set(Array.from(definitions, (definition) => definition.category)).size >= 5, "resources should have distinct categories");
assert.ok(registry.getDefinition("food").spoilagePerTick > 0, "food should be perishable");
assert.deepStrictEqual(Array.from(registry.getDefinition("metal").production), ["mine", "forge"], "metal should declare production dependencies");

const settlement = {
  id: 1,
  foundedTick: 0,
  storedFood: 100
};
context.world.settlements.push(settlement);

registry.normalizeSettlement(settlement);
assert.strictEqual(settlement.resources.food, 100, "stored food should seed food resource stock");
assert.strictEqual(settlement.resources.wood, 0, "non-food resources should default to zero stock");

registry.recordFlow(settlement, "wood", "produced", 12);
registry.recordFlow(settlement, "stone", "traded", 7);
registry.recordFlow(settlement, "wood", "consumed", 2);
assert.strictEqual(settlement.resources.wood, 10, "produced and consumed resource flows should affect stock");
assert.strictEqual(settlement.resourceLedger.wood.produced, 12, "ledger should track produced flow");
assert.strictEqual(settlement.resourceLedger.wood.consumed, 2, "ledger should track consumed flow");
assert.strictEqual(settlement.resourceLedger.stone.traded, 7, "ledger should track traded flow");

context.world.tick = 20;
const spoiled = registry.applySpoilage(settlement, context.world.tick);
assert.ok(spoiled > 0, "perishable resources should spoil over elapsed ticks");
assert.ok(settlement.resources.food < 100, "spoilage should reduce food resource stock");
assert.strictEqual(settlement.storedFood, Math.round(settlement.resources.food), "food resource stock should remain causal with storedFood");

const settlementSummary = registry.getSettlementSummary(settlement);
assert.strictEqual(settlementSummary.entries.length, definitions.length, "settlement summary should include every resource");
assert.ok(settlementSummary.entries.find((entry) => entry.id === "food").spoiled > 0, "summary should expose spoilage flow");

const worldSummary = registry.getWorldSummary();
assert.strictEqual(worldSummary.settlementCount, 1, "world summary should count settlements");
assert.strictEqual(worldSummary.totals.wood, 10, "world summary should aggregate stock");

console.log("resource registry checks passed");
