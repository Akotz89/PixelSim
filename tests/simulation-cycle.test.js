require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

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
  performance,
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
  "js/core/prng.js",
  "js/core/utils.js",
  "js/core/math.js",
  "js/core/noise.js",
  "js/core/trait-schema.js",
  "js/core/config.js",
  "js/core/world-grid.js",
  "js/core/world-gen.js",
  "js/core/planet-metrics.js",
  "js/render/planet-grid.js",
  "js/render/planet-surface.js",
  "js/render/terrain-hydrology.js",
  "js/render/terrain-seeding.js",
  "js/systems/pool-manager.js",
  "js/systems/pools.js",
  "js/render/ranmap.js",
  "js/render/particles.js",
  "js/sim/food-runtime.js",
  "js/sim/food-growth.js",
  "js/sim/food.js",
  "js/sim/organisms-traits.js",
  "js/sim/organisms-indexes.js",
  "js/sim/organisms-behavior.js",
  "js/sim/evolution.js",
  "js/sim/organisms.js",
  "js/sim/settlements-state.js",
  "js/sim/resource-registry.js",
  "js/sim/settlements-growth.js",
  "js/sim/civilizations-orbital.js",
  "js/sim/civilizations-probes.js",
  "js/sim/civilizations-stars.js",
  "js/sim/civilizations-empire.js",
  "js/sim/settlements-founding.js",
  "js/sim/settlements-routes.js",
  "js/sim/settlements-runtime.js",
  "js/sim/settlements.js",
  "js/sim/civilizations.js",
  "js/systems/persistence-db.js",
  "js/systems/save-migration.js",
  "js/systems/persistence-config.js",
  "js/systems/persistence-restore-core.js",
  "js/systems/persistence-restore-entities.js",
  "js/systems/persistence-save-data.js",
  "js/systems/persistence-io.js",
  "js/systems/persistence.js",
  "js/main-ecosystem-summary.js",
  "js/main-ecosystem-stability.js",
  "js/main-runtime.js",
  "js/layers/registry.js",
  "js/main-simulation.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

PS.assets = PS.assets || {};
PS.assets.particlesData = { emitters: [] };

function resetPlanetSurfaceChunkCache() {}
function resetLocalSurfaceRenderChunkCache() {}
function resetPlanetGroundFeatureBlockCache() {}

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

function wrapPlanetLongitudeDelta(delta) {
  return delta;
}

function normalizeLongitude(longitude) {
  var normalized = ((Number(longitude) || 0) + 180) % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized - 180;
}

function getPlanetRadiusKm() {
  return 6371;
}

function syncControlStates() {}
function drawWorld() {}
function updateHud() {}

world.seedText = "SIM-CYCLE-INTEGRATION";
clearWorld();
seedWorld();

assert.strictEqual(world.tick, 0, "seed should start at tick 0");
assert.ok(world.organisms.length > 0, "seed should create organisms");
assert.ok(world.food.length > 0, "seed should create food");
assert.ok(world.terrain.length === WORLD_WIDTH * WORLD_HEIGHT, "seed should create full terrain grid");

for (var i = 0; i < 50; i++) {
  updateWorld(1 / 60);
}

var saveData = PS.persistence.createSaveData();
assert.strictEqual(saveData.tick, 50, "save data should capture the current world tick");
world.tick = 1;
PS.persistence.applySaveData(saveData);
assert.strictEqual(world.tick, 50, "restore should recover the saved world tick");

for (var secondRunIndex = 0; secondRunIndex < 50; secondRunIndex++) {
  updateWorld(1 / 60);
}

assert.strictEqual(world.tick, 100, "100 updates should advance the simulation tick");
assert.ok(world.organisms.length > 0, "organisms should survive the 100 tick integration cycle");
assert.ok(world.food.length > 0, "food should remain indexed after the 100 tick integration cycle");
assert.ok(world.ecosystemSummary, "integration cycle should refresh ecosystem summary");
assert.ok(Array.isArray(world.ecosystemHistory), "integration cycle should maintain ecosystem history");
assert.ok(world.tickProfileMs && typeof world.tickProfileMs.organisms === "number", "integration cycle should record tick profile data");

CONFIG.MAX_ORGANISMS = 1600;
CONFIG.SETTLEMENT_MIN_LINEAGE_POPULATION = 1500;
CONFIG.SETTLEMENT_MIN_LINEAGE_PEAK_POPULATION = 1500;
CONFIG.SIM_SUMMARY_UPDATE_INTERVAL = 1000;
CONFIG.MAX_FOOD = 0;
PS.config.pools.maxOrganisms = 1600;

