const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

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
ensureOrganismLineage(organism);

assert.strictEqual(world.nextSpeciesId, 13, "species counter should advance past assigned species");
assert.strictEqual(world.nextBiologyPopulationId, 15, "population counter should advance past assigned population");
assert.strictEqual(world.nextBiologyRepresentativeId, 17, "representative counter should advance past assigned representative");
assert.strictEqual(PS.pools.organism.arrays.speciesId[organism.poolIndex], 12, "species id should be typed-array backed");
assert.strictEqual(PS.pools.organism.arrays.populationId[organism.poolIndex], 14, "population id should be typed-array backed");
assert.strictEqual(PS.pools.organism.arrays.representativeId[organism.poolIndex], 16, "representative id should be typed-array backed");
assert.strictEqual(PS.pools.organism.arrays.bodySize[organism.poolIndex], 1.75, "body size should be typed-array backed");
assert.strictEqual(PS.pools.organism.arrays.limbCount[organism.poolIndex], 8, "limb count should be typed-array backed");
assert.ok(organism.traits.waterDependency >= 0, "new AZR-284 trait defaults should normalize");

console.log("biology model state checks passed");
`, context);
