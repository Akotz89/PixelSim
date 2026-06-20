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

PS.config.pools.maxOrganisms = 8;
PS.config.pools.maxFoodParticles = 8;
PS.pools.reset();
setWorldSeed("ORGANISM-RUNTIME-TEST");

world.organisms = [];
world.food = [];
world.foodPositions = {};
world.foodBuckets = {};
world.organismBuckets = {};
world.organismsByLineage = {};
world.tick = 3;

var parent = PS.sim.organisms.make(10, 10);
world.organisms.push(parent);
parent.energy = 500;
parent.traits.vision = 4;
parent.traits.reproductionEnergy = 220;
parent.traits.movementTendency = 0;
parent.directionX = 0;
parent.directionY = 0;

var firstFood = addFoodAt(10, 10);
assert.strictEqual(findNearestFood(parent, parent.traits.vision), firstFood, "organism should find indexed food on current tile");

PS.sim.organisms.update(parent);
assert.strictEqual(world.foodConsumed, 1, "update should consume food on the current tile");
assert.strictEqual(world.food.length, 0, "eaten food should be removed from the food index");
assert.strictEqual(world.birthsRecorded, 1, "high-energy organism should reproduce");
assert.strictEqual(world.organisms.length, 2, "reproduction should add a child organism");
assert.strictEqual(parent.energy, CONFIG.PARENT_ENERGY_AFTER_REPRODUCTION, "parent energy should reset after reproduction");

var child = world.organisms[1];
assert.ok(child.representativeId > parent.representativeId, "child should receive a stable representative id");
assert.strictEqual(child.speciesId, child.lineageId, "child should expose species identity");
assert.strictEqual(child.populationId, child.lineageId, "child should expose population identity");
assert.ok(child.traits.bodySize >= CONFIG.TRAIT_BODY_SIZE_MIN, "child traits should include body-plan fields");

refreshLineageRegistry();
assert.strictEqual(PS.sim.organisms.byLineage(parent.lineageId).length, 2, "lineage index should include parent and child");
assert.strictEqual(
  PS.sim.organisms.countInRadiusForLineage(parent.x, parent.y, 3, parent.lineageId),
  2,
  "radius lookup should filter by lineage"
);
assert.strictEqual(PS.sim.organisms.nearestInRadius(parent.x, parent.y, 3), parent, "nearest lookup should return local organism");

var traveler = PS.sim.organisms.make(20, 20);
traveler.traits.vision = 8;
traveler.traits.reproductionEnergy = 999;
traveler.traits.movementTendency = 0;
traveler.energy = 300;
traveler.directionX = 0;
traveler.directionY = 0;
world.organisms.push(traveler);
addFoodAt(22, 20);

PS.sim.organisms.update(traveler);
assert.strictEqual(traveler.x, 21, "organism should move toward nearby food");
assert.strictEqual(traveler.y, 20, "organism movement should preserve row when food is horizontal");

traveler.energy = 0;
PS.sim.organisms.removeDead();
assert.strictEqual(world.deathsRecorded, 1, "dead organism removal should record a death");
assert.strictEqual(world.organisms.indexOf(traveler), -1, "dead organism should be removed from active representatives");

console.log("organism runtime checks passed");
`, context);
