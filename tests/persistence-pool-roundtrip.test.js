const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

function makeElement() {
  return {
    width: 0,
    height: 0,
    style: {},
    classList: { add: function() {}, remove: function() {}, toggle: function() {} },
    querySelector: function() {
      return makeElement();
    },
    addEventListener: function() {},
    removeEventListener: function() {},
    getContext: function() {
      return {};
    },
    hidden: false,
    textContent: ""
  };
}

const context = {
  assert,
  console,
  Math,
  Number,
  String,
  Boolean,
  Object,
  Array,
  JSON,
  Error,
  Float32Array,
  Uint8Array,
  Uint32Array,
  Int32Array,
  Promise,
  Date,
  RegExp,
  performance: {},
  window: {
    addEventListener: function() {},
    indexedDB: null
  },
  document: {
    getElementById: function() {
      return makeElement();
    },
    querySelectorAll: function() {
      return [];
    }
  }
};
context.window.window = context.window;
context.window.document = context.document;
vm.createContext(context);

// Load source files in manifest order
var sourceFiles = [
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
  "js/core/entity-registry.js",
  "js/sim/organisms-traits.js",
  "js/sim/organism-ai.js",
  "js/sim/organisms-behavior.js",
  "js/sim/trait-registry.js",
  "js/systems/persistence-config.js",
  "js/systems/persistence-db.js",
  "js/systems/persistence-restore-core.js",
  "js/systems/persistence-restore-entities.js",
  "js/systems/save-migration.js"
];

for (var i = 0; i < sourceFiles.length; i++) {
  vm.runInContext(read(sourceFiles[i]), context, { filename: sourceFiles[i] });
}

// Provide stub functions needed by persistence
vm.runInContext(`
  function nearEqual(actual, expected, tolerance, message) {
    tolerance = tolerance || 0.001;
    assert.ok(
      Math.abs(actual - expected) < tolerance,
      message + " (got " + actual + ", expected " + expected + ")"
    );
  }

  function getRandomLatLonInTile(x, y) {
    return { latitude: y + 0.25, longitude: x + 0.75 };
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

  function getEntitySurfacePosition(entity) {
    return { latitude: entity.latitude, longitude: entity.longitude };
  }

  function getPlanetLatitudeForTile(y) { return y; }
  function getPlanetLongitudeForTile(x) { return x; }
  function getTileGreatCircleDistanceKm() { return 0; }
  function isFertile() { return true; }
  function normalizeSeedText(text) { return String(text || "ROUNDTRIP"); }
  function hashSeedText(text) { return 42; }
  function normalizeLongitude(lng) { return Number(lng) || 0; }
  function getPlanetTileCenterLatLon(x, y) { return { latitude: y, longitude: x }; }
  function recordOrganismDeath(count) {}
  function refreshLineageRegistry() {}
  function rebuildFoodPositions() {}
  function rebuildSettlementIndexes() {}
  function rebuildPlanetaryBodyIndexes() {}
  function rebuildStarSystemIndexes() {}
  function rebuildEmpireSectorIndexes() {}

  PS.config.pools.maxOrganisms = 10;
  PS.config.pools.maxFoodParticles = 5;
  PS.pools.reset();
`, context);

