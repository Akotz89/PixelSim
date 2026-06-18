require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

let assertionCount = 0;
function check(value, message) {
  assertionCount++;
  assert.ok(value, message);
}

function equal(actual, expected, message) {
  assertionCount++;
  assert.strictEqual(actual, expected, message);
}

function deepEqual(actual, expected, message) {
  assertionCount++;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected, message);
}

function runFile(context, file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInContext(source, context, { filename: file });
}

function createContext() {
  const context = {
    console,
    Int32Array,
    Float32Array,
    Uint8Array,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    JSON,
    WORLD_WIDTH: 20,
    WORLD_HEIGHT: 10,
    CONFIG: {
      SPATIAL_CHUNK_SIZE: 4,
      ORGANISM_SPATIAL_BUCKET_SIZE: 4,
      TRAIT_VISION_MIN: 4,
      TRAIT_VISION_MAX: 24,
      TRAIT_VISION_DEFAULT: 12,
      TRAIT_VISION_MUTATION_STEP: 2,
      TRAIT_METABOLISM_MIN: 1,
      TRAIT_METABOLISM_MAX: 10,
      TRAIT_METABOLISM_DEFAULT: 5,
      TRAIT_METABOLISM_MUTATION_STEP: 1,
      TRAIT_REPRODUCTION_ENERGY_MIN: 10,
      TRAIT_REPRODUCTION_ENERGY_MAX: 100,
      TRAIT_REPRODUCTION_ENERGY_DEFAULT: 50,
      TRAIT_REPRODUCTION_ENERGY_MUTATION_STEP: 5,
      TRAIT_MOVEMENT_TENDENCY_MIN: 0,
      TRAIT_MOVEMENT_TENDENCY_MAX: 1,
      TRAIT_MOVEMENT_TENDENCY_DEFAULT: 0.5,
      TRAIT_MOVEMENT_TENDENCY_MUTATION_STEP: 0.1,
      TRAIT_TERRAIN_AFFINITY_MIN: 0,
      TRAIT_TERRAIN_AFFINITY_MAX: 1,
      TRAIT_TERRAIN_AFFINITY_DEFAULT: 0.5,
      TRAIT_TERRAIN_AFFINITY_MUTATION_STEP: 0.1,
      TRAIT_INTELLIGENCE_MIN: 0,
      TRAIT_INTELLIGENCE_MAX: 1,
      TRAIT_INTELLIGENCE_DEFAULT: 0.1,
      TRAIT_INTELLIGENCE_MUTATION_STEP: 0.05,
      TRAIT_SOCIALITY_MIN: 0,
      TRAIT_SOCIALITY_MAX: 1,
      TRAIT_SOCIALITY_DEFAULT: 0.1,
      TRAIT_SOCIALITY_MUTATION_STEP: 0.05,
      TRAIT_CARNIVORY_MIN: 0,
      TRAIT_CARNIVORY_MAX: 1,
      TRAIT_CARNIVORY_DEFAULT: 0,
      TRAIT_CARNIVORY_MUTATION_STEP: 0.1,
      TRAIT_BODY_SIZE_MIN: 0.1,
      TRAIT_BODY_SIZE_MAX: 10,
      TRAIT_BODY_SIZE_DEFAULT: 1,
      TRAIT_LIMB_COUNT_MIN: 0,
      TRAIT_LIMB_COUNT_MAX: 12,
      TRAIT_LIMB_COUNT_DEFAULT: 4,
      TRAIT_BODY_SHAPE_MIN: 0,
      TRAIT_BODY_SHAPE_MAX: 5,
      TRAIT_BODY_SHAPE_DEFAULT: 1,
      TRAIT_APPENDAGE_TYPE_MIN: 0,
      TRAIT_APPENDAGE_TYPE_MAX: 5,
      TRAIT_APPENDAGE_TYPE_DEFAULT: 1,
      TRAIT_CAMOUFLAGE_MIN: 0,
      TRAIT_CAMOUFLAGE_MAX: 1,
      TRAIT_CAMOUFLAGE_DEFAULT: 0.2,
      TRAIT_THERMAL_TOLERANCE_MIN: 0,
      TRAIT_THERMAL_TOLERANCE_MAX: 1,
      TRAIT_THERMAL_TOLERANCE_DEFAULT: 0.5,
      TRAIT_WATER_DEPENDENCY_MIN: 0,
      TRAIT_WATER_DEPENDENCY_MAX: 1,
      TRAIT_WATER_DEPENDENCY_DEFAULT: 0.5,
      PREDATION_CARNIVORY_THRESHOLD: 0.5,
      PREDATION_SEARCH_RADIUS: 3,
      PREDATION_ATTACK_INTERVAL: 6,
      PREDATION_MIN_ATTACK_ADVANTAGE: -0.1,
      PREDATION_ENERGY_TRANSFER_RATIO: 0.8,
      TRAIT_MUTATION_CHANCE: 1
    },
    PS: {
      assert(condition, message) {
        if (!condition) {
          throw new Error(message || "Assertion failed");
        }
      },
      config: { spatial: { chunkSize: 4 } },
      runtime: { recordError() {} }
    },
    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    },
    randomInt() {
      return 2;
    },
    chance() {
      return true;
    },
    getWrappedWorldX(x) {
      let ix = Math.round(Number(x) || 0) % context.WORLD_WIDTH;
      return ix < 0 ? ix + context.WORLD_WIDTH : ix;
    },
    getClampedWorldY(y) {
      const iy = Math.round(Number(y) || 0);
      return Math.max(0, Math.min(context.WORLD_HEIGHT - 1, iy));
    },
    getTileManhattanDistance(leftX, leftY, rightX, rightY) {
      const dx = Math.abs(context.getWrappedWorldX(leftX) - context.getWrappedWorldX(rightX));
      const wrappedDx = Math.min(dx, context.WORLD_WIDTH - dx);
      return wrappedDx + Math.abs(context.getClampedWorldY(leftY) - context.getClampedWorldY(rightY));
    },
    getWrappedBucketIndexes(x, radius, bucketSize, width) {
      const bucketCount = Math.ceil(width / bucketSize);
      const center = Math.floor(context.getWrappedWorldX(x) / bucketSize);
      const span = Math.ceil(radius / bucketSize);
      const indexes = [];
      for (let i = -span; i <= span; i++) {
        let bucket = (center + i) % bucketCount;
        if (bucket < 0) bucket += bucketCount;
        if (indexes.indexOf(bucket) < 0) indexes.push(bucket);
      }
      return indexes;
    },
    getClampedBucketIndexes(y, radius, bucketSize, height) {
      const min = Math.max(0, Math.floor((y - radius) / bucketSize));
      const max = Math.min(Math.ceil(height / bucketSize) - 1, Math.floor((y + radius) / bucketSize));
      const indexes = [];
      for (let i = min; i <= max; i++) indexes.push(i);
      return indexes;
    }
  };

  context.window = context;
  return vm.createContext(context);
}

