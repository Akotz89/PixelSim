require("./test-esm-helper.js");
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
  "js/render/surface-base.js",
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

assert.ok(setPlanetZoomLevelAtCanvasPoint(initialZoom + 1, cursorX, cursorY), "planet zoom should accept the next integer direct zoom");
assert.strictEqual(getPlanetView().zoomLevel, initialZoom + 1, "direct zoom should land on an integer power-of-two stop");

var localAfter = getPlanetLatLonFromCanvasPoint(cursorX, cursorY);
assertNear(localAfter.latitude, localBefore.latitude, 1e-9, "anchored local latitude");
assertNear(localAfter.longitude, localBefore.longitude, 1e-9, "anchored local longitude");
var integerScaleInfo = getPlanetCameraScaleInfo();
assert.strictEqual(integerScaleInfo.anchorLevel, initialZoom + 1, "integer zoom should retain a stable cache anchor level");
assert.strictEqual(integerScaleInfo.zoomOutShift, CONFIG.PLANET_ZOOM_LEVELS.length - 1 - (initialZoom + 1), "integer zoom should expose its bit-shift zoom-out level");
assert.strictEqual(integerScaleInfo.powerOfTwoScale, 1 << (initialZoom + 1), "integer zoom should expose a power-of-two scale");
PS.camera.setZoom(initialZoom);
assert.strictEqual(getPlanetCameraScaleInfo().metersPerSample, CONFIG.PLANET_ZOOM_LEVELS[initialZoom].metersPerSample, "integer zoom should preserve exact configured scale");
PS.camera.setZoom(initialZoom + 1);
var zoomTransitionStats = PS.camera.getZoomTransitionStats();
assert.strictEqual(zoomTransitionStats.lastZoomDirection, 1, "anchored zoom should record forward zoom direction");
assertNear(zoomTransitionStats.lastZoomFrom, initialZoom, 1e-12, "anchored zoom should record source zoom");
assert.strictEqual(zoomTransitionStats.lastZoomTo, initialZoom + 1, "anchored zoom should record integer target zoom");
assert.ok(zoomTransitionStats.lastZoomAnchorErrorDeg <= 1e-8, "anchored zoom should record negligible cursor drift");
assert.ok(zoomTransitionStats.lastZoomPreloadSurfaceLodIndex >= getPlanetSurfaceLodZoomIndex(initialZoom), "anchored zoom should record a forward preload LOD target");

world.planetView = {
  zoomLevel: 0,
  latitude: 12.5,
  longitude: -44.25,
  panEastMeters: 0,
  panNorthMeters: 0
};
PS.camera.stopInertia();
assert.ok(PS.camera.setZoomAtCanvasPoint(1, cursorX, cursorY), "globe wheel-style zoom should accept off-center cursor input");
assertNear(getPlanetView().latitude, 12.5, 1e-12, "globe zoom should not rotate latitude toward cursor");
assertNear(getPlanetView().longitude, -44.25, 1e-12, "globe zoom should not rotate longitude toward cursor");
assert.strictEqual(PS.camera.getZoomTransitionStats().lastZoomAnchorErrorDeg, 0, "globe zoom should report center-dolly mode, not cursor-anchor drift");

