const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  organismAi: {},
  terrainPressure: {},
  window: {
    addEventListener() {},
    organismAi: {},
    terrainPressure: {}
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
  "js/core/entity-registry.js",
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
assert.strictEqual(Object.keys(PS.pools.organism.arrays).length, 40, "organism pool should expose biology identity, packed trait, compatibility trait, and tile-link arrays");
assert.ok(PS.pools.organism.arrays.traitBuffer instanceof Float32Array, "organism traits should have a packed stride buffer");
assert.strictEqual(PS.pools.organism.arrays.traitBuffer.length, 4 * PS.bio.TRAIT_STRIDE, "packed trait buffer should be capacity times schema stride");
assert.strictEqual(PS.pools.organism.arrays.nextInTile[0], -1, "organism tile-grid next pointer should default to no link");
assert.strictEqual(PS.pools.organism.arrays.prevInTile[0], -1, "organism tile-grid previous pointer should default to no link");

var organism = makeOrganism(5, 6);
assert.strictEqual(PS.pools.getStats().activeOrganisms, 1, "makeOrganism should acquire from pool");
assert.strictEqual(PS.poolManager.getStats().organisms.used, 1, "pool manager should track organism usage");
assert.strictEqual(PS.poolManager.getStats().organisms.free, 3, "pool manager should track organism free count");
assert.strictEqual(organism.x, 5, "pooled organism should expose x");
organism.energy = 42;
organism.traits.vision = 27;
organism.traits.intelligence = 0.5;
organism.traits.sociality = 0.25;
organism.traits.carnivory = 0.75;
organism.speciesId = 3;
organism.populationId = 5;
organism.representativeId = 7;
organism.traits.bodySize = 1.5;
organism.traits.limbCount = 6;
organism.traits.bodyShape = 999;
assert.strictEqual(PS.pools.organism.arrays.energy[organism.poolIndex], 42, "organism energy should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.vision[organism.poolIndex], 27, "trait writes should update typed array");
assert.strictEqual(PS.pools.organism.arrays.traitBuffer[organism.poolIndex * PS.bio.TRAIT_STRIDE + PS.bio.TRAIT_VISION], 27, "trait writes should update packed trait buffer");
assert.strictEqual(PS.pools.organism.arrays.intelligence[organism.poolIndex], 0.5, "intelligence should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.sociality[organism.poolIndex], 0.25, "sociality should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.carnivory[organism.poolIndex], 0.75, "carnivory should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.speciesId[organism.poolIndex], 3, "species id should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.populationId[organism.poolIndex], 5, "population id should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.representativeId[organism.poolIndex], 7, "representative id should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.bodySize[organism.poolIndex], 1.5, "body size should write through to typed array");
assert.strictEqual(PS.pools.organism.arrays.limbCount[organism.poolIndex], 6, "limb count should write through to typed array");
assert.strictEqual(organism.traits.bodyShape, CONFIG.TRAIT_BODY_SHAPE_MAX, "direct trait writes should clamp through schema bounds");

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

var unsafePool = {
  capacity: 2,
  items: [{ id: 1 }, { id: 2 }],
  freeList: [1, 0],
  freeTop: 2,
  activeCount: 0,
  acquire: function() {
    if (this.freeTop <= 0) {
      return null;
    }

    var slot = this.items[this.freeList[--this.freeTop]];
    this.activeCount++;
    return slot;
  },
  release: function(slot) {
    var index = this.items.indexOf(slot);

    if (index < 0) {
      return false;
    }

    this.freeList[this.freeTop++] = index;
    this.activeCount--;
    return true;
  },
  reset: function() {
    this.freeList = [1, 0];
    this.freeTop = 2;
    this.activeCount = 0;
  }
};

PS.poolManager.register("unsafe-test", unsafePool);
var unsafeSlot = PS.poolManager.acquire("unsafe-test");
assert.strictEqual(PS.poolManager.release("unsafe-test", unsafeSlot), true, "first release should return slot to unsafe pool");
assert.strictEqual(PS.poolManager.release("unsafe-test", unsafeSlot), false, "pool manager should reject double-free before raw pool mutates");
var unsafeA = PS.poolManager.acquire("unsafe-test");
var unsafeB = PS.poolManager.acquire("unsafe-test");
assert.notStrictEqual(unsafeA, unsafeB, "double-free guard should prevent duplicate slot acquisition");

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
