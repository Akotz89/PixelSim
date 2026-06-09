const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const namespaceSource = read("js/core/namespace.js");
const managerSource = read("js/render/wgsl-shader-manager.js");
const globeSource = read("js/render/webgpu-globe.js");
const underlaySource = read("js/render/webgpu-surface-underlay.js");
const globeWgsl = read("shaders/globe-sphere.wgsl");
const underlayWgsl = read("shaders/surface-underlay.wgsl");
const chunkWgsl = read("shaders/surface-chunk.wgsl");

assert.ok(
  namespaceSource.indexOf("js/render/webgpu-globe.js") > namespaceSource.indexOf("js/render/webgpu-targets.js"),
  "WebGPU globe should load after WebGPU targets"
);
assert.ok(
  namespaceSource.indexOf("js/render/webgpu-surface-underlay.js") > namespaceSource.indexOf("js/render/webgpu-globe.js"),
  "WebGPU surface underlay should load after WebGPU globe"
);
assert.ok(
  namespaceSource.indexOf("js/render/webgpu-surface-underlay.js") < namespaceSource.indexOf("js/render/webgpu-renderer.js"),
  "WebGPU planet renderers should load before the WebGPU renderer"
);
assert.strictEqual(namespaceSource.indexOf("js/render/gl.js"), -1, "runtime manifest must not load the legacy WebGL bootstrap");

[
  "@vertex",
  "fn vs_main",
  "@fragment",
  "fn fs_main",
  "textureSample(terrain_texture",
  "textureSample(overlay_texture",
  "sun_direction",
  "ocean_mask",
  "atan2(nx",
  "terrain_u = fract",
  "terrain_v = clamp",
  "SPACE_COLOR",
  "ATMOSPHERE_BLUE",
  "daylight = clamp",
  "specular",
  "terminator",
  "limb = clamp(pow",
  "overlay_mode"
].forEach(function(required) {
  assert.ok(globeWgsl.indexOf(required) >= 0, "globe WGSL should contain " + required);
});

[
  "degrees_per_pixel",
  "latitude_shade",
  "vignette",
  "textureSample(terrain_texture"
].forEach(function(required) {
  assert.ok(underlayWgsl.indexOf(required) >= 0, "surface underlay WGSL should contain " + required);
});

assert.ok(chunkWgsl.indexOf("color.a * chunk.alpha") >= 0, "surface chunk WGSL should preserve alpha modulation");

