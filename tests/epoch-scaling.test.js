const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const epochRegistrySource = read("js/epochs/registry.js");
const epochStateSource = read("js/epochs/state-machine.js");
const heatSource = read("js/sim/heat-diffusion.js");
const biomeSource = read("js/sim/biome-lut.js");
const leniaSource = read("js/sim/lenia.js");
const couplingSource = read("js/sim/coupling.js");
const driverSource = read("js/sim/environment-drivers.js");
const configJsSource = read("config.js");
const coreConfigSource = read("js/core/config.js");
const timeSource = read("js/systems/time.js");
const configSource = read("sim/configs/epoch-configs.json");
const sidecarSource = read("sim/configs/epoch-configs.json.js");
const schema = JSON.parse(read("schemas/epoch-config.schema.json"));
const docs = read("docs/epoch-scaling.md");
const agentDocs = read("docs/agent-simulation-control.md");
const packageJson = JSON.parse(read("package.json"));

assert.ok(packageJson.scripts.test.includes("tests/epoch-scaling.test.js"), "npm test should include epoch scaling checks");
assert.ok(manifestSource.indexOf("js/epochs/state-machine.js") > manifestSource.indexOf("js/epochs/registry.js"), "epoch state machine should load after epoch registry");
assert.ok(manifestSource.indexOf("sim/configs/epoch-configs.json.js") < manifestSource.indexOf("js/epochs/state-machine.js"), "epoch config sidecar should load before epoch state machine");
assert.ok(manifestSource.indexOf("js/epochs/state-machine.js") < manifestSource.indexOf("js/epochs/primordial.js"), "epoch state machine should load before concrete epoch modules");
assert.ok(docs.includes("Transitions change upstream environmental state"), "docs should define epoch changes as causal inputs");
assert.ok(agentDocs.includes("Agents should treat those values as causes"), "agent docs should preserve no-downstream-tuning rule");
assert.ok(sidecarSource.includes('PS.assets.registerJSON("sim/configs/epoch-configs.json"'), "epoch sidecar should register JSON");
assert.strictEqual(schema.properties.epochs.minItems, 13, "epoch schema should require all 13 epochs");
assert.ok(schema.$defs.epoch.required.includes("atmosphere"), "epoch schema should require atmosphere state");
assert.ok(schema.$defs.epoch.required.includes("active_passes"), "epoch schema should require active pass state");

const sidecarContext = {
  PS: {
    assets: {
      jsonData: {},
      registerJSON(url, json) {
        this.jsonData[url] = json;
      }
    }
  }
};
vm.createContext(sidecarContext);
vm.runInContext(sidecarSource, sidecarContext, { filename: "sim/configs/epoch-configs.json.js" });
assert.strictEqual(JSON.stringify(sidecarContext.PS.assets.jsonData["sim/configs/epoch-configs.json"]), JSON.stringify(JSON.parse(configSource)), "epoch sidecar should match raw JSON");

const emitted = [];
const context = {
  PS: {
    assets: {
      jsonData: {},
      registerJSON(url, json) {
        this.jsonData[url] = json;
      }
    },
    config: { sim: {} },
    sim: {},
    render: {},
    events: {
      types: { EPOCH_TRANSITION: "epoch.transition" },
      emit(type, payload) {
        emitted.push({ type, payload });
      }
    }
  },
  world: { tick: 41, speed: 1, isPaused: false, deepTimeYears: 0 },
  Promise,
  Object,
  String,
  Number,
  Math,
  Error,
  Array,
  Date,
  Float32Array,
  Uint8Array,
  JSON
};
context.window = context;
vm.createContext(context);
vm.runInContext(configJsSource, context, { filename: "config.js" });
vm.runInContext(coreConfigSource, context, { filename: "js/core/config.js" });
vm.runInContext(epochRegistrySource, context, { filename: "js/epochs/registry.js" });
vm.runInContext(driverSource, context, { filename: "js/sim/environment-drivers.js" });
vm.runInContext(couplingSource, context, { filename: "js/sim/coupling.js" });
vm.runInContext(heatSource, context, { filename: "js/sim/heat-diffusion.js" });
vm.runInContext(biomeSource, context, { filename: "js/sim/biome-lut.js" });
vm.runInContext(leniaSource, context, { filename: "js/sim/lenia.js" });
vm.runInContext(sidecarSource, context, { filename: "sim/configs/epoch-configs.json.js" });
vm.runInContext(epochStateSource, context, { filename: "js/epochs/state-machine.js" });
vm.runInContext(timeSource, context, { filename: "js/systems/time.js" });

