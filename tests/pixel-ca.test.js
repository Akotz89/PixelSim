const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const wgslManagerSource = read("js/render/wgsl-shader-manager.js");
const harnessSource = read("js/sim/compute-harness.js");
const source = read("js/sim/pixel-ca.js");
const shaderSource = read("shaders/pixel-ca.wgsl");
const shaderSidecar = read("shaders/pixel-ca.wgsl.js");
const configSource = read("sim/configs/pixel-ca.json");
const configSidecar = read("sim/configs/pixel-ca.json.js");

assert.ok(manifestSource.indexOf("js/sim/pixel-ca.js") > manifestSource.indexOf("js/sim/moisture.js"), "pixel CA should load after moisture inputs");
assert.ok(manifestSource.indexOf("js/sim/pixel-ca.js") < manifestSource.indexOf("js/sim/biome-lut.js"), "pixel CA should load before biome visualization");

[
  "@compute @workgroup_size(8, 8, 1)",
  "fn ca_step",
  "let tick_offset = i32(params.tick % 2u)",
  "vec2<i32>",
  "element_in: array<u32>",
  "element_out: array<u32>",
  "temperature_c: array<f32>",
  "lbm_velocity: array<vec4<f32>>",
  "heat_source_out: array<f32>",
  "fn pack_element",
  "Bits 0-7",
  "ELEMENT_WATER",
  "ELEMENT_SEA_WATER",
  "ELEMENT_ICE",
  "ELEMENT_SNOW",
  "ELEMENT_LAVA",
  "ELEMENT_STEAM",
  "ELEMENT_GAS",
  "ELEMENT_SOIL",
  "ELEMENT_SAND",
  "ELEMENT_ROCK",
  "ELEMENT_ORGANIC",
  "ELEMENT_SALT",
  "can_sink",
  "thermal_transition",
  "FLAG_MOVED_THIS_TICK"
].forEach((required) => assert.ok(shaderSource.includes(required), "pixel CA WGSL should contain " + required));

assert.ok(shaderSidecar.includes("SHADER_SHADERS_PIXEL_CA_WGSL"), "WGSL sidecar should expose the expected global");
assert.ok(shaderSidecar.includes('PS.assets.registerText("shaders/pixel-ca.wgsl"'), "WGSL sidecar should register text");
assert.ok(configSidecar.includes('PS.assets.registerJSON("sim/configs/pixel-ca.json"'), "config sidecar should register JSON");

const sidecarContext = {
  window: {},
  PS: { assets: { registerText(url, text) { this.url = url; this.text = text; } } }
};
sidecarContext.window.window = sidecarContext.window;
vm.createContext(sidecarContext);
vm.runInContext(shaderSidecar, sidecarContext, { filename: "shaders/pixel-ca.wgsl.js" });
assert.strictEqual(sidecarContext.window.SHADER_SHADERS_PIXEL_CA_WGSL, shaderSource, "WGSL sidecar should match raw shader");

const config = JSON.parse(configSource);
assert.strictEqual(config.element_count, 13, "pixel CA should define 13 element types");
assert.strictEqual(config.target_tick_ms, 5, "pixel CA should target <5ms/tick");
assert.strictEqual(config.mass_tolerance, 0.001, "pixel CA should conserve water mass within 0.1%");
assert.deepStrictEqual(Object.keys(config.element_ids).sort(), ["empty", "gas", "ice", "lava", "organic", "rock", "salt", "sand", "sea_water", "snow", "soil", "steam", "water"], "config should define all Linear element types");

