const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

function nearly(actual, expected) {
  return Math.abs(Number(actual) - Number(expected)) < 0.00001;
}

const namespaceSource = read("js/core/namespace.js");
const managerSource = read("js/render/wgsl-shader-manager.js");
const mainLoopSource = read("js/main-loop.js");
const pipelineSource = read("js/render/pipeline.js");
const waterSource = read("js/render/webgpu-water-displacement.js");
const waterWgsl = read("shaders/water-displace.wgsl");
const waterSidecar = read("shaders/water-displace.wgsl.js");

assert.ok(namespaceSource.indexOf("js/render/webgpu-water-displacement.js") > namespaceSource.indexOf("js/render/webgpu-point-lights.js"), "water displacement renderer should load after point-light renderer");
assert.ok(namespaceSource.indexOf("js/render/webgpu-water-displacement.js") < namespaceSource.indexOf("js/render/webgpu-entity.js"), "water displacement renderer should load before entity renderers");
assert.ok(mainLoopSource.indexOf("PS.render.webgpuWaterDisplacement") >= 0, "startup should register water displacement WGSL before first draw");
assert.ok(pipelineSource.indexOf('PS.render.pipeline.registerLayer("water.displacement"') >= 0, "pipeline should register the water displacement layer");
assert.ok(pipelineSource.indexOf("order: 32") >= 0, "water displacement should render before snow and grass overlays");
assert.strictEqual(waterSource.toLowerCase().indexOf("webgl"), -1, "water displacement renderer must not reference legacy WebGL");

[
  "struct WaterPass",
  "displacement_scroll",
  "surface_scroll",
  "alpha_amount",
  "water.wind.xy * water.wind.z * water.time_seconds",
  "wave_texture",
  "passes[input.pass_index]",
  "@builtin(instance_index)",
  "pass.alpha_amount.x * foam"
].forEach(function (required) {
  assert.ok(waterWgsl.indexOf(required) >= 0, "water displacement WGSL should contain " + required);
});
assert.ok(waterSidecar.indexOf("SHADER_SHADERS_WATER_DISPLACE_WGSL") >= 0, "water-displace sidecar should expose global WGSL");
assert.ok(waterSidecar.indexOf(JSON.stringify(waterWgsl)) >= 0, "water-displace sidecar should embed raw WGSL");
assert.ok(waterSidecar.indexOf('PS.assets.registerText("shaders/water-displace.wgsl"') >= 0, "water-displace sidecar should register shader text");

const queueWrites = [];
const submissions = [];
const fakePasses = [];
const fakeDevice = {
  buffers: [],
  pipelines: [],
  bindGroups: [],
  modules: [],
  queue: {
    writeBuffer(buffer, offset, data, dataOffset, size) {
      queueWrites.push({ buffer, offset, data, dataOffset, size });
    },
    submit(commands) {
      submissions.push(commands);
    }
  },
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
  createRenderPipeline(descriptor) {
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
    const bindGroup = { descriptor };
    this.bindGroups.push(bindGroup);
    return bindGroup;
  },
  createCommandEncoder(descriptor) {
    return {
      descriptor,
      beginRenderPass(passDescriptor) {
        const pass = {
          descriptor: passDescriptor,
          drawArgs: null,
          setPipeline(pipeline) {
            this.pipeline = pipeline;
          },
          setBindGroup(index, bindGroup) {
            this.bindGroupIndex = index;
            this.bindGroup = bindGroup;
          },
          draw(vertexCount, instanceCount, firstVertex, firstInstance) {
            this.drawArgs = [vertexCount, instanceCount, firstVertex, firstInstance];
          },
          end() {
            this.ended = true;
          }
        };
        fakePasses.push(pass);
        return pass;
      },
      finish() {
        return { encoder: this };
      }
    };
  }
};

function makeTexture(label) {
  return {
    label,
    createView() {
      return { texture: this };
    }
  };
}

const context = {
  PS: {
    render: {},
    gpu: {
      device: fakeDevice,
      format: "bgra8unorm",
      canvas: { width: 320, height: 180 },
      context: {
        getCurrentTexture() {
          return makeTexture("swapchain");
        }
      }
    }
  },
  window: {},
  world: {
    timeMs: 2500,
    wind: { x: 0.4, y: -0.2, speed: 1.5 }
  },
  Float32Array,
  Math,
  Number,
  String,
  Object,
  Array,
  Date,
  Error
};

vm.createContext(context);
vm.runInContext(managerSource, context, { filename: "js/render/wgsl-shader-manager.js" });
vm.runInContext(waterSource, context, { filename: "js/render/webgpu-water-displacement.js" });

