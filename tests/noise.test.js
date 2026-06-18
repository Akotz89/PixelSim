require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const namespaceSource = read("js/core/namespace.js");
const mathSource = read("js/core/math.js");
const prngSource = read("js/core/prng.js");
const noiseSource = read("js/core/noise.js");
const ranmapSource = read("js/render/ranmap.js");
const hydrologySource = read("js/render/terrain-hydrology.js");
const packageSource = read("package.json");

const namespaceContext = {
  window: {
    addEventListener: function() {}
  },
  Date
};
namespaceContext.window.window = namespaceContext.window;
vm.createContext(namespaceContext);
vm.runInContext(namespaceSource, namespaceContext, { filename: "js/core/namespace.js" });

const manifest = namespaceContext.window.PS.core.manifest;
assert.ok(manifest.includes("js/core/noise.js"), "manifest should load core noise");
assert.ok(
  manifest.indexOf("js/core/noise.js") > manifest.indexOf("js/core/math.js"),
  "core noise should load after math helpers"
);
assert.ok(
  manifest.indexOf("js/core/noise.js") > manifest.indexOf("js/core/prng.js"),
  "core noise should load after deterministic PRNG"
);
assert.ok(
  manifest.indexOf("js/core/noise.js") < manifest.indexOf("js/render/ranmap.js"),
  "core noise should load before ranmap"
);
assert.ok(JSON.parse(packageSource).scripts.test.includes("tests/noise.test.js"), "npm test should include noise checks");
assert.strictEqual(noiseSource.indexOf("export "), -1, "noise runtime should stay classic script-tag JavaScript");
assert.strictEqual(noiseSource.indexOf("getContext(\"2d\""), -1, "noise runtime must not use Canvas2D");