world.planetView = {
  zoomLevel: initialZoom,
  latitude: 34.2117,
  longitude: -77.7265,
  panEastMeters: 0,
  panNorthMeters: 0
};
PS.camera.stopInertia();
assert.ok(adjustPlanetZoomAtCanvasPoint(0.25, cursorX, cursorY), "anchored zoom input should queue camera inertia");
assert.ok(adjustPlanetZoomAtCanvasPoint(0.25, cursorX, cursorY), "second anchored zoom input should add to camera inertia");
assert.ok(adjustPlanetZoomAtCanvasPoint(0.25, cursorX, cursorY), "third anchored zoom input should add to camera inertia");
assertNear(getPlanetView().zoomLevel, initialZoom, 1e-12, "queued zoom should not snap before inertia update");
var queuedZoomVelocity = PS.camera.inertia.zoomVelocity;
assert.ok(queuedZoomVelocity > 0, "queued integer zoom should accelerate before the first step");
for (var inertiaZoomFrame = 0; inertiaZoomFrame < 10; inertiaZoomFrame++) {
  PS.camera.updateInertia();
}
assert.ok(getPlanetView().zoomLevel > initialZoom, "queued zoom inertia should advance smoothly over multiple frames");
assert.ok(getPlanetCameraScaleInfo().zoomFraction > 0, "queued zoom inertia should preserve fractional render interpolation between integer stops");
assert.ok(getPlanetView().zoomLevel <= CONFIG.PLANET_ZOOM_LEVELS.length - 1, "zoom inertia should stay inside the maximum zoom");
assert.ok(Math.abs(PS.camera.inertia.zoomVelocity) < Math.abs(queuedZoomVelocity), "zoom inertia should decelerate");

PS.camera.setZoom(CONFIG.PLANET_ZOOM_LEVELS.length - 1);
PS.camera.inertia.zoomVelocity = 4;
PS.camera.updateInertia();
assert.strictEqual(getPlanetView().zoomLevel, CONFIG.PLANET_ZOOM_LEVELS.length - 1, "zoom inertia should clamp at the maximum zoom");

world.planetView = {
  zoomLevel: initialZoom,
  latitude: 34.2117,
  longitude: -77.7265,
  panEastMeters: 0,
  panNorthMeters: 0
};
PS.camera.stopInertia();
var panLatitudeBefore = getPlanetView().latitude;
var panLongitudeBefore = getPlanetView().longitude;
assert.ok(panPlanetViewByScreenDelta(2, -1), "screen pan should apply immediately and seed camera inertia");
assert.ok(
  getPlanetView().latitude !== panLatitudeBefore || getPlanetView().longitude !== panLongitudeBefore,
  "screen pan should move the camera immediately"
);
var panInertiaFrames = 0;
for (var inertiaPanFrame = 0; inertiaPanFrame < 24; inertiaPanFrame++) {
  if (PS.camera.updateInertia()) {
    panInertiaFrames++;
  }
}
assert.ok(panInertiaFrames >= 5 && panInertiaFrames <= 15, "pan inertia should coast for 5-15 frames, got " + panInertiaFrames);
assert.strictEqual(PS.camera.updateInertia(), false, "pan inertia should eventually settle");

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
var groundScaleInfo = getPlanetCameraScaleInfo();
var groundScaleBar = PS.camera.getScaleBar(220);

assertNear(centerLatLon.latitude, world.planetView.latitude, 1e-9, "meter projection center latitude");
assertNear(centerLatLon.longitude, world.planetView.longitude, 1e-9, "meter projection center longitude");
assertNear(centerPoint.x, canvas.width / 2, 1e-6, "meter projection center x");
assertNear(centerPoint.y, canvas.height / 2, 1e-6, "meter projection center y");
assert.strictEqual(centerAddress.zoomLevel, finalGroundZoomIndex, "final zoom should select meter surface LOD");
assert.strictEqual(centerAddress.sampleMeters, 1, "final zoom should use one-meter samples");
assert.strictEqual(groundScaleInfo.metersPerSample, 1, "house scale should report one meter per surface sample");
assertNear(groundScaleInfo.footprintWidthKm, WORLD_WIDTH / 1000, 1e-12, "house scale should report viewport footprint width");
assertNear(groundScaleInfo.footprintHeightKm, WORLD_HEIGHT / 1000, 1e-12, "house scale should report viewport footprint height");
assert.ok(Number.isFinite(groundScaleInfo.approximateAltitudeKm) && groundScaleInfo.approximateAltitudeKm > 0, "house scale camera altitude should be finite");
assert.ok(groundScaleBar.distanceMeters > 0, "scale bar should choose a positive nice distance");
assert.ok(groundScaleBar.pixelWidth >= 80, "scale bar should remain readable at house scale");
assertNear(
  groundScaleBar.pixelWidth,
  groundScaleBar.distanceMeters / groundScaleInfo.metersPerCanvasPixel,
  1e-9,
  "scale bar pixel width should derive from meters per canvas pixel"
);

