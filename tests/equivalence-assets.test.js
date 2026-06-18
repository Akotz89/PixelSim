const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const equivalenceSource = read("js/assets/equivalence.js");
const batcherSource = read("js/render/surface-tile-batcher.js");
const webgpuSurfaceTileSource = read("js/render/webgpu-surface-tile.js");

assert.ok(
  namespaceSource.indexOf("js/assets/equivalence.js") > namespaceSource.indexOf("js/assets/sprite-sheet.js"),
  "equivalence selector should load after sprite sheet support"
);
assert.ok(
  namespaceSource.indexOf("js/assets/equivalence.js") < namespaceSource.indexOf("js/render/surface-tile-batcher.js"),
  "equivalence selector should load before terrain batch selection"
);
assert.ok(
  batcherSource.indexOf("selectAcceptedTerrainCell") >= 0,
  "terrain batcher should select accepted equivalence terrain cells before submitting atlas cells"
);
assert.ok(
  webgpuSurfaceTileSource.indexOf("equivalenceSelectedUses") >= 0,
  "WebGPU surface tile stats should expose accepted equivalence asset selection counts"
);

function makeLoadedSheet(cellIds) {
  return {
    id: "equivalence_creature_npc_refined_v1",
    image: { width: 512, height: 64, naturalWidth: 512, naturalHeight: 64 },
    pixelData: {
      type: "rgba-base64",
      width: 512,
      height: 64,
      byteLength: 512 * 64 * 4,
      data: Buffer.alloc(512 * 64 * 4, 255).toString("base64")
    },
    sheet: {
      getCell(name) {
        if (cellIds.indexOf(name) < 0) {
          return null;
        }
        return { name, x: 0, y: 0, w: 32, h: 32, image: { width: 32, height: 32 } };
      }
    }
  };
}

function makeLoadedSheetWithoutPixelData(cellIds) {
  var loaded = makeLoadedSheet(cellIds);
  delete loaded.pixelData;
  return loaded;
}

function makeBrokenPixelLoadedSheet(cellIds) {
  var loaded = makeLoadedSheet(cellIds);
  loaded.pixelData = {
    type: "rgba-base64",
    width: 32,
    height: 32,
    byteLength: 4096,
    data: "not-valid"
  };
  return loaded;
}

const context = {
  CONFIG: {
    PLANET_ENTITY_WEBGL_MAX_INSTANCES: 8192,
    LINEAGE_COLORS: ["#72d7ff"]
  },
  PS: {
    assets: {
      loadedSheets: {
        equivalence_creature_npc_refined_v1: makeLoadedSheet([
          "rabbit.n",
          "rabbit.s"
        ]),
        equivalence_settlement_structures_v0: makeLoadedSheet([
          "housing-room"
        ]),
        equivalence_resource_stockpiles_v0: makeLoadedSheet([
          "grain"
        ]),
        equivalence_vegetation_scatter_v0: makeLoadedSheet([
          "oak.0",
          "pine.0",
          "berry-bush.0",
          "flower.0",
          "grass-tuft.0",
          "mushroom.0"
        ]),
        equivalence_ui_status_icons_v0: makeLoadedSheet([
          "stat-population"
        ]),
        equivalence_work_status_overlays_v0: makeLoadedSheet([
          "work-hammer"
        ]),
        equivalence_material_effect_overlays_v0: makeLoadedSheet([
          "fire-effect"
        ]),
        equivalence_terrain_materials_v0: makeLoadedSheet([
          "grass-lush.0"
        ]),
        equivalence_terrain_transitions_v0: makeLoadedSheet([
          "grass-water.edge.n"
        ])
      }
    },
    render: {},
    atlas: { pages: [] }
  },
  Number,
  String,
  Object,
  Array,
  Math,
  Buffer,
  Uint8Array,
  Float32Array,
  performance: {
    now() {
      return 0;
    }
  },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
};

vm.createContext(context);
vm.runInContext(equivalenceSource, context, { filename: "js/assets/equivalence.js" });

