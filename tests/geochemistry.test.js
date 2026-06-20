const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const wgslManagerSource = read("js/render/wgsl-shader-manager.js");
const harnessSource = read("js/sim/compute-harness.js");
const geochemistrySource = read("js/sim/geochemistry.js");
const atmosphereSource = read("js/layers/atmosphere.js");
const layerRegistrySource = read("js/layers/registry.js");
const observationSource = read("js/ui/observation-overlays.js");
const shaderSource = read("shaders/geochemistry.wgsl");
const shaderSidecar = read("shaders/geochemistry.wgsl.js");
const configSource = read("sim/configs/geochemistry.json");
const configSidecar = read("sim/configs/geochemistry.json.js");
const docs = read("docs/geochemistry-simulation.md");
const packageJson = JSON.parse(read("package.json"));

assert.ok(packageJson.scripts.test.includes("tests/geochemistry.test.js"), "npm test should include geochemistry checks");
assert.ok(manifestSource.indexOf("js/sim/geochemistry.js") > manifestSource.indexOf("js/sim/biome-lut.js"), "geochemistry should load after current Phase 2 sim modules");
assert.ok(manifestSource.indexOf("js/sim/geochemistry.js") < manifestSource.indexOf("js/layers/geology.js"), "geochemistry should load before always-on layers");
assert.ok(docs.includes("Agent Control"), "docs should document agent control");
assert.ok(docs.includes("debugOverlayRows"), "docs should document debug overlay rows");

[
  "@compute @workgroup_size(8, 8, 1)",
  "atmosphere_in: array<f32>",
  "ocean_chemistry: array<f32>",
  "soil_chemistry: array<f32>",
  "Photosynthesis",
  "silicate_weathering",
  "volcanic_emission",
  "ocean_ph_base",
  "update_geochemistry"
].forEach((required) => assert.ok(shaderSource.includes(required), "geochemistry WGSL should contain " + required));

assert.ok(shaderSidecar.includes("SHADER_SHADERS_GEOCHEMISTRY_WGSL"), "WGSL sidecar should expose global");
assert.ok(shaderSidecar.includes('PS.assets.registerText("shaders/geochemistry.wgsl"'), "WGSL sidecar should register text");
assert.ok(configSidecar.includes('PS.assets.registerJSON("sim/configs/geochemistry.json"'), "config sidecar should register JSON");

const config = JSON.parse(configSource);
assert.deepStrictEqual(config.species, ["CO2", "O2", "CH4", "H2O_vapor", "SO2", "N2"], "config should define the 6-species atmosphere grid");
assert.strictEqual(config.epoch_presets.hadean.co2_ppm, 100000, "Hadean preset should initialize high CO2");
assert.strictEqual(config.epoch_presets.civilization.o2_ppm, 209500, "civilization preset should initialize modern-ish O2");

const sidecarContext = {
  window: {},
  PS: {
    assets: {
      registerText(url, text) {
        this.textUrl = url;
        this.text = text;
      },
      registerJSON(url, json) {
        this.jsonUrl = url;
        this.json = json;
      }
    }
  }
};
sidecarContext.window.window = sidecarContext.window;
vm.createContext(sidecarContext);
vm.runInContext(shaderSidecar, sidecarContext, { filename: "shaders/geochemistry.wgsl.js" });
vm.runInContext(configSidecar, sidecarContext, { filename: "sim/configs/geochemistry.json.js" });
assert.strictEqual(sidecarContext.window.SHADER_SHADERS_GEOCHEMISTRY_WGSL, shaderSource, "WGSL sidecar should match raw shader");
assert.strictEqual(sidecarContext.PS.assets.json.species.length, 6, "JSON sidecar should register config");

const queueWrites = [];
const fakeDevice = {
  buffers: [],
  bindGroups: [],
  pipelines: [],
  modules: [],
  createBuffer(descriptor) {
    const buffer = { descriptor };
    this.buffers.push(buffer);
    return buffer;
  },
  createShaderModule(descriptor) {
    const module = { descriptor };
    this.modules.push(module);
    return module;
  },
  createComputePipeline(descriptor) {
    const pipeline = {
      descriptor,
      getBindGroupLayout(index) {
        return { index, pipeline: descriptor.label };
      }
    };
    this.pipelines.push(pipeline);
    return pipeline;
  },
  createBindGroup(descriptor) {
    const group = { descriptor };
    this.bindGroups.push(group);
    return group;
  }
};