// Test: Create organism, save traits, reset pool, restore organism, verify traits match
vm.runInContext(`
  // Create an organism with specific trait values (within CONFIG bounds)
  var org = makeOrganism(10, 20, 1);
  org.traits.vision = 28;           // [8, 36] integer
  org.traits.metabolism = 2;        // [1, 3] integer
  org.traits.reproductionEnergy = 280; // [220, 340] integer
  org.traits.movementTendency = 0.08;  // [0.02, 0.14]
  org.traits.terrainAffinity = 0.75;   // [0, 1]
  org.traits.intelligence = 0.5;       // [0, 1] - use 0.5 (exact in float32)
  org.traits.sociality = 0.25;         // [0, 1] - use 0.25 (exact in float32)
  org.traits.carnivory = 0.5;          // [0, 1] - use 0.5 (exact in float32)
  org.traits.bodySize = 2.5;           // [0.5, 3]
  org.traits.limbCount = 6;            // [0, 12] integer
  org.traits.bodyShape = 3;            // [0, 7] integer
  org.traits.appendageType = 2;        // [0, 7] integer
  org.traits.camouflage = 0.5;         // [0, 1]
  org.traits.thermalTolerance = 0.75;  // [0, 1]
  org.traits.waterDependency = 0.25;   // [0, 1]
  org.energy = 99;

  // Verify traits are written through to typed arrays (integers are exact)
  assert.strictEqual(org.traits.vision, 28, "pre-save: vision should be 28");
  assert.strictEqual(org.traits.metabolism, 2, "pre-save: metabolism should be 2");
  assert.strictEqual(org.traits.bodySize, 2.5, "pre-save: bodySize should be 2.5");
  assert.strictEqual(org.traits.limbCount, 6, "pre-save: limbCount should be 6");
  assert.strictEqual(org.traits.intelligence, 0.5, "pre-save: intelligence should be 0.5");

  // Save the organism to a plain object (simulates persistence)
  var savedOrg = copyOrganismForSave(org);

  // Verify saved data has materialized trait values, not pool indices
  assert.strictEqual(savedOrg.traits.vision, 28, "saved: vision should be materialized value");
  assert.strictEqual(savedOrg.traits.metabolism, 2, "saved: metabolism should be materialized value");
  assert.strictEqual(savedOrg.traits.reproductionEnergy, 280, "saved: reproductionEnergy should be materialized");
  assert.strictEqual(savedOrg.traits.bodySize, 2.5, "saved: bodySize should be materialized");
  assert.strictEqual(savedOrg.traits.limbCount, 6, "saved: limbCount should be materialized");
  assert.strictEqual(savedOrg.traits.bodyShape, 3, "saved: bodyShape should be materialized");
  assert.strictEqual(savedOrg.traits.appendageType, 2, "saved: appendageType should be materialized");
  assert.strictEqual(savedOrg.traits.intelligence, 0.5, "saved: intelligence should be materialized");
  assert.strictEqual(savedOrg.traits.camouflage, 0.5, "saved: camouflage should be materialized");
  assert.strictEqual(savedOrg.traits.terrainAffinity, 0.75, "saved: terrainAffinity should be materialized");
  assert.strictEqual(savedOrg.traits.thermalTolerance, 0.75, "saved: thermalTolerance should be materialized");
  assert.strictEqual(savedOrg.traits.waterDependency, 0.25, "saved: waterDependency should be materialized");

  // Verify saved traits are plain data, not accessor descriptors
  var traitDescriptor = Object.getOwnPropertyDescriptor(savedOrg.traits, "vision");
  assert.strictEqual(typeof traitDescriptor.get, "undefined", "saved trait should be a data property, not an accessor");
  assert.strictEqual(traitDescriptor.value, 28, "saved trait value property should hold the actual number");

  // Reset pool (simulates what happens on load)
  PS.pools.reset();

  // Verify pool arrays are zeroed
  // Verify pool trait buffer is zeroed (traitBuffer is the canonical store)
  assert.strictEqual(PS.pools.organism.arrays.traitBuffer[0], 0, "after reset: packed trait buffer should be zeroed");

  // Restore organism from saved data
  var restoredOrg = restoreOrganism(savedOrg);
  assert.ok(restoredOrg, "restored organism should not be null");

  // Verify restored traits match original values
  assert.strictEqual(restoredOrg.traits.vision, 28, "restored: vision should be 28");
  assert.strictEqual(restoredOrg.traits.metabolism, 2, "restored: metabolism should be 2");
  assert.strictEqual(restoredOrg.traits.reproductionEnergy, 280, "restored: reproductionEnergy should be 280");
  assert.strictEqual(restoredOrg.traits.bodySize, 2.5, "restored: bodySize should round-trip");
  assert.strictEqual(restoredOrg.traits.limbCount, 6, "restored: limbCount should round-trip");
  assert.strictEqual(restoredOrg.traits.bodyShape, 3, "restored: bodyShape should round-trip");
  assert.strictEqual(restoredOrg.traits.appendageType, 2, "restored: appendageType should round-trip");
  assert.strictEqual(restoredOrg.traits.intelligence, 0.5, "restored: intelligence should round-trip");
  assert.strictEqual(restoredOrg.traits.camouflage, 0.5, "restored: camouflage should round-trip");
  assert.strictEqual(restoredOrg.traits.terrainAffinity, 0.75, "restored: terrainAffinity should round-trip");
  assert.strictEqual(restoredOrg.traits.thermalTolerance, 0.75, "restored: thermalTolerance should round-trip");
  assert.strictEqual(restoredOrg.traits.waterDependency, 0.25, "restored: waterDependency should round-trip");
  // Float comparisons for values not exactly representable in float32
  nearEqual(restoredOrg.traits.movementTendency, 0.08, 0.001, "restored: movementTendency should round-trip");

  // Verify restored traits are backed by pool arrays (not plain object)
  var restoredDescriptor = Object.getOwnPropertyDescriptor(restoredOrg.traits, "vision");
  assert.strictEqual(typeof restoredDescriptor.get, "function", "restored trait should be pool-backed accessor");

  // Verify pool array has correct values
  var poolIndex = restoredOrg.poolIndex;
  assert.strictEqual(PS.pools.organism.arrays.vision[poolIndex], 28, "pool array should contain restored vision value");
  assert.strictEqual(PS.pools.organism.arrays.metabolism[poolIndex], 2, "pool array should contain restored metabolism value");
  assert.strictEqual(PS.pools.organism.arrays.bodySize[poolIndex], 2.5, "pool array should contain restored bodySize value");

  console.log("persistence pool round-trip checks passed");
`, context);

// Test: Float32 precision - verify traits don't lose significant precision
vm.runInContext(`
  PS.pools.reset();
  var precOrg = makeOrganism(5, 5, 2);
  precOrg.traits.movementTendency = 0.065;
  var precSaved = copyOrganismForSave(precOrg);
  PS.pools.reset();
  var precRestored = restoreOrganism(precSaved);
  nearEqual(precRestored.traits.movementTendency, 0.065, 0.001,
    "float32 precision should preserve trait values within tolerance");

  console.log("persistence pool float32 precision checks passed");
`, context);
