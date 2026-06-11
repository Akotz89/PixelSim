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
const entitySource = read("js/render/webgpu-entity.js");
const equivalenceSource = read("js/assets/equivalence.js");
const waterRenderingSource = read("js/render/water-rendering.js");
const batcherSource = read("js/render/surface-tile-batcher.js");
const surfaceTileSource = read("js/render/webgpu-surface-tile.js");
const terrainWgsl = read("shaders/terrain.wgsl");
const terrainTileWgsl = read("shaders/terrain-tile.wgsl");
const terrainTilemapWgsl = read("shaders/terrain-tilemap.wgsl");
const gbufferTerrainWgsl = read("shaders/gbuffer-terrain.wgsl");
const gbufferComposeWgsl = read("shaders/gbuffer-compose.wgsl");
const particleWgsl = read("shaders/particle.wgsl");
const shadowWgsl = read("shaders/shadow.wgsl");

assert.ok(
  namespaceSource.indexOf("js/render/webgpu-surface-tile.js") > namespaceSource.indexOf("js/render/webgpu-surface-underlay.js"),
  "WebGPU surface tile renderer should load after WebGPU surface underlay"
);
assert.ok(
  namespaceSource.indexOf("js/render/water-rendering.js") < namespaceSource.indexOf("js/render/surface-tile-batcher.js") &&
    namespaceSource.indexOf("js/render/surface-tile-batcher.js") < namespaceSource.indexOf("js/render/webgpu-surface-tile.js"),
  "water rendering helpers should load before the neutral surface tile batcher and WebGPU surface tile renderer"
);
assert.strictEqual(namespaceSource.indexOf("js/render/surface-tile-webgl.js"), -1, "runtime manifest must not load the legacy WebGL surface tile renderer");
assert.strictEqual(surfaceTileSource.indexOf("surfaceTileWebgl"), -1, "WebGPU surface tile renderer must not call the legacy WebGL batcher");

[
  { name: "terrain", source: terrainWgsl },
  { name: "terrain-tile", source: terrainTileWgsl },
  { name: "terrain-tilemap", source: terrainTilemapWgsl },
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
  "@location(6) water_depth: f32",
  "@location(7) water_stencil: f32",
  "@location(8) water_wave: f32",
  "@location(9) water_growth: f32",
  "textureSample(atlas_texture",
  "color.rgb * input.shade",
  "input.alpha",
  "fn shore_stencil_coverage",
  "fn water_depth_color",
  "mix(normal_color, winter_color, 1.0 - clamp(input.water_growth",
  "let variant = (stencil >> 4u) & 3u",
  "let variant_bias = f32(variant) * 0.025",
  "let normal = shade_water(shore, 0.38)",
  "renderTextured-compatible edge compositing",
  "input.water_wave / 7.0"
].forEach(function (required) {
  assert.ok(terrainTileWgsl.indexOf(required) >= 0, "terrain-tile WGSL should contain " + required);
});
assert.strictEqual(terrainTileWgsl.indexOf("color.a * input.alpha"), -1, "terrain-tile WGSL should reserve atlas alpha for height data");

[
  "@group(0) @binding(0) var tile_data: texture_2d<u32>",
  "@group(0) @binding(1) var atlas_texture: texture_2d<f32>",
  "textureLoad(tile_data",
  "tile_id + (variation & 3u) * 16u + (mask & 15u)",
  "textureSampleLevel(atlas_texture, atlas_sampler, uv, 0.0)",
  "pass.draw(4, 1"
].forEach(function (required) {
  var source = required === "pass.draw(4, 1" ? surfaceTileSource : terrainTilemapWgsl;
  assert.ok(source.indexOf(required) >= 0, "data-texture tilemap path should contain " + required);
});

