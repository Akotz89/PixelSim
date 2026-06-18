const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const registrySource = read("js/assets/registry.js");
const terrainSource = read("js/render/terrain.js");
const surfaceColorSource = read("js/render/surface-color.js");
const atlasSource = read("js/render/entity-atlas.js");
const atlasDetailSource = read("js/render/terrain-atlas-detail.js");
const groundGradientsSidecarSource = read("data/ground-gradients.json.js");
const groundGradientsData = JSON.parse(read("data/ground-gradients.json"));
const eraPalettesSidecarSource = read("data/era-palettes.json.js");
const eraPalettesData = JSON.parse(read("data/era-palettes.json"));
const mainLoopSource = read("js/main-loop.js");

assert.ok(terrainSource.indexOf("PS.assets.getPaletteColor") >= 0, "terrain renderer should consume asset palette colors");
assert.ok(atlasSource.indexOf("getPaletteRgb") >= 0, "entity atlas should consume registry palette colors for terrain cells");
assert.ok(surfaceColorSource.indexOf("getBaseBiomeColor(\"forest\")") >= 0, "surface color renderer should consume terrain palette colors");
assert.ok(mainLoopSource.indexOf("data/ground-gradients.json") >= 0, "startup data should load ground moisture gradients JSON");
assert.ok(mainLoopSource.indexOf("data/era-palettes.json") >= 0, "startup data should load era palettes JSON");
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
context.PS.assets.jsonData = {};
context.PS.assets.registerJSON = function(url, data) {
  this.jsonData[url] = data;
  return data;
};
vm.runInContext(groundGradientsSidecarSource, context, { filename: "data/ground-gradients.json.js" });
vm.runInContext(eraPalettesSidecarSource, context, { filename: "data/era-palettes.json.js" });
vm.runInContext(terrainSource, context, { filename: "js/render/terrain.js" });
vm.runInContext(surfaceColorSource, context, { filename: "js/render/surface-color.js" });
vm.runInContext(atlasSource, context, { filename: "js/render/entity-atlas.js" });
vm.runInContext(atlasDetailSource, context, { filename: "js/render/terrain-atlas-detail.js" });

assert.strictEqual(
  JSON.stringify(context.PS.assets.jsonData["data/ground-gradients.json"]),
  JSON.stringify(groundGradientsData),
  "ground gradients sidecar should match JSON data"
);
assert.strictEqual(
  JSON.stringify(context.PS.assets.jsonData["data/era-palettes.json"]),
  JSON.stringify(eraPalettesData),
  "era palettes sidecar should match JSON data"
);
context.PS.render.surfaceColor.loadGroundGradientConfig(context.PS.assets.jsonData["data/ground-gradients.json"]);
assert.strictEqual(
  context.PS.render.surfaceColor.groundMoistureGradients.grass.length,
  16,
  "ground moisture gradients should load 16 stops per ground type"
);
assert.strictEqual(
  context.PS.render.surfaceColor.getMoistureGradientIndex(0.5, 0),
  8,
  "moisture should map to gradient index 0-15"
);
assert.strictEqual(
  context.PS.render.surfaceColor.getMoistureGradientIndex(0.5, -1),
  7,
  "random offset should move the moisture index down by one"
);
assert.strictEqual(
  context.PS.render.surfaceColor.getMoistureGradientIndex(0.5, 1),
  9,
  "random offset should move the moisture index up by one"
);

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

