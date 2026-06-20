const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const wgslManagerSource = read("js/render/wgsl-shader-manager.js");
const harnessSource = read("js/sim/compute-harness.js");
const geochemistrySource = read("js/sim/geochemistry.js");
const leniaSource = read("js/sim/lenia.js");
const observationSource = read("js/ui/observation-overlays.js");
const shaderSource = read("shaders/lenia.wgsl");
const shaderSidecar = read("shaders/lenia.wgsl.js");
const configSource = read("sim/configs/lenia.json");
const configSidecar = read("sim/configs/lenia.json.js");
const docs = read("docs/lenia-ecosystem-simulation.md");
const packageJson = JSON.parse(read("package.json"));

assert.ok(packageJson.scripts.test.includes("tests/lenia.test.js"), "npm test should include Lenia checks");
assert.ok(manifestSource.indexOf("js/sim/lenia.js") > manifestSource.indexOf("js/sim/geochemistry.js"), "Lenia should load after physical and chemical Phase 2 sims");
assert.ok(manifestSource.indexOf("js/sim/lenia.js") < manifestSource.indexOf("js/layers/geology.js"), "Lenia should load before always-on layers");
assert.ok(docs.includes("Agent And Render Handoff"), "docs should cover agent and render handoff");

[
  "@compute @workgroup_size(8, 8, 1)",
  "species_in: array<vec4<f32>>",
  "species_out: array<vec4<f32>>",
  "fn convolve_species",
  "fn growth",
  "coral_ph_threshold",
  "carrying_capacity",
  "ocean_ph",
  "species_out[index] = next"
].forEach((required) => assert.ok(shaderSource.includes(required), "Lenia WGSL should contain " + required));

assert.ok(shaderSidecar.includes("SHADER_SHADERS_LENIA_WGSL"), "WGSL sidecar should expose global");
assert.ok(shaderSidecar.includes('PS.assets.registerText("shaders/lenia.wgsl"'), "WGSL sidecar should register text");
assert.ok(configSidecar.includes('PS.assets.registerJSON("sim/configs/lenia.json"'), "config sidecar should register JSON");

const config = JSON.parse(configSource);
assert.strictEqual(config.target_tick_ms, 5, "Lenia config should encode 5ms/tick budget");
assert.ok(config.species.length >= 3, "Lenia config should define at least three competing species");
assert.deepStrictEqual(config.species.map((species) => species.id), ["microbes", "vegetation", "coral", "lichen"], "Lenia species should have stable channel order");

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
vm.runInContext(shaderSidecar, sidecarContext, { filename: "shaders/lenia.wgsl.js" });
vm.runInContext(configSidecar, sidecarContext, { filename: "sim/configs/lenia.json.js" });
assert.strictEqual(sidecarContext.window.SHADER_SHADERS_LENIA_WGSL, shaderSource, "WGSL sidecar should match raw shader");
assert.strictEqual(sidecarContext.PS.assets.json.species.length, 4, "JSON sidecar should register species config");

const queueSubmits = [];
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
  },
  createCommandEncoder(descriptor) {
    const encoder = {
      descriptor,
      passes: [],
      beginComputePass(passDescriptor) {
        const pass = {
          descriptor: passDescriptor,
          bindGroups: [],
          setPipeline(pipeline) { this.pipeline = pipeline; },
          setBindGroup(index, group) { this.bindGroups[index] = group; },
          dispatchWorkgroups(x, y, z) { this.workgroups = [x, y, z]; },
          end() { this.ended = true; }
        };
        this.passes.push(pass);
        return pass;
      },
      finish() { return { encoder: this }; }
    };
    this.lastEncoder = encoder;
    return encoder;
  }
};

const context = {
  window: {
    SHADER_SHADERS_LENIA_WGSL: shaderSource
  },
  PS: {
    assets: {},
    sim: {},
    render: {},
    gpu: {
      device: fakeDevice,
      queue: {
        writeBuffer() {},
        submit(commandBuffers) {
          queueSubmits.push(commandBuffers);
        }
      }
    }
  },
  world: {
    activeObservationOverlay: "observation.microbial",
    needsRender: false
  },
  observationOverlayButtons: [],
  observationOverlayStatus: null,
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },
  setElementText() {},
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
vm.runInContext(leniaSource, context, { filename: "js/sim/lenia.js" });

const geochemistry = context.geochemistry;
const lenia = context.lenia;
lenia.registerManifest();
assert.ok(context.PS.render.wgslShaderManifest.some((entry) => entry.name === "lenia"), "Lenia should register WGSL manifest entry");

const initial = lenia.makeInitialSpeciesField(16, 16, { seed: 7 });
assert.strictEqual(initial.length, 16 * 16 * 4, "species field should allocate RGBA float channels");
const evolved = lenia.runValidationTicks(80, 16, 16, { config, initial });
const summary = lenia.summarizeSpecies(evolved, 16, 16, config);
assert.ok(summary.totalDensity > 0.01, "organism patterns should retain live density from random initial conditions");
assert.ok(summary.patternVariance > 0, "organism patterns should develop spatial variance");

const desertMoisture = lenia.makeScalarField(16, 16, 0.02);
const desertOcean = lenia.makeScalarField(16, 16, 0);
const warm = lenia.makeScalarField(16, 16, 25);
const desert = lenia.runValidationTicks(35, 16, 16, { config, moisture: desertMoisture, temperature: warm, oceanMask: desertOcean });
const wet = lenia.runValidationTicks(35, 16, 16, {
  config,
  moisture: lenia.makeScalarField(16, 16, 0.9),
  temperature: warm,
  oceanMask: desertOcean
});
assert.ok(lenia.summarizeSpecies(wet, 16, 16, config).species.vegetation > lenia.summarizeSpecies(desert, 16, 16, config).species.vegetation * 1.8, "habitat coupling should suppress desert vegetation");

