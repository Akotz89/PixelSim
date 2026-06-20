const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const wgslManagerSource = read("js/render/wgsl-shader-manager.js");
const harnessSource = read("js/sim/compute-harness.js");
const gpuSimRuntimeSource = read("js/sim/gpu-sim-runtime.js");
const oceanSource = read("js/sim/lbm-ocean.js");
const shaderSource = read("shaders/lbm-ocean.wgsl");
const shaderSidecar = read("shaders/lbm-ocean.wgsl.js");
const configSource = read("sim/configs/ocean.json");
const configSidecar = read("sim/configs/ocean.json.js");

assert.ok(
  manifestSource.indexOf("js/sim/lbm-ocean.js") > manifestSource.indexOf("js/sim/heat-diffusion.js"),
  "LBM ocean should load after heat diffusion"
);
assert.ok(
  manifestSource.indexOf("js/sim/lbm-ocean.js") < manifestSource.indexOf("js/sim/biome-lut.js"),
  "LBM ocean should load before biome LUT current visualization"
);
assert.strictEqual(manifestSource.indexOf("js/render/gl.js"), -1, "runtime manifest must not load the legacy WebGL bootstrap");

[
  "@compute @workgroup_size(8, 8, 1)",
  "D2Q9_WEIGHTS",
  "D2Q9_VELOCITIES",
  "D2Q9_OPPOSITE",
  "fn equilibrium",
  "fn coriolis_force",
  "pull_stream_value",
  "bathymetry_m",
  "ocean_mask[source_cell] < 0.5",
  "wind_xy[cell] * params.wind_coupling",
  "distribution_out",
  "velocity_out"
].forEach(function(required) {
  assert.ok(shaderSource.indexOf(required) >= 0, "LBM WGSL should contain " + required);
});

assert.ok(shaderSidecar.indexOf("SHADER_SHADERS_LBM_OCEAN_WGSL") >= 0, "WGSL sidecar should expose the expected global");
assert.ok(shaderSidecar.indexOf('PS.assets.registerText("shaders/lbm-ocean.wgsl"') >= 0, "WGSL sidecar should register text");
assert.ok(configSidecar.indexOf('PS.assets.registerJSON("sim/configs/ocean.json"') >= 0, "config sidecar should register JSON");

const sidecarContext = {
  window: {},
  PS: {
    assets: {
      registerText(url, text) {
        this.url = url;
        this.text = text;
        return text;
      }
    }
  }
};
sidecarContext.window.window = sidecarContext.window;
vm.createContext(sidecarContext);
vm.runInContext(shaderSidecar, sidecarContext, { filename: "shaders/lbm-ocean.wgsl.js" });
assert.strictEqual(sidecarContext.window.SHADER_SHADERS_LBM_OCEAN_WGSL, shaderSource, "WGSL sidecar should match raw shader source exactly");
assert.strictEqual(sidecarContext.PS.assets.url, "shaders/lbm-ocean.wgsl", "WGSL sidecar should register the raw shader path");

const config = JSON.parse(configSource);
assert.strictEqual(config.layers.length, 3, "ocean config should define surface, thermocline, and deep layers");
assert.deepStrictEqual(
  config.layers.map((layer) => layer.name),
  ["surface", "thermocline", "deep"],
  "ocean layers should use the Linear names"
);
assert.strictEqual(config.layers[0].depth_m, 200, "surface layer depth should match Linear");
assert.strictEqual(config.layers[0].tau, 0.8, "surface layer tau should match Linear");
assert.strictEqual(config.layers[0].wind_coupling, 0.1, "surface layer should include wind coupling");
assert.strictEqual(config.target_tick_ms, 15, "ocean config should encode the 15ms/tick budget");
assert.strictEqual(config.layer_exchange, "density_driven", "ocean config should declare density-driven exchange");

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
          pipeline: null,
          bindGroups: [],
          workgroups: null,
          setPipeline(pipeline) {
            this.pipeline = pipeline;
          },
          setBindGroup(index, group) {
            this.bindGroups[index] = group;
          },
          dispatchWorkgroups(x, y, z) {
            this.workgroups = [x, y, z];
          },
          end() {
            this.ended = true;
          }
        };
        this.passes.push(pass);
        return pass;
      },
      finish() {
        return { encoder: this };
      }
    };
    this.lastEncoder = encoder;
    return encoder;
  }
};

