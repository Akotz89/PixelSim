const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function makeElement() {
  return {
    width: 1600,
    height: 850,
    classList: {
      add() {},
      remove() {},
      toggle() {}
    },
    addEventListener() {},
    getContext() {
      return {};
    },
    querySelector() {
      return makeElement();
    },
    setAttribute() {},
    getAttribute() {
      return "";
    }
  };
}

const context = {
  assert,
  console,
  performance: {
    now() {
      return 0;
    }
  },
  window: {
    addEventListener() {}
  },
  document: {
    head: {
      appendChild() {}
    },
    getElementById() {
      return makeElement();
    },
    createElement() {
      return makeElement();
    }
  }
};

context.window.window = context.window;
context.window.document = context.document;
context.window.performance = context.performance;

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/core/config.js",
  "js/core/event-types.js",
  "js/core/events.js",
  "js/core/math.js",
  "js/core/prng.js",
  "js/core/noise.js",
  "js/core/assert.js",
  "js/core/log.js",
  "js/core/audio.js",
  "js/core/input.js",
  "js/core/tile-registry.js",
  "js/core/entity-registry.js",
  "js/core/animation.js",
  "js/assets/registry.js",
  "js/assets/loader.js",
  "js/assets/sprite-sheet.js",
  "js/ui/dom-refs.js",
  "js/systems/state.js",
  "js/core/utils.js",
  "js/core/world-grid.js",
  "js/core/planet-metrics.js",
  "js/systems/spatial.js",
  "js/systems/pool-manager.js",
  "js/systems/pools.js",
  "js/systems/tile-grid.js",
  "js/render/ranmap.js",
  "js/render/tile-iterator.js",
  "js/render/particles.js",
  "js/render/entity-atlas.js",
  "js/render/terrain-atlas-detail.js",
  "js/render/camera-unified.js",
  "js/render/globe.js",
  "js/render/planet-view.js",
  "js/render/planet-surface.js",
  "js/render/planet-grid.js",
  "js/render/terrain-hydrology.js",
  "js/render/terrain-seeding.js",
  "js/render/pipeline-compat.js",
  "js/render/wgsl-shader-manager.js",
  "js/render/gpu.js",
  "js/render/webgpu-targets.js",
  "js/render/webgpu-compositor.js",
  "js/render/webgpu-gbuffer.js",
  "js/render/webgpu-globe.js",
  "js/render/surface-worker-client.js",
  "js/render/surface-tile-batcher.js",
  "js/render/webgpu-surface-tile.js",
  "js/render/webgpu-entity.js",
  "js/render/renderer.js",
  "js/render/webgpu-renderer.js",
  "js/render/draw-order.js",
  "js/render/camera.js",
  "js/render/lod.js",
  "js/render/projection.js",
  "js/render/surface-address.js",
  "js/render/surface-cache.js",
  "js/render/surface-features.js",
  "js/render/surface-feature-query.js",
  "js/render/surface-noise.js",
  "js/render/surface-geometry.js",
  "js/render/surface-streaming.js",
  "js/render/surface-render-cache.js",
  "js/render/terrain.js",
  "js/render/surface-landform.js",
  "js/render/surface-imagery.js",
  "js/render/surface-color.js",
  "js/render/surface-texture.js",
  "js/render/surface-patterns.js",
  "js/render/surface-strata.js",
  "js/render/surface-natural.js",
  "js/render/surface-hydrology.js",
  "js/render/surface-transitions.js",
  "js/render/surface-material.js",
  "js/render/surface-relief.js",
  "js/render/entities.js",
  "js/render/pipeline.js"
].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");

