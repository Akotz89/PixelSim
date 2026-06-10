const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function nearly(actual, expected) {
  return Math.abs(Number(actual) - Number(expected)) < 0.00001;
}

const namespaceSource = read("js/core/namespace.js");
const targetsSource = read("js/render/webgpu-targets.js");
const gbufferSource = read("js/render/webgpu-gbuffer.js");
const compositorSource = read("js/render/webgpu-compositor.js");
const managerSource = read("js/render/wgsl-shader-manager.js");
const shaderSource = read("shaders/gbuffer-compose.wgsl");
const sidecarSource = read("shaders/gbuffer-compose.wgsl.js");

assert.ok(
  namespaceSource.indexOf("js/render/webgpu-targets.js") < namespaceSource.indexOf("js/render/webgpu-gbuffer.js"),
  "WebGPU G-buffer should load after WebGPU targets"
);
assert.ok(
  namespaceSource.indexOf("js/render/webgpu-gbuffer.js") < namespaceSource.indexOf("js/render/webgpu-compositor.js"),
  "WebGPU compositor should load after WebGPU G-buffer"
);
assert.ok(
  namespaceSource.indexOf("js/render/webgpu-compositor.js") < namespaceSource.indexOf("js/render/webgpu-globe.js"),
  "WebGPU compositor should load before globe consumers"
);
assert.strictEqual(namespaceSource.indexOf("js/render/webgl-gbuffer.js"), -1, "runtime manifest must not load legacy WebGL G-buffer");
assert.strictEqual(namespaceSource.indexOf("js/render/webgl-compositor.js"), -1, "runtime manifest must not load legacy WebGL compositor");
assert.ok(sidecarSource.indexOf("SHADER_SHADERS_GBUFFER_COMPOSE_WGSL") >= 0, "G-buffer compositor sidecar should expose global WGSL source");
assert.ok(sidecarSource.indexOf(JSON.stringify(shaderSource)) >= 0, "G-buffer compositor sidecar should embed raw WGSL source");
assert.ok(sidecarSource.indexOf('PS.assets.registerText("shaders/gbuffer-compose.wgsl"') >= 0, "G-buffer compositor sidecar should register shader text");
assert.strictEqual(gbufferSource.toLowerCase().indexOf("webgl"), -1, "WebGPU G-buffer source must not reference WebGL");
assert.strictEqual(compositorSource.toLowerCase().indexOf("webgl"), -1, "WebGPU compositor source must not reference WebGL");
assert.ok(shaderSource.indexOf("var<uniform> compose: ComposeUniforms") >= 0, "G-buffer compose shader should bind lighting uniforms");
assert.ok(shaderSource.indexOf("textureSample(albedo_texture") >= 0, "G-buffer compose shader should sample albedo");
assert.ok(shaderSource.indexOf("textureSample(normal_height_texture") >= 0, "G-buffer compose shader should sample normal/height");
assert.ok(shaderSource.indexOf("let light_dir = normalize(compose.sun_direction.xyz)") >= 0, "G-buffer compose shader should use uniform sun direction");
assert.ok(shaderSource.indexOf("compose.lighting.x") >= 0, "G-buffer compose shader should use uniform ambient");
assert.strictEqual(shaderSource.indexOf("let ambient = 0.32"), -1, "G-buffer compose shader must not hardcode ambient lighting");

