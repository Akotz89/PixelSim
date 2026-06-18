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

const bitsmapSource = read("js/core/bitsmap.js");
const vegetationSource = read("js/sim/vegetation.js");
const worldGenSource = read("js/core/world-gen.js");

function createContext(width, height) {
  const context = {
    PS: { core: {}, vegetation: null },
    WORLD_WIDTH: width,
    WORLD_HEIGHT: height,
    CONFIG: {
      DEFAULT_SEED: "VEGETATION-TEST",
      STARTING_FOOD: 3,
      STARTING_ORGANISMS: 0
    },
    world: {
      seedText: "VEGETATION-TEST",
      food: [],
      terrain: [],
      planetTiles: [],
      organisms: [],
      nextLineageId: 1,
      rngState: 1
    },
    performance,
    Math,
    Number,
    String,
    Object,
    Array,
    Uint8Array,
    Uint32Array
  };

  context.randomFoodPosition = function () {
    return { x: context.world.food.length % width, y: 0 };
  };
  context.addFoodAt = function (x, y) {
    context.world.food.push({ x, y });
  };

  vm.createContext(context);
  vm.runInContext(bitsmapSource, context, { filename: "js/core/bitsmap.js" });
  vm.runInContext(vegetationSource, context, { filename: "js/sim/vegetation.js" });
  vm.runInContext(worldGenSource, context, { filename: "js/core/world-gen.js" });
  return context;
}

function makeTiles(width, height, biome, options) {
  const tileOptions = options || {};
  const tiles = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push({
        x,
        y,
        biome,
        moisture: tileOptions.moisture == null ? 0.9 : tileOptions.moisture,
        elevation: tileOptions.elevation == null ? 0.2 : tileOptions.elevation,
        highlandLift: tileOptions.highlandLift || 0,
        riverStrength: tileOptions.riverStrength || 0
      });
    }
  }

  return tiles;
}

function countTypes(vegetation) {
  const counts = {};

  for (let i = 0; i < vegetation.data.length; i++) {
    const type = vegetation.data[i] & 15;
    counts[type] = (counts[type] || 0) + 1;
  }

  return counts;
}

function placedCount(stats) {
  return stats.total;
}

function ratio(count, total) {
  return count / Math.max(1, total);
}

const context = createContext(40, 30);
const vegetation = context.PS.vegetation;
const types = vegetation.TYPES;
const tileCount = 40 * 30;

const forestStats = vegetation.populateFromTerrain(makeTiles(40, 30, "forest", { moisture: 1.8 }), 40, 30);
const forestBytes = Array.from(vegetation.data);
const forestGrass = Array.from(vegetation.grassDensityData);
const forestCounts = countTypes(vegetation);
const forestStatsAgain = vegetation.populateFromTerrain(makeTiles(40, 30, "forest", { moisture: 1.8 }), 40, 30);

assert.deepStrictEqual(Array.from(vegetation.data), forestBytes, "forest placement should be deterministic for the same terrain and seed map");
assert.deepStrictEqual(Array.from(vegetation.grassDensityData), forestGrass, "grass density should be deterministic for the same terrain and seed map");
assert.strictEqual(forestStatsAgain.total, forestStats.total, "deterministic rerun should preserve placement counts");
assert.ok(forestStats.grassDensityTiles > 0, "forest placement should also populate the 4-bit grass density map");
assert.ok(forestStats.trees > forestStats.bushes, "forest placement should be dominated by trees");
assert.ok(ratio(forestStats.trees, tileCount) >= 0.70 && ratio(forestStats.trees, tileCount) <= 0.90, "forest should keep tree coverage in the requested 70-90 percent range");
assert.ok((forestCounts[types.TREE_BIG] || 0) > 0, "forest should try the SoS-style big tree pass before smaller trees");
assert.ok((forestCounts[types.TREE_MEDIUM] || 0) > 0, "forest should fall back to medium trees when big footprints do not fit");
assert.ok((forestCounts[types.TREE_SMALL] || 0) > 0, "forest should fall back to small trees when larger footprints do not fit");