const context = {
  window: {
    SHADER_SHADERS_GEOCHEMISTRY_WGSL: shaderSource,
    addEventListener() {}
  },
  PS: {
    assets: {},
    sim: {},
    render: {},
    ui: {},
    gpu: {
      device: fakeDevice,
      queue: {
        writeBuffer(buffer, offset, sourceBuffer, sourceOffset, byteLength) {
          queueWrites.push({ buffer, offset, sourceBuffer, sourceOffset, byteLength });
        }
      }
    }
  },
  world: {
    era: "hadean",
    atmosphere: {},
    geology: { volcanicActivity: 0 },
    organisms: [],
    activeObservationOverlay: "observation.atmosphere"
  },
  observationOverlayButtons: [],
  observationOverlayStatus: null,
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },
  CONFIG: {
    ATMOSPHERE_OZONE_O2_THRESHOLD: 0.12,
    ATMOSPHERE_ORGANISM_O2_REQUIREMENT: 0.16,
    ATMOSPHERE_ANOXIA_ENERGY_COST: 0.35,
    ATMOSPHERE_PHOTOSYNTHESIS_O2_RATE: 0.00008,
    ATMOSPHERE_OUTGASSING_RATE: 0.0005
  },
  Promise,
  Date,
  Object,
  String,
  Number,
  Math,
  Error,
  Array,
  Float32Array,
  Uint8Array,
  ArrayBuffer,
  DataView
};
context.window.window = context.window;
context.window.PS = context.PS;
vm.createContext(context);
vm.runInContext(wgslManagerSource, context, { filename: "js/render/wgsl-shader-manager.js" });
vm.runInContext(harnessSource, context, { filename: "js/sim/compute-harness.js" });
vm.runInContext(geochemistrySource, context, { filename: "js/sim/geochemistry.js" });

const geo = context.geochemistry;
geo.registerManifest();
assert.ok(context.PS.render.wgslShaderManifest.some((entry) => entry.name === "geochemistry"), "geochemistry should register WGSL manifest entry");

const hadean = geo.createState({ width: 4, height: 4, config, epoch: "hadean", volcanicValue: 0, vegetationValue: 0 });
const civilization = geo.createState({ width: 4, height: 4, config, epoch: "civilization", volcanicValue: 0, vegetationValue: 0 });
assert.strictEqual(hadean.atmosphere[geo.channels.co2], 100000, "epoch preset should seed Hadean CO2");
assert.strictEqual(civilization.atmosphere[geo.channels.o2], 209500, "epoch preset should seed civilization O2");
assert.strictEqual(hadean.atmosphere.length, 4 * 4 * config.atmosphere_stride, "atmosphere grid should allocate 6 species plus padding");
assert.strictEqual(hadean.ocean.length, 4 * 4 * config.ocean_stride, "ocean chemistry grid should allocate expected stride");
assert.strictEqual(hadean.soil.length, 4 * 4 * config.soil_stride, "soil chemistry grid should allocate expected stride");
assert.ok(geo.validateState(hadean).valid, "initial geochemistry state should be finite and non-negative");

const photosynthesisState = geo.createState({
  width: 4,
  height: 4,
  config,
  epoch: "civilization",
  volcanicValue: 0,
  vegetationValue: 1,
  oceanRatio: 0
});
const photosynthesisBefore = photosynthesisState.summary;
geo.stepCpu(photosynthesisState, { dt: 8 });
assert.ok(photosynthesisState.summary.o2Ppm > photosynthesisBefore.o2Ppm, "photosynthesis should raise O2");
assert.ok(photosynthesisState.summary.co2Ppm < photosynthesisBefore.co2Ppm, "photosynthesis should lower CO2");

const hotWeathering = geo.calculateWeatheringRate(35, 0.9, 1, 1000, config);
const coldWeathering = geo.calculateWeatheringRate(5, 0.9, 1, 1000, config);
assert.ok(hotWeathering > coldWeathering * 2, "silicate weathering should accelerate at high temperature");

