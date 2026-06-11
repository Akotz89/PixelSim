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
assert.ok(manifest.includes("js/ui/dom-refs.js"), "manifest should load DOM refs");
assert.ok(
  manifest.indexOf("js/ui/dom-refs.js") < manifest.indexOf("js/systems/state.js"),
  "DOM refs should load before state consumes canvas dimensions"
);

const restoreEntitiesSource = read("js/systems/persistence-restore-entities.js");
const saveDataSource = read("js/systems/persistence-save-data.js");
const stateSource = read("js/systems/state.js");
const domRefsSource = read("js/ui/dom-refs.js");
[
  "js/systems/persistence-db.js",
  "js/systems/persistence-config.js",
  "js/systems/save-migration.js",
  "js/systems/persistence-save-data.js",
  "js/systems/persistence-restore-entities.js",
  "js/systems/persistence-io.js"
].forEach(function(persistenceFile) {
  assert.strictEqual(
    /JSON\.parse\s*\(\s*JSON\.stringify/.test(read(persistenceFile)),
    false,
    persistenceFile + " should use clonePersistencePlainValue instead of JSON stringify deep clones"
  );
});
assert.strictEqual(
  restoreEntitiesSource.indexOf("function(value)" + " { return value; }"),
  -1,
  "applySaveConfig should not allocate identity transform wrappers"
);
assert.strictEqual(saveDataSource.indexOf("legacy" + "ConfigSchema"), -1, "new saves should not carry the old full config blob");
assert.ok(saveDataSource.indexOf("config: createSaveConfigDelta()") >= 0, "new saves should store delta config");
assert.ok(saveDataSource.indexOf("subsystems: createWorldSubsystemSaveData()") >= 0, "new saves should include grouped subsystem data");
[
  "updateColonyNetworkState",
  "updateSpaceProgramReadiness",
  "updateProbeMissionReadiness",
  "updateStarMapReadiness",
  "updateGalacticInfluenceReadiness",
  "updateInterstellarFleetReadiness",
  "updateEmpireSectorReadiness",
  "updateEmpireLegacyReadiness"
].forEach(function(mutatingSaveCall) {
  assert.strictEqual(
    saveDataSource.indexOf(mutatingSaveCall),
    -1,
    "createWorldSaveData and save helpers should not mutate readiness state via " + mutatingSaveCall
  );
});
[
  "updateOrbitalInfrastructureState",
  "updatePlanetarySurveyReadiness"
].forEach(function(mutatingSaveCall) {
  assert.strictEqual(
    read("js/systems/persistence-db.js").indexOf(mutatingSaveCall),
    -1,
    "persistence-db save helpers should not mutate readiness state via " + mutatingSaveCall
  );
});
[
  "updateColonyNetworkState",
  "updateSpaceProgramReadiness",
  "updateOrbitalInfrastructureState",
  "updatePlanetarySurveyReadiness",
  "updateProbeMissionReadiness",
  "updateStarMapReadiness",
  "updateGalacticInfluenceReadiness",
  "updateInterstellarFleetReadiness",
  "updateEmpireSectorReadiness",
  "updateEmpireLegacyReadiness"
].forEach(function(mutatingRestoreCall) {
  assert.strictEqual(
    read("js/systems/persistence-io.js").indexOf(mutatingRestoreCall),
    -1,
    "restoreWorldFromSaveData should restore saved progression state without mutating via " + mutatingRestoreCall
  );
});
assert.strictEqual(stateSource.indexOf("document.getElementById"), -1, "state.js should not query DOM elements directly");
assert.strictEqual(stateSource.indexOf("document.querySelectorAll"), -1, "state.js should not query DOM collections directly");
assert.ok(domRefsSource.indexOf("document.getElementById") >= 0, "DOM references should live in dom-refs.js");

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
    }
  };
}

const stateContext = {
  console,
  window: {
    addEventListener: function() {}
  },
  document: {
    getElementById: function() {
      return makeElement();
    },
    querySelectorAll: function() {
      return [];
    }
  },
  Math,
  Object
};
stateContext.window.window = stateContext.window;
stateContext.window.document = stateContext.document;
vm.createContext(stateContext);
runFile(stateContext, "config.js");
runFile(stateContext, "js/ui/dom-refs.js");
runFile(stateContext, "js/systems/state.js");

