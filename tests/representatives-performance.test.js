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
  performance,
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

PS.config.pools.maxOrganisms = 1600;
PS.config.pools.maxFoodParticles = 64;
PS.pools.reset();
setWorldSeed("REPRESENTATIVE-PERF-TEST");

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
world.tick = 100;

var foodSearchCalls = 0;
findNearestFoodInBuckets = function(x, y, searchRadius) {
  foodSearchCalls++;
  return { x: x + 1, y: y };
};

for (var i = 0; i < 1400; i++) {
  var organism = PS.sim.organisms.make(i % WORLD_WIDTH, Math.floor(i / WORLD_WIDTH) % WORLD_HEIGHT, 1 + (i % 4));
  organism.energy = 80 + (i % 120);
  organism.age = i % 50;
  organism.traits.vision = 4 + (i % 8);
  organism.traits.metabolism = 1 + (i % 3);
  organism.traits.bodySize = 0.7 + (i % 5) * 0.2;
  organism.traits.camouflage = (i % 10) / 10;
  world.organisms.push(organism);
}

PS.sim.representatives.refresh();
world.tick++;

var startedAt = performance.now();
PS.sim.representatives.refresh();
var measuredMs = performance.now() - startedAt;
var stats = PS.sim.representatives.getPerfStats();

assert.strictEqual(stats.lastRefreshOrganisms, 1400, "perf fixture should refresh 1400 organisms");
assert.strictEqual(stats.lastTraitEnsureCalls, 0, "unchanged aggregate refresh should reuse ready trait summaries");
assert.strictEqual(stats.lastFullSyncCount, 0, "unselected refresh should not fully sync every representative");
assert.strictEqual(stats.lastSummarySyncCount, 0, "unchanged aggregate refresh should not rewrite every summary representative");
assert.strictEqual(stats.lastSkippedOrganisms, 1400, "unchanged aggregate refresh should skip unchanged organisms");
assert.strictEqual(stats.lastFoodSearchCount, 0, "unselected refresh should not perform nearest-food searches");
assert.strictEqual(foodSearchCalls, 0, "nearest-food lookup should be skipped for summary-only refresh");
assert.ok(stats.lastRefreshMs < 1, "representative refresh should stay under 1ms for 1400 organisms, got " + stats.lastRefreshMs.toFixed(3) + "ms");

PS.sim.representatives.select(world.organisms[0]);
foodSearchCalls = 0;
world.tick++;
PS.sim.representatives.refresh();
stats = PS.sim.representatives.getPerfStats();

assert.strictEqual(stats.lastFoodSearchCount, 1, "refresh should only search food for selected/pinned representatives");
assert.strictEqual(foodSearchCalls, 1, "nearest-food lookup should run only for the selected representative");
assert.strictEqual(stats.lastSkippedOrganisms, 1400, "selected refresh should still reuse unchanged aggregate summaries");

console.log("representative refresh performance checks passed", JSON.stringify({
  measuredMs: Number(measuredMs.toFixed(3)),
  reportedMs: Number(stats.lastRefreshMs.toFixed(3)),
  traitEnsureCalls: stats.lastTraitEnsureCalls,
  foodSearchCalls: stats.lastFoodSearchCount
}));
`, context);
