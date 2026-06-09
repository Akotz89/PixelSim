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
const heatSource = read("js/sim/heat-diffusion.js");
const shaderSource = read("shaders/heat-diffusion.wgsl");
const shaderSidecar = read("shaders/heat-diffusion.wgsl.js");
const configSource = read("sim/configs/heat-diffusion.json");
const configSidecar = read("sim/configs/heat-diffusion.json.js");

assert.ok(
  namespaceSource.indexOf("js/sim/heat-diffusion.js") > namespaceSource.indexOf("js/sim/compute-harness.js"),
  "heat diffusion should load after the WebGPU compute harness"
);
assert.ok(
  namespaceSource.indexOf("js/sim/heat-diffusion.js") < namespaceSource.indexOf("js/render/draw-order.js"),
  "heat diffusion should load before frame draw ordering"
);
assert.strictEqual(namespaceSource.indexOf("js/render/gl.js"), -1, "runtime manifest must not load the legacy WebGL bootstrap");

[
  "@compute @workgroup_size(8, 8, 1)",
  "var<storage, read> temperature_in",
  "var<storage, read_write> temperature_out",
  "var<storage, read> elevation_m",
  "var<storage, read> albedo",
  "var<storage, read> greenhouse_c",
  "wrapped_x(x: i32)",
  "clamped_y(y: i32)",
  "laplacian = north + south + west + east - center * 4.0",
  "solar_incidence = max(0.0, cos(latitude))",
  "elevation_lapse_c = elevation_m[index] * params.lapse_rate",
  "temperature_out[index] = clamp"
].forEach(function(required) {
  assert.ok(shaderSource.indexOf(required) >= 0, "heat WGSL should contain " + required);
});

assert.ok(shaderSidecar.indexOf("SHADER_SHADERS_HEAT_DIFFUSION_WGSL") >= 0, "WGSL sidecar should expose the expected global");
assert.ok(shaderSidecar.indexOf('PS.assets.registerText("shaders/heat-diffusion.wgsl"') >= 0, "WGSL sidecar should register text");
assert.ok(configSidecar.indexOf('PS.assets.registerJSON("sim/configs/heat-diffusion.json"') >= 0, "config sidecar should register JSON");

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
vm.runInContext(shaderSidecar, sidecarContext, { filename: "shaders/heat-diffusion.wgsl.js" });
assert.strictEqual(sidecarContext.window.SHADER_SHADERS_HEAT_DIFFUSION_WGSL, shaderSource, "WGSL sidecar should match raw shader source exactly");
assert.strictEqual(sidecarContext.PS.assets.url, "shaders/heat-diffusion.wgsl", "WGSL sidecar should register the raw shader path");
assert.strictEqual(sidecarContext.PS.assets.text, shaderSource, "WGSL sidecar should register the exact raw shader source");

const config = JSON.parse(configSource);
assert.strictEqual(config.thermal_diffusivity, 2.1e-7, "heat config should use the Linear thermal diffusivity");
assert.strictEqual(config.solar_constant, 1361, "heat config should use the Linear solar constant");
assert.strictEqual(config.lapse_rate, 0.0065, "heat config should use the Linear lapse rate");
assert.strictEqual(config.time_step, 3600, "heat config should use one-hour timesteps");
assert.strictEqual(config.grid_spacing, 50000, "heat config should use 50km grid spacing");
assert.deepStrictEqual(config.albedo, { ocean: 0.06, ice: 0.8, land: 0.3, desert: 0.35 }, "heat config should include required albedo values");

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
    SHADER_SHADERS_HEAT_DIFFUSION_WGSL: shaderSource
  },
  PS: {
    assets: {
      jsonData: {
        "sim/configs/heat-diffusion.json": config
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
        loadJSON(url) {
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
vm.runInContext(heatSource, context, { filename: "js/sim/heat-diffusion.js" });

const heat = context.PS.sim.heatDiffusion;
assert.ok(Array.isArray(context.PS.render.wgslShaderManifest), "WGSL manifest should exist");
heat.registerManifest();
assert.ok(
  context.PS.render.wgslShaderManifest.some(function(entry) {
    return entry.name === "heat-diffusion" && entry.path === "shaders/heat-diffusion.wgsl";
  }),
  "heat diffusion should register its WGSL manifest entry"
);

const initial = heat.makeInitialTemperature(4, 4);
assert.strictEqual(initial.length, 16, "initial temperature field should match grid cells");
assert.ok(initial[0] < initial[8], "initial temperature should be colder near pole than equator");
assert.ok(initial.every(Number.isFinite), "initial temperature field should not contain NaN");

const params = heat.makeParamsData(512, 512, config);
const view = new DataView(params.buffer);
assert.strictEqual(params.byteLength, 48, "params should be padded for WebGPU uniform binding alignment");
assert.strictEqual(view.getUint32(0, true), 512, "params should encode width as u32");
assert.strictEqual(view.getUint32(4, true), 512, "params should encode height as u32");
assert.strictEqual(view.getFloat32(12, true), 3600, "params should encode timestep");

context.PS.render.wgslShaders.register("heat-diffusion", shaderSource, { path: "shaders/heat-diffusion.wgsl" });
const result = heat.init({
  width: 512,
  height: 512,
  config
});

const harness = context.PS.sim.computeHarness;
assert.strictEqual(result.width, 512, "heat diffusion should initialize a 512-wide grid");
assert.strictEqual(result.height, 512, "heat diffusion should initialize a 512-high grid");
assert.strictEqual(result.byteLength, 512 * 512 * 4, "heat diffusion state should allocate float32 cells");
assert.ok(harness.getState("temperature"), "heat diffusion should register temperature state");
assert.ok(harness.buffers["heat.elevation"], "heat diffusion should register elevation input buffer");
assert.ok(harness.buffers["heat.albedo"], "heat diffusion should register albedo input buffer");
assert.ok(harness.buffers["heat.greenhouse"], "heat diffusion should register greenhouse input buffer");
assert.ok(harness.buffers["heat.params"], "heat diffusion should register uniform params buffer");
assert.ok(harness.passes["heat-diffusion"], "heat diffusion should register a compute pass");
assert.ok(queueWrites.length >= 6, "heat diffusion initialization should upload temperature, inputs, and params");

const readBefore = harness.getReadBuffer("temperature").id;
heat.dispatch();
const computePass = fakeDevice.lastEncoder.passes[0];
assert.deepStrictEqual(computePass.workgroups, [64, 64, 1], "512x512 heat pass should dispatch 8x8 workgroups");
assert.strictEqual(computePass.ended, true, "heat compute pass should end cleanly");
assert.strictEqual(fakeDevice.bindGroups.length, 1, "heat dispatch should create one bind group");
assert.strictEqual(fakeDevice.bindGroups[0].descriptor.entries.length, 6, "heat bind group should bind temperature, elevation, albedo, greenhouse, and params");
assert.notStrictEqual(harness.getReadBuffer("temperature").id, readBefore, "heat dispatch should swap temperature ping-pong buffers");
assert.strictEqual(queueSubmits.length, 1, "owned heat dispatch should submit a command buffer");

console.log("heat diffusion checks passed");
