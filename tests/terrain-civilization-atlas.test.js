const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  PS: {
    assets: {},
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
vm.runInContext(read("js/assets/registry.js"), context, { filename: "js/assets/registry.js" });
context.PS.assets.jsonData = {};
context.PS.assets.registerJSON = function(url, data) {
  this.jsonData[url] = data;
  return data;
};
vm.runInContext(read("data/ground-gradients.json.js"), context, { filename: "data/ground-gradients.json.js" });
vm.runInContext(read("data/era-palettes.json.js"), context, { filename: "data/era-palettes.json.js" });
vm.runInContext(read("js/core/tile-registry.js"), context, { filename: "js/core/tile-registry.js" });
vm.runInContext(read("js/render/terrain.js"), context, { filename: "js/render/terrain.js" });
vm.runInContext(read("js/render/surface-color.js"), context, { filename: "js/render/surface-color.js" });
vm.runInContext(read("js/render/entity-atlas.js"), context, { filename: "js/render/entity-atlas.js" });
vm.runInContext(read("js/render/entity-atlas-intents.js"), context, { filename: "js/render/entity-atlas-intents.js" });
vm.runInContext(read("js/render/entity-atlas-civilization.js"), context, { filename: "js/render/entity-atlas-civilization.js" });
vm.runInContext(read("js/render/terrain-atlas-civilization.js"), context, { filename: "js/render/terrain-atlas-civilization.js" });
vm.runInContext(read("js/render/terrain-atlas-detail.js"), context, { filename: "js/render/terrain-atlas-detail.js" });

context.PS.core.TileRegistry.loadFromJSON(JSON.parse(read("data/tiles.json")));
context.PS.render.surfaceColor.loadGroundGradientConfig(context.PS.assets.jsonData["data/ground-gradients.json"]);
context.PS.render.surfaceColor.loadEraPaletteConfig(context.PS.assets.jsonData["data/era-palettes.json"]);
context.PS.atlas.init();

function terrainCell(civilization, tileX) {
  return context.PS.atlas.getTerrainCell("grassland", tileX, 18, {
    detail: {
      surface: "grass",
      elevation: 0.42,
      roughness: 0.2,
      materialSignals: { moisture: 0.5 }
    },
    tile: { biome: "grassland", moisture: 1.1 },
    civilization
  });
}

function pixelAt(cell, x, y) {
  const page = context.PS.atlas.pages[cell.pageIndex];
  const index = ((cell.y + y) * page.width + cell.x + x) * 4;
  return Array.from(page.data.slice(index, index + 4));
}

function changedPixels(from, to) {
  let changed = 0;

  for (let y = 0; y < from.h; y++) {
    for (let x = 0; x < from.w; x++) {
      if (pixelAt(from, x, y).join(",") !== pixelAt(to, x, y).join(",")) {
        changed++;
      }
    }
  }

  return changed;
}

function hasPixel(cell, color) {
  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      if (pixelAt(cell, x, y).join(",") === color.join(",")) {
        return true;
      }
    }
  }
  return false;
}

function hasPixelRgb(cell, color) {
  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      const pixel = pixelAt(cell, x, y);
      if (pixel[0] === color[0] && pixel[1] === color[1] && pixel[2] === color[2]) {
        return true;
      }
    }
  }
  return false;
}

function averageRgb(cell) {
  const total = [0, 0, 0];
  const count = Math.max(1, cell.w * cell.h);

  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      const pixel = pixelAt(cell, x, y);
      total[0] += pixel[0];
      total[1] += pixel[1];
      total[2] += pixel[2];
    }
  }

  return total.map((value) => value / count);
}

function colorDistance(first, second) {
  return Math.sqrt(
    Math.pow(first[0] - second[0], 2) +
    Math.pow(first[1] - second[1], 2) +
    Math.pow(first[2] - second[2], 2)
  );
}

function alphaStats(cell) {
  let min = 255;
  let max = 0;
  let counts = {};
  let unique = new Set();

  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      const alpha = pixelAt(cell, x, y)[3];
      min = Math.min(min, alpha);
      max = Math.max(max, alpha);
      counts[alpha] = (counts[alpha] || 0) + 1;
      unique.add(alpha);
    }
  }

  return { min, max, range: max - min, unique: unique.size, counts };
}

