const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");
const { createFakeRenderDevice } = require("./helpers/mock-factories.js");

const namespaceSource = read("js/core/namespace.js");
const mainLoopSource = read("js/main-loop.js");
const managerSource = read("js/render/wgsl-shader-manager.js");
const targetsSource = read("js/render/webgpu-targets.js");
const gbufferSource = read("js/render/webgpu-gbuffer.js");
const lightingCycleSource = read("js/render/lighting-cycle.js");
const batcherSource = read("js/render/surface-tile-batcher.js");
const pointLightSource = read("js/render/webgpu-point-lights.js");
const surfaceTileSource = read("js/render/webgpu-surface-tile.js");
const rendererSource = read("js/render/webgpu-renderer.js");
const entitiesSource = read("js/render/entities.js");
const pointLightWgsl = read("shaders/point-light.wgsl");
const pointLightSidecar = read("shaders/point-light.wgsl.js");

assert.ok(
  namespaceSource.indexOf("js/render/webgpu-compositor.js") < namespaceSource.indexOf("js/render/webgpu-point-lights.js"),
  "WebGPU point lights should load after the compositor"
);
assert.ok(
  namespaceSource.indexOf("js/render/webgpu-point-lights.js") < namespaceSource.indexOf("js/render/webgpu-entity.js"),
  "WebGPU point lights should load before entity renderers can queue settlement lights"
);
assert.ok(
  mainLoopSource.indexOf("PS.render.webgpuPointLights") >= 0,
  "startup should register point-light WGSL before first draw"
);
assert.strictEqual(pointLightSource.toLowerCase().indexOf("webgl"), -1, "point-light renderer must not reference WebGL");
assert.ok(pointLightWgsl.indexOf("@fragment") >= 0, "point-light WGSL should define a fragment stage");
assert.ok(pointLightWgsl.indexOf("fn fs_main") >= 0, "point-light WGSL should define a fragment entry");
assert.ok(pointLightWgsl.indexOf("var<storage, read> point_lights") >= 0, "point-light WGSL should use a storage buffer for lights");
assert.ok(pointLightWgsl.indexOf("scene_exposure: f32") >= 0, "point-light WGSL should carry scene exposure in uniforms");
assert.ok(pointLightWgsl.indexOf("* exposure") >= 0, "point-light WGSL should scale additive light by scene exposure");
assert.ok(pointLightSidecar.indexOf("SHADER_SHADERS_POINT_LIGHT_WGSL") >= 0, "point-light sidecar should expose global WGSL");
assert.ok(pointLightSidecar.indexOf(JSON.stringify(pointLightWgsl)) >= 0, "point-light sidecar should embed raw WGSL");
assert.ok(pointLightSidecar.indexOf('PS.assets.registerText("shaders/point-light.wgsl"') >= 0, "point-light sidecar should register shader text");
assert.ok(surfaceTileSource.indexOf("webgpuPointLights.draw") >= 0, "surface tile draw should submit terrain point lights");
assert.ok(rendererSource.indexOf("webgpuPointLights.queueLight") >= 0, "renderer addLight should queue WebGPU point lights");
assert.ok(entitiesSource.indexOf("settlementTorch") >= 0, "settlement rendering should queue torch point lights");

const { fakeDevice, fakePasses, makeTexture, queueWrites, submissions } = createFakeRenderDevice();

