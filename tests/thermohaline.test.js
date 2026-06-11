const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const namespaceSource = read("js/core/namespace.js");
const wgslManagerSource = read("js/render/wgsl-shader-manager.js");
const harnessSource = read("js/sim/compute-harness.js");
const thermoSource = read("js/sim/thermohaline.js");
const salinityShader = read("shaders/salinity.wgsl");
const densityShader = read("shaders/density.wgsl");
const salinitySidecar = read("shaders/salinity.wgsl.js");
const densitySidecar = read("shaders/density.wgsl.js");
const configSource = read("sim/configs/thermohaline.json");
const configSidecar = read("sim/configs/thermohaline.json.js");

assert.ok(namespaceSource.indexOf("js/sim/thermohaline.js") > namespaceSource.indexOf("js/sim/lbm-ocean.js"), "thermohaline should load after LBM ocean");
assert.ok(namespaceSource.indexOf("js/sim/thermohaline.js") < namespaceSource.indexOf("js/sim/biome-lut.js"), "thermohaline should load before biome rendering");

[
  "salinity_in",
  "velocity_xy",
  "temperature_c",
  "moisture",
  "elevation_m",
  "river_mask",
  "haline_diffusivity",
  "river_freshening"
].forEach((required) => assert.ok(salinityShader.includes(required), "salinity WGSL should contain " + required));

[
  "density_base",
  "density_salinity_coeff",
  "density_temperature_coeff",
  "downwelling_density_threshold",
  "buoyancy_out"
].forEach((required) => assert.ok(densityShader.includes(required), "density WGSL should contain " + required));

assert.ok(salinitySidecar.includes("SHADER_SHADERS_SALINITY_WGSL"), "salinity sidecar should expose global");
assert.ok(densitySidecar.includes("SHADER_SHADERS_DENSITY_WGSL"), "density sidecar should expose global");
assert.ok(configSidecar.includes('PS.assets.registerJSON("sim/configs/thermohaline.json"'), "config sidecar should register JSON");

const config = JSON.parse(configSource);
assert.strictEqual(config.initial_salinity_psu, 35, "salinity should initialize at 35 PSU");
assert.strictEqual(config.river_salinity_psu, 0, "river cells should initialize at 0 PSU");
assert.strictEqual(config.density_base, 1025, "density equation should use Linear base density");
assert.strictEqual(config.density_salinity_coeff, 0.8, "density equation should use salinity coefficient");
assert.strictEqual(config.density_temperature_coeff, -0.2, "density equation should use temperature coefficient");

const sidecarContext = {
  window: {},
  PS: {
    assets: {
      registerText(url, text) {
        this[url] = text;
      }
    }
  }
};
sidecarContext.window.window = sidecarContext.window;
vm.createContext(sidecarContext);
vm.runInContext(salinitySidecar, sidecarContext, { filename: "shaders/salinity.wgsl.js" });
vm.runInContext(densitySidecar, sidecarContext, { filename: "shaders/density.wgsl.js" });
assert.strictEqual(sidecarContext.window.SHADER_SHADERS_SALINITY_WGSL, salinityShader, "salinity sidecar should match raw shader");
assert.strictEqual(sidecarContext.window.SHADER_SHADERS_DENSITY_WGSL, densityShader, "density sidecar should match raw shader");

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
  window: {
    SHADER_SHADERS_SALINITY_WGSL: salinityShader,
    SHADER_SHADERS_DENSITY_WGSL: densityShader
  },
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
vm.runInContext(thermoSource, context, { filename: "js/sim/thermohaline.js" });

const thermo = context.PS.sim.thermohaline;
thermo.registerManifest();
assert.ok(context.PS.render.wgslShaderManifest.some((entry) => entry.name === "salinity"), "thermohaline should register salinity shader");
assert.ok(context.PS.render.wgslShaderManifest.some((entry) => entry.name === "density"), "thermohaline should register density shader");

const riverMask = thermo.makeScalarField(16, 16, 0);
riverMask[8 * 16 + 1] = 1;
const initial = thermo.makeInitialSalinity(16, 16, { config, riverMask });
assert.strictEqual(initial[0], 35, "open ocean should initialize at 35 PSU");
assert.strictEqual(initial[8 * 16 + 1], 0, "river cells should initialize fresh");

