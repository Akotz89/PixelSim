const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const registrySource = fs.readFileSync(path.join(root, "js/core/tile-registry.js"), "utf8");
const tilesSidecarSource = fs.readFileSync(path.join(root, "data/tiles.json.js"), "utf8");
const tilesData = JSON.parse(fs.readFileSync(path.join(root, "data/tiles.json"), "utf8"));

const context = {
  PS: {
    core: {}
  },
  Map: Map,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  Error: Error,
  RegExp: RegExp
};

vm.createContext(context);
vm.runInContext(registrySource, context, { filename: "js/core/tile-registry.js" });

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
vm.runInContext(tilesSidecarSource, sidecarContext, { filename: "data/tiles.json.js" });

const registry = context.PS.core.TileRegistry;
const loaded = registry.loadFromJSON(tilesData);
const lush = registry.get("grass_lush");
const temperateTiles = registry.getByBiome("temperate");
const wetlandTiles = registry.getByBiome("wetland");
const forestFloor = registry.get("forest_floor");
const sand = registry.get("sand");
const waterDeep = registry.get("water_deep");
const waterShallow = registry.get("water_shallow");
const rock = registry.get("rock");
const lichen = registry.get("lichen_tundra");
const wetland = registry.get("wetland");

assert.ok(registry, "TileRegistry should be exposed under PS.core");
assert.strictEqual(
  JSON.stringify(sidecarContext.PS.assets.captured["data/tiles.json"]),
  JSON.stringify(tilesData),
  "tiles sidecar should match tiles JSON"
);
assert.ok(registry.types instanceof Map, "TileRegistry should keep a Map of tile definitions");
assert.ok(loaded.length >= 15, "loadFromJSON should register at least 15 tile types");
assert.strictEqual(loaded.length, tilesData.tiles.length, "loadFromJSON should register every JSON tile");
assert.strictEqual(lush.name, "Lush Grass", "get should return full tile definition");
assert.strictEqual(lush.baseFertility, 0.85, "get should preserve numeric fields");
assert.strictEqual(lush.elevation.min, 0.1, "get should preserve elevation min");
assert.strictEqual(lush.elevation.max, 0.8, "get should preserve elevation max");
assert.ok(temperateTiles.some((tile) => tile.id === "grass_lush"), "getByBiome should return matching biome tiles");
assert.ok(wetlandTiles.length >= 3, "getByBiome should return all wetland tiles");
assert.strictEqual(registry.getSpriteId("grass_lush", 3), "terrain.grass.3", "getSpriteId should map sheet and variant to atlas id");
assert.strictEqual(forestFloor.spriteSheet, "terrain/forest", "forest floor should use the forest biome atlas");
assert.strictEqual(sand.spriteSheet, "terrain/desert", "desert materials should use the desert biome atlas");
assert.strictEqual(waterShallow.spriteSheet, "terrain/water", "shallow water should use the water biome atlas");
assert.strictEqual(waterDeep.spriteSheet, "terrain/ocean", "deep water should use the ocean biome atlas");
assert.strictEqual(rock.spriteSheet, "terrain/mountain", "rock materials should use the mountain biome atlas");
assert.strictEqual(lichen.spriteSheet, "terrain/tundra", "lichen tundra should use the tundra biome atlas");
assert.strictEqual(wetland.spriteSheet, "terrain/wetland", "wetland materials should use the wetland biome atlas");
assert.strictEqual(registry.getSpriteId("forest_floor", 3), "terrain.forest.3", "forest floor should map to forest atlas sprite IDs");
assert.strictEqual(registry.getSpriteId("sand", 3), "terrain.desert.3", "sand should map to desert atlas sprite IDs");
assert.strictEqual(registry.getSpriteId("water_deep", 3), "terrain.ocean.3", "deep water should map to ocean atlas sprite IDs");
assert.strictEqual(registry.getSpriteId("rock", 3), "terrain.mountain.3", "rock should map to mountain atlas sprite IDs");
assert.strictEqual(registry.getSpriteId("lichen_tundra", 3), "terrain.tundra.3", "tundra should map to tundra atlas sprite IDs");
assert.strictEqual(registry.getSpriteId("wetland", 3), "terrain.wetland.3", "wetland should map to wetland atlas sprite IDs");
assert.strictEqual(registry.get("missing"), null, "get should return null for unknown tile");
assert.strictEqual(registry.getByBiome("missing").length, 0, "getByBiome should return empty array for unknown biome");

assert.throws(
  () => registry.validate({ id: "broken" }),
  /missing required field: name/,
  "validate should catch missing required fields"
);

assert.throws(
  () => registry.validate(Object.assign({}, lush, { variants: 0 })),
  /variants must be a positive integer/,
  "validate should catch invalid variant counts"
);

assert.throws(
  () => registry.validate(Object.assign({}, lush, { baseColor: "green" })),
  /baseColor must be #rrggbb/,
  "validate should catch invalid colors"
);

assert.throws(
  () => registry.getSpriteId("grass_lush", 4),
  /outside grass_lush variants/,
  "getSpriteId should reject variants outside the registered range"
);

const custom = registry.register("test_tile", Object.assign({}, lush, {
  id: "ignored_source_id",
  name: "Test Tile",
  biome: "test_biome",
  spriteSheet: "terrain/test",
  variants: 1
}));
assert.strictEqual(custom.id, "test_tile", "register should trust the explicit id argument");
assert.strictEqual(registry.getByBiome("test_biome").length, 1, "register should update biome index");
assert.strictEqual(registry.getSpriteId("test_tile", 0), "terrain.test.0", "getSpriteId should support manually registered tiles");

console.log("tile registry checks passed");
