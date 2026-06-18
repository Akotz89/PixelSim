const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

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
const tileTypeLutSource = read("js/render/tile-type-lut.js");
const batcherSource = read("js/render/surface-tile-batcher.js");
const surfaceTileSource = read("js/render/webgpu-surface-tile.js");
const terrainWgsl = read("shaders/terrain.wgsl");
const terrainTileWgsl = read("shaders/terrain-tile.wgsl");
const terrainTilemapWgsl = read("shaders/terrain-tilemap.wgsl");
const gbufferTerrainWgsl = read("shaders/gbuffer-terrain.wgsl");
const gbufferComposeWgsl = read("shaders/gbuffer-compose.wgsl");
const particleWgsl = read("shaders/particle.wgsl");
const shadowWgsl = read("shaders/shadow.wgsl");
const spriteDisplaceWgsl = read("shaders/sprite-displace.wgsl");

assert.ok(
  namespaceSource.indexOf("js/render/webgpu-surface-tile.js") > namespaceSource.indexOf("js/render/webgpu-surface-underlay.js"),
  "WebGPU surface tile renderer should load after WebGPU surface underlay"
);
assert.ok(
  namespaceSource.indexOf("js/render/water-rendering.js") < namespaceSource.indexOf("js/render/surface-tile-batcher.js") &&
    namespaceSource.indexOf("js/render/tile-type-lut.js") < namespaceSource.indexOf("js/render/surface-tile-batcher.js") &&
    namespaceSource.indexOf("js/render/surface-tile-batcher.js") < namespaceSource.indexOf("js/render/webgpu-surface-tile.js"),
  "water rendering and tile type LUT helpers should load before the neutral surface tile batcher and WebGPU surface tile renderer"
);
assert.strictEqual(namespaceSource.indexOf("js/render/surface-tile-webgl.js"), -1, "runtime manifest must not load the legacy WebGL surface tile renderer");
assert.strictEqual(surfaceTileSource.indexOf("surfaceTileWebgl"), -1, "WebGPU surface tile renderer must not call the legacy WebGL batcher");
assert.ok(
  surfaceTileSource.indexOf("return PS.render.surfaceTileBatcher.appendBatches(batches, address, cellCache, alpha, lodState)") >= 0 &&
    surfaceTileSource.indexOf("item.lodState || lodState") >= 0,
  "WebGPU surface tile renderer should forward LOD state into CPU-side terrain batching"
);
assert.ok(
  surfaceTileSource.indexOf("canUseBatchCache") >= 0 &&
    surfaceTileSource.indexOf("getBatchCacheKey") >= 0 &&
    surfaceTileSource.indexOf("batchCacheHits") >= 0,
  "WebGPU surface tile renderer should expose the paused terrain batch cache"
);
assert.ok(
  surfaceTileSource.indexOf("this.makeBatches(address, cellCache, alpha, options && options.lodState)") >= 0,
  "single-atlas WebGPU terrain draw should build batches with the active LOD state"
);

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
    waterRenderingSource.indexOf("getWaterFrameIndex") >= 0 &&
    waterRenderingSource.indexOf("getAnimatedVariant") >= 0 &&
    surfaceTileSource.indexOf("drawShadowRects") >= 0 &&
    surfaceTileSource.indexOf("drawParticleRects") >= 0 &&
    surfaceTileSource.indexOf("drawDisplacementRects") >= 0,
  "surface tile renderer should batch floating water decorations and their shadows through rect renderers"
);
assert.ok(
  batcherSource.indexOf("appendSampleDisplacement") >= 0 &&
    batcherSource.indexOf("getSampleHeatDisplacement") >= 0,
  "surface tile batcher should derive heat haze displacement from terrain material signals"
);
assert.ok(
  batcherSource.indexOf("getTerrainAtlasKeyId = function") >= 0 &&
    batcherSource.indexOf("getAcceptedKeyId = function") >= 0 &&
    batcherSource.indexOf("getSettlementParcelKeyId = function") >= 0 &&
    batcherSource.indexOf("lut.getTerrainAtlasKeyId") >= 0,
  "surface tile batcher should route terrain, accepted, and parcel keys through integer LUT helpers"
);
assert.strictEqual(
  batcherSource.indexOf("var atlasKeyId = PS.render.surfaceTileBatcher.combineKeyIds(["),
  -1,
  "surface tile batcher hot loop should not allocate composite atlas key arrays"
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
vm.runInContext(tileTypeLutSource, context, { filename: "js/render/tile-type-lut.js" });
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
context.PS.render.wgslShaders.register("sprite-displace", spriteDisplaceWgsl, { path: "shaders/sprite-displace.wgsl" });

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
const acceptedTransitionCell = {
  name: "equivalence.terrain_transitions_v0.grass-water.edge.e",
  pageIndex: 0,
  u0: 0,
  v0: 0.5,
  u1: 0.5,
  v1: 1
};
let acceptedTerrainSelection = null;
let acceptedTransitionSelection = null;

context.PS.atlas.getTerrainCell = function () {
  return fallbackTerrainCell;
};
context.PS.assets.equivalence.selectCell = function (family, cellName, use, fallbackCellId) {
  if (family === "transitions") {
    acceptedTransitionSelection = { family, cellName, use, fallbackCellId };
    return {
      renderCell: Object.assign({}, acceptedTransitionCell, { name: "equivalence.terrain_transitions_v0." + cellName })
    };
  }
  acceptedTerrainSelection = { family, cellName, use, fallbackCellId };
  return {
    renderCell: acceptedTerrainCell
  };
};

const acceptedTerrainCache = [{
  sample: {
    biome: "grassland",
    acceptedTerrainCellName: "rock-mountain.0",
    detail: {
      surface: "grass"
    }
  },
  screenX: 0,
  screenY: 0
}];
const acceptedTerrainBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 0,
  sampleNorth: 0,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, acceptedTerrainCache, 1);

