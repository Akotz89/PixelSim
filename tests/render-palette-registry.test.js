const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const registrySource = read("js/assets/registry.js");
const terrainSource = read("js/render/terrain.js");
const surfaceColorSource = read("js/render/surface-color.js");
const atlasSource = read("js/render/entity-atlas.js");

assert.ok(terrainSource.indexOf("PS.assets.getPaletteColor") >= 0, "terrain renderer should consume asset palette colors");
assert.ok(atlasSource.indexOf("getPaletteRgb") >= 0, "entity atlas should consume registry palette colors for terrain cells");
assert.ok(surfaceColorSource.indexOf("getBaseBiomeColor(\"forest\")") >= 0, "surface color renderer should consume terrain palette colors");
assert.ok(terrainSource.indexOf("switch (biome)") === -1, "terrain renderer should not use the old hardcoded biome color switch");

const context = {
  PS: {
    assets: {},
    render: {}
  },
  CONFIG: {
    LINEAGE_COLORS: ["#72d7ff"]
  },
  Uint8Array,
  Date,
  Object,
  String,
  Number,
  Boolean,
  Array,
  Map,
  Math,
  Error,
  performance,
  getPlanetLandformTerrainBand() {
    return { color: "#000000", amount: 0 };
  },
  getPlanetMaterialStrata() {
    return null;
  },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
};

vm.createContext(context);
vm.runInContext(registrySource, context, { filename: "js/assets/registry.js" });
vm.runInContext(terrainSource, context, { filename: "js/render/terrain.js" });
vm.runInContext(surfaceColorSource, context, { filename: "js/render/surface-color.js" });
vm.runInContext(atlasSource, context, { filename: "js/render/entity-atlas.js" });

assert.strictEqual(context.PS.assets.getPaletteColor("terrain", "forest", "#000000"), "#0f351d", "asset registry should expose terrain palette values");
assert.strictEqual(context.PS.render.terrain.getBaseBiomeColor("forest"), "#0f351d", "terrain biome color should come from the registry palette");
assert.strictEqual(context.PS.render.terrain.getBaseBiomeColor("mountains"), "#3a3a3a", "mountain aliases should resolve through the registry palette");
assert.strictEqual(context.PS.render.terrain.getBiomePackedColor("forest"), 0x0f351d, "packed biome lookup should match registry palette color");

context.PS.assets.registerPalette("terrain", Object.assign({}, context.PS.assets.getPalette("terrain"), {
  forest: "#225511",
  ocean: "#102030"
}));

assert.strictEqual(context.PS.render.terrain.getBaseBiomeColor("forest"), "#225511", "terrain color should react to palette re-registration");
assert.strictEqual(context.PS.render.terrain.getBiomePackedColor("forest"), 0x225511, "packed LUT should refresh when palette version changes");
assert.strictEqual(
  context.PS.render.surfaceColor.getSurfaceColor({ biome: "forest", detail: { surface: "woodland" } }),
  context.PS.render.terrain.shadeHexColor("#225511", 0.41),
  "hex surface color path should use the re-registered terrain palette"
);
assert.strictEqual(
  context.PS.render.surfaceColor.getSurfaceColorPacked({ biome: "forest", detail: { surface: "woodland" } }),
  context.PS.render.terrain.shadePacked(0x225511, 0.41),
  "packed surface color path should use the re-registered terrain palette"
);

context.PS.atlas.ensurePage();
const forestCell = context.PS.atlas.getTerrainCell("forest", 4, 8, {
  detail: {
    surface: "forest floor",
    elevation: 0.3,
    materialSignals: {}
  }
});
const page = context.PS.atlas.pages[forestCell.pageIndex];
const centerIndex = ((forestCell.y + 7) * page.width + forestCell.x + 7) * 4;
const center = Array.from(page.data.slice(centerIndex, centerIndex + 4));

assert.ok(forestCell.name.indexOf("terrain.") === 0, "terrain atlas should still select registered terrain material cells");
assert.notDeepStrictEqual(center, [15, 53, 29, 255], "terrain atlas cell should no longer be locked to the default forest base color");
assert.deepStrictEqual(center.slice(0, 3), [34, 85, 17], "terrain atlas cell should reflect the re-registered palette range");

console.log("render palette registry checks passed");
