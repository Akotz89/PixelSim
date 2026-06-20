const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  terrainPressure: {},
  window: {
    addEventListener() {},
    terrainPressure: {}
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
  "js/sim/food-runtime.js",
  "js/sim/food-growth.js",
  "js/sim/food.js",
  "js/core/entity-registry.js",
  "js/sim/organisms-traits.js",
  "js/sim/organisms-indexes.js",
  "js/sim/organism-ai.js",
  "js/sim/food-web.js",
  "js/sim/mass-extinction.js",
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
  var direct = toX - fromX;
  var wrapped = direct > WORLD_WIDTH / 2 ? direct - WORLD_WIDTH : direct;
  wrapped = wrapped < -WORLD_WIDTH / 2 ? wrapped + WORLD_WIDTH : wrapped;
  return Math.sign(wrapped);
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

function isFertile() {
  return true;
}

function recordFoodConsumed(count) {
  world.foodConsumed = (world.foodConsumed || 0) + count;
}

function recordOrganismBirth(count) {
  world.birthsRecorded = (world.birthsRecorded || 0) + count;
}

function recordOrganismDeath(count) {
  world.deathsRecorded = (world.deathsRecorded || 0) + count;
}

function resetOrganismFixture() {
  PS.config.pools.maxOrganisms = 8;
  PS.config.pools.maxFoodParticles = 8;
  PS.pools.reset();
  setWorldSeed("ORGANISM-UPDATE-PATH-TEST");
  world.organisms = [];
  world.food = [];
  world.foodPositions = {};
  world.foodBuckets = {};
  world.organismBuckets = {};
  world.organismsByLineage = {};
  world.foodConsumed = 0;
  world.birthsRecorded = 0;
}

function makeForagingOrganism(x, y) {
  var organism = organisms.make(x, y);
  organism.energy = 180;
  organism.traits.vision = 8;
  organism.traits.reproductionEnergy = 999;
  organism.traits.movementTendency = 0;
  organism.traits.carnivory = 0;
  organism.directionX = 0;
  organism.directionY = 0;
  world.organisms.push(organism);
  return organism;
}

resetOrganismFixture();
CONFIG.ORGANISM_FORAGING_INTERVAL = 5;
world.tick = 1;
var throttled = makeForagingOrganism(10, 10);
addFoodAt(12, 10);
updateOrganism(throttled, 0);
assert.strictEqual(throttled.x, 10, "indexed organism update should skip food search outside its foraging slot");
assert.strictEqual(throttled.directionX, 0, "foraging throttle should keep direction unchanged when movement is otherwise disabled");

world.tick = 5;
updateOrganism(throttled, 0);
assert.strictEqual(throttled.x, 11, "indexed organism update should forage during its assigned slot");
assert.strictEqual(throttled.ai.moduleKey, "eat", "canonical update path should tick organism AI while foraging");

resetOrganismFixture();
CONFIG.ORGANISM_FORAGING_INTERVAL = 1;
world.tick = 3;
var pooled = makeForagingOrganism(20, 20);
addFoodAt(22, 20);
assert.strictEqual(updatePooledOrganismsForTick(1), true, "pooled batch should accept all-pooled organisms");
assert.strictEqual(pooled.x, 21, "pooled batch should match canonical foraging movement");
assert.strictEqual(pooled.ai.moduleKey, "eat", "pooled batch should run organism AI during foraging");
assert.strictEqual(
  PS.pools.organism.arrays.x[pooled.poolIndex],
  pooled.x,
  "canonical pooled update should write through pooled facade accessors"
);

console.log("organism update path checks passed");
`, context);