const epochs = context.PS.epochs;
const coupling = context.coupling;
const config = JSON.parse(configSource);
const greenhouseWrites = [];
context.heatDiffusion.state = { width: 2, height: 2 };
context.PS.sim.computeHarness = {
  buffers: { "heat.greenhouse": { id: "heat.greenhouse" } },
  writeBuffer(id, data) {
    greenhouseWrites.push({ id, data: Array.from(data) });
    return this.buffers[id];
  }
};

const report = epochs.validateEpochConfig(config);
assert.strictEqual(report.valid, true, "all 13 epoch configs should validate");
assert.strictEqual(report.count, 13, "epoch config should contain exactly 13 epochs");
assert.strictEqual(epochs.getEpochState().id, 0, "getEpochState should resolve manifest-loaded epoch config without test injection");

const hadean = epochs.setEpoch(0, { pipeline: coupling });
assert.strictEqual(hadean.id, 0, "setEpoch(0) should enter Hadean");
assert.ok(!hadean.activePasses.includes("lbm-ocean"), "Hadean should not run ocean pass before oceans exist");
assert.ok(hadean.activePasses.includes("heat-diffusion"), "Hadean should still run heat diffusion");
assert.strictEqual(context.world.atmosphere.carbonDioxidePpm, 100000, "Hadean CO2 should load into world atmosphere");
assert.ok(context.world.atmosphere.greenhouseForcing > 0, "high CO2 should immediately affect greenhouse forcing");
assert.strictEqual(context.heatDiffusion.greenhouseForcing, context.world.atmosphere.greenhouseForcing, "epoch transition should update heat greenhouse forcing input");
assert.ok(greenhouseWrites[greenhouseWrites.length - 1].data.every((value) => Math.abs(value - context.world.atmosphere.greenhouseForcing) < 0.0001), "epoch transition should write greenhouse forcing into heat buffer");
assert.strictEqual(coupling.ticksPerYear, 1000000, "Hadean timescale should be one million years per tick");
assert.strictEqual(context.PS.time.updateAdaptiveTimeScale(true).targetYearsPerTick, 1000000, "time system should use Hadean epoch years per tick");

const archean = epochs.setEpoch(1, { pipeline: coupling });
assert.strictEqual(archean.id, 1, "setEpoch(1) should transition to Archean");
assert.ok(archean.activePasses.includes("lbm-ocean"), "Archean should enable ocean pass");
assert.ok(archean.atmosphere.co2Ppm < hadean.atmosphere.co2Ppm, "Archean atmosphere should causally reduce CO2");
const archeanCo2 = context.world.atmosphere.carbonDioxidePpm;
const writesBeforeQueuedTransition = greenhouseWrites.length;
context.world.epochAtmospherePhase = "updating";
const queuedEpoch = epochs.setEpoch(2, { pipeline: coupling });
assert.strictEqual(queuedEpoch.id, 2, "epoch transition during atmosphere update should still advance epoch state");
assert.strictEqual(context.world.atmosphere.carbonDioxidePpm, archeanCo2, "epoch transition should not mutate atmosphere mid-update");
assert.strictEqual(greenhouseWrites.length, writesBeforeQueuedTransition, "queued epoch atmosphere should not write heat forcing mid-update");
assert.strictEqual(context.world.pendingEpochAtmosphere.id, 2, "queued epoch atmosphere should be recorded for tick-boundary flush");
context.world.epochAtmospherePhase = "idle";
epochs.flushPendingEpochAtmosphere();
assert.strictEqual(context.world.atmosphere.carbonDioxidePpm, queuedEpoch.atmosphere.co2Ppm, "queued epoch atmosphere should apply after atmosphere update exits");
assert.ok(greenhouseWrites.length > writesBeforeQueuedTransition, "queued epoch atmosphere should write heat forcing when flushed");
assert.strictEqual(coupling.validatePassOrder().actual.join(","), [
  "heat-diffusion",
  "lbm-ocean",
  "thermohaline",
  "moisture",
  "geochemistry",
  "reaction-diffusion",
  "pixel-ca",
  "lenia",
  "biome-lut"
].join(","), "active pass overlay should not mutate canonical pass order");
assert.ok(emitted.some((entry) => entry.type === "epoch.transition" && entry.payload.to === 1), "epoch transition event should emit");