const queueWrites = [];
const queueSubmits = [];
const fakeDevice = {
  buffers: [],
  bindGroups: [],
  pipelines: [],
  modules: [],
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
  createCommandEncoder(descriptor) {
    const encoder = {
      descriptor,
      passes: [],
      beginComputePass(passDescriptor) {
        const pass = {
          descriptor: passDescriptor,
          setPipeline(pipeline) { this.pipeline = pipeline; },
          setBindGroup(index, group) { this.bindGroup = group; },
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
  window: { SHADER_SHADERS_PIXEL_CA_WGSL: shaderSource },
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
  Uint32Array,
  ArrayBuffer,
  DataView
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(wgslManagerSource, context, { filename: "js/render/wgsl-shader-manager.js" });
vm.runInContext(harnessSource, context, { filename: "js/sim/compute-harness.js" });
vm.runInContext(source, context, { filename: "js/sim/pixel-ca.js" });

const pixelCa = context.PS.sim.pixelCa;
pixelCa.registerManifest();
assert.ok(context.PS.render.wgslShaderManifest.some((entry) => entry.name === "pixel-ca" && entry.path === "shaders/pixel-ca.wgsl"), "pixel CA should register WGSL manifest entry");

const packed = pixelCa.packCell(pixelCa.elements.seaWater, 42, 199, pixelCa.flags.onFire);
assert.deepStrictEqual(JSON.parse(JSON.stringify(pixelCa.unpackCell(packed))), { element: pixelCa.elements.seaWater, temperatureQ: 42, salinityQ: 199, flags: pixelCa.flags.onFire }, "packed u32 storage should preserve element, temperature, salinity, and flags");
assert.ok(pixelCa.densityRank(pixelCa.elements.seaWater) > pixelCa.densityRank(pixelCa.elements.water), "sea water should be denser than fresh water");
assert.ok(pixelCa.densityRank(pixelCa.elements.water) > pixelCa.densityRank(pixelCa.elements.steam), "water should be denser than steam");

const E = pixelCa.elements;
const empty = pixelCa.packCell(E.empty, 0, 0, 0);
const water = pixelCa.packCell(E.water, 0, 0, 0);
const sea = pixelCa.packCell(E.seaWater, 0, 255, 0);
const ice = pixelCa.packCell(E.ice, 0, 0, 0);
const lava = pixelCa.packCell(E.lava, 200, 0, 0);
const steam = pixelCa.packCell(E.steam, 100, 0, 0);
const rock = pixelCa.packCell(E.rock, 120, 0, 0);

let block = pixelCa.applyBlockRules(water, empty, empty, empty, 20, 20, config);
assert.strictEqual(pixelCa.unpackCell(block.bl).element, E.water, "water should flow down in a 2x2 Margolus block");
block = pixelCa.applyBlockRules(water, empty, sea, empty, 20, 20, config);
assert.strictEqual(pixelCa.unpackCell(block.bl).element, E.seaWater, "denser sea water should stay below fresh water");
block = pixelCa.applyBlockRules(ice, empty, empty, empty, 5, 5, config);
assert.strictEqual(pixelCa.unpackCell(block.bl).element, E.water, "ice should melt to water when temperature is above 0C");
block = pixelCa.applyBlockRules(lava, empty, empty, empty, 200, 200, config);
assert.strictEqual(pixelCa.unpackCell(block.bl).element, E.rock, "lava should solidify below 700C");
block = pixelCa.applyBlockRules(steam, empty, water, empty, 40, 40, config);
assert.strictEqual(pixelCa.unpackCell(block.bl).element, E.water, "steam should condense below 100C");
block = pixelCa.applyBlockRules(rock, empty, empty, empty, 1300, 1300, config);
assert.strictEqual(pixelCa.unpackCell(block.bl).element, E.lava, "rock should melt above 1200C");

const width = 8;
const height = 8;
const field = new Uint32Array(width * height);
field.fill(empty);
field[1 * width + 2] = water;
field[1 * width + 3] = water;
field[2 * width + 2] = empty;
field[2 * width + 3] = empty;
field[4 * width + 4] = ice;
field[5 * width + 5] = lava;
const temperature = pixelCa.makeTemperatureField(width, height, 20);
temperature[5 * width + 5] = 100;
const beforeMass = pixelCa.countWaterMass(field);
const tick0 = pixelCa.stepCpu(field, width, height, { config, temperature, tick: 0 });
const tick1 = pixelCa.stepCpu(tick0, width, height, { config, temperature, tick: 1 });
assert.ok(pixelCa.countWaterMass(tick1) >= beforeMass, "thermal melt/condense transitions should not destroy water mass");
assert.ok(pixelCa.validateMassConservation(field, tick0, config.mass_tolerance).valid, "water movement should conserve mass within 0.1%");
assert.ok(pixelCa.validateNoCheckerboard(tick1, width, height).valid, "alternating Margolus offsets should avoid checkerboard dominance");
assert.notDeepStrictEqual(Array.from(tick0), Array.from(tick1), "odd/even Margolus offsets should update different 2x2 blocks");

const handoff = pixelCa.getLbmHandoffDescriptor(512, 512, config);
assert.strictEqual(handoff.boundary, "coast-shallow-water", "LBM handoff should be a coast/shallow-water boundary");
assert.strictEqual(handoff.surfaceDepthM, 100, "pixel CA should represent the top 100m surface layer");
assert.ok(handoff.reads.includes("ocean.velocity"), "pixel CA should read LBM velocity at the boundary");
assert.ok(handoff.writes.includes("pixel-ca.elements"), "pixel CA should write packed element state");

const params = pixelCa.makeParamsData(512, 512, config, 7);
const paramsView = new DataView(params.buffer);
assert.strictEqual(params.byteLength, 32, "pixel CA params should be uniform aligned");
assert.strictEqual(paramsView.getUint32(0, true), 512, "params should encode width");
assert.strictEqual(paramsView.getUint32(4, true), 512, "params should encode height");
assert.strictEqual(paramsView.getUint32(8, true), 7, "params should encode tick");
assert.strictEqual(paramsView.getUint32(12, true), 13, "params should encode element count");

const perf = pixelCa.getPerformanceContract(512, 512, config);
assert.strictEqual(perf.targetTickMs, 5, "performance contract should target <5ms per CA tick");
assert.deepStrictEqual(Array.from(perf.expectedWorkgroups), [32, 32, 1], "512x512 CA should dispatch one work item per 2x2 block");

context.PS.render.wgslShaders.register("pixel-ca", shaderSource, { path: "shaders/pixel-ca.wgsl" });
const result = pixelCa.init({ width: 512, height: 512, config, tick: 7 });
const harness = context.PS.sim.computeHarness;
assert.strictEqual(result.elementBytes, 512 * 512 * 4, "pixel CA state should allocate packed u32 cells");
assert.strictEqual(result.scalarBytes, 512 * 512 * 4, "pixel CA scalar coupling buffers should allocate float cells");
assert.strictEqual(result.vectorBytes, 512 * 512 * 4 * 4, "LBM velocity coupling should allocate rgba float cells");
assert.ok(harness.getState("pixel-ca.elements"), "pixel CA should register element ping-pong state");
assert.ok(harness.buffers["pixel-ca.temperature"], "pixel CA should register heat diffusion temperature input");
assert.ok(harness.buffers["pixel-ca.lbmVelocity"], "pixel CA should register LBM velocity input");
assert.ok(harness.buffers["pixel-ca.heatSource"], "pixel CA should register heat feedback output");
assert.ok(harness.buffers["pixel-ca.params"], "pixel CA should register params uniform");
assert.ok(harness.passes["pixel-ca"], "pixel CA should register compute pass");
assert.strictEqual(result.lbmHandoff.boundary, "coast-shallow-water", "init should return LBM handoff descriptor");
assert.ok(queueWrites.length >= 5, "pixel CA init should upload state and coupling buffers");

const readBefore = harness.getReadBuffer("pixel-ca.elements").id;
pixelCa.dispatch();
const computePass = fakeDevice.lastEncoder.passes[0];
assert.deepStrictEqual(computePass.workgroups, [32, 32, 1], "512x512 pixel CA pass should dispatch 2x2 Margolus workgroups");
assert.strictEqual(fakeDevice.bindGroups[0].descriptor.entries.length, 6, "pixel CA bind group should bind state, temperature, LBM velocity, heat output, and params");
assert.notStrictEqual(harness.getReadBuffer("pixel-ca.elements").id, readBefore, "pixel CA dispatch should swap element ping-pong buffers");
assert.strictEqual(queueSubmits.length, 1, "owned pixel CA dispatch should submit command buffer");

console.log("pixel CA checks passed");
