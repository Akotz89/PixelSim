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
const grassType = registry.getTerrainType("grass_lush");
const forestType = registry.getTerrainType("forest_floor");
const cliffType = registry.getTerrainType("rock_cliff");
const shallowWaterType = registry.getTerrainType("water_shallow");

assert.ok(registry, "TileRegistry should be exposed under PS.core");
assert.strictEqual(typeof context.PS.core.TerrainType, "function", "TerrainType base constructor should be exposed");
assert.strictEqual(
  JSON.stringify(sidecarContext.PS.assets.captured["data/tiles.json"]),
  JSON.stringify(tilesData),
  "tiles sidecar should match tiles JSON"
);
assert.ok(registry.types instanceof Map, "TileRegistry should keep a Map of tile definitions");
assert.ok(registry.terrainTypes instanceof Map, "TileRegistry should keep a Map of terrain type behaviors");
assert.ok(loaded.length >= 15, "loadFromJSON should register at least 15 tile types");
assert.ok(registry.listTerrainTypes().length >= 15, "loadFromJSON should register at least 15 terrain subtypes");
assert.ok(context.PS.core.TerrainType.subtypeConstructors instanceof Map, "TerrainType should keep subtype constructors");
assert.ok(context.PS.core.TerrainType.subtypeConstructors.size >= 15, "TerrainType should define at least 15 subtype constructors");
assert.strictEqual(loaded.length, tilesData.tiles.length, "loadFromJSON should register every JSON tile");
assert.strictEqual(lush.name, "Lush Grass", "get should return full tile definition");
assert.strictEqual(lush.terrainType, grassType, "tile definitions should link to their TerrainType behavior");
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
assert.strictEqual(registry.getTerrainType("missing"), null, "getTerrainType should return null for unknown tile");

const subtypeConstructors = new Set();
registry.listTerrainTypes().forEach((terrainType) => {
  subtypeConstructors.add(terrainType.constructor);
  assert.ok(terrainType instanceof context.PS.core.TerrainType, terrainType.id + " should inherit from TerrainType");
  assert.notStrictEqual(terrainType.constructor, context.PS.core.TerrainType, terrainType.id + " should be a concrete TerrainType subtype");
  assert.strictEqual(terrainType.subtypeId, terrainType.id, terrainType.id + " subtype id should match tile id");
  assert.ok(Object.prototype.hasOwnProperty.call(terrainType.constructor.prototype, "renderBelow"), terrainType.id + " subtype should implement renderBelow");
  assert.ok(Object.prototype.hasOwnProperty.call(terrainType.constructor.prototype, "renderMid"), terrainType.id + " subtype should implement renderMid");
  assert.ok(Object.prototype.hasOwnProperty.call(terrainType.constructor.prototype, "renderAbove"), terrainType.id + " subtype should implement renderAbove");
  assert.ok(Object.prototype.hasOwnProperty.call(terrainType.constructor.prototype, "computeAutotileMask"), terrainType.id + " subtype should implement computeAutotileMask");
  assert.ok(Object.prototype.hasOwnProperty.call(terrainType.constructor.prototype, "getMinimapColor"), terrainType.id + " subtype should implement getMinimapColor");
  assert.ok(Object.prototype.hasOwnProperty.call(terrainType.constructor.prototype, "isPathable"), terrainType.id + " subtype should implement isPathable");
  assert.strictEqual(typeof terrainType.renderBelow, "function", terrainType.id + " should define renderBelow");
  assert.strictEqual(typeof terrainType.renderMid, "function", terrainType.id + " should define renderMid");
  assert.strictEqual(typeof terrainType.renderAbove, "function", terrainType.id + " should define renderAbove");
  assert.strictEqual(typeof terrainType.computeAutotileMask, "function", terrainType.id + " should define computeAutotileMask");
  assert.strictEqual(typeof terrainType.getMinimapColor, "function", terrainType.id + " should define getMinimapColor");
  assert.strictEqual(typeof terrainType.isPathable, "function", terrainType.id + " should define isPathable");
});
assert.ok(subtypeConstructors.size >= 15, "registered TerrainTypes should use at least 15 distinct subtype constructors");