[
  "@location(0) albedo",
  "@location(1) normal_height",
  "@location(1) rect: vec4<f32>",
  "@location(2) uv_rect: vec4<f32>",
  "textureSample(atlas_texture",
  "textureSampleLevel(atlas_texture",
  "texel_size: vec2<f32>",
  "@location(3) uv_rect: vec4<f32>",
  "@location(4) normal_mode: f32",
  "@location(6) water_depth: f32",
  "@location(7) water_stencil: f32",
  "@location(8) water_wave: f32",
  "@location(9) water_growth: f32",
  "fn sample_split_normal",
  "fn sample_procedural_normal",
  "fn shore_stencil_coverage",
  "fn water_depth_color",
  "mix(normal_color, winter_color, 1.0 - clamp(input.water_growth",
  "let variant = (stencil >> 4u) & 3u",
  "let variant_bias = f32(variant) * 0.025",
  "let normal = shade_water(shore, 0.38)",
  "renderTextured-compatible edge compositing",
  "input.water_wave / 7.0",
  "let tile_width = abs(input.uv_rect.z - input.uv_rect.x)",
  "let normal_offset = tile_width * 8.0",
  "let normal_u = clamp(input.uv.x + normal_offset",
  "let normal_sample = textureSampleLevel(atlas_texture, atlas_sampler, normal_uv, 0.0).rgb",
  "normal_sample * 2.0 - vec3<f32>(1.0, 1.0, 1.0)",
  "if (input.normal_mode >= 0.5)",
  "let alpha = input.alpha",
  "color.a",
  "normal.xy * 0.5"
].forEach(function (required) {
  assert.ok(gbufferTerrainWgsl.indexOf(required) >= 0, "gbuffer terrain WGSL should contain " + required);
});
assert.strictEqual(gbufferTerrainWgsl.indexOf("color.r - color.g"), -1, "gbuffer terrain normals should not be derived from color channels");
assert.strictEqual(gbufferTerrainWgsl.indexOf("fract(input.uv.x + 0.5)"), -1, "split atlas normal UVs should not wrap variant 7 back to the albedo half");

function mapSplitNormalU(uvX, uv0, uv1, texelSizeX) {
  var tileWidth = Math.abs(uv1 - uv0);
  var normalOffset = tileWidth * 8;
  var normalMinX = uv0 + normalOffset + texelSizeX * 0.5;
  var normalMaxX = uv1 + normalOffset - texelSizeX * 0.5;
  var minX = Math.min(normalMinX, normalMaxX);
  var maxX = Math.max(normalMinX, normalMaxX);
  return Math.max(minX, Math.min(maxX, uvX + normalOffset));
}

assert.ok(mapSplitNormalU(0.4375, 0.4375, 0.5, 1 / 512) >= 0.9375, "variant 7 left edge should map into the normal half");
assert.ok(mapSplitNormalU(0.5, 0.4375, 0.5, 1 / 512) > 0.99, "variant 7 right edge should stay near the normal tile edge");
assert.ok(mapSplitNormalU(0.5, 0.4375, 0.5, 1 / 512) < 1, "variant 7 right edge should clamp before u=1 instead of wrapping to zero");