assert.strictEqual(acceptedTerrainBatches.equivalenceTerrain, 1, "explicit accepted terrain cells should count as equivalence terrain draws");
assert.ok(context.PS.render.tileTypeLut.getStats().terrainKeyLookups > 0, "surface tile batching should resolve terrain keys through the integer LUT");
assert.ok(context.PS.render.tileTypeLut.getStats().acceptedKeyLookups > 0, "accepted terrain batching should resolve equivalence keys through the integer LUT");
assert.strictEqual(acceptedTerrainSelection.family, "terrain", "explicit accepted terrain cell should use the terrain equivalence family");
assert.strictEqual(acceptedTerrainSelection.cellName, "rock-mountain.0", "explicit accepted terrain cell name should be passed to the selector");
assert.strictEqual(acceptedTerrainSelection.use, "terrainGround", "explicit accepted non-water terrain should use terrainGround stats");
assert.strictEqual(typeof acceptedTerrainCache[0].terrainAtlasKeyId, "number", "surface tile cache should store numeric atlas material key ids");
assert.strictEqual(typeof acceptedTerrainCache[0].terrainEquivalenceKeyId, "number", "surface tile cache should store numeric accepted-terrain key ids");
assert.strictEqual(acceptedTerrainCache[0].terrainAtlasEcologyKey, undefined, "surface tile cache should not rebuild composite atlas key strings");
assert.strictEqual(acceptedTerrainCache[0].terrainEquivalenceKey, undefined, "surface tile cache should not rebuild composite equivalence key strings");
assert.strictEqual(typeof acceptedTerrainCache[0].terrainAtlasSourceSignature, "object", "surface tile cache should track reusable terrain source signatures");
assert.ok(acceptedTerrainBatches.materialCounts[acceptedTerrainCell.name] > 0, "accepted terrain cell should replace fallback material in batches");
const acceptedTerrainLutStats = context.PS.render.tileTypeLut.getStats();
context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 0,
  sampleNorth: 0,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, acceptedTerrainCache, 1);
const acceptedTerrainReuseStats = context.PS.render.tileTypeLut.getStats();
assert.strictEqual(
  acceptedTerrainReuseStats.terrainKeyLookups,
  acceptedTerrainLutStats.terrainKeyLookups,
  "unchanged surface tile cells should reuse numeric terrain key state instead of resolving terrain keys every frame"
);
assert.ok(
  acceptedTerrainReuseStats.terrainKeyCacheHits > acceptedTerrainLutStats.terrainKeyCacheHits,
  "unchanged surface tile cells should report terrain key cache hits"
);
Object.keys(acceptedTerrainBatches.pages).forEach(function (pageIndex) {
  var page = acceptedTerrainBatches.pages[pageIndex];
  for (let offset = 10; offset < page.length; offset += 15) {
    assert.strictEqual(page.data[offset], 0, "non-split terrain instances should keep procedural G-buffer normal sampling");
  }
});

