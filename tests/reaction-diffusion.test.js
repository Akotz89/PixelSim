const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const wgslManagerSource = read("js/render/wgsl-shader-manager.js");
const harnessSource = read("js/sim/compute-harness.js");
const source = read("js/sim/reaction-diffusion.js");
const shaderSource = read("shaders/reaction-diffusion.wgsl");
const shaderSidecar = read("shaders/reaction-diffusion.wgsl.js");
const configSource = read("sim/configs/reaction-diffusion.json");
const configSidecar = read("sim/configs/reaction-diffusion.json.js");

assert.ok(manifestSource.indexOf("js/sim/reaction-diffusion.js") > manifestSource.indexOf("js/sim/thermohaline.js"), "reaction diffusion should load after thermohaline simulation");
assert.ok(manifestSource.indexOf("js/sim/reaction-diffusion.js") < manifestSource.indexOf("js/sim/biome-lut.js"), "reaction diffusion should load before biome visualization bridge");

[
  "@compute @workgroup_size(8, 8, 1)",
  "chemical_in: array<vec4<f32>>",
  "chemical_out: array<vec4<f32>>",
  "fn laplacian_9",
  "params.diffusion_a",
  "params.diffusion_b",
  "params.feed",
  "params.kill",
  "local_f = params.feed * clamp(moisture[index]",
  "greenhouse_c",
  "clamp(next_a, 0.0, 1.0)",
  "clamp(next_b, 0.0, 1.0)"
].forEach((required) => assert.ok(shaderSource.includes(required), "reaction WGSL should contain " + required));

assert.ok(shaderSidecar.includes("SHADER_SHADERS_REACTION_DIFFUSION_WGSL"), "WGSL sidecar should expose the expected global");
assert.ok(shaderSidecar.includes('PS.assets.registerText("shaders/reaction-diffusion.wgsl"'), "WGSL sidecar should register text");
assert.ok(configSidecar.includes('PS.assets.registerJSON("sim/configs/reaction-diffusion.json"'), "config sidecar should register JSON");

const sidecarContext = {
  window: {},
  PS: {
    assets: {
      registerText(url, text) {
        this.url = url;
        this.text = text;
      }
    }
  }
};
sidecarContext.window.window = sidecarContext.window;
vm.createContext(sidecarContext);
vm.runInContext(shaderSidecar, sidecarContext, { filename: "shaders/reaction-diffusion.wgsl.js" });
assert.strictEqual(sidecarContext.window.SHADER_SHADERS_REACTION_DIFFUSION_WGSL, shaderSource, "WGSL sidecar should match raw shader");

const config = JSON.parse(configSource);
assert.strictEqual(config.target_tick_ms, 5, "reaction-diffusion config should encode 5ms/tick budget");
assert.deepStrictEqual(Object.keys(config.regimes).sort(), ["holes", "labyrinths", "spots", "stripes", "worms"], "config should define all Linear parameter regimes");
assert.strictEqual(config.regimes.spots.feed, 0.055, "spots feed should match Linear");
assert.strictEqual(config.regimes.spots.kill, 0.062, "spots kill should match Linear");
assert.strictEqual(config.regimes.labyrinths.feed, 0.035, "labyrinth feed should match Linear");
assert.strictEqual(config.regimes.labyrinths.kill, 0.065, "labyrinth kill should match Linear");
assert.deepStrictEqual(config.layers.map((layer) => layer.name), ["vegetation", "atmosphere", "soil"], "config should define multi-layer RD applications");