PS.render.surfaceRender.resetChunkCache();
var surfaceSampleA = PS.render.surface.getChunkSample(centerLatLon.latitude, centerLatLon.longitude);
var surfaceSampleB = PS.render.surface.getChunkSample(centerLatLon.latitude, centerLatLon.longitude);
var surfaceCacheStats = getPlanetSurfaceCacheStats();
assert.strictEqual(surfaceSampleA, surfaceSampleB, "same surface location and zoom should reuse the cached sample object");
assert.strictEqual(surfaceSampleA.surfaceChunkKey, centerAddress.chunkKey, "cached sample should preserve deterministic chunk key");
assert.strictEqual(surfaceSampleA.surfaceSampleMeters, 1, "cached house sample should preserve one-meter scale");
assert.ok(surfaceCacheStats.hits >= 1, "surface cache stats should record same-location hits");

var parentAddress = getPlanetSurfaceChunkParentAddress(centerAddress, finalGroundZoomIndex - 1);
var lineage = getPlanetSurfaceChunkLineage(centerAddress);
var parentSample = getPlanetSurfaceChunkSampleAtAddress(parentAddress, 0, 0);
assert.ok(parentAddress, "fine chunk should expose a parent address");
assert.strictEqual(parentAddress.zoomLevel, finalGroundZoomIndex - 1, "parent address should target the requested coarser LOD");
assert.ok(lineage.length >= finalGroundZoomIndex, "fine chunk should expose parent lineage across coarser LODs");
assert.ok(getPlanetSurfaceChunkLineageLabel(lineage).indexOf(parentAddress.scaleName) >= 0, "lineage label should include parent scale names");
assert.notStrictEqual(parentSample.surfaceChunkKey, surfaceSampleA.surfaceChunkKey, "parent and fine samples should keep separate LOD cache keys");
assert.strictEqual(parentSample.surfaceSampleMeters, parentAddress.sampleMeters, "addressed parent sample should use the parent LOD sample scale");
assert.strictEqual(parentSample.surfaceChunkKey, parentAddress.chunkKey, "addressed parent sample should stay keyed to the parent chunk");

var visibleChunks = getPlanetVisibleSurfaceChunks(1, 3);
assert.ok(visibleChunks.length > 0, "visible surface chunk enumeration should return chunks directly");
assert.ok(visibleChunks.length <= 3, "visible surface chunk enumeration should honor the working-set limit");
assert.ok(visibleChunks.totalCandidateChunks >= visibleChunks.length, "visible chunk stats should retain the uncropped candidate count");
if (visibleChunks.length > 1) {
  assert.ok(
    visibleChunks[0].priorityScore <= visibleChunks[1].priorityScore,
    "visible chunk enumeration should sort by priority"
  );
}

var renderChunkA = PS.render.surfaceRender.getChunk(centerAddress, true);
var renderChunkB = PS.render.surfaceRender.getChunk(centerAddress, true);
assert.ok(renderChunkA && renderChunkA.readyState === "ready", "render cache should generate a reusable ready chunk");
assert.strictEqual(renderChunkA, renderChunkB, "render cache should reuse ready chunks for the same address");
PS.render.surfaceRender.markDirty(centerAddress);
var renderChunkC = PS.render.surfaceRender.getChunk(centerAddress, true);
var renderStatsAfterDirty = PS.render.surfaceRender.getCacheStats();
assert.notStrictEqual(renderChunkC, renderChunkA, "dirty render chunk should regenerate on next request");
assert.ok(renderStatsAfterDirty.dirtyInvalidations >= 1, "render cache stats should record dirty invalidation");

