const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

function nearly(actual, expected) {
  return Math.abs(Number(actual) - Number(expected)) < 0.00001;
}

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const targetsSource = read("js/render/webgpu-targets.js");
const gbufferSource = read("js/render/webgpu-gbuffer.js");
const lightingCycleSource = read("js/render/lighting-cycle.js");
const compositorSource = read("js/render/webgpu-compositor.js");
const managerSource = read("js/render/wgsl-shader-manager.js");
const shaderSource = read("shaders/gbuffer-compose.wgsl");
const sidecarSource = read("shaders/gbuffer-compose.wgsl.js");

assert.ok(
  manifestSource.indexOf("js/render/webgpu-targets.js") < manifestSource.indexOf("js/render/webgpu-gbuffer.js"),
  "WebGPU G-buffer should load after WebGPU targets"
);
assert.ok(
  manifestSource.indexOf("js/render/webgpu-gbuffer.js") < manifestSource.indexOf("js/render/webgpu-compositor.js"),
  "WebGPU compositor should load after WebGPU G-buffer"
);
assert.ok(
  manifestSource.indexOf("js/render/webgpu-compositor.js") < manifestSource.indexOf("js/render/webgpu-globe.js"),
  "WebGPU compositor should load before globe consumers"
);
assert.strictEqual(manifestSource.indexOf("js/render/webgl-gbuffer.js"), -1, "runtime manifest must not load legacy WebGL G-buffer");
assert.strictEqual(manifestSource.indexOf("js/render/webgl-compositor.js"), -1, "runtime manifest must not load legacy WebGL compositor");
assert.ok(sidecarSource.indexOf("SHADER_SHADERS_GBUFFER_COMPOSE_WGSL") >= 0, "G-buffer compositor sidecar should expose global WGSL source");
assert.ok(sidecarSource.indexOf(JSON.stringify(shaderSource)) >= 0, "G-buffer compositor sidecar should embed raw WGSL source");
assert.ok(sidecarSource.indexOf('PS.assets.registerText("shaders/gbuffer-compose.wgsl"') >= 0, "G-buffer compositor sidecar should register shader text");
assert.strictEqual(gbufferSource.toLowerCase().indexOf("webgl"), -1, "WebGPU G-buffer source must not reference WebGL");
assert.strictEqual(compositorSource.toLowerCase().indexOf("webgl"), -1, "WebGPU compositor source must not reference WebGL");
assert.ok(shaderSource.indexOf("var<uniform> compose: ComposeUniforms") >= 0, "G-buffer compose shader should bind lighting uniforms");
assert.ok(shaderSource.indexOf("cloud: vec4<f32>") >= 0, "G-buffer compose shader should bind cloud-shadow uniforms");
assert.ok(shaderSource.indexOf("textureSample(albedo_texture") >= 0, "G-buffer compose shader should sample albedo");
assert.ok(shaderSource.indexOf("textureSample(normal_height_texture") >= 0, "G-buffer compose shader should sample normal/height");
assert.ok(shaderSource.indexOf("textureSample(cloud_shadow_texture") >= 0, "G-buffer compose shader should sample the cloud-shadow texture in the compose pass");
assert.ok(shaderSource.indexOf("let light_dir = normalize(compose.sun_direction.xyz)") >= 0, "G-buffer compose shader should use uniform sun direction");
assert.ok(shaderSource.indexOf("compose.lighting.x") >= 0, "G-buffer compose shader should use uniform ambient");
assert.strictEqual(shaderSource.indexOf("let ambient = 0.32"), -1, "G-buffer compose shader must not hardcode ambient lighting");
assert.ok(shaderSource.indexOf("ambient_tint_luma") >= 0, "G-buffer compose shader should normalize ambient tint luminance");
assert.ok(shaderSource.indexOf("ambient_hue_tint") >= 0, "G-buffer compose shader should keep ambient color as hue instead of independent darkness");
assert.ok(shaderSource.indexOf("surface_exposure") >= 0, "G-buffer compose shader should publish one final surface exposure term");
assert.ok(shaderSource.indexOf("lod: vec4<f32>") >= 0, "G-buffer compose shader should accept visual LOD controls");
assert.ok(shaderSource.indexOf("if (normal_strength > 0.0)") >= 0, "G-buffer compose shader should skip normal sampling when visual LOD disables it");
assert.ok(shaderSource.indexOf("low_light_relief_visibility") >= 0, "G-buffer compose shader should compensate relief-darkened albedo only in low light");
assert.ok(shaderSource.indexOf("final_exposure") >= 0, "G-buffer compose shader should collapse relief and lighting into one final exposure");
assert.ok(shaderSource.indexOf("cloud_alpha") >= 0, "G-buffer compose shader should apply bounded cloud-shadow opacity");

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
    },
    writeTexture(destination, data, layout, size) {
      fakeDevice.textureWrites.push({ destination, data, layout, size });
    }
  },
  textureWrites: [],
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
    render: {
      environmentOverlays: {
        cloudShadowSize: 256,
        ensureCloudShadowMap() {
          const data = new Uint8Array(256 * 256);
          for (let i = 0; i < data.length; i += 1) {
            data[i] = i % 256;
          }
          return data;
        },
        getNowSeconds() {
          return 10;
        }
      }
    },
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
  Uint8Array,
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
vm.runInContext(lightingCycleSource, context, { filename: "js/render/lighting-cycle.js" });
vm.runInContext(compositorSource, context, { filename: "js/render/webgpu-compositor.js" });