const plain = terrainCell(null, 20);
const farm = terrainCell({ type: "settlement", family: "farm", pressure: 0.9, settlementPressure: 0.9 }, 21);
const yard = terrainCell({ type: "settlement", family: "yard", pressure: 0.55, settlementPressure: 0.55 }, 22);
const block = terrainCell({ type: "settlement", family: "block", pressure: 0.85, settlementPressure: 0.85 }, 23);
const production = terrainCell({ type: "settlement", family: "production", pressure: 0.95, settlementPressure: 0.95 }, 24);
const road = terrainCell({ type: "route", family: "road", pressure: 0.7, routePressure: 0.7 }, 25);
const canal = terrainCell({ type: "route", family: "canal", pressure: 0.7, routePressure: 0.7 }, 26);
const dock = terrainCell({ type: "route", family: "dock", pressure: 0.7, routePressure: 0.7 }, 27);
const embeddedRoute = context.PS.atlas.getTerrainCell("grassland", 29, 18, {
  detail: {
    surface: "grass",
    elevation: 0.42,
    roughness: 0.2,
    materialSignals: { moisture: 0.5, settlementDensity: 0.62, routeTraffic: 0.86 }
  },
  tile: { biome: "grassland", moisture: 1.1 },
  civilization: { type: "route", family: "road", pressure: 0.86, routePressure: 0.86, settlementPressure: 0.62 }
});
const fillOnlyParcel = context.PS.atlas.getTerrainCell("grassland", 28, 18, {
  detail: {
    surface: "grass",
    elevation: 0.42,
    roughness: 0.2,
    materialSignals: { moisture: 0.5 }
  },
  tile: { biome: "grassland", moisture: 1.1 },
  renderSettlementParcelFillOnly: true,
  civilization: { type: "settlement", family: "yard", pressure: 0.74, settlementPressure: 0.74 }
});
const mixedDistrictRouteInfo = context.PS.atlas.getTerrainCivilizationInfo({
  civilization: { type: "route", family: "road", pressure: 0.5, routePressure: 0.5, settlementPressure: 0.62 },
  detail: { materialSignals: { settlementDensity: 0.62, routeTraffic: 0.5 } }
});
const routeCoreInfo = context.PS.atlas.getTerrainCivilizationInfo({
  civilization: { type: "route", family: "road", pressure: 0.96, routePressure: 0.96, settlementPressure: 0.62 },
  detail: { materialSignals: { settlementDensity: 0.62, routeTraffic: 0.96 } }
});
const housingDescriptor = context.PS.atlas.getBuildingSpriteDescriptor({
  category: "residential",
  lineageId: 2,
  neighbors: { north: true, east: true, south: false, west: true }
});
const productionDescriptor = context.PS.atlas.getBuildingSpriteDescriptor({
  category: "industrial",
  factionId: 3,
  neighbors: { north: false, east: true, south: true, west: false }
});
const farmParcelKeyA = context.PS.atlas.getTerrainCivilizationKey({
  x: 21,
  y: 18,
  civilization: { type: "settlement", family: "farm", pressure: 0.9, settlementPressure: 0.9, lineageId: 1 }
});
const farmParcelKeyB = context.PS.atlas.getTerrainCivilizationKey({
  x: 29,
  y: 18,
  civilization: { type: "settlement", family: "farm", pressure: 0.9, settlementPressure: 0.9, lineageId: 1 }
});

