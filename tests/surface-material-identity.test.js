const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

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
  getPlanetTile() {
    return null;
  },
  getPlanetTileCompositedColor(tile) {
    return context.PS.render.terrain.getBiomeColor(tile && tile.biome || "grassland");
  },
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

function rgbFromHex(hexColor) {
  const color = String(hexColor).replace("#", "");

  return {
    red: parseInt(color.slice(0, 2), 16),
    green: parseInt(color.slice(2, 4), 16),
    blue: parseInt(color.slice(4, 6), 16)
  };
}

function rgbFromPacked(packed) {
  return {
    red: (packed >> 16) & 0xFF,
    green: (packed >> 8) & 0xFF,
    blue: packed & 0xFF
  };
}

function colorDistance(a, b) {
  return Math.abs(a.red - b.red) + Math.abs(a.green - b.green) + Math.abs(a.blue - b.blue);
}

vm.createContext(context);
vm.runInContext(read("js/assets/registry.js"), context, { filename: "js/assets/registry.js" });
vm.runInContext(read("js/render/terrain.js"), context, { filename: "js/render/terrain.js" });
vm.runInContext(read("js/render/surface-color.js"), context, { filename: "js/render/surface-color.js" });

const baseDetail = {
  shade: 0.56,
  elevation: 0.5,
  roughness: 0.25,
  hillshade: 0.62,
  heightMeters: 100,
  slope: 0.15,
  materialSignals: {}
};

function sample(biome, surface, overrides) {
  const sampleOverrides = overrides || {};

  return {
    biome,
    latitude: sampleOverrides.latitude || 0,
    surfaceSampleMeters: sampleOverrides.surfaceSampleMeters,
    detail: Object.assign({}, baseDetail, { surface }, sampleOverrides.detail || {}),
    tile: Object.assign({
      biome,
      riverStrength: 0,
      coastFactor: 0,
      shallowWater: 0
    }, sampleOverrides.tile || {}),
    tileBlend: {
      biomeWeights: Object.assign({ [biome]: 0 }, sampleOverrides.biomeWeights || {}),
      tiles: [{
        weight: 1,
        tile: Object.assign({ biome: "desert" }, sampleOverrides.blendTile || {})
      }]
    }
  };
}

const waterHex = rgbFromHex(context.PS.render.surfaceColor.getSurfaceColor(sample("ocean", "open water", {
  detail: { materialSignals: { waterDepth: 0.9 } },
  tile: { shallowWater: 0.25 }
})));
assert.ok(waterHex.blue > waterHex.red + waterHex.green, "hex water should preserve blue material identity");

const waterPacked = rgbFromPacked(context.PS.render.surfaceColor.getSurfaceColorPacked(sample("ocean", "deep water", {
  detail: { materialSignals: { waterDepth: 1 } }
})));
assert.ok(waterPacked.blue > waterPacked.red + waterPacked.green, "packed water should preserve blue material identity");

const whitecap = rgbFromHex(context.PS.render.surfaceColor.getSurfaceColor(sample("ocean", "whitecap")));
assert.ok(whitecap.red >= 170 && whitecap.green >= 200 && whitecap.blue >= 210, "whitecap foam should stay pale");

const lavaHex = rgbFromHex(context.PS.render.surfaceColor.getSurfaceColor(sample("mountain", "magma flow", {
  detail: { materialSignals: { lava: 0.9, heat: 1 } }
})));
assert.ok(lavaHex.red > lavaHex.green * 2, "hex lava should preserve red material identity");
assert.ok(lavaHex.blue < lavaHex.red * 0.25, "hex lava should cap blue channel");

const lavaPacked = rgbFromPacked(context.PS.render.surfaceColor.getSurfaceColorPacked(sample("mountain", "lava flow", {
  detail: { materialSignals: { lava: 0.9, heat: 1 } }
})));
assert.ok(lavaPacked.red > lavaPacked.green * 2, "packed lava should preserve red material identity");
assert.ok(lavaPacked.blue < lavaPacked.red * 0.25, "packed lava should cap blue channel");

const iceHex = rgbFromHex(context.PS.render.surfaceColor.getSurfaceColor(sample("ice", "ridge ice")));
assert.ok(iceHex.red >= 145 && iceHex.green >= 175 && iceHex.blue >= 185, "hex ice should remain pale");

const icePacked = rgbFromPacked(context.PS.render.surfaceColor.getSurfaceColorPacked(sample("ice", "ice")));
assert.ok(icePacked.red >= 145 && icePacked.green >= 175 && icePacked.blue >= 185, "packed ice should remain pale");

const grass = rgbFromHex(context.PS.render.surfaceColor.getSurfaceColor({
  biome: "grassland",
  detail: Object.assign({}, baseDetail, { surface: "grass" }),
  tile: { biome: "grassland" }
}));
const stone = rgbFromHex(context.PS.render.surfaceColor.getSurfaceColor({
  biome: "mountain",
  detail: Object.assign({}, baseDetail, { surface: "stone", slope: 0.45 }),
  tile: { biome: "mountain" }
}));
assert.ok(colorDistance(grass, stone) >= 70, "stone and grass should stay readable at surface zoom");

const blended = context.PS.render.surfaceColor.blendWithTileBlend(sample("grassland", "grass"), "#2e6010");
const blendedRgb = rgbFromHex(blended);
const localRgb = rgbFromHex("#2e6010");
const targetRgb = rgbFromHex("#8a6a30");
const cappedTarget = {
  red: Math.round(localRgb.red + (targetRgb.red - localRgb.red) * 0.25),
  green: Math.round(localRgb.green + (targetRgb.green - localRgb.green) * 0.25),
  blue: Math.round(localRgb.blue + (targetRgb.blue - localRgb.blue) * 0.25)
};
assert.deepStrictEqual(blendedRgb, cappedTarget, "tile blend should cap cross-biome contribution at 25%");

const packedBlend = context.PS.render.surfaceColor.blendWithTileBlendPacked(sample("grassland", "grass"), 0x2e6010);
assert.deepStrictEqual(rgbFromPacked(packedBlend), cappedTarget, "packed tile blend should cap cross-biome contribution at 25%");

console.log("surface material identity checks passed");
