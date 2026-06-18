const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const bitsmapSource = read("js/core/bitsmap.js");
const drawOrderSource = read("js/render/draw-order.js");
const vegetationGridSource = read("js/sim/vegetation.js");
const shadowSource = read("js/render/shadow-stamping.js");
const vegetationCellsSource = read("js/render/vegetation-cells.js");
const vegetationShadowsSource = read("js/render/vegetation-shadows.js");
const vegetationOverlaysSource = read("js/render/vegetation-overlays.js");
const vegetationDrawListSource = read("js/render/vegetation-draw-list.js");
const vegetationRenderSource = read("js/render/vegetation-render.js");
const pipelineSource = read("js/render/pipeline.js");
const atlasSource = read("js/render/entity-atlas.js");
const selectedVegetationCells = [];

assert.ok(manifestSource.indexOf("js/render/shadow-stamping.js") < manifestSource.indexOf("js/render/entities.js"), "shadow stamping should load before entity facades");
assert.ok(manifestSource.indexOf("js/render/vegetation-render.js") > manifestSource.indexOf("js/render/entities.js"), "vegetation render should load after entity facade");
assert.ok(manifestSource.indexOf("js/render/vegetation-cells.js") > manifestSource.indexOf("js/render/entities.js"), "vegetation cell helpers should load after entity facade");
assert.ok(manifestSource.indexOf("js/render/vegetation-cells.js") < manifestSource.indexOf("js/render/vegetation-render.js"), "vegetation cell helpers should load before vegetation renderer");
assert.ok(manifestSource.indexOf("js/render/vegetation-shadows.js") < manifestSource.indexOf("js/render/vegetation-render.js"), "vegetation shadow policy should load before vegetation renderer");
assert.ok(manifestSource.indexOf("js/render/vegetation-overlays.js") < manifestSource.indexOf("js/render/vegetation-render.js"), "vegetation overlay helpers should load before vegetation renderer");
assert.ok(manifestSource.indexOf("js/render/vegetation-draw-list.js") < manifestSource.indexOf("js/render/vegetation-render.js"), "vegetation draw-list helpers should load before vegetation renderer");
assert.ok(manifestSource.indexOf("js/render/vegetation-render.js") < manifestSource.indexOf("js/render/pipeline.js"), "vegetation render should load before pipeline registration");
assert.ok(pipelineSource.indexOf('PS.render.pipeline.registerLayer("vegetation.world"') >= 0, "pipeline should register world vegetation layer");
assert.ok(pipelineSource.indexOf('PS.render.pipeline.registerLayer("vegetation.grass"') >= 0, "pipeline should register grass density overlay layer");
assert.ok(pipelineSource.indexOf("order: 34") >= 0, "grass density overlay should render below world vegetation");
assert.ok(pipelineSource.indexOf("order: 35") >= 0, "world vegetation layer should use pipeline order 35");
assert.strictEqual(vegetationRenderSource.indexOf("webgl"), -1, "vegetation renderer should not add legacy WebGL hooks");
assert.ok(vegetationRenderSource.indexOf("drawShadowRects") >= 0, "vegetation renderer should submit shadows through the WebGPU shadow rect path");
assert.ok(vegetationCellsSource.indexOf("getAcceptedVegetationCellName") >= 0, "vegetation cell helpers should own accepted sprite selection");
assert.ok(vegetationShadowsSource.indexOf("getShadowSpec") >= 0, "vegetation shadow helpers should own shadow policy");
assert.ok(vegetationOverlaysSource.indexOf("drawGrassOverlay") >= 0, "vegetation overlay helpers should own grass overlay drawing");
assert.ok(vegetationDrawListSource.indexOf("buildDrawList") >= 0, "vegetation draw-list helpers should own legacy draw-list facade");
assert.ok(atlasSource.indexOf("PS.atlas.getVegetationCell") >= 0, "atlas should expose vegetation sprite cells");