const context = createContext();
runFile(context, "js/core/event-types.js");
runFile(context, "js/core/events.js");
runFile(context, "js/core/world-grid.js");
runFile(context, "js/systems/spatial.js");
runFile(context, "js/sim/modifiers.js");
runFile(context, "js/sim/trait-registry.js");
runFile(context, "js/systems/tile-grid.js");

// Spatial index coverage.
context.PS.spatial.clear();
let record = context.PS.spatial.insert("a", 2, 3, { kind: "organism" });
equal(record.chunkKey, "0:0", "insert should place entity in expected chunk");
deepEqual(context.PS.spatial.queryChunk(0, 0), ["a"], "query should find inserted entity");
equal(context.PS.spatial.index.entities.a.metadata.kind, "organism", "metadata should be preserved");
context.PS.spatial.move("a", 9, 3);
deepEqual(context.PS.spatial.queryChunk(0, 0), [], "move should remove entity from old chunk");
deepEqual(context.PS.spatial.queryChunk(2, 0), ["a"], "move should insert entity in new chunk");
context.PS.spatial.insert("a", 1, 1);
equal(context.PS.spatial.getStats().entities, 1, "reinsert should update instead of duplicate");
deepEqual(context.PS.spatial.queryRadius(1, 1, 0), ["a"], "radius zero should find exact tile");
equal(context.PS.spatial.remove("a"), true, "remove should return true for existing entity");
equal(context.PS.spatial.remove("a"), false, "remove should return false for missing entity");
deepEqual(context.PS.spatial.queryChunk(0, 0), [], "empty chunk query should return empty array");
equal(context.PS.spatial.insert("edge", -1, 99).x, 19, "insert should wrap x at world edge");
equal(context.PS.spatial.index.entities.edge.y, 9, "insert should clamp y at world edge");

// Tile grid coverage.
context.PS.pools = {
  organism: {
    arrays: {
      active: new Uint8Array([1, 1, 1]),
      nextInTile: new Int32Array(3).fill(-1),
      prevInTile: new Int32Array(3).fill(-1),
      x: new Int32Array([2, 3, 4]),
      y: new Int32Array([2, 2, 2]),
      lineageId: new Int32Array([1, 1, 2])
    },
    facades: [
      { poolIndex: 0, x: 2, y: 2, lineageId: 1 },
      { poolIndex: 1, x: 3, y: 2, lineageId: 1 },
      { poolIndex: 2, x: 4, y: 2, lineageId: 2 }
    ]
  }
};
context.PS.tileGrid.init(8, 6);
equal(context.PS.tileGrid.width, 8, "tile grid should store width");
equal(context.PS.tileGrid.height, 6, "tile grid should store height");
equal(context.PS.tileGrid.tileIndex(-1, 99), 47, "tile index should wrap x and clamp y");
context.PS.tileGrid.insert(context.PS.pools.organism.facades[0]);
context.PS.tileGrid.insert(context.PS.pools.organism.facades[1]);
equal(context.PS.tileGrid.countEntitiesInTile(2, 2), 1, "tile grid should count first inserted entity");
equal(context.PS.tileGrid.countEntitiesInTile(3, 2), 1, "tile grid should count second inserted entity");
equal(context.PS.tileGrid.getEntitiesInTile(2, 2)[0].poolIndex, 0, "tile query should return facade");
context.PS.pools.organism.facades[0].x = 3;
context.PS.pools.organism.facades[0].y = 2;
context.PS.pools.organism.arrays.x[0] = 3;
context.PS.tileGrid.move(context.PS.pools.organism.facades[0], 2, 2);
equal(context.PS.tileGrid.countEntitiesInTile(2, 2), 0, "move should empty old tile");
equal(context.PS.tileGrid.countEntitiesInTile(3, 2), 2, "move should add to new tile");
context.PS.tileGrid.remove(context.PS.pools.organism.facades[1]);
equal(context.PS.tileGrid.countEntitiesInTile(3, 2), 1, "remove should unlink entity");
check(context.PS.tileGrid.collectInRadius(3, 2, 1).length >= 1, "radius collection should find nearby active entities");

