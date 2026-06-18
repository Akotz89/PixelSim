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
  "js/core/assert.js",
  "js/core/event-types.js",
  "js/core/events.js",
  "js/systems/pool-manager.js",
  "js/systems/pools.js",
  "js/sim/food-runtime.js",
  "js/sim/food-growth.js",
  "js/sim/food.js",
  "js/sim/organisms-traits.js",
  "js/sim/organisms-indexes.js",
  "js/sim/terrain-pressure.js",
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
  return tile ? tile.fertilityScore > 0.5 : false;
}

function recordOrganismBirth(count) {
  world.birthsRecorded = (world.birthsRecorded || 0) + count;
}

world.planetTiles = new Array(WORLD_WIDTH * WORLD_HEIGHT);

function setTile(x, y, tile) {
  world.planetTiles[getTileIndex(x, y)] = Object.assign({
    x: x,
    y: y,
    biome: "temperate grassland",
    elevation: 0.35,
    fertilityScore: 0.6,
    coastFactor: 0,
    shallowWater: 0,
    shelfStrength: 0,
    waterFlow: 0,
    riverStrength: 0,
    slope: 0,
    tectonicStress: 0,
    volcanicActivity: 0,
    latitude: getPlanetLatitudeForTile(y),
    longitude: getPlanetLongitudeForTile(x)
  }, tile || {});
}

for (var y = 0; y < WORLD_HEIGHT; y++) {
  for (var x = 0; x < WORLD_WIDTH; x++) {
    setTile(x, y, {});
  }
}

setTile(2, 2, { biome: "reef ocean", shallowWater: 0.9, shelfStrength: 0.8, coastFactor: 1, fertilityScore: 0.7 });
setTile(5, 5, { biome: "arid desert dunes", elevation: 0.45, fertilityScore: 0.05 });
setTile(8, 6, { biome: "alpine mountain", elevation: 0.92, slope: 0.8, tectonicStress: 0.7, fertilityScore: 0.2 });
setTile(11, 7, { biome: "jungle forest", fertilityScore: 0.95, riverStrength: 0.7 });
setTile(14, 8, { biome: "temperate grassland", fertilityScore: 0.95, riverStrength: 0.4 });
setTile(17, 9, { biome: "coastal archipelago", coastFactor: 0.92, shallowWater: 0.35, shelfStrength: 0.5, fertilityScore: 0.65 });

var aquatic = PS.sim.terrainPressure.getSample(2, 2);
var aquaticAgain = PS.sim.terrainPressure.getSample(2, 2);
var desert = PS.sim.terrainPressure.getSample(5, 5);
var mountain = PS.sim.terrainPressure.getSample(8, 6);
var forest = PS.sim.terrainPressure.getSample(11, 7);
var lush = PS.sim.terrainPressure.getSample(14, 8);
var archipelago = PS.sim.terrainPressure.getSample(17, 9);

assert.strictEqual(aquatic.terrainDriver, "aquatic", "water tiles should favor aquatic adaptation");
assert.strictEqual(aquaticAgain, aquatic, "terrain pressure should cache base samples per tile coordinate");
assert.ok(aquatic.target.waterDependency > 0.8, "aquatic pressure should favor water dependency");
assert.strictEqual(desert.terrainDriver, "desert", "desert tiles should expose desert pressure");
assert.ok(desert.target.thermalTolerance > lush.target.thermalTolerance, "desert should favor heat tolerance over lush terrain");
assert.ok(desert.target.waterDependency < lush.target.waterDependency, "desert should favor water efficiency");
assert.strictEqual(mountain.terrainDriver, "mountain", "high elevation should expose mountain pressure");
assert.ok(mountain.isolation > lush.isolation, "mountain terrain should increase isolation pressure");
assert.strictEqual(forest.terrainDriver, "forest", "forest tiles should expose forest pressure");
assert.ok(forest.target.camouflage > lush.target.camouflage, "forest pressure should favor camouflage");
assert.strictEqual(archipelago.terrainDriver, "coastal", "archipelago/coast tiles should expose coastal pressure");
assert.ok(archipelago.isolation > lush.isolation, "archipelago/coast should increase isolation pressure");
assert.ok(lush.innovationPressure < mountain.innovationPressure, "lush terrain should lower innovation pressure relative to difficult terrain");

