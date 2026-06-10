const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const namespaceSource = read("js/core/namespace.js");
const drawOrderSource = read("js/render/draw-order.js");
const vegetationGridSource = read("js/sim/vegetation.js");
const vegetationRenderSource = read("js/render/vegetation-render.js");
const pipelineSource = read("js/render/pipeline.js");
const atlasSource = read("js/render/entity-atlas.js");

assert.ok(namespaceSource.indexOf("js/render/vegetation-render.js") > namespaceSource.indexOf("js/render/entities.js"), "vegetation render should load after entity facade");
assert.ok(namespaceSource.indexOf("js/render/vegetation-render.js") < namespaceSource.indexOf("js/render/pipeline.js"), "vegetation render should load before pipeline registration");
assert.ok(pipelineSource.indexOf('PS.render.pipeline.registerLayer("vegetation.world"') >= 0, "pipeline should register world vegetation layer");
assert.ok(pipelineSource.indexOf("order: 35") >= 0, "world vegetation layer should use pipeline order 35");
assert.strictEqual(vegetationRenderSource.indexOf("webgl"), -1, "vegetation renderer should not add legacy WebGL hooks");
assert.ok(atlasSource.indexOf("PS.atlas.getVegetationCell") >= 0, "atlas should expose vegetation sprite cells");

const drawCalls = [];
const context = {
  PS: {
    render: {
      entities: {
        getTileRenderPosition(tileX, tileY) {
          return {
            x: tileX * 10 + 5,
            y: tileY * 10 + 5,
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
            offsets: batches.items.map((item) => item.offsetY)
          });
          return drawn > 0;
        }
      },
      webgpuEntity: {
        beginBatches() {
          return {};
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
    atlas: {
      getVegetationCell(type, variant, part) {
        return { name: "veg." + type + "." + variant + "." + part };
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
  Error,
  performance: {
    now() {
      return 1;
    }
  }
};

vm.createContext(context);
vm.runInContext(drawOrderSource, context, { filename: "js/render/draw-order.js" });
vm.runInContext(vegetationGridSource, context, { filename: "js/sim/vegetation.js" });
vm.runInContext(vegetationRenderSource, context, { filename: "js/render/vegetation-render.js" });

const vegetation = context.PS.vegetation;
vegetation.init(4, 4);
vegetation.set(2, 3, vegetation.TYPES.TREE_BIG, 5);
vegetation.set(0, 1, vegetation.TYPES.BUSH, 2);
vegetation.set(1, 2, vegetation.TYPES.ROCK, 1);

const list = context.PS.render.vegetation.buildDrawList();
assert.deepStrictEqual(JSON.parse(JSON.stringify(list.map((item) => item.tileY))), [1, 2, 3], "vegetation draw list should be Y-sorted north to south");
assert.strictEqual(context.PS.render.vegetation.getStats().visibleCount, 3, "stats should count visible vegetation");
assert.strictEqual(context.PS.render.vegetation.getStats().canopyCount, 1, "stats should count tree canopy entries");

assert.strictEqual(context.PS.render.vegetation.draw(), true, "vegetation renderer should submit draw-order commands");
context.PS.render.drawOrder.flush({});

assert.strictEqual(drawCalls.length, 2, "vegetation should draw below and canopy batches separately");
assert.deepStrictEqual(JSON.parse(JSON.stringify(drawCalls[0].yValues)), [15, 25, 35], "below batch should preserve Y-sort order");
assert.deepStrictEqual(JSON.parse(JSON.stringify(drawCalls[1].cells)), ["veg.3.5.canopy"], "canopy batch should include only tree canopies");
assert.ok(drawCalls[0].drawn > drawCalls[1].drawn, "below batch should include trunks and ground vegetation");
assert.ok(drawCalls[1].offsets[0] < 0, "canopy batch should render above the trunk anchor");

console.log("vegetation render checks passed");