var originalChunksPerPass = CONFIG.PLANET_SURFACE_RENDER_CHUNKS_PER_PASS;
var originalIdleChunksPerPass = CONFIG.PLANET_SURFACE_RENDER_IDLE_CHUNKS_PER_PASS;
var originalVisibleChunkLimit = CONFIG.PLANET_SURFACE_VISIBLE_CHUNK_LIMIT;
var originalChunkSamples = CONFIG.PLANET_SURFACE_CHUNK_SAMPLES;
var originalFallbackChunksPerPass = CONFIG.PLANET_SURFACE_RENDER_FALLBACK_CHUNKS_PER_PASS;
var originalRendererDrawTilemap = PS.render.renderer.drawTilemap;
var drawnTilemapPayload = null;
CONFIG.PLANET_SURFACE_CHUNK_SAMPLES = 1;
CONFIG.PLANET_SURFACE_RENDER_CHUNKS_PER_PASS = 1;
CONFIG.PLANET_SURFACE_RENDER_IDLE_CHUNKS_PER_PASS = 1;
CONFIG.PLANET_SURFACE_RENDER_FALLBACK_CHUNKS_PER_PASS = 2;
CONFIG.PLANET_SURFACE_VISIBLE_CHUNK_LIMIT = 6;
PS.render.surfaceRender.resetChunkCache();
PS.render.renderer.drawTilemap = function (payload) {
  drawnTilemapPayload = payload;
  return true;
};
assert.strictEqual(PS.render.terrain.drawLocalSurface(1), false, "progressive local surface draw should hold partial child chunks behind the stable underlay");
var progressiveRenderStats = PS.render.surfaceRender.getCacheStats();
assert.strictEqual(drawnTilemapPayload, null, "local terrain draw should not submit isolated child patches when visible coverage is incomplete");
assert.ok(progressiveRenderStats.lastVisibleChunks > 1, "progressive draw should enumerate multiple visible chunks");
assert.ok(progressiveRenderStats.lastGeneratedThisPass <= 1, "progressive draw should honor the per-pass generation budget");
assert.ok(
  progressiveRenderStats.lastPendingChunks > 0,
  "progressive draw should track pending visible chunks " + JSON.stringify(progressiveRenderStats)
);
assert.ok(progressiveRenderStats.lastReadyChunks > 0, "progressive draw should detect ready visible child chunks");
assert.ok(progressiveRenderStats.lastHiddenReadyChunks > 0, "progressive draw should hide ready children until visible coverage is complete");
assert.strictEqual(progressiveRenderStats.lastDrawnReadyChunks, 0, "partial child detail should not draw as an isolated square patch");
assert.strictEqual(progressiveRenderStats.lastVisibleCoverageComplete, false, "incomplete visible child coverage should be explicit");
assert.ok(progressiveRenderStats.lastCoveredByUnderlayChunks > 0, "stable underlay should cover hidden or pending child chunks");
assert.strictEqual(progressiveRenderStats.lastFallbackGeneratedThisPass, 0, "local tilemap draw should leave continuity to the stable underlay");
assert.strictEqual(world.needsRender, true, "pending chunks should schedule another render pass");
CONFIG.PLANET_SURFACE_RENDER_CHUNKS_PER_PASS = originalChunksPerPass;
CONFIG.PLANET_SURFACE_RENDER_IDLE_CHUNKS_PER_PASS = originalIdleChunksPerPass;
CONFIG.PLANET_SURFACE_VISIBLE_CHUNK_LIMIT = originalVisibleChunkLimit;
CONFIG.PLANET_SURFACE_CHUNK_SAMPLES = originalChunkSamples;
CONFIG.PLANET_SURFACE_RENDER_FALLBACK_CHUNKS_PER_PASS = originalFallbackChunksPerPass;
PS.render.renderer.drawTilemap = originalRendererDrawTilemap;

world.planetView.zoomLevel = 0;
var orbitScaleInfo = getPlanetCameraScaleInfo();
assert.ok(
  orbitScaleInfo.approximateAltitudeKm > groundScaleInfo.approximateAltitudeKm,
  "camera altitude should grow consistently from house scale to orbit scale"
);
world.planetView.zoomLevel = finalGroundZoomIndex;

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