const grassStats = vegetation.populateFromTerrain(makeTiles(40, 30, "grassland", { moisture: 1.1 }), 40, 30);
const grassCounts = countTypes(vegetation);
const moistGrassDensity = vegetation.getGrassDensity(10, 10);
const normalizedSignalDensity = vegetation.computeGrassDensityForTile(10, 10, {
  biome: "grassland",
  detail: { surface: "grass", materialSignals: { moisture: 0.8, vegetation: 0.9 } }
});
assert.ok(placedCount(grassStats) < placedCount(forestStats), "grassland should be sparser than forest");
assert.ok(grassStats.grassDensityTiles > grassStats.tufts, "grass density overlay should cover more tiles than discrete tufts");
assert.ok(normalizedSignalDensity >= 6, "normalized material moisture signals should not be divided as legacy 0-2.2 moisture");
assert.ok(ratio(grassStats.trees, tileCount) >= 0.05 && ratio(grassStats.trees, tileCount) <= 0.15, "grassland should keep tree coverage in the requested 5-15 percent range");
assert.ok((grassCounts[types.BUSH] || 0) > (grassCounts[types.TREE_BIG] || 0), "grassland should favor brush and ground features over large trees");
assert.ok((grassCounts[types.FLOWER] || 0) + (grassCounts[types.GRASS_TUFT] || 0) > 50, "grassland should place flowers and tufts");

const desertStats = vegetation.populateFromTerrain(makeTiles(40, 30, "desert", { moisture: 0.1, elevation: 0.35 }), 40, 30);
const desertCounts = countTypes(vegetation);
assert.ok(vegetation.getGrassDensity(10, 10) < moistGrassDensity, "dry desert tiles should have lower grass density than moist grassland");
assert.ok(placedCount(desertStats) < placedCount(grassStats), "desert should be sparse");
assert.ok(ratio(desertStats.trees, tileCount) >= 0.01 && ratio(desertStats.trees, tileCount) <= 0.03, "desert should keep dead-tree coverage near the requested 2 percent range");
assert.ok((desertCounts[types.ROCK] || 0) > 25, "desert should place rocks");
assert.ok((desertCounts[types.TREE_BIG] || 0) === 0, "desert should not place big living trees");

const wetlandStats = vegetation.populateFromTerrain(makeTiles(40, 30, "wetland", { moisture: 1.9, riverStrength: 0.6 }), 40, 30);
const wetlandCounts = countTypes(vegetation);
assert.ok(ratio(wetlandStats.trees, tileCount) >= 0.08 && ratio(wetlandStats.trees, tileCount) <= 0.12, "wetland should keep tree coverage near the requested 10 percent range");
assert.ok((wetlandCounts[types.GRASS_TUFT] || 0) > (wetlandCounts[types.TREE_SMALL] || 0), "wetland should favor reed/tuft vegetation");
assert.ok((wetlandCounts[types.MUSHROOM] || 0) > 25, "wetland should include mushrooms");

const mountainStats = vegetation.populateFromTerrain(makeTiles(40, 30, "mountain", { elevation: 0.85, highlandLift: 0.75 }), 40, 30);
const mountainCounts = countTypes(vegetation);
assert.ok(ratio(mountainStats.rocks, tileCount) >= 0.18 && ratio(mountainStats.rocks, tileCount) <= 0.22, "mountain should place rocks near the requested 20 percent range");
assert.ok(mountainStats.trees < mountainStats.rocks, "mountain trees should only appear at low altitude");

vegetation.init(5, 5);
vegetation.set(2, 3, types.TREE_BIG, 0);
const densityNorthOfTree = vegetation.computeGrassDensityForTile(2, 2, {
  biome: "grassland",
  detail: { surface: "grass", materialSignals: { moisture: 1, vegetation: 1 } }
});
vegetation.clear(2, 3);
const densityWithoutTree = vegetation.computeGrassDensityForTile(2, 2, {
  biome: "grassland",
  detail: { surface: "grass", materialSignals: { moisture: 1, vegetation: 1 } }
});
assert.ok(densityNorthOfTree < densityWithoutTree, "grass density should be penalized north of tree anchors under rendered canopy");

const stageContext = createContext(12, 8);
stageContext.world.planetTiles = makeTiles(12, 8, "forest", { moisture: 1.7 });
const metrics = stageContext.PS.core.worldGen.placeVegetation({ config: stageContext.CONFIG });
assert.strictEqual(metrics.food, 3, "world-gen vegetation stage should preserve existing food placement behavior");
assert.ok(metrics.vegetation.total > 0, "world-gen vegetation stage should populate the vegetation grid");
assert.strictEqual(stageContext.world.vegetation, stageContext.PS.vegetation.data, "world-gen should expose the generated vegetation grid on world");
assert.strictEqual(stageContext.world.vegetationGrass, stageContext.PS.vegetation.grassDensityData, "world-gen should expose the generated grass density grid on world");

console.log("vegetation placement checks passed");