assert.ok(
  surfaceTileSource.indexOf("ensureGbufferPipeline") >= 0 &&
    surfaceTileSource.indexOf("PS.render.webgpuGbuffer.beginTerrainPass") >= 0 &&
    surfaceTileSource.indexOf("PS.render.webgpuCompositor.draw") >= 0,
  "surface tile renderer should route active tile draws through G-buffer and compositor"
);
assert.ok(
  batcherSource.indexOf("appendWaterDecoration") >= 0 &&
    surfaceTileSource.indexOf("drawShadowRects") >= 0 &&
    surfaceTileSource.indexOf("drawParticleRects") >= 0,
  "surface tile renderer should batch floating water decorations and their shadows through rect renderers"
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
          setIndexBuffer(buffer, format) {
            this.indexBuffer = { buffer, format };
          },
          setVertexBuffer(index, buffer) {
            this.vertexBuffers[index] = buffer;
          },
          draw(vertexCount, instanceCount, firstVertex, firstInstance) {
            this.drawArgs = [vertexCount, instanceCount, firstVertex, firstInstance];
          },
          drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance) {
            this.drawIndexedArgs = [indexCount, instanceCount, firstIndex, baseVertex, firstInstance];
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
    assets: {},
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
vm.runInContext(entitySource, context, { filename: "js/render/webgpu-entity.js" });
vm.runInContext(equivalenceSource, context, { filename: "js/assets/equivalence.js" });
vm.runInContext(waterRenderingSource, context, { filename: "js/render/water-rendering.js" });
vm.runInContext(batcherSource, context, { filename: "js/render/surface-tile-batcher.js" });
vm.runInContext(surfaceTileSource, context, { filename: "js/render/webgpu-surface-tile.js" });

const surfaceTile = context.PS.render.webgpuSurfaceTile;
context.PS.render.wgslShaders.register("terrain", terrainWgsl, { path: "shaders/terrain.wgsl" });
context.PS.render.wgslShaders.register("terrain-tile", terrainTileWgsl, { path: "shaders/terrain-tile.wgsl" });
context.PS.render.wgslShaders.register("terrain-tilemap", terrainTilemapWgsl, { path: "shaders/terrain-tilemap.wgsl" });
context.PS.render.wgslShaders.register("gbuffer-terrain", gbufferTerrainWgsl, { path: "shaders/gbuffer-terrain.wgsl" });
context.PS.render.wgslShaders.register("gbuffer-compose", gbufferComposeWgsl, { path: "shaders/gbuffer-compose.wgsl" });
context.PS.render.wgslShaders.register("particle", particleWgsl, { path: "shaders/particle.wgsl" });
context.PS.render.wgslShaders.register("shadow", shadowWgsl, { path: "shaders/shadow.wgsl" });

surfaceTile.registerManifest();
assert.ok(context.PS.render.wgslShaderManifest.some(function (entry) { return entry.name === "terrain"; }), "terrain shader should be in WGSL manifest");
assert.ok(context.PS.render.wgslShaderManifest.some(function (entry) { return entry.name === "terrain-tile"; }), "terrain tile shader should be in WGSL manifest");
assert.ok(context.PS.render.wgslShaderManifest.some(function (entry) { return entry.name === "terrain-tilemap"; }), "terrain tilemap shader should be in WGSL manifest");
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
context.PS.assets.equivalence.selectCell = function (family, cellName, use, fallbackCellId) {
  acceptedTerrainSelection = { family, cellName, use, fallbackCellId };
  return {
    renderCell: acceptedTerrainCell
  };
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
Object.keys(acceptedTerrainBatches.pages).forEach(function (pageIndex) {
  var page = acceptedTerrainBatches.pages[pageIndex];
  for (let offset = 10; offset < page.length; offset += 15) {
    assert.strictEqual(page.data[offset], 0, "non-split terrain instances should keep procedural G-buffer normal sampling");
  }
});

const splitPageData = new Uint8Array(512 * 32 * 4);
for (let i = 0; i < splitPageData.length; i += 4) {
  splitPageData[i] = 96;
  splitPageData[i + 1] = 132;
  splitPageData[i + 2] = 64;
  splitPageData[i + 3] = 180;
}
const sheetCells = {};
["grass", "stone", "sand"].forEach(function (material) {
  for (let index = 0; index < 8; index += 1) {
    sheetCells["terrain." + material + "." + index] = {
      name: "terrain." + material + "." + index,
      x: index * 32,
      y: 0,
      w: 32,
      h: 32,
      splitAtlas: true,
      normalOffsetX: 256
    };
  }
});
context.PS.assets.loadedSheets = {
  terrain_grass: {
    id: "terrain_grass",
    splitAtlas: { normalOffset: [256, 0] },
    pixelData: { type: "rgba-base64", width: 512, height: 32, byteLength: splitPageData.length, buffer: splitPageData },
    sheet: { getCell(name) { return sheetCells[name] || null; } }
  },
  terrain_stone: {
    id: "terrain_stone",
    splitAtlas: { normalOffset: [256, 0] },
    pixelData: { type: "rgba-base64", width: 512, height: 32, byteLength: splitPageData.length, buffer: splitPageData },
    sheet: { getCell(name) { return sheetCells[name] || null; } }
  },
  terrain_sand: {
    id: "terrain_sand",
    splitAtlas: { normalOffset: [256, 0] },
    pixelData: { type: "rgba-base64", width: 512, height: 32, byteLength: splitPageData.length, buffer: splitPageData },
    sheet: { getCell(name) { return sheetCells[name] || null; } }
  }
};

const automaticTerrainBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 1,
  sampleNorth: 1,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 3
}, [{
  sample: { biome: "grassland", detail: { surface: "grass" } },
  screenX: 0,
  screenY: 0
}, {
  sample: { biome: "mountain", detail: { surface: "stone" } },
  screenX: 16,
  screenY: 0
}, {
  sample: { biome: "desert", detail: { surface: "sand" } },
  screenX: 32,
  screenY: 0
}], 1);