const drawCalls = [];
const context = {
  PS: {
    core: {},
    render: {
      entities: {
        getTileRenderPosition(tileX, tileY) {
          const screenYByTile = {
            "2,3": 12,
            "1,2": 20,
            "0,1": 30
          };
          return {
            x: tileX * 10 + 5,
            y: screenYByTile[tileX + "," + tileY] || (tileY * 10 + 5),
            scale: 1,
            visibility: 1,
            visible: true
          };
        },
        createEntityBatches() {
          return { count: 0, items: [] };
        },
        appendEntityCell(batches, cell, point, size, alpha, kind, offsetX, offsetY) {
          batches.items.push({
            cell: cell.name,
            y: point.y,
            size,
            alpha,
            kind,
            offsetY
          });
          batches.count += 1;
          return true;
        },
        drawEntityBatches(batches, drawn) {
          drawCalls.push({
            drawn,
            cells: batches.items.map((item) => item.cell),
            yValues: batches.items.map((item) => item.y),
            offsets: batches.items.map((item) => item.offsetY),
            widths: batches.items.map((item) => item.width || item.size),
            heights: batches.items.map((item) => item.height || item.size)
          });
          return drawn > 0;
        }
      },
      webgpuEntity: {
        beginBatches() {
          return { items: [] };
        },
        appendCell(batches, cell, x, y, width, height, alpha, tint, kind) {
          batches.items.push({
            cell: cell.name,
            x,
            y,
            width,
            height,
            alpha,
            kind
          });
          batches.count = batches.items.length;
          return batches;
        },
        drawParticleRects(values) {
          drawCalls.push({
            drawn: Math.floor(values.length / 8),
            cells: ["grass-overlay"],
            values: Array.from(values)
          });
          return values.length > 0;
        },
        drawShadowRects(values) {
          drawCalls.push({
            drawn: Math.floor(values.length / 8),
            cells: ["vegetation-shadow"],
            values: Array.from(values)
          });
          return values.length > 0;
        }
      }
    },
    camera: {
      unified: {
        getVisibleTileRect() {
          return { minX: 0, minY: 0, maxX: 3, maxY: 3 };
        }
      }
    },
    assets: {
      equivalence: {
        selectCell(family, cellName, use, fallbackCellId) {
          selectedVegetationCells.push({ family, cellName, use, fallbackCellId });
          if (["oak.2", "leafy-bush.0"].indexOf(cellName) >= 0) {
            return {
              renderCell: { name: "accepted." + cellName, w: cellName === "oak.2" ? 32 : 16, h: cellName === "oak.2" ? 48 : 16 },
              fallbackCellId
            };
          }
          return null;
        }
      }
    },
    atlas: {
      getVegetationCell(type, variant, part) {
        return { name: "veg." + type + "." + variant + "." + part, w: 16, h: 16 };
      }
    }
  },
  CONFIG: { TILE_SIZE: 10 },
  WORLD_WIDTH: 4,
  WORLD_HEIGHT: 4,
  Math,
  Number,
  String,
  Object,
  Array,
  Uint8Array,
  Uint32Array,
  Error,
  performance: {
    now() {
      return 1;
    }
  },
  isGlobeRenderMode() {
    return true;
  }
};

vm.createContext(context);
vm.runInContext(bitsmapSource, context, { filename: "js/core/bitsmap.js" });
vm.runInContext(drawOrderSource, context, { filename: "js/render/draw-order.js" });
vm.runInContext(vegetationGridSource, context, { filename: "js/sim/vegetation.js" });
vm.runInContext(shadowSource, context, { filename: "js/render/shadow-stamping.js" });
vm.runInContext(vegetationCellsSource, context, { filename: "js/render/vegetation-cells.js" });
vm.runInContext(vegetationShadowsSource, context, { filename: "js/render/vegetation-shadows.js" });
vm.runInContext(vegetationOverlaysSource, context, { filename: "js/render/vegetation-overlays.js" });
vm.runInContext(vegetationDrawListSource, context, { filename: "js/render/vegetation-draw-list.js" });
vm.runInContext(vegetationRenderSource, context, { filename: "js/render/vegetation-render.js" });

const vegetation = context.PS.vegetation;
vegetation.init(4, 4);
vegetation.set(2, 3, vegetation.TYPES.TREE_BIG, 5);
vegetation.set(0, 1, vegetation.TYPES.BUSH, 2);
vegetation.set(1, 2, vegetation.TYPES.ROCK, 1);
vegetation.set(3, 0, vegetation.TYPES.FLOWER, 1);
vegetation.setGrassDensity(0, 0, 5);
vegetation.setGrassDensity(1, 0, 15);

const list = context.PS.render.vegetation.buildDrawList();
assert.deepStrictEqual(JSON.parse(JSON.stringify(list.map((item) => item.tileY))), [0, 3, 2, 1], "vegetation draw list should be Y-sorted by projected screen position");
assert.strictEqual(context.PS.render.vegetation.getStats().visibleCount, 4, "stats should count visible vegetation");
assert.strictEqual(context.PS.render.vegetation.getStats().canopyCount, 1, "stats should count tree canopy entries");
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.PS.render.vegetation.getShadowSpec(vegetation.TYPES.TREE_BIG))), { height: 8, length: 6, mode: "soft" }, "big trees should use AZR-545 shadow dimensions");
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.PS.render.vegetation.getShadowSpec(vegetation.TYPES.TREE_MEDIUM))), { height: 6, length: 4, mode: "soft" }, "medium trees should use AZR-545 shadow dimensions");
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.PS.render.vegetation.getShadowSpec(vegetation.TYPES.TREE_SMALL))), { height: 4, length: 3, mode: "soft" }, "small trees should use AZR-545 shadow dimensions");
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.PS.render.vegetation.getShadowSpec(vegetation.TYPES.BUSH))), { height: 1, length: 1, mode: "hard" }, "bushes should cast short shadows");
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.PS.render.vegetation.getShadowSpec(vegetation.TYPES.ROCK))), { height: 2, length: 2, mode: "hard" }, "rocks should cast low hard shadows");
assert.strictEqual(context.PS.render.vegetation.getShadowHeight(vegetation.TYPES.FLOWER), 0, "flowers should not cast vegetation shadows");
assert.strictEqual(context.PS.render.vegetation.getShadowHeight(vegetation.TYPES.MUSHROOM), 0, "mushrooms should not cast vegetation shadows");
assert.strictEqual(context.PS.render.vegetation.getShadowHeight(vegetation.TYPES.GRASS_TUFT), 0, "grass tufts should not cast vegetation shadows");