assert.strictEqual(
  context.PS.render.surfaceTileBatcher.getAcceptedTransitionPair({ type: "coast" }),
  "grass-water",
  "coast transitions should use accepted grass-water shoreline cells"
);
assert.strictEqual(
  context.PS.render.surfaceTileBatcher.getAcceptedTransitionPair({ type: "dry" }),
  "grass-sand",
  "dry biome edges should use accepted grass-sand cells"
);
assert.strictEqual(
  context.PS.render.surfaceTileBatcher.getAcceptedTransitionPair({ type: "frost" }),
  "rock-snow",
  "frost and snow lines should use accepted rock-snow cells"
);
assert.strictEqual(
  context.PS.render.surfaceTileBatcher.getAcceptedTransitionPair({ type: "canopy" }),
  "grass-forest-floor",
  "forest floor edges should use accepted grass-forest-floor cells"
);

context.PS.atlas.getTerrainTransitionInfo = function () {
  return {
    type: "coast",
    mask: 1,
    neighborBiome: "ocean",
    weight: 0.4,
    strength: 0.6
  };
};

const automaticTransitionBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 256,
  sampleNorth: 0,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [{
  sample: {
    biome: "grassland",
    acceptedTransitionCellName: "grass-water.edge.e",
    detail: { surface: "shoreline" },
    tileBlend: {
      transitionStrength: 0.6,
      biomeWeights: { grassland: 0.6, ocean: 0.4 },
      xAmount: 0.8,
      yAmount: 0.5
    }
  },
  screenX: 0,
  screenY: 0
}], 1);

assert.strictEqual(automaticTransitionBatches.count, 1, "legacy accepted transition overrides should replace the proof tile");
assert.strictEqual(automaticTransitionBatches.equivalenceTransitions, 1, "explicit accepted transition samples should select accepted transition cells");
assert.strictEqual(acceptedTransitionSelection.family, "transitions", "automatic transition cell should use the transitions equivalence family");
assert.strictEqual(acceptedTransitionSelection.cellName, "grass-water.edge.e", "coast mask should select the correct accepted shoreline edge");
assert.strictEqual(acceptedTransitionSelection.use, "terrainTransition", "automatic transition cells should record terrainTransition usage");
assert.ok(
  automaticTransitionBatches.materialCounts["equivalence.terrain_transitions_v0.grass-water.edge.e"] > 0,
  "accepted transition cell should replace fallback material when the sample carries an explicit accepted transition"
);