function resetPerformanceFixture() {
  PS.pools.reset();
  world.organisms = [];
  world.food = [];
  world.foodPositions = {};
  world.foodBuckets = {};
  world.organismBuckets = {};
  world.organismsByLineage = {};
  world.settlements = [];
  world.settlementRoutes = [];
  world.tick = 0;
  PS.sim.settlements.rebuildIndexes();

  for (var perfIndex = 0; perfIndex < 1400; perfIndex++) {
    var perfX = perfIndex % WORLD_WIDTH;
    var perfY = Math.floor(perfIndex / WORLD_WIDTH) % WORLD_HEIGHT;
    var perfOrganism = PS.sim.organisms.make(perfX, perfY, 1 + (perfIndex % 7));
    perfOrganism.energy = 55 + (perfIndex % 45);
    perfOrganism.age = perfIndex % 80;
    perfOrganism.directionX = 0;
    perfOrganism.directionY = 0;
    perfOrganism.traits.vision = 0;
    perfOrganism.traits.metabolism = 0;
    perfOrganism.traits.movementTendency = 0;
    perfOrganism.traits.reproductionEnergy = 999999;
    perfOrganism.traits.terrainAffinity = getTerrainAffinityTargetValue(perfX, perfY);
    if (Number.isFinite(Number(perfOrganism.poolIndex))) {
      var perfPoolIndex = perfOrganism.poolIndex;
      PS.pools.organism.arrays.energy[perfPoolIndex] = perfOrganism.energy;
      PS.pools.organism.arrays.age[perfPoolIndex] = perfOrganism.age;
      PS.pools.organism.arrays.directionX[perfPoolIndex] = 0;
      PS.pools.organism.arrays.directionY[perfPoolIndex] = 0;
      PS.pools.organism.arrays.vision[perfPoolIndex] = perfOrganism.traits.vision;
      PS.pools.organism.arrays.metabolism[perfPoolIndex] = perfOrganism.traits.metabolism;
      PS.pools.organism.arrays.movementTendency[perfPoolIndex] = perfOrganism.traits.movementTendency;
      PS.pools.organism.arrays.reproductionEnergy[perfPoolIndex] = perfOrganism.traits.reproductionEnergy;
      PS.pools.organism.arrays.terrainAffinity[perfPoolIndex] = perfOrganism.traits.terrainAffinity;
    }
    world.organisms.push(perfOrganism);
  }

  PS.sim.organisms.rebuildIndexes();
  for (var warmupTick = 0; warmupTick < 10; warmupTick++) {
    updateWorld(1 / 60);
  }
}

var performanceTicks = 100;
var performanceSamples = 3;
var simulationAverageTickBudgetMs = 20;
var performanceResults = [];
var bestPerformanceResult = null;

for (var perfSample = 0; perfSample < performanceSamples; perfSample++) {
  resetPerformanceFixture();

  var pooledPathEligible = true;
  for (var pooledCheckIndex = 0; pooledCheckIndex < world.organisms.length; pooledCheckIndex++) {
    var pooledCheckOrganism = world.organisms[pooledCheckIndex];
    if (
      !pooledCheckOrganism ||
      !Number.isFinite(Number(pooledCheckOrganism.poolIndex)) ||
      !PS.pools.organism.arrays.active[pooledCheckOrganism.poolIndex]
    ) {
      pooledPathEligible = false;
      break;
    }
  }

  var performanceStartedAt = performance.now();

  for (var perfTick = 0; perfTick < performanceTicks; perfTick++) {
    updateWorld(1 / 60);
  }

  var sampleResult = {
    averageTickMs: (performance.now() - performanceStartedAt) / performanceTicks,
    organisms: world.organisms.length,
    pooled: pooledPathEligible
  };
  performanceResults.push({
    averageTickMs: Number(sampleResult.averageTickMs.toFixed(3)),
    organisms: sampleResult.organisms,
    pooled: sampleResult.pooled
  });

  if (
    sampleResult.pooled &&
    sampleResult.organisms >= 1300 &&
    (!bestPerformanceResult || sampleResult.averageTickMs < bestPerformanceResult.averageTickMs)
  ) {
    bestPerformanceResult = sampleResult;
  }
}

assert.ok(bestPerformanceResult, "performance fixture should exercise pooled organism updates with at least 1300 organisms");
assert.ok(
  bestPerformanceResult.averageTickMs < simulationAverageTickBudgetMs,
  "1400-organism simulation tick should average under " + simulationAverageTickBudgetMs + "ms, got " + bestPerformanceResult.averageTickMs.toFixed(3) + "ms from samples " + JSON.stringify(performanceResults)
);

console.log("simulation cycle checks passed", JSON.stringify({
  tick: world.tick,
  organisms: world.organisms.length,
  food: world.food.length,
  history: world.ecosystemHistory.length,
  averageTickMs: Number(bestPerformanceResult.averageTickMs.toFixed(3)),
  performanceSamples: performanceResults
}));
`, context, { filename: "tests/simulation-cycle.vm.js" });