context.PS.render.wgslShaders.register("gbuffer-compose", shaderSource, { path: "shaders/gbuffer-compose.wgsl" });
context.PS.render.webgpuCompositor.registerManifest();

const attachments = context.PS.render.webgpuGbuffer.ensure(320, 180, fakeDevice);
assert.strictEqual(attachments.albedo.format, "bgra8unorm", "G-buffer albedo should use presentation format");
assert.strictEqual(attachments.normalHeight.format, "rgba16float", "G-buffer normal/height target should use float format");
assert.strictEqual(attachments.depth.format, "depth24plus", "G-buffer depth target should use depth format");
assert.strictEqual(context.PS.render.webgpuGbuffer.getStats().ready, true, "G-buffer should report ready after attachment creation");
const firstGbufferTextures = fakeDevice.textures.slice(0, 3);
context.PS.render.webgpuGbuffer.ensure(640, 360, fakeDevice);
assert.strictEqual(firstGbufferTextures.every(function (texture) { return texture.destroyed; }), true, "G-buffer resize should destroy old attachments");
assert.strictEqual(fakeDevice.textures.length, 6, "G-buffer resize should recreate all attachments after teardown");
context.PS.render.webgpuGbuffer.ensure(640, 360, fakeDevice);
assert.strictEqual(fakeDevice.textures.length, 6, "same-size G-buffer ensure should reuse existing attachments");