assert.ok(automaticTerrainBatches.materialCounts["terrain.grass.0"] || automaticTerrainBatches.materialCounts["terrain.grass.1"] || automaticTerrainBatches.materialCounts["terrain.grass.2"] || automaticTerrainBatches.materialCounts["terrain.grass.3"] || automaticTerrainBatches.materialCounts["terrain.grass.4"] || automaticTerrainBatches.materialCounts["terrain.grass.5"] || automaticTerrainBatches.materialCounts["terrain.grass.6"] || automaticTerrainBatches.materialCounts["terrain.grass.7"], "automatic surface batching should select split-atlas grass material");
assert.ok(Object.keys(automaticTerrainBatches.materialCounts).some(function (name) { return name.indexOf("terrain.stone.") === 0; }), "automatic surface batching should select split-atlas stone material");
assert.ok(Object.keys(automaticTerrainBatches.materialCounts).some(function (name) { return name.indexOf("terrain.sand.") === 0; }), "automatic surface batching should select split-atlas sand material");
Object.keys(automaticTerrainBatches.pages).forEach(function (pageIndex) {
  var page = automaticTerrainBatches.pages[pageIndex];
  for (let offset = 10; offset < page.length; offset += 15) {
    assert.strictEqual(page.data[offset], 1, "split-atlas material instances should set the normal sampling flag");
  }
});

context.world.timeMs = 1600;
const waterBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 4,
  sampleNorth: 6,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [{
  sample: {
    biome: "ocean",
    detail: {
      surface: "tidal shore",
      feature: "foam",
      materialSignals: {
        waterDepth: 0.22,
        shallowWater: 0.8,
        shoreMask: 10,
        growth: 0.25
      }
    }
  },
  screenX: 0,
  screenY: 0
}], 1);
const waterPage = waterBatches.pages[Object.keys(waterBatches.pages)[0]];
assert.strictEqual(context.PS.render.waterRendering.getShoreWaveOffset(0), 0, "shore wave animation should start at frame zero");
assert.strictEqual(context.PS.render.waterRendering.getShoreWaveOffset(1400), 7, "shore wave animation should ping up to frame seven");
assert.strictEqual(context.PS.render.waterRendering.getShoreWaveOffset(2200), 3, "shore wave animation should ping back down after frame seven");
assert.strictEqual(waterPage.data[11], 1, "shore water instances should encode shore depth");
assert.strictEqual(waterPage.data[12] & 15, 10, "water instances should encode the autotile shore mask in the stencil low nibble");
assert.strictEqual(Math.floor(waterPage.data[12] / 16) >= 0 && Math.floor(waterPage.data[12] / 16) <= 3, true, "water stencil should reserve four random variants per mask");
assert.strictEqual(waterPage.data[13], 6, "water instances should encode triangle-wave shore animation offset");
assert.strictEqual(waterPage.data[14], 0.25, "water instances should encode seasonal growth for water color interpolation");
assert.strictEqual(context.PS.render.waterRendering.getDepthCode({ biome: "lake", detail: { surface: "open water", materialSignals: { waterDepth: 0.5 } } }, "lake"), 2, "open water should encode normal depth");
assert.strictEqual(context.PS.render.waterRendering.getDepthCode({ biome: "ocean", detail: { surface: "deep water", materialSignals: { waterDepth: 0.9 } } }, "ocean"), 3, "deep water should encode deep depth");
assert.strictEqual(context.PS.render.waterRendering.shouldPlaceDecoration({
  biome: "ocean",
  detail: { surface: "tidal shore", materialSignals: { waterDepth: 0.22, shallowWater: 0.8 } }
}, "ocean", 4, 6), false, "floating decorations should not spawn on shore water tiles");

