const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const iteratorSource = read("js/render/tile-iterator.js");
const packageSource = read("package.json");

assert.ok(manifestSource.indexOf("js/render/tile-iterator.js") > manifestSource.indexOf("js/render/ranmap.js"), "tile iterator should load after RANMAP");
assert.ok(JSON.parse(packageSource).scripts.test.includes("tests/render-iterator.test.js"), "npm test should include render iterator checks");
assert.strictEqual(iteratorSource.indexOf("new Uint8Array"), -1, "render iterator should not allocate per-tile buffers");
assert.strictEqual(iteratorSource.indexOf("Array.from"), -1, "render iterator should not allocate arrays while iterating");
assert.strictEqual(iteratorSource.indexOf("worldToScreen("), -1, "next should not call object-returning camera projection per tile");

const ranReads = [];
const context = {
  PS: {
    render: {},
    ranmap: {
      data: true,
      get(x, y) {
        ranReads.push(x + "," + y);
        return y * 1000 + x;
      }
    },
    camera: {
      unified: {
        getVisibleTileRect() {
          return { minX: 2, minY: 1, maxX: 4, maxY: 2 };
        },
        getState() {
          return { x: 64, y: 32, zoom: 2, viewportW: 160, viewportH: 96 };
        },
        worldToScreen: null
      }
    }
  },
  CONFIG: { TILE_SIZE: 16 },
  WORLD_WIDTH: 8,
  WORLD_HEIGHT: 5,
  Math,
  Number,
  Object
};

vm.createContext(context);
vm.runInContext(iteratorSource, context, { filename: "js/render/tile-iterator.js" });

const iterator = context.PS.render.onScreenTiles(1, 2, 1, 0);
assert.strictEqual(iterator, context.PS.tileIterator, "onScreenTiles should reuse the singleton cursor");
assert.strictEqual(iterator, context.PS.render.tileIterator, "render namespace should expose the same cursor");
assert.ok(iterator instanceof context.PS.render.RenderIterator, "cursor should be a RenderIterator");
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(iterator.getStats())),
  { viewportTiles: 18, range: { x: [1, 6], y: [0, 2] } },
  "pad parameters should expand the visible tile range and clamp y"
);

const firstReference = iterator;
let count = 0;
let firstRan = null;
let lastTile = null;
while (iterator.next()) {
  assert.strictEqual(iterator, firstReference, "next should mutate the existing cursor object");
  count += 1;
  if (count === 1) {
    firstRan = iterator.ran();
    assert.strictEqual(typeof iterator.has(), "boolean", "has should expose cursor activity without allocation");
    assert.strictEqual(iterator.tx, 1, "first tile x should include left pad");
    assert.strictEqual(iterator.ty, 0, "first tile y should include top pad and clamp to world");
    assert.strictEqual(iterator.tile(), 1, "tile index should use wrapped x and current y");
    assert.strictEqual(iterator.x(), -96, "screen x should be computed with scalar camera math");
    assert.strictEqual(iterator.y(), -64, "screen y should be computed with scalar camera math");
  }
  lastTile = iterator.tile();
}

assert.strictEqual(count, 18, "iterator should walk every visible tile without cursor replacement");
assert.strictEqual(firstRan, 1, "RANMAP value should be deterministic for the first tile");
assert.strictEqual(lastTile, 22, "last visited tile should be stable after row-major iteration");
assert.ok(ranReads.includes("1,0"), "iterator should read RANMAP by wrapped tile coordinates");

const manual = context.PS.tileIterator.begin(-16, 0, 1, 32, 16, 1, 0, 0, 0);
assert.strictEqual(manual, iterator, "begin should also reuse the singleton cursor");
assert.strictEqual(manual.next(), true, "manual begin should advance to a first tile");
assert.strictEqual(manual.tx < 0, true, "manual begin should preserve offscreen negative x for overscan");
assert.ok(manual.wrappedTx() >= 0 && manual.wrappedTx() < context.WORLD_WIDTH, "wrappedTx should map overscan x into world bounds");
assert.strictEqual(manual.ran(), context.PS.ranmap.get(manual.wrappedTx(), manual.ty), "ran() should expose the current deterministic tile random");

console.log("render iterator checks passed");
