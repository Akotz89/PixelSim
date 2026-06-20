const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const wgslManagerSource = read("js/render/wgsl-shader-manager.js");
const harnessSource = read("js/sim/compute-harness.js");
const biomeSource = read("js/sim/biome-lut.js");
const source = read("js/sim/moisture.js");
const shaderSource = read("shaders/moisture.wgsl");
const shaderSidecar = read("shaders/moisture.wgsl.js");
const configSource = read("sim/configs/moisture.json");
const configSidecar = read("sim/configs/moisture.json.js");

assert.ok(manifestSource.indexOf("js/sim/moisture.js") > manifestSource.indexOf("js/sim/reaction-diffusion.js"), "moisture should load after reaction diffusion");
assert.ok(manifestSource.indexOf("js/sim/moisture.js") < manifestSource.indexOf("js/sim/biome-lut.js"), "moisture should load before biome LUT");

[
  "@compute @workgroup_size(8, 8, 1)",
  "moisture_in: array<f32>",
  "moisture_out: array<f32>",
  "precipitation_out: array<f32>",
  "temperature_c: array<f32>",
  "elevation_m: array<f32>",
  "ocean_mask: array<f32>",
  "ocean_velocity: array<vec4<f32>>",
  "fn approximate_wind",
  "fn hadley_band_precipitation_mm",
  "params.hadley_strength",
  "params.westerly_strength",
  "params.lift_factor",
  "params.rain_shadow_drying",
  "let band_base = hadley_band_precipitation_mm",
  "annual_mm = min(annual_mm, 250.0",
  "annual_mm = max(annual_mm, 3300.0)",
  "max(0.0, temperature_c[index] - params.dew_point_c)",
  "moisture_out[index] = remaining",
  "precipitation_out[index] = annual_mm"
].forEach((required) => assert.ok(shaderSource.includes(required), "moisture WGSL should contain " + required));

assert.ok(shaderSidecar.includes("SHADER_SHADERS_MOISTURE_WGSL"), "WGSL sidecar should expose the expected global");
assert.ok(shaderSidecar.includes('PS.assets.registerText("shaders/moisture.wgsl"'), "WGSL sidecar should register text");
assert.ok(configSidecar.includes('PS.assets.registerJSON("sim/configs/moisture.json"'), "config sidecar should register JSON");

const sidecarContext = {
  window: {},
  PS: {
    assets: {
      registerText(url, text) {
        this.url = url;
        this.text = text;
      }
    }
  }
};
sidecarContext.window.window = sidecarContext.window;
vm.createContext(sidecarContext);
vm.runInContext(shaderSidecar, sidecarContext, { filename: "shaders/moisture.wgsl.js" });
assert.strictEqual(sidecarContext.window.SHADER_SHADERS_MOISTURE_WGSL, shaderSource, "WGSL sidecar should match raw shader");

const config = JSON.parse(configSource);
assert.strictEqual(config.target_tick_ms, 5, "moisture config should encode 5ms/tick budget");
assert.strictEqual(config.max_precipitation_mm, 4000, "precipitation should normalize 0-4000mm");
assert.deepStrictEqual(config.precipitation_bands.tropical, [2000, 4000], "config should define tropical precipitation range");
assert.deepStrictEqual(config.precipitation_bands.temperate, [500, 1500], "config should define temperate precipitation range");
assert.deepStrictEqual(config.precipitation_bands.desert, [50, 250], "config should define desert precipitation range");
assert.deepStrictEqual(config.precipitation_bands.polar, [100, 300], "config should define polar precipitation range");