let decorationTile = null;
for (let dx = 0; dx < 64 && !decorationTile; dx += 1) {
  for (let dy = 0; dy < 64 && !decorationTile; dy += 1) {
    if (context.PS.render.waterRendering.shouldPlaceDecoration({
      biome: "ocean",
      detail: { surface: "open water", materialSignals: { waterDepth: 0.65 } }
    }, "ocean", dx, dy)) {
      decorationTile = { x: dx, y: dy };
    }
  }
}
assert.ok(decorationTile, "deterministic open-water decoration sampling should find a placed decoration");
const decorationSample = {
  biome: "ocean",
  detail: { surface: "open water", materialSignals: { waterDepth: 0.65 } }
};
const decorationAtStart = context.PS.render.waterRendering.getDecorationRenderInfo(decorationSample, "ocean", decorationTile.x, decorationTile.y, 16, 0);
const decorationLater = context.PS.render.waterRendering.getDecorationRenderInfo(decorationSample, "ocean", decorationTile.x, decorationTile.y, 16, 2000);
assert.ok(decorationAtStart && Number.isFinite(decorationAtStart.speedX) && Number.isFinite(decorationAtStart.speedY), "floating decorations should carry deterministic per-tile speeds");
assert.notDeepStrictEqual(
  [decorationAtStart.offsetX, decorationAtStart.offsetY],
  [decorationLater.offsetX, decorationLater.offsetY],
  "floating decoration offsets should animate over time"
);

context.world.timeMs = 0;
const decorationBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: decorationTile.x,
  sampleNorth: decorationTile.y,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [{
  sample: decorationSample,
  screenX: 0,
  screenY: 0
}], 1);
assert.strictEqual(decorationBatches.shadowRects.length, 8, "open-water decorations should emit one batched shadow rect");
assert.strictEqual(decorationBatches.waterDecorationRects.length, 8, "open-water decorations should emit one batched decoration rect");
assert.ok(decorationBatches.shadowRects[7] > 0, "decoration shadow rect should include visible alpha");

context.PS.atlas.getTerrainTransitionKey = function (sample) {
  const neighbor = sample && sample.tileBlend && sample.tileBlend.tiles && sample.tileBlend.tiles[0];
  return neighbor ? "dry.1." + neighbor.tile.moisture : "plain";
};
context.PS.atlas.getTerrainTextureOverlayKey = function (sample) {
  const signals = sample && sample.detail && sample.detail.materialSignals || {};
  return signals.shoreMask ? "stencil.water." + signals.shoreMask : "stencil.none";
};
context.PS.atlas.getTerrainCell = function (biome, tileX, tileY, sample) {
  return {
    name: "generated." + context.PS.atlas.getTerrainTransitionKey(sample) + "." + context.PS.atlas.getTerrainTextureOverlayKey(sample),
    pageIndex: 0,
    u0: 0,
    v0: 0,
    u1: 0.5,
    v1: 0.5
  };
};
const reusableTransitionCellData = {
  sample: {
    biome: "grassland",
    detail: { surface: "grass" },
    tileBlend: {
      transitionStrength: 0.6,
      biomeWeights: { grassland: 0.5, desert: 0.5 },
      tiles: [{
        biome: "desert",
        weight: 0.5,
        detail: { surface: "sand", materialSignals: { moisture: 0 } },
        tile: { biome: "desert", moisture: 0 }
      }]
    }
  },
  screenX: 0,
  screenY: 0
};
context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 9,
  sampleNorth: 9,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [reusableTransitionCellData], 1);
const firstReuseKey = reusableTransitionCellData.terrainAtlasEcologyKey;
const firstReuseCellName = reusableTransitionCellData.terrainAtlasCell.name;
reusableTransitionCellData.sample.tileBlend.tiles[0].detail.materialSignals.moisture = 1;
reusableTransitionCellData.sample.tileBlend.tiles[0].tile.moisture = 2.2;
context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 9,
  sampleNorth: 9,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [reusableTransitionCellData], 1);