const moistGrassSample = {
  biome: "grassland",
  x: 7,
  y: 11,
  ran: 1,
  detail: {
    surface: "grass",
    shade: 0.5,
    elevation: 0.5,
    roughness: 0,
    hillshade: 0.5,
    materialSignals: {
      moisture: 0.5
    }
  },
  tile: {
    biome: "grassland",
    moisture: 1.1,
    ran: 1,
    riverStrength: 0,
    coastFactor: 0,
    shallowWater: 0
  }
};
const expectedMoistGrass = context.PS.render.surfaceColor.groundMoistureGradients.grass[8];
assert.strictEqual(
  context.PS.render.surfaceColor.getGroundMoistureColor(moistGrassSample),
  expectedMoistGrass,
  "ground moisture gradient should sample the configured 16-stop gradient"
);
assert.strictEqual(
  context.PS.render.surfaceColor.getGroundMoistureKey(moistGrassSample),
  "gmoist.v1.grass.8",
  "ground moisture key should include gradient id and index"
);
assert.strictEqual(
  context.PS.render.surfaceColor.applyGroundMoistureTint(moistGrassSample, "#305f22"),
  context.PS.render.terrain.blendHexColors(
    "#305f22",
    expectedMoistGrass,
    context.PS.render.surfaceColor.getGroundMoistureBlendAmount(moistGrassSample)
  ),
  "hex moisture tint should blend with existing terrain color instead of replacing it"
);
assert.strictEqual(
  context.PS.render.surfaceColor.applyGroundMoisturePackedTint(moistGrassSample, 0x305f22),
  context.PS.render.terrain.blendPacked(
    0x305f22,
    context.PS.render.terrain.hexToPacked(expectedMoistGrass),
    context.PS.render.surfaceColor.getGroundMoistureBlendAmount(moistGrassSample)
  ),
  "packed moisture tint should blend with existing terrain color instead of replacing it"
);
assert.notStrictEqual(
  context.PS.render.surfaceColor.getSurfaceColorPacked(moistGrassSample),
  context.PS.render.terrain.shadePacked(context.PS.render.terrain.hexToPacked(expectedMoistGrass), 0.41),
  "packed surface path should not replace the full terrain pipeline with moisture color"
);