const context = {
  PS: {
    config: {
      constants: {
        DEFAULT_SEED: "PIXELDARIUM"
      }
    },
    core: {},
    math: {},
    render: {}
  },
  CONFIG: {},
  WORLD_WIDTH: 64,
  WORLD_HEIGHT: 32,
  performance,
  Uint8Array,
  Uint32Array,
  Math,
  Number,
  String,
  Object,
  Array,
  Error,
  console,
  clamp: function(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
};

vm.createContext(context);
vm.runInContext(mathSource, context, { filename: "js/core/math.js" });
vm.runInContext(prngSource, context, { filename: "js/core/prng.js" });
vm.runInContext(noiseSource, context, { filename: "js/core/noise.js" });
vm.runInContext(ranmapSource, context, { filename: "js/render/ranmap.js" });
vm.runInContext(hydrologySource, context, { filename: "js/render/terrain-hydrology.js" });

const noiseA = context.PS.core.createNoise2D("test");
const noiseB = context.PS.core.createNoise2D("test");
const noiseC = context.PS.core.createNoise2D("other");

assert.strictEqual(noiseA.perlin(5.25, 3.5), noiseB.perlin(5.25, 3.5), "perlin should be deterministic for the same seed");
assert.notStrictEqual(noiseA.perlin(5.25, 3.5), noiseC.perlin(5.25, 3.5), "perlin should vary by seed");
assert.ok(noiseA.perlin(5.25, 3.5) >= -1 && noiseA.perlin(5.25, 3.5) <= 1, "perlin should stay in [-1, 1]");
assert.ok(noiseA.simplex(5.25, 3.5) >= -1 && noiseA.simplex(5.25, 3.5) <= 1, "simplex should stay in [-1, 1]");
assert.ok(noiseA.worley(5.25, 3.5) >= 0 && noiseA.worley(5.25, 3.5) <= 1, "worley should stay in [0, 1]");
assert.ok(noiseA.normalize(noiseA.perlin(1.25, 2.5)) >= 0, "normalize should remap to [0, 1]");
assert.strictEqual(noiseA.threshold(0.7, 0.6), 1, "threshold should pass values above edge");
assert.strictEqual(noiseA.threshold(0.4, 0.6), 0, "threshold should reject values below edge");

const fbm = noiseA.fbm(0.33, 0.77, 6, 2, 0.5);
const ridged = noiseA.ridged(0.33, 0.77, 5);
const turbulence = noiseA.turbulence(0.33, 0.77, 5);
const warped = noiseA.warp(0.33, 0.77, noiseA.fbm.bind(noiseA), 0.5);

assert.ok(fbm >= -1 && fbm <= 1, "fbm should stay normalized around [-1, 1]");
assert.ok(ridged >= 0 && ridged <= 1, "ridged should stay in [0, 1]");
assert.ok(turbulence >= 0 && turbulence <= 1, "turbulence should stay in [0, 1]");
assert.notStrictEqual(warped.x, 0.33, "warp should move x domain");
assert.notStrictEqual(warped.y, 0.77, "warp should move y domain");
assert.ok(noiseA.continents(12, 8) >= 0 && noiseA.continents(12, 8) <= 1, "continents preset should stay bounded");
assert.ok(noiseA.mountains(12, 8) >= 0 && noiseA.mountains(12, 8) <= 1, "mountains preset should stay bounded");
assert.ok(noiseA.coastline(12, 8) >= 0 && noiseA.coastline(12, 8) <= 1, "coastline preset should stay bounded");
assert.ok(noiseA.rivers(12, 8) >= 0 && noiseA.rivers(12, 8) <= 1, "rivers preset should stay bounded");

const samples = [];
for (let y = 0; y < 24; y++) {
  for (let x = 0; x < 24; x++) {
    samples.push(noiseA.normalize(noiseA.fbm(x / 8, y / 8, 6, 2, 0.5)));
  }
}
const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
const variance = samples.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / samples.length;
assert.ok(mean > 0.36 && mean < 0.64, "fbm distribution mean should stay useful, got " + mean.toFixed(3));
assert.ok(variance > 0.002 && variance < 0.08, "fbm distribution variance should stay useful, got " + variance.toFixed(4));

const terrainA = vm.runInContext("getTerrainFractalNoise(12, 8, 16, 123, 6, 0.55)", context);
const terrainB = vm.runInContext("getTerrainFractalNoise(12, 8, 16, 123, 6, 0.55)", context);
const terrainC = vm.runInContext("getTerrainFractalNoise(13, 8, 16, 123, 6, 0.55)", context);
assert.strictEqual(terrainA, terrainB, "terrain bridge should be deterministic");
assert.ok(terrainA >= 0 && terrainA <= 1, "terrain bridge should stay in [0, 1]");
assert.notStrictEqual(terrainA, terrainC, "terrain bridge should vary across coordinates");

context.PS.ranmap.init(32, 16, 777);
const ranA = context.PS.ranmap.get(3, 4);
context.PS.ranmap.init(32, 16, 777);
const ranB = context.PS.ranmap.get(3, 4);
context.PS.ranmap.init(32, 16, 778);
const ranC = context.PS.ranmap.get(3, 4);
assert.strictEqual(ranA, ranB, "ranmap should remain deterministic for the same seed");
assert.notStrictEqual(ranA, ranC, "ranmap should vary by seed");
assert.ok(context.PS.ranmap.getStats().uniformityCheck.sampleSize > 0, "ranmap should still report stats");

const startedAt = performance.now();
for (let i = 0; i < 10000; i++) {
  noiseA.fbm((i % 100) / 17, Math.floor(i / 100) / 19, 6, 2, 0.5);
}
const elapsed = performance.now() - startedAt;
assert.ok(elapsed < 120, "10000 6-octave fbm samples should avoid pathological CPU cost, measured " + elapsed.toFixed(3) + "ms");

console.log("noise checks passed", JSON.stringify({
  mean: Number(mean.toFixed(3)),
  variance: Number(variance.toFixed(4)),
  fbm10000Ms: Number(elapsed.toFixed(3))
}));