[
  "globe-sphere",
  "surface-underlay",
  "surface-chunk"
].forEach(function(name) {
  const shader = read("shaders/" + name + ".wgsl");
  const sidecar = read("shaders/" + name + ".wgsl.js");
  const globalName = "SHADER_SHADERS_" + name.replace(/-/g, "_").toUpperCase() + "_WGSL";
  const context = {
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

  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(sidecar, context, { filename: "shaders/" + name + ".wgsl.js" });
  assert.strictEqual(context.window[globalName], shader, name + " sidecar should match raw WGSL");
  assert.strictEqual(context.PS.assets.url, "shaders/" + name + ".wgsl", name + " sidecar should register shader path");
});

const queueWrites = [];
const queueSubmits = [];
function makeTexture(label) {
  return {
    label,
    createView() {
      return { texture: this };
    }
  };
}

const fakeDevice = {
  modules: [],
  pipelines: [],
  bindGroups: [],
  buffers: [],
  samplers: [],
  passes: [],
  queue: {
    writeBuffer(buffer, offset, data) {
      queueWrites.push({ buffer, offset, data });
    },
    submit(commandBuffers) {
      queueSubmits.push(commandBuffers);
    }
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
  createSampler(descriptor) {
    const sampler = { descriptor };
    this.samplers.push(sampler);
    return sampler;
  },
  createBuffer(descriptor) {
    const buffer = { descriptor };
    this.buffers.push(buffer);
    return buffer;
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
      beginRenderPass(passDescriptor) {
        const pass = {
          descriptor: passDescriptor,
          pipeline: null,
          bindGroups: [],
          drawArgs: null,
          setPipeline(pipeline) {
            this.pipeline = pipeline;
          },
          setBindGroup(index, bindGroup) {
            this.bindGroups[index] = bindGroup;
          },
          draw(vertexCount, instanceCount, firstVertex, firstInstance) {
            this.drawArgs = [vertexCount, instanceCount, firstVertex, firstInstance];
          },
          end() {
            this.ended = true;
          }
        };
        this.passes.push(pass);
        fakeDevice.passes.push(pass);
        return pass;
      },
      finish() {
        this.finished = true;
        return { encoder: this };
      }
    };
    return encoder;
  }
};

const context = {
  PS: {
    render: {},
    gpu: {
      device: fakeDevice,
      queue: fakeDevice.queue,
      format: "bgra8unorm",
      canvas: { width: 800, height: 600 },
      context: {
        getCurrentTexture() {
          return makeTexture("current");
        }
      }
    }
  },
  window: {
    SHADER_SHADERS_GLOBE_SPHERE_WGSL: globeWgsl,
    SHADER_SHADERS_SURFACE_UNDERLAY_WGSL: underlayWgsl,
    SHADER_SHADERS_SURFACE_CHUNK_WGSL: chunkWgsl
  },
  Promise,
  Date,
  Object,
  String,
  Number,
  Math,
  Error,
  Array,
  Float32Array
};

vm.createContext(context);
vm.runInContext(managerSource, context, { filename: "js/render/wgsl-shader-manager.js" });
vm.runInContext(globeSource, context, { filename: "js/render/webgpu-globe.js" });
vm.runInContext(underlaySource, context, { filename: "js/render/webgpu-surface-underlay.js" });

const globe = context.PS.render.webgpuGlobe;
const underlay = context.PS.render.webgpuSurfaceUnderlay;
context.PS.render.wgslShaders.register("globe-sphere", globeWgsl, { path: "shaders/globe-sphere.wgsl" });
context.PS.render.wgslShaders.register("surface-underlay", underlayWgsl, { path: "shaders/surface-underlay.wgsl" });
context.PS.render.wgslShaders.register("surface-chunk", chunkWgsl, { path: "shaders/surface-chunk.wgsl" });

globe.registerManifest();
underlay.registerManifest();
assert.ok(context.PS.render.wgslShaderManifest.some(function(entry) { return entry.name === "globe-sphere"; }), "globe shader should be in manifest");
assert.ok(context.PS.render.wgslShaderManifest.some(function(entry) { return entry.name === "surface-underlay"; }), "underlay shader should be in manifest");
assert.ok(context.PS.render.wgslShaderManifest.some(function(entry) { return entry.name === "surface-chunk"; }), "surface chunk shader should be in manifest");

const terrainTexture = makeTexture("terrain");
const overlayTexture = makeTexture("overlay");
assert.strictEqual(globe.getOverlayMode({ blendMode: "screen" }), 1, "screen overlay should map to mode 1");
assert.strictEqual(globe.getOverlayMode({ blendMode: "plus-lighter" }), 2, "lighter overlay should map to mode 2");

assert.strictEqual(globe.drawGlobe({
  centerX: 400,
  centerY: 300,
  radius: 250,
  viewLatitudeDeg: 12,
  viewLongitudeDeg: -70
}, {
  terrainTexture,
  overlayTexture,
  overlay: { blendMode: "screen", alpha: 0.5 }
}), true, "WebGPU globe draw should succeed with WebGPU resources");

const globePass = fakeDevice.passes[0];
assert.strictEqual(fakeDevice.pipelines[0].descriptor.label, "globe-sphere.pipeline", "globe draw should create globe pipeline");
assert.strictEqual(fakeDevice.pipelines[0].descriptor.fragment.targets[0].blend.color.srcFactor, "src-alpha", "globe pipeline should use source alpha color blending");
assert.strictEqual(fakeDevice.pipelines[0].descriptor.fragment.targets[0].blend.color.dstFactor, "one-minus-src-alpha", "globe pipeline should fade over the existing color target");
assert.strictEqual(fakeDevice.pipelines[0].descriptor.fragment.targets[0].blend.alpha.srcFactor, "one", "globe pipeline should preserve source alpha contribution");
assert.deepStrictEqual(globePass.drawArgs, [4, 1, 0, 0], "globe draw should issue fullscreen quad draw");
assert.strictEqual(globePass.descriptor.colorAttachments[0].loadOp, "clear", "globe pass should clear to space color");
assert.strictEqual(fakeDevice.bindGroups[0].descriptor.entries.length, 4, "globe bind group should include terrain, overlay, sampler, uniforms");
assert.strictEqual(queueWrites[0].data.length, 16, "globe uniforms should be 64 bytes");
assert.ok(queueWrites[0].data[12] > 0.5, "globe uniforms should include normalized sun direction x");
assert.ok(queueWrites[0].data[14] > 0.2, "globe uniforms should include normalized sun direction z");
assert.strictEqual(queueWrites[0].data[15], 1, "globe uniforms should default to opaque render alpha");

assert.strictEqual(underlay.draw({
  terrainTexture,
  view: { latitude: 35, longitude: -10 },
  degreesPerPixel: { longitude: 0.1, latitude: 0.08 }
}), true, "WebGPU surface underlay draw should succeed with WebGPU resources");

const underlayPass = fakeDevice.passes[1];
assert.strictEqual(fakeDevice.pipelines[1].descriptor.label, "surface-underlay.pipeline", "underlay draw should create underlay pipeline");
assert.deepStrictEqual(underlayPass.drawArgs, [4, 1, 0, 0], "underlay draw should issue fullscreen quad draw");
assert.strictEqual(underlayPass.descriptor.colorAttachments[0].loadOp, "load", "underlay should render behind tiles without clearing");
assert.strictEqual(fakeDevice.bindGroups[1].descriptor.entries.length, 3, "underlay bind group should include terrain, sampler, uniforms");
assert.strictEqual(queueWrites[1].data.length, 8, "underlay uniforms should be 32 bytes");
assert.strictEqual(queueSubmits.length, 2, "owned WebGPU render draws should submit command buffers");

console.log("webgpu globe and surface checks passed");