const context = {
  window: {
    SHADER_SHADERS_LBM_OCEAN_WGSL: shaderSource
  },
  PS: {
    assets: {
      jsonData: {
        "sim/configs/ocean.json": config
      },
      registerJSON(url, data) {
        this.jsonData[url] = data;
        return data;
      },
      registerText(url, text) {
        this.textData = this.textData || {};
        this.textData[url] = text;
        return text;
      },
      startupLoader: {
        loadJSON() {
          return Promise.resolve(config);
        },
        loadText() {
          return Promise.resolve(shaderSource);
        }
      }
    },
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
vm.runInContext(gpuSimRuntimeSource, context, { filename: "js/sim/gpu-sim-runtime.js" });
vm.runInContext(oceanSource, context, { filename: "js/sim/lbm-ocean.js" });

const ocean = context.lbmOcean;
assert.strictEqual(ocean.velocities.length, 9, "LBM should expose D2Q9 velocities");
assert.deepStrictEqual(Array.from(ocean.opposite), [0, 3, 4, 1, 2, 7, 8, 5, 6], "LBM should expose bounce-back opposite directions");
assert.ok(Math.abs(ocean.weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-12, "D2Q9 weights should sum to one");

ocean.registerManifest();
assert.ok(
  context.PS.render.wgslShaderManifest.some(function(entry) {
    return entry.name === "lbm-ocean" && entry.path === "shaders/lbm-ocean.wgsl";
  }),
  "LBM ocean should register its WGSL manifest entry"
);

const initial = ocean.makeInitialDistributions(4, 4);
assert.strictEqual(initial.length, 4 * 4 * 9, "initial LBM field should allocate nine distributions per cell");
assert.strictEqual(ocean.validateNoNaN(initial), true, "initial distributions should not contain NaN");
assert.ok(Math.abs(ocean.sumMass(initial) - 16) < 1e-6, "uniform rho=1 initial condition should conserve expected mass");
assert.ok(Math.abs(ocean.equilibrium(0, 1, 0, 0) - 4 / 9) < 1e-7, "D2Q9 rest equilibrium should use 4/9 weight");

const mask = ocean.makeOceanMask(8, 8, { coastBand: 1 });
assert.strictEqual(mask[0], 0, "coast mask should block border land");
assert.strictEqual(mask[9], 1, "coast mask should leave interior ocean open");

const wind = ocean.makeWindField(8, 8, { strength: 0.01 });
const bathymetry = ocean.makeBathymetryField(8, 8, { oceanMask: mask });
assert.ok(bathymetry[0] > 0, "land/coast bathymetry should be solid");
assert.ok(bathymetry[8 * 4 + 4] < 0, "interior ocean bathymetry should be below sea level");
const before = ocean.makeInitialDistributions(8, 8);
const after = ocean.stepCpu(before, 8, 8, {
  oceanMask: mask,
  wind: wind,
  tau: 0.8,
  windCoupling: 0.1
});
const conservation = ocean.validateMassConservation(before, after, config.mass_tolerance);
assert.strictEqual(conservation.valid, true, "CPU LBM validation step should conserve mass within 0.01%");
assert.strictEqual(ocean.validateNoNaN(after), true, "CPU LBM validation step should not create NaN distributions");
const corrupt = ocean.makeInitialDistributions(8, 8);
corrupt[(4 * 8 + 4) * 9 + 1] = NaN;
const repaired = ocean.stepCpu(corrupt, 8, 8, {
  oceanMask: mask,
  wind: wind,
  tau: 0.8,
  windCoupling: 0.1
});
assert.strictEqual(ocean.validateNoNaN(repaired), true, "single corrupt LBM distribution should be repaired before propagation");
for (let cell = 0; cell < 8 * 8; cell += 1) {
  for (let direction = 0; direction < 9; direction += 1) {
    assert.ok(Number.isFinite(repaired[cell * 9 + direction]), "repaired LBM field should leave no adjacent NaN contamination");
  }
}
let longRun = ocean.makeInitialDistributions(8, 8);
for (let tick = 0; tick < 10000; tick += 1) {
  longRun = ocean.stepCpu(longRun, 8, 8, {
    oceanMask: mask,
    wind: wind,
    tau: 0.8,
    windCoupling: 0.1
  });
}
assert.strictEqual(ocean.validateNoNaN(longRun), true, "LBM ocean field should remain finite after 10,000 CPU validation ticks");
const macro = ocean.computeMacroscopic(after, 8, 8, mask);
assert.strictEqual(ocean.validateCoastlineBounce(macro, mask).valid, true, "land cells should have no through-coast velocity");

const deflectionNorth = ocean.coriolisDeflection(45, 0, 1);
const deflectionSouth = ocean.coriolisDeflection(-45, 0, 1);
assert.ok(deflectionNorth.eastMps2 > 0, "northward flow should deflect rightward/eastward in the northern hemisphere");
assert.ok(deflectionSouth.eastMps2 < 0, "northward flow should deflect leftward/westward in the southern hemisphere");

const gyre = ocean.makeGyrePreview(32, 32, { ticks: 10000 });
assert.strictEqual(gyre.northernHemisphereRotation, "clockwise", "northern gyre diagnostic should be clockwise");
assert.strictEqual(gyre.southernHemisphereRotation, "counter-clockwise", "southern gyre diagnostic should be counter-clockwise");

const overlay = ocean.makeCurrentOverlayRgba(macro.velocityX, macro.velocityY, mask, 8, 8, { arrowStride: 2 });
assert.strictEqual(overlay.data.length, 8 * 8 * 4, "current overlay should export RGBA bytes");
assert.strictEqual(overlay.mimeType, "image/png", "current overlay should be image-exportable");
assert.strictEqual(overlay.arrowStride, 2, "current overlay should expose arrow glyph stride");
assert.ok(Array.isArray(overlay.arrows), "current overlay should expose arrow glyph data");

const performanceContract = ocean.getPerformanceContract(512, 512, config);
assert.strictEqual(performanceContract.targetTickMs, 15, "LBM performance contract should target <15ms/tick");
assert.deepStrictEqual(Array.from(performanceContract.expectedWorkgroups), [64, 64, 1], "LBM performance contract should expose 512x512 workgroups");
assert.strictEqual(performanceContract.distributionsPerTick, 512 * 512 * 9, "LBM performance contract should account for all D2Q9 distributions");

const params = ocean.makeParamsData(512, 512, config);
const paramsView = new DataView(params.buffer);
assert.strictEqual(params.byteLength, 32, "ocean params should be WebGPU uniform aligned");
assert.strictEqual(paramsView.getUint32(0, true), 512, "ocean params should encode width");
assert.strictEqual(paramsView.getUint32(4, true), 512, "ocean params should encode height");
assert.ok(Math.abs(paramsView.getFloat32(8, true) - 0.8) < 1e-6, "ocean params should encode surface tau");
assert.ok(Math.abs(paramsView.getFloat32(12, true) - 0.1) < 1e-6, "ocean params should encode wind coupling");

context.PS.render.wgslShaders.register("lbm-ocean", shaderSource, { path: "shaders/lbm-ocean.wgsl" });
const result = ocean.init({
  width: 512,
  height: 512,
  config
});

const harness = context.PS.sim.computeHarness;
assert.strictEqual(result.width, 512, "LBM ocean should initialize a 512-wide grid");
assert.strictEqual(result.height, 512, "LBM ocean should initialize a 512-high grid");
assert.strictEqual(result.distributionBytes, 512 * 512 * 9 * 4, "LBM ocean should allocate nine float distributions per cell");
assert.strictEqual(result.velocityBytes, 512 * 512 * 4 * 4, "LBM ocean should allocate vec4 velocity output per cell");
assert.ok(harness.getState("ocean.distribution"), "LBM ocean should register distribution state");
assert.ok(harness.buffers["ocean.mask"], "LBM ocean should register ocean mask input");
assert.ok(harness.buffers["ocean.bathymetry"], "LBM ocean should register bathymetry input");
assert.ok(harness.buffers["ocean.wind"], "LBM ocean should register wind input");
assert.ok(harness.buffers["ocean.velocity"], "LBM ocean should register velocity output");
assert.ok(harness.buffers["ocean.params"], "LBM ocean should register params uniform");
assert.ok(harness.passes["lbm-ocean"], "LBM ocean should register a compute pass");
assert.ok(queueWrites.length >= 5, "LBM initialization should upload distributions, inputs, and params");

const readBefore = harness.getReadBuffer("ocean.distribution").id;
ocean.dispatch();
const computePass = fakeDevice.lastEncoder.passes[0];
assert.deepStrictEqual(computePass.workgroups, [64, 64, 1], "512x512 LBM pass should dispatch 8x8 workgroups");
assert.strictEqual(computePass.ended, true, "LBM compute pass should end cleanly");
assert.strictEqual(fakeDevice.bindGroups.length, 1, "LBM dispatch should create one bind group");
assert.strictEqual(fakeDevice.bindGroups[0].descriptor.entries.length, 7, "LBM bind group should bind distributions, mask, bathymetry, wind, velocity, and params");
assert.notStrictEqual(harness.getReadBuffer("ocean.distribution").id, readBefore, "LBM dispatch should swap distribution ping-pong buffers");
assert.strictEqual(queueSubmits.length, 1, "owned LBM dispatch should submit a command buffer");

console.log("LBM ocean checks passed");