context.PS.assets.equivalence.resetFrameStats();
context.PS.assets.equivalence.select("citizen", "entity.fallback");
context.PS.assets.equivalence.select("stockpile", "entity.food.fallback");
context.PS.assets.equivalence.select("vegetation", "entity.vegetation.fallback");
context.PS.assets.equivalence.select("settlement", "entity.settlement.fallback");
context.PS.assets.equivalence.select("worldUi", "entity.settlement.world-ui.population");
context.PS.assets.equivalence.select("workStatus", "entity.intent.work");
context.PS.assets.equivalence.select("effect", "entity.effect.fallback");
context.PS.assets.equivalence.selectCell("terrain", "grass-lush.0", "terrainGround", "terrain.fallback");
context.PS.assets.equivalence.selectCell("transitions", "grass-water.edge.n", "terrainTransition", "terrain.transition.fallback");
context.PS.assets.equivalence.selectCell("vegetation", "pine.0", "vegetation", "entity.vegetation.tree.fallback");
context.PS.assets.equivalence.selectCell("vegetation", "berry-bush.0", "vegetation", "entity.vegetation.bush.fallback");
context.PS.assets.equivalence.selectCell("vegetation", "flower.0", "vegetation", "entity.vegetation.flower.fallback");
context.PS.assets.equivalence.selectCell("vegetation", "grass-tuft.0", "vegetation", "entity.vegetation.tuft.fallback");
context.PS.assets.equivalence.selectCell("vegetation", "mushroom.0", "vegetation", "entity.vegetation.mushroom.fallback");

const selectedCitizen = context.PS.assets.equivalence.select("citizen", "entity.fallback");
const stats = context.PS.assets.equivalence.getStats();

assert.strictEqual(stats.selected, 15, "accepted equivalence selector should record each render category selection");
assert.strictEqual(stats.rendered, 15, "accepted equivalence selector should create renderable atlas cells");
assert.strictEqual(stats.missing, 0, "all test equivalence sheets/cells should resolve");
assert.strictEqual(stats.byUse.citizen, 2, "citizen render category should select accepted creature sheet cells");
assert.strictEqual(stats.byUse.stockpile, 1, "stockpile render category should select accepted resource sheet cells");
assert.strictEqual(stats.byUse.vegetation, 6, "vegetation render category should select accepted vegetation sheet cells");
assert.strictEqual(stats.byUse.settlement, 1, "settlement render category should select accepted structure sheet cells");
assert.strictEqual(stats.byUse.worldUi, 1, "world UI render category should select accepted UI sheet cells");
assert.strictEqual(stats.byUse.workStatus, 1, "intent/status render category should select accepted overlay sheet cells");
assert.strictEqual(stats.byUse.effect, 1, "material/effect render category should select accepted effect sheet cells");
assert.strictEqual(stats.byUse.terrainGround, 1, "terrain ground render category should select accepted terrain material sheet cells");
assert.strictEqual(stats.byUse.terrainTransition, 1, "terrain transition render category should select accepted transition sheet cells");
assert.strictEqual(stats.bySheet.equivalence_creature_npc_refined_v1, 2, "creature/citizen usage should name the accepted creature sheet");
assert.strictEqual(stats.bySheet.equivalence_settlement_structures_v0, 1, "settlement usage should name the accepted structure sheet");
assert.strictEqual(stats.bySheet.equivalence_resource_stockpiles_v0, 1, "stockpile usage should name the accepted resource sheet");
assert.strictEqual(stats.bySheet.equivalence_vegetation_scatter_v0, 6, "vegetation usage should name the accepted scatter sheet");
assert.strictEqual(stats.bySheet.equivalence_material_effect_overlays_v0, 1, "effect usage should name the accepted material/effect sheet");
assert.strictEqual(stats.bySheet.equivalence_terrain_materials_v0, 1, "terrain usage should name the accepted terrain material sheet");
assert.strictEqual(stats.bySheet.equivalence_terrain_transitions_v0, 1, "transition usage should name the accepted terrain transition sheet");
assert.ok(selectedCitizen.renderCell, "accepted equivalence selection should expose an atlas-compatible render cell");
assert.strictEqual(selectedCitizen.renderCell.equivalenceSheetId, "equivalence_creature_npc_refined_v1", "render cell should retain accepted sheet identity");
assert.ok(selectedCitizen.renderCell.pageIndex >= 0, "render cell should target an external accepted sheet page");
assert.ok(context.PS.atlas.pages[selectedCitizen.renderCell.pageIndex].equivalencePixelData, "accepted sheet page should use file-safe decoded RGBA sidecar data");
assert.ok(context.PS.atlas.pages[selectedCitizen.renderCell.pageIndex].data instanceof Uint8Array, "accepted sheet page should expose RGBA bytes for WebGL upload");