const queueWrites = [];
const queueSubmits = [];
const fakeDevice = {
  buffers: [],
  bindGroups: [],
  pipelines: [],
  modules: [],
  textures: [],
  createBuffer(descriptor) {
    const buffer = { descriptor };
    this.buffers.push(buffer);
    return buffer;
  },
  createShaderModule(descriptor) {
    const module = { descriptor };
    this.modules.push(module);
    return module;
  },
  createComputePipeline(descriptor) {
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
    const group = { descriptor };
    this.bindGroups.push(group);
    return group;
  },
  createTexture(descriptor) {
    const texture = { descriptor };
    this.textures.push(texture);
    return texture;
  },
  createCommandEncoder(descriptor) {
    const encoder = {
      descriptor,
      passes: [],
      beginComputePass(passDescriptor) {
        const pass = {
          descriptor: passDescriptor,
          bindGroups: [],
          setPipeline(pipeline) { this.pipeline = pipeline; },
          setBindGroup(index, group) { this.bindGroups[index] = group; },
          dispatchWorkgroups(x, y, z) { this.workgroups = [x, y, z]; },
          end() { this.ended = true; }
        };
        this.passes.push(pass);
        return pass;
      },
      finish() { return { encoder: this }; }
    };
    this.lastEncoder = encoder;
    return encoder;
  }
};