const queueWrites = [];
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
  window: { SHADER_SHADERS_REACTION_DIFFUSION_WGSL: shaderSource },
  PS: {
    assets: {},
    sim: {},
    render: {},
    gpu: {
      device: fakeDevice,
      queue: {
        writeBuffer(buffer, offset, sourceBuffer, sourceOffset, byteLength) {
          queueWrites.push({ buffer, offset, sourceBuffer, sourceOffset, byteLength });
        },
        submit(commandBuffers) {
          queueSubmits.push(commandBuffers);
        }
      }
    }
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
vm.createContext(context);
vm.runInContext(wgslManagerSource, context, { filename: "js/render/wgsl-shader-manager.js" });
vm.runInContext(harnessSource, context, { filename: "js/sim/compute-harness.js" });
vm.runInContext(source, context, { filename: "js/sim/reaction-diffusion.js" });

const rd = context.reactionDiffusion;
rd.registerManifest();
assert.ok(context.PS.render.wgslShaderManifest.some((entry) => entry.name === "reaction-diffusion" && entry.path === "shaders/reaction-diffusion.wgsl"), "reaction diffusion should register WGSL manifest entry");

const initial = rd.makeInitialChemicals(32, 32);
assert.strictEqual(initial.length, 32 * 32 * 4, "chemical field should use RGBA float cells");
assert.strictEqual(initial[0], 1, "chemical A should initialize as substrate");
assert.strictEqual(initial[1], 0, "chemical B should initialize absent outside seed");
assert.ok(rd.validateField(initial).valid, "initial chemical concentrations should be bounded and finite");

assert.strictEqual(rd.classifyPattern("spots"), "spots", "spots regime should produce spot diagnostic");
assert.strictEqual(rd.classifyPattern("labyrinths"), "labyrinths", "labyrinth regime should produce labyrinth diagnostic");
const spotField = rd.runValidationTicks("spots", 40, 32, 32, { config, layer: "atmosphere" });
const labyrinthField = rd.runValidationTicks("labyrinths", 40, 32, 32, { config, layer: "atmosphere" });
assert.ok(rd.validateField(spotField).valid, "spot field should remain bounded 0-1 and finite");
assert.ok(rd.validateField(labyrinthField).valid, "labyrinth field should remain bounded 0-1 and finite");
assert.notStrictEqual(rd.measureBMean(spotField, 32, 32).toFixed(5), rd.measureBMean(labyrinthField, 32, 32).toFixed(5), "different f/k regimes should produce distinct B concentration diagnostics");

const dryMoisture = rd.makeMoistureField(32, 32, { value: 0.2 });
const wetMoisture = rd.makeMoistureField(32, 32, { value: 0.9 });
const warm = rd.makeTemperatureField(32, 32, { value: 25 });
const dryVeg = rd.runValidationTicks("spots", 25, 32, 32, { config, layer: "vegetation", moisture: dryMoisture, temperature: warm });
const wetVeg = rd.runValidationTicks("spots", 25, 32, 32, { config, layer: "vegetation", moisture: wetMoisture, temperature: warm });
assert.ok(rd.validateField(dryVeg).valid && rd.validateField(wetVeg).valid, "vegetation modulation fields should remain bounded");
assert.ok(rd.vegetationGrowthPotential(0.9, 25, "spots", config) > rd.vegetationGrowthPotential(0.2, 25, "spots", config), "vegetation layer should grow more in high-moisture warm regions");

assert.ok(Math.abs(rd.greenhouseTemperatureDelta(380, config) - 1) < 1e-6, "CO2 +100ppm should raise equatorial temperature by about 1C");
const perf = rd.getPerformanceContract(512, 512, config);
assert.strictEqual(perf.targetTickMs, 5, "performance contract should target <5ms/tick");
assert.deepStrictEqual(Array.from(perf.expectedWorkgroups), [64, 64, 1], "512x512 reaction pass should use 64x64 workgroups");

const debugMap = rd.makeDebugMapRgba(spotField, 32, 32);
assert.strictEqual(debugMap.data.length, 32 * 32 * 4, "debug map should export RGBA bytes");
assert.strictEqual(debugMap.mimeType, "image/png", "debug map should be image-exportable");
assert.ok(debugMap.description.includes("Chemical B"), "debug map should identify chemical B vegetation density");

const params = rd.makeParamsData(512, 512, config, "spots", "vegetation", 380);
const paramsView = new DataView(params.buffer);
assert.strictEqual(params.byteLength, 48, "reaction params should be uniform aligned");
assert.strictEqual(paramsView.getUint32(0, true), 512, "params should encode width");
assert.strictEqual(paramsView.getUint32(4, true), 512, "params should encode height");
assert.ok(Math.abs(paramsView.getFloat32(16, true) - 0.055) < 1e-6, "params should encode feed rate");
assert.ok(Math.abs(paramsView.getFloat32(20, true) - 0.062) < 1e-6, "params should encode kill rate");
assert.strictEqual(paramsView.getUint32(28, true), 0, "vegetation layer kind should encode as 0");

context.PS.render.wgslShaders.register("reaction-diffusion", shaderSource, { path: "shaders/reaction-diffusion.wgsl" });
const result = rd.init({ width: 512, height: 512, config, regime: "spots", layer: "vegetation", co2Ppm: 380 });
const harness = context.computeHarness;
assert.strictEqual(result.chemicalBytes, 512 * 512 * 4 * 4, "reaction state should allocate rgba32float cells");
assert.ok(harness.getState("reaction-diffusion.chemicals"), "reaction diffusion should register chemical ping-pong state");
assert.ok(harness.buffers["reaction-diffusion.moisture"], "reaction diffusion should register moisture input");
assert.ok(harness.buffers["reaction-diffusion.temperature"], "reaction diffusion should register temperature input");
assert.ok(harness.buffers["reaction-diffusion.params"], "reaction diffusion should register params uniform");
assert.ok(harness.passes["reaction-diffusion"], "reaction diffusion should register compute pass");

const readBefore = harness.getReadBuffer("reaction-diffusion.chemicals").id;
rd.dispatch();
const computePass = fakeDevice.lastEncoder.passes[0];
assert.deepStrictEqual(computePass.workgroups, [64, 64, 1], "512x512 reaction pass should dispatch 8x8 workgroups");
assert.strictEqual(fakeDevice.bindGroups[0].descriptor.entries.length, 5, "reaction bind group should bind chemical ping-pong, moisture, temperature, and params");
assert.notStrictEqual(harness.getReadBuffer("reaction-diffusion.chemicals").id, readBefore, "reaction dispatch should swap chemical ping-pong buffers");
assert.strictEqual(queueSubmits.length, 1, "owned reaction dispatch should submit a command buffer");

console.log("reaction diffusion checks passed");