const context = {
  PS: {
    assets: {},
    render: {},
    gpu: {
      device: fakeDevice,
      queue: fakeDevice.queue,
      format: "bgra8unorm",
      canvas: { width: 320, height: 180 },
      context: {
        getCurrentTexture() {
          return makeTexture("swapchain");
        }
      }
    },
    ranmap: {
      variant(x, y, mod) {
        if (mod === 13) {
          return 0;
        }
        return Math.abs(Math.round(x) + Math.round(y)) % mod;
      }
    }
  },
  CONFIG: { TILE_SIZE: 16 },
  world: { isPaused: true, isCameraInteracting: false },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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
vm.runInContext(pointLightSource, context, { filename: "js/render/webgpu-point-lights.js" });
vm.runInContext(batcherSource, context, { filename: "js/render/surface-tile-batcher.js" });

const pointLights = context.PS.render.webgpuPointLights;
context.PS.render.wgslShaders.register("point-light", pointLightWgsl, { path: "shaders/point-light.wgsl" });
pointLights.registerManifest();

assert.ok(
  context.PS.render.wgslShaderManifest.some(function (entry) { return entry.name === "point-light"; }),
  "point-light shader should be in the WGSL manifest"
);

const batches = context.PS.render.surfaceTileBatcher.beginBatches();
assert.strictEqual(
  context.PS.render.surfaceTileBatcher.appendSamplePointLights(
    batches,
    { biome: "desert", detail: { surface: "magma flow", materialSignals: { lava: 0.8 } } },
    "desert",
    10,
    20,
    16,
    2,
    3
  ),
  true,
  "lava terrain samples should emit point lights"
);
assert.strictEqual(
  context.PS.render.surfaceTileBatcher.appendSamplePointLights(
    batches,
    { biome: "mountain", detail: { surface: "volcano vent", feature: "active vent", materialSignals: { heat: 0.9 } } },
    "mountain",
    14,
    24,
    16,
    4,
    5
  ),
  true,
  "volcano vent samples should emit point lights"
);
assert.strictEqual(
  context.PS.render.surfaceTileBatcher.appendSamplePointLights(
    batches,
    { biome: "ocean", detail: { surface: "deep water", materialSignals: { waterDepth: 0.9 } } },
    "ocean",
    30,
    40,
    16,
    13,
    26
  ),
  true,
  "deep ocean samples should emit sparse bioluminescent lights"
);
assert.strictEqual(
  JSON.stringify(Array.from(batches.pointLights).map(function (light) { return light.kind; })),
  JSON.stringify(["lava", "volcano", "bioluminescence"]),
  "terrain batches should tag emitted point light kinds"
);
assert.strictEqual(batches.pointLights[1].radius, 16 * 8, "volcano lights should use the configured eight-tile radius");
assert.strictEqual(
  JSON.stringify(Array.from(batches.pointLights[1].color)),
  JSON.stringify([1, 0.2, 0]),
  "volcano lights should use the configured hot orange color"
);

pointLights.queueLight(12, 14, 20, [1, 0.75, 0.2], 0.7, "settlementTorch");
assert.strictEqual(pointLights.getStats().queuedLightCount, 1, "queued point light stats should count queued lights");
assert.strictEqual(pointLights.takeQueuedLights()[0].kind, "settlementTorch", "queued point lights should preserve kind tags");
assert.strictEqual(pointLights.getStats().queuedLightCount, 0, "takeQueuedLights should clear the queue");

const scaledLights = pointLights.scaleLights([{ x: 4, y: 6, radius: 20, color: [1, 1, 1], intensity: 0.8, kind: "test" }], 0.25);
assert.strictEqual(scaledLights.length, 1, "point-light LOD scaling should preserve visible light records");
assert.strictEqual(scaledLights[0].radius, 5, "point-light LOD scaling should reduce radius");
assert.strictEqual(scaledLights[0].intensity, 0.2, "point-light LOD scaling should reduce intensity");
assert.strictEqual(pointLights.scaleLights(scaledLights).length, 1, "missing point-light LOD scale should default to full visibility");
assert.strictEqual(pointLights.scaleLights(scaledLights, 0).length, 0, "zero point-light LOD scale should drop lights before GPU draw");
pointLights.queueLight(10, 10, 16, [1, 0.7, 0.2], 1, "wideZoomTorch");
assert.strictEqual(pointLights.drawQueued({ pointLightScale: 0 }), false, "queued point lights should not draw when LOD scale is zero");
assert.strictEqual(pointLights.getStats().queuedLightCount, 0, "zero-scale queued point-light draw should still drain the queue");
assert.strictEqual(pointLights.getStats().submittedLights, 0, "zero-scale queued point-light draw should publish zero submitted lights");

const manyLights = [];
for (let i = 0; i < 70; i += 1) {
  manyLights.push({ x: 20 + i, y: 30, radius: 24, color: [1, 1, 1], intensity: 1, kind: "test" });
}
manyLights.push({ x: -200, y: -200, radius: 10, color: [1, 1, 1], intensity: 1, kind: "offscreen" });
const cullResult = pointLights.cullLights(manyLights, 320, 180);
assert.strictEqual(cullResult.visible.length, 64, "point-light culling should cap visible lights");
assert.strictEqual(cullResult.culled, 7, "point-light culling should count offscreen and over-budget lights");

const nightExposure = pointLights.getSceneExposure({ timeOfDay: 0.86 });
const noonExposure = pointLights.getSceneExposure({ timeOfDay: 0.5 });
assert.ok(nightExposure < noonExposure, "point-light exposure should scale down with night ambient");

assert.strictEqual(
  pointLights.draw({
    lights: batches.pointLights,
    width: 320,
    height: 180,
    timeOfDay: 0.86
  }),
  true,
  "point-light renderer should draw visible lights"
);

const pipelineDescriptor = fakeDevice.pipelines[0].descriptor;
assert.strictEqual(pipelineDescriptor.label, "point-light.pipeline", "point-light pipeline should be created");
assert.strictEqual(pipelineDescriptor.fragment.targets[0].blend.color.srcFactor, "one", "point-light blend should be additive source");
assert.strictEqual(pipelineDescriptor.fragment.targets[0].blend.color.dstFactor, "one", "point-light blend should be additive destination");
assert.strictEqual(fakePasses[0].descriptor.label, "point-light.render-pass", "point lights should use a labeled WebGPU render pass");
assert.strictEqual(
  JSON.stringify(Array.from(fakePasses[0].draws[0])),
  JSON.stringify([4, 3, 0, 0]),
  "point lights should draw one quad per visible light"
);
assert.ok(queueWrites.some(function (write) { return write.buffer.descriptor.label === "point-light.uniforms"; }), "point-light uniforms should upload to WebGPU");
assert.ok(queueWrites.some(function (write) { return write.buffer.descriptor.label === "point-light.instances.storage"; }), "point-light storage buffer should upload light data");
const pointUniformWrite = queueWrites.find(function (write) { return write.buffer.descriptor.label === "point-light.uniforms"; });
assert.ok(pointUniformWrite.data[2] < noonExposure, "night point-light uniform should upload dimmed scene exposure");
assert.ok(pointUniformWrite.data[2] >= 0.30, "night point lights should remain visible instead of being suppressed");
assert.strictEqual(submissions.length, 1, "standalone point-light draw should submit a command buffer");
assert.strictEqual(pointLights.getStats().drawCount, 1, "point-light stats should count draws");
assert.strictEqual(pointLights.getStats().submittedLights, 3, "point-light stats should count submitted lights");
assert.strictEqual(pointLights.getStats().lastError, "", "successful point-light draw should clear lastError");

console.log("webgpu point light checks passed");
