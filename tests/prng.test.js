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

function readRuntimeJsFiles(dir, output) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function(entry) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      readRuntimeJsFiles(fullPath, output);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      output.push(fullPath);
    }
  });
}

const namespaceSource = read("js/core/namespace.js");
const mathSource = read("js/core/math.js");
const prngSource = read("js/core/prng.js");
const utilsSource = read("js/core/utils.js");
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
assert.ok(manifest.includes("js/core/prng.js"), "manifest should load core PRNG");
assert.ok(manifest.indexOf("js/core/prng.js") > manifest.indexOf("js/core/math.js"), "PRNG should load after math hash helpers");
assert.ok(manifest.indexOf("js/core/prng.js") < manifest.indexOf("js/core/noise.js"), "PRNG should load before noise");
assert.ok(manifest.indexOf("js/core/prng.js") < manifest.indexOf("js/core/utils.js"), "PRNG should load before world random facades");
assert.ok(JSON.parse(packageSource).scripts.test.includes("tests/prng.test.js"), "npm test should include PRNG checks");
assert.strictEqual(prngSource.indexOf("export "), -1, "PRNG runtime should stay classic script-tag JavaScript");
assert.strictEqual(prngSource.indexOf("Math.random"), -1, "PRNG runtime should not call Math.random");

const runtimeFiles = [];
readRuntimeJsFiles(path.join(root, "js"), runtimeFiles);
runtimeFiles.forEach(function(file) {
  const source = fs.readFileSync(file, "utf8");
  assert.strictEqual(source.indexOf("Math.random"), -1, path.relative(root, file) + " should not use Math.random");
});

const context = {
  PS: {
    config: {
      constants: {
        DEFAULT_SEED: "PIXEL-2026"
      }
    },
    core: {},
    math: {}
  },
  CONFIG: {
    DEFAULT_SEED: "PIXEL-2026"
  },
  world: {
    seedText: "PIXEL-2026",
    prng: null,
    rngState: 1
  },
  Math,
  Number,
  String,
  Object,
  Array,
  BigInt,
  Uint32Array,
  Error
};

vm.createContext(context);
vm.runInContext(mathSource, context, { filename: "js/core/math.js" });
vm.runInContext(prngSource, context, { filename: "js/core/prng.js" });
vm.runInContext(utilsSource, context, { filename: "js/core/utils.js" });

const prngA = context.PS.core.createPRNG("test-seed-1");
const prngB = context.PS.core.createPRNG("test-seed-1");
const prngC = context.PS.core.createPRNG("test-seed-2");
const firstA = prngA.next();
const firstB = prngB.next();
const firstC = prngC.next();

assert.strictEqual(firstA, firstB, "same seed should produce the same first value");
assert.notStrictEqual(firstA, firstC, "different seeds should produce different first values");
assert.ok(firstA >= 0 && firstA < 1, "next should return [0, 1)");
assert.strictEqual(prngA.nextInt(2, 4) >= 2, true, "nextInt should honor min");
assert.strictEqual(prngA.nextInt(2, 4) <= 4, true, "nextInt should honor inclusive max");
assert.strictEqual(prngA.nextIndex(1), 0, "nextIndex should support single-item ranges");
assert.strictEqual(prngA.nextBool(1), true, "nextBool(1) should always pass");
assert.strictEqual(prngA.nextBool(0), false, "nextBool(0) should always fail");
assert.ok(["a", "b", "c"].includes(prngA.pick(["a", "b", "c"])), "pick should return an array element");

const shuffled = ["a", "b", "c", "d"];
const returnedShuffle = prngA.shuffle(shuffled);
assert.strictEqual(returnedShuffle, shuffled, "shuffle should operate in place");
assert.deepStrictEqual(shuffled.slice().sort(), ["a", "b", "c", "d"], "shuffle should preserve all items");

const forkParent = context.PS.core.createPRNG("fork-root");
const terrainFork = forkParent.fork("terrain");
const biomeFork = forkParent.fork("biomes");
assert.notStrictEqual(terrainFork.next(), biomeFork.next(), "different forks should produce different sequences");
assert.strictEqual(
  context.PS.core.createPRNG("fork-root").fork("terrain").next(),
  context.PS.core.createPRNG("fork-root").fork("terrain").next(),
  "same fork path should be deterministic"
);

vm.runInContext("setWorldSeed('WORLD-SEED-A')", context);
const globalSeqA = [
  vm.runInContext("randomUnit()", context),
  vm.runInContext("randomInt(100)", context),
  vm.runInContext("chance(0.5)", context)
];
vm.runInContext("setWorldSeed('WORLD-SEED-A')", context);
const globalSeqB = [
  vm.runInContext("randomUnit()", context),
  vm.runInContext("randomInt(100)", context),
  vm.runInContext("chance(0.5)", context)
];
assert.deepStrictEqual(globalSeqA, globalSeqB, "global random facades should remain deterministic by seed");
assert.ok(context.world.prng, "setWorldSeed should install a live world PRNG");
assert.ok(context.world.rngState > 0, "random facades should keep rngState compatibility updated");

const distribution = context.PS.core.createPRNG("chi-square-seed");
const buckets = new Array(10).fill(0);
const sampleCount = 1000000;
const startedAt = performance.now();

for (let i = 0; i < sampleCount; i++) {
  buckets[Math.min(9, Math.floor(distribution.next() * 10))]++;
}

const elapsed = performance.now() - startedAt;
const expected = sampleCount / buckets.length;
const chiSquared = buckets.reduce(function(sum, observed) {
  return sum + Math.pow(observed - expected, 2) / expected;
}, 0);

assert.ok(chiSquared < 30, "1M-sample chi-squared should stay under a loose uniformity threshold, got " + chiSquared.toFixed(3));

console.log("prng checks passed", JSON.stringify({
  first: Number(firstA.toFixed(8)),
  chiSquared: Number(chiSquared.toFixed(3)),
  millionNextMs: Number(elapsed.toFixed(3))
}));
