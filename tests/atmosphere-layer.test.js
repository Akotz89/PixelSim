const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  window: {
    addEventListener() {}
  },
  world: {
    tick: 1,
    seedText: "AZR-291-ATMOSPHERE",
    era: "primordial",
    geology: {
      volcanicActivity: 0.8
    },
    organisms: [
      {
        energy: 10,
        traits: {}
      },
      {
        energy: 10,
        photosynthetic: true,
        population: 1200
      }
    ]
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/core/config.js",
  "js/core/assert.js",
  "js/core/math.js",
  "js/layers/registry.js",
  "js/layers/atmosphere.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

var manifest = PS.layers.getManifest();
assert.strictEqual(manifest[0].id, "atmosphere", "atmosphere should register in the layer manifest");
assert.strictEqual(manifest[0].alwaysOn, true, "atmosphere should be always-on");

var state = PS.layers.atmosphere.ensureState();
assert.ok(state.gases, "atmosphere should expose gas composition");
assert.ok(["co2", "o2", "n2", "ch4", "h2o", "o3", "sulfur"].every(function(gas) {
  return Number.isFinite(state.gases[gas]);
}), "tracked gas composition should include all AZR-291 gases plus sulfur");

var initialCo2 = state.gases.co2;
var initialSulfur = state.gases.sulfur;
var initialO2 = state.gases.o2;
var initialEnergy = world.organisms[0].energy;
var updated = PS.layers.updateAll(1000);

assert.deepStrictEqual(updated, ["atmosphere"], "layer registry should update atmosphere as an always-on layer");
assert.ok(state.volcanicOutgassing > 0, "volcanic outgassing should accumulate from geology");
assert.ok(state.gases.co2 > initialCo2 || state.gases.sulfur > initialSulfur, "volcanic outgassing should add CO2 or sulfur");
assert.ok(state.photosyntheticOxygen > 0, "photosynthetic organisms should add oxygen");
assert.ok(state.gases.o2 > initialO2, "oxygen should accumulate from photosynthesis");
assert.ok(Number.isFinite(state.greenhouseForcing), "greenhouse forcing should be calculated");
assert.ok(Number.isFinite(state.temperatureC), "greenhouse effect should update temperature");

state.gases.o2 = CONFIG.ATMOSPHERE_OZONE_O2_THRESHOLD + 0.05;
state.gases.o3 = 0;
PS.layers.atmosphere.update(1000);
assert.ok(state.gases.o3 > 0, "ozone should form when O2 exceeds threshold");

state.gases.o2 = 0.001;
world.organisms[0].energy = initialEnergy;
PS.layers.atmosphere.update(1000);
assert.ok(world.organisms[0].energy < initialEnergy, "low O2 atmosphere should reduce organism energy");
assert.ok(world.organisms[0].atmosphericOxygenStress > 0, "organisms should carry oxygen stress evidence");

console.log("atmosphere layer checks passed");
`, context);
