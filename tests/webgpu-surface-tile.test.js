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
const managerSource = read("js/render/wgsl-shader-manager.js");
const targetsSource = read("js/render/webgpu-targets.js");
const gbufferSource = read("js/render/webgpu-gbuffer.js");
const compositorSource = read("js/render/webgpu-compositor.js");
const batcherSource = read("js/render/surface-tile-batcher.js");
const surfaceTileSource = read("js/render/webgpu-surface-tile.js");
const terrainWgsl = read("shaders/terrain.wgsl");
const terrainTileWgsl = read("shaders/terrain-tile.wgsl");
const gbufferTerrainWgsl = read("shaders/gbuffer-terrain.wgsl");
const gbufferComposeWgsl = read("shaders/gbuffer-compose.wgsl");

assert.ok(
  namespaceSource.indexOf("js/render/webgpu-surface-tile.js") > namespaceSource.indexOf("js/render/webgpu-surface-underlay.js"),
  "WebGPU surface tile renderer should load after WebGPU surface underlay"
);
assert.ok(
  namespaceSource.indexOf("js/render/surface-tile-batcher.js") < namespaceSource.indexOf("js/render/webgpu-surface-tile.js"),
  "neutral surface tile batcher should load before the WebGPU surface tile renderer"
);
assert.strictEqual(namespaceSource.indexOf("js/render/surface-tile-webgl.js"), -1, "runtime manifest must not load the legacy WebGL surface tile renderer");
assert.strictEqual(surfaceTileSource.indexOf("surfaceTileWebgl"), -1, "WebGPU surface tile renderer must not call the legacy WebGL batcher");

[
  { name: "terrain", source: terrainWgsl },
  { name: "terrain-tile", source: terrainTileWgsl },
  { name: "gbuffer-terrain", source: gbufferTerrainWgsl }
].forEach(function (entry) {
  const sidecar = read("shaders/" + entry.name + ".wgsl.js");
  const globalName = "SHADER_SHADERS_" + entry.name.replace(/-/g, "_").toUpperCase() + "_WGSL";
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
  vm.runInContext(sidecar, context, { filename: "shaders/" + entry.name + ".wgsl.js" });
  assert.strictEqual(context.window[globalName], entry.source, entry.name + " sidecar should match raw WGSL");
  assert.strictEqual(context.PS.assets.url, "shaders/" + entry.name + ".wgsl", entry.name + " sidecar should register shader path");
});

[
  "@location(1) rect: vec4<f32>",
  "@location(2) uv_rect: vec4<f32>",
  "@location(3) alpha: f32",
  "@location(4) flip_h: f32",
  "textureSample(atlas_texture",
  "color.rgb * input.shade",
  "input.alpha"
].forEach(function (required) {
  assert.ok(terrainTileWgsl.indexOf(required) >= 0, "terrain-tile WGSL should contain " + required);
});
assert.strictEqual(terrainTileWgsl.indexOf("color.a * input.alpha"), -1, "terrain-tile WGSL should reserve atlas alpha for height data");

[
  "@location(0) albedo",
  "@location(1) normal_height",
  "@location(1) rect: vec4<f32>",
  "@location(2) uv_rect: vec4<f32>",
  "textureSample(atlas_texture",
  "texel_size: vec2<f32>",
  "@location(3) uv_rect: vec4<f32>",
  "fn sample_height",
  "clamp(input.uv + offset",
  "max_uv - tile.texel_size * 0.5",
  "sample_height(input, vec2<f32>(-tile.texel_size.x, 0.0))",
  "sample_height(input, vec2<f32>(0.0, tile.texel_size.y))",
  "slope_x",
  "let alpha = input.alpha",
  "color.a",
  "normal.xy * 0.5"
].forEach(function (required) {
  assert.ok(gbufferTerrainWgsl.indexOf(required) >= 0, "gbuffer terrain WGSL should contain " + required);
});
assert.strictEqual(gbufferTerrainWgsl.indexOf("color.r - color.g"), -1, "gbuffer terrain normals should not be derived from color channels");

assert.ok(
  surfaceTileSource.indexOf("ensureGbufferPipeline") >= 0 &&
    surfaceTileSource.indexOf("PS.render.webgpuGbuffer.beginTerrainPass") >= 0 &&
    surfaceTileSource.indexOf("PS.render.webgpuCompositor.draw") >= 0,
  "surface tile renderer should route active tile draws through G-buffer and compositor"
);

const queueWrites = [];
const textureWrites = [];
const submissions = [];

function makeTexture(label) {
  return {
    label,
    createView() {
      return { texture: this };
    }
  };
}

