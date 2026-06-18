const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const shadowSource = read("js/render/shadow-stamping.js");

assert.ok(
  namespaceSource.indexOf("js/render/shadow-stamping.js") < namespaceSource.indexOf("js/render/entities.js"),
  "shadow stamping should load before entity facades"
);
assert.ok(shadowSource.indexOf("heightLookup") >= 0, "shadow module should expose the precomputed height lookup");
assert.ok(shadowSource.indexOf("distance2Ground") >= 0, "shadow module should support floating-entity distance2Ground offsets");

const context = {
  PS: { render: {} },
  world: {
    tick: 0,
    sunDirection: { x: -1, y: 2, z: 3 }
  },
  Math,
  Number,
  Array,
  Object
};

vm.createContext(context);
vm.runInContext(shadowSource, context, { filename: "js/render/shadow-stamping.js" });

const shadows = context.PS.render.shadows;
assert.strictEqual(shadows.heightLookup.length, 32, "height lookup should cover heights 0-31");
assert.strictEqual(shadows.getHeightLookup(0).iterations, 0, "height 0 should not stamp a shadow");
assert.strictEqual(shadows.getHeightLookup(1).iterations, 1, "height 1 should stamp once");
assert.strictEqual(shadows.getHeightLookup(31).iterations, 8, "height 31 should clamp to bounded stamp count");
assert.strictEqual(shadows.getHeightLookup(-4).height, 0, "height lookup should clamp negative values to 0");
assert.strictEqual(shadows.getHeightLookup(99).height, 31, "height lookup should clamp high values to 31");
assert.strictEqual(shadows.getHeightLookup(NaN).height, 0, "height lookup should treat NaN as height 0");

const soft = shadows.makeStampedRects({
  x: 10,
  y: 20,
  width: 6,
  rectHeight: 3,
  heightUnits: 16,
  alpha: 0.5,
  mode: "soft",
  direction: { x: 2, y: 0 },
  color: [0.1, 0.2, 0.3]
});
const hard = shadows.makeStampedRects({
  x: 10,
  y: 20,
  width: 6,
  rectHeight: 3,
  heightUnits: 16,
  alpha: 0.5,
  mode: "hard",
  direction: { x: 2, y: 0 },
  color: [0.1, 0.2, 0.3]
});
const capped = shadows.makeStampedRects({
  x: 10,
  y: 20,
  width: 6,
  rectHeight: 3,
  heightUnits: 31,
  alpha: 0.5,
  maxIterations: 2,
  direction: { x: 2, y: 0 },
  color: [0.1, 0.2, 0.3]
});

assert.strictEqual(soft.length / 8, shadows.getHeightLookup(16).iterations, "rect count should match height lookup iterations");
assert.strictEqual(capped.length / 8, 2, "maxIterations should cap physical shadow stamp count for LOD budgets");
assert.ok(soft.every(Number.isFinite), "stamped shadow rect values should stay finite");
assert.ok(soft[0] > 10, "explicit shadow direction should offset stamp x");
assert.strictEqual(soft[1], 20, "horizontal explicit direction should not offset y");
assert.ok(soft[2] > 0 && soft[3] > 0, "stamped shadow rects should keep positive dimensions");
assert.ok(soft[7] >= 0 && soft[7] <= 1, "stamped shadow alpha should stay clamped");
assert.ok(soft[7] > soft[15], "opacity should decrease across stamped copies");
assert.ok(hard[7] > soft[7], "hard shadow mode should be stronger than soft mode");

const grounded = shadows.makeStampedRects({
  x: 4,
  y: 5,
  width: 2,
  rectHeight: 1,
  heightUnits: 4,
  alpha: 0.4,
  direction: { x: 1, y: 0 },
  distance2Ground: 0
});
const floating = shadows.makeStampedRects({
  x: 4,
  y: 5,
  width: 2,
  rectHeight: 1,
  heightUnits: 4,
  alpha: 0.4,
  direction: { x: 1, y: 0 },
  distance2Ground: 7
});

assert.ok(floating[0] - grounded[0] > 6.9, "distance2Ground should push floating shadows farther along the shadow vector");

const fromSun = shadows.makeStampedRects({
  x: 1,
  y: 1,
  width: 2,
  rectHeight: 1,
  heightUnits: 4,
  alpha: 0.3
});
assert.ok(fromSun[0] > 1 && fromSun[1] > 1, "world sunDirection should produce a shared normalized shadow vector");

console.log("shadow stamping checks passed");
