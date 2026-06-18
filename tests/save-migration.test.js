const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const dbSource = read("js/systems/persistence-db.js");
const migrationSource = read("js/systems/save-migration.js");
const restoreCoreSource = read("js/systems/persistence-restore-core.js");
const saveDataSource = read("js/systems/persistence-save-data.js");
const persistenceSource = read("js/systems/persistence.js");
const packageSource = read("package.json");

const namespaceContext = {
  window: {
    addEventListener: function() {}
  },
  Date
};
namespaceContext.window.window = namespaceContext.window;
vm.createContext(namespaceContext);
vm.runInContext(namespaceSource, namespaceContext, { filename: "js/core/namespace.js" });

const manifest = namespaceContext.window.PS.core.manifest;
assert.ok(manifest.includes("js/systems/save-migration.js"), "manifest should load save migration system");
assert.ok(
  manifest.indexOf("js/systems/save-migration.js") > manifest.indexOf("js/systems/persistence-db.js"),
  "save migration should load after persistence constants"
);
assert.ok(
  manifest.indexOf("js/systems/save-migration.js") < manifest.indexOf("js/systems/persistence-save-data.js"),
  "save migration should load before save-data helpers consume tile id helpers"
);
assert.ok(JSON.parse(packageSource).scripts.test.includes("tests/save-migration.test.js"), "npm test should include save migration checks");

const context = {
  PS: { systems: {} },
  CONFIG: {
    TERRAIN_BARREN: 0,
    TERRAIN_FERTILE: 1
  },
  WORLD_WIDTH: 3,
  WORLD_HEIGHT: 2,
  window: {},
  Promise,
  Error,
  Object,
  Number,
  String,
  Boolean,
  Array,
  Math,
  JSON
};

vm.createContext(context);
vm.runInContext(dbSource, context, { filename: "js/systems/persistence-db.js" });
vm.runInContext(migrationSource, context, { filename: "js/systems/save-migration.js" });
vm.runInContext(restoreCoreSource, context, { filename: "js/systems/persistence-restore-core.js" });
vm.runInContext(persistenceSource, context, { filename: "js/systems/persistence.js" });

assert.strictEqual(vm.runInContext("PIXELDARIUM_SAVE_VERSION", context), 3, "current save version should be v3");
assert.ok(saveDataSource.indexOf("terrainTileIds: getTerrainTileIdsForSave(world.terrain)") >= 0, "new saves should include tile ids");

const v1Save = {
  id: "latest",
  version: 1,
  terrain: [0, 1, 0, 1, 1, 0],
  food: [],
  organisms: [
    { x: 1, y: 1 },
    { x: 2, y: 2, entityType: "predator_basic", animationState: "walk_left" }
  ]
};
const migrated = context.PS.persistence.migrateSaveData(v1Save);
const stats = context.PS.persistence.getMigrationStats();

assert.strictEqual(migrated.version, 3, "v1 save should migrate to current v3");
assert.deepStrictEqual(migrated.terrain, v1Save.terrain, "migration should preserve numeric terrain for active runtime");
assert.deepStrictEqual(
  migrated.terrainTileIds,
  ["rock", "grass_lush", "rock", "grass_lush", "grass_lush", "rock"],
  "v3 migration should add tile registry ids"
);
assert.strictEqual(migrated.organisms[0].entityType, "herbivore_basic", "v2 migration should add entity type default");
assert.strictEqual(migrated.organisms[0].animationState, "idle", "v2 migration should add animation default");
assert.strictEqual(migrated.organisms[1].entityType, "predator_basic", "v2 migration should preserve existing entity type");
assert.strictEqual(migrated.organisms[1].animationState, "walk_left", "v2 migration should preserve existing animation state");
assert.strictEqual(migrated.era, "Organisms", "pre-epoch saves should migrate with a default active era");
assert.strictEqual(migrated.epochScaling, null, "pre-epoch saves should migrate with explicit epoch scaling state");
assert.deepStrictEqual(Array.from(stats.lastPath), [1, 2, 3], "migration stats should record traversed versions");
assert.strictEqual(stats.lastLog, "Migrated save from v1 -> v2 -> v3", "migration log should name traversed versions");
assert.strictEqual(context.PS.persistence.validateSaveData(migrated), true, "migrated save should validate");

const v3Save = {
  id: "latest",
  version: 3,
  terrain: [0, 0, 0, 0, 0, 0],
  terrainTileIds: ["rock", "rock", "rock", "rock", "rock", "rock"],
  food: [],
  organisms: []
};
assert.deepStrictEqual(context.PS.persistence.migrateSaveData(v3Save).terrainTileIds, v3Save.terrainTileIds, "current save should not remigrate");
assert.throws(
  function() {
    context.PS.persistence.validateSaveData({
      id: "latest",
      version: 3,
      terrain: [0, 1],
      terrainTileIds: ["rock"],
      food: [],
      organisms: []
    });
  },
  /world size|terrain tile ids/,
  "invalid terrain payload should throw a clear validation error"
);
assert.throws(
  function() {
    context.PS.persistence.migrateSaveData({ id: "latest", version: 99, terrain: [], food: [], organisms: [] });
  },
  /newer than runtime/,
  "future save versions should fail loudly"
);

console.log("save migration checks passed", JSON.stringify({ path: stats.lastPath, log: stats.lastLog }));
