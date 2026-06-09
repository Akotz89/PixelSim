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
  document: {
    getElementById() {
      return {
        hidden: false,
        textContent: ""
      };
    }
  },
  performance: {},
  world: {
    tick: 0,
    seedText: "POOL-TEST",
    rngState: 1,
    nextLineageId: 1,
    lineages: {},
    organisms: [],
    food: [],
    foodPositions: {},
    foodBuckets: {},
    fps: 60,
    tps: 60,
    updateMs: 1.5,
    drawMs: 2.5
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "const WORLD_WIDTH = 320; const WORLD_HEIGHT = 170;",
  "js/core/utils.js",
  "js/core/trait-schema.js",
  "js/core/config.js",
  "js/core/world-grid.js",
  "js/systems/pool-manager.js",
  "js/systems/pools.js",
  "js/sim/food-runtime.js",
  "js/sim/organisms-traits.js",
  "js/sim/organisms-behavior.js",
  "js/debug/performance.js"
].map((file) => file.endsWith(".js") ? read(file) : file).join("\n");

vm.runInNewContext(`${source}

function getRandomLatLonInTile(x, y) {
  return {
    latitude: y + 0.25,
    longitude: x + 0.75
  };
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

function getEntitySurfacePosition(entity) {
  return {
    latitude: entity.latitude,
    longitude: entity.longitude
  };
}

function getPlanetLatitudeForTile(y) {
  return y;
}

function getPlanetLongitudeForTile(x) {
  return x;
}

function getTileGreatCircleDistanceKm() {
  return 0;
}

function isFertile() {
  return true;
}

function recordOrganismDeath(count) {
  world.deathsRecorded = (world.deathsRecorded || 0) + count;
}

PS.config.pools.maxOrganisms = 4;
PS.config.pools.maxFoodParticles = 3;
PS.pools.reset();

assert.strictEqual(PS.pools.organism.capacity, 4, "organism capacity should be configurable");
assert.strictEqual(PS.pools.food.capacity, 3, "food capacity should be configurable");
assert.ok(PS.poolManager.pools.organisms, "organism pool should register with pool manager");
assert.ok(PS.poolManager.pools.food, "food pool should register with pool manager");
assert.ok(PS.pools.organism.arrays.x instanceof Float32Array, "organism x should be typed-array backed");
assert.strictEqual(Object.keys(PS.pools.organism.arrays).length, 36, "organism pool should expose biology identity, trait, and tile-link arrays");
assert.strictEqual(PS.pools.organism.arrays.nextInTile[0], -1, "organism tile-grid next pointer should default to no link");
assert.strictEqual(PS.pools.organism.arrays.prevInTile[0], -1, "organism tile-grid previous pointer should default to no link");

var organism = makeOrganism(5, 6);
assert.strictEqual(PS.pools.getStats().activeOrganisms, 1, "makeOrganism should acquire from pool");
assert.strictEqual(PS.poolManager.getStats().organisms.used, 1, "pool manager should track organism usage");
assert.strictEqual(PS.poolManager.getStats().organisms.free, 3, "pool manager should track organism free count");
assert.strictEqual(organism.x, 5, "pooled organism should expose x");
organism.energy = 42;
organism.traits.vision = 27;
organism.speciesId = 3;
organism.populationId = 5;
organism.representativeId = 7;
organism.traits.bodySize = 1.5;
organism.traits.limbCount = 6;
assert.strictEqual(PS.pools.organism.arrays.energy[organism.poolIndex], 42, "organism energy should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.vision[organism.poolIndex], 27, "trait writes should update typed array");
assert.strictEqual(PS.pools.organism.arrays.speciesId[organism.poolIndex], 3, "species id should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.populationId[organism.poolIndex], 5, "population id should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.representativeId[organism.poolIndex], 7, "representative id should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.bodySize[organism.poolIndex], 1.5, "body size should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.limbCount[organism.poolIndex], 6, "limb count should write through to typed array");

organism.energy = 0;
world.organisms = [organism];
removeDeadOrganisms();
assert.strictEqual(world.organisms.length, 0, "dead organism should be removed");
assert.strictEqual(PS.pools.getStats().activeOrganisms, 0, "dead organism should return to free list");

var reused = makeOrganism(7, 8);
assert.strictEqual(reused, organism, "free-list should reuse released organism facade");

var food = addFoodAt(2, 3);
assert.strictEqual(PS.pools.getStats().activeFood, 1, "addFoodAt should acquire pooled food");
assert.strictEqual(PS.poolManager.getStats().food.used, 1, "pool manager should track food usage");
assert.strictEqual(food.x, 2, "pooled food should expose x");
assert.strictEqual(removeFood(food), food, "removeFood should preserve returned identity");
assert.strictEqual(PS.pools.getStats().activeFood, 0, "removed food should return to pool");

var foodAgain = addFoodAt(4, 5);
assert.strictEqual(foodAgain, food, "food pool should reuse released particle");

assert.strictEqual(makeOrganism(9, 9).poolIndex >= 0, true, "second organism should acquire");
assert.strictEqual(makeOrganism(10, 10).poolIndex >= 0, true, "third organism should acquire");
assert.strictEqual(makeOrganism(11, 11).poolIndex >= 0, true, "fourth organism should acquire");
assert.throws(function() {
  makeOrganism(12, 12);
}, new RegExp("Pool overflow: organisms used 4/4"), "organism pool overflow should identify pool and utilization");

addFoodAt(6, 7);
addFoodAt(8, 9);
assert.throws(function() {
  addFoodAt(10, 11);
}, new RegExp("Pool overflow: food used 3/3"), "food pool overflow should identify pool and utilization");

var managerStats = PS.poolManager.getStats();
assert.strictEqual(managerStats.organisms.total, 4, "pool manager stats should expose organism total");
assert.strictEqual(managerStats.organisms.used, 4, "pool manager stats should expose organism used count");
assert.strictEqual(managerStats.organisms.free, 0, "pool manager stats should expose organism free count");
assert.strictEqual(managerStats.food.total, 3, "pool manager stats should expose food total");
assert.ok(managerStats.memory.totalBytes > 0, "pool manager should estimate pool memory");
assert.strictEqual(managerStats.memory.budgetMb, 96, "pool manager should expose memory budget");

var memoryLabel = PS.debug.performance.getMemoryLabel();
var poolLabel = PS.debug.performance.getPoolLabel();
assert.ok(memoryLabel.indexOf("MB est") > -1, "performance debug should estimate memory when performance.memory is unavailable");
assert.ok(poolLabel.indexOf("org 4/4") > -1, "performance debug should report organism pool usage");
assert.ok(poolLabel.indexOf("food 3/3") > -1, "performance debug should report food pool usage");
assert.ok(poolLabel.indexOf("poolMB") > -1, "performance debug should report pool memory usage");

console.log("pool checks passed");
`, context);

const hotLoopFiles = [
  "js/sim/organisms-behavior.js",
  "js/sim/food-runtime.js",
  "js/sim/organisms.js",
  "js/sim/food.js"
];

for (const file of hotLoopFiles) {
  assert.ok(!/\bnew\s+/.test(read(file)), `${file} should not use new in hot simulation paths`);
}
