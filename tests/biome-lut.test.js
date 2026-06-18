require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function pngSize(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function inflatePng(buffer) {
  let offset = 8;
  const chunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") {
      chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    }
    if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }

  return zlib.inflateSync(Buffer.concat(chunks));
}

function rgbAt(raw, size, x, y) {
  const rowLength = size.width * 4 + 1;
  const offset = y * rowLength + 1 + x * 4;
  assert.strictEqual(raw[y * rowLength], 0, "biome LUT PNG should use unfiltered rows");
  return [raw[offset], raw[offset + 1], raw[offset + 2]];
}

function hexToRgb(hex) {
  const value = String(hex).replace("#", "");
  const intValue = parseInt(value, 16);
  return [(intValue >> 16) & 255, (intValue >> 8) & 255, intValue & 255];
}

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const biomeSource = read("js/sim/biome-lut.js");
const shaderSource = read("shaders/biome-render.wgsl");
const shaderSidecar = read("shaders/biome-render.wgsl.js");
const png = fs.readFileSync(path.join(root, "assets/biome-lut.png"));

assert.ok(
  manifestSource.indexOf("js/sim/biome-lut.js") > manifestSource.indexOf("js/sim/heat-diffusion.js"),
  "biome LUT should load after heat diffusion simulation data"
);
assert.ok(
  manifestSource.indexOf("js/sim/biome-lut.js") < manifestSource.indexOf("js/render/draw-order.js"),
  "biome LUT should load before draw ordering"
);

[
  "textureLoad(temperature_map",
  "textureLoad(moisture_map",
  "textureLoad(elevation_map",
  "textureLoad(current_map",
  "textureSample(biome_lut, biome_sampler",
  "snap_to_palette",
  "debug_mode",
  "SEA_LEVEL",
  "OCEAN_DEEP",
  "OCEAN_SHALLOW"
].forEach(function (required) {
  assert.ok(shaderSource.indexOf(required) >= 0, "biome WGSL should contain " + required);
});

assert.ok(shaderSidecar.indexOf("SHADER_SHADERS_BIOME_RENDER_WGSL") >= 0, "WGSL sidecar should expose the expected global");
assert.ok(shaderSidecar.indexOf('PS.assets.registerText("shaders/biome-render.wgsl"') >= 0, "WGSL sidecar should register text");

