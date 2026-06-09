const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const namespaceSource = read("js/core/namespace.js");
const tileRegistrySource = read("js/core/tile-registry.js");
const atlasSource = read("js/render/entity-atlas.js");
const atlasIntentSource = read("js/render/entity-atlas-intents.js");
const atlasCivilizationSource = read("js/render/entity-atlas-civilization.js");
const atlasEventsSource = read("js/render/entity-atlas-events.js");
const terrainAtlasCivilizationSource = read("js/render/terrain-atlas-civilization.js");
const terrainAtlasDetailSource = read("js/render/terrain-atlas-detail.js");
const tilesData = JSON.parse(read("data/tiles.json"));

assert.ok(namespaceSource.indexOf("js/render/entity-atlas.js") >= 0, "entity atlas should load in the runtime manifest");
assert.ok(namespaceSource.indexOf("js/render/entity-atlas-intents.js") > namespaceSource.indexOf("js/render/entity-atlas.js"), "intent atlas sidecar should load after atlas core");
assert.ok(namespaceSource.indexOf("js/render/entity-atlas-civilization.js") > namespaceSource.indexOf("js/render/entity-atlas-intents.js"), "civilization atlas sidecar should load after intent atlas helpers");
assert.ok(namespaceSource.indexOf("js/render/entity-atlas-events.js") > namespaceSource.indexOf("js/render/entity-atlas-civilization.js"), "event atlas sidecar should load after entity civilization helpers");
assert.ok(namespaceSource.indexOf("js/render/entity-atlas-events.js") < namespaceSource.indexOf("js/render/entities.js"), "event atlas sidecar should load before the entity facade");
assert.ok(namespaceSource.indexOf("js/render/terrain-atlas-civilization.js") > namespaceSource.indexOf("js/render/entity-atlas-civilization.js"), "terrain civilization atlas sidecar should load after entity civilization helpers");
assert.ok(namespaceSource.indexOf("js/render/terrain-atlas-civilization.js") < namespaceSource.indexOf("js/render/terrain-atlas-detail.js"), "terrain civilization atlas sidecar should load before terrain detail overlays");
assert.ok(namespaceSource.indexOf("js/render/terrain-atlas-detail.js") > namespaceSource.indexOf("js/render/entity-atlas.js"), "terrain atlas detail should load after atlas core");
assert.strictEqual(namespaceSource.indexOf("js/render/entity-webgl.js"), -1, "runtime manifest must not load the legacy entity WebGL renderer");

