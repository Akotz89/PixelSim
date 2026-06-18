const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");
const { createFakeRenderDevice } = require("./helpers/mock-factories.js");

const namespaceSource = read("js/core/namespace.js");
const mainLoopSource = read("js/main-loop.js");
const managerSource = read("js/render/wgsl-shader-manager.js");
const targetsSource = read("js/render/webgpu-targets.js");
const gbufferSource = read("js/render/webgpu-gbuffer.js");
const batcherSource = read("js/render/surface-tile-batcher.js");
const tileLightSource = read("js/render/webgpu-tile-lights.js");
const surfaceTileSource = read("js/render/webgpu-surface-tile.js");
const rendererSource = read("js/render/webgpu-renderer.js");
const tileLightWgsl = read("shaders/tile-light.wgsl");
const tileLightSidecar = read("shaders/tile-light.wgsl.js");

assert.ok(
  namespaceSource.indexOf("js/render/webgpu-compositor.js") < namespaceSource.indexOf("js/render/webgpu-tile-lights.js") &&
    namespaceSource.indexOf("js/render/webgpu-tile-lights.js") < namespaceSource.indexOf("js/render/webgpu-point-lights.js"),
  "WebGPU tile lights should load after compositor and before point lights"
);
assert.ok(mainLoopSource.indexOf("PS.render.webgpuTileLights") >= 0, "startup should register tile-light WGSL before first draw");
assert.strictEqual(tileLightSource.toLowerCase().indexOf("webgl"), -1, "tile-light renderer must not reference WebGL");
assert.ok(tileLightWgsl.indexOf("var<storage, read> tile_lights: array<f32>") >= 0, "tile-light WGSL should read a storage grid");
assert.ok(tileLightWgsl.indexOf("sample_tile_light") >= 0, "tile-light WGSL should interpolate tile light corners");
assert.ok(tileLightWgsl.indexOf("normal_height_texture") >= 0, "tile-light pass should consume G-buffer normals");
assert.ok(tileLightSidecar.indexOf("SHADER_SHADERS_TILE_LIGHT_WGSL") >= 0, "tile-light sidecar should expose global WGSL");
assert.ok(tileLightSidecar.indexOf(JSON.stringify(tileLightWgsl)) >= 0, "tile-light sidecar should embed raw WGSL");
assert.ok(tileLightSidecar.indexOf('PS.assets.registerText("shaders/tile-light.wgsl"') >= 0, "tile-light sidecar should register shader text");
assert.ok(surfaceTileSource.indexOf("webgpuTileLights.draw") >= 0, "surface tile draw should submit tile lights after G-buffer composite");
assert.ok(rendererSource.indexOf("tileLightDraws") >= 0, "renderer stats should expose tile light draw evidence");
assert.ok(batcherSource.indexOf("tileLights: []") >= 0, "surface batches should carry causal tile light records");

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
    }
  },
  CONFIG: { TILE_SIZE: 16 },
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
vm.runInContext(tileLightSource, context, { filename: "js/render/webgpu-tile-lights.js" });
vm.runInContext(batcherSource, context, { filename: "js/render/surface-tile-batcher.js" });

const tileLights = context.PS.render.webgpuTileLights;
context.PS.render.wgslShaders.register("tile-light", tileLightWgsl, { path: "shaders/tile-light.wgsl" });
tileLights.registerManifest();

assert.ok(
  context.PS.render.wgslShaderManifest.some(function (entry) { return entry.name === "tile-light"; }),
  "tile-light shader should be in the WGSL manifest"
);

const batches = context.PS.render.surfaceTileBatcher.beginBatches();
assert.strictEqual(
  context.PS.render.surfaceTileBatcher.appendSampleTileLight(
    batches,
    { biome: "mountain", detail: { surface: "cave floor", materialSignals: {} } },
    "mountain",
    16,
    32,
    16,
    1
  ),
  true,
  "cave terrain should emit a darker tile ambient record"
);
assert.strictEqual(batches.tileLights[0].kind, "cave", "tile light should preserve causal source kind");
assert.strictEqual(batches.tileLights[0].intensity, 0.38, "cave tile light should store per-tile ambient intensity");
assert.strictEqual(
  context.PS.render.surfaceTileBatcher.appendSampleTileLight(
    batches,
    { biome: "grassland", civilization: { key: "civ.settlement.3.block", family: "block" }, detail: { surface: "building floor" } },
    "grassland",
    32,
    32,
    16,
    0.5
  ),
  true,
  "building terrain should emit an indoor tile ambient record"
);
assert.ok(batches.tileLights[1].intensity > 0.58 && batches.tileLights[1].intensity < 1, "fallback/feather alpha should reduce tile-light darkness rather than erase it");

const grid = tileLights.buildLightGrid(batches.tileLights, 64, 64, 16);
assert.strictEqual(grid.width, 5, "tile-light grid should include one extra corner column");
assert.strictEqual(grid.height, 5, "tile-light grid should include one extra corner row");
assert.ok(Array.from(grid.data).some(function (value) { return value < 0.5; }), "tile-light grid should store dark cave corners");
assert.ok(Array.from(grid.data).some(function (value) { return value > 0.7 && value < 1; }), "tile-light grid should store partial indoor ambient values");

assert.strictEqual(
  tileLights.draw({
    tileLights: batches.tileLights,
    width: 320,
    height: 180,
    tileSize: 16
  }),
  true,
  "tile-light renderer should draw submitted tile lights"
);

const pipelineDescriptor = fakeDevice.pipelines[0].descriptor;
assert.strictEqual(pipelineDescriptor.label, "tile-light.pipeline", "tile-light pipeline should be created");
assert.strictEqual(pipelineDescriptor.fragment.targets[0].blend.color.srcFactor, "src-alpha", "tile-light pass should alpha-blend local ambient over composed color");
assert.strictEqual(fakePasses[0].descriptor.label, "tile-light.render-pass", "tile lights should use a labeled WebGPU render pass");
assert.deepStrictEqual(fakePasses[0].draws[0], [4, 1, 0, 0], "tile lights should draw one fullscreen pass");
assert.ok(queueWrites.some(function (write) { return write.buffer.descriptor.label === "tile-light.uniforms"; }), "tile-light uniforms should upload to WebGPU");
assert.ok(queueWrites.some(function (write) { return write.buffer.descriptor.label === "tile-light.grid.storage"; }), "tile-light storage grid should upload to WebGPU");
assert.strictEqual(submissions.length, 1, "standalone tile-light draw should submit a command buffer");
assert.strictEqual(tileLights.getStats().drawCount, 1, "tile-light stats should count draws");
assert.strictEqual(tileLights.getStats().submittedTiles, 2, "tile-light stats should count submitted causal tiles");
assert.strictEqual(tileLights.getStats().lastError, "", "successful tile-light draw should clear lastError");

console.log("webgpu tile light checks passed");