const validationSalinity = thermo.runValidationTicks(16, 16, { ticks: 250, config });
const tropicalAverage = validationSalinity[8 * 16 + 8];
const polarAverage = (thermo.getRowAverage(validationSalinity, 16, 0) + thermo.getRowAverage(validationSalinity, 16, 15)) / 2;
assert.ok(tropicalAverage >= 36 && tropicalAverage <= 37, "tropical surface salinity should rise to 36-37 PSU");
assert.ok(polarAverage >= 33 && polarAverage <= 34, "polar salinity should settle near 33-34 PSU");
const riverPlume = thermo.runValidationTicks(16, 16, { ticks: 80, config, riverMask });
assert.ok(riverPlume[8 * 16 + 1] <= 5, "river mouth should remain a low-salinity freshwater plume");
assert.ok(riverPlume[8 * 16 + 2] < riverPlume[8 * 16 + 8], "river freshwater should form a lower-salinity coastal halo");

const temperature = thermo.makeLatitudeTemperature(16, 16);
const density = thermo.computeDensityField(temperature, validationSalinity, 16, 16, config);
const validation = thermo.validateFields(validationSalinity, density, 16, 16, { config });
assert.strictEqual(validation.noNaN, true, "salinity and density should not contain NaN");
assert.ok(validation.densityMin >= 1025, "density should stay inside expected lower range");
assert.ok(validation.densityMax <= 1028.5, "density should stay inside expected upper range");
assert.ok(validation.deepWaterCells > 0, "polar dense water should create downwelling cells");
assert.ok(Math.abs(thermo.computeDensityValue(10, 35, config) - 1025) < 1e-6, "EOS reference point should match 1025 kg/m3");

const salinityMap = thermo.makeSalinityMapRgba(riverPlume, 16, 16);
assert.strictEqual(salinityMap.data.length, 16 * 16 * 4, "salinity visual map should export RGBA bytes");
assert.strictEqual(salinityMap.mimeType, "image/png", "salinity visual map should be image-exportable");
assert.ok(salinityMap.data[(8 * 16 + 1) * 4 + 2] > salinityMap.data[(8 * 16 + 8) * 4 + 2], "freshwater plume should be bluer than evaporation zones");

const buoyancy = thermo.makeBuoyancyForcing(density, 16, 16, config);
assert.strictEqual(buoyancy.length, 16 * 16 * 4, "buoyancy coupling should export vec4 forcing data for LBM");
assert.ok(buoyancy.some((value, index) => index % 4 === 1 && value < 0), "dense polar water should produce sinking force");

const salinityParams = thermo.makeSalinityParamsData(512, 512, config);
const densityParams = thermo.makeDensityParamsData(512, 512, config);
assert.strictEqual(salinityParams.byteLength, 48, "salinity params should be uniform aligned");
assert.strictEqual(densityParams.byteLength, 32, "density params should be uniform aligned");

context.PS.render.wgslShaders.register("salinity", salinityShader, { path: "shaders/salinity.wgsl" });
context.PS.render.wgslShaders.register("density", densityShader, { path: "shaders/density.wgsl" });
const result = thermo.init({ width: 512, height: 512, config });
const harness = context.PS.sim.computeHarness;
assert.strictEqual(result.scalarBytes, 512 * 512 * 4, "thermohaline scalar fields should allocate float32 cells");
assert.ok(harness.getState("thermohaline.salinity"), "thermohaline should register salinity ping-pong state");
assert.ok(harness.buffers["thermohaline.density"], "thermohaline should register density output");
assert.ok(harness.buffers["thermohaline.buoyancy"], "thermohaline should register LBM buoyancy coupling output");
assert.ok(harness.passes["thermohaline.salinity"], "thermohaline should register salinity pass");
assert.ok(harness.passes["thermohaline.density"], "thermohaline should register density pass");

thermo.dispatch();
assert.deepStrictEqual(fakeDevice.lastEncoder.passes[0].workgroups, [64, 64, 1], "density pass should dispatch 512x512 grid");
assert.ok(queueWrites.length >= 9, "thermohaline init should upload salinity, inputs, outputs, and params");
assert.ok(queueSubmits.length >= 2, "owned thermohaline dispatch should submit salinity and density passes");

console.log("thermohaline checks passed");