const context = {
  PS: {
    core: {},
    render: {},
    atlas: null
  },
  CONFIG: {
    LINEAGE_COLORS: ["#72d7ff", "#58f06c", "#c884ff"]
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
  performance: {
    now() {
      return 1;
    }
  },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
};

vm.createContext(context);
vm.runInContext(tileRegistrySource, context, { filename: "js/core/tile-registry.js" });
vm.runInContext(atlasSource, context, { filename: "js/render/entity-atlas.js" });
vm.runInContext(atlasIntentSource, context, { filename: "js/render/entity-atlas-intents.js" });
vm.runInContext(atlasCivilizationSource, context, { filename: "js/render/entity-atlas-civilization.js" });
vm.runInContext(atlasEventsSource, context, { filename: "js/render/entity-atlas-events.js" });
vm.runInContext(terrainAtlasCivilizationSource, context, { filename: "js/render/terrain-atlas-civilization.js" });
vm.runInContext(terrainAtlasDetailSource, context, { filename: "js/render/terrain-atlas-detail.js" });

context.PS.core.TileRegistry.loadFromJSON(tilesData);
context.PS.atlas.init();

const roundOrganism = {
  lineageId: 1,
  x: 10,
  y: 20,
  traits: {
    bodySize: 0.75,
    bodyShape: 0,
    limbCount: 2,
    appendageType: 0,
    camouflage: 0
  }
};
const angularOrganism = {
  lineageId: 2,
  x: 10,
  y: 20,
  traits: {
    bodySize: 2.4,
    bodyShape: 3,
    limbCount: 10,
    appendageType: 3,
    camouflage: 0.8
  }
};

const roundCell = context.PS.atlas.getTraitOrganismCell(roundOrganism, 0);
const angularCell = context.PS.atlas.getTraitOrganismCell(angularOrganism, 0);
const oceanCell = context.PS.atlas.getTerrainCell("ocean", 4, 8);
const forestCell = context.PS.atlas.getTerrainCell("forest", 4, 8);
const desertCell = context.PS.atlas.getTerrainCell("desert", 4, 8);
const volcanicCell = context.PS.atlas.getTerrainCell("volcanic", 4, 8);
const deepWaterCell = context.PS.atlas.getTerrainCell("ocean", 12, 5, {
  detail: {
    surface: "deep water",
    elevation: 0.1,
    materialSignals: { waterDepth: 0.9, wetness: 1 }
  }
});
const marshCell = context.PS.atlas.getTerrainCell("wetland", 13, 5, {
  detail: {
    surface: "meadow",
    elevation: 0.25,
    roughness: 0.1,
    materialSignals: { wetness: 0.8, surfaceRoughness: 0.1 }
  }
});
const cliffCell = context.PS.atlas.getTerrainCell("mountain", 14, 5, {
  detail: {
    surface: "rock",
    elevation: 0.88,
    roughness: 0.9,
    materialSignals: { surfaceRoughness: 0.92 }
  }
});
const riverCell = context.PS.atlas.getTerrainCell("grassland", 16, 6, {
  detail: {
    surface: "river channel",
    elevation: -0.12,
    roughness: 0.2,
    materialSignals: { waterDepth: 0.42, wetness: 0.9, flow: 0.82 }
  }
});
const tidalMudCell = context.PS.atlas.getTerrainCell("grassland", 17, 6, {
  detail: {
    surface: "tidal shore",
    elevation: -0.04,
    materialSignals: { wetness: 0.78 }
  }
});
const lavaFlowCell = context.PS.atlas.getTerrainCell("mountain", 18, 6, {
  detail: {
    surface: "lava flow",
    elevation: 0.72,
    roughness: 0.54,
    materialSignals: { lava: 0.94, heat: 1 }
  }
});
const lichenTundraCell = context.PS.atlas.getTerrainCell("tundra", 19, 6, {
  detail: {
    surface: "lichen frost",
    elevation: 0.32,
    roughness: 0.22,
    materialSignals: { lichen: 0.86, snow: 0.18 }
  }
});
const reedMatCell = context.PS.atlas.getTerrainCell("wetland", 20, 6, {
  detail: {
    surface: "reed mat",
    elevation: 0.08,
    roughness: 0.12,
    materialSignals: { wetness: 0.86, reedDensity: 0.92 }
  }
});
const plainGrassCell = context.PS.atlas.getTerrainCell("grassland", 22, 9, {
  detail: {
    surface: "grass",
    elevation: 0.42,
    roughness: 0.2,
    materialSignals: {}
  },
  tileBlend: {
    biomeWeights: { grassland: 1 },
    transitionStrength: 0,
    xAmount: 0.5,
    yAmount: 0.5
  }
});
const noFeatureCell = context.PS.atlas.getTerrainCell("unknown", 41, 18, {
  detail: {
    surface: "",
    elevation: 0,
    roughness: 0,
    materialSignals: {}
  }
});
const coastEdgeGrassCell = context.PS.atlas.getTerrainCell("grassland", 22, 9, {
  detail: {
    surface: "grass",
    elevation: 0.42,
    roughness: 0.2,
    materialSignals: {}
  },
  tileBlend: {
    biomeWeights: { grassland: 0.64, ocean: 0.36 },
    transitionStrength: 0.36,
    xAmount: 0.82,
    yAmount: 0.5
  }
});
const microbialMatCell = context.PS.atlas.getTerrainCell("wetland", 26, 12, {
  detail: {
    surface: "moss",
    elevation: 0.24,
    roughness: 0.12,
    materialSignals: {
      wetness: 0.82,
      microbialBloom: 0.91,
      organicMatter: 0.72
    }
  },
  microbial: {
    bloomIntensity: 0.91,
    density: 0.84
  },
  tileBlend: {
    biomeWeights: { wetland: 1 },
    transitionStrength: 0,
    xAmount: 0.5,
    yAmount: 0.5
  }
});
const ordinaryWetlandCell = context.PS.atlas.getTerrainCell("wetland", 26, 12, {
  detail: {
    surface: "moss",
    elevation: 0.24,
    roughness: 0.12,
    materialSignals: {
      wetness: 0.82
    }
  },
  tileBlend: {
    biomeWeights: { wetland: 1 },
    transitionStrength: 0,
    xAmount: 0.5,
    yAmount: 0.5
  }
});
const ordinaryRockCell = context.PS.atlas.getTerrainCell("mountain", 30, 14, {
  detail: {
    surface: "rock",
    elevation: 0.82,
    roughness: 0.76,
    materialSignals: { surfaceRoughness: 0.76 }
  }
});
const mineralVeinCell = context.PS.atlas.getTerrainCell("mountain", 30, 14, {
  detail: {
    surface: "rock",
    elevation: 0.82,
    roughness: 0.76,
    materialSignals: {
      surfaceRoughness: 0.76,
      mineralDensity: 0.88,
      resourceDensity: 0.74
    },
    materialStrata: {
      primary: "bedrock",
      secondary: "mineral-vein"
    }
  }
});
const ordinaryEcologyCell = context.PS.atlas.getTerrainCell("grassland", 34, 18, {
  detail: {
    surface: "grass",
    elevation: 0.42,
    roughness: 0.2,
    materialSignals: {}
  }
});
const activeEcologyCell = context.PS.atlas.getTerrainCell("grassland", 34, 18, {
  detail: {
    surface: "grass",
    elevation: 0.42,
    roughness: 0.2,
    materialSignals: {}
  },
  ecology: {
    key: "eco.3.2",
    foodPressure: 1,
    organismPressure: 0.67,
    organicMatter: 0.67,
    resourceRichness: 1
  }
});
const settlementFootprintCell = context.PS.atlas.getTerrainCell("grassland", 36, 18, {
  detail: {
    surface: "grass",
    elevation: 0.42,
    roughness: 0.2,
    materialSignals: {}
  },
  civilization: {
    key: "civ.settlement.3",
    type: "settlement",
    bucket: 3,
    pressure: 0.9,
    settlementPressure: 0.9,
    lineageId: 1
  }
});
const routeFootprintCell = context.PS.atlas.getTerrainCell("grassland", 37, 18, {
  detail: {
    surface: "grass",
    elevation: 0.42,
    roughness: 0.2,
    materialSignals: {}
  },
  civilization: {
    key: "civ.route.2",
    type: "route",
    bucket: 2,
    pressure: 0.58,
    routePressure: 0.58,
    lineageId: 2
  }
});
const borderFootprintCell = context.PS.atlas.getTerrainCell("grassland", 38, 18, {
  detail: {
    surface: "grass",
    elevation: 0.42,
    roughness: 0.2,
    materialSignals: {}
  },
  civilization: {
    key: "civ.border.2",
    type: "border",
    bucket: 2,
    pressure: 0.52,
    borderPressure: 0.52,
    lineageId: 3
  }
});
const highSurfaceVariants = new Set();
for (let y = 10000; y < 10016; y++) {
  highSurfaceVariants.add(context.PS.atlas.getTerrainVariant(22, y, 4, 29));
}
const sparseFoodCell = context.PS.atlas.getFoodCell(0, { x: 2, y: 3 });
const richFoodCell = context.PS.atlas.getFoodCell(0, { x: 2, y: 3, amount: 140 });
const grainFoodCell = context.PS.atlas.getFoodCell(0, { x: 4, y: 5, amount: 140, category: "grain" });
const fruitFoodCell = context.PS.atlas.getFoodCell(0, { x: 4, y: 5, amount: 140, category: "fruit" });
const oreFoodCell = context.PS.atlas.getFoodCell(0, { x: 4, y: 5, amount: 140, category: "ore" });
const campCell = context.PS.atlas.getSettlementCell({ lineageId: 1, level: 1 });
const colonyCell = context.PS.atlas.getSettlementCell({ lineageId: 2, level: 6, isColony: true });
const outpostCell = context.PS.atlas.getSettlementCell({ lineageId: 3, level: 2, isOutpost: true });
const inactiveRouteCell = context.PS.atlas.getRouteCell({ lineageId: 1, isActive: false, foodTransferred: 0 }, "horizontal");
const activeRouteCell = context.PS.atlas.getRouteCell({ lineageId: 1, isActive: true, foodTransferred: 12 }, "horizontal");
const busyRouteCell = context.PS.atlas.getRouteCell({ lineageId: 2, isActive: true, foodTransferred: 120 }, "diag");
const weakInfluenceCell = context.PS.atlas.getSettlementInfluenceCell({ lineageId: 1, level: 1, claimedTiles: 10 });
const strongInfluenceCell = context.PS.atlas.getSettlementInfluenceCell({ lineageId: 2, level: 5, claimedTiles: 240 });
const selectedFoodIntentCell = context.PS.atlas.getRepresentativeIntentCell({
  lineageId: 1,
  behavior: "feeding",
  target: { type: "food", x: 12, y: 8 },
  selected: true
});
const pinnedBreedingIntentCell = context.PS.atlas.getRepresentativeIntentCell({
  lineageId: 2,
  behavior: "breeding",
  target: null,
  pinned: true
});
const earlyReadinessCell = context.PS.atlas.getSettlementReadinessCell({
  lineageId: 1,
  progressBucket: 1
});
const readyReadinessCell = context.PS.atlas.getSettlementReadinessCell({
  lineageId: 2,
  progressBucket: 3
});
const biologyEventCell = context.PS.atlas.getOrbitEventMarkerCell({
  category: "biology",
  severity: "info"
});
const criticalGeologyEventCell = context.PS.atlas.getOrbitEventMarkerCell({
  category: "geology",
  severity: "critical"
});
const stats = context.PS.atlas.getStats();
const page = context.PS.atlas.pages[0];

function pixelAt(cell, x, y) {
  const cellPage = context.PS.atlas.pages[cell.pageIndex];
  const index = ((cell.y + y) * cellPage.width + cell.x + x) * 4;
  return Array.from(cellPage.data.slice(index, index + 4));
}

function uniqueColorCount(cell) {
  const colors = new Set();

  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      colors.add(pixelAt(cell, x, y).join(","));
    }
  }

  return colors.size;
}

