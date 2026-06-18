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
const utilsSource = read("js/core/utils.js");
const worldGenSource = read("js/core/world-gen.js");
const mainSimulationSource = read("js/main-simulation.js");
const packageSource = read("package.json");
const goldenPath = path.join(root, "tests/golden/world-gen-seeds.json");
const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));

assert.strictEqual(worldGenSource.indexOf("export "), -1, "world-gen runtime should stay classic script-tag JavaScript");
assert.ok(JSON.parse(packageSource).scripts.test.includes("tests/world-gen-golden.test.js"), "npm test should include world-gen golden checks");

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
assert.ok(manifest.includes("js/core/world-gen.js"), "manifest should load world-gen");
assert.ok(manifest.indexOf("js/core/world-gen.js") > manifest.indexOf("js/core/prng.js"), "world-gen should load after PRNG");
assert.ok(manifest.indexOf("js/core/world-gen.js") < manifest.indexOf("js/main-simulation.js"), "world-gen should load before main simulation");
assert.ok(
  mainSimulationSource.includes("PS.core.worldGen.generateWorld(world.seedText, CONFIG);"),
  "seedWorld should call the staged world generation entry point"
);
assert.ok(!mainSimulationSource.includes("for (var foodIndex = 0; foodIndex < CONFIG.STARTING_FOOD; foodIndex++)"), "seedWorld should not inline food generation");

function createContext(width, height, seed) {
  const context = {
    PS: {
      core: {},
      math: {}
    },
    CONFIG: {
      DEFAULT_SEED: "PIXEL-2026",
      STARTING_ORGANISMS: 24,
      STARTING_FOOD: 420,
      TERRAIN_BARREN: 0,
      TERRAIN_FERTILE: 1
    },
    WORLD_WIDTH: width,
    WORLD_HEIGHT: height,
    world: {
      seedText: seed,
      prng: null,
      rngState: 1,
      organisms: [],
      food: [],
      terrain: [],
      planetTiles: [],
      fertileTiles: 0,
      nextLineageId: 1,
      generationStatus: "idle"
    },
    performance,
    Math,
    Number,
    String,
    Object,
    Array,
    BigInt,
    Uint32Array,
    Error
  };

  context.clearWorld = function() {
    context.world.tick = 0;
    context.world.organisms = [];
    context.world.food = [];
    context.world.terrain = [];
    context.world.planetTiles = [];
    context.world.fertileTiles = 0;
    context.world.nextLineageId = 1;
    context.setWorldSeed(context.world.seedText);
  };

  context.seedTerrain = function() {
    const biomes = ["ocean", "grassland", "forest", "desert", "tundra", "ice"];

    for (let y = 0; y < context.WORLD_HEIGHT; y++) {
      for (let x = 0; x < context.WORLD_WIDTH; x++) {
        const roll = context.randomUnit();
        const biome = biomes[Math.min(biomes.length - 1, Math.floor(roll * biomes.length))];
        const fertile = biome === "grassland" || biome === "forest";
        context.world.terrain.push(fertile ? context.CONFIG.TERRAIN_FERTILE : context.CONFIG.TERRAIN_BARREN);
        context.world.planetTiles.push({
          x,
          y,
          biome,
          elevation: context.randomUnit() * 2 - 1,
          moisture: context.randomUnit(),
          riverStrength: context.randomUnit() > 0.985 ? context.randomUnit() : 0
        });

        if (fertile) {
          context.world.fertileTiles++;
        }
      }
    }
  };

  context.randomFoodPosition = function() {
    return {
      x: context.randomInt(context.WORLD_WIDTH),
      y: context.randomInt(context.WORLD_HEIGHT)
    };
  };

  context.addFoodAt = function(x, y) {
    const food = {
      x,
      y
    };
    context.world.food.push(food);
    return food;
  };

  context.makeOrganism = function(x, y) {
    const id = context.world.nextLineageId++;
    return {
      x,
      y,
      lineageId: id,
      speciesId: id,
      typeId: "herbivore_basic"
    };
  };

  context.refreshLineageRegistry = function() {};
  vm.createContext(context);
  vm.runInContext(mathSource, context, { filename: "js/core/math.js" });
  vm.runInContext(prngSource, context, { filename: "js/core/prng.js" });
  vm.runInContext(utilsSource, context, { filename: "js/core/utils.js" });
  vm.runInContext(worldGenSource, context, { filename: "js/core/world-gen.js" });
  return context;
}

function normalizeSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

const actual = {};

golden.seeds.forEach(function(entry) {
  const firstContext = createContext(entry.width, entry.height, entry.seed);
  const secondContext = createContext(entry.width, entry.height, entry.seed);
  const firstWorld = firstContext.PS.core.worldGen.generateWorld(entry.seed, firstContext.CONFIG);
  const secondWorld = secondContext.PS.core.worldGen.generateWorld(entry.seed, secondContext.CONFIG);
  const firstSnapshot = normalizeSnapshot(firstContext.PS.core.worldGen.createGoldenSnapshot(firstWorld));
  const secondSnapshot = normalizeSnapshot(secondContext.PS.core.worldGen.createGoldenSnapshot(secondWorld));

  actual[entry.seed] = firstSnapshot;
  assert.deepStrictEqual(firstSnapshot, secondSnapshot, entry.seed + " should regenerate identically");
  assert.deepStrictEqual(firstSnapshot, entry.snapshot, entry.seed + " should match committed golden snapshot");
  assert.strictEqual(firstWorld.generationStatus, "promoted", entry.seed + " should promote generated data only after all stages are ready");
  assert.deepStrictEqual(
    firstWorld.generationStages.map(function(stage) { return stage.name; }),
    firstContext.PS.core.worldGen.stageOrder,
    entry.seed + " should run the documented stage order"
  );
  firstWorld.generationStages.forEach(function(stage) {
    assert.strictEqual(stage.readiness, "ready", entry.seed + " stage " + stage.name + " should be ready");
  });
});

console.log("world-gen golden checks passed", JSON.stringify(actual));
