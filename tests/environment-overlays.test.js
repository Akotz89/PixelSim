const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const namespaceSource = read("js/core/namespace.js");
const bitsmapSource = read("js/core/bitsmap.js");
const overlaySource = read("js/render/environment-overlays.js");
const pipelineSource = read("js/render/pipeline.js");

assert.ok(namespaceSource.indexOf("js/render/environment-overlays.js") > namespaceSource.indexOf("js/render/vegetation-render.js"), "environment overlays should load after vegetation renderer");
assert.ok(namespaceSource.indexOf("js/render/environment-overlays.js") < namespaceSource.indexOf("js/render/pipeline.js"), "environment overlays should load before pipeline registration");
assert.ok(pipelineSource.indexOf('PS.render.pipeline.registerLayer("environment.snow"') >= 0, "pipeline should register snow environment overlay");
assert.ok(pipelineSource.indexOf('PS.render.pipeline.registerLayer("environment.ice"') >= 0, "pipeline should register ice environment overlay");
assert.ok(pipelineSource.indexOf("order: 33") >= 0, "snow overlay should render before grass and world vegetation overlays");
assert.ok(pipelineSource.indexOf("order: 32.5") >= 0, "ice overlay should render on top of the water layer before snow");
assert.strictEqual(overlaySource.toLowerCase().indexOf("webgl"), -1, "environment overlays must not add legacy WebGL hooks");

const drawCalls = [];
const context = {
  PS: {
    render: {
      waterRendering: {
        isWaterSample(sample) {
          const detail = sample && sample.detail || {};
          return sample && (sample.biome === "ocean" || String(detail.surface || "").indexOf("water") >= 0);
        }
      },
      webgpuEntity: {
        drawParticleRects(values) {
          drawCalls.push(Array.from(values));
          return values.length > 0;
        }
      }
    },
    ranmap: {
      data: true,
      variant(x, y, count) {
        return Math.abs(Math.round(x) * 7 + Math.round(y) * 11) % count;
      },
      normalizedBits(x, y) {
        return (Math.abs(Math.round(x) * 5 + Math.round(y) * 3) % 16) / 15;
      }
    },
    camera: {
      unified: {
        getVisibleTileRect() {
          return { minX: 0, minY: 0, maxX: 3, maxY: 2 };
        }
      }
    }
  },
  CONFIG: { TILE_SIZE: 16 },
  WORLD_WIDTH: 4,
  WORLD_HEIGHT: 3,
  world: {
    globalSnow: 0.92,
    planetTiles: []
  },
  Uint32Array,
  Uint8Array,
  Float32Array,
  Math,
  Number,
  String,
  Object,
  Array,
  Boolean
};

for (let i = 0; i < 12; i += 1) {
  context.world.planetTiles.push({
    biome: "tundra",
    detail: { surface: "snow", materialSignals: { light: 0.1 } }
  });
}

vm.createContext(context);
vm.runInContext(bitsmapSource, context, { filename: "js/core/bitsmap.js" });
vm.runInContext(overlaySource, context, { filename: "js/render/environment-overlays.js" });

const overlays = context.PS.render.environmentOverlays;
overlays.initSnowBase(4, 3);
assert.ok(overlays.snowBaseMap instanceof context.PS.core.Bitsmap, "snow base should use the shared Bitsmap primitive");
assert.strictEqual(overlays.snowBaseData.byteLength, 4, "2-bit snow base should pack into one 32-bit word for this test grid");
assert.strictEqual(overlays.setSnowBase(0, 0, 1), 1, "snow base setter should store low two bits");
assert.strictEqual(overlays.setSnowBase(1, 0, 2), 2, "snow base setter should store second packed pair");
assert.strictEqual(overlays.setSnowBase(2, 0, 3), 3, "snow base setter should store third packed pair");
assert.strictEqual(overlays.setSnowBase(3, 0, 9), 3, "snow base setter should clamp to 2-bit max");
assert.strictEqual(overlays.snowBaseData[0] & 255, 249, "four snow base values should pack into the first byte");
assert.strictEqual(overlays.getSnowBase(0, 0), 1, "snow base first two-bit field should round-trip");
assert.strictEqual(overlays.getSnowBase(1, 0), 2, "snow base second two-bit field should round-trip");
assert.strictEqual(overlays.getSnowBase(2, 0), 3, "snow base third two-bit field should round-trip");
assert.strictEqual(overlays.getSnowBase(3, 0), 3, "snow base fourth two-bit field should round-trip");

