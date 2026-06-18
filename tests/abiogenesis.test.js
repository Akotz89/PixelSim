const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const emitted = [];
const context = {
  assert,
  console,
  window: {
    addEventListener() {}
  },
  WORLD_WIDTH: 96,
  WORLD_HEIGHT: 54,
  world: {
    tick: 0,
    era: "primordial",
    rngState: 12345,
    abiogenesis: null,
    microbialReady: false,
    biologyPopulations: [],
    nextBiologyPopulationId: 1,
    eventLog: [],
    timelineEvents: [],
    milestonesReached: {},
    geology: {
      hydrothermalVents: 24,
      volcanicActivity: 0.85
    },
    atmosphere: {
      gases: {
        co2: 0.72,
        o2: 0.001,
        n2: 0.22,
        ch4: 0.02,
        h2o: 0.018,
        o3: 0,
        sulfur: 0
      },
      oxygen: 0.001,
      ozone: 0,
      waterVapor: 0.018,
      temperatureC: 42
    }
  },
  PS: {},
  getPlanetTile(x, y) {
    return {
      x,
      y,
      latitude: (y / 54) * 180 - 90,
      longitude: (x / 96) * 360 - 180,
      biome: "wetland",
      elevation: 0.04,
      moisture: 1.2,
      shallowWater: 0.84,
      coastFactor: 0.86
    };
  }
};

vm.runInNewContext([
  read("js/core/namespace.js"),
  read("js/core/math.js"),
  read("js/core/assert.js"),
  read("js/core/event-types.js"),
  read("js/core/events.js"),
  read("js/epochs/registry.js"),
  read("js/epochs/primordial.js"),
  read("js/epochs/microbial.js")
].join("\n"), context);

context.PS.events.on(context.PS.eventTypes.EPOCH_TRANSITION, function(payload) {
  emitted.push(payload);
});

context.PS.epochs.setEra("primordial");

for (let i = 0; i < 80 && context.world.era === "primordial"; i++) {
  context.world.tick++;
  context.PS.epochs.updateCurrent(1000);
}

for (let i = 0; i < 300; i++) {
  context.world.tick++;
  context.PS.epochs.primordial.update(1000);
}

const state = context.world.abiogenesis;
const cell = context.PS.epochs.primordial.getCellForTile(48, 27);

assert.ok(state, "abiogenesis state should be created");
assert.ok(ArrayBuffer.isView(state.fields.complexity), "complexity field should use typed arrays");
assert.ok(ArrayBuffer.isView(state.fields.lightning), "lightning source field should use typed arrays");
assert.strictEqual(state.fields.complexity.length, state.fieldWidth * state.fieldHeight, "complexity field should cover chunks");
assert.strictEqual(state.fields.lightning.length, state.fields.complexity.length, "lightning source field should match chunks");
assert.strictEqual(state.fields.hydrothermal.length, state.fields.complexity.length, "hydrothermal source field should match chunks");
assert.strictEqual(state.fields.uv.length, state.fields.complexity.length, "UV source field should match chunks");
assert.strictEqual(state.fields.tidalPools.length, state.fields.complexity.length, "tidal pool source field should match chunks");
assert.ok(cell.complexity > 0, "chemical complexity should accumulate");
assert.ok(cell.soupIntensity > 0, "warm shallow water should render chemical soup");
assert.ok(state.sites.length > 1, "multiple independent abiogenesis sites should be possible");
assert.ok(state.protoOrganisms.length > 0, "threshold crossing should spawn proto-organism records");
assert.ok(context.world.biologyPopulations.length > 0, "proto-organisms should seed aggregate biology populations");
assert.strictEqual(context.world.microbialReady, true, "abiogenesis should make microbial transition ready");
assert.strictEqual(context.world.era, "microbial", "abiogenesis should transition to microbial epoch");
assert.strictEqual(emitted[0].from, "primordial", "transition event should include source epoch");
assert.strictEqual(emitted[0].to, "microbial", "transition event should include destination epoch");
assert.ok(context.world.timelineEvents.some(event => event.type === "abiogenesis.first-life"), "first life milestone should reach timeline");
assert.strictEqual(context.PS.epochs.primordial.detect(), true, "primordial detect should check complexity readiness");

console.log("abiogenesis checks passed");
