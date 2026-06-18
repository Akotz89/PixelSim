require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const registrySource = fs.readFileSync(path.join(root, "js/core/tile-registry.js"), "utf8");
const minimapSource = fs.readFileSync(path.join(root, "js/render/minimap.js"), "utf8");
const tilesData = JSON.parse(fs.readFileSync(path.join(root, "data/tiles.json"), "utf8"));

const context = {
  PS: {
    core: {},
    render: {},
    vegetation: {
      getGrassDensity(x, y) {
        return x === 8 && y === 9 ? 15 : 0;
      },
      getType(x, y) {
        return x === 8 && y === 9 ? 3 : 0;
      }
    }
  },
  CONFIG: {
    LINEAGE_COLORS: ["#72d7ff", "#58f06c"]
  },
  world: {
    tick: 0,
    planetTiles: [],
    settlements: [],
    organisms: []
  },
  WORLD_WIDTH: 100,
  WORLD_HEIGHT: 50,
  Number,
  String,
  Object,
  Array,
  Map,
  Uint32Array,
  Float32Array,
  Math,
  Error
};

context.clamp = function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
};

context.getTileIndex = function getTileIndex(x, y) {
  return Math.max(0, Math.min(context.WORLD_HEIGHT - 1, Math.round(y))) * context.WORLD_WIDTH +
    ((Math.round(x) % context.WORLD_WIDTH) + context.WORLD_WIDTH) % context.WORLD_WIDTH;
};

context.getPlanetTile = function getPlanetTile(x, y) {
  return context.world.planetTiles[context.getTileIndex(x, y)] || null;
};

vm.createContext(context);
vm.runInContext(registrySource, context, { filename: "js/core/tile-registry.js" });
context.PS.core.TileRegistry.loadFromJSON(tilesData);
vm.runInContext(minimapSource, context, { filename: "js/render/minimap.js" });

const minimap = context.PS.render.minimap;

function plainChannels(values) {
  return Array.from(values).map((value) => Math.round(value * 1000000) / 1000000);
}

assert.strictEqual(
  minimap.getTileColor({ biome: "forest" }, 4, 5, { tick: 0 }).color,
  context.PS.core.TileRegistry.get("forest_floor").minimapColor,
  "forest minimap color should use authored forest floor color"
);

assert.strictEqual(
  minimap.getTileColor({ biome: "ocean", seaLevelDelta: -0.5 }, 2, 3, { tick: 0 }).color,
  context.PS.core.TileRegistry.get("water_deep").minimapColor,
  "deep water minimap color should use authored deep water color"
);

assert.strictEqual(
  minimap.getTileColor({ biome: "mountain", elevation: 0.94 }, 2, 3, { tick: 0 }).color,
  context.PS.core.TileRegistry.get("rock").minimapColor,
  "mountains should use authored rock grey on the minimap"
);

const calmWater = minimap.getTileColor({ biome: "ocean", seaLevelDelta: -0.5 }, 2, 3, { tick: 0 });
const animatedWater = minimap.getTileColor({ biome: "ocean", seaLevelDelta: -0.5 }, 2, 3, { tick: 20 });
assert.notStrictEqual(calmWater.brightness, animatedWater.brightness, "water should have sine-wave brightness modulation");

const openForest = minimap.getTileColor({ biome: "forest" }, 1, 1, { tick: 0 });
const denseForest = minimap.getTileColor({ biome: "forest" }, 8, 9, { tick: 0 });
assert.ok(denseForest.brightness < openForest.brightness, "dense forest should render darker on the minimap");

const layout = { x: 10, y: 20, width: 200, height: 100, worldWidth: 100, worldHeight: 50 };
const values = [];
let focusedTile = null;
context.PS.camera = {
  focusTile(x, y) {
    focusedTile = { x, y };
  }
};
context.world.settlements = [{ x: 25, y: 10, active: true, lineageId: 1 }, { x: 50, y: 20, active: true, lineageId: 2 }];
minimap.pushSettlementRects(values, layout, 1);
assert.strictEqual(values.length, 16, "settlement overlay should emit one minimap rect per active settlement");
assert.deepStrictEqual(
  plainChannels(values.slice(4, 7)),
  plainChannels(minimap.toRectColor(context.CONFIG.LINEAGE_COLORS[0], 1, 1).slice(0, 3)),
  "settlements should use lineage color on the minimap"
);
assert.notDeepStrictEqual(
  plainChannels(values.slice(4, 7)),
  plainChannels(values.slice(12, 15)),
  "different settlement lineages should have distinct minimap colors"
);
const minimapTile = minimap.getTileFromCanvasPoint(110, 70, layout);
assert.strictEqual(minimapTile.x, 50, "minimap should map canvas x to world tile x");
assert.strictEqual(minimapTile.y, 25, "minimap should map canvas y to world tile y");
assert.strictEqual(minimap.focusFromCanvasPoint(110, 70, layout), true, "minimap click should focus the camera");
assert.deepStrictEqual(focusedTile, { x: 50, y: 25 }, "minimap focus should route through camera focusTile");
minimap.markTileDirty(3, 4);
minimap.markTileDirty(3, 4);
minimap.markTileDirty(8, 9);
assert.strictEqual(minimap.getStats().dirtyTileCount, 2, "minimap dirty tracking should support incremental terrain updates");
minimap.clearDirtyTiles();
assert.strictEqual(minimap.getStats().dirtyTileCount, 0, "minimap dirty tracking should clear after redraw");

console.log("minimap visual checks passed");