assert.ok(farm.name.indexOf(".civ.settlement.3.farm") > 0, "farm footprint should use a bounded civilization family key");
assert.ok(yard.name.indexOf(".civ.settlement.2.yard") > 0, "yard footprint should use a bounded civilization family key");
assert.ok(block.name.indexOf(".civ.settlement.3.block") > 0, "block footprint should use a bounded civilization family key");
assert.ok(production.name.indexOf(".civ.settlement.3.production") > 0, "production footprint should use a bounded civilization family key");
assert.ok(road.name.indexOf(".civ.route.2.road") > 0, "road footprint should use a bounded route family key");
assert.ok(canal.name.indexOf(".civ.route.2.canal") > 0, "canal footprint should use a bounded route family key");
assert.ok(dock.name.indexOf(".civ.route.2.dock") > 0, "dock footprint should use a bounded route family key");
assert.strictEqual(mixedDistrictRouteInfo.type, "settlement", "route samples embedded in strong district pressure should render as district parcels unless route pressure clearly dominates");
assert.strictEqual(routeCoreInfo.type, "route", "high-pressure route cores should remain visible through settlement districts");
assert.ok(changedPixels(farm, plain) >= 18, "farm terrain cell should add field-strip footprint pixels");
assert.ok(changedPixels(production, plain) >= 18, "production terrain cell should add rectilinear built pixels");
assert.ok(changedPixels(road, plain) >= 12, "road terrain cell should add route footprint pixels");
assert.ok(colorDistance(averageRgb(farm), averageRgb(block)) >= 12, "farm and block district terrain should separate by material palette");
assert.ok(colorDistance(averageRgb(yard), averageRgb(production)) >= 10, "yard and production district terrain should separate by material palette");
assert.ok(averageRgb(farm)[1] > averageRgb(production)[1], "farm district terrain should retain more green/organic signal than production");
assert.ok(averageRgb(farm)[1] <= averageRgb(farm)[0] + 8, "farm district terrain should not repaint the whole cell as green field grass");
assert.ok(averageRgb(block)[2] >= averageRgb(yard)[2] - 2, "block district terrain should read cooler/stone-packed than yard ground");
assert.ok((alphaStats(farm).counts[255] || 0) <= (alphaStats(plain).counts[255] || 0), "farm district relief should not add max-alpha flattening beyond base terrain");
assert.strictEqual(alphaStats(farm).unique, 1, "farm district relief should use flat merged ground height, not repeated field-height hatching");
assert.strictEqual(alphaStats(block).unique, 1, "block district relief should use flat merged ground height, not repeated normal stripes");
assert.strictEqual(alphaStats(production).unique, 1, "production district relief should use flat merged ground height, not industrial normal hatching");
assert.notStrictEqual(alphaStats(farm).min, alphaStats(block).min, "settlement families should still carry distinct material height bands");
assert.strictEqual(alphaStats(fillOnlyParcel).unique, 1, "merged settlement parcel fills should not introduce stretched hatch/normal pixels");
assert.ok(alphaStats(road).counts[122] > 0, "plain road route relief should expose a road-bed mark");
assert.ok(alphaStats(embeddedRoute).max <= 150, "road routes embedded in settlement districts should not expose raw terrain-height alpha as cyan hatch noise");
assert.notStrictEqual(farm.name, block.name, "settlement families should not overwrite each other in the atlas cache");
assert.ok(farmParcelKeyA.indexOf(".parcel.") > 0, "settlement civilization terrain key should encode deterministic parcel variation");
assert.notStrictEqual(farmParcelKeyA, farmParcelKeyB, "same settlement family should not reuse one parcel atlas key across the whole district");
assert.notDeepStrictEqual(pixelAt(road, 7, 7), pixelAt(canal, 7, 7), "road and canal route families should render distinct pixels");
assert.ok(changedPixels(dock, road) >= 6, "dock and road route families should render distinct cells");
assert.ok(farm.name.indexOf(".stencil.building.3.farm.") > 0, "building terrain cells should encode foundation stencil and ground color bucket");
assert.ok(
  !hasPixelRgb(block, context.PS.atlas.hexToRgb(context.PS.render.surfaceColor.getGroundMoistureColor({
    biome: "grassland",
    x: 23,
    y: 18,
    detail: { surface: "grass", materialSignals: { moisture: 0.5 } },
    tile: { biome: "grassland", moisture: 1.1 }
  }))),
  "settlement district terrain should not leak raw per-tile moisture/transition color through building edges"
);
assert.strictEqual(housingDescriptor.category, "residential", "building sprites should preserve category organization");
assert.strictEqual(housingDescriptor.autotileMask, 11, "building descriptor should derive autotile mask from connected neighbors");
assert.strictEqual(housingDescriptor.sheetPair.source, "housing-room", "building descriptor should expose build-time source sheet");
assert.strictEqual(housingDescriptor.sheetPair.dest, "building.residential", "building descriptor should expose build-time destination sheet");
assert.notStrictEqual(housingDescriptor.color, productionDescriptor.color, "building descriptors should vary color by faction/culture seed");
assert.notStrictEqual(housingDescriptor.destinationSheet, productionDescriptor.destinationSheet, "building categories should not collide in atlas output");

console.log("terrain civilization atlas checks passed");
