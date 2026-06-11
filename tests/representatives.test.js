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
  "js/sim/organisms-traits.js",
  "js/sim/organisms-indexes.js",
  "js/sim/food-web.js",
  "js/sim/organisms-behavior.js",
  "js/sim/evolution.js",
  "js/sim/organisms.js",
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

function getPlanetLatitudeForTile(y) {
  return y;
}

function getPlanetLongitudeForTile(x) {
  return x;
}

function isFertile() {
  return true;
}

PS.config.pools.maxOrganisms = 8;
PS.config.pools.maxFoodParticles = 8;
PS.pools.reset();
setWorldSeed("REPRESENTATIVE-RUNTIME-TEST");

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
world.tick = 14;

var parent = PS.sim.organisms.make(4, 4);
parent.energy = 240;
parent.age = 8;
parent.traits.vision = 5;
parent.traits.metabolism = 1;
parent.traits.intelligence = 0.8;
parent.traits.sociality = 0.6;
parent.traits.carnivory = 0.4;
parent.traits.bodySize = 2.2;
parent.traits.camouflage = 0.8;
parent.traits.thermalTolerance = 0.9;
parent.traits.waterDependency = 0.9;
parent.traits.movementTendency = 0.8;
parent.directionX = 1;
parent.directionY = 0;
world.organisms.push(parent);

var child = PS.sim.organisms.make(5, 4, parent.lineageId);
child.energy = 120;
child.age = 3;
child.traits.vision = 7;
child.traits.intelligence = 0.4;
child.traits.sociality = 0.2;
child.traits.carnivory = 0.1;
child.directionX = 0;
child.directionY = 0;
world.organisms.push(child);

var other = PS.sim.organisms.make(12, 12);
other.energy = 80;
other.age = 2;
world.organisms.push(other);
addFoodAt(6, 4);

var populations = PS.sim.representatives.refresh();
assert.strictEqual(populations.length, 2, "refresh should create one aggregate population per lineage");

var parentPopulation = PS.sim.representatives.getPopulation(parent.populationId);
assert.strictEqual(parentPopulation.count, 2, "aggregate population should count active representatives in lineage");
assert.strictEqual(parentPopulation.representativeIds.length, 2, "aggregate population should retain representative links");
assert.ok(parentPopulation.traitMean.vision > 0, "aggregate population should summarize trait means");
assert.ok(parentPopulation.traitVariance.vision >= 0, "aggregate population should summarize trait variance");
assert.ok(Math.abs(parentPopulation.traitMean.intelligence - 0.6) < 0.0001, "aggregate population should include intelligence means");
assert.ok(parentPopulation.traitVariance.sociality > 0, "aggregate population should include sociality variance");
assert.ok(parentPopulation.traitMean.carnivory > 0, "aggregate population should include carnivory means");
assert.ok(parentPopulation.traitMean.thermalTolerance >= 0, "aggregate population should include environment trait means");
assert.strictEqual(parentPopulation.foodWeb.role, "herbivore", "aggregate population should expose dominant trophic role");
assert.ok(parentPopulation.foodWeb.trophicBalance >= 0, "aggregate population should expose trophic balance metric");
assert.ok(world.foodWebSummary.roles.herbivore >= 2, "world food-web summary should count population roles");
assert.ok(parentPopulation.territoryCells.length > 0, "aggregate population should track territory cells");
assert.strictEqual(parentPopulation.pressure.food, 0, "pressure should summarize local food occupancy");
assert.ok(parentPopulation.pressure.scarcity >= 0, "pressure should summarize scarcity");

var representative = PS.sim.representatives.syncOrganism(parent, { selected: true });
assert.strictEqual(representative.populationId, parent.populationId, "representative should link to aggregate population");
assert.strictEqual(representative.speciesId, parent.speciesId, "representative should link to species");
assert.strictEqual(representative.selected, true, "selected representative should be marked for inspection");
assert.strictEqual(representative.behavior, "breeding", "representative behavior should derive from organism state");
assert.strictEqual(representative.target.type, "food", "representative target should derive from ecological context");
assert.ok(representative.morphologyPreview.label.indexOf("aquatic") >= 0, "representative should expose morphology habitat preview");
assert.ok(representative.morphologyPreview.label.indexOf("camouflaged") >= 0, "representative should expose morphology cover preview");
assert.ok(
  representative.morphologyPreview.label.indexOf("fast") >= 0 ||
  representative.morphologyPreview.label.indexOf("mobile") >= 0,
  "representative should expose morphology mobility preview"
);

PS.sim.representatives.pin(parent, true);
PS.sim.representatives.bookmark(parent, 0.8);
var inspected = PS.sim.representatives.inspect(parent.representativeId);
assert.strictEqual(inspected.representative.pinned, true, "representatives should support player pinning");
assert.strictEqual(inspected.representative.bookmarkScore, 0.8, "representatives should support bookmark scores");
assert.strictEqual(inspected.population.id, parent.populationId, "inspection should include aggregate population context");

for (var i = 0; i < 20; i++) {
  world.tick++;
  parent.x = getWrappedWorldX(parent.x + 1);
  PS.sim.representatives.syncOrganism(parent);
}

assert.ok(
  PS.sim.representatives.getRepresentative(parent.representativeId).history.length <= 12,
  "representative inspect history should remain bounded"
);

world.organisms.splice(world.organisms.indexOf(other), 1);
PS.sim.representatives.refresh();
assert.strictEqual(
  PS.sim.representatives.getRepresentative(other.representativeId).isActive,
  false,
  "representatives should retire when their active facade leaves the runtime"
);

console.log("representative organism lifecycle checks passed");
`, context);