const worldKeys = vm.runInContext("Object.keys(world)", stateContext);
const canonicalWorldSubsystems = ["meta", "bio", "civ", "render", "ui", "history"];
const worldGroupNames = [
  "meta",
  "bio",
  "civ",
  "simulation",
  "spatial",
  "flow",
  "ui",
  "camera",
  "render",
  "history",
  "biology",
  "settlementState",
  "space"
];
assert.deepStrictEqual(
  worldGroupNames.filter(function(groupName) {
    return worldKeys.indexOf(groupName) < 0;
  }),
  [],
  "world should expose grouped state buckets"
);
assert.deepStrictEqual(
  canonicalWorldSubsystems.filter(function(groupName) {
    return worldKeys.indexOf(groupName) < 0;
  }),
  [],
  "world should expose the six canonical subsystem views"
);
assert.strictEqual(vm.runInContext("world.simulation.tick = 12; world.tick", stateContext), 12, "flat world aliases should read grouped state");
assert.strictEqual(vm.runInContext("world.tick = 34; world.simulation.tick", stateContext), 34, "flat world aliases should write grouped state");
assert.strictEqual(vm.runInContext("world.meta.tick = 56; world.tick", stateContext), 56, "canonical meta aliases should write legacy tick state");
assert.strictEqual(vm.runInContext("world.bio.organisms = [{ id: 1 }]; world.organisms.length", stateContext), 1, "canonical bio aliases should write legacy organism state");
assert.strictEqual(vm.runInContext("world.civ.settlements = [{ id: 2 }]; world.settlements[0].id", stateContext), 2, "canonical civ aliases should write settlement state");
assert.strictEqual(vm.runInContext("world.render.planetView = { zoomLevel: 2 }; world.planetView.zoomLevel", stateContext), 2, "canonical render aliases should expose camera state");
assert.strictEqual(vm.runInContext("world.history.eventLog = [{ type: 'test' }]; world.eventLog[0].type", stateContext), "test", "canonical history aliases should expose event log state");
assert.strictEqual(
  vm.runInContext("world.ui.isPaused = true; world.isPaused", stateContext),
  true,
  "legacy UI aliases should remain backward-compatible"
);
const saveKeys = new Set(Array.from(saveDataSource.matchAll(/^    ([A-Za-z0-9_]+):/gm)).map(function(match) {
  return match[1];
}));
const runtimeOnlyWorldKeys = new Set([
  "simulation",
  "spatial",
  "flow",
  "meta",
  "bio",
  "civ",
  "ui",
  "camera",
  "render",
  "history",
  "biology",
  "settlementState",
  "space",
  "organismBuckets",
  "organismsByLineage",
  "foodPositions",
  "foodBuckets",
  "planetTiles",
  "planetSummary",
  "planetView",
  "fertileTiles",
  "birthsThisTick",
  "deathsThisTick",
  "populationDeltaThisTick",
  "reproductionScarcityPressure",
  "foodSpawnedThisTick",
  "foodConsumedThisTick",
  "foodHarvestedThisTick",
  "foodRecoveryPressure",
  "foodRecoveryAttemptsThisTick",
  "isPaused",
  "isCameraInteracting",
  "isMenuOpen",
  "menuPage",
  "needsRender",
  "prng",
  "interpolation",
  "fps",
  "tps",
  "updateMs",
  "drawMs",
  "maxUpdateMs",
  "maxDrawMs",
  "inspectedTile",
  "inspectedSurface",
  "inspectedEntity",
  "ecosystemSummary",
  "simulationAlerts",
  "populationTraitSummary",
  "lineageSummary",
  "lineageSummaryText",
  "timelineFilter",
  "selectedTimelineEvent",
  "activeObservationOverlay",
  "overlayPerformance",
  "spotlightEvent",
  "spotlightState",
  "speciesById",
  "speciesSummary",
  "biologyPopulationById",
  "biologyRepresentativeById",
  "settlementsById",
  "settlementBuckets",
  "settlementByLineage",
  "rootSettlementByLineage",
  "settlementChildOutpostCountByParentId",
  "settlementSummary",
  "earlyProgressionSummary",
  "settlementRoutesByKey",
  "settlementRouteStatsById",
  "planetaryBodiesById",
  "starSystemsById",
  "empireSectorBySystemId"
]);
const uncoveredWorldKeys = worldKeys.filter(function(key) {
  return !saveKeys.has(key) && !runtimeOnlyWorldKeys.has(key);
});
assert.deepStrictEqual(
  uncoveredWorldKeys,
  [],
  "every top-level world key should be saved or intentionally listed as runtime-only/derived"
);

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
assert.strictEqual(
  vm.runInContext("copyTraitHistorySampleForSave({ tick: 7, population: 3, synthetic: 9 }).synthetic", context),
  9,
  "trait schema should drive trait history save copy for newly registered traits"
);
assert.strictEqual(
  vm.runInContext("restoreTraitHistorySample({ tick: 7, population: 3, synthetic: -5 }).synthetic", context),
  0,
  "trait schema should drive trait history restore and clamp new traits"
);
assert.strictEqual(
  vm.runInContext("restoreTraitHistorySample({ tick: 7, population: 3 }).bodySize", context),
  vm.runInContext("CONFIG.TRAIT_BODY_SIZE_DEFAULT", context),
  "trait history restore should default missing body traits for old saves"
);

console.log("persistence schema checks passed");
