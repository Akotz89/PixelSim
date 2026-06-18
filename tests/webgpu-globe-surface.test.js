const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const managerSource = read("js/render/wgsl-shader-manager.js");
const lightingCycleSource = read("js/render/lighting-cycle.js");
const globeSource = read("js/render/webgpu-globe.js");
const compositorSource = read("js/render/webgpu-compositor.js");
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
  "ambient_hue_tint",
  "surface_exposure",
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
const queueTextureWrites = [];
function makeTexture(label) {
  return {
    label,
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
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
    writeTexture(destination, data, layout, size) {
      queueTextureWrites.push({ destination, data: new Uint8Array(data), layout, size });
    },
    submit(commandBuffers) {
      queueSubmits.push(commandBuffers);
    }
  },
  createTexture(descriptor) {
    const texture = makeTexture(descriptor.label);
    texture.descriptor = descriptor;
    return texture;
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
  world: {
    tick: 0,
    seedText: "globe-refresh-test",
    generationSnapshot: { terrainDigest: "terrain-a" },
    planetTiles: [{ biome: "forest" }, { biome: "water" }, { biome: "desert" }, { biome: "ice" }],
    terrain: [1, 2, 3, 4]
  },
  WORLD_WIDTH: 2,
  WORLD_HEIGHT: 2,
  getPlanetTile(x, y) {
    return context.world.planetTiles[y * 2 + x];
  },
  getPlanetTileCompositedColor() {
    return context.world.tick >= 60 ? "#204c88" : "#208844";
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
  Uint8Array,
  Float32Array
};

vm.createContext(context);
vm.runInContext(managerSource, context, { filename: "js/render/wgsl-shader-manager.js" });
vm.runInContext(lightingCycleSource, context, { filename: "js/render/lighting-cycle.js" });
vm.runInContext(globeSource, context, { filename: "js/render/webgpu-globe.js" });
vm.runInContext(compositorSource, context, { filename: "js/render/webgpu-compositor.js" });
vm.runInContext(underlaySource, context, { filename: "js/render/webgpu-surface-underlay.js" });

const globe = context.PS.render.webgpuGlobe;
const underlay = context.PS.render.webgpuSurfaceUnderlay;
context.PS.render.terrain = {
  getRgbFromHex(hex) {
    return {
      red: parseInt(hex.slice(1, 3), 16),
      green: parseInt(hex.slice(3, 5), 16),
      blue: parseInt(hex.slice(5, 7), 16)
    };
  }
};
context.PS.render.wgslShaders.register("globe-sphere", globeWgsl, { path: "shaders/globe-sphere.wgsl" });
context.PS.render.wgslShaders.register("surface-underlay", underlayWgsl, { path: "shaders/surface-underlay.wgsl" });
context.PS.render.wgslShaders.register("surface-chunk", chunkWgsl, { path: "shaders/surface-chunk.wgsl" });

globe.registerManifest();
underlay.registerManifest();
assert.ok(context.PS.render.wgslShaderManifest.some(function(entry) { return entry.name === "globe-sphere"; }), "globe shader should be in manifest");
assert.ok(context.PS.render.wgslShaderManifest.some(function(entry) { return entry.name === "surface-underlay"; }), "underlay shader should be in manifest");
assert.ok(context.PS.render.wgslShaderManifest.some(function(entry) { return entry.name === "surface-chunk"; }), "surface chunk shader should be in manifest");
assert.ok(globeSource.indexOf("terrainDigest") >= 0, "globe texture signature should include the generated terrain digest");
assert.ok(globeSource.indexOf("getTerrainTextureSize") >= 0, "globe texture upload should derive a higher-resolution terrain texture size");

const derivedTextureSize = globe.getTerrainTextureSize();
assert.strictEqual(derivedTextureSize.width, 512, "test world should upscale raw simulation tiles into a stable globe texture width");
assert.strictEqual(derivedTextureSize.height, 256, "test world should upscale raw simulation tiles into a stable globe texture height");
assert.strictEqual(derivedTextureSize.sourceWidth, 2, "derived globe texture should report source simulation width");
assert.strictEqual(derivedTextureSize.sourceHeight, 2, "derived globe texture should report source simulation height");
assert.ok(globe.getTextureSignature().indexOf(":512:256:") >= 0, "globe texture signature should include derived texture dimensions");
const sampledTerrain = globe.sampleTerrainRgb(0.5, 0.5);
assert.ok(Number.isFinite(sampledTerrain.red), "derived globe texture sampling should return numeric red channel");
assert.ok(Number.isFinite(sampledTerrain.green), "derived globe texture sampling should return numeric green channel");
assert.ok(Number.isFinite(sampledTerrain.blue), "derived globe texture sampling should return numeric blue channel");

const transitionLightingOptions = { timeOfDay: 0.86 };
const globeTransitionUniforms = globe.makeUniformData({
  centerX: 400,
  centerY: 300,
  radius: 250,
  viewLatitudeDeg: 0,
  viewLongitudeDeg: 0
}, null, transitionLightingOptions);
const tileTransitionUniforms = context.PS.render.webgpuCompositor.makeUniformData(transitionLightingOptions);
assert.strictEqual(globeTransitionUniforms.length, 24, "globe uniforms should include lighting-cycle values");
assert.strictEqual(globeTransitionUniforms[12], tileTransitionUniforms[0], "globe and tile sun x should share the lighting-cycle direction");
assert.strictEqual(globeTransitionUniforms[13], tileTransitionUniforms[1], "globe and tile sun y should share the lighting-cycle direction");
assert.strictEqual(globeTransitionUniforms[14], tileTransitionUniforms[2], "globe and tile sun z should share the lighting-cycle direction");
assert.strictEqual(globeTransitionUniforms[16], tileTransitionUniforms[4], "globe and tile ambient intensity should match");
assert.strictEqual(globeTransitionUniforms[17], tileTransitionUniforms[5], "globe and tile directional strength should match");
assert.strictEqual(globeTransitionUniforms[18], tileTransitionUniforms[6], "globe and tile wrap strength should match");
assert.strictEqual(globeTransitionUniforms[20], tileTransitionUniforms[8], "globe and tile ambient tint red should match");
assert.strictEqual(globeTransitionUniforms[21], tileTransitionUniforms[9], "globe and tile ambient tint green should match");
assert.strictEqual(globeTransitionUniforms[22], tileTransitionUniforms[10], "globe and tile ambient tint blue should match");

const firstUploadedTerrain = globe.uploadTerrainTexture(fakeDevice);
assert.strictEqual(globe.state.textureUploadCount, 1, "initial globe terrain upload should create a texture");
assert.strictEqual(firstUploadedTerrain.descriptor.size.width, 512, "globe terrain upload should use derived texture width");
assert.strictEqual(firstUploadedTerrain.descriptor.size.height, 256, "globe terrain upload should use derived texture height");
assert.strictEqual(queueTextureWrites[0].layout.bytesPerRow, 512 * 4, "globe terrain upload should use derived texture row stride");
assert.strictEqual(queueTextureWrites[0].data.length, 512 * 256 * 4, "globe terrain upload should write a full derived RGBA texture");
context.world.tick = 30;
assert.strictEqual(globe.uploadTerrainTexture(fakeDevice), firstUploadedTerrain, "runtime tick changes should reuse globe terrain texture");
assert.strictEqual(globe.state.textureUploadCount, 1, "runtime tick changes should not re-upload terrain every frame");
context.world.tick = 60;
assert.strictEqual(globe.uploadTerrainTexture(fakeDevice), firstUploadedTerrain, "new tick bucket without terrain digest change should still reuse globe terrain texture");
assert.strictEqual(globe.state.textureUploadCount, 1, "periodic tick buckets should not cause globe texture hitches");
context.world.generationSnapshot.terrainDigest = "terrain-b";
const refreshedTerrain = globe.uploadTerrainTexture(fakeDevice);
assert.notStrictEqual(refreshedTerrain, firstUploadedTerrain, "new terrain digest should refresh globe terrain texture");
assert.strictEqual(firstUploadedTerrain.destroyed, true, "old globe terrain texture should be destroyed after refresh");
assert.strictEqual(globe.state.textureUploadCount, 2, "new terrain digest should count one terrain re-upload");
assert.strictEqual(queueTextureWrites.length, 2, "terrain texture writes should happen only on initial upload and digest refresh");
assert.notStrictEqual(queueTextureWrites[0].data[2], queueTextureWrites[1].data[2], "refreshed terrain upload should reflect changed simulated tile colors");

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
assert.strictEqual(queueWrites[0].data.length, 24, "globe uniforms should be 96 bytes");
assert.ok(Number.isFinite(queueWrites[0].data[12]), "globe uniforms should include normalized sun direction x");
assert.ok(Number.isFinite(queueWrites[0].data[14]), "globe uniforms should include normalized sun direction z");
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