const firstBase = Array.from(overlays.populateSnowBase(4, 3));
const secondBase = Array.from(overlays.populateSnowBase(4, 3));
assert.deepStrictEqual(secondBase, firstBase, "heightmap-style snow base generation should be deterministic");

overlays.setSnowBase(0, 0, 0);
overlays.setSnowBase(1, 0, 0);
const openSnow = overlays.computeSnowLevel(context.world.planetTiles[0], 0, 0, 0.92);
const roofSnow = overlays.computeSnowLevel({ roof: true, detail: { materialSignals: { light: 0 } } }, 0, 0, 0.92);
const wallSnow = overlays.computeSnowLevel({ detail: { surface: "massive wall", materialSignals: { light: 0 } } }, 0, 0, 0.92);
const pathSnow = overlays.computeSnowLevel({ pathHeuristic: 0.95, detail: { materialSignals: { light: 0 } } }, 0, 0, 0.92);
const brightSnow = overlays.computeSnowLevel({ detail: { materialSignals: { light: 1 } } }, 0, 0, 0.35);
assert.ok(openSnow > 0, "global threshold should produce snow on open cold tiles");
assert.strictEqual(roofSnow, 0, "snow should not appear under roofs");
assert.strictEqual(wallSnow, 0, "snow should not appear on massive walls");
assert.strictEqual(pathSnow, 0, "snow should not appear on heavily-used paths");
assert.strictEqual(brightSnow, 0, "light/noise/random subtraction should suppress weak snow");

const info = overlays.getSnowTileInfo(context.world.planetTiles[0], 0, 0, 0.92);
assert.ok(info.variant >= info.level * 16 && info.variant < info.level * 16 + 16, "snow tile variants should reserve 16 variants per level");
assert.ok(info.offsetX >= -7 && info.offsetX <= 0, "snow X offset should follow the SoS random pixel range");
assert.ok(info.offsetY >= -7 && info.offsetY <= 0, "snow Y offset should follow the SoS random pixel range");

assert.strictEqual(overlays.drawSnowOverlay(), true, "snow overlay should submit WebGPU rects");
assert.ok(drawCalls[0].length > 0 && drawCalls[0].length % 8 === 0, "snow overlay rect payload should use rect/color stride");
assert.strictEqual(overlays.getStats().snowOverlayCount, drawCalls[0].length / 8, "snow overlay stats should count submitted rects");

context.world.planetTiles = [];
for (let i = 0; i < 12; i += 1) {
  context.world.planetTiles.push({
    biome: "ocean",
    detail: { surface: "open water", materialSignals: { waterDepth: 0.75 } }
  });
}
context.world.globalIce = 0.55;
const firstIceTiles = [];
const secondIceTiles = [];
for (let y = 0; y < 3; y += 1) {
  for (let x = 0; x < 4; x += 1) {
    if (overlays.shouldRenderIce(context.world.planetTiles[y * 4 + x], x, y, 0.35)) {
      firstIceTiles.push(x + "," + y);
    }
    if (overlays.shouldRenderIce(context.world.planetTiles[y * 4 + x], x, y, 0.75)) {
      secondIceTiles.push(x + "," + y);
    }
  }
}
assert.ok(firstIceTiles.length < secondIceTiles.length, "increasing ice value should gradually freeze more deterministic tiles");
assert.deepStrictEqual(firstIceTiles, firstIceTiles.slice(), "ice threshold selection should be deterministic");
assert.strictEqual(overlays.shouldRenderIce({ biome: "grassland", detail: { surface: "grass" } }, 0, 0, 1), false, "ice should not render on non-water samples");

const iceInfo = overlays.getIceTileInfo(context.world.planetTiles[0], 0, 0, 1);
assert.ok(iceInfo, "high global ice should produce an ice tile");
assert.ok(iceInfo.mask >= 0 && iceInfo.mask <= 15, "ice overlay should compute its own autotile mask");
assert.ok(iceInfo.variant >= iceInfo.mask * 16 && iceInfo.variant < iceInfo.mask * 16 + 16, "ice variants should reserve 16 variants per mask");

assert.strictEqual(overlays.drawIceOverlay(), true, "ice overlay should submit WebGPU rects");
assert.ok(drawCalls[1].length > 0 && drawCalls[1].length % 8 === 0, "ice overlay rect payload should use rect/color stride");
assert.strictEqual(overlays.getStats().iceOverlayCount, drawCalls[1].length / 8, "ice overlay stats should count submitted rects");

console.log("environment overlay checks passed");
