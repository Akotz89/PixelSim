const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const wgslManagerSource = read("js/render/wgsl-shader-manager.js");
const harnessSource = read("js/sim/compute-harness.js");
const mdSource = read("js/sim/molecular-dynamics.js");
const shaderSource = read("shaders/molecular-dynamics.wgsl");
const shaderSidecar = read("shaders/molecular-dynamics.wgsl.js");
const configSource = read("sim/configs/molecular-dynamics.json");
const configSidecar = read("sim/configs/molecular-dynamics.json.js");
const docs = read("docs/molecular-dynamics-zoom.md");
const packageJson = JSON.parse(read("package.json"));

assert.ok(packageJson.scripts.test.includes("tests/molecular-dynamics.test.js"), "npm test should include molecular dynamics checks");
assert.ok(manifestSource.indexOf("js/sim/molecular-dynamics.js") > manifestSource.indexOf("js/sim/geochemistry.js"), "molecular dynamics should load after geochemistry for macro chemistry inputs");
assert.ok(manifestSource.indexOf("js/sim/molecular-dynamics.js") < manifestSource.indexOf("js/sim/lenia.js"), "molecular dynamics should load before Lenia and coupled biology consumers");
assert.ok(docs.includes("Causal Inputs"), "docs should describe causal macro inputs");
assert.ok(docs.includes("Temperature sets particle kinetic energy"), "docs should document temperature coupling");

[
  "@compute @workgroup_size(64)",
  "struct Particle",
  "particles_in: array<Particle>",
  "particles_out: array<Particle>",
  "pair_force_scalar",
  "hydration_strength",
  "species_mass",
  "lennard"
].forEach((required) => assert.ok(shaderSource.toLowerCase().includes(required.toLowerCase()), "molecular dynamics WGSL should contain " + required));

assert.ok(shaderSidecar.includes("SHADER_SHADERS_MOLECULAR_DYNAMICS_WGSL"), "WGSL sidecar should expose global");
assert.ok(shaderSidecar.includes('PS.assets.registerText("shaders/molecular-dynamics.wgsl"'), "WGSL sidecar should register text");
assert.ok(configSidecar.includes('PS.assets.registerJSON("sim/configs/molecular-dynamics.json"'), "config sidecar should register JSON");

const config = JSON.parse(configSource);
assert.strictEqual(config.box_size, 256, "MD config should use a 256x256 micro-view box");
assert.strictEqual(config.pixel_size, 4, "MD config should render 4x4 pixel particles");
assert.ok(config.species.some((species) => species.id === "h2o" && species.color === "#4A90D9"), "config should define H2O color");
assert.ok(config.species.some((species) => species.id === "na"), "config should define Na+");
assert.ok(config.species.some((species) => species.id === "cl"), "config should define Cl-");

const sidecarContext = {
  window: {},
  PS: {
    assets: {
      registerText(url, text) {
        this.textUrl = url;
        this.text = text;
      },
      registerJSON(url, json) {
        this.jsonUrl = url;
        this.json = json;
      }
    }
  }
};
sidecarContext.window.window = sidecarContext.window;
vm.createContext(sidecarContext);
vm.runInContext(shaderSidecar, sidecarContext, { filename: "shaders/molecular-dynamics.wgsl.js" });
vm.runInContext(configSidecar, sidecarContext, { filename: "sim/configs/molecular-dynamics.json.js" });
assert.strictEqual(sidecarContext.window.SHADER_SHADERS_MOLECULAR_DYNAMICS_WGSL, shaderSource, "WGSL sidecar should match raw shader");
assert.strictEqual(sidecarContext.PS.assets.json.species.length, 8, "JSON sidecar should register particle species config");

const queueWrites = [];
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
  }
};