context.PS.render.wgslShaders.register("water-displace", waterWgsl, { path: "shaders/water-displace.wgsl" });
const water = context.PS.render.webgpuWaterDisplacement;
water.registerManifest();
assert.ok(context.PS.render.wgslShaderManifest.some(function (entry) { return entry.name === "water-displace"; }), "water-displace shader should be in the WGSL manifest");

const instances = water.createInstances();
assert.strictEqual(instances.length, 24, "water displacement should submit exactly two shader-driven passes");
assert.strictEqual(instances[4], 1, "large wave pass should render at full opacity");
assert.strictEqual(instances[16], 0.25, "small ripple pass should render at quarter opacity");
assert.notDeepStrictEqual(Array.from(instances.slice(0, 4)), Array.from(instances.slice(12, 16)), "two passes should use distinct displacement and surface scrolls");
const regionInstances = water.createInstances({ visualPolicy: { level: "REGION", waterUvScrollScale: 0.2 } });
assert.strictEqual(regionInstances.length, 12, "region LOD should reduce water displacement to one shader pass");
assert.ok(regionInstances[5] < instances[5], "region LOD should reduce water scroll strength");
const worldInstances = water.createInstances({ visualPolicy: { level: "WORLD", waterUvScrollScale: 0 } });
assert.strictEqual(worldInstances.length, 0, "world LOD should disable water displacement instances");

assert.strictEqual(water.draw({ timeSeconds: 3.5, wind: { x: 0.6, y: -0.4, speed: 2 } }), true, "water displacement draw should submit a fullscreen pass");
assert.strictEqual(fakeDevice.pipelines[0].descriptor.label, "water-displace.pipeline", "water displacement pipeline should be created");
assert.strictEqual(fakeDevice.pipelines[0].descriptor.fragment.targets[0].blend.color.srcFactor, "src-alpha", "water displacement should alpha-blend over terrain");
assert.strictEqual(fakePasses[0].descriptor.label, "water-displace.render-pass", "water displacement should use a labeled render pass");
assert.deepStrictEqual(fakePasses[0].drawArgs, [4, 2, 0, 0], "water displacement should draw two shader instances");
assert.ok(queueWrites.some(function (write) {
  return write.buffer.descriptor.label === "water-displace.uniforms" &&
    nearly(write.data[2], 3.5) &&
    nearly(write.data[4], 0.6) &&
    nearly(write.data[5], -0.4) &&
    nearly(write.data[6], 2);
}), "water displacement uniforms should upload time and wind");
assert.ok(queueWrites.some(function (write) {
  return write.buffer.descriptor.label === "water-displace.instances.storage" &&
    write.size === 24;
}), "water displacement should upload two pass descriptors through storage buffer");
assert.strictEqual(submissions.length, 1, "standalone water displacement draw should submit a command buffer");
assert.strictEqual(water.getStats().drawCount, 1, "water displacement stats should count draws");
assert.strictEqual(water.getStats().passDrawCount, 2, "water displacement stats should count the two GPU passes");
assert.strictEqual(water.getStats().lastError, "", "successful water displacement draw should clear lastError");
assert.strictEqual(water.draw({
  timeSeconds: 4,
  wind: { x: 0.6, y: -0.4, speed: 2 },
  lodState: { visualPolicy: { level: "REGION", waterUvScrollScale: 0.2 } }
}), true, "region LOD water displacement should still submit a reduced pass");
assert.deepStrictEqual(fakePasses[1].drawArgs, [4, 1, 0, 0], "region LOD should draw one water displacement instance");
assert.ok(queueWrites.some(function (write) {
  return write.buffer.descriptor.label === "water-displace.uniforms" &&
    nearly(write.data[2], 4) &&
    nearly(write.data[6], 0.4);
}), "region LOD should scale uploaded water wind speed");
const submissionsBeforeWorldLod = submissions.length;
assert.strictEqual(water.draw({
  timeSeconds: 5,
  wind: { x: 0.6, y: -0.4, speed: 2 },
  lodState: { visualPolicy: { level: "WORLD", waterUvScrollScale: 0 } }
}), false, "world LOD water displacement should skip the GPU pass");
assert.strictEqual(submissions.length, submissionsBeforeWorldLod, "world LOD should not submit an empty water displacement command buffer");
assert.strictEqual(water.getStats().passDrawCount, 0, "world LOD should publish zero water displacement passes");

console.log("webgpu water displacement checks passed");