const context = {
  window: { SHADER_SHADERS_MOISTURE_WGSL: shaderSource },
  PS: {
    assets: {},
    sim: {},
    render: {},
    gpu: {
      device: fakeDevice,
      queue: {
        writeBuffer(buffer, offset, sourceBuffer, sourceOffset, byteLength) {
          queueWrites.push({ buffer, offset, sourceBuffer, sourceOffset, byteLength });
        },
        submit(commandBuffers) {
          queueSubmits.push(commandBuffers);
        }
      }
    }
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
  ArrayBuffer,
  DataView
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(wgslManagerSource, context, { filename: "js/render/wgsl-shader-manager.js" });
vm.runInContext(harnessSource, context, { filename: "js/sim/compute-harness.js" });
vm.runInContext(biomeSource, context, { filename: "js/sim/biome-lut.js" });
vm.runInContext(source, context, { filename: "js/sim/moisture.js" });

const moisture = context.moisture;
moisture.registerManifest();
assert.ok(context.PS.render.wgslShaderManifest.some((entry) => entry.name === "moisture" && entry.path === "shaders/moisture.wgsl"), "moisture should register WGSL manifest entry");

const equatorWind = moisture.approximateWind(0, 0.1, config);
const subtropicalWind = moisture.approximateWind(Math.PI / 6, 0, config);
assert.ok(Number.isFinite(equatorWind.u) && Number.isFinite(equatorWind.v), "wind approximation should be finite");
assert.notStrictEqual(equatorWind.u.toFixed(4), subtropicalWind.u.toFixed(4), "Hadley and westerly terms should vary with latitude");

const warmOceanEvaporation = moisture.evaporationAt(25, 1, 1.2, config);
const coolOceanEvaporation = moisture.evaporationAt(10, 1, 1.2, config);
const warmLandEvaporation = moisture.evaporationAt(25, 0, 1.2, config);
assert.ok(warmOceanEvaporation > coolOceanEvaporation, "warm ocean SST above 20C should evaporate more than cool water");
assert.ok(warmOceanEvaporation > warmLandEvaporation, "ocean evaporation should exceed warm land evaporation");

const width = 64;
const height = 64;
const temperature = moisture.makeTemperatureField(width, height);
const oceanMask = moisture.makeOceanMask(width, height, { coastColumn: 10 });
const elevation = moisture.makeElevationRidge(width, height, { ridgeColumn: 33, ridgeHeightM: 2600, baseM: 120 });
const initialMoisture = moisture.makeInitialMoisture(width, height, { temperature, oceanMask });
const stepped = moisture.stepCpu(initialMoisture, width, height, { config, temperature, oceanMask, elevation });
assert.strictEqual(stepped.moisture.length, width * height, "moisture field should be scalar float cells");
assert.strictEqual(stepped.precipitationMm.length, width * height, "precipitation field should be scalar float cells");
assert.ok(moisture.validateNoNegative(stepped.moisture).valid, "moisture should never go negative");
assert.ok(moisture.validateNoNegative(stepped.precipitationMm).valid, "precipitation should never go negative");
assert.ok(Math.max(...Array.from(stepped.precipitationMm)) <= config.max_precipitation_mm, "annual precipitation should stay within normalized range");

const equatorRow = Math.round((90 / 180) * (height - 1));
const windward = moisture.getRowAverage(stepped.precipitationMm, width, equatorRow, 24, 32);
const leeward = moisture.getRowAverage(stepped.precipitationMm, width, equatorRow, 35, 45);
assert.ok(windward > leeward * 2, "single ridge should produce wet windward side and dry leeward side");
assert.ok(leeward <= config.precipitation_bands.desert[1], "leeward rain shadow should fall in desert precipitation range");

const flatElevation = moisture.makeScalarField(width, height, 120);
const bandStepped = moisture.stepCpu(initialMoisture, width, height, { config, temperature, oceanMask, elevation: flatElevation });
const bands = moisture.validatePrecipitationBands(bandStepped.precipitationMm, width, height, config);
assert.ok(bands.tropical >= config.precipitation_bands.tropical[0], "equatorial Hadley band should be wet");
assert.ok(bands.subtropical <= config.precipitation_bands.desert[1], "subtropical Hadley descent should be dry");
assert.ok(bands.temperate >= config.precipitation_bands.temperate[0] && bands.temperate <= config.precipitation_bands.temperate[1], "mid-latitude band should be temperate wet");
assert.ok(bands.polar >= config.precipitation_bands.polar[0] && bands.polar <= config.precipitation_bands.polar[1], "polar band should be low precipitation");

const normalizedPrecipitation = moisture.normalizePrecipitation(stepped.precipitationMm, config);
assert.ok(Array.from(normalizedPrecipitation).every((value) => value >= 0 && value <= 1), "precipitation map should normalize to 0-1");

const leewardBiome = moisture.classifyBiomeSample(31, leeward, elevation[equatorRow * width + 40]);
const tropicalWet = moisture.getRowAverage(bandStepped.precipitationMm, width, equatorRow, 0, 10);
assert.ok(tropicalWet >= 3200, "equatorial warm ocean cells should reach rainforest precipitation");
const tropicalBiome = moisture.classifyBiomeSample(30, tropicalWet, 100);
assert.ok(leewardBiome === "desert" || leewardBiome === "hot_desert", "rain shadow should sample as desert in biome LUT");
assert.strictEqual(tropicalBiome, "tropical_rainforest", "high-moisture tropical sample should classify as rainforest");

const debugMap = moisture.makePrecipitationMapRgba(stepped.precipitationMm, width, height, config);
assert.strictEqual(debugMap.data.length, width * height * 4, "precipitation debug map should export RGBA bytes");
assert.strictEqual(debugMap.mimeType, "image/png", "precipitation debug map should be image-exportable");
assert.ok(debugMap.description.includes("Annual precipitation"), "debug map should identify annual precipitation");

const biomeMoistureMap = moisture.getBiomeMoistureMapDescriptor(512, 512, config);
assert.strictEqual(biomeMoistureMap.shaderBinding, "moisture_map", "precipitation output should hand off to biome moisture texture binding");
assert.strictEqual(biomeMoistureMap.shaderPath, "shaders/biome-render.wgsl", "handoff should name the biome render shader consumer");
assert.strictEqual(biomeMoistureMap.sourceBufferId, "moisture.precipitation", "handoff should source from precipitation buffer");
assert.strictEqual(biomeMoistureMap.format, "r32float", "biome moisture map should use single-channel float texture data");
assert.strictEqual(biomeMoistureMap.unit, "millimeters-per-year", "biome moisture map should use annual precipitation millimeters");
assert.deepStrictEqual(Array.from(biomeMoistureMap.rangeMm), [0, 4000], "biome moisture map should preserve the 0-4000mm range");
assert.strictEqual(biomeMoistureMap.normalizedExport, false, "GPU biome handoff should not normalize millimeters before LUT sampling");
const biomeTexture = moisture.createBiomeMoistureTexture(fakeDevice, 512, 512, config);
assert.strictEqual(biomeTexture.texture.descriptor.format, "r32float", "created biome moisture texture should match shader sample format");
assert.deepStrictEqual(Array.from(biomeTexture.texture.descriptor.size), [512, 512, 1], "created biome moisture texture should match simulation dimensions");

const perf = moisture.getPerformanceContract(512, 512, config);
assert.strictEqual(perf.targetTickMs, 5, "performance contract should target <5ms/tick");
assert.deepStrictEqual(Array.from(perf.expectedWorkgroups), [64, 64, 1], "512x512 moisture pass should use 64x64 workgroups");

const params = moisture.makeParamsData(512, 512, config);
const paramsView = new DataView(params.buffer);
assert.strictEqual(params.byteLength, 64, "moisture params should be uniform aligned");
assert.strictEqual(paramsView.getUint32(0, true), 512, "params should encode width");
assert.strictEqual(paramsView.getUint32(4, true), 512, "params should encode height");
assert.ok(Math.abs(paramsView.getFloat32(8, true) - config.evaporation_coefficient) < 1e-6, "params should encode evaporation coefficient");
assert.ok(Math.abs(paramsView.getFloat32(48, true) - config.max_precipitation_mm) < 1e-6, "params should encode max precipitation");

context.PS.render.wgslShaders.register("moisture", shaderSource, { path: "shaders/moisture.wgsl" });
const result = moisture.init({ width: 512, height: 512, config });
const harness = context.PS.sim.computeHarness;
assert.strictEqual(result.moistureBytes, 512 * 512 * 4, "moisture state should allocate float cells");
assert.strictEqual(result.precipitationBytes, 512 * 512 * 4, "precipitation output should allocate float cells");
assert.strictEqual(result.oceanVelocityBytes, 512 * 512 * 4 * 4, "LBM ocean velocity proxy should allocate rgba float cells");
assert.strictEqual(result.biomeMoistureMap.sourceBufferId, "moisture.precipitation", "init should return biome LUT moisture-map handoff");
assert.strictEqual(result.biomeMoistureMap.unit, "millimeters-per-year", "init handoff should preserve precipitation units for LUT sampling");
assert.ok(harness.getState("moisture.field"), "moisture should register ping-pong state");
assert.ok(harness.buffers["moisture.precipitation"], "moisture should register precipitation output");
assert.ok(harness.buffers["moisture.temperature"], "moisture should register temperature input");
assert.ok(harness.buffers["moisture.elevation"], "moisture should register elevation input");
assert.ok(harness.buffers["moisture.oceanMask"], "moisture should register ocean mask input");
assert.ok(harness.buffers["moisture.oceanVelocity"], "moisture should register LBM ocean velocity input");
assert.ok(harness.buffers["moisture.params"], "moisture should register params uniform");
assert.ok(harness.passes.moisture, "moisture should register compute pass");
assert.ok(queueWrites.length >= 8, "moisture init should upload state and input buffers");

const readBefore = harness.getReadBuffer("moisture.field").id;
moisture.dispatch();
const computePass = fakeDevice.lastEncoder.passes[0];
assert.deepStrictEqual(computePass.workgroups, [64, 64, 1], "512x512 moisture pass should dispatch 8x8 workgroups");
assert.strictEqual(fakeDevice.bindGroups[0].descriptor.entries.length, 8, "moisture bind group should bind state, outputs, climate inputs, ocean velocity, and params");
assert.notStrictEqual(harness.getReadBuffer("moisture.field").id, readBefore, "moisture dispatch should swap ping-pong buffers");
assert.strictEqual(queueSubmits.length, 1, "owned moisture dispatch should submit command buffer");

console.log("moisture simulation checks passed");
