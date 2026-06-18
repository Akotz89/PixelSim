const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  window: {
    addEventListener() {}
  },
  document: {
    getElementById() {
      return {
        getContext() {
          return {};
        },
        querySelector() {
          return {};
        }
      };
    },
    querySelectorAll() {
      return [];
    }
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/ui/dom-refs.js",
  "js/systems/state.js",
  "js/core/utils.js",
  "js/core/trait-schema.js",
  "js/core/config.js",
  "js/core/world-grid.js",
  "js/systems/pool-manager.js",
  "js/systems/pools.js",
  "js/systems/persistence-db.js",
  "js/systems/persistence-config.js",
  "js/systems/save-migration.js",
  "js/systems/persistence-save-data.js",
  "js/systems/persistence-restore-core.js",
  "js/systems/persistence-restore-entities.js",
  "js/sim/food-runtime.js",
  "js/sim/food-growth.js",
  "js/sim/food.js",
  "js/sim/organisms-traits.js",
  "js/sim/organisms-indexes.js",
  "js/sim/organism-ai.js",
  "js/sim/organisms-behavior.js",
  "js/sim/evolution.js",
  "js/sim/organisms.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

function getRandomLatLonInTile(x, y) {
  return {
    latitude: y + 0.25,
    longitude: x + 0.75
  };
}

function assignRandomSurfacePositionInTile(entity) {
  var position = getRandomLatLonInTile(entity.x, entity.y);
  entity.latitude = position.latitude;
  entity.longitude = position.longitude;
}

function getWrappedWorldX(x) {
  return PS.worldGrid.getWrappedX(x);
}

function getClampedWorldY(y) {
  return PS.worldGrid.getClampedY(y);
}

function getWrappedBucketIndexes(centerX, radius, bucketSize, worldSize) {
  return PS.worldGrid.getWrappedBucketIndexes(centerX, radius, bucketSize, worldSize);
}

function getClampedBucketIndexes(centerY, radius, bucketSize, worldSize) {
  return PS.worldGrid.getClampedBucketIndexes(centerY, radius, bucketSize, worldSize);
}

function getTileManhattanDistance(fromX, fromY, toX, toY) {
  return PS.worldGrid.getTileManhattanDistance(fromX, fromY, toX, toY);
}

function getTileGreatCircleDistanceKm() {
  return 0;
}

function getDirectionXToTile(fromX, toX) {
  return Math.sign(toX - fromX);
}

function getDirectionYToTile(fromY, toY) {
  return Math.sign(toY - fromY);
}

function getPlanetLatitudeForTile(y) {
  return y;
}

function getPlanetLongitudeForTile(x) {
  return x;
}

function normalizeLongitude(longitude) {
  var normalized = Number(longitude) || 0;
  while (normalized < -180) {
    normalized += 360;
  }
  while (normalized >= 180) {
    normalized -= 360;
  }
  return normalized;
}

function isFertile() {
  return true;
}

function recordFoodConsumed(count) {
  world.foodConsumed = (world.foodConsumed || 0) + count;
}

PS.config.pools.maxOrganisms = 8;
PS.config.pools.maxFoodParticles = 8;
PS.pools.reset();
setWorldSeed("ORGANISM-AI-TEST");

world.organisms = [];
world.food = [];
world.foodPositions = {};
world.foodBuckets = {};
world.organismBuckets = {};
world.organismsByLineage = {};
world.tick = 3;

assert.deepStrictEqual(
  ["eat", "flee", "reproduce", "shelter", "wander"].filter(function(key) {
    return !PS.sim.organismAi.modules[key];
  }),
  [],
  "organism AI should register the five required behavior modules"
);

var forager = PS.sim.organisms.make(10, 10);
forager.energy = 120;
forager.traits.vision = 5;
forager.traits.movementTendency = 0;
forager.traits.reproductionEnergy = 9999;
world.organisms.push(forager);
var food = addFoodAt(12, 10);
PS.sim.organisms.update(forager);

assert.strictEqual(forager.ai.moduleKey, "eat", "nearby food should select the eat module");
assert.strictEqual(forager.ai.planKey, "forage-food", "eat module should create a named forage plan");
assert.deepStrictEqual(forager.ai.steps, ["walkTo", "pickUp", "consume"], "eat plan should sequence walkTo -> pickUp -> consume");
assert.deepStrictEqual(forager.ai.target, { type: "food", x: food.x, y: food.y }, "eat plan should persist a food target");

forager.ai = {
  moduleKey: "wander",
  priority: 10,
  planKey: "wander",
  steps: ["wander"],
  planStep: "wander",
  subState: "ready"
};
forager.threatLevel = 1;
PS.sim.organismAi.tick(forager, { traits: forager.traits, shouldWander: true });
assert.strictEqual(forager.ai.moduleKey, "flee", "flee should interrupt lower-priority wander");
assert.strictEqual(forager.ai.interrupt.moduleKey, "wander", "interrupt slot should preserve the preempted plan");

forager.ai.carryingResource = { id: "food", amount: 1 };
var saved = copyOrganismForSave(forager);
assert.strictEqual(saved.ai.moduleKey, "flee", "organism save should include AI module state");
assert.strictEqual(saved.ai.carryingResource.id, "food", "organism save should include carried resource state");
var restored = restoreOrganism(saved);
assert.strictEqual(restored.ai.moduleKey, "flee", "organism restore should preserve AI module state");
assert.strictEqual(restored.ai.interrupt.moduleKey, "wander", "organism restore should preserve interrupt state");
assert.strictEqual(restored.ai.carryingResource.amount, 1, "organism restore should preserve carried resource amount");

console.log("organism AI checks passed");
`, context);