assert.notStrictEqual(reusableTransitionCellData.terrainAtlasEcologyKey, firstReuseKey, "batcher terrain cache key should include transition neighbor ground identity");
assert.notStrictEqual(reusableTransitionCellData.terrainAtlasCell.name, firstReuseCellName, "batcher should regenerate terrain cells when transition neighbor ground identity changes");

const drew = surfaceTile.drawBatches({
  pages: {
    0: new Float32Array([
      8, 12, 16, 16,
      0, 0, 0.5, 0.5,
      1, 0.25, 1, 2, 33, 4, 0.75
    ])
  },
  count: 1,
  culled: 2,
  materialCounts: { "grass-lush.0": 1 },
  equivalenceTerrain: 1,
  equivalenceTransitions: 1,
  shadowRects: decorationBatches.shadowRects,
  waterDecorationRects: decorationBatches.waterDecorationRects
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
assert.strictEqual(fakeDevice.passes[2].descriptor.label, "shadow.render-pass", "surface tile draw should overlay water decoration shadows after composition");
assert.strictEqual(fakeDevice.passes[3].descriptor.label, "particle.render-pass", "surface tile draw should overlay floating water decorations after shadows");
assert.strictEqual(fakeDevice.passes[0].descriptor.colorAttachments.length, 2, "surface tile G-buffer pass should use MRT albedo and normal attachments");
assert.strictEqual(fakeDevice.passes[2].descriptor.colorAttachments[0].loadOp, "load", "water decoration shadows should preserve the composed terrain target");
assert.strictEqual(fakeDevice.passes[3].descriptor.colorAttachments[0].loadOp, "load", "water decoration particles should preserve the shadowed terrain target");
assert.strictEqual(fakeDevice.passes[0].drawArgs[0], 4, "surface tile draw should draw quad vertices");
assert.strictEqual(fakeDevice.passes[0].drawArgs[1], 1, "surface tile draw should draw one instance");
assert.deepStrictEqual(fakeDevice.passes[1].drawArgs, [4, 1, 0, 0], "surface tile compositor should draw one fullscreen quad");
assert.deepStrictEqual(fakeDevice.passes[2].drawArgs, [4, 1, 0, 0], "water decoration shadows should draw one rect instance");
assert.deepStrictEqual(fakeDevice.passes[3].drawArgs, [4, 1, 0, 0], "water decorations should draw one particle rect instance");
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
assert.ok(queueWrites.some(function (write) {
  return write.buffer.descriptor.label === "shadow.instances.storage" && write.size === 8;
}), "surface tile draw should upload water decoration shadows through the real shadow storage buffer");
assert.ok(queueWrites.some(function (write) {
  return write.buffer.descriptor.label === "particle.instances.storage" && write.size === 8;
}), "surface tile draw should upload floating water decorations through the real particle storage buffer");
assert.strictEqual(submissions.length, 1, "surface tile draw should submit a command buffer");

const stats = surfaceTile.getStats();
assert.strictEqual(stats.tileDrawCount, 1, "stats should count drawn terrain instances");
assert.strictEqual(stats.pageDrawCount, 1, "stats should count drawn atlas pages");
assert.strictEqual(stats.textureUploadCount, 1, "stats should count texture uploads");
assert.strictEqual(stats.culledCount, 2, "stats should preserve cull counts");
assert.strictEqual(stats.equivalenceTerrainDrawCount, 1, "stats should preserve equivalence terrain counts");
assert.strictEqual(stats.equivalenceTransitionDrawCount, 1, "stats should preserve equivalence transition counts");
assert.strictEqual(stats.lastError, "", "successful draw should clear lastError");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().shadowDrawCount, 1, "real shadow renderer should count water decoration shadows");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().particleDrawCount, 1, "real particle renderer should count floating water decorations");

