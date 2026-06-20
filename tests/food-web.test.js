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
  "js/core/math.js",
  "js/core/prng.js",
  "js/core/utils.js",
  "js/core/assert.js",
  "js/core/event-types.js",
  "js/core/events.js",
  "js/core/trait-schema.js",
  "js/core/config.js",
  "js/core/world-grid.js",
  "js/systems/spatial.js",
  "js/systems/pool-manager.js",
  "js/systems/pools.js",
  "js/sim/food-runtime.js",
  "js/sim/food-growth.js",
  "js/sim/food.js",
  "js/core/entity-registry.js",
  "js/sim/organisms-traits.js",
  "js/sim/organisms-indexes.js",
  "js/sim/food-web.js",
  "js/sim/mass-extinction.js",
  "js/sim/organisms-behavior.js",
  "js/sim/evolution.js",
  "js/sim/organisms.js",
  "js/sim/speciation.js",
  "js/sim/representatives.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

function getRandomLatLonInTile(x, y) {
  return {
    latitude: y + 0.5,
    longitude: x + 0.5
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

function isFertile(x) {
  return x < 20;
}

PS.config.pools.maxOrganisms = 16;
PS.pools.reset();
setWorldSeed("FOOD-WEB-TEST");
CONFIG.PREDATION_ATTACK_INTERVAL = 1;
CONFIG.PREDATION_MIN_ATTACK_ADVANTAGE = -0.1;
CONFIG.PREDATION_ENERGY_TRANSFER_RATIO = 0.8;
world.organisms = [];
world.food = [];
world.foodPositions = {};
world.foodBuckets = {};
world.organismBuckets = {};
world.organismsByLineage = {};
world.biologyPopulations = [];
world.biologyPopulationById = {};
world.biologyRepresentatives = [];
world.biologyRepresentativeById = {};
world.eventLog = [];
world.timelineEvents = [];
world.foodWebMilestones = {};
world.tick = 33;

function makeRoleOrganism(x, y, carnivory, energy) {
  var organism = PS.sim.organisms.make(x, y);
  organism.energy = energy || 100;
  organism.traits.carnivory = carnivory;
  organism.traits.bodySize = carnivory > 0.5 ? 2 : 0.8;
  organism.traits.limbCount = carnivory > 0.5 ? 8 : 2;
  organism.traits.movementTendency = CONFIG.TRAIT_MOVEMENT_TENDENCY_MAX;
  organism.traits.camouflage = carnivory > 0.5 ? 0.1 : 0;
  organism.traits.reproductionEnergy = 999999;
  organism.directionX = 0;
  organism.directionY = 0;
  return organism;
}

var predator = makeRoleOrganism(10, 10, 0.9, 80);
var preyA = makeRoleOrganism(11, 10, 0.1, 40);
var preyB = makeRoleOrganism(14, 10, 0.1, 40);
world.organisms.push(predator, preyA, preyB);
addFoodAt(10, 10);
addFoodAt(11, 10);

assert.strictEqual(foodWeb.getRole(predator.traits), "predator", "high carnivory should classify as predator");
assert.strictEqual(foodWeb.getRole(preyA.traits), "herbivore", "low carnivory should classify as herbivore");
assert.strictEqual(foodWeb.findNearestPrey(predator, predator.traits, 6), preyA, "food-web prey lookup should use indexed local candidates");

var populations = PS.sim.representatives.refresh();
var summary = foodWeb.refreshSummary(populations);
assert.strictEqual(summary.roles.predator, 1, "food-web summary should count predators");
assert.strictEqual(summary.roles.herbivore, 2, "food-web summary should count herbivores");
assert.ok(summary.trophicBalance >= 0 && summary.trophicBalance <= 100, "food-web summary should bound trophic balance");
assert.ok(world.biologyPopulations[0].foodWeb.predatorPressure >= 0, "population should expose predator pressure");
assert.strictEqual(world.timelineEvents[0].type, "biology.first-predator", "food-web summary should emit first predator milestone");

PS.sim.organisms.update(predator);
assert.strictEqual(preyA.energy, 0, "food-web predation should kill adjacent prey");
assert.ok(world.foodWebStats.energyTransferred > 0, "food-web predation should track energy transfer");

console.log("food web checks passed");
`, context);
