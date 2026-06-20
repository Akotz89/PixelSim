const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const entitiesData = JSON.parse(read("data/entities.json"));
const sidecarSource = read("data/entities.json.js");
const entityRegistrySource = read("js/core/entity-registry.js");

const sidecarContext = {
  PS: {
    assets: {
      captured: {},
      registerJSON(url, data) {
        this.captured[url] = data;
      }
    }
  }
};
vm.createContext(sidecarContext);
vm.runInContext(sidecarSource, sidecarContext, { filename: "data/entities.json.js" });
assert.strictEqual(
  JSON.stringify(sidecarContext.PS.assets.captured["data/entities.json"]),
  JSON.stringify(entitiesData),
  "entities sidecar should match entities JSON"
);

const registryContext = {
  PS: {
    core: {}
  },
  Map,
  Array,
  Object,
  String,
  Number,
  Error
};
vm.createContext(registryContext);
vm.runInContext(entityRegistrySource, registryContext, { filename: "js/core/entity-registry.js" });

const registry = registryContext.EntityRegistry;
const loaded = registry.loadFromJSON(entitiesData);

assert.ok(registry.types instanceof Map, "EntityRegistry should keep a Map of definitions");
assert.ok(loaded.length >= 8, "EntityRegistry should load all organism, vegetation, and structure types");
assert.strictEqual(registry.get("herbivore_basic").name, "Basic Herbivore", "get should return full herbivore definition");
assert.strictEqual(registry.getSpriteSheet("predator_basic"), "creatures/predator", "predator should expose its sprite sheet");
assert.strictEqual(registry.getTraitDefaults("predator_basic").vision, 18, "predator should expose trait defaults");
assert.strictEqual(registry.getByCategory("organisms").length, 3, "getByCategory should return organism definitions");
assert.strictEqual(registry.getByCategory("vegetation").length, 4, "getByCategory should return vegetation definitions");
assert.strictEqual(registry.get("missing"), null, "get should return null for unknown type");
assert.throws(
  () => registry.validate({ id: "broken" }),
  /missing required field: name/,
  "validate should catch missing required fields"
);
assert.throws(
  () => registry.validate({ id: "broken", name: "Broken", category: "organisms", spriteSheet: "x", spawnBiomes: "temperate" }),
  /spawnBiomes must be an array/,
  "validate should catch invalid spawn biome lists"
);

const organismContext = {
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

const organismSource = [
  "js/core/namespace.js",
  "config.js",
  "js/core/entity-registry.js",
  "js/ui/dom-refs.js",
  "js/systems/state.js",
  "js/core/utils.js",
  "js/core/trait-schema.js",
  "js/core/config.js",
  "js/core/world-grid.js",
  "js/systems/pool-manager.js",
  "js/systems/pools.js",
  "js/sim/organisms-traits.js",
  "js/sim/organisms-indexes.js",
  "js/sim/organisms-behavior.js",
  "js/sim/organisms.js"
].map(read).join("\n");

vm.runInNewContext(`${organismSource}

function getRandomLatLonInTile(x, y) {
  return { latitude: y + 0.25, longitude: x + 0.75 };
}

function getWrappedWorldX(x) {
  return PS.worldGrid.getWrappedX(x);
}

function getClampedWorldY(y) {
  return PS.worldGrid.getClampedY(y);
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
EntityRegistry.loadFromJSON(${JSON.stringify(entitiesData)});
setWorldSeed("ENTITY-REGISTRY-TEST");
world.tick = 1;
world.organisms = [];
world.organismBuckets = {};
world.organismsByLineage = {};

var herbivore = PS.sim.organisms.make(10, 10);
assert.strictEqual(herbivore.typeId, "herbivore_basic", "default organism should use herbivore_basic type");
assert.strictEqual(herbivore.spriteSheet, "creatures/herbivore", "default organism should inherit herbivore sprite sheet");
assert.strictEqual(herbivore.energy, 180, "default organism should use registry base energy");
assert.strictEqual(herbivore.traits.vision, 12, "default organism should use registry trait defaults");

var predator = PS.sim.organisms.create("predator_basic", { x: 12, y: 10 });
assert.strictEqual(predator.typeId, "predator_basic", "create should assign requested entity type");
assert.strictEqual(predator.spriteSheet, "creatures/predator", "predator should use registry sprite sheet");
assert.strictEqual(predator.diet, "carnivore", "predator should use registry diet");
assert.strictEqual(predator.energy, 220, "predator should use registry base energy");
assert.strictEqual(predator.traits.vision, 18, "predator should use registry vision default");
assert.strictEqual(predator.traits.metabolism, 2, "predator should use registry metabolism default");
assert.ok(Math.abs(predator.traits.bodySize - 0.7) < 0.0001, "predator should use registry body size default");
assert.ok(predator.traits.carnivory > CONFIG.PREDATION_CARNIVORY_THRESHOLD, "predator should use registry carnivory default");

var fish = PS.sim.organisms.make(2, 3, null, "fish_basic");
assert.strictEqual(fish.typeId, "fish_basic", "make should accept optional entity type id");
assert.strictEqual(fish.spriteSheet, "creatures/fish", "fish should use registry sprite sheet");
assert.strictEqual(fish.energy, 120, "fish should use registry base energy");
assert.strictEqual(fish.traits.waterDependency, 1, "fish should use water dependency default");

console.log("entity registry organism creation checks passed");
`, organismContext);

console.log("entity registry checks passed");