const fakeDevice = {
  buffers: [],
  textures: [],
  samplers: [],
  modules: [],
  pipelines: [],
  bindGroups: [],
  passes: [],
  queue: {
    writeBuffer(buffer, offset, data, dataOffset, size) {
      queueWrites.push({ buffer, offset, data, dataOffset, size });
    },
    writeTexture(destination, data, layout, size) {
      textureWrites.push({ destination, data, layout, size });
    },
    submit(commandBuffers) {
      submissions.push(commandBuffers);
    }
  },
  createBuffer(descriptor) {
    const buffer = { descriptor };
    this.buffers.push(buffer);
    return buffer;
  },
  createTexture(descriptor) {
    const texture = makeTexture(descriptor.label);
    texture.descriptor = descriptor;
    this.textures.push(texture);
    return texture;
  },
  createSampler(descriptor) {
    const sampler = { descriptor };
    this.samplers.push(sampler);
    return sampler;
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
    const encoder = {
      descriptor,
      beginRenderPass(passDescriptor) {
        const pass = {
          descriptor: passDescriptor,
          vertexBuffers: [],
          drawArgs: null,
          setPipeline(pipeline) {
            this.pipeline = pipeline;
          },
          setBindGroup(index, bindGroup) {
            this.bindGroupIndex = index;
            this.bindGroup = bindGroup;
          },
          setVertexBuffer(index, buffer) {
            this.vertexBuffers[index] = buffer;
          },
          draw(vertexCount, instanceCount, firstVertex, firstInstance) {
            this.drawArgs = [vertexCount, instanceCount, firstVertex, firstInstance];
          },
          end() {
            this.ended = true;
          }
        };
        fakeDevice.passes.push(pass);
        return pass;
      },
      finish() {
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
      canvas: { width: 320, height: 180 },
      context: {
        getCurrentTexture() {
          return makeTexture("swapchain");
        }
      }
    },
    atlas: {
      initialized: true,
      pages: [{
        width: 2,
        height: 2,
        version: 1,
        data: new Uint8Array([
          255, 0, 0, 255,
          0, 255, 0, 255,
          0, 0, 255, 255,
          255, 255, 255, 255
        ])
      }]
    }
  },
  window: {},
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
  Uint8Array
};

vm.createContext(context);
vm.runInContext(managerSource, context, { filename: "js/render/wgsl-shader-manager.js" });
vm.runInContext(targetsSource, context, { filename: "js/render/webgpu-targets.js" });
vm.runInContext(gbufferSource, context, { filename: "js/render/webgpu-gbuffer.js" });
vm.runInContext(compositorSource, context, { filename: "js/render/webgpu-compositor.js" });
vm.runInContext(batcherSource, context, { filename: "js/render/surface-tile-batcher.js" });
vm.runInContext(surfaceTileSource, context, { filename: "js/render/webgpu-surface-tile.js" });

const surfaceTile = context.PS.render.webgpuSurfaceTile;
context.PS.render.wgslShaders.register("terrain", terrainWgsl, { path: "shaders/terrain.wgsl" });
context.PS.render.wgslShaders.register("terrain-tile", terrainTileWgsl, { path: "shaders/terrain-tile.wgsl" });
context.PS.render.wgslShaders.register("gbuffer-terrain", gbufferTerrainWgsl, { path: "shaders/gbuffer-terrain.wgsl" });
context.PS.render.wgslShaders.register("gbuffer-compose", gbufferComposeWgsl, { path: "shaders/gbuffer-compose.wgsl" });

surfaceTile.registerManifest();
assert.ok(context.PS.render.wgslShaderManifest.some(function (entry) { return entry.name === "terrain"; }), "terrain shader should be in WGSL manifest");
assert.ok(context.PS.render.wgslShaderManifest.some(function (entry) { return entry.name === "terrain-tile"; }), "terrain tile shader should be in WGSL manifest");
assert.ok(context.PS.render.wgslShaderManifest.some(function (entry) { return entry.name === "gbuffer-terrain"; }), "gbuffer terrain shader should be in WGSL manifest");

const fallbackTerrainCell = {
  name: "fallback.grass",
  pageIndex: 0,
  u0: 0,
  v0: 0,
  u1: 0.5,
  v1: 0.5
};
const acceptedTerrainCell = {
  name: "equivalence.terrain_materials_v0.rock-mountain.0",
  pageIndex: 0,
  u0: 0.5,
  v0: 0,
  u1: 1,
  v1: 0.5
};
let acceptedTerrainSelection = null;

context.PS.atlas.getTerrainCell = function () {
  return fallbackTerrainCell;
};
context.PS.assets = {
  equivalence: {
    selectCell(family, cellName, use, fallbackCellId) {
      acceptedTerrainSelection = { family, cellName, use, fallbackCellId };
      return {
        renderCell: acceptedTerrainCell
      };
    }
  }
};

const acceptedTerrainBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 0,
  sampleNorth: 0,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [{
  sample: {
    biome: "grassland",
    acceptedTerrainCellName: "rock-mountain.0",
    detail: {
      surface: "grass"
    }
  },
  screenX: 0,
  screenY: 0
}], 1);