assert.strictEqual(context.PS.render.vegetation.draw(), true, "vegetation renderer should submit draw-order commands");
context.PS.render.drawOrder.flush({});

assert.strictEqual(drawCalls.length, 3, "vegetation should draw shadows, below sprites, and canopy batches separately");
assert.deepStrictEqual(JSON.parse(JSON.stringify(drawCalls[0].cells)), ["vegetation-shadow"], "shadow batch should render before vegetation sprites");
assert.ok(drawCalls[0].drawn > 3, "vegetation should stamp multiple offset shadow rects for visible vegetation");
assert.ok(drawCalls[0].values[2] > drawCalls[0].values[18], "tree shadow should be wider than bush shadows");
assert.ok(drawCalls[0].values[3] > drawCalls[0].values[19], "tree shadow should be taller than low vegetation shadows");
assert.ok(drawCalls[0].values[7] > drawCalls[0].values[15], "shadow stamp opacity should decrease across tree copies");
assert.strictEqual(drawCalls[0].drawn, 4, "only tree, bush, and rock should cast physical vegetation shadow stamps");
assert.deepStrictEqual(JSON.parse(JSON.stringify(drawCalls[1].cells)), ["veg.5.1.below", "veg.3.5.below", "veg.7.1.below", "accepted.leafy-bush.0"], "ground vegetation should sort by projected screen position and keep rocks procedural");
assert.deepStrictEqual(JSON.parse(JSON.stringify(drawCalls[2].cells)), ["accepted.oak.2"], "canopy batch should prefer accepted authored tree sprites");
assert.ok(drawCalls[2].heights[0] > drawCalls[2].widths[0], "accepted tree canopy should preserve 32x48 sprite aspect");
assert.ok(drawCalls[1].drawn > drawCalls[2].drawn, "below batch should include trunks and ground vegetation");
assert.strictEqual(context.PS.render.vegetation.getStats().shadowCount, 3, "stats should count logical vegetation shadow casters");
assert.ok(selectedVegetationCells.some((call) => call.family === "vegetation" && call.cellName === "oak.2" && call.fallbackCellId === "veg.3.5.canopy"), "tree canopies should resolve through the accepted vegetation sheet");
assert.ok(selectedVegetationCells.some((call) => call.family === "vegetation" && call.cellName === "leafy-bush.0" && call.fallbackCellId === "veg.4.2.below"), "bushes should resolve through the accepted vegetation sheet");
assert.ok(!selectedVegetationCells.some((call) => call.fallbackCellId === "veg.7.1.below"), "rocks should remain procedural until an accepted rock sprite exists");
assert.strictEqual(context.PS.render.vegetation.drawGrassOverlay(), true, "grass density overlay should submit WebGPU rects");
assert.strictEqual(drawCalls[3].drawn, 2, "grass density overlay should draw one rect per non-zero density tile");
assert.ok(drawCalls[3].values[7] < 0.5 && drawCalls[3].values[15] > drawCalls[3].values[7], "grass overlay alpha should scale by density");

context.PS.render.vegetation.invalidateCache();
const worldLodState = {
  visualPolicy: {
    level: "WORLD",
    vegetationMode: "minimap",
    vegetationSpriteScale: 0,
    vegetationShadowAlpha: 0
  }
};
const worldPrepared = context.PS.render.vegetation.buildLayerBatches(worldLodState);
assert.strictEqual(worldPrepared.belowCount, 0, "world LOD should skip detailed vegetation sprite batches");
assert.strictEqual(worldPrepared.canopyCount, 0, "world LOD should skip detailed canopy batches");
assert.strictEqual(worldPrepared.shadowCount, 0, "world LOD should skip vegetation shadow batches");
assert.strictEqual(context.PS.render.vegetation.drawGrassOverlay(worldLodState), false, "world LOD should skip per-tile grass overlay rects");

console.log("vegetation render checks passed");