const fakePasses = [];
const fakeDevice = {
  buffers: [],
  textures: [],
  pipelines: [],
  bindGroups: [],
  writes: [],
  submits: [],
  queue: {
    writeBuffer(buffer, offset, data, dataOffset, size) {
      fakeDevice.writes.push({ buffer, offset, data, dataOffset, size });
    },
    submit(commands) {
      fakeDevice.submits.push(commands);
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
      destroyed: false,
      views: [],
      destroy() {
        this.destroyed = true;
      },
      createView() {
        const view = { texture: this, index: this.views.length };
        this.views.push(view);
        return view;
      }
    };
    this.textures.push(texture);
    return texture;
  },
  createSampler(descriptor) {
    return { descriptor };
  },
  createShaderModule(descriptor) {
    return { descriptor };
  },
  createRenderPipeline(descriptor) {
    const pipeline = {
      descriptor,
      getBindGroupLayout(index) {
        return { pipeline: this, index };
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
      passes: [],
      beginRenderPass(passDescriptor) {
        const pass = {
          descriptor: passDescriptor,
          pipeline: null,
          bindGroups: [],
          draws: [],
          ended: false,
          setPipeline(pipeline) {
            this.pipeline = pipeline;
          },
          setBindGroup(index, bindGroup) {
            this.bindGroups[index] = bindGroup;
          },
          draw() {
            this.draws.push(Array.from(arguments));
          },
          end() {
            this.ended = true;
          }
        };
        this.passes.push(pass);
        fakePasses.push(pass);
        return pass;
      },
      finish() {
        return { encoder: this };
      }
    };
  }
};

const context = {
  PS: {
    assets: {},
    render: {},
    gpu: {
      format: "bgra8unorm",
      device: fakeDevice,
      context: {
        getCurrentTexture() {
          return fakeDevice.createTexture({
            label: "current",
            size: { width: 320, height: 180 },
            format: "bgra8unorm",
            usage: 16
          });
        }
      }
    }
  },
  Object,
  String,
  Number,
  Boolean,
  Array,
  Math,
  Date,
  Error,
  world: {
    tick: 1000
  },
  performance: {
    now() {
      return Date.now();
    }
  }
};

vm.createContext(context);
vm.runInContext(managerSource, context, { filename: "js/render/wgsl-shader-manager.js" });
vm.runInContext(targetsSource, context, { filename: "js/render/webgpu-targets.js" });
vm.runInContext(gbufferSource, context, { filename: "js/render/webgpu-gbuffer.js" });
vm.runInContext(compositorSource, context, { filename: "js/render/webgpu-compositor.js" });

context.PS.render.wgslShaders.register("gbuffer-compose", shaderSource, { path: "shaders/gbuffer-compose.wgsl" });
context.PS.render.webgpuCompositor.registerManifest();

const attachments = context.PS.render.webgpuGbuffer.ensure(320, 180, fakeDevice);
assert.strictEqual(attachments.albedo.format, "bgra8unorm", "G-buffer albedo should use presentation format");
assert.strictEqual(attachments.normalHeight.format, "rgba16float", "G-buffer normal/height target should use float format");
assert.strictEqual(attachments.depth.format, "depth24plus", "G-buffer depth target should use depth format");
assert.strictEqual(context.PS.render.webgpuGbuffer.getStats().ready, true, "G-buffer should report ready after attachment creation");

const encoder = fakeDevice.createCommandEncoder({ label: "test.encoder" });
const terrainPass = context.PS.render.webgpuGbuffer.beginTerrainPass(encoder, 320, 180, fakeDevice);
assert.strictEqual(terrainPass.descriptor.colorAttachments.length, 2, "terrain G-buffer pass should bind albedo and normal/height attachments");
assert.strictEqual(terrainPass.descriptor.colorAttachments[0].clearValue.a, 0, "G-buffer albedo should clear transparent for compositing over globe");
assert.ok(terrainPass.descriptor.depthStencilAttachment.view, "terrain G-buffer pass should bind a depth attachment");

assert.ok(
  context.PS.render.wgslShaderManifest.some((entry) => entry.name === "gbuffer-compose"),
  "WebGPU compositor should register its required WGSL shader"
);

assert.strictEqual(
  context.PS.render.webgpuCompositor.draw({
    albedoTexture: attachments.albedo.texture,
    normalHeightTexture: attachments.normalHeight.texture
  }),
  true,
  "WebGPU compositor should draw from G-buffer textures"
);

const composePass = fakePasses[fakePasses.length - 1];
assert.deepStrictEqual(composePass.draws[0], [4, 1, 0, 0], "WebGPU compositor should draw one fullscreen quad");
assert.ok(
  fakeDevice.pipelines[0].descriptor.fragment.targets[0].blend,
  "WebGPU compositor pipeline should alpha-blend lit G-buffer output"
);
assert.strictEqual(fakeDevice.pipelines.length, 1, "WebGPU compositor should create one render pipeline");
assert.strictEqual(fakeDevice.bindGroups.length, 1, "WebGPU compositor should create one bind group");
assert.strictEqual(fakeDevice.bindGroups[0].descriptor.entries.length, 4, "WebGPU compositor bind group should include albedo, normal/height, sampler, and uniforms");
assert.ok(fakeDevice.writes.some(function (write) { return write.buffer.descriptor.label === "gbuffer-compose.uniforms"; }), "WebGPU compositor should upload lighting uniforms");
assert.ok(fakeDevice.writes[0].data[0] !== 0, "WebGPU compositor sun direction x should be non-zero");
assert.ok(fakeDevice.writes[0].data[4] > 0, "WebGPU compositor ambient should be non-zero");
assert.ok(nearly(fakeDevice.writes[0].data[4], 0.32), "WebGPU compositor default ambient should be uploaded");
assert.strictEqual(fakeDevice.submits.length, 1, "WebGPU compositor should submit standalone command buffers");
assert.strictEqual(context.PS.render.webgpuCompositor.getStats().drawCount, 1, "WebGPU compositor stats should count draws");
assert.strictEqual(context.PS.render.webgpuCompositor.getStats().lastError, "", "WebGPU compositor draw should clear last error");

const customUniforms = context.PS.render.webgpuCompositor.makeUniformData({
  sunDirection: { x: 0, y: 3, z: 4 },
  ambient: 0.44,
  directionalStrength: 0.61,
  wrapStrength: 0.17,
  heightTintStrength: 0.09
});
assert.strictEqual(customUniforms[0], 0, "explicit sun direction x should propagate");
assert.ok(nearly(customUniforms[1], 0.6), "explicit sun direction y should normalize");
assert.ok(nearly(customUniforms[2], 0.8), "explicit sun direction z should normalize");
assert.ok(nearly(customUniforms[4], 0.44), "explicit ambient should propagate");
assert.ok(nearly(customUniforms[5], 0.61), "explicit directional strength should propagate");
assert.ok(nearly(customUniforms[6], 0.17), "explicit wrap strength should propagate");
assert.ok(nearly(customUniforms[7], 0.09), "explicit height tint strength should propagate");

console.log("webgpu gbuffer compositor checks passed");