const encoder = fakeDevice.createCommandEncoder({ label: "test.encoder" });
const terrainPass = context.PS.render.webgpuGbuffer.beginTerrainPass(encoder, 640, 360, fakeDevice);
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
assert.strictEqual(fakeDevice.bindGroups[0].descriptor.entries.length, 5, "WebGPU compositor bind group should include albedo, normal/height, sampler, uniforms, and cloud shadow texture");
assert.strictEqual(fakeDevice.bindGroups[0].descriptor.entries[4].binding, 4, "WebGPU compositor should bind the cloud shadow texture at binding 4");
assert.ok(fakeDevice.writes.some(function (write) { return write.buffer.descriptor.label === "gbuffer-compose.uniforms"; }), "WebGPU compositor should upload lighting uniforms");
assert.ok(fakeDevice.textureWrites.some(function (write) {
  return write.destination.texture.descriptor.label === "gbuffer-compose.cloud-shadow" &&
    write.size.width === 256 &&
    write.size.height === 256 &&
    write.layout.bytesPerRow === 256 * 4;
}), "WebGPU compositor should upload the cached 256x256 cloud-shadow texture");
assert.ok(fakeDevice.writes[0].data[0] !== 0, "WebGPU compositor sun direction x should be non-zero");
assert.ok(fakeDevice.writes[0].data[4] > 0, "WebGPU compositor ambient should be non-zero");
assert.ok(fakeDevice.writes[0].data[4] >= 0.45, "WebGPU compositor default ambient should come from the lighting cycle");
assert.strictEqual(fakeDevice.submits.length, 1, "WebGPU compositor should submit standalone command buffers");
assert.strictEqual(context.PS.render.webgpuCompositor.getStats().drawCount, 1, "WebGPU compositor stats should count draws");
assert.strictEqual(context.PS.render.webgpuCompositor.getStats().lastError, "", "WebGPU compositor draw should clear last error");

const customUniforms = context.PS.render.webgpuCompositor.makeUniformData({
  sunDirection: { x: 0, y: 3, z: 4 },
  ambient: 0.44,
  directionalStrength: 0.61,
  wrapStrength: 0.17,
  heightTintStrength: 0.09,
  normalLightingStrength: 0.35,
  normalMappedLighting: "reduced"
});
assert.strictEqual(customUniforms.length, 20, "compositor uniforms should include aligned LOD and cloud control vec4s");
assert.strictEqual(customUniforms[0], 0, "explicit sun direction x should propagate");
assert.ok(nearly(customUniforms[1], 0.6), "explicit sun direction y should normalize");
assert.ok(nearly(customUniforms[2], 0.8), "explicit sun direction z should normalize");
assert.ok(nearly(customUniforms[4], 0.44), "explicit ambient should propagate");
assert.ok(nearly(customUniforms[5], 0.61), "explicit directional strength should propagate");
assert.ok(nearly(customUniforms[6], 0.17), "explicit wrap strength should propagate");
assert.ok(nearly(customUniforms[7], 0.09), "explicit height tint strength should propagate");
assert.ok(nearly(customUniforms[12], 0.35), "explicit normal lighting strength should propagate into visual LOD uniforms");
assert.strictEqual(customUniforms[13], 1, "reduced normal mapped lighting should keep normal sampling enabled");
assert.ok(nearly(customUniforms[17], 0.2), "default cloud shadow max alpha should stay capped at 20 percent");

const customCloudUniforms = context.PS.render.webgpuCompositor.makeUniformData({
  cloudShadow: {
    scale: [0.5, 0.5],
    scroll: [0.12, 0.34],
    maxAlpha: 0.16
  }
});
assert.ok(nearly(customCloudUniforms[16], 0.5), "cloud shadow UV scale should propagate into compose uniforms");
assert.ok(nearly(customCloudUniforms[17], 0.16), "cloud shadow opacity should propagate into compose uniforms");
assert.ok(nearly(customCloudUniforms[18], 0.12), "cloud shadow X scroll should propagate into compose uniforms");
assert.ok(nearly(customCloudUniforms[19], 0.34), "cloud shadow Y scroll should propagate into compose uniforms");

const disabledNormalUniforms = context.PS.render.webgpuCompositor.makeUniformData({
  normalLightingStrength: 1,
  normalMappedLighting: "disabled"
});
assert.strictEqual(disabledNormalUniforms[12], 0, "disabled normal mapped lighting should force zero normal strength");
assert.strictEqual(disabledNormalUniforms[13], 0, "disabled normal mapped lighting should publish disabled mode");

function estimateSurfaceExposure(lightingState) {
  var lit = estimateRawLighting(lightingState);
  return Math.max(Math.max(0.20, Math.min(1.22, lit)), 0.68);
}