context.PS.assets.loadedSheets.equivalence_creature_npc_refined_v1 = makeLoadedSheetWithoutPixelData(["rabbit.s"]);
context.PS.assets.equivalence.resetFrameStats();
context.PS.atlas.pages = [];
const imageFallback = context.PS.assets.equivalence.select("citizen", "entity.fallback");
assert.ok(imageFallback.renderCell, "HTTP-capable runtimes should still be able to fall back to image-backed accepted pages");
assert.ok(context.PS.atlas.pages[imageFallback.renderCell.pageIndex].externalImage, "image fallback should mark an external image page");

context.PS.assets.loadedSheets.equivalence_creature_npc_refined_v1 = makeBrokenPixelLoadedSheet(["rabbit.s"]);
context.PS.assets.equivalence.resetFrameStats();
context.PS.atlas.pages = [];
const brokenPixel = context.PS.assets.equivalence.select("citizen", "entity.fallback");
const brokenStats = context.PS.assets.equivalence.getStats();
assert.strictEqual(brokenPixel.renderCell, null, "broken accepted pixel sidecar should not produce a render cell");
assert.ok(
  brokenStats.missingKeys["pixel-data:equivalence_creature_npc_refined_v1"] > 0 ||
    brokenStats.missingKeys["pixel-data:unknown"] > 0,
  "broken pixel sidecar should be diagnostic"
);

context.PS.assets.loadedSheets.equivalence_terrain_transition_grass_sand_v1 = makeLoadedSheet(["grass-sand.pattern-02"]);
context.PS.assets.loadedSheets.equivalence_terrain_transition_grass_sand_v1.sheet.getCell = function (name) {
  if (name !== "grass-sand.pattern-02") {
    return null;
  }
  return {
    name,
    x: 64,
    y: 0,
    w: 32,
    h: 32,
    image: { width: 32, height: 32 },
    splitAtlas: true,
    normalX: 320,
    normalY: 0,
    normalW: 32,
    normalH: 32,
    materialChannels: { r: "height", g: "roughness", b: "emissive", a: "coverage" },
    materialX: 576,
    materialY: 0,
    materialW: 32,
    materialH: 32
  };
};
context.PS.assets.equivalence.resetFrameStats();
context.PS.atlas.pages = [];
const generatedTransition = context.PS.assets.equivalence.selectCell(
  "transitions",
  "grass-sand.pattern-02",
  "terrainTransition",
  "terrain.transition.fallback"
);
assert.strictEqual(generatedTransition.sheetId, "equivalence_terrain_transition_grass_sand_v1", "generated 46-pattern transition cells should resolve from transition atlas sheets when the legacy sheet does not contain them");
assert.strictEqual(generatedTransition.renderCell.splitAtlas, true, "generated transition render cells should preserve split normal atlas metadata");
assert.strictEqual(generatedTransition.renderCell.normalX, 320, "generated transition render cells should preserve normal panel coordinates");
assert.strictEqual(generatedTransition.renderCell.materialX, 576, "generated transition render cells should preserve packed material panel coordinates");
assert.deepStrictEqual(generatedTransition.renderCell.materialChannels, {
  r: "height",
  g: "roughness",
  b: "emissive",
  a: "coverage"
}, "generated transition render cells should preserve material channel semantics");

console.log("equivalence asset selection checks passed");