assert.ok(page.data instanceof Uint8Array, "atlas page should be a packed RGBA buffer");
assert.strictEqual(page.width, 256, "atlas page should use stable packed width");
assert.strictEqual(page.height, 256, "atlas page should use stable packed height");
assert.ok(context.PS.atlas.pages.length >= 1, "atlas should expose one or more packed pages");
assert.notStrictEqual(roundCell.name, angularCell.name, "different traits should produce different cell keys");
assert.strictEqual(roundCell.w, 32, "organism cell should reserve diffuse plus normal halves");
assert.strictEqual(roundCell.h, 16, "organism cell should use a 16px pixel sprite height");
assert.notDeepStrictEqual(pixelAt(roundCell, 7, 7), pixelAt(angularCell, 7, 7), "trait/lineage differences should change sprite pixels");
assert.notDeepStrictEqual(pixelAt(oceanCell, 7, 7), pixelAt(forestCell, 7, 7), "ocean and forest terrain cells should use distinct material pixels");
assert.notDeepStrictEqual(pixelAt(desertCell, 7, 7), pixelAt(volcanicCell, 7, 7), "desert and volcanic terrain cells should use distinct material pixels");
assert.ok(uniqueColorCount(oceanCell) >= 5, "water atlas cells should include foam/shadow detail beyond base palette colors");
assert.ok(uniqueColorCount(forestCell) >= 5, "forest atlas cells should include canopy detail beyond base palette colors");
assert.ok(uniqueColorCount(desertCell) >= 5, "desert atlas cells should include dune detail beyond base palette colors");
assert.ok(uniqueColorCount(cliffCell) >= 5, "ridge atlas cells should include rocky detail beyond base palette colors");
assert.ok(oceanCell.name.indexOf("terrain.water_") === 0, "ocean terrain should select registered water materials");
assert.ok(forestCell.name.indexOf("terrain.forest_floor.") === 0 || forestCell.name.indexOf("terrain.rock_mossy.") === 0, "forest terrain should select registered forest materials");
assert.ok(deepWaterCell.name.indexOf("terrain.water_deep.") === 0, "deep water samples should select the deep water tile");
assert.ok(marshCell.name.indexOf("terrain.marsh.") === 0 || marshCell.name.indexOf("terrain.wetland.") === 0 || marshCell.name.indexOf("terrain.mud.") === 0, "wet samples should select wetland material tiles");
assert.ok(cliffCell.name.indexOf("terrain.rock_cliff.") === 0 || cliffCell.name.indexOf("terrain.rock.") === 0, "rough mountain samples should select rock material tiles");
assert.ok(riverCell.name.indexOf("terrain.river_shallow.") === 0, "river samples should select the registered shallow river material");
assert.ok(tidalMudCell.name.indexOf("terrain.tidal_mud.") === 0, "shore samples should select the registered tidal mud material");
assert.ok(lavaFlowCell.name.indexOf("terrain.lava_flow.") === 0, "lava samples should select the registered lava flow material");
assert.ok(lichenTundraCell.name.indexOf("terrain.lichen_tundra.") === 0, "lichen/cold samples should select the registered lichen tundra material");
assert.ok(reedMatCell.name.indexOf("terrain.reed_mat.") === 0, "reed mat samples should select the registered reed mat material");
assert.notDeepStrictEqual(pixelAt(riverCell, 7, 7), pixelAt(deepWaterCell, 7, 7), "river material should render distinct pixels from open water");
assert.notDeepStrictEqual(pixelAt(tidalMudCell, 7, 7), pixelAt(plainGrassCell, 7, 7), "tidal mud should render distinct pixels from plain grass");
assert.notDeepStrictEqual(pixelAt(lavaFlowCell, 7, 7), pixelAt(volcanicCell, 7, 7), "lava flow should render distinct pixels from generic volcanic ground");
assert.notDeepStrictEqual(pixelAt(lichenTundraCell, 7, 7), pixelAt(forestCell, 7, 7), "lichen tundra should render distinct pixels from forest material");
assert.notDeepStrictEqual(pixelAt(reedMatCell, 7, 7), pixelAt(marshCell, 7, 7), "reed mats should render distinct pixels from generic marsh");
assert.ok([riverCell, lavaFlowCell, lichenTundraCell].every((cell) => uniqueColorCount(cell) >= 5), "new material cells should preserve authored terrain detail");
assert.ok(plainGrassCell.name.indexOf(".plain") > 0, "plain terrain cells should keep an explicit plain transition key");
assert.ok(noFeatureCell.name.indexOf(".feature0.") > 0, "no-signal fallback terrain should keep an explicit no-feature key");
assert.ok(forestCell.name.indexOf(".feature.canopy.") > 0, "forest terrain should encode bounded canopy feature marks");
assert.ok(deepWaterCell.name.indexOf(".feature.foam.") > 0, "deep water should encode bounded foam feature marks");
assert.ok(cliffCell.name.indexOf(".feature.ridge.") > 0, "rough mountain terrain should encode bounded ridge feature marks");
assert.ok(desertCell.name.indexOf(".feature.scrub.") > 0, "desert terrain should encode bounded dry scrub feature marks");
assert.ok(coastEdgeGrassCell.name.indexOf(".coast.") > 0, "biome blend samples should encode bounded coast transition cells");
assert.notStrictEqual(coastEdgeGrassCell.name, plainGrassCell.name, "transition edges should not overwrite plain material atlas cells");
assert.notDeepStrictEqual(pixelAt(coastEdgeGrassCell, 15, 2), pixelAt(plainGrassCell, 15, 2), "east coast edge should add readable transition pixels");
assert.ok(uniqueColorCount(coastEdgeGrassCell) >= uniqueColorCount(plainGrassCell), "transition edge cells should preserve material detail density");
assert.ok(plainGrassCell.name.indexOf(".bio0.civ0") > 0, "plain terrain cells should keep explicit no-biology and no-civilization keys");
assert.notDeepStrictEqual(pixelAt(forestCell, 4, 4), pixelAt(noFeatureCell, 4, 4), "feature marks should change stable atlas pixels");
assert.ok(microbialMatCell.name.indexOf(".microbial.3") > 0, "microbial mat samples should encode a bounded biological material key");
assert.notStrictEqual(microbialMatCell.name, ordinaryWetlandCell.name, "microbial mat cells should not overwrite ordinary wetland material cells");
assert.notDeepStrictEqual(pixelAt(microbialMatCell, 7, 7), pixelAt(ordinaryWetlandCell, 7, 7), "microbial mat pressure should change visible terrain pixels");
assert.ok(uniqueColorCount(microbialMatCell) >= uniqueColorCount(ordinaryWetlandCell), "microbial mat cells should preserve dense authored surface detail");
assert.ok(mineralVeinCell.name.indexOf(".mineral.3") > 0, "mineral resource samples should encode a bounded resource material key");
assert.notStrictEqual(mineralVeinCell.name, ordinaryRockCell.name, "mineral resource cells should not overwrite ordinary rock material cells");
assert.notDeepStrictEqual(pixelAt(mineralVeinCell, 7, 7), pixelAt(ordinaryRockCell, 7, 7), "mineral pressure should change visible terrain pixels");
assert.ok(uniqueColorCount(mineralVeinCell) >= uniqueColorCount(ordinaryRockCell), "mineral resource cells should preserve authored detail density");
assert.ok(activeEcologyCell.name.indexOf(".organic.") > 0, "active organism ecology should encode bounded organic terrain pressure");
assert.ok(activeEcologyCell.name.indexOf(".nutrient.") > 0, "active food ecology should encode bounded nutrient terrain pressure");
assert.ok(activeEcologyCell.name.indexOf(".ecoform.") > 0, "active ecology should encode a bounded sub-tile microstructure phase");
assert.notStrictEqual(activeEcologyCell.name, ordinaryEcologyCell.name, "active ecology should not overwrite ordinary terrain cells");
assert.notDeepStrictEqual(pixelAt(activeEcologyCell, 7, 7), pixelAt(ordinaryEcologyCell, 7, 7), "active ecology should change visible terrain pixels");
assert.ok(uniqueColorCount(activeEcologyCell) >= uniqueColorCount(ordinaryEcologyCell) + 2, "active ecology cells should add sub-tile ecological microstructure");
assert.ok(settlementFootprintCell.name.indexOf(".civ.settlement.3") > 0, "settlement terrain pressure should encode a bounded civilization footprint key");
assert.ok(routeFootprintCell.name.indexOf(".civ.route.2") > 0, "route terrain pressure should encode a bounded civilization route key");
assert.ok(borderFootprintCell.name.indexOf(".civ.border.2") > 0, "border terrain pressure should encode a bounded civilization border key");
assert.notStrictEqual(settlementFootprintCell.name, ordinaryEcologyCell.name, "civilization footprint cells should not overwrite ordinary terrain cells");
assert.notDeepStrictEqual(pixelAt(settlementFootprintCell, 7, 7), pixelAt(ordinaryEcologyCell, 7, 7), "settlement terrain pressure should change visible terrain pixels");
assert.notDeepStrictEqual(pixelAt(routeFootprintCell, 7, 7), pixelAt(ordinaryEcologyCell, 7, 7), "route terrain pressure should change visible terrain pixels");
assert.ok(uniqueColorCount(settlementFootprintCell) >= uniqueColorCount(ordinaryEcologyCell), "civilization terrain cells should preserve authored detail density");
assert.ok(highSurfaceVariants.size > 1, "terrain variants should keep Y variation for high surface sample coordinates");
assert.ok(sparseFoodCell.name.indexOf("entity.food.0.0") === 0, "food cells should encode bounded richness buckets");
assert.ok(richFoodCell.name.indexOf("entity.food.0.3") === 0, "rich food cells should use the highest bounded resource bucket");
assert.notStrictEqual(sparseFoodCell.name, richFoodCell.name, "resource richness should not overwrite sparse food atlas cells");
assert.ok(uniqueColorCount(richFoodCell) >= uniqueColorCount(sparseFoodCell), "rich food cells should carry denser resource detail");
assert.notDeepStrictEqual(pixelAt(sparseFoodCell, 7, 7), pixelAt(richFoodCell, 7, 7), "resource richness should change visible atlas pixels");
assert.ok(grainFoodCell.name.indexOf("entity.food.0.3.1") === 0, "grain resources should use the storage/sack family bucket");
assert.ok(fruitFoodCell.name.indexOf("entity.food.0.3.2") === 0, "fruit resources should use the produce/fungus family bucket");
assert.ok(oreFoodCell.name.indexOf("entity.food.0.3.3") === 0, "ore resources should use the raw-material family bucket");
assert.notStrictEqual(grainFoodCell.name, fruitFoodCell.name, "resource family should be part of food atlas identity");
assert.notStrictEqual(fruitFoodCell.name, oreFoodCell.name, "raw materials should not overwrite produce atlas cells");
assert.notDeepStrictEqual(pixelAt(grainFoodCell, 7, 7), pixelAt(fruitFoodCell, 7, 7), "grain and produce resources should render distinct pixels");
assert.notDeepStrictEqual(pixelAt(fruitFoodCell, 7, 7), pixelAt(oreFoodCell, 7, 7), "produce and ore resources should render distinct pixels");
assert.ok(campCell.name.indexOf("entity.settlement.camp.0.1") === 0, "root camps should use bounded settlement atlas keys");
assert.ok(colonyCell.name.indexOf("entity.settlement.colony.2.2") === 0, "colonies should encode archetype, level bucket, and lineage bucket");
assert.ok(outpostCell.name.indexOf("entity.settlement.outpost.0.3") === 0, "outposts should encode their own bounded archetype");
assert.notDeepStrictEqual(pixelAt(campCell, 9, 3), pixelAt(colonyCell, 9, 3), "settlement archetype and level should change visible pixels");
assert.ok(uniqueColorCount(colonyCell) >= uniqueColorCount(campCell), "higher settlement levels should preserve authored detail density");
assert.ok(inactiveRouteCell.name.indexOf("entity.route.horizontal.0.1") === 0, "inactive routes should encode a bounded activity bucket");
assert.ok(activeRouteCell.name.indexOf("entity.route.horizontal.1.1") === 0, "active routes should encode the active traffic bucket");
assert.ok(busyRouteCell.name.indexOf("entity.route.diag.2.2") === 0, "busy routes should encode shape, traffic bucket, and lineage bucket");
assert.notDeepStrictEqual(pixelAt(inactiveRouteCell, 8, 7), pixelAt(activeRouteCell, 8, 7), "route activity should change visible route pixels");
assert.notDeepStrictEqual(pixelAt(activeRouteCell, 8, 7), pixelAt(busyRouteCell, 8, 7), "route shape/lineage should change visible route pixels");
assert.ok(weakInfluenceCell.name.indexOf("entity.influence.0.1") === 0, "weak claimed land should encode bounded influence strength");
assert.ok(strongInfluenceCell.name.indexOf("entity.influence.2.2") === 0, "strong claimed land should encode bounded influence strength and lineage");
assert.notDeepStrictEqual(pixelAt(weakInfluenceCell, 8, 7), pixelAt(strongInfluenceCell, 8, 7), "influence strength should change visible border pixels");
assert.ok(selectedFoodIntentCell.name.indexOf("entity.intent.1.1.2.1") === 0, "selected feeding representatives should encode behavior, target, watch state, and lineage");
assert.ok(pinnedBreedingIntentCell.name.indexOf("entity.intent.2.0.1.2") === 0, "pinned breeding representatives should encode bounded intent keys");
assert.notDeepStrictEqual(pixelAt(selectedFoodIntentCell, 8, 8), pixelAt(pinnedBreedingIntentCell, 8, 8), "representative intent state should change visible marker pixels");
assert.ok(uniqueColorCount(selectedFoodIntentCell) >= 5, "intent cells should include readable authored marker detail");
assert.ok(earlyReadinessCell.name.indexOf("entity.settlement_readiness.1.1") === 0, "settlement readiness should encode lineage and progress buckets");
assert.ok(readyReadinessCell.name.indexOf("entity.settlement_readiness.2.3") === 0, "ready settlement pressure should use the highest bounded progress bucket");
assert.notDeepStrictEqual(pixelAt(earlyReadinessCell, 7, 2), pixelAt(readyReadinessCell, 7, 2), "settlement readiness progress should change visible marker pixels");
assert.ok(uniqueColorCount(readyReadinessCell) >= uniqueColorCount(earlyReadinessCell), "ready settlement pressure should preserve authored marker detail");
assert.ok(biologyEventCell.name.indexOf("entity.event.0.0") === 0, "biology orbit events should encode bounded category and severity buckets");
assert.ok(criticalGeologyEventCell.name.indexOf("entity.event.1.2") === 0, "critical geology orbit events should use the critical severity bucket");
assert.notDeepStrictEqual(pixelAt(biologyEventCell, 8, 8), pixelAt(criticalGeologyEventCell, 8, 8), "event category and severity should change visible marker pixels");
assert.ok(uniqueColorCount(criticalGeologyEventCell) >= 5, "orbit event cells should include readable authored marker detail");
assert.ok(stats.traitCells >= 2, "atlas stats should count generated trait sprites");
assert.ok(stats.terrainCells >= 4, "atlas stats should count generated biome terrain cells");
assert.ok(stats.foodCells >= 2, "atlas stats should count generated food resource cells");
assert.ok(stats.settlementCells >= 5, "atlas stats should count generated settlement and readiness cells");
assert.ok(stats.routeCells >= 3, "atlas stats should count generated route traffic cells");
assert.ok(stats.influenceCells >= 2, "atlas stats should count generated influence border cells");
assert.ok(stats.eventMarkerCells >= 2, "atlas stats should count generated orbit event marker cells");
assert.ok(stats.intentCells >= 2, "atlas stats should count generated representative intent cells");
assert.ok(stats.pageBytes > 0, "atlas stats should expose packed atlas bytes");

