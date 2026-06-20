const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  organismAi: {},
  window: {
    addEventListener() {},
    organismAi: {}
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
  "js/sim/mass-extinction.js",
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

CONFIG.MASS_EXTINCTION_MIN_KILL_RATE = 0.2;
CONFIG.MASS_EXTINCTION_MAX_KILL_RATE = 0.75;
CONFIG.MASS_EXTINCTION_REFUGIA_RATIO = 0.2;
CONFIG.MASS_EXTINCTION_RECOVERY_WINDOW_TICKS = 120;
CONFIG.MASS_EXTINCTION_RECOVERY_REPRODUCTION_MULTIPLIER = 0.6;
PS.config.refreshFromConstants();
setWorldSeed("MASS-EXTINCTION-TEST");

world.planetTiles = new Array(WORLD_WIDTH * WORLD_HEIGHT);
for (var tileY = 0; tileY < WORLD_HEIGHT; tileY++) {
  for (var tileX = 0; tileX < WORLD_WIDTH; tileX++) {
    world.planetTiles[getTileIndex(tileX, tileY)] = {
      biome: "ash steppe",
      elevation: 0.4,
      fertilityScore: 0.55,
      coastFactor: 0.1,
      shallowWater: 0,
      shelfStrength: 0,
      riverStrength: 0,
      slope: 0.3,
      latitude: getPlanetLatitudeForTile(tileY),
      longitude: getPlanetLongitudeForTile(tileX)
    };
  }
}

world.geology = {
  volcanicActivity: 0.98,
  tectonicActivity: 0.7,
  ageTicks: 9000
};
world.atmosphere = {
  oxygenStress: 0.2,
  temperatureC: 9,
  gases: { o2: 0.19, co2: 0.08, ch4: 0.01, sulfur: 0.8 }
};
world.foodWebSummary = {
  roles: { producer: 40, herbivore: 6, predator: 2, scavenger: 1, decomposer: 0, omnivore: 1 },
  trophicBalance: 72,
  scarcity: 0.2,
  predatorPressure: 0.2,
  recoveryTrend: "stable"
};
world.tick = 2400;
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
world.extinctionEvents = [];
world.eventLog = [];
world.timelineEvents = [];

function makeTestOrganism(x, y, lineageId, speciesId, populationId, traits) {
  var organism = organisms.make(x, y, lineageId);
  organism.speciesId = speciesId;
  organism.populationId = populationId;
  organism.energy = 260;
  organism.traits = Object.assign(normalizeOrganismTraits({}), traits);
  return organism;
}

var resistantTraits = {
  thermalTolerance: 1,
  movementTendency: CONFIG.TRAIT_MOVEMENT_TENDENCY_MAX,
  reproductionEnergy: CONFIG.TRAIT_REPRODUCTION_ENERGY_MIN,
  metabolism: CONFIG.TRAIT_METABOLISM_MIN,
  terrainAffinity: 0.5,
  waterDependency: 0.5,
  bodySize: 2,
  camouflage: 0.7
};
var vulnerableTraits = {
  thermalTolerance: 0,
  movementTendency: CONFIG.TRAIT_MOVEMENT_TENDENCY_MIN,
  reproductionEnergy: CONFIG.TRAIT_REPRODUCTION_ENERGY_MAX,
  metabolism: CONFIG.TRAIT_METABOLISM_MAX,
  terrainAffinity: 1,
  waterDependency: 1,
  bodySize: 0.5,
  camouflage: 0
};

for (var i = 0; i < 6; i++) {
  world.organisms.push(makeTestOrganism(8 + i, 8, 1, 1, 1, vulnerableTraits));
}

for (var j = 0; j < 4; j++) {
  world.organisms.push(makeTestOrganism(20 + j, 8, 2, 2, 2, resistantTraits));
}

representatives.refresh();
world.foodWebSummary = {
  roles: { producer: 40, herbivore: 6, predator: 2, scavenger: 1, decomposer: 0, omnivore: 1 },
  trophicBalance: 72,
  scarcity: 0.2,
  predatorPressure: 0.2,
  recoveryTrend: "stable"
};
var pressure = massExtinction.evaluatePressure();
assert.strictEqual(pressure.eventType, "volcanic-winter", "context should prefer volcanic winter from geology and sulfur pressure");
assert.ok(pressure.pressure >= 0.8, "catastrophe pressure should be high enough to trigger");

var event = massExtinction.trigger({ pressureSummary: pressure, severityScore: 0.6 });
assert.ok(event, "forced extinction should produce an event record");
assert.strictEqual(event.eventType, "volcanic-winter", "event should preserve selected catastrophe type");
assert.strictEqual(event.prePopulation, 10, "event should capture pre-loss population");
assert.ok(event.postPopulation > 0, "refugia should prevent a complete wipeout");
assert.ok(event.postPopulation < event.prePopulation, "event should remove part of the population");
assert.ok((event.losses.bySpecies["1"] || 0) > (event.losses.bySpecies["2"] || 0), "vulnerable low-thermal species should suffer larger losses");
assert.ok(event.survivors.byPopulation["2"] >= 1, "resistant population should retain refugia survivors");
assert.ok(event.affectedSpecies.length >= 1, "event should report affected species");
assert.ok(event.recoveryWindow.endTick > world.tick, "event should start a bounded recovery window");
assert.ok(event.recoveryWindow.radiationCandidateIds.indexOf(2) >= 0, "surviving population should become a radiation candidate");
assert.strictEqual(world.extinctionEvents.length, 1, "bounded extinction ledger should record event");
assert.ok(world.timelineEvents.some(function(timelineEvent) {
  return timelineEvent.type === "extinction.event" &&
    timelineEvent.eventType === "volcanic-winter" &&
    timelineEvent.losses.total === event.losses.total &&
    timelineEvent.recoveryWindow.endTick === event.recoveryWindow.endTick;
}), "timeline should preserve structured extinction event metrics");
assert.ok(world.timelineEvents.some(function(timelineEvent) {
  return timelineEvent.type === "extinction.recovery" &&
    timelineEvent.radiationCandidateIds.indexOf(2) >= 0;
}), "timeline should include adaptive radiation recovery event");

var survivor = world.organisms.filter(function(organism) {
  return organism.populationId === 2;
})[0];
assert.ok(survivor, "resistant population should still have a survivor");
assert.ok(
  massExtinction.getRecoveryReproductionMultiplier(survivor) < 1,
  "survivor population should receive recovery reproduction boost"
);
assert.ok(representatives.getPopulation(1).isActive === false || representatives.getPopulation(1).count < 6, "aggregate population should reflect killed organisms");

console.log("mass extinction checks passed");
`, context);
