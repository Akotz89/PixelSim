const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function makeElement() {
  return {
    width: 1600,
    height: 850,
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {}
    },
    addEventListener() {},
    getContext() {
      return {};
    },
    querySelector() {
      return makeElement();
    }
  };
}

const context = {
  assert,
  console,
  window: {
    addEventListener() {}
  },
  document: {
    getElementById() {
      return makeElement();
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
  "js/core/math.js",
  "js/core/prng.js",
  "js/core/utils.js",
  "js/core/trait-schema.js",
  "js/core/config.js",
  "js/core/world-grid.js",
  "js/systems/spatial.js",
  "js/systems/pool-manager.js",
  "js/systems/pools.js",
  "js/sim/food-runtime.js",
  "js/sim/food-growth.js",
  "js/sim/food.js",
  "js/sim/organisms-traits.js",
  "js/sim/organisms-indexes.js",
  "js/sim/food-web.js",
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

function recordOrganismDeath(count) {
  world.deathsRecorded = (world.deathsRecorded || 0) + count;
}

function makeTestOrganism(x, y, carnivory, bodySize, limbCount, energy) {
  var organism = PS.sim.organisms.make(x, y);
  organism.energy = energy == null ? 100 : energy;
  organism.traits.carnivory = carnivory;
  organism.traits.bodySize = bodySize;
  organism.traits.limbCount = limbCount;
  organism.traits.vision = 10;
  organism.traits.metabolism = 1;
  organism.traits.movementTendency = 0;
  organism.traits.reproductionEnergy = 999999;
  organism.directionX = 0;
  organism.directionY = 0;
  return organism;
}

function resetPredationWorld() {
  PS.config.pools.maxOrganisms = 32;
  PS.pools.reset();
  setWorldSeed("PREDATION-TEST");
  world.organisms = [];
  world.food = [];
  world.foodPositions = {};
  world.foodBuckets = {};
  world.organismBuckets = {};
  world.organismsByLineage = {};
  world.tick = CONFIG.PREDATION_ATTACK_INTERVAL;
  world.deathsRecorded = 0;
}

CONFIG.PREDATION_ATTACK_INTERVAL = 1;
CONFIG.PREDATION_MIN_ATTACK_ADVANTAGE = -0.1;
CONFIG.PREDATION_ENERGY_TRANSFER_RATIO = 0.8;

resetPredationWorld();
var predator = makeTestOrganism(10, 10, 0.9, 2.0, 6, 50);
var prey = makeTestOrganism(11, 10, 0, 0.7, 2, 40);
world.organisms.push(predator, prey);
PS.sim.organisms.update(predator);
assert.strictEqual(prey.energy, 0, "larger carnivore should kill adjacent prey");
assert.strictEqual(predator.energy, 82, "successful predation should transfer victim energy");
assert.strictEqual(prey.deathCause, "predation", "predation death cause should be distinguishable");
assert.strictEqual(world.foodWebStats.predationEvents, 1, "predation should increment food-web event metrics");
assert.strictEqual(world.foodWebStats.energyTransferred, 32, "predation should track transferred biomass energy");

resetPredationWorld();
var smallPredator = makeTestOrganism(10, 10, 0.9, 0.6, 2, 50);
var largePrey = makeTestOrganism(11, 10, 0, 2.0, 8, 40);
world.organisms.push(smallPredator, largePrey);
PS.sim.organisms.update(smallPredator);
assert.ok(largePrey.energy > 0, "undersized carnivore should fail against larger prey");

resetPredationWorld();
var starvingCarnivore = makeTestOrganism(12, 12, 0.9, 1.2, 4, 1);
starvingCarnivore.traits.metabolism = 3;
world.organisms.push(starvingCarnivore);
world.tick = 3;
PS.sim.organisms.update(starvingCarnivore);
PS.sim.organisms.removeDead();
assert.strictEqual(world.organisms.length, 0, "pure carnivore should die when no prey exists");
assert.strictEqual(world.deathsRecorded, 1, "starved carnivore removal should record a death");

resetPredationWorld();
var mixedPredator = makeTestOrganism(20, 20, 0.9, 2.0, 6, 70);
var mixedPreyA = makeTestOrganism(21, 20, 0, 0.7, 2, 50);
var mixedPreyB = makeTestOrganism(23, 20, 0, 0.7, 2, 50);
var mixedPreyC = makeTestOrganism(25, 20, 0, 0.7, 2, 50);
world.organisms.push(mixedPredator, mixedPreyA, mixedPreyB, mixedPreyC);
for (var i = 0; i < world.organisms.length; i++) {
  PS.sim.organisms.update(world.organisms[i]);
}
PS.sim.organisms.removeDead();
assert.ok(world.organisms.indexOf(mixedPredator) >= 0, "mixed population should keep predator alive after first hunt");
assert.ok(world.organisms.length >= 3, "mixed population should not immediately collapse");

resetPredationWorld();
var pooledPredator = makeTestOrganism(10, 10, 0.9, 2.0, 6, 50);
var pooledPrey = makeTestOrganism(11, 10, 0, 0.7, 2, 40);
world.organisms.push(pooledPredator, pooledPrey);
PS.sim.organisms.update(world.organisms[0]);
assert.strictEqual(world.organisms[1].energy, 0, "pooled prey object should be killed by predation");
assert.strictEqual(PS.pools.organism.arrays.energy[world.organisms[1].poolIndex], 0, "pooled prey energy array should sync predation death");
assert.strictEqual(PS.pools.organism.arrays.energy[world.organisms[0].poolIndex], 82, "pooled predator energy array should sync transferred energy");

console.log("predation checks passed");
`, context);
