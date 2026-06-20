import { PS } from "../core/namespace.js";
import { computeHarness } from "./compute-harness.js";

PS.sim = PS.sim || {};
export const molecularDynamics = {
  shaderName: "molecular-dynamics",
  shaderPath: "shaders/molecular-dynamics.wgsl",
  configPath: "sim/configs/molecular-dynamics.json",
  passId: "molecular-dynamics",
  stateId: "molecular-dynamics.particles",
  workgroupSize: 64,
  defaults: {
    box_size: 256,
    target_tick_ms_1000: 33.33,
    target_tick_ms_2000: 16,
    dt: 0.002,
    cutoff: 14,
    lattice_spacing: 8,
    pixel_size: 4,
    thermostat_probability: 0.0,
    hydration_strength: 42,
    cooling_lattice_strength: 0.08,
    species: [{ id: "h2o", color: "#4A90D9", epsilon: 0.65, sigma: 3.1, mass: 18, charge: 0, channel: 0 }, { id: "na", color: "#F5A623", epsilon: 0.20, sigma: 2.4, mass: 23, charge: 1, channel: 1 }, { id: "cl", color: "#7ED321", epsilon: 0.35, sigma: 3.8, mass: 35.5, charge: -1, channel: 2 }, { id: "co2", color: "#9B9B9B", epsilon: 0.24, sigma: 3.3, mass: 44, charge: 0, channel: 3 }, { id: "o2", color: "#BD10E0", epsilon: 0.12, sigma: 3.0, mass: 32, charge: 0, channel: 4 }, { id: "sio4", color: "#FF3300", epsilon: 2.00, sigma: 4.2, mass: 92, charge: -4, channel: 5 }, { id: "ch4", color: "#F8E71C", epsilon: 0.13, sigma: 3.7, mass: 16, charge: 0, channel: 6 }, { id: "ca", color: "#D0021B", epsilon: 0.40, sigma: 3.0, mass: 40, charge: 2, channel: 7 }]
  },
  config: null,
  state: null,
  registerManifest: function () {
    return PS.render.registerWgslShaderManifestEntries({ name: this.shaderName, path: this.shaderPath });
  },
  normalizeConfig: function (config) {
    var source = config || {};
    var merged = {};
    var key;
    for (key in this.defaults) {
      if (Object.prototype.hasOwnProperty.call(this.defaults, key)) {
        merged[key] = this.defaults[key];
      }
    }
    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        merged[key] = source[key];
      }
    }
    merged.species = Array.isArray(source.species) ? source.species : this.defaults.species;
    return merged;
  },
  loadAssets: function (loader) {
    var self = this;
    var assetLoader = loader || (PS.assets && PS.assets.startupLoader) || (PS.assets && PS.assets.AssetLoader ? new PS.assets.AssetLoader() : null);
    var configPromise = assetLoader && typeof assetLoader.loadJSON === "function"
      ? assetLoader.loadJSON(this.configPath)
      : Promise.resolve(this.defaults);
    this.registerManifest();
    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.loadFromFile !== "function") {
      return Promise.reject(new Error("WGSL shader manager is required for molecular dynamics"));
    }
    return Promise.all([
      configPromise,
      PS.render.wgslShaders.loadFromFile(this.shaderName, this.shaderPath, assetLoader)
    ]).then(function (results) {
      self.config = self.normalizeConfig(results[0]);
      return { config: self.config, shader: results[1] };
    });
  },
  random01: function (seed) {
    var next = (Math.imul((Number(seed) || 1) >>> 0, 1664525) + 1013904223) >>> 0;
    return { seed: next || 1, value: next / 4294967296 };
  },
  speciesIndex: function (id, config) {
    var list = this.normalizeConfig(config || this.config || {}).species;
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i].id) === String(id) || Number(list[i].channel) === Number(id)) {
        return i;
      }
    }
    return 0;
  },
  getSpecies: function (index, config) {
    var list = this.normalizeConfig(config || this.config || {}).species;
    return list[Math.max(0, Math.min(list.length - 1, Math.round(Number(index) || 0)))] || list[0];
  },
  makeState: function (count, options) {
    var spec = options || {};
    var n = Math.max(1, Math.round(Number(count) || 1));
    var config = this.normalizeConfig(spec.config || this.config || {});
    var box = Math.max(16, Number(spec.boxSize || spec.box_size || config.box_size) || this.defaults.box_size);
    var state = {
      count: n,
      boxSize: box,
      x: new Float32Array(n),
      y: new Float32Array(n),
      vx: new Float32Array(n),
      vy: new Float32Array(n),
      fx: new Float32Array(n),
      fy: new Float32Array(n),
      species: new Uint16Array(n),
      flags: new Uint16Array(n),
      seed: (Number(spec.seed) || 13) >>> 0
    };
    var temperatureK = this.temperatureToKelvin(spec.temperatureC === undefined ? 20 : spec.temperatureC);
    var velocityScale = this.temperatureVelocityScale(temperatureK);
    var columns = Math.ceil(Math.sqrt(n));
    var saltPairs = Math.round(n * Math.max(0, Number(spec.salinityPsu) || 0) / 350);
    saltPairs -= saltPairs % 2;
    var pressureScale = Math.max(0.72, Math.min(1.1, 1 - (Math.max(0, Number(spec.pressureKpa) || 101.3) - 101.3) / 16000));
    var span = box * pressureScale;
    for (var i = 0; i < n; i += 1) {
      var cellX = i % columns;
      var cellY = Math.floor(i / columns);
      var rx = this.random01(state.seed); state.seed = rx.seed;
      var ry = this.random01(state.seed); state.seed = ry.seed;
      state.x[i] = ((cellX + 0.5) / columns) * span + (box - span) * 0.5 + (rx.value - 0.5) * 1.5;
      state.y[i] = ((cellY + 0.5) / columns) * span + (box - span) * 0.5 + (ry.value - 0.5) * 1.5;
      if (i < saltPairs) {
        state.species[i] = this.speciesIndex(i % 2 === 0 ? "na" : "cl", config);
      } else if (String(spec.medium || "water") === "atmosphere") {
        state.species[i] = this.speciesIndex(i % 3 === 0 ? "co2" : "o2", config);
      } else if (String(spec.medium || "water") === "lava") {
        state.species[i] = this.speciesIndex("sio4", config);
      } else {
        state.species[i] = this.speciesIndex("h2o", config);
      }
      var rvx = this.random01(state.seed); state.seed = rvx.seed;
      var rvy = this.random01(state.seed); state.seed = rvy.seed;
      state.vx[i] = (rvx.value - 0.5) * velocityScale;
      state.vy[i] = (rvy.value - 0.5) * velocityScale;
    }
    for (var p = 0; p + 1 < saltPairs; p += 2) {
      var pairIndex = p / 2;
      var pairColumns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, saltPairs / 2))));
      var px = pairIndex % pairColumns;
      var py = Math.floor(pairIndex / pairColumns);
      var centerX = ((px + 0.5) / pairColumns) * span + (box - span) * 0.5;
      var centerY = ((py + 0.5) / pairColumns) * span + (box - span) * 0.5;
      state.x[p] = centerX - 0.6;
      state.y[p] = centerY;
      state.x[p + 1] = centerX + 0.6;
      state.y[p + 1] = centerY;
      state.vx[p] = -Math.abs(state.vx[p]) * 0.15;
      state.vx[p + 1] = Math.abs(state.vx[p + 1]) * 0.15;
    }
    this.removeNetMomentum(state);
    if (temperatureK <= 273.15) {
      this.snapWaterToLattice(state, config, 1);
    }
    return state;
  },
  createStateFromMacroCell: function (macro, options) {
    var spec = options || {};
    var source = macro || {};
    return this.makeState(spec.count || 1000, {
      config: spec.config,
      seed: spec.seed,
      boxSize: spec.boxSize || spec.box_size,
      temperatureC: Number(source.temperatureC),
      salinityPsu: Number(source.salinityPsu),
      pressureKpa: Number(source.pressureKpa),
      medium: source.medium || "water"
    });
  },
  temperatureToKelvin: function (temperatureC) {
    return Math.max(1, (Number(temperatureC) || 0) + 273.15);
  },
  temperatureVelocityScale: function (temperatureK) {
    return Math.sqrt(Math.max(1, Number(temperatureK) || 273.15) / 273.15) * 22;
  },
  removeNetMomentum: function (state) {
    var sx = 0;
    var sy = 0;
    for (var i = 0; i < state.count; i += 1) {
      sx += state.vx[i];
      sy += state.vy[i];
    }
    sx /= Math.max(1, state.count);
    sy /= Math.max(1, state.count);
    for (var j = 0; j < state.count; j += 1) {
      state.vx[j] -= sx;
      state.vy[j] -= sy;
    }
  },
  periodicDelta: function (a, b, box) {
    var d = b - a;
    if (d > box * 0.5) { d -= box; }
    if (d < -box * 0.5) { d += box; }
    return d;
  },
  pairParams: function (speciesA, speciesB) {
    return {
      epsilon: Math.sqrt(Math.max(0.0001, Number(speciesA.epsilon) || 0.1) * Math.max(0.0001, Number(speciesB.epsilon) || 0.1)),
      sigma: (Math.max(0.1, Number(speciesA.sigma) || 3) + Math.max(0.1, Number(speciesB.sigma) || 3)) * 0.5
    };
  },
  computeForces: function (state, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var cutoff = Math.max(1, Number(settings.cutoff) || this.defaults.cutoff);
    var cutoffSq = cutoff * cutoff;
    var waterFraction = this.countSpecies(state, "h2o", settings) / Math.max(1, state.count);
    state.fx.fill(0);
    state.fy.fill(0);
    for (var i = 0; i < state.count; i += 1) {
      for (var j = i + 1; j < state.count; j += 1) {
        var dx = this.periodicDelta(state.x[i], state.x[j], state.boxSize);
        var dy = this.periodicDelta(state.y[i], state.y[j], state.boxSize);
        var r2 = Math.max(0.36, dx * dx + dy * dy);
        if (r2 > cutoffSq) { continue; }
        var speciesA = this.getSpecies(state.species[i], settings);
        var speciesB = this.getSpecies(state.species[j], settings);
        var params = this.pairParams(speciesA, speciesB);
        var invR2 = 1 / r2;
        var sr2 = (params.sigma * params.sigma) * invR2;
        var sr6 = sr2 * sr2 * sr2;
        var scalar = 24 * params.epsilon * invR2 * (2 * sr6 * sr6 - sr6);
        if (waterFraction > 0.45 && ((speciesA.id === "na" && speciesB.id === "cl") || (speciesA.id === "cl" && speciesB.id === "na"))) {
          scalar += Math.max(0, Number(settings.hydration_strength) || this.defaults.hydration_strength) * waterFraction * invR2;
        }
        state.fx[i] -= scalar * dx;
        state.fy[i] -= scalar * dy;
        state.fx[j] += scalar * dx;
        state.fy[j] += scalar * dy;
      }
    }
    return state;
  },
  stepCpu: function (state, options) {
    var spec = options || {};
    var settings = this.normalizeConfig(spec.config || this.config || {});
    var dt = Number(spec.dt || settings.dt) || this.defaults.dt;
    this.computeForces(state, settings);
    for (var i = 0; i < state.count; i += 1) {
      var massA = Math.max(0.1, Number(this.getSpecies(state.species[i], settings).mass) || 1);
      state.vx[i] += (state.fx[i] / massA) * dt * 0.5;
      state.vy[i] += (state.fy[i] / massA) * dt * 0.5;
      state.x[i] = (state.x[i] + state.vx[i] * dt + state.boxSize) % state.boxSize;
      state.y[i] = (state.y[i] + state.vy[i] * dt + state.boxSize) % state.boxSize;
    }
    if (spec.temperatureC !== undefined && Number(spec.temperatureC) <= 0) {
      this.snapWaterToLattice(state, settings, Number(settings.cooling_lattice_strength) || this.defaults.cooling_lattice_strength);
    }
    this.computeForces(state, settings);
    for (var j = 0; j < state.count; j += 1) {
      var massB = Math.max(0.1, Number(this.getSpecies(state.species[j], settings).mass) || 1);
      state.vx[j] += (state.fx[j] / massB) * dt * 0.5;
      state.vy[j] += (state.fy[j] / massB) * dt * 0.5;
    }
    return state;
  },
  runValidationTicks: function (ticks, state, options) {
    var count = Math.max(0, Math.round(Number(ticks) || 0));
    for (var i = 0; i < count; i += 1) {
      this.stepCpu(state, options);
    }
    return state;
  },
  packParticleData: function (state) {
    var buffer = new ArrayBuffer(state.count * 32);
    var view = new DataView(buffer);
    for (var i = 0; i < state.count; i += 1) {
      var offset = i * 32;
      view.setFloat32(offset, state.x[i], true);
      view.setFloat32(offset + 4, state.y[i], true);
      view.setFloat32(offset + 8, state.vx[i], true);
      view.setFloat32(offset + 12, state.vy[i], true);
      view.setFloat32(offset + 16, state.fx[i], true);
      view.setFloat32(offset + 20, state.fy[i], true);
      view.setUint32(offset + 24, state.species[i], true);
      view.setUint32(offset + 28, state.flags[i], true);
    }
    return new Uint8Array(buffer);
  },
  buildSpatialHash: function (state, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var cellSize = Math.max(1, Number(settings.cutoff) || this.defaults.cutoff);
    var columns = Math.max(1, Math.ceil(state.boxSize / cellSize));
    var rows = columns;
    var head = new Int32Array(columns * rows);
    var next = new Int32Array(state.count);
    head.fill(-1);
    next.fill(-1);
    for (var i = 0; i < state.count; i += 1) {
      var cx = Math.max(0, Math.min(columns - 1, Math.floor(state.x[i] / cellSize)));
      var cy = Math.max(0, Math.min(rows - 1, Math.floor(state.y[i] / cellSize)));
      var cell = cy * columns + cx;
      next[i] = head[cell];
      head[cell] = i;
    }
    return { cellSize: cellSize, columns: columns, rows: rows, head: head, next: next };
  },
  countSpecies: function (state, id, config) {
    var index = this.speciesIndex(id, config);
    var count = 0;
    for (var i = 0; i < state.count; i += 1) {
      if (state.species[i] === index) { count += 1; }
    }
    return count;
  },
  kineticEnergy: function (state, config) {
    var total = 0;
    for (var i = 0; i < state.count; i += 1) {
      var species = this.getSpecies(state.species[i], config);
      total += 0.5 * (Number(species.mass) || 1) * (state.vx[i] * state.vx[i] + state.vy[i] * state.vy[i]);
    }
    return total;
  },
  potentialEnergy: function (state, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var cutoff = Math.max(1, Number(settings.cutoff) || this.defaults.cutoff);
    var cutoffSq = cutoff * cutoff;
    var total = 0;
    for (var i = 0; i < state.count; i += 1) {
      for (var j = i + 1; j < state.count; j += 1) {
        var dx = this.periodicDelta(state.x[i], state.x[j], state.boxSize);
        var dy = this.periodicDelta(state.y[i], state.y[j], state.boxSize);
        var r2 = Math.max(0.36, dx * dx + dy * dy);
        if (r2 > cutoffSq) { continue; }
        var params = this.pairParams(this.getSpecies(state.species[i], settings), this.getSpecies(state.species[j], settings));
        var sr2 = (params.sigma * params.sigma) / r2;
        var sr6 = sr2 * sr2 * sr2;
        total += 4 * params.epsilon * (sr6 * sr6 - sr6);
      }
    }
    return total;
  },
  totalEnergy: function (state, config) {
    return this.kineticEnergy(state, config) + this.potentialEnergy(state, config);
  },
  makeTwoBodyEnergyState: function (config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var state = this.makeState(2, { config: settings, boxSize: 128, temperatureC: 0, salinityPsu: 0, seed: 3 });
    var h2o = this.speciesIndex("h2o", settings);
    state.species[0] = h2o;
    state.species[1] = h2o;
    state.x[0] = 58; state.y[0] = 64; state.x[1] = 70; state.y[1] = 64;
    state.vx[0] = 0; state.vy[0] = 0.03; state.vx[1] = 0; state.vy[1] = -0.03;
    this.computeForces(state, settings);
    return state;
  },
  distance: function (state, i, j) {
    var dx = this.periodicDelta(state.x[i], state.x[j], state.boxSize);
    var dy = this.periodicDelta(state.y[i], state.y[j], state.boxSize);
    return Math.sqrt(dx * dx + dy * dy);
  },
  measureWaterClustering: function (state, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var water = this.speciesIndex("h2o", settings);
    var waterSpec = this.getSpecies(water, settings);
    var neighborShell = Math.max(4, Number(waterSpec.sigma) * 3 || 9);
    var clustered = 0;
    var total = 0;
    for (var i = 0; i < state.count; i += 1) {
      if (state.species[i] !== water) { continue; }
      total += 1;
      for (var j = 0; j < state.count; j += 1) {
        if (i !== j && state.species[j] === water && this.distance(state, i, j) <= neighborShell) {
          clustered += 1;
          break;
        }
      }
    }
    return total ? clustered / total : 0;
  },
  measureLatticeOrder: function (state, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var water = this.speciesIndex("h2o", settings);
    var spacing = Math.max(1, Number(settings.lattice_spacing) || this.defaults.lattice_spacing);
    var total = 0;
    var score = 0;
    for (var i = 0; i < state.count; i += 1) {
      if (state.species[i] !== water) { continue; }
      var gx = Math.round(state.x[i] / spacing) * spacing;
      var gy = Math.round(state.y[i] / spacing) * spacing;
      var d = Math.sqrt(Math.pow(state.x[i] - gx, 2) + Math.pow(state.y[i] - gy, 2));
      score += Math.max(0, 1 - d / (spacing * 0.5));
      total += 1;
    }
    return total ? score / total : 0;
  },
  snapWaterToLattice: function (state, config, strength) {
    var settings = this.normalizeConfig(config || this.config || {});
    var water = this.speciesIndex("h2o", settings);
    var spacing = Math.max(1, Number(settings.lattice_spacing) || this.defaults.lattice_spacing);
    var amount = Math.max(0, Math.min(1, Number(strength) || 0));
    for (var i = 0; i < state.count; i += 1) {
      if (state.species[i] !== water) { continue; }
      var gx = Math.round(state.x[i] / spacing) * spacing;
      var gy = Math.round(state.y[i] / spacing) * spacing;
      state.x[i] = state.x[i] + (gx - state.x[i]) * amount;
      state.y[i] = state.y[i] + (gy - state.y[i]) * amount;
      state.vx[i] *= 1 - amount * 0.5;
      state.vy[i] *= 1 - amount * 0.5;
    }
  },
  makeParticlePixelSprites: function (state, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var pixelSize = Math.max(1, Math.round(Number(settings.pixel_size) || this.defaults.pixel_size));
    var sprites = [];
    for (var i = 0; i < state.count; i += 1) {
      var species = this.getSpecies(state.species[i], settings);
      sprites.push({
        x: Math.round(state.x[i]),
        y: Math.round(state.y[i]),
        width: pixelSize,
        height: pixelSize,
        color: species.color,
        species: species.id
      });
    }
    return { width: state.boxSize, height: state.boxSize, pixelSize: pixelSize, sprites: sprites };
  },
  getPerformanceContract: function (count, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var particles = Math.max(1, Math.round(Number(count) || 1000));
    return {
      particles: particles,
      boxSize: Number(settings.box_size) || this.defaults.box_size,
      targetFps: particles <= 1000 ? 30 : 60,
      targetFrameMs: particles <= 1000 ? Number(settings.target_tick_ms_1000) : Number(settings.target_tick_ms_2000),
      workgroupSize: this.workgroupSize,
      workgroups: Math.ceil(particles / this.workgroupSize),
      usesSpatialHash: true,
      gridCellSize: Number(settings.cutoff) || this.defaults.cutoff,
      integrator: "velocity-verlet",
      force: "lennard-jones"
    };
  },
  makeParamsData: function (count, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var buffer = new ArrayBuffer(32);
    var view = new DataView(buffer);
    view.setUint32(0, Math.max(1, Math.round(Number(count) || 1)), true);
    view.setFloat32(4, Number(settings.box_size) || this.defaults.box_size, true);
    view.setFloat32(8, Number(settings.dt) || this.defaults.dt, true);
    view.setFloat32(12, Number(settings.cutoff) || this.defaults.cutoff, true);
    view.setFloat32(16, Number(settings.hydration_strength) || this.defaults.hydration_strength, true);
    view.setFloat32(20, Number(settings.cooling_lattice_strength) || this.defaults.cooling_lattice_strength, true);
    view.setUint32(24, this.workgroupSize, true);
    view.setUint32(28, settings.species.length, true);
    return new Uint8Array(buffer);
  },
  init: function (options) {
    var spec = options || {};
    var harness = computeHarness;
    var device = spec.device || (PS.gpu && PS.gpu.device);
    var config = this.normalizeConfig(spec.config || this.config || {});
    var state = spec.state || this.createStateFromMacroCell(spec.macro || {}, { config: config, count: spec.count || 1000, seed: spec.seed });
    var shaderModule;
    var self = this;
    if (!harness) { throw new Error("Compute harness is required for molecular dynamics"); }
    if (!device || typeof device.createBuffer !== "function") { throw new Error("GPUDevice is required for molecular dynamics"); }
    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.getShaderModule !== "function") {
      throw new Error("WGSL shader manager is required for molecular dynamics");
    }
    if (spec.shaderSource) {
      PS.render.wgslShaders.register(this.shaderName, spec.shaderSource, { path: this.shaderPath });
    }
    this.registerManifest();
    shaderModule = PS.render.wgslShaders.getShaderModule(device, this.shaderName);
    this.state = state;
    harness.registerState(this.stateId, {
      width: state.count,
      height: 1,
      bytesPerCell: 32,
      format: "particle-struct",
      initialData: this.packParticleData(state),
      usage: ["storage", "copySrc", "copyDst"],
      device: device,
      meta: { unit: "molecule-particle", source: "macro-cell-zoom" }
    });
    harness.createBuffer("molecular-dynamics.params", 32, ["uniform", "copyDst"], this.makeParamsData(state.count, config), device);
    harness.registerPass(this.passId, {
      pipelineDescriptor: { label: "molecular-dynamics.pipeline", layout: "auto", compute: { module: shaderModule, entryPoint: "main" } },
      bindGroups: [],
      workgroups: function () {
        return [Math.ceil(state.count / self.workgroupSize), 1, 1];
      },
      beforeDispatch: function (pass, owner) {
        var pipeline = pass.pipeline || owner.getPassPipeline(pass, device);
        var descriptor = {
          label: "molecular-dynamics.bind-group",
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: owner.getReadBuffer(self.stateId).buffer } },
            { binding: 1, resource: { buffer: owner.getWriteBuffer(self.stateId).buffer } },
            { binding: 2, resource: { buffer: owner.buffers["molecular-dynamics.params"].buffer } }
          ]
        };
        pass.bindGroups = [owner.createCachedBindGroup(pass, device, 0, descriptor)];
      },
      afterDispatch: function (pass, owner) {
        owner.swap(self.stateId);
      }
    });
    return this.state;
  }
};
