const { assert, read } = require("./helpers/world-context.js");

const assertSource = read("js/core/assert.js");
const bitsmapSource = read("js/core/bitsmap.js");
const migratedAssertConsumers = [
  "js/core/events.js",
  "js/core/log.js",
  "js/systems/pool-manager.js",
  "js/render/wgsl-shader-manager.js"
];
const migratedBitsmapConsumers = [
  "js/render/environment-overlays.js",
  "js/sim/vegetation.js"
];

assert.ok(
  /export\s+\{\s*assertRuntime\s+as\s+assert\s*\}/.test(assertSource),
  "assert core should expose assert as a direct ES module export"
);
assert.strictEqual(
  assertSource.indexOf("namespace.js"),
  -1,
  "assert core should not import the PS namespace"
);
assert.strictEqual(
  assertSource.indexOf("PS.assert"),
  -1,
  "assert core should not register through PS.assert"
);

migratedAssertConsumers.forEach(function(file) {
  const source = read(file);

  assert.strictEqual(
    source.indexOf("PS.assert"),
    -1,
    file + " should import assert directly instead of using PS.assert"
  );
});

assert.ok(
  /export\s+function\s+Bitsmap\s*\(/.test(bitsmapSource),
  "Bitsmap core should expose Bitsmap as a direct ES module export"
);
assert.strictEqual(
  bitsmapSource.indexOf("namespace.js"),
  -1,
  "Bitsmap core should not import the PS namespace"
);
assert.strictEqual(
  bitsmapSource.indexOf("PS.core.Bitsmap"),
  -1,
  "Bitsmap core should not register through PS.core.Bitsmap"
);

migratedBitsmapConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { Bitsmap }") >= 0,
    file + " should import Bitsmap directly"
  );
  assert.strictEqual(
    source.indexOf("PS.core.Bitsmap"),
    -1,
    file + " should instantiate Bitsmap directly instead of using PS.core.Bitsmap"
  );
});

console.log("PS facade migration checks passed");