const sidecarContext = {
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
sidecarContext.window.window = sidecarContext.window;
vm.createContext(sidecarContext);
vm.runInContext(shaderSidecar, sidecarContext, { filename: "shaders/biome-render.wgsl.js" });
assert.strictEqual(sidecarContext.window.SHADER_SHADERS_BIOME_RENDER_WGSL, shaderSource, "WGSL sidecar should match raw shader source exactly");
assert.strictEqual(sidecarContext.PS.assets.url, "shaders/biome-render.wgsl", "WGSL sidecar should register the raw shader path");

const context = {
  window: {},
  PS: {
    sim: {},
    render: {},
    gpu: {}
  },
  Promise,
  Date,
  Object,
  String,
  Number,
  Math,
  Error,
  Array,
  Uint8Array
};

context.window.window = context.window;
vm.createContext(context);
vm.runInContext(biomeSource, context, { filename: "js/sim/biome-lut.js" });

const biomeLut = context.PS.sim.biomeLut;
assert.strictEqual(biomeLut.biomes.length, 13, "biome LUT should define 13 biomes");
assert.deepStrictEqual(
  Array.from(biomeLut.debugModes.map(function (mode) { return mode.id; })),
  [0, 1, 2, 3, 4],
  "biome LUT should expose debug modes 0-4"
);

biomeLut.registerManifest();
assert.ok(
  context.PS.render.wgslShaderManifest.some(function (entry) {
    return entry.name === "biome-render" && entry.path === "shaders/biome-render.wgsl";
  }),
  "biome LUT should register its WGSL manifest entry"
);

const samplerDescriptors = [];
const fakeDevice = {
  createSampler(descriptor) {
    samplerDescriptors.push(descriptor);
    return { descriptor };
  }
};
const samplers = biomeLut.ensureSamplers(fakeDevice);
assert.strictEqual(samplers.lut.descriptor.magFilter, "linear", "LUT sampler should use linear filtering");
assert.strictEqual(samplers.lut.descriptor.minFilter, "linear", "LUT sampler should use linear filtering");
assert.strictEqual(samplers.output.descriptor.magFilter, "nearest", "output sampler should preserve pixel art");
assert.strictEqual(samplers.output.descriptor.minFilter, "nearest", "output sampler should preserve pixel art");
assert.strictEqual(samplerDescriptors.length, 2, "biome LUT should create exactly two samplers");

assert.strictEqual(biomeLut.classifyBiome(28, 3600, 100), "tropical_rainforest", "equator wet climate should be tropical rainforest");
assert.strictEqual(biomeLut.classifyBiome(-25, 200, 100), "polar_ice", "polar cold climate should be ice");
assert.strictEqual(biomeLut.classifyBiome(12, 3800, 100), "wetlands", "saturated temperate climate should map to wetlands");
assert.strictEqual(biomeLut.classifyBiome(12, 1000, -200), "ocean_shallow", "below sea level should override to shallow ocean");
assert.strictEqual(biomeLut.classifyBiome(12, 1000, -2000), "ocean_deep", "deep below sea level should override to deep ocean");
assert.strictEqual(biomeLut.snapToPalette("#1b6a1b"), "#1a6b1a", "palette snap should pick the nearest art-bible color");

const generated = biomeLut.makeLutRgba();
const validation = biomeLut.validateLut(generated);
assert.strictEqual(validation.ok, true, "generated biome LUT should validate");
assert.deepStrictEqual(Array.from(validation.missing), [], "generated biome LUT should include all required biome IDs");
assert.deepStrictEqual(
  Array.from(generated.includedBiomes),
  Array.from(biomeLut.biomes.map(function (biome) { return biome.id; }).sort()),
  "generated biome LUT should cover all 13 biomes"
);
assert.strictEqual(generated.mimeType, "image/png", "generated biome LUT should be a PNG asset contract");

assert.deepStrictEqual(pngSize(png), { width: 256, height: 256 }, "biome LUT PNG should be 256x256");
const raw = inflatePng(png);
const colors = new Set();
for (let y = 0; y < 256; y += 1) {
  for (let x = 0; x < 256; x += 1) {
    colors.add(rgbAt(raw, { width: 256, height: 256 }, x, y).join(","));
  }
}

biomeLut.biomes.forEach(function (biome) {
  assert.ok(colors.has(hexToRgb(biome.color).join(",")), "PNG LUT should contain " + biome.id);
});

assert.deepStrictEqual(rgbAt(raw, { width: 256, height: 256 }, 200, 254), hexToRgb("#1a6b1a"), "wet hot LUT area should render tropical rainforest");
assert.deepStrictEqual(rgbAt(raw, { width: 256, height: 256 }, 0, 10), hexToRgb("#ffffff"), "cold dry LUT area should render polar ice");
assert.deepStrictEqual(rgbAt(raw, { width: 256, height: 256 }, 64, 0), hexToRgb("#102040"), "first LUT row should reserve deep ocean");
assert.deepStrictEqual(rgbAt(raw, { width: 256, height: 256 }, 64, 1), hexToRgb("#2060a0"), "second LUT row should reserve shallow ocean");

assert.notStrictEqual(biomeLut.getDebugSample(0, { temperatureC: 24, precipitationMm: 3500, elevationM: 100 }), biomeLut.getDebugSample(1, { temperatureC: 24, precipitationMm: 3500, elevationM: 100 }), "debug mode 0 should differ from temperature heatmap");
assert.notStrictEqual(biomeLut.getDebugSample(2, { moisture: 1 }), biomeLut.getDebugSample(3, { currentVelocity: { x: 1, y: 0 } }), "moisture and current debug modes should be distinct");

console.log("biome LUT checks passed");