delete context.PS.atlas.getTerrainTransitionInfo;
context.PS.render.terrainTransitions = {
  resolve(tileX, tileY, grid) {
    assert.ok(grid && typeof grid.getTileId === "function", "surface transition adapter should pass the active tile grid to the resolver");
    assert.strictEqual(tileX, 4, "surface transition resolver should receive world tile X");
    assert.strictEqual(tileY, 7, "surface transition resolver should receive world tile Y");
    return {
      baseTile: "sand",
      overlays: [
        { sheet: "transitions/grass_sand", spriteIndex: 0, joinPatternIndex: 2 },
        { sheet: "transitions/snow_rock", spriteIndex: 8, joinPatternIndex: 7 }
      ]
    };
  }
};
acceptedTransitionSelection = null;
const resolverGrid = {
  getTileId(x, y) {
    return x === 4 && y === 7 ? "sand" : "grass_lush";
  }
};
const resolverTransitionBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 4,
  sampleNorth: 7,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1,
  transitionGrid: resolverGrid
}, [{
  sample: {
    biome: "desert",
    detail: { surface: "sand" }
  },
  screenX: 0,
  screenY: 0
}], 1);
assert.strictEqual(resolverTransitionBatches.count, 3, "resolver transitions should draw base terrain plus every accepted overlay");
assert.strictEqual(resolverTransitionBatches.equivalenceTransitions, 2, "resolver overlays should count as accepted transition draws");
assert.ok(resolverTransitionBatches.materialCounts["equivalence.terrain_transitions_v0.grass-sand.pattern-02"] > 0, "resolver grass-sand edge should map to accepted 46-pattern transition cell");
assert.ok(resolverTransitionBatches.materialCounts["equivalence.terrain_transitions_v0.rock-snow.pattern-07"] > 0, "resolver snow-rock inner corner should map to accepted 46-pattern transition cell");
const regionVisualLod = {
  visualPolicy: {
    level: "REGION",
    pointLightScale: 0.2,
    waterUvScrollScale: 0.2,
    autotileTransitions: "simplified",
    transitionAlphaScale: 0.25,
    normalLightingStrength: 0.3
  }
};
const simplifiedResolverTransitionBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 4,
  sampleNorth: 7,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1,
  transitionGrid: resolverGrid
}, [{
  sample: {
    biome: "desert",
    detail: { surface: "sand" }
  },
  screenX: 0,
  screenY: 0
}], 1, regionVisualLod);
assert.strictEqual(simplifiedResolverTransitionBatches.count, 2, "region LOD should simplify resolver transitions to one overlay");
assert.strictEqual(simplifiedResolverTransitionBatches.equivalenceTransitions, 1, "region LOD should count only the simplified accepted transition overlay");
const worldVisualLod = {
  visualPolicy: {
    level: "WORLD",
    pointLightScale: 0,
    waterUvScrollScale: 0,
    autotileTransitions: "disabled",
    transitionAlphaScale: 0,
    normalLightingStrength: 0
  }
};
const disabledResolverTransitionBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 4,
  sampleNorth: 7,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1,
  transitionGrid: resolverGrid
}, [{
  sample: {
    biome: "desert",
    detail: { surface: "sand" }
  },
  screenX: 0,
  screenY: 0
}], 1, worldVisualLod);
assert.strictEqual(disabledResolverTransitionBatches.count, 1, "world LOD should disable accepted transition overlays");
assert.strictEqual(disabledResolverTransitionBatches.equivalenceTransitions, 0, "world LOD should not count transition overlay draws");
delete context.PS.render.terrainTransitions;

const splitPageData = new Uint8Array(512 * 32 * 4);
for (let i = 0; i < splitPageData.length; i += 4) {
  splitPageData[i] = 96;
  splitPageData[i + 1] = 132;
  splitPageData[i + 2] = 64;
  splitPageData[i + 3] = 180;
}
const sheetCells = {};
["grass", "stone", "sand", "water"].forEach(function (material) {
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
  },
  terrain_water: {
    id: "terrain_water",
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

assert.strictEqual(context.PS.render.waterRendering.getWaterFrameIndex(0), 0, "water material animation should start on frame zero");
assert.strictEqual(context.PS.render.waterRendering.getWaterFrameIndex(500), 1, "water material animation should advance at 2 FPS");
assert.strictEqual(context.PS.render.waterRendering.getWaterFrameIndex(1500), 3, "water material animation should expose four frame phases");
context.world.timeMs = 500;
assert.strictEqual(context.PS.render.surfaceTileBatcher.getAcceptedTerrainMaterialCellName("ocean", {
  detail: { surface: "deep water", materialSignals: { waterDepth: 0.9 } }
}, 4, 6), "water-deep.1", "accepted deep water material selection should use the current animated frame phase");

context.world.timeMs = 0;
const waterMaterialStart = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 4,
  sampleNorth: 6,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [{
  sample: { biome: "ocean", detail: { surface: "open water", materialSignals: { waterDepth: 0.65 } } },
  screenX: 0,
  screenY: 0
}], 1);
context.world.timeMs = 500;
const waterMaterialNext = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 4,
  sampleNorth: 6,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [{
  sample: { biome: "ocean", detail: { surface: "open water", materialSignals: { waterDepth: 0.65 } } },
  screenX: 0,
  screenY: 0
}], 1);
assert.ok(waterMaterialStart.materialCounts["terrain.water.2"], "water material batching should include the phased start water cell");
assert.ok(waterMaterialNext.materialCounts["terrain.water.3"], "water material batching should advance to the next phased water cell");

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
const worldWaterBatches = context.PS.render.surfaceTileBatcher.makeBatches({
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
}], 1, worldVisualLod);
const worldWaterPage = worldWaterBatches.pages[Object.keys(worldWaterBatches.pages)[0]];
assert.strictEqual(worldWaterPage.data[13], 0, "world LOD should disable encoded shore wave animation");

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
const worldDecorationBatches = context.PS.render.surfaceTileBatcher.makeBatches({
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
}], 1, worldVisualLod);
assert.strictEqual(worldDecorationBatches.shadowRects.length, 0, "world LOD should skip open-water decoration shadows");
assert.strictEqual(worldDecorationBatches.waterDecorationRects.length, 0, "world LOD should skip open-water decoration particles");

const regionLightBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 2,
  sampleNorth: 3,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [{
  sample: {
    biome: "mountain",
    detail: {
      surface: "lava vent",
      materialSignals: { lava: 1 }
    }
  },
  screenX: 0,
  screenY: 0
}], 1, regionVisualLod);
assert.strictEqual(regionLightBatches.pointLights.length, 1, "region LOD should keep a reduced point-light signal");
assert.ok(nearly(regionLightBatches.pointLights[0].intensity, 1.05 * 0.2), "region LOD should scale point-light intensity by policy");
assert.strictEqual(regionLightBatches.displacementRects.length, 16, "region LOD should emit one heat-haze displacement instance for lava vents");
assert.ok(regionLightBatches.displacementRects[7] > 0, "heat-haze displacement should carry a positive source-scaled intensity");
assert.ok(regionLightBatches.displacementRects[7] < 16 * 0.58, "region LOD should reduce heat-haze displacement intensity");
assert.ok(regionLightBatches.displacementRects[6] > 16, "heat-haze displacement should carry a source radius for distance falloff");
const worldLightBatches = context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 2,
  sampleNorth: 3,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [{
  sample: {
    biome: "mountain",
    detail: {
      surface: "lava vent",
      materialSignals: { lava: 1 }
    }
  },
  screenX: 0,
  screenY: 0
}], 1, worldVisualLod);
assert.strictEqual(worldLightBatches.pointLights.length, 0, "world LOD should skip point-light submissions");
assert.strictEqual(worldLightBatches.displacementRects.length, 0, "world LOD should skip heat-haze displacement submissions");

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
const firstReuseKey = reusableTransitionCellData.terrainAtlasKeyId;
const firstReuseCellName = reusableTransitionCellData.terrainAtlasCell.name;
const reusableTransitionStats = context.PS.render.tileTypeLut.getStats();
context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 9,
  sampleNorth: 9,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [reusableTransitionCellData], 1);
const reusableTransitionCacheStats = context.PS.render.tileTypeLut.getStats();
assert.strictEqual(
  reusableTransitionCacheStats.terrainKeyLookups,
  reusableTransitionStats.terrainKeyLookups,
  "unchanged transition cells should not rebuild terrain LUT keys on the next frame"
);
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
assert.ok(
  context.PS.render.tileTypeLut.getStats().terrainKeyLookups > reusableTransitionCacheStats.terrainKeyLookups,
  "changed transition neighbor identity should rebuild the terrain LUT key once"
);
assert.notStrictEqual(reusableTransitionCellData.terrainAtlasKeyId, firstReuseKey, "batcher terrain cache key should include transition neighbor ground identity");
assert.notStrictEqual(reusableTransitionCellData.terrainAtlasCell.name, firstReuseCellName, "batcher should regenerate terrain cells when transition neighbor ground identity changes");