const volcanicState = geo.createState({ width: 4, height: 4, config, epoch: "civilization", volcanicValue: 1, vegetationValue: 0, oceanRatio: 0 });
const volcanicBefore = volcanicState.summary;
geo.stepCpu(volcanicState, { dt: 2 });
assert.ok(volcanicState.summary.co2Ppm > volcanicBefore.co2Ppm, "volcanic emission should add CO2");
assert.ok(volcanicState.summary.so2Ppm > volcanicBefore.so2Ppm, "volcanic emission should add SO2");

assert.ok(geo.computeOceanPh(1000, config) < geo.computeOceanPh(280, config), "ocean pH should drop as CO2 rises");
const oceanState = geo.createState({ width: 4, height: 4, config, epoch: "civilization", volcanicValue: 0, vegetationValue: 0, oceanRatio: 1 });
const oceanPhBefore = oceanState.summary.oceanPh;
geo.applyAgentPatch(oceanState, { co2Ppm: 1200 });
geo.stepCpu(oceanState, { dt: 4 });
assert.ok(oceanState.summary.oceanPh < oceanPhBefore, "agent-raised CO2 should acidify ocean chemistry");
assert.ok(oceanState.summary.debugOverlayRows.some((row) => row.label === "Ocean pH"), "summary should publish debug overlay pH row");
assert.ok(context.world.geochemistry.co2Ppm > 0, "step should publish world geochemistry summary");
assert.strictEqual(context.world.atmosphere.carbonDioxidePpm, context.world.geochemistry.co2Ppm, "world atmosphere should expose CO2 ppm for dashboard");

const params = geo.makeParamsData(512, 512, config, 1);
const view = new DataView(params.buffer);
assert.strictEqual(params.byteLength, 64, "geochemistry params should be uniform aligned");
assert.strictEqual(view.getUint32(0, true), 512, "params should encode width");
assert.strictEqual(view.getUint32(8, true), config.atmosphere_stride, "params should encode atmosphere stride");
assert.ok(Math.abs(view.getFloat32(20, true) - config.photosynthesis_rate_ppm) < 1e-6, "params should encode photosynthesis rate");

context.PS.render.wgslShaders.register("geochemistry", shaderSource, { path: "shaders/geochemistry.wgsl" });
const initResult = geo.init({ width: 512, height: 512, config, epoch: "civilization" });
const harness = context.PS.sim.computeHarness;
assert.strictEqual(initResult.atmosphereBytes, 512 * 512 * config.atmosphere_stride * 4, "atmosphere buffers should allocate ppm grid");
assert.ok(harness.getState("geochemistry.atmosphere"), "geochemistry should register atmosphere ping-pong state");
assert.ok(harness.buffers["geochemistry.ocean"], "geochemistry should register ocean chemistry buffer");
assert.ok(harness.buffers["geochemistry.soil"], "geochemistry should register soil chemistry buffer");
assert.ok(harness.buffers["geochemistry.volcanicEmission"], "geochemistry should register volcanic CA handoff buffer");
assert.ok(harness.passes.geochemistry, "geochemistry should register compute pass");

vm.runInContext(layerRegistrySource, context, { filename: "js/layers/registry.js" });
vm.runInContext(atmosphereSource, context, { filename: "js/layers/atmosphere.js" });
context.layerRegistry.get("atmosphere").ensureState();
context.layerRegistry.get("atmosphere").update(1000);
assert.strictEqual(context.world.atmosphere.carbonDioxidePpm, geo.state.summary.co2Ppm, "atmosphere layer should surface geochemistry CO2 ppm when available");
assert.ok(Array.isArray(context.world.atmosphere.debugOverlayRows), "atmosphere layer should surface debug rows");

vm.runInContext(observationSource, context, { filename: "js/ui/observation-overlays.js" });
const sample = context.PS.render.observationOverlays.getOverlaySample("observation.atmosphere", 1, 1, {});
assert.ok(sample.alpha > 0, "atmosphere observation overlay should visualize geochemistry state");

console.log("geochemistry checks passed", JSON.stringify({
  co2Ppm: Number(geo.state.summary.co2Ppm.toFixed(2)),
  oceanPh: Number(geo.state.summary.oceanPh.toFixed(3)),
  weatheringPpm: Number(geo.state.summary.weatheringPpm.toFixed(4))
}));