const tilemapLayer = surfaceTile.createTilemapLayer(400, 250);
assert.strictEqual(tilemapLayer.data.byteLength, 400 * 250 * 4, "tilemap layer should pack RGBA8 tile data");
assert.ok(surfaceTile.getTilemapMemoryBytes(tilemapLayer) < 32 * 1024 * 1024, "100K tile data texture should stay below 32MB");
assert.throws(function () {
  surfaceTile.createTilemapLayer(4096, 4096);
}, /32MB budget/, "oversized tilemap layers should be rejected before exceeding the 32MB budget");
assert.strictEqual(surfaceTile.setTilemapCell(tilemapLayer, 7, 9, 3, 12, 2, 1), true, "tilemap cell setter should accept in-bounds cells");
const packedOffset = (9 * tilemapLayer.width + 7) * 4;
assert.deepStrictEqual(
  Array.from(tilemapLayer.data.slice(packedOffset, packedOffset + 4)),
  [3, 12, 2, 1],
  "tilemap layer should pack tileType/autotileMask/variation/flags into RGBA channels"
);
const writesBeforeTilemap = textureWrites.length;
const passesBeforeTilemap = fakeDevice.passes.length;
const drewTilemap = surfaceTile.drawDataTextureTilemap(tilemapLayer, {
  width: 1920,
  height: 1080,
  tileSize: 16,
  atlasTileSize: 16,
  cameraX: 32,
  cameraY: 48,
  zoom: 2
});
assert.strictEqual(drewTilemap, true, "data-texture tilemap draw should submit");
assert.strictEqual(fakeDevice.passes[passesBeforeTilemap].descriptor.label, "terrain-tilemap.render-pass", "data-texture path should use the tilemap render pass");
assert.deepStrictEqual(fakeDevice.passes[passesBeforeTilemap].drawArgs, [4, 1, 0, 0], "entire ground data texture should render in exactly one draw call");
assert.strictEqual(fakeDevice.passes[passesBeforeTilemap].vertexBuffers.length, 0, "data-texture path should not bind per-tile instance buffers");
assert.ok(textureWrites.length - writesBeforeTilemap >= 2, "data-texture path should upload dirty tile rects with writeTexture");
assert.ok(textureWrites.some(function (write) {
  return write.destination.texture.descriptor.label === "terrain-tilemap.data-texture" &&
    write.layout.bytesPerRow === 4 &&
    write.size.width === 1 &&
    write.size.height === 1;
}), "single changed tile should upload as a 1x1 dirty rect");
assert.ok(queueWrites.some(function (write) {
  return write.buffer.descriptor.label === "terrain-tilemap.uniforms" &&
    nearly(write.data[0], 1920) &&
    nearly(write.data[1], 1080) &&
    nearly(write.data[4], 16) &&
    nearly(write.data[5], 2);
}), "tilemap uniforms should include canvas, tile size, and zoom");
const tilemapStats = surfaceTile.getStats();
assert.strictEqual(tilemapStats.tilemapDataTextureDraws, 1, "stats should count data-texture tilemap draws");
assert.strictEqual(tilemapStats.tilemapVisibleTiles, 100000, "stats should report visible/data texture tile count");
assert.strictEqual(tilemapStats.tilemapDirtyUploadCount, 2, "initial upload plus one changed tile should produce two dirty-rect uploads");
assert.strictEqual(tilemapStats.tilemapDirtyUploadBytes, 400 * 250 * 4 + 4, "dirty-rect stats should report deterministic uploaded bytes");
assert.ok(tilemapStats.tilemapMemoryBytes < 32 * 1024 * 1024, "stats should keep tilemap GPU memory estimate under 32MB");

const bindGroupsBeforeSecondLayer = fakeDevice.bindGroups.length;
const secondLayer = surfaceTile.createTilemapLayer(2, 2);
surfaceTile.drawDataTextureTilemap(secondLayer, {
  width: 64,
  height: 64,
  tileSize: 16,
  atlasTileSize: 16,
  loadOp: "load"
});
assert.ok(fakeDevice.bindGroups.length > bindGroupsBeforeSecondLayer, "separate tilemap layers should get distinct bind groups");

console.log("webgpu surface tile checks passed");