const loadedSheetImage = { width: 256, height: 32, naturalWidth: 256, naturalHeight: 32 };
const loadedGrassSheet = {
  id: "terrain_grass",
  image: loadedSheetImage,
  getCells() {
    return [
      { name: "terrain.grass.0", x: 0, y: 0, w: 32, h: 32, image: loadedSheetImage },
      { name: "terrain.grass.1", x: 32, y: 0, w: 32, h: 32, image: loadedSheetImage }
    ];
  }
};

context.PS.atlas.buildFromSheets([loadedGrassSheet]);
const loadedGrassCell = context.PS.atlas.getCell("terrain.grass.1");

assert.ok(loadedGrassCell, "buildFromSheets should make loaded sheet cells addressable by id");
assert.strictEqual(context.PS.atlas.pages.length, 1, "buildFromSheets should create an external image atlas page");
assert.strictEqual(context.PS.atlas.pages[0].externalImage, true, "loaded sheet page should be marked as an external image");
assert.strictEqual(loadedGrassCell.pageIndex, 0, "loaded sheet cell should reference its image page");
assert.deepStrictEqual(
  {
    x: loadedGrassCell.x,
    y: loadedGrassCell.y,
    w: loadedGrassCell.w,
    h: loadedGrassCell.h,
    u0: loadedGrassCell.u0,
    v0: loadedGrassCell.v0,
    u1: loadedGrassCell.u1,
    v1: loadedGrassCell.v1
  },
  {
    x: 32,
    y: 0,
    w: 32,
    h: 32,
    u0: 32 / 256,
    v0: 0,
    u1: 64 / 256,
    v1: 1
  },
  "buildFromSheets should derive correct atlas coordinates and UVs"
);