const originalTerrainCellForParcelCache = context.PS.atlas.getTerrainCell;
const originalCivilizationKeyForParcelCache = context.PS.atlas.getTerrainCivilizationKey;
const originalCivilizationInfoForParcelCache = context.PS.atlas.getTerrainCivilizationInfo;
let parcelFillResolutions = 0;
let baseTerrainResolutions = 0;
context.PS.atlas.getTerrainCivilizationKey = function () {
  return "civ0";
};
context.PS.atlas.getTerrainCivilizationInfo = function (sample) {
  return sample && sample.civilization && sample.civilization.type === "settlement"
    ? { type: "settlement", family: "yard", pressure: 0.65, bucket: 1, lineageId: 1 }
    : null;
};
context.PS.atlas.getTerrainCell = function (biome, tileX, tileY, sample) {
  if (sample && sample.renderSettlementParcelFillOnly) {
    parcelFillResolutions += 1;
    return {
      name: "parcel.fill." + String(sample.civilization && sample.civilization.family || "yard"),
      pageIndex: 0,
      u0: 0.5,
      v0: 0,
      u1: 1,
      v1: 0.5
    };
  }
  baseTerrainResolutions += 1;
  return {
    name: "base." + String(biome || "terrain"),
    pageIndex: 0,
    u0: 0,
    v0: 0,
    u1: 0.5,
    v1: 0.5
  };
};
const settlementParcelCacheCell = {
  sample: {
    biome: "grassland",
    detail: { surface: "grass", materialSignals: { settlementDensity: 0.55 } },
    civilization: { type: "settlement", family: "yard", pressure: 0.65 }
  },
  screenX: 0,
  screenY: 0
};
context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 2,
  sampleNorth: 2,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [settlementParcelCacheCell], 1, { zoomBand: "settlement", visualPolicy: { level: "LOCAL", transitionAlphaScale: 1 } });
context.PS.render.surfaceTileBatcher.makeBatches({
  sampleEast: 2,
  sampleNorth: 2,
  renderScreenX: 0,
  renderScreenY: 0,
  renderSamplePixelSize: 16,
  chunkSamples: 1
}, [settlementParcelCacheCell], 1, { zoomBand: "settlement", visualPolicy: { level: "LOCAL", transitionAlphaScale: 1 } });
assert.strictEqual(baseTerrainResolutions, 1, "unchanged settlement cells should reuse the cached base terrain cell");
assert.strictEqual(parcelFillResolutions, 1, "unchanged settlement parcel fill should reuse its cached terrain cell");
assert.strictEqual(typeof settlementParcelCacheCell.settlementParcelKeyId, "number", "settlement parcel fill cache should use a numeric key");
context.PS.atlas.getTerrainCell = originalTerrainCellForParcelCache;
context.PS.atlas.getTerrainCivilizationKey = originalCivilizationKeyForParcelCache;
context.PS.atlas.getTerrainCivilizationInfo = originalCivilizationInfoForParcelCache;

const originalAppendBatches = surfaceTile.appendBatches;
const originalDrawBatches = surfaceTile.drawBatches;
let terrainAppendCalls = 0;
let terrainDrawCalls = 0;
surfaceTile.appendBatches = function () {
  terrainAppendCalls += 1;
  return originalAppendBatches.apply(this, arguments);
};
surfaceTile.drawBatches = function (batches) {
  terrainDrawCalls += 1;
  assert.ok(batches && batches.count > 0, "cached terrain batches should preserve instance data");
  return true;
};
surfaceTile.clearBatchCache();
context.world.isPaused = true;
context.world.isCameraInteracting = false;
const cacheChunk = {
  address: {
    chunkKey: "paused-cache-test",
    sampleEast: 12,
    sampleNorth: 13,
    renderScreenX: 4,
    renderScreenY: 8,
    renderSamplePixelSize: 16,
    chunkSamples: 1
  },
  cellCache: [{
    sample: { biome: "grassland", detail: { surface: "grass" } },
    screenX: 4,
    screenY: 8
  }],
  alpha: 1,
  lodState: regionVisualLod
};
assert.strictEqual(surfaceTile.drawTerrainAtlasBatch([cacheChunk], 1, { lodState: regionVisualLod, loadOp: "clear" }), true, "first paused terrain draw should build batches");
assert.strictEqual(surfaceTile.drawTerrainAtlasBatch([cacheChunk], 1, { lodState: regionVisualLod, loadOp: "clear" }), true, "second stable paused terrain draw should reuse cached batches");
assert.strictEqual(terrainAppendCalls, 1, "paused stable terrain batch cache should avoid rebuilding CPU batches");
assert.strictEqual(terrainDrawCalls, 2, "paused cache should still draw every frame");
assert.ok(surfaceTile.getStats().batchCacheHits >= 1, "paused terrain cache should report a cache hit");
context.world.isPaused = false;
assert.strictEqual(surfaceTile.drawTerrainAtlasBatch([cacheChunk], 1, { lodState: regionVisualLod, loadOp: "clear" }), true, "active simulation terrain draw should rebuild batches");
assert.strictEqual(terrainAppendCalls, 2, "active simulation terrain draws should not reuse paused batches");
surfaceTile.appendBatches = originalAppendBatches;
surfaceTile.drawBatches = originalDrawBatches;
context.world.isPaused = true;

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
  waterDecorationRects: decorationBatches.waterDecorationRects,
  displacementRects: regionLightBatches.displacementRects
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
assert.strictEqual(textureWrites.length, 2, "atlas page and compositor cloud shadow texture should upload through GPUQueue.writeTexture");
assert.ok(textureWrites.some(function (write) {
  return write.destination.texture.descriptor.label === "gbuffer-compose.cloud-shadow";
}), "surface tile compositor should upload the cloud-shadow texture before composition");
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
assert.ok(queueWrites.some(function (write) {
  return write.buffer.descriptor.label === "displacement.instances.storage" && write.size === 16;
}), "surface tile draw should upload heat-haze displacement through the real displacement storage buffer");
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
assert.strictEqual(context.PS.render.webgpuEntity.getStats().displacementDrawCount, 1, "real displacement renderer should count heat-haze instances");
assert.ok(context.PS.render.webgpuEntity.getStats().displacementLastFrameMs >= 0, "displacement renderer should expose the pass time for the 0.3ms runtime budget gate");