function estimateRawLighting(lightingState) {
  var normal = { x: 0, y: 0, z: 1 };
  var sun = lightingState.sunDirection;
  var dot = normal.x * sun.x + normal.y * sun.y + normal.z * sun.z;
  var directional = Math.max(dot, 0);
  var wrap = Math.max(0, Math.min(1, dot * 0.5 + 0.5));
  return lightingState.ambient + directional * lightingState.directionalStrength + wrap * lightingState.wrapStrength;
}

function estimateFinalExposure(lightingState, albedoLuma) {
  var rawExposure = Math.max(0.20, Math.min(1.22, estimateRawLighting(lightingState)));
  var surfaceExposure = Math.max(rawExposure, 0.68);
  var lowLightReliefVisibility = Math.max(0, Math.min(1, (0.68 - rawExposure) / 0.19));
  var reliefVisibilityExposure = Math.min(Math.max(surfaceExposure, 0.26 / Math.max(albedoLuma, 0.01)), 1.22);
  return surfaceExposure + (reliefVisibilityExposure - surfaceExposure) * lowLightReliefVisibility;
}

function estimateTintLuma(ambientColor) {
  var luma = Math.max(
    ambientColor[0] * 0.2126 + ambientColor[1] * 0.7152 + ambientColor[2] * 0.0722,
    0.01
  );
  var tint = [
    Math.max(0.72, Math.min(1.24, ambientColor[0] / luma)),
    Math.max(0.72, Math.min(1.24, ambientColor[1] / luma)),
    Math.max(0.72, Math.min(1.24, ambientColor[2] / luma))
  ];
  return tint[0] * 0.2126 + tint[1] * 0.7152 + tint[2] * 0.0722;
}

function estimateOldCompositorBrightness(lightingState) {
  var normal = { x: 0, y: 0, z: 1 };
  var sun = lightingState.sunDirection;
  var dot = normal.x * sun.x + normal.y * sun.y + normal.z * sun.z;
  var directional = Math.max(dot, 0);
  var wrap = Math.max(0, Math.min(1, dot * 0.5 + 0.5));
  var lit = lightingState.ambient + directional * lightingState.directionalStrength + wrap * lightingState.wrapStrength;
  var luma = lightingState.ambientColor[0] * 0.2126 + lightingState.ambientColor[1] * 0.7152 + lightingState.ambientColor[2] * 0.0722;
  return preShadedAlbedo * luma * Math.max(0.20, Math.min(1.22, lit));
}

const nightCycle = context.PS.render.lightingCycle.getState({ timeOfDay: 0.86 });
const noonCycle = context.PS.render.lightingCycle.getState({ timeOfDay: 0.5 });
const nightShadowCycle = Object.assign({}, nightCycle, {
  sunDirection: { x: 0, y: 0, z: -1 }
});
const preShadedAlbedo = 0.52;
const nightBrightness = preShadedAlbedo * estimateTintLuma(nightCycle.ambientColor) * estimateFinalExposure(nightCycle, preShadedAlbedo);
const noonBrightness = preShadedAlbedo * estimateTintLuma(noonCycle.ambientColor) * estimateFinalExposure(noonCycle, preShadedAlbedo);
const mountainShadowAlbedo = 0.30;
const nightMountainShadowBrightness = mountainShadowAlbedo *
  estimateTintLuma(nightShadowCycle.ambientColor) *
  estimateFinalExposure(nightShadowCycle, mountainShadowAlbedo);

assert.ok(nightBrightness >= 0.35, "night tile brightness should remain above the visible terrain threshold");
assert.ok(nightMountainShadowBrightness >= 0.25, "night mountain shadow-side tiles should remain visible after relief compensation");
assert.ok(noonBrightness >= estimateOldCompositorBrightness(noonCycle), "day-time brightness should not regress versus the old compositor");

console.log("webgpu gbuffer compositor checks passed");