vm.runInNewContext(`${source}

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, label + " expected " + expected + " got " + actual);
}

function fillPlanetTiles(biome) {
  world.planetTiles = [];

  for (var y = 0; y < WORLD_HEIGHT; y++) {
    for (var x = 0; x < WORLD_WIDTH; x++) {
      world.planetTiles[getTileIndex(x, y)] = {
        x: x,
        y: y,
        latitude: getPlanetLatitudeForTile(y),
        longitude: getPlanetLongitudeForTile(x),
        biome: biome,
        moisture: biome === "ocean" ? 1 : 1.2,
        elevation: biome === "ocean" ? -1 : 0.2,
        areaKm2: 1
      };
    }
  }
}

function rgbDistance(from, to) {
  return Math.abs(from.red - to.red) + Math.abs(from.green - to.green) + Math.abs(from.blue - to.blue);
}

function assertRgbBounds(rgb, label) {
  assert.ok(rgb.red >= 0 && rgb.red <= 255, label + " red should be bounded");
  assert.ok(rgb.green >= 0 && rgb.green <= 255, label + " green should be bounded");
  assert.ok(rgb.blue >= 0 && rgb.blue <= 255, label + " blue should be bounded");
}

function uniqueAtlasCellColorCount(cell) {
  var page = PS.atlas.pages[cell.pageIndex];
  var colors = {};

  for (var y = 0; y < cell.h; y++) {
    for (var x = 0; x < cell.w; x++) {
      var index = ((cell.y + y) * page.width + cell.x + x) * 4;

      if (page.data[index + 3] > 0) {
        colors[
          page.data[index] + "," +
          page.data[index + 1] + "," +
          page.data[index + 2] + "," +
          page.data[index + 3]
        ] = true;
      }
    }
  }

  return Object.keys(colors).length;
}

setWorldSeed("PIXEL-ZOOM-ANCHOR");
fillPlanetTiles("grassland");
seedTerrain();

assert.strictEqual(typeof PS.render.raster, "undefined", "Canvas2D raster runtime should stay removed");
assert.strictEqual(typeof PS.render.surfaceRender.chunks, "undefined", "Canvas2D surface chunk renderer should stay removed");
assert.strictEqual(typeof PS.render.webgpuSurfaceTile.makeBatches, "function", "WebGPU surface tile batching should be available");
assert.strictEqual(typeof PS.atlas.drawTerrainDetailOverlay, "function", "terrain atlas detail overlay should be available");
assert.strictEqual(typeof PS.render.surfaceWorker.getSubcellBasePatchSize, "function", "worker-ready surface chunk encoding should expose patch sizing");
assert.strictEqual(PS.render.surfaceNoise.getRegionalContext(null).seaLevelDelta, 0, "missing regional tile context should not throw during local surface generation");

var cursorX = 1225;
var cursorY = 410;
var finalGroundZoomIndex = CONFIG.PLANET_ZOOM_LEVELS.length - 1;
var initialZoom = 4;
world.planetView = {
  zoomLevel: initialZoom,
  latitude: 34.2117,
  longitude: -77.7265,
  panEastMeters: 0,
  panNorthMeters: 0
};

var localBefore = getPlanetLatLonFromCanvasPoint(cursorX, cursorY);

assert.ok(setPlanetZoomLevelAtCanvasPoint(initialZoom + 0.25, cursorX, cursorY), "planet zoom should accept fractional direct zoom");
assertNear(getPlanetView().zoomLevel, initialZoom + 0.25, 1e-12, "fractional zoom should be retained");

var localAfter = getPlanetLatLonFromCanvasPoint(cursorX, cursorY);
assertNear(localAfter.latitude, localBefore.latitude, 1e-9, "anchored local latitude");
assertNear(localAfter.longitude, localBefore.longitude, 1e-9, "anchored local longitude");
var zoomTransitionStats = PS.camera.getZoomTransitionStats();
assert.strictEqual(zoomTransitionStats.lastZoomDirection, 1, "anchored zoom should record forward zoom direction");
assertNear(zoomTransitionStats.lastZoomFrom, initialZoom, 1e-12, "anchored zoom should record source zoom");
assertNear(zoomTransitionStats.lastZoomTo, initialZoom + 0.25, 1e-12, "anchored zoom should record target zoom");
assert.ok(zoomTransitionStats.lastZoomAnchorErrorDeg <= 1e-8, "anchored zoom should record negligible cursor drift");
assert.ok(zoomTransitionStats.lastZoomPreloadSurfaceLodIndex >= getPlanetSurfaceLodZoomIndex(initialZoom), "anchored zoom should record a forward preload LOD target");

world.planetView = {
  zoomLevel: finalGroundZoomIndex,
  latitude: 34.2117,
  longitude: -77.7265,
  panEastMeters: 0,
  panNorthMeters: 0
};

var centerLatLon = getPlanetLatLonFromCanvasPoint(canvas.width / 2, canvas.height / 2);
var centerPoint = getPlanetLocalCanvasPoint(centerLatLon.longitude, centerLatLon.latitude);
var centerAddress = getPlanetSurfaceSampleAddress(centerLatLon.latitude, centerLatLon.longitude);

assertNear(centerLatLon.latitude, world.planetView.latitude, 1e-9, "meter projection center latitude");
assertNear(centerLatLon.longitude, world.planetView.longitude, 1e-9, "meter projection center longitude");
assertNear(centerPoint.x, canvas.width / 2, 1e-6, "meter projection center x");
assertNear(centerPoint.y, canvas.height / 2, 1e-6, "meter projection center y");
assert.strictEqual(centerAddress.zoomLevel, finalGroundZoomIndex, "final zoom should select meter surface LOD");
assert.strictEqual(centerAddress.sampleMeters, 1, "final zoom should use one-meter samples");

fillPlanetTiles("ocean");
var oceanTile = getPlanetTile(Math.floor(WORLD_WIDTH / 2), Math.floor(WORLD_HEIGHT / 2));
oceanTile.elevation = -2.8;
oceanTile.shallowWater = 0;
var deepOcean = PS.render.surfaceImagery.getRgbAtLatLon(oceanTile.latitude, oceanTile.longitude);
oceanTile.elevation = -0.15;
oceanTile.shallowWater = 1;
oceanTile.coastFactor = 0.8;
var shelfOcean = PS.render.surfaceImagery.getRgbAtLatLon(oceanTile.latitude, oceanTile.longitude);

fillPlanetTiles("forest");
var forestTile = getPlanetTile(Math.floor(WORLD_WIDTH / 2), Math.floor(WORLD_HEIGHT / 2));
forestTile.moisture = 1.8;
forestTile.elevation = 0.2;
var forest = PS.render.surfaceImagery.getRgbAtLatLon(forestTile.latitude, forestTile.longitude);

fillPlanetTiles("desert");
var desertTile = getPlanetTile(Math.floor(WORLD_WIDTH / 2), Math.floor(WORLD_HEIGHT / 2));
desertTile.moisture = 0.1;
desertTile.elevation = 0.4;
var desert = PS.render.surfaceImagery.getRgbAtLatLon(desertTile.latitude, desertTile.longitude);

assert.ok(deepOcean.blue > deepOcean.red * 1.8, "deep ocean imagery should read blue, not gray");
assert.ok(rgbDistance(shelfOcean, deepOcean) > 24, "shallow shelves should separate visually from deep ocean");
assert.ok(forest.green > forest.red && forest.green > forest.blue, "forest imagery should read green");
assert.ok(desert.red > desert.blue * 1.35 && desert.green > desert.blue * 1.15, "desert imagery should read warm and dry");
[deepOcean, shelfOcean, forest, desert].forEach(function(rgb) {
  assertRgbBounds(rgb, "earthlike imagery");
});

PS.atlas.reset();
var oceanCell = PS.atlas.getTerrainCell("ocean", 5, 7, { biome: "ocean" });
var forestCell = PS.atlas.getTerrainCell("forest", 8, 11, { biome: "forest" });
var desertCell = PS.atlas.getTerrainCell("desert", 13, 17, { biome: "desert" });
var cliffCell = PS.atlas.getTerrainCell("mountain", 19, 23, { biome: "mountain" });

assert.ok(uniqueAtlasCellColorCount(oceanCell) >= 5, "ocean atlas cells should include wave/foam detail colors");
assert.ok(uniqueAtlasCellColorCount(forestCell) >= 5, "forest atlas cells should include canopy detail colors");
assert.ok(uniqueAtlasCellColorCount(desertCell) >= 5, "desert atlas cells should include dune detail colors");
assert.ok(uniqueAtlasCellColorCount(cliffCell) >= 5, "mountain atlas cells should include ridge detail colors");

var batchAddress = {
  sampleEast: 5,
  sampleNorth: 7,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: CONFIG.TILE_SIZE,
  chunkSamples: 2
};
var cellCache = [
  { sample: { biome: "ocean" }, screenX: 0, screenY: 0 },
  { sample: { biome: "forest" }, screenX: CONFIG.TILE_SIZE, screenY: 0 },
  { sample: { biome: "desert" }, screenX: 0, screenY: CONFIG.TILE_SIZE },
  { sample: { biome: "mountain" }, screenX: CONFIG.TILE_SIZE, screenY: CONFIG.TILE_SIZE }
];
var batches = PS.render.webgpuSurfaceTile.makeBatches(batchAddress, cellCache, 1);

assert.strictEqual(batches.count, 4, "WebGPU surface batching should include ready terrain cells");
assert.ok(Object.keys(batches.pages).length >= 1, "WebGPU surface batching should group instances by atlas page");
assert.strictEqual(batches.materialCounts[oceanCell.name] >= 1, true, "WebGPU surface batching should retain material identity");
assert.strictEqual(cellCache[0].terrainAtlasCell.name, oceanCell.name, "WebGPU batches should consume atlas cells instead of Canvas2D rasters");

console.log("planet zoom anchor WebGPU test passed");
`, context);
