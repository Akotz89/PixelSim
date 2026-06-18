require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const registrySource = fs.readFileSync(path.join(root, "js/core/tile-registry.js"), "utf8");
const tilesData = JSON.parse(fs.readFileSync(path.join(root, "data/tiles.json"), "utf8"));
const biomesData = JSON.parse(fs.readFileSync(path.join(root, "data/biomes.json"), "utf8"));
const biomesSidecarSource = fs.readFileSync(path.join(root, "data/biomes.json.js"), "utf8");

function assertRangeObject(owner, field) {
  const range = owner[field];
  assert.ok(range && typeof range.min === "number" && typeof range.max === "number", owner.id + " should define " + field + " min/max");
  assert.ok(range.min <= range.max, owner.id + " should keep " + field + " min <= max");
}

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
vm.runInContext(biomesSidecarSource, sidecarContext, { filename: "data/biomes.json.js" });
assert.strictEqual(
  JSON.stringify(sidecarContext.PS.assets.captured["data/biomes.json"]),
  JSON.stringify(biomesData),
  "biomes sidecar should match biomes JSON"
);

const registryContext = {
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
vm.createContext(registryContext);
vm.runInContext(registrySource, registryContext, { filename: "js/core/tile-registry.js" });
const registry = registryContext.PS.core.TileRegistry;
registry.loadFromJSON(tilesData);

assert.ok(Array.isArray(tilesData.tiles), "tiles.json should define a tiles array");
assert.ok(tilesData.tiles.length >= 18, "tiles.json should define at least 18 tile types");
assert.ok(Array.isArray(biomesData.biomes), "biomes.json should define a biomes array");
assert.ok(biomesData.biomes.length >= 8, "biomes.json should define at least 8 biomes");

const tileIds = new Set(tilesData.tiles.map((tile) => tile.id));
const referencedTileIds = new Set();
const biomeIds = new Set();

biomesData.biomes.forEach((biome) => {
  assert.ok(biome.id && typeof biome.id === "string", "biome should define string id");
  assert.ok(!biomeIds.has(biome.id), "biome ids should be unique: " + biome.id);
  biomeIds.add(biome.id);

  assert.ok(Array.isArray(biome.primaryTiles) && biome.primaryTiles.length > 0, biome.id + " should define primary tiles");
  assert.ok(Array.isArray(biome.edgeTiles) && biome.edgeTiles.length > 0, biome.id + " should define edge tiles");
  assert.ok(typeof biome.vegetationDensity === "number", biome.id + " should define vegetation density");
  assert.ok(biome.vegetationDensity >= 0 && biome.vegetationDensity <= 1, biome.id + " vegetation density should be normalized");
  assert.ok(Array.isArray(biome.treeTypes), biome.id + " should define treeTypes array");
  assertRangeObject(biome, "temperature");
  assertRangeObject(biome, "moisture");

  biome.primaryTiles.concat(biome.edgeTiles).forEach((tileId) => {
    assert.ok(tileIds.has(tileId), biome.id + " references unknown tile id " + tileId);
    referencedTileIds.add(tileId);
  });
});

tilesData.tiles.forEach((tile) => {
  assert.ok(referencedTileIds.has(tile.id), "tile should be referenced by at least one biome: " + tile.id);
  assert.ok(registry.get(tile.id), "TileRegistry should load tile from data: " + tile.id);
});

["temperate", "arid", "tropical", "tundra", "highland", "coastal", "volcanic", "wetland"].forEach((biomeId) => {
  assert.ok(biomeIds.has(biomeId), "biomes.json should include required biome " + biomeId);
});

console.log("tile biome data checks passed");
