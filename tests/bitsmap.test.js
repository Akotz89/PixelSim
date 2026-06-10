const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const namespaceSource = fs.readFileSync(path.join(root, "js/core/namespace.js"), "utf8");
const bitsmapSource = fs.readFileSync(path.join(root, "js/core/bitsmap.js"), "utf8");

assert.ok(namespaceSource.indexOf("js/core/bitsmap.js") > namespaceSource.indexOf("js/core/world-grid.js"), "Bitsmap should load with core data structures");
assert.ok(namespaceSource.indexOf("js/core/bitsmap.js") < namespaceSource.indexOf("js/sim/vegetation.js"), "Bitsmap should load before tile systems consume it");

const context = {
  window: {},
  PS: { core: {} },
  Uint32Array,
  Array,
  Math,
  Number,
  RangeError
};

context.window.window = context.window;
context.window.PS = context.PS;
vm.createContext(context);
vm.runInContext(bitsmapSource, context, { filename: "js/core/bitsmap.js" });

const Bitsmap = context.PS.core.Bitsmap;

[1, 2, 4, 8, 16].forEach(function(bits) {
  const map = new Bitsmap(bits, 80);
  const max = (1 << bits) - 1;

  assert.ok(map.data instanceof Uint32Array, bits + "-bit map should use Uint32Array backing storage");
  assert.strictEqual(map.mask, max, bits + "-bit map should expose the expected value mask");
  assert.strictEqual(map.set(0, max), max, bits + "-bit first value should write max");
  assert.strictEqual(map.get(0), max, bits + "-bit first value should read max");
  assert.strictEqual(map.set(79, max + 100), max, bits + "-bit setter should clamp overflow values");
  assert.strictEqual(map.get(79), max, bits + "-bit last value should read clamped max");
});

const fourBitMillion = new Bitsmap(4, 1000000);
assert.strictEqual(fourBitMillion.data.byteLength, 500000, "4-bit x 1M tiles should use 500KB");

const cross = new Bitsmap(5, 16);
assert.strictEqual(cross.set(6, 17), 17, "value crossing a 32-bit word should write");
assert.strictEqual(cross.set(7, 29), 29, "following cross-word value should write independently");
assert.strictEqual(cross.get(6), 17, "cross-word value should read back");
assert.strictEqual(cross.get(7), 29, "neighboring cross-word value should remain intact");

const wide = new Bitsmap(16, 5);
assert.strictEqual(wide.set(1, 0xABCD), 0xABCD, "16-bit values should write without sign extension");
assert.strictEqual(wide.get(1), 0xABCD, "16-bit values should read without sign extension");
assert.strictEqual(wide.inc(1, 3), 0xABD0, "inc should add and write the clamped result");

wide.setAll(9);
for (let i = 0; i < wide.length; i += 1) {
  assert.strictEqual(wide.get(i), 9, "setAll should fill every entry");
}
assert.strictEqual(wide.clear().get(1), 0, "clear should zero the backing store");

const serialized = cross.serialize();
const restored = Bitsmap.deserialize(serialized);
assert.strictEqual(restored.bits, 5, "deserialize should preserve bit width");
assert.strictEqual(restored.length, 16, "deserialize should preserve length");
assert.strictEqual(restored.get(6), 17, "deserialize should preserve packed values");
assert.strictEqual(restored.get(7), 29, "deserialize should preserve neighboring packed values");

assert.throws(function() { new Bitsmap(0, 1); }, /between 1 and 16/, "zero-width maps should fail");
assert.throws(function() { new Bitsmap(17, 1); }, /between 1 and 16/, "over-wide maps should fail");
assert.throws(function() { cross.get(-1); }, /out of bounds/, "negative get should fail");
assert.throws(function() { cross.set(16, 1); }, /out of bounds/, "past-end set should fail");

console.log("bitsmap checks passed");
