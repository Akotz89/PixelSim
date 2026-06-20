const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const computeSource = read("js/sim/compute-harness.js");
const wgslSource = read("js/render/wgsl-shader-manager.js");

assert.ok(
  manifestSource.indexOf("js/sim/compute-harness.js") > manifestSource.indexOf("js/render/webgpu-targets.js"),
  "compute harness should load after WebGPU target primitives"
);
assert.ok(
  manifestSource.indexOf("js/sim/compute-harness.js") < manifestSource.indexOf("js/sim/heat-diffusion.js"),
  "compute harness should load before WebGPU compute jobs"
);
assert.strictEqual(manifestSource.indexOf("js/render/gl.js"), -1, "runtime manifest must not load the legacy WebGL bootstrap");

const queueWrites = [];
const queueSubmits = [];
const fakeDevice = {
  buffers: [],
  bindGroups: [],
  encoders: [],
  createBuffer(descriptor) {
    const buffer = { descriptor, label: descriptor.label };
    this.buffers.push(buffer);
    return buffer;
  },
  createBindGroup(descriptor) {
    const bindGroup = { descriptor, index: this.bindGroups.length };
    this.bindGroups.push(bindGroup);
    return bindGroup;
  },
  createComputePipeline(descriptor) {
    return { descriptor, kind: "compute-pipeline" };
  },
  createCommandEncoder(descriptor) {
    const encoder = {
      descriptor,
      passes: [],
      finished: false,
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
        this.finished = true;
        return { encoder: this };
      }
    };
    this.encoders.push(encoder);
    return encoder;
  }
};

const context = {
  PS: {
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
  Array
};

vm.createContext(context);
vm.runInContext(wgslSource, context, { filename: "js/render/wgsl-shader-manager.js" });
vm.runInContext(computeSource, context, { filename: "js/sim/compute-harness.js" });

const harness = context.computeHarness;
const initial = new Float32Array([1, 2, 3, 4]);
const buffer = harness.createBuffer("temperature.seed", 13, ["storage", "copyDst"], initial);

assert.strictEqual(buffer.byteLength, 16, "compute buffers should be aligned to four bytes");
assert.strictEqual(fakeDevice.buffers[0].descriptor.label, "temperature.seed", "buffer label should use id");
assert.strictEqual(queueWrites.length, 1, "initial typed data should be uploaded to the queue");
assert.strictEqual(queueWrites[0].byteLength, initial.byteLength, "writeBuffer should upload the typed array byte length");

const pingPong = harness.createPingPong("temperature", 64, ["storage", "copySrc", "copyDst"]);
const firstRead = harness.getReadBuffer("temperature");
const firstWrite = harness.getWriteBuffer("temperature");

assert.strictEqual(pingPong.buffers.length, 2, "ping-pong state should own two buffers");
assert.notStrictEqual(firstRead.id, firstWrite.id, "read and write buffers should be distinct");
harness.swap("temperature");
assert.strictEqual(harness.getReadBuffer("temperature").id, firstWrite.id, "swap should promote write buffer to read");
assert.strictEqual(harness.getWriteBuffer("temperature").id, firstRead.id, "swap should demote read buffer to write");

const state = harness.registerState("moisture", {
  width: 8,
  height: 4,
  bytesPerCell: 4,
  format: "float32"
});

assert.strictEqual(state.byteLength, 128, "simulation state should derive byte length from dimensions");
assert.strictEqual(harness.getState("moisture"), state, "simulation state registry should return registered state");
assert.ok(state.pingPong, "simulation state should create ping-pong buffers by default");

const bindGroup = { label: "heat.bindgroup" };
const pass = harness.registerPass("heat-diffusion", {
  pipelineDescriptor: { label: "heat.pipeline", layout: "auto" },
  bindGroups: [bindGroup],
  workgroups: [4, 2, 1],
  afterDispatch(passRecord, owner) {
    owner.swap("temperature");
    passRecord.afterDispatchRan = true;
  }
});

const commandBuffer = harness.dispatch("heat-diffusion");
const encoder = fakeDevice.encoders[0];
const computePass = encoder.passes[0];

assert.strictEqual(pass.dispatches, 1, "dispatch should increment pass dispatch count");
assert.strictEqual(pass.afterDispatchRan, true, "afterDispatch hook should run");
assert.strictEqual(computePass.pipeline.kind, "compute-pipeline", "dispatch should bind a compute pipeline");
assert.deepStrictEqual(computePass.bindGroups, [bindGroup], "dispatch should bind pass bind groups");
assert.deepStrictEqual(computePass.workgroups, [4, 2, 1], "dispatch should use configured workgroups");
assert.strictEqual(computePass.ended, true, "compute pass should end");
assert.strictEqual(encoder.finished, true, "owned dispatch should finish command encoder");
assert.strictEqual(queueSubmits.length, 1, "owned dispatch should submit command buffer");
assert.strictEqual(queueSubmits[0][0], commandBuffer, "submitted command buffer should match dispatch return");
const stats = harness.getStats();
assert.strictEqual(stats.buffers, 5, "compute harness stats should count buffers");
assert.strictEqual(stats.pingPongs, 2, "compute harness stats should count ping-pong pairs");
assert.strictEqual(stats.states, 1, "compute harness stats should count simulation states");
assert.strictEqual(stats.passes, 1, "compute harness stats should count compute passes");
assert.strictEqual(stats.dispatches, 1, "compute harness stats should count dispatches");

const cachedPass = harness.registerPass("cached-ping-pong", {
  pipelineDescriptor: { label: "cached.pipeline", layout: "auto" },
  workgroups: [1, 1, 1],
  beforeDispatch(passRecord, owner) {
    const descriptor = {
      label: "cached.bind-group",
      layout: passRecord.pipeline.getBindGroupLayout ? passRecord.pipeline.getBindGroupLayout(0) : { index: 0 },
      entries: [
        { binding: 0, resource: { buffer: owner.getReadBuffer("temperature").buffer } },
        { binding: 1, resource: { buffer: owner.getWriteBuffer("temperature").buffer } }
      ]
    };
    passRecord.bindGroups = [owner.createCachedBindGroup(passRecord, fakeDevice, 0, descriptor)];
  },
  afterDispatch(passRecord, owner) {
    owner.swap("temperature");
  }
});

harness.dispatch("cached-ping-pong");
harness.dispatch("cached-ping-pong");
harness.dispatch("cached-ping-pong");
harness.dispatch("cached-ping-pong");
assert.strictEqual(cachedPass.dispatches, 4, "cached ping-pong pass should dispatch repeatedly");
assert.strictEqual(fakeDevice.bindGroups.length, 2, "ping-pong bind group cache should allocate only the two read/write variants");

console.log("compute harness checks passed");