// Modifier engine coverage.
context.PS.modifiers.stats = {};
context.PS.modifiers.modifierCount = 0;
context.PS.modifiers.createStat("vision", { base: 10, min: 0, max: 100 });
equal(context.PS.modifiers.compute("vision"), 10, "zero modifiers should return base value");
context.PS.modifiers.addModifier("vision", { id: "flat", add: 5 });
equal(context.PS.modifiers.compute("vision"), 15, "additive modifier should add to base");
context.PS.modifiers.addModifier("vision", { id: "boost", mul: 0.5 });
equal(context.PS.modifiers.compute("vision"), 22.5, "multiplicative modifier should apply after positive additions");
context.PS.modifiers.addModifier("vision", { id: "penalty", add: -2 });
equal(context.PS.modifiers.compute("vision"), 20.5, "negative additions should apply after multiplier");
equal(context.PS.modifiers.computeWithBase("vision", 20), 35.5, "computeWithBase should use temporary base");
equal(context.PS.modifiers.removeModifier("vision", "flat"), true, "removeModifier should remove active modifier");
equal(context.PS.modifiers.compute("vision"), 13, "removed modifier should no longer affect value");
context.PS.modifiers.clearAll();
equal(context.PS.modifiers.compute("vision"), 10, "clearAll should restore base-only value");

// Trait registry coverage.
context.PS.modifiers.stats = {};
context.PS.traitRegistry.init();
check(context.PS.traitRegistry.get("vision"), "registered trait should be retrievable by id");
equal(context.PS.traitRegistry.get("missing"), null, "missing trait should return null");
equal(context.PS.traitRegistry.get("vision").defaultValue, 12, "trait defaults should come from CONFIG");
check(context.PS.traitRegistry.evolvableIds.indexOf("vision") >= 0, "evolvable trait should be indexed");
const initialTraits = context.PS.traitRegistry.makeInitial();
check(initialTraits.vision >= 4 && initialTraits.vision <= 24, "initial trait should stay within bounds");
const inheritedTraits = context.PS.traitRegistry.inherit({ vision: 100, metabolism: -100 });
equal(inheritedTraits.vision, 24, "inherited trait should clamp to max");
equal(inheritedTraits.metabolism, 1, "inherited trait should clamp to min");
check(context.PS.modifiers.stats.vision, "trait registry should register modifier stat");

// Event bus coverage.
context.PS.events.listeners = {};
context.PS.events.clearHistory();
context.PS.events.clearStats();
let firstPayload = null;
let secondPayload = null;
const unsubscribe = context.PS.events.on(context.PS.eventTypes.CONFIG_CHANGED, function(payload) {
  firstPayload = payload;
});
context.PS.events.on(context.PS.eventTypes.CONFIG_CHANGED, function(payload) {
  secondPayload = payload;
});
context.PS.events.on(context.PS.eventTypes.CONFIG_CHANGED, function() {
  throw new Error("isolated");
});
const eventEntry = context.PS.events.emit(context.PS.eventTypes.CONFIG_CHANGED, { key: "MAX_FOOD" });
equal(firstPayload.key, "MAX_FOOD", "first subscriber should receive payload");
equal(secondPayload.key, "MAX_FOOD", "second subscriber should receive payload");
equal(eventEntry.handlerCount, 3, "event entry should record handler count");
equal(eventEntry.errorCount, 1, "bad subscriber should be isolated and counted");
equal(context.PS.events.stats().emitCounts[context.PS.eventTypes.CONFIG_CHANGED], 1, "event stats should count emits");
unsubscribe();
equal(context.PS.events.getListenerCounts()[context.PS.eventTypes.CONFIG_CHANGED], 2, "unsubscribe should remove one handler");
equal(context.PS.events.emit("no.subscribers", { ok: true }).handlerCount, 0, "event without subscribers should not throw");

check(assertionCount >= 37, "AZR-581 should cover at least 37 pure unit assertions");

console.log("phase0 core unit checks passed", JSON.stringify({ assertions: assertionCount }));
