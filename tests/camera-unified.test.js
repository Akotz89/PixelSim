const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

function makeElement() {
  return {
    width: 1600,
    height: 850,
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        width: 1600,
        height: 850
      };
    },
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
    }
  };
}

const context = {
  assert,
  console,
  window: {
    addEventListener() {}
  },
  document: {
    getElementById() {
      return makeElement();
    },
    createElement() {
      return makeElement();
    }
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/ui/dom-refs.js",
  "js/systems/state.js",
  "js/core/utils.js",
  "js/core/math.js",
  "js/core/world-grid.js",
  "js/core/planet-metrics.js",
  "js/render/camera-unified.js",
  "js/render/planet-view.js",
  "js/render/planet-surface.js",
  "js/render/planet-grid.js",
  "js/render/camera.js",
  "js/render/lod.js",
  "js/render/globe.js",
  "js/render/projection.js",
  "js/render/surface-address.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

function assertNear(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    label + " expected " + expected + " got " + actual
  );
}

world.planetTiles = [];
for (var y = 0; y < WORLD_HEIGHT; y++) {
  for (var x = 0; x < WORLD_WIDTH; x++) {
    world.planetTiles[getTileIndex(x, y)] = {
      x: x,
      y: y,
      latitude: getPlanetLatitudeForTile(y),
      longitude: getPlanetLongitudeForTile(x),
      biome: "temperate_forest"
    };
  }
}

CONFIG.PLANET_RENDER_MODE = "globe";
focusPlanetViewOnLatLon(0, 0);
setPlanetZoomLevel(3);

var camera = PS.camera.unified;
var state = camera.syncFromPlanetView();
assert.strictEqual(state.viewportW, canvas.width, "unified camera should expose viewport width");
assert.strictEqual(state.viewportH, canvas.height, "unified camera should expose viewport height");
assert.strictEqual(camera.getZoomBand(), "region", "zoom band should classify mid surface zoom");

var centerLatLon = camera.screenToLatLon(canvas.width / 2, canvas.height / 2);
assertNear(centerLatLon.latitude, getPlanetView().latitude, 0.000001, "center latitude");
assertNear(centerLatLon.longitude, getPlanetView().longitude, 0.000001, "center longitude");

var centerWorld = camera.screenToWorld(canvas.width / 2, canvas.height / 2);
var centerScreen = camera.worldToScreen(centerWorld.worldX, centerWorld.worldY);
assertNear(centerScreen.screenX, canvas.width / 2, 0.000001, "screen/world round trip x");
assertNear(centerScreen.screenY, canvas.height / 2, 0.000001, "screen/world round trip y");

var tileWorld = camera.tileToWorld(120, 84);
var tileScreen = camera.worldToScreen(tileWorld.worldX, tileWorld.worldY);
var clickedTile = camera.screenToTile(tileScreen.screenX, tileScreen.screenY);
assert.strictEqual(clickedTile.tileX, 120, "screenToTile should identify tile x through unified camera");
assert.strictEqual(clickedTile.tileY, 84, "screenToTile should identify tile y through unified camera");
assert.deepStrictEqual(getPlanetTileFromCanvasPoint(tileScreen.screenX, tileScreen.screenY), clickedTile, "legacy tile click wrapper should delegate to unified camera");

var shifted = camera.tileToScreenBitShift(137, 97, 120, 80, 5);
assert.strictEqual(shifted.zoomOutShift, 2, "integer zoom 5 should map to a power-of-two zoom-out shift");
assert.strictEqual(shifted.screenTileX, 4, "tile x transform should use right-shifted sample coordinates");
assert.strictEqual(shifted.screenTileY, 4, "tile y transform should use right-shifted sample coordinates");
assert.strictEqual(shifted.snappedTileX, 136, "non-aligned tile x should expose snapped bit-shift tile origin");
assert.strictEqual(shifted.snappedTileY, 96, "non-aligned tile y should expose snapped bit-shift tile origin");
assert.ok(shifted.coveredTileMinX <= 137 && shifted.coveredTileMaxX >= 137, "bit-shift tile x transform should expose the covered tile range");
assert.ok(shifted.coveredTileMinY <= 97 && shifted.coveredTileMaxY >= 97, "bit-shift tile y transform should expose the covered tile range");
var unshifted = camera.screenToTileBitShift(shifted.screenTileX, shifted.screenTileY, 120, 80, 5);
assert.strictEqual(unshifted.tileX, 136, "screen-to-tile x should invert to the left-shifted tile origin");
assert.strictEqual(unshifted.tileY, 96, "screen-to-tile y should invert to the left-shifted tile origin");
assert.strictEqual(unshifted.tileMaxX, 139, "screen-to-tile x should expose the covered power-of-two block");
assert.strictEqual(unshifted.tileMaxY, 99, "screen-to-tile y should expose the covered power-of-two block");

var visibleRect = camera.getVisibleTileRect();
var centerTile = camera.screenToTile(canvas.width / 2, canvas.height / 2);
assert.ok(visibleRect.minX <= centerTile.tileX && visibleRect.maxX >= centerTile.tileX, "visible rect should include center tile x");
assert.ok(visibleRect.minY <= centerTile.tileY && visibleRect.maxY >= centerTile.tileY, "visible rect should include center tile y");
assert.ok(visibleRect.minX >= 0 && visibleRect.maxX < WORLD_WIDTH, "visible rect x bounds should be clamped");
assert.ok(visibleRect.minY >= 0 && visibleRect.maxY < WORLD_HEIGHT, "visible rect y bounds should be clamped");
CONFIG.PLANET_CAMERA_PAN_ACCELERATION = 0.5;
CONFIG.PLANET_CAMERA_PAN_FRICTION = 0.5;
CONFIG.PLANET_CAMERA_PAN_MAX_SPEED = 10;
CONFIG.PLANET_CAMERA_PAN_INPUT_MAX_DELTA = 1000;
CONFIG.PLANET_CAMERA_ZOOM_ACCELERATION = 0.25;
CONFIG.PLANET_CAMERA_ZOOM_FRICTION = 0.5;
CONFIG.PLANET_CAMERA_ZOOM_MAX_SPEED = 0.5;
CONFIG.PLANET_CAMERA_ZOOM_INPUT_MAX_DELTA = 10;
PS.camera.stopInertia();
PS.camera.panScreen(1000, -1000);
assert.strictEqual(PS.camera.inertia.panVelocityX, 10, "camera pan velocity should clamp to configured max speed");
assert.strictEqual(PS.camera.inertia.panVelocityY, -10, "camera pan velocity should clamp per axis");
PS.camera.updateInertia();
assert.strictEqual(PS.camera.inertia.panVelocityX, 5, "camera pan velocity should decay through configured friction");
assert.strictEqual(PS.camera.inertia.panVelocityY, -5, "camera pan velocity should decay through configured friction");
PS.camera.adjustZoom(10);
assert.strictEqual(PS.camera.inertia.zoomVelocity, 0.5, "camera zoom velocity should clamp to configured max speed");
PS.camera.updateInertia();
assert.ok(PS.camera.inertia.zoomVelocity <= 0.25, "camera zoom velocity should decay through configured friction");

PS.camera.stopInertia();
focusPlanetViewOnLatLon(0, 0);
setPlanetZoomLevel(3);
CONFIG.PLANET_CAMERA_PAN_INPUT_MAX_DELTA = 24;
var clampedPanScale = PS.camera.getScale();
PS.camera.panScreen(1000, -1000);
var clampedPanMeters = Math.max(Math.abs(getPlanetView().panEastMeters), Math.abs(getPlanetView().panNorthMeters));
var maxImmediatePanMeters = 24 * clampedPanScale.metersPerSample / CONFIG.TILE_SIZE * 1.05;
assert.ok(
  clampedPanMeters <= maxImmediatePanMeters,
  "camera pan should clamp immediate oversized pointer deltas before moving, got " + clampedPanMeters + " > " + maxImmediatePanMeters
);
assert.strictEqual(PS.camera.inertia.panVelocityX, 10, "clamped oversized pointer delta should still respect velocity max speed");
assert.strictEqual(PS.camera.inertia.panVelocityY, -10, "clamped oversized pointer delta should still respect velocity max speed per axis");

PS.camera.stopInertia();
CONFIG.PLANET_CAMERA_ZOOM_INPUT_MAX_DELTA = 0.4;
PS.camera.adjustZoom(10);
assert.ok(
  Math.abs(PS.camera.inertia.zoomVelocity - 0.1) <= 0.000001,
  "camera zoom should clamp oversized wheel/gesture deltas before velocity injection"
);

setPlanetZoomLevel(0);
assert.strictEqual(camera.getZoomBand(), "orbit", "zoom band should classify orbit");
assert.strictEqual(camera.getVisibleTileRect().maxX, WORLD_WIDTH - 1, "orbit visible rect should conservatively include whole world");

console.log("camera unified checks passed");
`, context);
