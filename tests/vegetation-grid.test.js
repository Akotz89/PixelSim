require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const namespaceSource = fs.readFileSync(path.join(root, "js/core/namespace.js"), "utf8");
const bitsmapSource = fs.readFileSync(path.join(root, "js/core/bitsmap.js"), "utf8");
const vegetationSource = fs.readFileSync(path.join(root, "js/sim/vegetation.js"), "utf8");

assert.ok(
  namespaceSource.indexOf("js/sim/vegetation.js") > namespaceSource.indexOf("js/sim/food-runtime.js"),
  "vegetation grid should load with sim runtime modules"
);
assert.ok(
  namespaceSource.indexOf("js/sim/vegetation.js") < namespaceSource.indexOf("js/sim/tile-worker.js"),
  "vegetation grid should load before worker and growth systems can consume it"
);

const context = {
  window: {},
  PS: { core: {} },
  Uint8Array,
  Uint32Array,
  Math,
  Number,
  Object,
  WORLD_WIDTH: 5,
  WORLD_HEIGHT: 3
};

context.window.window = context.window;
vm.createContext(context);
vm.runInContext(bitsmapSource, context, { filename: "js/core/bitsmap.js" });
vm.runInContext(vegetationSource, context, { filename: "js/sim/vegetation.js" });

const vegetation = context.PS.vegetation;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.strictEqual(vegetation.TYPES.NONE, 0, "NONE should be zero for cleared cells");
assert.strictEqual(vegetation.TYPES.TREE_BIG, 3, "TREE_BIG enum should match the low-nibble layout");
assert.strictEqual(vegetation.TYPES.GRASS_TUFT, 8, "GRASS_TUFT enum should match the issue contract");

vegetation.init(5, 3);
assert.strictEqual(vegetation.width, 5, "init should store width");
assert.strictEqual(vegetation.height, 3, "init should store height");
assert.strictEqual(vegetation.data.length, 15, "grid should allocate one byte per tile");
assert.ok(vegetation.data instanceof Uint8Array, "grid should use a Uint8Array backing store");
assert.ok(vegetation.grassDensityMap instanceof context.PS.core.Bitsmap, "grass density should use the shared Bitsmap primitive");
assert.strictEqual(vegetation.grassDensityData.byteLength, 8, "grass density should allocate a packed 4-bit map");

assert.deepStrictEqual(plain(vegetation.get(1, 1)), { type: 0, variant: 0 }, "empty cells should read as NONE variant 0");
assert.deepStrictEqual(plain(vegetation.set(1, 1, vegetation.TYPES.TREE_MEDIUM, 12)), { type: 2, variant: 12 }, "set should round-trip type and variant");
assert.strictEqual(vegetation.data[6], (12 << 4) | 2, "packed byte should use high nibble variant and low nibble type");
assert.strictEqual(vegetation.getType(1, 1), vegetation.TYPES.TREE_MEDIUM, "getType should read only the low nibble");

vegetation.set(-1, 99, vegetation.TYPES.ROCK, 3);
assert.deepStrictEqual(plain(vegetation.get(4, 2)), { type: 7, variant: 3 }, "x should wrap and y should clamp");

vegetation.set(3, 0, 99, 99);
assert.deepStrictEqual(plain(vegetation.get(3, 0)), { type: 15, variant: 15 }, "set should clamp packed nibbles to 0-15");

assert.deepStrictEqual(plain(vegetation.clear(1, 1)), { type: 0, variant: 0 }, "clear should reset a cell to NONE");
assert.strictEqual(vegetation.data[6], 0, "clear should write zero into the backing store");
assert.strictEqual(vegetation.setGrassDensity(0, 0, 7), 7, "grass density setter should clamp and return the packed value");
assert.strictEqual(vegetation.setGrassDensity(1, 0, 15), 15, "grass density should support the high nibble");
assert.strictEqual(vegetation.grassDensityData[0] & 255, 247, "two grass density values should pack into the first byte");
assert.strictEqual(vegetation.getGrassDensity(0, 0), 7, "grass density low nibble should round-trip");
assert.strictEqual(vegetation.getGrassDensity(1, 0), 15, "grass density high nibble should round-trip");
assert.strictEqual(vegetation.setGrassDensity(1, 0, 99), 15, "grass density should clamp to 4-bit max");

vegetation.init(2, 2);
assert.strictEqual(vegetation.data.length, 4, "reinit should replace the backing store");
assert.strictEqual(vegetation.grassDensityData.byteLength, 4, "reinit should replace the packed grass density map");
assert.deepStrictEqual(plain(vegetation.get(1, 1)), { type: 0, variant: 0 }, "reinit should clear old vegetation data");

vegetation.grassDensityData = null;
assert.strictEqual(vegetation.getGrassDensity(1, 1), 0, "legacy vegetation grids should lazily allocate missing grass density maps");

console.log("vegetation grid checks passed");
