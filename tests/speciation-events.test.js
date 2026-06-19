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
  "js/core/config.js",
  "js/ui/dom-refs.js",
  "js/systems/state.js",
  "js/core/utils.js",
  "js/core/trait-schema.js",
  "js/core/world-grid.js",
  "js/core/assert.js",
  "js/core/event-types.js",
  "js/core/events.js",
  "js/systems/pool-manager.js",
  "js/systems/pools.js",
  "js/sim/food-runtime.js",
  "js/sim/food-growth.js",
  "js/sim/food.js",
  "js/core/entity-registry.js",
  "js/sim/organisms-traits.js",
  "js/sim/organisms-indexes.js",
  "js/sim/terrain-pressure.js",
  "js/sim/speciation.js",
  "js/sim/food-web.js",
  "js/sim/organisms-behavior.js",
  "js/sim/evolution.js",
  "js/sim/organisms.js",
  "js/sim/representatives.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

function getRandomLatLonInTile(x, y) {
  return {
    latitude: getPlanetLatitudeForTile(y),
    longitude: getPlanetLongitudeForTile(x)
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
  return 90 - (y / Math.max(1, WORLD_HEIGHT - 1)) * 180;
}

function getPlanetLongitudeForTile(x) {
  return -180 + (x / Math.max(1, WORLD_WIDTH - 1)) * 360;
}

function getTileIndex(x, y) {
  return getClampedWorldY(y) * WORLD_WIDTH + getWrappedWorldX(x);
}

function getPlanetTile(x, y) {
  return world.planetTiles[getTileIndex(x, y)] || null;
}

function isFertile(x, y) {
  var tile = getPlanetTile(x, y);
  return tile ? tile.fertilityScore > 0.5 : true;
}

PS.config.pools.maxOrganisms = 12;
PS.config.pools.maxFoodParticles = 8;
PS.pools.reset();
CONFIG.SPECIATION_DISTANCE = 0.36;
CONFIG.SPECIATION_MIN_INTERVAL_TICKS = 10;
PS.config.refreshFromConstants();
setWorldSeed("SPECIATION-EVENTS-TEST");

world.planetTiles = new Array(WORLD_WIDTH * WORLD_HEIGHT);
for (var tileY = 0; tileY < WORLD_HEIGHT; tileY++) {
  for (var tileX = 0; tileX < WORLD_WIDTH; tileX++) {
    world.planetTiles[getTileIndex(tileX, tileY)] = {
      biome: tileX < 8 ? "coastal archipelago" : "arid desert",
      elevation: tileX < 8 ? 0.2 : 0.7,
      fertilityScore: tileX < 8 ? 0.8 : 0.1,
      coastFactor: tileX < 8 ? 0.9 : 0,
      shallowWater: tileX < 8 ? 0.35 : 0,
      shelfStrength: tileX < 8 ? 0.5 : 0,
      riverStrength: 0,
      slope: tileX < 8 ? 0.1 : 0.7,
      latitude: getPlanetLatitudeForTile(tileY),
      longitude: getPlanetLongitudeForTile(tileX)
    };
  }
}

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
world.species = [];
world.speciesById = {};
world.speciationEvents = [];
world.eventLog = [];
world.timelineEvents = [];
world.tick = 300;
world.nextSpeciesId = 2;

var founder = PS.sim.organisms.make(2, 6);
founder.speciesId = 1;
founder.populationId = 1;
founder.traits = {
  vision: 8,
  metabolism: 1,
  reproductionEnergy: 220,
  movementTendency: 0.02,
  terrainAffinity: 0.1,
  intelligence: 0,
  sociality: 0,
  carnivory: 0,
  bodySize: 0.5,
  limbCount: 1,
  bodyShape: 0,
  appendageType: 0,
  camouflage: 0,
  thermalTolerance: 0,
  waterDependency: 0
};
PS.sim.speciation.ensureSpecies(1, {
  lineageId: founder.lineageId,
  founderTraits: founder.traits,
  traitMean: founder.traits,
  createdTick: 1,
  population: 2,
  activePopulation: 2
});

var divergent = PS.sim.organisms.make(6, 6, founder.lineageId);
divergent.speciesId = 1;
divergent.populationId = 1;
divergent.traits = {
  vision: 36,
  metabolism: 3,
  reproductionEnergy: 340,
  movementTendency: 0.14,
  terrainAffinity: 1,
  intelligence: 1,
  sociality: 1,
  carnivory: 1,
  bodySize: 3,
  limbCount: 12,
  bodyShape: 7,
  appendageType: 7,
  camouflage: 1,
  thermalTolerance: 1,
  waterDependency: 1
};
world.organisms.push(founder, divergent);

var distance = PS.sim.speciation.traitDistance(founder.traits, divergent.traits);
assert.ok(distance > 0.9, "normalized trait distance should include expanded AZR-284 traits");

PS.sim.representatives.refresh();
var parentPopulation = PS.sim.representatives.getPopulation(1);
var childPopulation = world.biologyPopulations.filter(function(population) {
  return population.parentPopulationId === 1 && population.parentSpeciesId === 1;
})[0];
var newSpeciesId = childPopulation ? childPopulation.speciesId : 0;
var speciesRecord = PS.sim.speciation.getSpecies(newSpeciesId);

assert.ok(newSpeciesId > 1, "speciation should assign a new stable species id");
assert.strictEqual(speciesRecord.parentId, 1, "new species should preserve parent species link");
assert.strictEqual(speciesRecord.lineageId, founder.lineageId, "new species should preserve lineage id");
assert.strictEqual(parentPopulation.speciesId, 1, "parent aggregate should keep parent species id");
assert.strictEqual(childPopulation.parentSpeciesId, 1, "child aggregate should record parent species");
assert.ok(childPopulation.speciation.divergence >= CONFIG.SPECIATION_DISTANCE, "child population should retain divergence evidence");
assert.ok(childPopulation.speciation.isolation > 0, "geographic isolation should contribute through terrain pressure");
assert.ok(world.speciesSummary.activeCount >= 1, "species summary should expose active species count");
assert.strictEqual(world.speciationEvents.length, 1, "bounded speciation event history should record the split");
assert.ok(world.timelineEvents.some(function(event) {
  return event.type === "biology.speciation" &&
    event.id === newSpeciesId &&
    event.parentId === 1 &&
    event.lineageId === founder.lineageId &&
    event.speciesId === newSpeciesId &&
    event.populationId === childPopulation.id &&
    event.cause &&
    Number(event.divergence) >= CONFIG.SPECIATION_DISTANCE &&
    event.traits;
}), "speciation should emit structured watcher timeline payload");
assert.strictEqual(founder.speciesId, 1, "deterministic parent subset should keep parent species id");
assert.strictEqual(divergent.speciesId, newSpeciesId, "deterministic child subset should receive new species id");
assert.strictEqual(divergent.populationId, childPopulation.id, "child subset should receive child population id");

world.tick += 1;
PS.sim.representatives.refresh();
assert.strictEqual(world.speciationEvents.length, 1, "guardrails should prevent immediate species explosion");

console.log("speciation event checks passed");
`, context);