const context = {
  window: {
    SHADER_SHADERS_MOLECULAR_DYNAMICS_WGSL: shaderSource
  },
  PS: {
    assets: {},
    sim: {},
    render: {},
    gpu: {
      device: fakeDevice,
      queue: {
        writeBuffer(buffer, offset, sourceBuffer, sourceOffset, byteLength) {
          queueWrites.push({ buffer, offset, sourceBuffer, sourceOffset, byteLength });
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
  Uint16Array,
  ArrayBuffer,
  DataView
};
context.window.window = context.window;
context.window.PS = context.PS;
vm.createContext(context);
vm.runInContext(wgslManagerSource, context, { filename: "js/render/wgsl-shader-manager.js" });
vm.runInContext(harnessSource, context, { filename: "js/sim/compute-harness.js" });
vm.runInContext(mdSource, context, { filename: "js/sim/molecular-dynamics.js" });

const md = context.molecularDynamics;
md.registerManifest();
assert.ok(context.PS.render.wgslShaderManifest.some((entry) => entry.name === "molecular-dynamics"), "MD should register WGSL manifest entry");

const coldMacro = md.createStateFromMacroCell({ temperatureC: 0, salinityPsu: 35, pressureKpa: 101.3, medium: "water" }, { config, count: 120, seed: 5 });
const hotMacro = md.createStateFromMacroCell({ temperatureC: 80, salinityPsu: 35, pressureKpa: 101.3, medium: "water" }, { config, count: 120, seed: 5 });
assert.ok(md.kineticEnergy(hotMacro, config) > md.kineticEnergy(coldMacro, config) * 1.15, "hotter macro temperature should causally raise particle kinetic energy");

const fresh = md.createStateFromMacroCell({ temperatureC: 20, salinityPsu: 0, pressureKpa: 101.3, medium: "water" }, { config, count: 140, seed: 7 });
const brine = md.createStateFromMacroCell({ temperatureC: 20, salinityPsu: 70, pressureKpa: 101.3, medium: "water" }, { config, count: 140, seed: 7 });
assert.ok(md.countSpecies(brine, "na", config) > md.countSpecies(fresh, "na", config), "higher salinity should create more sodium particles");
assert.strictEqual(md.countSpecies(brine, "na", config), md.countSpecies(brine, "cl", config), "salt initialization should pair sodium and chloride counts");

const energyState = md.makeTwoBodyEnergyState(config);
const e0 = md.totalEnergy(energyState, config);
md.runValidationTicks(120, energyState, { config, dt: 0.001 });
const e1 = md.totalEnergy(energyState, config);
assert.ok(Math.abs((e1 - e0) / e0) < 0.005, "Velocity Verlet should conserve two-body LJ energy within 0.5%");

const water = md.createStateFromMacroCell({ temperatureC: 18, salinityPsu: 0, pressureKpa: 101.3, medium: "water" }, { config, count: 1000, seed: 11 });
assert.ok(md.measureWaterClustering(water, config) > 0.8, "1000-particle water view should show hydrogen-bond-like neighbor clustering");

const salty = md.createStateFromMacroCell({ temperatureC: 18, salinityPsu: 120, pressureKpa: 101.3, medium: "water" }, { config, count: 80, seed: 13 });
let saltDistanceBefore = 0;
let saltDistanceAfter = 0;
for (let i = 0; i < salty.count - 1; i += 2) {
  if (md.getSpecies(salty.species[i], config).id === "na" && md.getSpecies(salty.species[i + 1], config).id === "cl") {
    saltDistanceBefore += md.distance(salty, i, i + 1);
  }
}
md.runValidationTicks(80, salty, { config, dt: 0.002 });
for (let j = 0; j < salty.count - 1; j += 2) {
  if (md.getSpecies(salty.species[j], config).id === "na" && md.getSpecies(salty.species[j + 1], config).id === "cl") {
    saltDistanceAfter += md.distance(salty, j, j + 1);
  }
}
assert.ok(saltDistanceAfter > saltDistanceBefore * 1.1, "water hydration should dissociate Na+/Cl- pairs");

const cooling = md.createStateFromMacroCell({ temperatureC: 5, salinityPsu: 0, pressureKpa: 101.3, medium: "water" }, { config, count: 100, seed: 17 });
const latticeBefore = md.measureLatticeOrder(cooling, config);
md.runValidationTicks(30, cooling, { config, temperatureC: -10, dt: 0.001 });
assert.ok(md.measureLatticeOrder(cooling, config) > latticeBefore + 0.2, "subzero macro temperature should increase ordered lattice score");

const sprites = md.makeParticlePixelSprites(coldMacro, config);
assert.strictEqual(sprites.width, 256, "sprite export should preserve micro-view width");
assert.strictEqual(sprites.pixelSize, 4, "sprite export should use 4x4 pixel dots");
assert.strictEqual(sprites.sprites.length, coldMacro.count, "sprite export should include every particle");
assert.ok(sprites.sprites.every((sprite) => sprite.width === 4 && sprite.height === 4 && /^#[0-9A-F]{6}$/i.test(sprite.color)), "sprites should expose 4x4 species-colored dots");

const perf1000 = md.getPerformanceContract(1000, config);
const perf2000 = md.getPerformanceContract(2000, config);
assert.strictEqual(perf1000.boxSize, 256, "performance contract should target the 256x256 box");
assert.ok(perf1000.targetFps >= 30, "1000-particle contract should target >30 FPS");
assert.strictEqual(perf2000.usesSpatialHash, true, "2000-particle contract should require spatial hashing");
assert.ok(perf2000.targetFrameMs <= 16, "2000-particle contract should target <16ms/frame");

const hashState = md.createStateFromMacroCell({ temperatureC: 25, salinityPsu: 35, pressureKpa: 101.3, medium: "water" }, { config, count: 2000, seed: 23 });
const hashStart = process.hrtime.bigint();
const hash = md.buildSpatialHash(hashState, config);
const hashElapsedMs = Number(process.hrtime.bigint() - hashStart) / 1000000;
assert.strictEqual(hash.next.length, 2000, "spatial hash should link every 2000-particle entry");
assert.ok(hash.head.length > 0, "spatial hash should allocate grid heads");
assert.ok(hashElapsedMs < 16, "2000-particle spatial hash build should stay under 16ms");

const params = md.makeParamsData(1000, config);
const view = new DataView(params.buffer);
assert.strictEqual(params.byteLength, 32, "MD params should be uniform aligned");
assert.strictEqual(view.getUint32(0, true), 1000, "params should encode particle count");
assert.strictEqual(view.getUint32(24, true), 64, "params should encode workgroup size");

context.PS.render.wgslShaders.register("molecular-dynamics", shaderSource, { path: "shaders/molecular-dynamics.wgsl" });
const initState = md.init({ count: 1000, config, macro: { temperatureC: 25, salinityPsu: 35, pressureKpa: 101.3, medium: "water" } });
const harness = context.computeHarness;
const packed = md.packParticleData(initState);
const packedView = new DataView(packed.buffer);
assert.strictEqual(packed.byteLength, 1000 * 32, "particle upload should pack the GPU struct bytes");
assert.strictEqual(packedView.getUint32(24, true), initState.species[0], "packed particle bytes should encode species as u32");
assert.strictEqual(initState.count, 1000, "init should create the requested 1000-particle state");
assert.ok(harness.getState("molecular-dynamics.particles"), "MD should register particle ping-pong state");
assert.ok(harness.buffers["molecular-dynamics.params"], "MD should register params buffer");
assert.ok(harness.passes["molecular-dynamics"], "MD should register compute pass");
assert.deepStrictEqual(Array.from(harness.passes["molecular-dynamics"].workgroups()), [16, 1, 1], "1000 particles should dispatch 16 workgroups of 64");

console.log("molecular dynamics checks passed", JSON.stringify({
  hotKinetic: Number(md.kineticEnergy(hotMacro, config).toFixed(2)),
  coldKinetic: Number(md.kineticEnergy(coldMacro, config).toFixed(2)),
  latticeOrder: Number(md.measureLatticeOrder(cooling, config).toFixed(3))
}));