const competition = lenia.runValidationTicks(50, 16, 16, { config });
const competitionSummary = lenia.summarizeSpecies(competition, 16, 16, config);
assert.ok(Object.keys(competitionSummary.species).filter((id) => competitionSummary.species[id] > 0.001).length >= 3, "3+ species should compete and occupy niches");

const baselineOceanPh = geochemistry.computeOceanPh(420);
const highCo2OceanPh = geochemistry.computeOceanPh(900);
assert.ok(baselineOceanPh > config.coral_ph_threshold, "baseline CO2 chemistry should leave coral pH above the kill threshold");
assert.ok(highCo2OceanPh < config.coral_ph_threshold, "high CO2 chemistry should drive ocean pH below the coral threshold");

const coralInitial = lenia.makeInitialSpeciesField(16, 16, { seed: 11 });
const baselineCoral = lenia.runValidationTicks(500, 16, 16, {
  config,
  initial: coralInitial,
  temperature: lenia.makeScalarField(16, 16, 26),
  moisture: lenia.makeScalarField(16, 16, 1),
  oceanMask: lenia.makeScalarField(16, 16, 1),
  oceanPh: lenia.makeScalarField(16, 16, baselineOceanPh),
  co2Ppm: 420
});
const acidicCoral = lenia.runValidationTicks(500, 16, 16, {
  config,
  initial: coralInitial,
  temperature: lenia.makeScalarField(16, 16, 26),
  moisture: lenia.makeScalarField(16, 16, 1),
  oceanMask: lenia.makeScalarField(16, 16, 1),
  oceanPh: lenia.makeScalarField(16, 16, highCo2OceanPh),
  co2Ppm: 900
});
const baselineCoralDensity = lenia.summarizeSpecies(baselineCoral, 16, 16, config).species.coral;
const acidicCoralDensity = lenia.summarizeSpecies(acidicCoral, 16, 16, config).species.coral;
assert.ok(acidicCoralDensity < baselineCoralDensity * 0.35, "geochemistry-derived low pH should causally collapse coral density within 500 ticks");

const exportMap = lenia.exportDistributionMap(evolved, 16, 16, config);
assert.strictEqual(exportMap.width, 16, "distribution export should encode width");
assert.strictEqual(exportMap.cells.length, 16 * 16, "distribution export should include every cell");
assert.ok(exportMap.species.includes("coral"), "distribution export should include species names");

const overlay = lenia.makeDensityOverlayRgba(evolved, 16, 16, config);
assert.strictEqual(overlay.data.length, 16 * 16 * 4, "density overlay should export RGBA bytes");
assert.ok(overlay.description.includes("Lenia organism density"), "density overlay should identify Lenia organism density");

const perf = lenia.getPerformanceContract(512, 512, config);
assert.strictEqual(perf.targetTickMs, 5, "performance contract should target <5ms/tick");
assert.deepStrictEqual(Array.from(perf.expectedWorkgroups), [64, 64, 1], "512x512 Lenia pass should use 64x64 workgroups");

const params = lenia.makeParamsData(512, 512, config);
const paramsView = new DataView(params.buffer);
assert.strictEqual(params.byteLength, 64, "Lenia params should be uniform aligned");
assert.strictEqual(paramsView.getUint32(0, true), 512, "params should encode width");
assert.strictEqual(paramsView.getUint32(4, true), 512, "params should encode height");
assert.strictEqual(paramsView.getUint32(28, true), 4, "params should encode species count");

context.PS.render.wgslShaders.register("lenia", shaderSource, { path: "shaders/lenia.wgsl" });
const initResult = lenia.init({ width: 512, height: 512, config });
const harness = context.PS.sim.computeHarness;
assert.strictEqual(initResult.speciesBytes, 512 * 512 * 4 * 4, "Lenia state should allocate rgba32float cells");
assert.ok(harness.getState("lenia.species"), "Lenia should register species ping-pong state");
assert.ok(harness.buffers["lenia.temperature"], "Lenia should register temperature input");
assert.ok(harness.buffers["lenia.moisture"], "Lenia should register moisture input");
assert.ok(harness.buffers["lenia.oceanMask"], "Lenia should register ocean-mask input");
assert.ok(harness.buffers["lenia.oceanPh"], "Lenia should register ocean pH input");
assert.ok(harness.buffers["lenia.params"], "Lenia should register params uniform");
assert.ok(harness.passes.lenia, "Lenia should register compute pass");

const readBefore = harness.getReadBuffer("lenia.species").id;
lenia.dispatch();
assert.deepStrictEqual(fakeDevice.lastEncoder.passes[0].workgroups, [64, 64, 1], "512x512 Lenia pass should dispatch 8x8 workgroups");
assert.strictEqual(fakeDevice.bindGroups[0].descriptor.entries.length, 8, "Lenia bind group should bind species ping-pong, physical fields, and params");
assert.notStrictEqual(harness.getReadBuffer("lenia.species").id, readBefore, "Lenia dispatch should swap species ping-pong buffers");
assert.strictEqual(queueSubmits.length, 1, "owned Lenia dispatch should submit a command buffer");

vm.runInContext(observationSource, context, { filename: "js/ui/observation-overlays.js" });
const microbialSample = context.PS.render.observationOverlays.getOverlaySample("observation.microbial", 16, 16, {});
assert.ok(microbialSample.alpha > 0, "microbial overlay should visualize Lenia density when state is available");

console.log("Lenia checks passed");
