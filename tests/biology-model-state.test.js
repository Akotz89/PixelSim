const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  window: { addEventListener() {} },
  document: {
    getElementById() {
      return {
        getContext() {
          return {};
        },
        querySelector() {
          return {};
        }
      };
    },
    querySelectorAll() {
      return [];
    }
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/core/config.js",
  "js/ui/dom-refs.js",
  "js/systems/state.js",
  "js/core/utils.js",
  "js/core/trait-schema.js",
  "js/core/world-grid.js",
  "js/systems/pool-manager.js",
  "js/systems/pools.js",
  "js/sim/organisms-traits.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

function getRandomLatLonInTile(x, y) {
  return { latitude: y + 0.5, longitude: x + 0.5 };
}

function getWrappedWorldX(x) {
  return PS.worldGrid.getWrappedX(x);
}

function getClampedWorldY(y) {
  return PS.worldGrid.getClampedY(y);
}

PS.config.pools.maxOrganisms = 4;
PS.pools.reset();

assert.strictEqual(world.nextSpeciesId, 1, "species counter should start at one");
assert.strictEqual(world.nextBiologyPopulationId, 1, "population counter should start at one");
assert.strictEqual(world.nextBiologyRepresentativeId, 1, "representative counter should start at one");
assert.deepStrictEqual(world.biologyPopulations, [], "aggregate population container should exist");
assert.deepStrictEqual(world.biologyRepresentatives, [], "representative container should exist");
assert.strictEqual(PS.bio.TRAIT_BODY_SIZE, PS.core.traitSchema.getOffset("bodySize"), "body size offset should be globally readable");
assert.strictEqual(PS.bio.TRAIT_BODY_SHAPE, PS.core.traitSchema.getOffset("body_shape"), "snake-case trait aliases should resolve to canonical offsets");
assert.strictEqual(PS.bio.TRAIT_STRIDE, PS.core.traitSchema.getKeys().length, "trait stride should match schema key count");
assert.strictEqual(PS.config.evolution.mutationRates.vision, CONFIG.TRAIT_VISION_MUTATION_STEP, "evolution config should expose per-trait mutation rates");

var organism = makeOrganism(4, 5);
assert.strictEqual(organism.speciesId, organism.lineageId, "new organism should default species to lineage");
assert.strictEqual(organism.populationId, organism.lineageId, "new organism should default population to lineage");
assert.strictEqual(organism.representativeId, 1, "new organism should allocate representative id");
assert.strictEqual(world.nextBiologyRepresentativeId, 2, "representative counter should advance");

organism.speciesId = 12;
organism.populationId = 14;
organism.representativeId = 16;
organism.traits.bodySize = 1.75;
organism.traits.limbCount = 8;
organism.traits.camouflage = 0.9;
organism.traits = { body_size: 2.25, limb_count: 5, thermal_tolerance: 0.8 };
organism.traits.waterDependency = -1;
ensureOrganismLineage(organism);

assert.strictEqual(world.nextSpeciesId, 13, "species counter should advance past assigned species");
assert.strictEqual(world.nextBiologyPopulationId, 15, "population counter should advance past assigned population");
assert.strictEqual(world.nextBiologyRepresentativeId, 17, "representative counter should advance past assigned representative");
assert.strictEqual(PS.pools.organism.arrays.speciesId[organism.poolIndex], 12, "species id should be typed-array backed");
assert.strictEqual(PS.pools.organism.arrays.populationId[organism.poolIndex], 14, "population id should be typed-array backed");
assert.strictEqual(PS.pools.organism.arrays.representativeId[organism.poolIndex], 16, "representative id should be typed-array backed");
assert.strictEqual(PS.pools.organism.arrays.bodySize[organism.poolIndex], 2.25, "body size should be typed-array backed");
assert.strictEqual(PS.pools.organism.arrays.limbCount[organism.poolIndex], 5, "limb count should be typed-array backed");
assert.strictEqual(PS.pools.organism.arrays.traitBuffer[organism.poolIndex * PS.bio.TRAIT_STRIDE + PS.bio.TRAIT_BODY_SIZE], 2.25, "body size should write through packed trait buffer");
assert.ok(
  Math.abs(PS.pools.organism.arrays.traitBuffer[organism.poolIndex * PS.bio.TRAIT_STRIDE + PS.bio.TRAIT_CAMOUFLAGE] - 0.9) < 0.0001,
  "camouflage should write through packed trait buffer"
);
assert.ok(Math.abs(organism.traits.thermalTolerance - 0.8) < 0.0001, "snake-case thermal alias should assign canonical trait");
assert.strictEqual(organism.traits.waterDependency, CONFIG.TRAIT_WATER_DEPENDENCY_MIN, "trait facade should clamp lower bounds");
assert.ok(organism.traits.waterDependency >= 0, "new AZR-284 trait defaults should normalize");

chance = function() { return true; };
randomInt = function(max) { return Math.max(0, Math.round(Number(max) || 1) - 1); };
var inherited = inheritOrganismTraits({
  vision: CONFIG.TRAIT_VISION_DEFAULT,
  bodySize: 1,
  limbCount: 4,
  bodyShape: 0,
  appendageType: 0,
  camouflage: 0.5,
  thermalTolerance: 0.5,
  waterDependency: 0.5
});
assert.strictEqual(inherited.bodySize, 1 + CONFIG.TRAIT_BODY_SIZE_MUTATION_STEP, "continuous body traits should inherit with configured mutation steps");
assert.strictEqual(inherited.limbCount, 5, "discrete limb traits should inherit as bounded integers");
assert.strictEqual(inherited.bodyShape, 1, "discrete body-shape traits should inherit as bounded integers");
assert.strictEqual(inherited.appendageType, 1, "discrete appendage traits should inherit as bounded integers");
assert.ok(Math.abs(inherited.camouflage - 0.55) < 0.0001, "environment traits should inherit as bounded continuous values");
assert.ok(inherited.thermalTolerance <= CONFIG.TRAIT_THERMAL_TOLERANCE_MAX, "thermal inheritance should enforce upper bounds");

console.log("biology model state checks passed");
`, context);