context.PS.render.surfaceColor.loadEraPaletteConfig(context.PS.assets.jsonData["data/era-palettes.json"]);
assert.deepStrictEqual(
  Object.keys(context.PS.render.surfaceColor.groundMoistureGradients).filter(key => !context.PS.render.surfaceColor.eraPalettes[key]),
  [],
  "every configured ground gradient should have a matching era palette"
);
assert.strictEqual(
  context.PS.render.surfaceColor.eraPalettes.grass.spring.length,
  16,
  "era palettes should load four 16-stop palettes per ground type"
);
assert.strictEqual(
  context.PS.render.surfaceColor.getEraPaletteColor("grass", 8, 0),
  context.PS.render.surfaceColor.eraPalettes.grass.winter[8],
  "era interpolation should start at the winter palette"
);
assert.strictEqual(
  context.PS.render.surfaceColor.getEraPaletteColor("grass", 8, 1),
  context.PS.render.surfaceColor.eraPalettes.grass.autumn[8],
  "era interpolation should end at the autumn palette"
);
assert.strictEqual(
  context.PS.render.surfaceColor.getEraPaletteColor("grass", 8, 0.25),
  context.PS.render.terrain.blendHexColors(
    context.PS.render.surfaceColor.eraPalettes.grass.winter[8],
    context.PS.render.surfaceColor.eraPalettes.grass.spring[8],
    0.75
  ),
  "era interpolation should blend continuously between adjacent palettes"
);
const eraGrassSample = Object.assign({}, moistGrassSample, {
  detail: Object.assign({}, moistGrassSample.detail, {
    materialSignals: Object.assign({}, moistGrassSample.detail.materialSignals, { growth: 0.25 })
  })
});
const eraGrassHex = context.PS.render.surfaceColor.getGroundMoistureColor(eraGrassSample);
assert.strictEqual(
  context.PS.render.surfaceColor.applyGroundMoisturePackedTint(eraGrassSample, 0x305f22),
  context.PS.render.terrain.blendPacked(
    0x305f22,
    context.PS.render.terrain.hexToPacked(eraGrassHex),
    context.PS.render.surfaceColor.getGroundMoistureBlendAmount(eraGrassSample)
  ),
  "packed surface path should blend interpolated era palette color as a tint"
);
context.PS.deepTime = {
  getTerrainTint() {
    return { color: "#ffffff", amount: 0.25 };
  }
};
assert.notStrictEqual(
  context.PS.render.surfaceColor.getSurfaceColorPacked(eraGrassSample),
  context.PS.render.terrain.shadePacked(
    context.PS.render.terrain.blendPacked(
      context.PS.render.terrain.hexToPacked(eraGrassHex),
      context.PS.render.terrain.hexToPacked("#ffffff"),
      0.25
    ),
    0.41
  ),
  "packed era palette path should not apply deep-time terrain tint to a wholesale moisture replacement"
);
context.PS.deepTime = null;
assert.strictEqual(
  context.PS.render.surfaceColor.getEraWaterColor(0),
  context.PS.render.surfaceColor.eraWaterPalette.winter,
  "water era color should expose the winter variant"
);
assert.strictEqual(
  context.PS.render.surfaceColor.getEraWaterColor(1),
  context.PS.render.surfaceColor.eraWaterPalette.normal,
  "water era color should expose the normal variant"
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
let hasRegisteredPalettePixel = false;

for (let y = 0; y < forestCell.h; y += 1) {
  for (let x = 0; x < forestCell.w; x += 1) {
    const pixelIndex = ((forestCell.y + y) * page.width + forestCell.x + x) * 4;
    const pixel = Array.from(page.data.slice(pixelIndex, pixelIndex + 3));
    if (JSON.stringify(pixel) === JSON.stringify([34, 85, 17])) {
      hasRegisteredPalettePixel = true;
    }
  }
}

assert.ok(forestCell.name.indexOf("terrain.") === 0, "terrain atlas should still select registered terrain material cells");
assert.notDeepStrictEqual(center, [15, 53, 29, 255], "terrain atlas cell should no longer be locked to the default forest base color");
assert.ok(hasRegisteredPalettePixel, "terrain atlas cell should reflect the re-registered palette range");

const dryGrassCell = context.PS.atlas.getTerrainCell("grassland", 3, 5, Object.assign({}, moistGrassSample, {
  ran: 1,
  detail: Object.assign({}, moistGrassSample.detail, { materialSignals: { moisture: 0 } }),
  tile: Object.assign({}, moistGrassSample.tile, { moisture: 0, ran: 1 })
}));
const wetGrassCell = context.PS.atlas.getTerrainCell("grassland", 3, 5, Object.assign({}, moistGrassSample, {
  ran: 1,
  detail: Object.assign({}, moistGrassSample.detail, { materialSignals: { moisture: 1 } }),
  tile: Object.assign({}, moistGrassSample.tile, { moisture: 2.2, ran: 1 })
}));
assert.notStrictEqual(dryGrassCell.name, wetGrassCell.name, "terrain atlas cell keys should include moisture gradient buckets");

const previousGradientVersion = context.PS.render.surfaceColor.groundMoistureGradientVersion;
context.PS.render.surfaceColor.loadGroundGradientConfig(groundGradientsData);
assert.notStrictEqual(
  context.PS.render.surfaceColor.getGroundMoistureKey(moistGrassSample),
  "gmoist.v" + previousGradientVersion + ".grass.8",
  "ground moisture key should change when gradient config reloads"
);
const previousEraVersion = context.PS.render.surfaceColor.eraPaletteVersion;
context.PS.render.surfaceColor.loadEraPaletteConfig(eraPalettesData);
assert.notStrictEqual(
  context.PS.render.surfaceColor.getEraPaletteKey(eraGrassSample),
  "era.v" + previousEraVersion + ".grass.16",
  "era palette key should change when era config reloads"
);

const neighborTransition = {
  neighborBiome: "desert",
  type: "dry",
  mask: 1,
  weight: 0.5
};
const neighborTransitionSample = {
  biome: "grassland",
  detail: { surface: "grass" },
  tileBlend: {
    transitionStrength: 0.6,
    biomeWeights: { grassland: 0.5, desert: 0.5 },
    tiles: [{
      biome: "desert",
      weight: 0.5,
      x: 9,
      y: 3,
      ran: 1,
      detail: { surface: "sand", materialSignals: { moisture: 0 } },
      tile: { biome: "desert", moisture: 0, ran: 1 }
    }]
  }
};
const waterOverlayCell = context.PS.atlas.getTerrainCell("ocean", 10, 3, {
  detail: {
    surface: "tidal shore",
    feature: "foam",
    materialSignals: { waterDepth: 0.22, shallowWater: 0.8, shoreMask: 1 }
  },
  tileBlend: {
    transitionStrength: 0.7,
    biomeWeights: { ocean: 0.5, desert: 0.5 },
    tiles: [{
      biome: "desert",
      weight: 0.5,
      x: 10,
      y: 3,
      ran: 1,
      detail: { surface: "sand", materialSignals: { moisture: 0 } },
      tile: { biome: "desert", moisture: 0, ran: 1 }
    }]
  }
});
const waterOverlayPage = context.PS.atlas.pages[waterOverlayCell.pageIndex];
const waterOverlayPixel = Array.from(waterOverlayPage.data.slice(((waterOverlayCell.y + 0) * waterOverlayPage.width + waterOverlayCell.x + 15) * 4, ((waterOverlayCell.y + 0) * waterOverlayPage.width + waterOverlayCell.x + 15) * 4 + 4));
assert.ok(
  waterOverlayCell.name.indexOf(".stencil.water.1.") > 0,
  "water terrain cells should encode the stencil mask and ground color bucket"
);
assert.deepStrictEqual(
  waterOverlayPixel,
  Array.from(context.PS.atlas.hexToRgb(context.PS.render.surfaceColor.getGroundMoistureColor(waterOverlayCell && {
    biome: "desert",
    x: 10,
    y: 3,
    ran: 1,
    detail: { surface: "sand", materialSignals: { moisture: 0 } },
    tile: { biome: "desert", moisture: 0, ran: 1 }
  })).concat([255])),
  "water edge stencil should render neighboring ground texture through the mask"
);
assert.deepStrictEqual(
  context.PS.atlas.getTerrainTransitionGradientColor(neighborTransitionSample, neighborTransition),
  context.PS.atlas.hexToRgb(context.PS.render.surfaceColor.getGroundMoistureColor(neighborTransitionSample.tileBlend.tiles[0])).concat([255]),
  "terrain transition edges should sample the neighboring active ground color"
);
const transitionOverlayCell = context.PS.atlas.getTerrainCell("grassland", 11, 3, neighborTransitionSample);
const transitionOverlayPage = context.PS.atlas.pages[transitionOverlayCell.pageIndex];
const transitionOverlayPixel = Array.from(transitionOverlayPage.data.slice(((transitionOverlayCell.y + 0) * transitionOverlayPage.width + transitionOverlayCell.x + 15) * 4, ((transitionOverlayCell.y + 0) * transitionOverlayPage.width + transitionOverlayCell.x + 15) * 4 + 4));
assert.deepStrictEqual(
  transitionOverlayPixel,
  Array.from(context.PS.atlas.hexToRgb(context.PS.render.surfaceColor.getGroundMoistureColor(neighborTransitionSample.tileBlend.tiles[0])).concat([255])),
  "terrain transition mask should render neighboring ground texture at the boundary"
);
const wetNeighborTransitionSample = JSON.parse(JSON.stringify(neighborTransitionSample));
wetNeighborTransitionSample.tileBlend.tiles[0].detail.materialSignals.moisture = 1;
wetNeighborTransitionSample.tileBlend.tiles[0].tile.moisture = 2.2;
const wetTransitionOverlayCell = context.PS.atlas.getTerrainCell("grassland", 11, 3, wetNeighborTransitionSample);
assert.notStrictEqual(
  transitionOverlayCell.name,
  wetTransitionOverlayCell.name,
  "transition atlas keys should include neighboring ground color identity"
);

console.log("render palette registry checks passed");
