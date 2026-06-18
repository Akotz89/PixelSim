const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  window: {
    addEventListener() {}
  },
  WORLD_WIDTH: 320,
  WORLD_HEIGHT: 170,
  world: {
    tick: 100,
    era: "microbial",
    rngState: 12345,
    microbialReady: false,
    geology: {
      hydrothermalVents: 18,
      volcanicActivity: 0.55
    },
    atmosphere: {
      gases: {
        co2: 0.72,
        o2: 0.001,
        n2: 0.24,
        ch4: 0.02,
        h2o: 0.008,
        o3: 0,
        sulfur: 0
      },
      oxygen: 0.001,
      temperatureC: 34
    }
  },
  PS: {}
};

vm.runInNewContext([
  read("js/core/namespace.js"),
  read("js/core/math.js"),
  read("js/epochs/registry.js"),
  read("js/epochs/microbial.js")
].join("\n"), context);

assert.ok(context.PS.epochs.get("microbial"), "microbial epoch should register");

const evaluation = context.PS.epochs.microbial.evaluatePrototypes();
assert.strictEqual(evaluation.agentBased.decision, "reject", "agent prototype should be evaluated and rejected");
assert.strictEqual(evaluation.fieldBased.decision, "candidate", "field prototype should be evaluated");
assert.strictEqual(evaluation.populationBased.decision, "candidate", "population prototype should be evaluated");
assert.strictEqual(evaluation.selected, "field-population-hybrid", "field/population hybrid should be selected");

context.PS.epochs.setEra("microbial");

for (let i = 0; i < 8; i++) {
  context.world.tick++;
  context.PS.epochs.updateCurrent(1000);
}

const state = context.world.microbial;
const cell = context.PS.epochs.microbial.getCellForTile(160, 85);

assert.strictEqual(state.model, "field-population-hybrid", "runtime should use selected hybrid model");
assert.ok(ArrayBuffer.isView(state.fields.density), "density field should use typed arrays");
assert.ok(ArrayBuffer.isView(state.fields.chemicalEnergy), "chemical energy field should use typed arrays");
assert.ok(ArrayBuffer.isView(state.fields.oxygenProduction), "oxygen field should use typed arrays");
assert.strictEqual(state.fields.density.length, state.fieldWidth * state.fieldHeight, "density field should cover grid");
assert.strictEqual(state.fields.chemicalEnergy.length, state.fields.density.length, "chemical energy field should match density grid");
assert.strictEqual(state.fields.oxygenProduction.length, state.fields.density.length, "oxygen field should match density grid");
assert.ok(state.totalDensity > 0, "microbial density should grow from chemical energy");
assert.ok(state.totalOxygenProduction > 0, "microbial fields should produce oxygen");
assert.ok(Array.isArray(state.populations), "notable blooms should be represented as population records");
assert.ok(state.populations.length > 0, "notable blooms should create visible populations");
assert.ok(state.visibleBlooms.length > 0, "visible bloom markers should be available for planet zoom");
assert.ok(cell.bloomIntensity >= 0, "tile lookup should expose bloom intensity");
assert.strictEqual(state.agents, undefined, "selected runtime should not create individual microbe agents");
assert.strictEqual(context.world.microbialReady, true, "microbial readiness flag should be set by field growth");
assert.ok(context.world.atmosphere.gases.o2 > 0.001, "microbial oxygen output should affect atmosphere");

console.log("microbial epoch checks passed");