context.PS.assets.equivalence = {
  getStats: function () {
    return {
      byUse: {
        terrainMaterial: 7,
        terrainTransition: 3
      },
      bySheet: {
        terrain_grass: 7,
        equivalence_terrain_transitions_v0: 3
      }
    };
  }
};
surfaceTile.state.equivalenceTerrainDrawCount = 0;
surfaceTile.state.equivalenceTransitionDrawCount = 0;
assert.strictEqual(surfaceTile.drawBatches({
  pages: {
    0: new Float32Array([
      8, 12, 16, 16,
      0, 0, 0.5, 0.5,
      1, 0.25, 1, 2, 33, 4, 0.75
    ])
  },
  count: 1,
  culled: 0,
  materialCounts: {},
  equivalenceTerrain: 0,
  equivalenceTransitions: 0,
  pointLights: [],
  shadowRects: [],
  waterDecorationRects: [],
  displacementRects: []
}, {
  sunDirection: [0, 3, 4],
  ambient: 0.41
}), true, "terrain material equivalence stats should still count as accepted terrain WebGPU evidence");
assert.strictEqual(
  surfaceTile.state.equivalenceTerrainDrawCount,
  7,
  "surface tile stats should promote terrainMaterial selections into accepted terrain draw evidence"
);
assert.strictEqual(
  surfaceTile.state.equivalenceTransitionDrawCount,
  3,
  "surface tile stats should promote terrainTransition selections into accepted transition draw evidence"
);

assert.strictEqual(surfaceTile.drawBatches({
  pages: {
    0: new Float32Array([
      8, 12, 16, 16,
      0, 0, 0.5, 0.5,
      1, 0.25, 1, 2, 33, 4, 0.75
    ])
  },
  count: 1,
  culled: 0,
  materialCounts: {},
  pointLights: [{ x: 8, y: 8, radius: 12, color: [1, 0.4, 0.1], intensity: 1, kind: "test" }],
  shadowRects: [],
  waterDecorationRects: [],
  displacementRects: []
}, {
  sunDirection: [0, 3, 4],
  ambient: 0.41,
  directionalStrength: 0.62,
  wrapStrength: 0.18,
  heightTintStrength: 0.07,
  lodState: regionVisualLod
}), true, "region LOD surface tile draw should still submit terrain with reduced lighting");
assert.ok(queueWrites.some(function (write) {
  return write.buffer.descriptor.label === "gbuffer-compose.uniforms" &&
    nearly(write.data[5], 0.62 * 0.3) &&
    nearly(write.data[6], 0.18 * 0.3) &&
    nearly(write.data[7], 0.07 * 0.3) &&
    nearly(write.data[12], 0.3);
}), "region LOD should scale normal-mapped compositor lighting strengths");

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
