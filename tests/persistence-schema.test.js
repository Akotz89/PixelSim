const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function runFile(context, file) {
  vm.runInContext(read(file), context, { filename: file });
}

const namespaceContext = {
  window: {
    addEventListener: function() {}
  },
  Date
};
namespaceContext.window.window = namespaceContext.window;
vm.createContext(namespaceContext);
runFile(namespaceContext, "js/core/namespace.js");

const manifest = namespaceContext.window.PS.core.manifest;
assert.ok(manifest.includes("js/core/trait-schema.js"), "manifest should load trait schema");
assert.ok(manifest.includes("js/systems/persistence-config.js"), "manifest should load persistence config schema");
assert.ok(
  manifest.indexOf("js/core/trait-schema.js") > manifest.indexOf("js/core/utils.js"),
  "trait schema should load after clamp utility"
);
assert.ok(
  manifest.indexOf("js/systems/persistence-config.js") < manifest.indexOf("js/systems/persistence-save-data.js"),
  "persistence config schema should load before save data"
);
assert.ok(
  manifest.indexOf("js/systems/persistence-config.js") < manifest.indexOf("js/systems/persistence-restore-entities.js"),
  "persistence config schema should load before restore applies save config"
);

const restoreEntitiesSource = read("js/systems/persistence-restore-entities.js");
const saveDataSource = read("js/systems/persistence-save-data.js");
assert.strictEqual(
  restoreEntitiesSource.indexOf("function(value)" + " { return value; }"),
  -1,
  "applySaveConfig should not allocate identity transform wrappers"
);
assert.strictEqual(saveDataSource.indexOf("legacy" + "ConfigSchema"), -1, "new saves should not carry the old full config blob");
assert.ok(saveDataSource.indexOf("config: createSaveConfigDelta()") >= 0, "new saves should store delta config");

const context = {
  console,
  window: {
    addEventListener: function() {},
    indexedDB: null
  },
  Date,
  Math,
  Number,
  String,
  Boolean,
  Object,
  Array,
  JSON,
  Error,
  Promise
};
context.window.window = context.window;
vm.createContext(context);

[
  "js/core/namespace.js",
  "config.js",
  "js/core/config.js",
  "js/core/utils.js",
  "js/core/trait-schema.js",
  "js/systems/persistence-config.js",
  "js/systems/persistence-db.js",
  "js/systems/persistence-restore-core.js",
  "js/systems/persistence-restore-entities.js",
  "js/sim/organisms-traits.js"
].forEach(function(file) {
  runFile(context, file);
});

let delta = vm.runInContext("PS.systems.persistenceConfig.createDelta()", context);
assert.deepStrictEqual(JSON.parse(JSON.stringify(delta.constants)), {}, "default config snapshot should save as an empty delta");

vm.runInContext("CONFIG.STARTING_FOOD = 777; CONFIG.MAX_SIM_UPDATES_PER_FRAME = 4;", context);
delta = vm.runInContext("PS.systems.persistenceConfig.createDelta()", context);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(delta.constants)),
  { STARTING_FOOD: 777, MAX_SIM_UPDATES_PER_FRAME: 4 },
  "delta config should store only changed CONFIG constants"
);
assert.strictEqual(delta.startingFood, undefined, "delta config should not duplicate legacy camelCase keys");

vm.runInContext("applySaveConfig({ constants: { STARTING_FOOD: 888 }, maxSimUpdatesPerFrame: 2.7, defaultSeed: 'schema-test' });", context);
assert.strictEqual(vm.runInContext("CONFIG.STARTING_FOOD", context), 888, "constant-key config restore should apply");
assert.strictEqual(vm.runInContext("CONFIG.MAX_SIM_UPDATES_PER_FRAME", context), 3, "legacy camelCase config restore should still sanitize");
assert.strictEqual(vm.runInContext("CONFIG.DEFAULT_SEED", context), "schema-test", "legacy string config restore should still apply");

vm.runInContext(`
  CONFIG.TRAIT_SYNTHETIC_MIN = 0;
  CONFIG.TRAIT_SYNTHETIC_MAX = 10;
  CONFIG.TRAIT_SYNTHETIC_DEFAULT = 5;
  PS.core.traitSchema.register({ key: "synthetic", configPrefix: "TRAIT_SYNTHETIC" });
`, context);

assert.strictEqual(
  vm.runInContext("copyOrganismTraitsForSave({ synthetic: 8 }).synthetic", context),
  8,
  "trait schema should drive organism save copy for newly registered traits"
);
assert.strictEqual(
  vm.runInContext("copyTraitsForLineage({ synthetic: 6 }).synthetic", context),
  6,
  "trait schema should drive lineage copy for newly registered traits"
);
assert.strictEqual(
  vm.runInContext("normalizeOrganismTraits({ synthetic: 99 }).synthetic", context),
  10,
  "trait schema should drive trait normalization and clamp new traits"
);
assert.strictEqual(
  vm.runInContext("restoreOrganismTraits({ synthetic: -5 }).synthetic", context),
  0,
  "trait schema should drive restore and clamp new traits"
);

console.log("persistence schema checks passed");