var matchedDesertTraits = {
  terrainAffinity: desert.target.terrainAffinity,
  waterDependency: desert.target.waterDependency,
  thermalTolerance: desert.target.thermalTolerance,
  camouflage: desert.target.camouflage,
  movementTendency: desert.target.movementTendency,
  carnivory: desert.target.carnivory,
  reproductionEnergy: 200
};
var mismatchedDesertTraits = {
  terrainAffinity: 1,
  waterDependency: 0.95,
  thermalTolerance: 0.05,
  camouflage: 0.05,
  movementTendency: 0.05,
  carnivory: 0.05,
  reproductionEnergy: 200
};

assert.ok(
  PS.sim.terrainPressure.getEnergyCost(mismatchedDesertTraits, 5, 5) > PS.sim.terrainPressure.getEnergyCost(matchedDesertTraits, 5, 5),
  "mismatched terrain traits should increase survival energy cost"
);
assert.ok(
  PS.sim.terrainPressure.getReproductionMultiplier(mismatchedDesertTraits, 5, 5) > PS.sim.terrainPressure.getReproductionMultiplier(matchedDesertTraits, 5, 5),
  "mismatched terrain traits should increase reproduction threshold"
);
assert.ok(
  PS.sim.terrainPressure.getReproductionMultiplier(matchedDesertTraits, 5, 5) < 1,
  "matched difficult-terrain traits should favor faster reproduction"
);
var matchedDesertSample = PS.sim.terrainPressure.getMismatchSample(matchedDesertTraits, 5, 5);
var mismatchedDesertSample = PS.sim.terrainPressure.getMismatchSample(mismatchedDesertTraits, 5, 5);
assert.notStrictEqual(matchedDesertSample, desert, "terrain mismatch should not mutate cached base sample");
assert.ok(mismatchedDesertSample.mismatch > matchedDesertSample.mismatch, "cached terrain samples should still compute trait-specific mismatch");

PS.config.pools.maxOrganisms = 8;
PS.config.pools.maxFoodParticles = 8;
PS.pools.reset();
setWorldSeed("TERRAIN-PRESSURE-TEST");
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
world.tick = 240;

var suited = PS.sim.organisms.make(5, 5);
suited.energy = 600;
suited.traits = Object.assign(suited.traits, matchedDesertTraits);
var unsuited = PS.sim.organisms.make(5, 5);
unsuited.energy = 600;
unsuited.traits = Object.assign(unsuited.traits, mismatchedDesertTraits);
world.organisms.push(suited, unsuited);

assert.ok(getTerrainEnergyCost(unsuited.traits, 5, 5) > getTerrainEnergyCost(suited.traits, 5, 5), "organism behavior should use terrain pressure for survival cost");

var beforeBirths = world.birthsRecorded || 0;
unsuited.energy = unsuited.traits.reproductionEnergy + 1;
reproduceIfReady(unsuited);
assert.strictEqual(world.birthsRecorded || 0, beforeBirths, "terrain mismatch should suppress borderline reproduction");

var populations = PS.sim.representatives.refresh();
var population = PS.sim.representatives.getPopulation(suited.populationId);
assert.ok(populations.length > 0, "representative refresh should produce populations");
assert.ok(population.terrainPressure, "population should expose terrain pressure summary");
assert.strictEqual(population.terrainPressure.terrainDriver, "desert", "population pressure should retain dominant terrain driver");
assert.ok(world.terrainPressureSummary.pressure > 0, "world summary should aggregate terrain pressure");
assert.ok(world.timelineEvents.some(function(event) {
  return event.type === "biology.terrain-pressure" &&
    event.terrainDriver === "desert" &&
    event.trait &&
    event.lineageId === suited.lineageId &&
    event.speciesId === suited.speciesId &&
    event.populationId === suited.populationId &&
    Number(event.pressure) > 0;
}), "terrain pressure should emit watcher timeline payload with terrain fields");

var beforeSummaryPressure = world.terrainPressureSummary.pressure;
world.planetTiles[getTileIndex(5, 5)].biome = "jungle forest";
world.biologyAggregateRefreshSignature = getRepresentativeAggregateSignature();
PS.sim.representatives.refresh();
assert.notStrictEqual(
  world.terrainPressureSummary.topDriver,
  "desert",
  "representative fast path should refresh terrain pressure when environment changes"
);
assert.ok(world.terrainPressureSummary.pressure !== beforeSummaryPressure || world.terrainPressureSummary.topDriver === "forest", "terrain pressure summary should be recalculated on fast path");

console.log("terrain-driven evolution checks passed");
`, context);
