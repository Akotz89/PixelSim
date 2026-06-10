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
  "js/systems/pool-manager.js",
  "js/systems/pools.js",
  "js/sim/food-runtime.js",
  "js/sim/food-growth.js",
  "js/sim/food.js",
  "js/sim/organisms-traits.js",
  "js/sim/organisms-indexes.js",
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
  return 100;
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

function resetBodyTraitWorld() {
  PS.config.pools.maxOrganisms = 16;
  PS.config.pools.maxFoodParticles = 16;
  PS.pools.reset();
  setWorldSeed("BODY-TRAITS-TEST");
  world.organisms = [];
  world.food = [];
  world.foodPositions = {};
  world.foodBuckets = {};
  world.organismBuckets = {};
  world.organismsByLineage = {};
  world.tick = 3;
  world.foodConsumed = 0;
}

function makeBodyTraitOrganism(x, y, bodySize, limbCount) {
  var organism = PS.sim.organisms.make(x, y);
  organism.energy = 100;
  organism.traits.bodySize = bodySize;
  organism.traits.limbCount = limbCount;
  organism.traits.metabolism = 10;
  organism.traits.terrainAffinity = 1;
  organism.traits.vision = 0;
  organism.traits.movementTendency = 0;
  organism.traits.reproductionEnergy = 999999;
  organism.traits.carnivory = 0;
  organism.directionX = 0;
  organism.directionY = 0;
  organism.travelKm = 0;
  return organism;
}

resetBodyTraitWorld();
var smallBody = makeBodyTraitOrganism(10, 10, 0.5, 4);
var largeBody = makeBodyTraitOrganism(20, 20, 3, 4);
assert.ok(
  getTraitAdjustedMetabolismCost(largeBody.traits) > getTraitAdjustedMetabolismCost(smallBody.traits),
  "bodySize=3 organism should have higher metabolism cost than bodySize=0.5"
);
assert.ok(
  getTraitAdjustedFoodEnergyValue(largeBody.traits) > getTraitAdjustedFoodEnergyValue(smallBody.traits),
  "bodySize=3 organism should gain more energy from food than bodySize=0.5"
);

smallBody.energy = 100;
largeBody.energy = 100;
world.organisms.push(smallBody, largeBody);
PS.sim.organisms.update(smallBody);
PS.sim.organisms.update(largeBody);
assert.ok(
  smallBody.energy > largeBody.energy,
  "larger body should spend more energy on metabolism during update"
);

resetBodyTraitWorld();
var smallForager = makeBodyTraitOrganism(10, 10, 0.5, 4);
var largeForager = makeBodyTraitOrganism(20, 20, 3, 4);
addFoodAt(smallForager.x, smallForager.y);
eatFoodOnCurrentTile(smallForager);
addFoodAt(largeForager.x, largeForager.y);
eatFoodOnCurrentTile(largeForager);
assert.ok(
  largeForager.energy - 100 > smallForager.energy - 100,
  "larger body should gain more food energy after eating"
);

resetBodyTraitWorld();
CONFIG.ORGANISM_TRAVEL_KM_PER_DAY = 100;
CONFIG.SIM_DAYS_PER_TICK = 1;
var slowMover = makeBodyTraitOrganism(30, 30, 1, 0);
var fastMover = makeBodyTraitOrganism(40, 40, 1, 12);
slowMover.directionX = 1;
fastMover.directionX = 1;
world.organisms.push(slowMover, fastMover);
PS.sim.organisms.update(slowMover);
PS.sim.organisms.update(fastMover);
assert.strictEqual(slowMover.x, 30, "limbCount=0 organism should not cross a 100km tile in one tick");
assert.strictEqual(fastMover.x, 41, "limbCount=12 organism should move faster and cross a 100km tile in one tick");

console.log("body trait behavior checks passed");
`, context);
