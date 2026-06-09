const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

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

var visibleRect = camera.getVisibleTileRect();
var centerTile = camera.screenToTile(canvas.width / 2, canvas.height / 2);
assert.ok(visibleRect.minX <= centerTile.tileX && visibleRect.maxX >= centerTile.tileX, "visible rect should include center tile x");
assert.ok(visibleRect.minY <= centerTile.tileY && visibleRect.maxY >= centerTile.tileY, "visible rect should include center tile y");
assert.ok(visibleRect.minX >= 0 && visibleRect.maxX < WORLD_WIDTH, "visible rect x bounds should be clamped");
assert.ok(visibleRect.minY >= 0 && visibleRect.maxY < WORLD_HEIGHT, "visible rect y bounds should be clamped");

setPlanetZoomLevel(0);
assert.strictEqual(camera.getZoomBand(), "orbit", "zoom band should classify orbit");
assert.strictEqual(camera.getVisibleTileRect().maxX, WORLD_WIDTH - 1, "orbit visible rect should conservatively include whole world");

console.log("camera unified checks passed");
`, context);