assert.strictEqual(registry.getMinimapColor("grass_lush"), "#3a7a1a", "TerrainType should expose per-type minimap colors");
assert.strictEqual(grassType.getMinimapColor(), lush.minimapColor, "minimap color should come from the tile definition");
assert.strictEqual(registry.isPathable("grass_lush"), true, "walkable ground should be pathable");
assert.strictEqual(registry.isPathable("rock_cliff"), false, "cliffs should not be pathable");
assert.strictEqual(registry.isPathable("water_shallow"), false, "water should not be pathable by default");
assert.strictEqual(registry.isPathable("water_shallow", { canTraverseWater: true }), false, "non-walkable water data remains blocked even for water-capable actors");
assert.strictEqual(registry.canPlace("grass_lush"), true, "buildable terrain should accept default placement");
assert.strictEqual(registry.canPlace("forest_floor", { requiresGrowable: true }), true, "growable terrain should accept growable placement");
assert.strictEqual(registry.canPlace("rock", { requiresGrowable: true }), false, "non-growable terrain should reject growable placement");
assert.ok(registry.getClearingCost("forest_floor") > registry.getClearingCost("grass_lush"), "growable terrain should cost more to clear than grass");
assert.strictEqual(registry.getClearingCost("rock_cliff"), Infinity, "impassable non-buildable terrain should have infinite clearing cost");

const grassMidRender = grassType.renderMid({ tile: lush });
assert.strictEqual(grassMidRender.terrainType, "grass_lush", "ground terrain should render by terrain type id");
assert.strictEqual(grassMidRender.kind, "ground", "ground terrain should preserve inferred kind");
assert.strictEqual(grassMidRender.layer, "mid", "ground terrain should render in the mid layer");
assert.strictEqual(grassMidRender.spriteSheet, "terrain/grass", "ground terrain should preserve sprite sheet");
assert.strictEqual(grassMidRender.variantCount, 4, "ground terrain should preserve variant count");
assert.strictEqual(grassMidRender.color, lush.baseColor, "ground terrain should preserve base color");
assert.strictEqual(grassType.renderBelow({ tile: lush }), null, "dry ground should not render below");
assert.strictEqual(cliffType.renderMid({ tile: registry.get("rock_cliff") }), null, "cliffs should reserve the mid layer for base rock underlay");
assert.strictEqual(cliffType.renderAbove({ tile: registry.get("rock_cliff") }).layer, "above", "cliffs should render above");
assert.strictEqual(shallowWaterType.renderBelow({ tile: waterShallow }).layer, "below", "water should render below ground");
assert.strictEqual(forestType.renderAbove({ tile: forestFloor }).layer, "above", "forest terrain should render above");

const terrainGrid = {
  getTileId(x, y) {
    const cells = {
      "0,0": "grass_lush",
      "1,0": "grass_dry",
      "0,1": "forest_floor",
      "1,1": "water_shallow",
      "-1,0": "grass_lush",
      "0,-1": "grass_lush",
      "-1,-1": "grass_lush"
    };
    return cells[x + "," + y] || null;
  }
};
assert.strictEqual(
  registry.getAutotileMask("grass_lush", 0, 0, terrainGrid),
  context.PS.core.TerrainType.BITS.NW | context.PS.core.TerrainType.BITS.N | context.PS.core.TerrainType.BITS.W,
  "autotile mask should connect only compatible neighbors"
);
assert.strictEqual(
  registry.getAutotileMask("water_shallow", 1, 1, terrainGrid),
  0,
  "water autotile mask should not connect to dry terrain"
);

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
assert.ok(registry.getTerrainType("test_tile"), "register should create a TerrainType for manual tiles");
assert.strictEqual(registry.getTerrainType("test_tile").renderMid({ tile: custom }).terrainType, "test_tile", "manual TerrainType should render by id");

console.log("tile registry checks passed");