context.PS.atlas.buildHybrid({
  cells: [
    { name: "terrain.grass.0", width: 16, height: 16 },
    { name: "entity.fallback.0", width: 16, height: 16 }
  ]
}, [loadedGrassSheet]);

const hybridLoadedGrass = context.PS.atlas.getCell("terrain.grass.0");
const hybridFallback = context.PS.atlas.getCell("entity.fallback.0");

assert.ok(hybridLoadedGrass.externalImage, "buildHybrid should let loaded sheet cells override generated cells");
assert.ok(hybridFallback && !hybridFallback.externalImage, "buildHybrid should preserve generated fallback cells");

const uploadCalls = [];
const fakeTexture = { id: "texture" };
const fakeGl = {
  TEXTURE_2D: "TEXTURE_2D",
  TEXTURE_MIN_FILTER: "TEXTURE_MIN_FILTER",
  TEXTURE_MAG_FILTER: "TEXTURE_MAG_FILTER",
  TEXTURE_WRAP_S: "TEXTURE_WRAP_S",
  TEXTURE_WRAP_T: "TEXTURE_WRAP_T",
  NEAREST: "NEAREST",
  CLAMP_TO_EDGE: "CLAMP_TO_EDGE",
  RGBA: "RGBA",
  UNSIGNED_BYTE: "UNSIGNED_BYTE",
  createTexture() {
    uploadCalls.push(["createTexture"]);
    return fakeTexture;
  },
  bindTexture(target, texture) {
    uploadCalls.push(["bindTexture", target, texture]);
  },
  texParameteri(target, pname, param) {
    uploadCalls.push(["texParameteri", target, pname, param]);
  },
  texImage2D() {
    uploadCalls.push(["texImage2D"].concat(Array.from(arguments)));
  }
};

const uploadedTextures = context.PS.atlas.uploadToGL(fakeGl);
const imageUpload = uploadCalls.find((call) => call[0] === "texImage2D" && call[6] === loadedSheetImage);

assert.strictEqual(uploadedTextures.length, context.PS.atlas.pages.length, "uploadToGL should return one texture per atlas page");
assert.ok(uploadedTextures.every((texture) => texture.id === "texture"), "uploadToGL should return created textures");
assert.ok(imageUpload, "uploadToGL should upload external image pages through texImage2D(image)");

console.log("entity atlas checks passed");
