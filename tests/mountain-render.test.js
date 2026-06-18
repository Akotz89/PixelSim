const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const equivalenceSource = read("js/assets/equivalence.js");
const shadowSource = read("js/render/shadow-stamping.js");
const mountainSource = read("js/render/mountain-render.js");
const batcherSource = read("js/render/surface-tile-batcher.js");

assert.ok(namespaceSource.indexOf("js/render/shadow-stamping.js") < namespaceSource.indexOf("js/render/mountain-render.js"), "mountain renderer should load after shadow stamping");
assert.ok(namespaceSource.indexOf("js/render/mountain-render.js") < namespaceSource.indexOf("js/render/surface-tile-batcher.js"), "mountain renderer should load before surface tile batching");
assert.ok(mountainSource.indexOf("getFormationInfo") >= 0, "mountain renderer should expose multi-tile formation metadata");
assert.ok(mountainSource.indexOf("terrainMaterials.selectCell") >= 0, "mountain renderer should use authored terrain material cells");
assert.ok(mountainSource.indexOf("appendStampedRects") >= 0, "mountain renderer should cast stamped long shadows");

function makeSheet(material) {
  return {
    getCell(name) {
      const match = /(\d+)$/.exec(name);
      const index = match ? Number(match[1]) : 0;
      return {
        name,
        x: index * 32,
        y: 0,
        w: 32,
        h: 32,
        splitAtlas: true
      };
    }
  };
}

const context = {
  PS: {
    render: {},
    assets: {
      loadedSheets: {
        terrain_mountain: {
          id: "terrain_mountain",
          splitAtlas: true,
          image: { width: 512, height: 32 },
          sheet: makeSheet("mountain")
        },
        terrain_rock: {
          id: "terrain_rock",
          splitAtlas: true,
          image: { width: 512, height: 32 },
          sheet: makeSheet("rock")
        },
        terrain_snow: {
          id: "terrain_snow",
          splitAtlas: true,
          image: { width: 512, height: 32 },
          sheet: makeSheet("snow")
        }
      }
    },
    atlas: {
      pages: [],
      getTerrainCell() {
        return {
          name: "fallback.rock",
          pageIndex: 0,
          u0: 0,
          v0: 0,
          u1: 0.1,
          v1: 0.1
        };
      }
    },
    ranmap: {
      variant(x, y, max) {
        return Math.abs(Math.round(x) * 5 + Math.round(y) * 7) % max;
      }
    }
  },
  world: {
    tick: 10,
    sunDirection: { x: -1, y: 2, z: 4 }
  },
  CONFIG: { TILE_SIZE: 16 },
  Math,
  Number,
  String,
  Object,
  Array,
  Float32Array,
  Uint8Array,
  Buffer,
  atob: undefined,
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }
};

vm.createContext(context);
vm.runInContext(equivalenceSource, context, { filename: "js/assets/equivalence.js" });
vm.runInContext(shadowSource, context, { filename: "js/render/shadow-stamping.js" });
vm.runInContext(mountainSource, context, { filename: "js/render/mountain-render.js" });
vm.runInContext(batcherSource, context, { filename: "js/render/surface-tile-batcher.js" });

const centerInfo = context.PS.render.mountains.getFormationInfo(4, 4, {
  biome: "highland",
  detail: { surface: "rock ridge", materialSignals: { elevation: 0.9, snow: 0.6 } }
}, "highland");
const northInfo = context.PS.render.mountains.getFormationInfo(3, 3, {
  biome: "highland",
  detail: { surface: "rock ridge", materialSignals: { elevation: 0.9 } }
}, "highland");

assert.strictEqual(centerInfo.anchorX, 3, "formation center should belong to a 3x3 mountain anchor");
assert.strictEqual(centerInfo.anchorY, 3, "formation center should belong to a 3x3 mountain anchor");
assert.strictEqual(centerInfo.isPeak, true, "3x3 formation center should be the peak");
assert.strictEqual(northInfo.cliffShade, "north-dark", "north face should carry darker directional cliff shading");
assert.ok(centerInfo.heightUnits > northInfo.heightUnits, "peak should be taller than edge mountain tiles");
assert.ok(context.PS.render.mountains.isMountainSample({ biome: "highland", detail: { surface: "stone" } }, "highland"), "highland samples should qualify as mountains");
assert.strictEqual(context.PS.render.mountains.isMountainSample({ biome: "grassland", detail: { surface: "grass" } }, "grassland"), false, "non-mountain samples should not append overlays");

const mountainCellCache = Array.from({ length: 9 }, (_, index) => ({
  sample: {
    biome: "highland",
    detail: {
      surface: "rock ridge",
      materialSignals: {
        elevation: index === 4 ? 0.95 : 0.72,
        snow: index === 4 ? 0.78 : 0.35
      }
    }
  },
  screenX: (index % 3) * 16,
  screenY: Math.floor(index / 3) * 16
}));
const batches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 3,
  sampleNorth: 3,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 3
}, mountainCellCache, 1);

assert.strictEqual(batches.mountainTiles, 9, "highland 3x3 samples should form one multi-tile mountain formation");
assert.ok(batches.mountainOverlays > batches.mountainTiles, "mountain renderer should layer cliff, peak, and snow overlays");
assert.ok(batches.mountainShadowRects > 9, "mountains should cast long multi-stamp shadows");
assert.ok(batches.shadowRects.length / 8 > 9, "physical mountain shadow rect count should exceed logical tiles");
assert.ok(batches.shadowRects.length / 8 > 8, "mountains should cast proportionally longer shadows than height-8 trees");
assert.ok(Object.keys(batches.materialCounts).some((name) => name.indexOf("terrain.mountain.") === 0), "mountain cliff/peak cells should use authored mountain terrain assets");
assert.ok(Object.keys(batches.materialCounts).some((name) => name.indexOf("terrain.snow.") === 0), "snow caps should use authored snow terrain assets");
assert.ok(Object.keys(batches.pages).length >= 1, "mountain overlays should append to WebGPU surface pages");
assert.ok(mountainCellCache.every((cellData) => cellData.terrainAtlasCell && cellData.terrainAtlasCell.name === "fallback.rock"), "mountain overlays should not overwrite base terrain atlas cache cells");
assert.ok(mountainCellCache.every((cellData) => typeof cellData.terrainAtlasKeyId === "number"), "mountain overlays should not replace base terrain cache keys");

const worldBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 3,
  sampleNorth: 3,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 3
}, mountainCellCache.map((cellData) => ({
  sample: cellData.sample,
  screenX: cellData.screenX,
  screenY: cellData.screenY
})), 1, {
  visualPolicy: {
    level: "WORLD",
    mountainOverlays: "disabled",
    autotileTransitions: "disabled",
    transitionAlphaScale: 0,
    pointLightScale: 0,
    waterUvScrollScale: 0,
    normalLightingStrength: 0
  }
});
assert.strictEqual(worldBatches.count, 9, "world LOD should keep base terrain tiles");
assert.strictEqual(worldBatches.mountainTiles, undefined, "world LOD should skip multi-tile mountain overlays");
assert.strictEqual(worldBatches.shadowRects.length, 0, "world LOD should skip stamped mountain shadows");

const plainBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 0,
  sampleNorth: 0,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [{
  sample: { biome: "grassland", detail: { surface: "grass", materialSignals: { elevation: 0.1 } } },
  screenX: 0,
  screenY: 0
}], 1);
assert.strictEqual(plainBatches.mountainTiles, undefined, "non-mountain samples should not append mountain overlay counters");

console.log("mountain render checks passed");