assert.strictEqual(acceptedTerrainBatches.equivalenceTerrain, 1, "explicit accepted terrain cells should count as equivalence terrain draws");
assert.strictEqual(acceptedTerrainSelection.family, "terrain", "explicit accepted terrain cell should use the terrain equivalence family");
assert.strictEqual(acceptedTerrainSelection.cellName, "rock-mountain.0", "explicit accepted terrain cell name should be passed to the selector");
assert.strictEqual(acceptedTerrainSelection.use, "terrainGround", "explicit accepted non-water terrain should use terrainGround stats");
assert.ok(acceptedTerrainBatches.materialCounts[acceptedTerrainCell.name] > 0, "accepted terrain cell should replace fallback material in batches");

const drew = surfaceTile.drawBatches({
  pages: {
    0: new Float32Array([
      8, 12, 16, 16,
      0, 0, 0.5, 0.5,
      1, 0.25
    ])
  },
  count: 1,
  culled: 2,
  materialCounts: { "grass-lush.0": 1 },
  equivalenceTerrain: 1,
  equivalenceTransitions: 1
}, {
  sunDirection: [0, 3, 4],
  ambient: 0.41,
  directionalStrength: 0.62,
  wrapStrength: 0.18,
  heightTintStrength: 0.07
});

assert.strictEqual(drew, true, "WebGPU surface tile draw should submit a page draw");
assert.strictEqual(fakeDevice.pipelines[0].descriptor.label, "terrain-tile.gbuffer.pipeline", "surface tile G-buffer pipeline should be created");
assert.strictEqual(fakeDevice.pipelines[1].descriptor.label, "gbuffer-compose.pipeline", "surface tile draw should create compositor pipeline");
assert.strictEqual(fakeDevice.passes[0].descriptor.label, "gbuffer.terrain-pass", "surface tile draw should first fill the G-buffer");
assert.strictEqual(fakeDevice.passes[1].descriptor.label, "gbuffer-compose.render-pass", "surface tile draw should composite the G-buffer to the output");
assert.strictEqual(fakeDevice.passes[0].descriptor.colorAttachments.length, 2, "surface tile G-buffer pass should use MRT albedo and normal attachments");
assert.strictEqual(fakeDevice.passes[0].drawArgs[0], 4, "surface tile draw should draw quad vertices");
assert.strictEqual(fakeDevice.passes[0].drawArgs[1], 1, "surface tile draw should draw one instance");
assert.deepStrictEqual(fakeDevice.passes[1].drawArgs, [4, 1, 0, 0], "surface tile compositor should draw one fullscreen quad");
assert.strictEqual(textureWrites.length, 1, "atlas page should upload through GPUQueue.writeTexture");
assert.ok(queueWrites.some(function (write) { return write.buffer.descriptor.label === "terrain-tile.instances"; }), "instance data should upload to the WebGPU instance buffer");
assert.ok(queueWrites.some(function (write) { return write.buffer.descriptor.label === "terrain-tile.uniforms"; }), "canvas uniforms should upload to WebGPU");
assert.ok(queueWrites.some(function (write) {
  return write.buffer.descriptor.label === "terrain-tile.uniforms" &&
    nearly(write.data[2], 0.5) &&
    nearly(write.data[3], 0.5);
}), "terrain uniforms should upload atlas texel size for G-buffer normal sampling");
assert.ok(queueWrites.some(function (write) {
  return write.buffer.descriptor.label === "gbuffer-compose.uniforms" &&
    nearly(write.data[1], 0.6) &&
    nearly(write.data[2], 0.8) &&
    nearly(write.data[4], 0.41) &&
    nearly(write.data[5], 0.62) &&
    nearly(write.data[6], 0.18) &&
    nearly(write.data[7], 0.07);
}), "surface tile G-buffer compositor should forward lighting uniforms");
assert.strictEqual(submissions.length, 1, "surface tile draw should submit a command buffer");

const stats = surfaceTile.getStats();
assert.strictEqual(stats.tileDrawCount, 1, "stats should count drawn terrain instances");
assert.strictEqual(stats.pageDrawCount, 1, "stats should count drawn atlas pages");
assert.strictEqual(stats.textureUploadCount, 1, "stats should count texture uploads");
assert.strictEqual(stats.culledCount, 2, "stats should preserve cull counts");
assert.strictEqual(stats.equivalenceTerrainDrawCount, 1, "stats should preserve equivalence terrain counts");
assert.strictEqual(stats.equivalenceTransitionDrawCount, 1, "stats should preserve equivalence transition counts");
assert.strictEqual(stats.lastError, "", "successful draw should clear lastError");

console.log("webgpu surface tile checks passed");