const epoch6 = epochs.setEpoch(6, { pipeline: coupling });
assert.strictEqual(epoch6.ticksPerYear, 1, "epoch 6 should run at one year per tick");
assert.strictEqual(coupling.ticksPerYear, 1, "pipeline timescale should follow epoch 6");
assert.strictEqual(context.PS.time.updateAdaptiveTimeScale(true).targetYearsPerTick, 1, "time system should use epoch 6 years per tick");

context.biomeLut.state.stable = false;
const epoch3 = epochs.setEpoch(3, { pipeline: coupling });
assert.ok(epoch3.activePasses.includes("lenia"), "epoch 3 should enable Lenia");
assert.ok(epoch3.life.lenia_species.includes("vegetation"), "epoch 3 should spawn plant-like Lenia species after biome stabilization");
assert.strictEqual(epoch3.life.spawn_after, "biome-stable", "epoch 3 spawn gate should wait for biome stability");
assert.strictEqual(context.lenia.state.spawnedEpochSpecies, undefined, "epoch 3 Lenia species should not spawn before biome stability");
assert.strictEqual(context.lenia.state.pendingEpochSpawn.gate, "biome-stable", "epoch 3 should record pending Lenia spawn gate");
context.biomeLut.state.stable = true;
epochs.updateEpochGates();
assert.ok(context.lenia.state.activeEpochSpecies.includes("vegetation"), "Lenia vegetation should spawn after biome stability gate opens");

const epoch5 = epochs.setEpoch(5, { pipeline: coupling });
assert.strictEqual(context.biomeLut.state.epochPaletteId, "cenozoic", "epoch transition should swap biome LUT palette id");
assert.deepStrictEqual(context.biomeLut.state.epochPalette, epoch5.palette, "epoch transition should copy palette colors");
assert.ok(context.biomeLut.state.currentLut && context.biomeLut.state.currentLut.data.length > 0, "epoch transition should regenerate active biome LUT data");
assert.strictEqual(context.biomeLut.makeLutRgba(2, 2).data.length, 16, "biome LUT generation should consume active epoch palette by default");

const snapshot = epochs.getEpochState();
snapshot.activePasses.length = 0;
assert.ok(epochs.getEpochState().activePasses.length > 0, "getEpochState should return immutable snapshots");

const canonicalBefore = coupling.validatePassOrder().actual.join(",");
const disabledRecord = coupling.dispatchPassSlot(coupling.passOrder[1], { activePassIds: ["heat-diffusion"], strict: false });
assert.strictEqual(disabledRecord.disabled, true, "inactive pass should produce disabled timing record");
assert.strictEqual(disabledRecord.dispatchIds.length, 0, "disabled pass should not dispatch compute work");
assert.strictEqual(coupling.validatePassOrder().actual.join(","), canonicalBefore, "disabled pass overlay should preserve canonical order");

console.log("epoch scaling checks passed");
