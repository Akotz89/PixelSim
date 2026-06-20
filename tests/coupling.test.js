const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const targetsSource = read("js/render/webgpu-targets.js");
const harnessSource = read("js/sim/compute-harness.js");
const wasmBridgeSource = read("js/sim/wasm-bridge.js");
const couplingSource = read("js/sim/coupling.js");
const docs = read("docs/multi-physics-coupling.md");
const packageJson = JSON.parse(read("package.json"));

assert.ok(packageJson.scripts.test.includes("tests/coupling.test.js"), "npm test should include coupling checks");
assert.ok(manifestSource.indexOf("js/sim/coupling.js") > manifestSource.indexOf("js/sim/wasm-bridge.js"), "coupling should load after WASM bridge");
assert.ok(manifestSource.indexOf("js/sim/coupling.js") < manifestSource.indexOf("js/layers/geology.js"), "coupling should load before Phase 2 layers");
assert.ok(docs.includes("Canonical Tick Order"), "docs should describe canonical tick order");

const queueWrites = [];
const queueSubmits = [];
const logHistory = [];
const fakeDevice = {
  buffers: [],
  textures: [],
  encoders: [],
  queue: {
    writeBuffer(buffer, offset, sourceBuffer, sourceOffset, byteLength) {
      queueWrites.push({ buffer, offset, sourceBuffer, sourceOffset, byteLength });
    },
    submit(commandBuffers) {
      queueSubmits.push(commandBuffers);
    }
  },
  createBuffer(descriptor) {
    const buffer = { descriptor };
    this.buffers.push(buffer);
    return buffer;
  },
  createTexture(descriptor) {
    const texture = {
      descriptor,
      createView() {
        return { texture };
      },
      destroy() {
        this.destroyed = true;
      }
    };
    this.textures.push(texture);
    return texture;
  },
  createComputePipeline(descriptor) {
    return {
      descriptor,
      getBindGroupLayout(index) {
        return { index };
      }
    };
  },
  createCommandEncoder(descriptor) {
    const encoder = {
      descriptor,
      passes: [],
      beginComputePass(passDescriptor) {
        const pass = {
          descriptor: passDescriptor,
          setPipeline(pipeline) {
            this.pipeline = pipeline;
          },
          setBindGroup(index, group) {
            this.bindGroup = group;
            this.bindGroupIndex = index;
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
    this.encoders.push(encoder);
    return encoder;
  }
};

const context = {
  window: {},
  PS: {
    sim: {},
    render: {},
    gpu: {
      device: fakeDevice,
      queue: fakeDevice.queue
    },
    log(category, level, message, details) {
      const entry = { category, level, message, details };
      logHistory.push(entry);
      return entry;
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
  WebAssembly
};
context.window.window = context.window;
context.window.PS = context.PS;

vm.createContext(context);
vm.runInContext(targetsSource, context, { filename: "js/render/webgpu-targets.js" });
vm.runInContext(harnessSource, context, { filename: "js/sim/compute-harness.js" });
vm.runInContext(wasmBridgeSource, context, { filename: "js/sim/wasm-bridge.js" });
vm.runInContext(couplingSource, context, { filename: "js/sim/coupling.js" });

const harness = context.PS.sim.computeHarness;
const coupling = context.coupling;
const passIds = [
  "heat-diffusion",
  "lbm-ocean",
  "thermohaline.salinity",
  "thermohaline.density",
  "moisture",
  "geochemistry",
  "reaction-diffusion",
  "pixel-ca",
  "lenia"
];

passIds.forEach((id) => {
  harness.registerPass(id, {
    pipeline: { id, kind: "pipeline" },
    bindGroups: [],
    workgroups: [1, 1, 1]
  });
});

const init = coupling.init({ width: 512, height: 512, device: fakeDevice });
assert.strictEqual(Object.keys(init.textureRegistry).length, 12, "texture registry should initialize all 12 logical textures");
assert.strictEqual(fakeDevice.textures.length, 12, "WebGPU target registry should create 12 textures");
assert.strictEqual(init.textureRegistry.elevation.format, "r32float", "elevation texture should use r32float");
assert.strictEqual(init.textureRegistry.species.logicalName, "species[0..5]", "species texture should represent species array");
assert.strictEqual(init.textureRegistry.biome_render.writtenBy, "biome-lut", "biome render target should be written by final render pass");
assert.ok(harness.buffers["coupling.elevation"], "coupling should create an elevation GPU upload buffer");

const order = coupling.validatePassOrder();
assert.ok(order.ok, "coupling pass order should match canonical order");
assert.deepStrictEqual(Array.from(order.actual), [
  "heat-diffusion",
  "lbm-ocean",
  "thermohaline",
  "moisture",
  "geochemistry",
  "reaction-diffusion",
  "pixel-ca",
  "lenia",
  "biome-lut"
], "coupling should expose nine canonical pass slots");
assert.ok(order.readDiscipline.every((entry) => entry.previousTickOnly), "all pass slots should advertise previous-tick read discipline");

const beforeDispatches = harness.dispatchLog.length;
const tick = coupling.tick({ device: fakeDevice });
assert.strictEqual(tick.passCount, 9, "tick should execute all nine canonical pass slots");
assert.deepStrictEqual(Array.from(tick.order), Array.from(order.actual), "tick order should match canonical order");
assert.strictEqual(harness.dispatchLog.length - beforeDispatches, 9, "tick should dispatch nine underlying compute passes");
assert.deepStrictEqual(Array.from(harness.dispatchLog.slice(-9).map((entry) => entry.id)), [
  "heat-diffusion",
  "lbm-ocean",
  "thermohaline.salinity",
  "thermohaline.density",
  "moisture",
  "geochemistry",
  "reaction-diffusion",
  "pixel-ca",
  "lenia"
], "underlying compute dispatch order should preserve salinity before density");
assert.ok(tick.elapsedMs < 50, "fake full tick should complete under 50ms");
assert.ok(logHistory.some((entry) => entry.message === "coupling pass timing"), "per-pass timings should be logged through PS.log");
assert.ok(logHistory.some((entry) => entry.message === "coupling tick complete"), "tick summary should be logged through PS.log");

const memory = new WebAssembly.Memory({ initial: 1 });
const sourceElevation = new Float32Array(memory.buffer, 0, 16);
for (let i = 0; i < sourceElevation.length; i += 1) {
  sourceElevation[i] = i * 10;
}
const upload = coupling.uploadWasmElevation({
  device: fakeDevice,
  simBuffer: {
    get_elevation_ptr() {
      return 0;
    }
  },
  wasmExports: { memory },
  width: 4,
  height: 4
});
assert.strictEqual(upload.bytes, 16 * 4, "WASM upload should report elevation byte length");
assert.strictEqual(upload.registryId, "elevation", "WASM upload should target elevation registry entry");
assert.strictEqual(queueWrites[queueWrites.length - 1].sourceBuffer.buffer, memory.buffer, "WASM upload should write a typed view over WASM linear memory");
assert.strictEqual(queueWrites[queueWrites.length - 1].byteLength, 16, "existing WASM bridge writes the typed array cell length for elevation uploads");

console.log("coupling checks passed");
