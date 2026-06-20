import { PS } from "../core/namespace.js";
import { world } from "../systems/state.js";
import { computeHarness } from "./compute-harness.js";

PS.sim = PS.sim || {};

export const lenia = {
  shaderName: "lenia",
  shaderPath: "shaders/lenia.wgsl",
  configPath: "sim/configs/lenia.json",
  passId: "lenia",
  stateId: "lenia.species",
  workgroupSize: [8, 8, 1],
  speciesChannels: {
    microbes: 0,
    vegetation: 1,
    coral: 2,
    lichen: 3
  },
  defaults: {
    width: 512,
    height: 512,
    target_tick_ms: 5,
    radius: 4,
    dt: 0.12,
    carrying_capacity: 1,
    min_pattern_variance: 0.0002,
    coral_ph_threshold: 7.8,
    coral_acid_kill_rate: 0.05,
    co2_photosynthesis_base_ppm: 420,
    species: [
      { id: "microbes", channel: 0, mu: 0.30, sigma: 0.10, beta: 1.0, habitat: "ocean_coast", min_temp: -5, max_temp: 45, moisture_min: 0.10 },
      { id: "vegetation", channel: 1, mu: 0.50, sigma: 0.15, beta: 1.0, habitat: "warm_wet_land", min_temp: 2, max_temp: 38, moisture_min: 0.35 },
      { id: "coral", channel: 2, mu: 0.70, sigma: 0.08, beta: 1.0, habitat: "warm_shallow_ocean", min_temp: 18, max_temp: 32, moisture_min: 0.60 },
      { id: "lichen", channel: 3, mu: 0.20, sigma: 0.05, beta: 1.0, habitat: "cold_sparse_land", min_temp: -18, max_temp: 12, moisture_min: 0.05 }
    ]
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
      return Promise.reject(new Error("WGSL shader manager is required for Lenia"));
    }

    return Promise.all([
      configPromise,
      PS.render.wgslShaders.loadFromFile(this.shaderName, this.shaderPath, assetLoader)
    ]).then(function (results) {
      self.config = self.normalizeConfig(results[0]);
      return { config: self.config, shader: results[1] };
    });
  },

  getDimensions: function (options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    return {
      width: Math.max(1, Math.round(Number(spec.width || config.width || this.defaults.width))),
      height: Math.max(1, Math.round(Number(spec.height || config.height || this.defaults.height)))
    };
  },

  getCellCount: function (width, height) {
    return Math.max(1, Math.round(Number(width) || 1)) * Math.max(1, Math.round(Number(height) || 1));
  },

  hash: function (x, y, salt) {
    var h = 2166136261;
    h ^= Math.round(Number(x) || 0) & 65535;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= Math.round(Number(y) || 0) & 65535;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= Math.round(Number(salt) || 0) & 65535;
    h = Math.imul(h, 16777619) >>> 0;
    return h >>> 0;
  },

  random01: function (x, y, salt) {
    return this.hash(x, y, salt) / 4294967295;
  },

  makeInitialSpeciesField: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var seed = Math.round(Number(spec.seed) || 17);
    var values = new Float32Array(w * h * 4);

    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        var index = (y * w + x) * 4;
        var nx = x / Math.max(1, w - 1);
        var ny = y / Math.max(1, h - 1);
        var center = Math.max(0, 1 - Math.sqrt((nx - 0.5) * (nx - 0.5) + (ny - 0.5) * (ny - 0.5)) * 2.2);
        values[index] = Math.max(0, Math.min(1, 0.08 + this.random01(x, y, seed) * 0.08 + center * 0.20));
        values[index + 1] = Math.max(0, Math.min(1, 0.04 + this.random01(x, y, seed + 31) * 0.05 + center * 0.16));
        values[index + 2] = Math.max(0, Math.min(1, 0.02 + this.random01(x, y, seed + 73) * 0.04 + (ny > 0.55 ? center * 0.14 : 0)));
        values[index + 3] = Math.max(0, Math.min(1, 0.03 + this.random01(x, y, seed + 111) * 0.05 + (ny < 0.25 || ny > 0.75 ? 0.18 : 0)));
      }
    }

    return values;
  },

  makeScalarField: function (width, height, value) {
    var values = new Float32Array(this.getCellCount(width, height));
    values.fill(Number(value) || 0);
    return values;
  },

  makeTemperatureField: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var values = new Float32Array(w * h);
    for (var y = 0; y < h; y += 1) {
      var latitude = Math.abs((y / Math.max(1, h - 1)) * 180 - 90);
      var temp = spec.value !== undefined ? Number(spec.value) : 30 - latitude * 0.45;
      for (var x = 0; x < w; x += 1) {
        values[y * w + x] = temp;
      }
    }
    return values;
  },

  makeMoistureField: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var values = new Float32Array(w * h);
    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        var wetBias = y > h * 0.52 ? 0.88 : (x > w * 0.45 ? 0.62 : 0.18);
        values[y * w + x] = spec.value !== undefined ? Number(spec.value) : wetBias;
      }
    }
    return values;
  },

  makeOceanMask: function (width, height, oceanRatio) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var ratio = Math.max(0, Math.min(1, Number(oceanRatio) || 0.45));
    var values = new Float32Array(w * h);
    var oceanStart = Math.max(0, h - Math.round(h * ratio));
    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        values[y * w + x] = y >= oceanStart ? 1 : 0;
      }
    }
    return values;
  },

  makeOceanPhField: function (width, height, options) {
    var spec = options || {};
    return this.makeScalarField(width, height, spec.value === undefined ? 8.1 : Number(spec.value));
  },

  getSpeciesConfig: function (speciesId, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var id = String(speciesId || "");
    var list = settings.species;
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i].id) === id || Number(list[i].channel) === Number(speciesId)) {
        return list[i];
      }
    }
    return list[0];
  },

  kernelWeight: function (distance, radius, species) {
    var safeRadius = Math.max(1, Number(radius) || this.defaults.radius);
    var r = Math.max(0, Math.min(1, Number(distance) / safeRadius));
    var beta = Number(species && species.beta) || 1;
    return Math.exp(-Math.pow(r - 0.5, 2) / 0.08) * beta;
  },

  convolutionAt: function (field, width, height, x, y, channel, radius, species) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var r = Math.max(1, Math.round(Number(radius) || this.defaults.radius));
    var c = Math.max(0, Math.min(3, Math.round(Number(channel) || 0)));
    var sum = 0;
    var weightSum = 0;
    for (var dy = -r; dy <= r; dy += 1) {
      for (var dx = -r; dx <= r; dx += 1) {
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= r) {
          var px = (x + dx + w) % w;
          var py = Math.max(0, Math.min(h - 1, y + dy));
          var weight = this.kernelWeight(dist, r, species);
          sum += field[(py * w + px) * 4 + c] * weight;
          weightSum += weight;
        }
      }
    }
    return weightSum > 0 ? sum / weightSum : 0;
  },

  growth: function (neighborhood, species) {
    var mu = Number(species && species.mu);
    var sigma = Math.max(0.001, Number(species && species.sigma) || 0.1);
    if (!Number.isFinite(mu)) { mu = 0.3; }
    return 2 * Math.exp(-Math.pow(Number(neighborhood) - mu, 2) / (2 * sigma * sigma)) - 1;
  },

  habitatSuitability: function (species, cell, fields, options) {
    var spec = options || {};
    var temp = Number(fields.temperature && fields.temperature[cell]);
    var moisture = Math.max(0, Math.min(1, Number(fields.moisture && fields.moisture[cell]) || 0));
    var ocean = Math.max(0, Math.min(1, Number(fields.oceanMask && fields.oceanMask[cell]) || 0));
    var ph = Number(fields.oceanPh && fields.oceanPh[cell]);
    var volcanic = Math.max(0, Math.min(1, Number(fields.volcanic && fields.volcanic[cell]) || 0));
    var co2 = Math.max(0, Number(spec.co2Ppm) || Number(this.defaults.co2_photosynthesis_base_ppm));
    var minTemp = Number(species.min_temp);
    var maxTemp = Number(species.max_temp);
    var rangeSuitability = temp >= minTemp && temp <= maxTemp ? 1 : 0;
    var moistureGate = moisture >= Number(species.moisture_min || 0) ? 1 : Math.max(0, moisture / Math.max(0.01, Number(species.moisture_min || 0.01)));
    var habitat = String(species.habitat || "");

    if (!Number.isFinite(temp)) { temp = 18; }
    if (!Number.isFinite(ph)) { ph = 8.1; }
    if (habitat === "warm_wet_land") {
      return rangeSuitability * moistureGate * (1 - ocean) * Math.max(0.2, Math.min(1.35, co2 / Number(this.defaults.co2_photosynthesis_base_ppm))) * (1 - volcanic);
    }
    if (habitat === "warm_shallow_ocean") {
      var phGate = ph < Number(this.normalizeConfig(spec.config).coral_ph_threshold) ? Math.max(0, (ph - 7.0) / 0.8) : 1;
      return rangeSuitability * ocean * phGate * (1 - volcanic);
    }
    if (habitat === "cold_sparse_land") {
      return rangeSuitability * (1 - ocean) * Math.max(0.15, moistureGate) * (1 - volcanic);
    }
    return rangeSuitability * Math.max(ocean * 0.85, moistureGate * 0.75) * (1 - volcanic);
  },

  stepCpu: function (field, width, height, options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var cells = w * h;
    var radius = Math.max(1, Math.round(Number(spec.radius || config.radius) || this.defaults.radius));
    var dt = Number(spec.dt || config.dt || this.defaults.dt);
    var next = new Float32Array(cells * 4);
    var fields = {
      temperature: spec.temperature || this.makeTemperatureField(w, h),
      moisture: spec.moisture || this.makeMoistureField(w, h),
      oceanMask: spec.oceanMask || this.makeOceanMask(w, h),
      oceanPh: spec.oceanPh || this.makeOceanPhField(w, h),
      volcanic: spec.volcanic || this.makeScalarField(w, h, 0)
    };
    var speciesList = config.species;
    var carryingCapacity = Math.max(0.01, Number(config.carrying_capacity) || 1);
    var acidThreshold = Number(config.coral_ph_threshold) || this.defaults.coral_ph_threshold;
    var acidKill = Number(config.coral_acid_kill_rate) || this.defaults.coral_acid_kill_rate;

    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        var cell = y * w + x;
        var offset = cell * 4;
        var total = 0;
        for (var s = 0; s < speciesList.length && s < 4; s += 1) {
          var species = speciesList[s];
          var channel = Math.max(0, Math.min(3, Number(species.channel) || s));
          var value = Math.max(0, Math.min(1, Number(field[offset + channel]) || 0));
          var neighborhood = this.convolutionAt(field, w, h, x, y, channel, radius, species);
          var habitat = this.habitatSuitability(species, cell, fields, { config: config, co2Ppm: spec.co2Ppm });
          var grown = value + dt * this.growth(neighborhood, species) * habitat * 0.22;
          grown += dt * habitat * (0.30 + value * (1 - value) * 0.20);
          grown -= dt * (1 - habitat) * 0.45 * Math.max(0.05, value);
          if (String(species.id) === "coral" && fields.oceanPh[cell] < acidThreshold) {
            grown -= dt * acidKill * (acidThreshold - fields.oceanPh[cell]) * 50 * Math.max(0.1, value);
          }
          if (fields.volcanic[cell] > 0.25) {
            grown *= Math.max(0, 1 - fields.volcanic[cell]);
          }
          next[offset + channel] = Math.max(0, Math.min(1, grown));
          total += next[offset + channel];
        }
        if (total > carryingCapacity) {
          for (var c = 0; c < 4; c += 1) {
            next[offset + c] = next[offset + c] / total * carryingCapacity;
          }
        }
      }
    }

    return next;
  },

  runValidationTicks: function (ticks, width, height, options) {
    var spec = options || {};
    var field = spec.initial || this.makeInitialSpeciesField(width, height, spec);
    var count = Math.max(0, Math.round(Number(ticks) || 0));
    for (var i = 0; i < count; i += 1) {
      field = this.stepCpu(field, width, height, spec);
    }
    return field;
  },

  summarizeSpecies: function (field, width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var cells = this.getCellCount(width, height);
    var list = settings.species;
    var summary = { species: {}, totalDensity: 0, dominantSpecies: "none", patternVariance: 0 };
    var dominantDensity = -1;
    var total = 0;
    var totalSq = 0;

    for (var s = 0; s < list.length && s < 4; s += 1) {
      var species = list[s];
      var channel = Math.max(0, Math.min(3, Number(species.channel) || s));
      var sum = 0;
      for (var i = 0; i < cells; i += 1) {
        var value = Math.max(0, Math.min(1, Number(field[i * 4 + channel]) || 0));
        sum += value;
      }
      var density = sum / Math.max(1, cells);
      summary.species[species.id] = density;
      if (density > dominantDensity) {
        dominantDensity = density;
        summary.dominantSpecies = species.id;
      }
    }

    for (var cell = 0; cell < cells; cell += 1) {
      var densitySum = 0;
      for (var c = 0; c < 4; c += 1) {
        densitySum += Math.max(0, Math.min(1, Number(field[cell * 4 + c]) || 0));
      }
      total += densitySum;
      totalSq += densitySum * densitySum;
    }
    summary.totalDensity = total / Math.max(1, cells);
    summary.patternVariance = totalSq / Math.max(1, cells) - summary.totalDensity * summary.totalDensity;
    summary.emergent = summary.patternVariance >= Number(settings.min_pattern_variance);
    return summary;
  },

  exportDistributionMap: function (field, width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var cells = [];
    var list = settings.species;
    for (var i = 0; i < w * h; i += 1) {
      var entry = { index: i };
      for (var s = 0; s < list.length && s < 4; s += 1) {
        var species = list[s];
        var channel = Math.max(0, Math.min(3, Number(species.channel) || s));
        entry[species.id] = Number((Math.max(0, Math.min(1, field[i * 4 + channel]))).toFixed(5));
      }
      cells.push(entry);
    }
    return {
      width: w,
      height: h,
      species: list.map(function (species) { return species.id; }),
      summary: this.summarizeSpecies(field, w, h, settings),
      cells: cells
    };
  },

  getCellDensity: function (tileX, tileY, speciesId) {
    var state = this.state;
    if (!state || !state.field) { return 0; }
    var x = ((Math.round(Number(tileX) || 0) % state.width) + state.width) % state.width;
    var y = Math.max(0, Math.min(state.height - 1, Math.round(Number(tileY) || 0)));
    var species = this.getSpeciesConfig(speciesId || "vegetation", state.config);
    var channel = Math.max(0, Math.min(3, Number(species.channel) || 0));
    return Math.max(0, Math.min(1, Number(state.field[(y * state.width + x) * 4 + channel]) || 0));
  },

  makeDensityOverlayRgba: function (field, width, height, config) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var data = new Uint8Array(w * h * 4);
    var summary = this.summarizeSpecies(field, w, h, config);
    for (var i = 0; i < w * h; i += 1) {
      var microbes = Math.max(0, Math.min(1, Number(field[i * 4]) || 0));
      var vegetation = Math.max(0, Math.min(1, Number(field[i * 4 + 1]) || 0));
      var coral = Math.max(0, Math.min(1, Number(field[i * 4 + 2]) || 0));
      var lichen = Math.max(0, Math.min(1, Number(field[i * 4 + 3]) || 0));
      var density = Math.max(microbes, vegetation, coral, lichen);
      data[i * 4] = Math.round(72 + coral * 160 + lichen * 70);
      data[i * 4 + 1] = Math.round(104 + vegetation * 145 + microbes * 80);
      data[i * 4 + 2] = Math.round(104 + microbes * 120 + coral * 80);
      data[i * 4 + 3] = Math.round(density * 230);
    }
    return { width: w, height: h, data: data, mimeType: "image/png", description: "Lenia organism density texture overlay for biome tiles.", summary: summary };
  },

  getPerformanceContract: function (width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var w = Math.max(1, Math.round(Number(width || settings.width) || this.defaults.width));
    var h = Math.max(1, Math.round(Number(height || settings.height) || this.defaults.height));
    return {
      width: w,
      height: h,
      targetTickMs: Number(settings.target_tick_ms) || this.defaults.target_tick_ms,
      workgroupSize: this.workgroupSize.slice(),
      expectedWorkgroups: [Math.ceil(w / this.workgroupSize[0]), Math.ceil(h / this.workgroupSize[1]), 1],
      cells: w * h,
      speciesCount: Math.min(4, settings.species.length),
      textureFormat: "rgba32float"
    };
  },

  makeParamsData: function (width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var buffer = new ArrayBuffer(64);
    var view = new DataView(buffer);
    view.setUint32(0, Math.max(1, Math.round(Number(width) || 1)), true);
    view.setUint32(4, Math.max(1, Math.round(Number(height) || 1)), true);
    view.setFloat32(8, Number(settings.radius) || this.defaults.radius, true);
    view.setFloat32(12, Number(settings.dt) || this.defaults.dt, true);
    view.setFloat32(16, Number(settings.carrying_capacity) || 1, true);
    view.setFloat32(20, Number(settings.coral_ph_threshold) || this.defaults.coral_ph_threshold, true);
    view.setFloat32(24, Number(settings.coral_acid_kill_rate) || this.defaults.coral_acid_kill_rate, true);
    view.setUint32(28, Math.min(4, settings.species.length), true);
    for (var i = 0; i < settings.species.length && i < 4; i += 1) {
      view.setFloat32(32 + i * 4, Number(settings.species[i].mu) || 0.3, true);
      view.setFloat32(48 + i * 4, Number(settings.species[i].sigma) || 0.1, true);
    }
    return new Uint8Array(buffer);
  },

  init: function (options) {
    var spec = options || {};
    var harness = computeHarness;
    var device = spec.device || (PS.gpu && PS.gpu.device);
    var dims = this.getDimensions(spec);
    var config = this.normalizeConfig(spec.config || this.config || {});
    var cells = this.getCellCount(dims.width, dims.height);
    var speciesBytes = cells * 4 * 4;
    var scalarBytes = cells * 4;
    var shaderModule;
    var self = this;

    if (!harness) { throw new Error("Compute harness is required for Lenia"); }
    if (!device || typeof device.createBuffer !== "function") { throw new Error("GPUDevice is required for Lenia"); }
    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.getShaderModule !== "function") {
      throw new Error("WGSL shader manager is required for Lenia");
    }
    if (spec.shaderSource) {
      PS.render.wgslShaders.register(this.shaderName, spec.shaderSource, { path: this.shaderPath });
    }
    this.registerManifest();
    shaderModule = PS.render.wgslShaders.getShaderModule(device, this.shaderName);

    this.state = {
      width: dims.width,
      height: dims.height,
      config: config,
      field: spec.initialSpecies || this.makeInitialSpeciesField(dims.width, dims.height, spec)
    };
    this.state.summary = this.summarizeSpecies(this.state.field, dims.width, dims.height, config);

    harness.registerState(this.stateId, {
      width: dims.width,
      height: dims.height,
      bytesPerCell: 16,
      format: "rgba32float",
      initialData: this.state.field,
      usage: ["storage", "copySrc", "copyDst"],
      device: device,
      meta: { unit: "species-density", source: "lenia" }
    });
    harness.createBuffer("lenia.temperature", scalarBytes, ["storage", "copyDst"], spec.temperature || this.makeTemperatureField(dims.width, dims.height), device);
    harness.createBuffer("lenia.moisture", scalarBytes, ["storage", "copyDst"], spec.moisture || this.makeMoistureField(dims.width, dims.height), device);
    harness.createBuffer("lenia.oceanMask", scalarBytes, ["storage", "copyDst"], spec.oceanMask || this.makeOceanMask(dims.width, dims.height), device);
    harness.createBuffer("lenia.oceanPh", scalarBytes, ["storage", "copyDst"], spec.oceanPh || this.makeOceanPhField(dims.width, dims.height), device);
    harness.createBuffer("lenia.volcanic", scalarBytes, ["storage", "copyDst"], spec.volcanic || this.makeScalarField(dims.width, dims.height, 0), device);
    harness.createBuffer("lenia.params", 64, ["uniform", "copyDst"], this.makeParamsData(dims.width, dims.height, config), device);

    harness.registerPass(this.passId, {
      pipelineDescriptor: { label: "lenia.pipeline", layout: "auto", compute: { module: shaderModule, entryPoint: "main" } },
      bindGroups: [],
      workgroups: function () {
        return [Math.ceil(dims.width / self.workgroupSize[0]), Math.ceil(dims.height / self.workgroupSize[1]), 1];
      },
      beforeDispatch: function (pass, owner) {
        var pipeline = pass.pipeline || owner.getPassPipeline(pass, device);
        var descriptor = {
          label: "lenia.bind-group",
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: owner.getReadBuffer(self.stateId).buffer } },
            { binding: 1, resource: { buffer: owner.getWriteBuffer(self.stateId).buffer } },
            { binding: 2, resource: { buffer: owner.buffers["lenia.temperature"].buffer } },
            { binding: 3, resource: { buffer: owner.buffers["lenia.moisture"].buffer } },
            { binding: 4, resource: { buffer: owner.buffers["lenia.oceanMask"].buffer } },
            { binding: 5, resource: { buffer: owner.buffers["lenia.oceanPh"].buffer } },
            { binding: 6, resource: { buffer: owner.buffers["lenia.volcanic"].buffer } },
            { binding: 7, resource: { buffer: owner.buffers["lenia.params"].buffer } }
          ]
        };
        pass.bindGroups = [owner.createCachedBindGroup(pass, device, 0, descriptor)];
      },
      afterDispatch: function () {
        harness.swap(self.stateId);
      }
    });

    if (typeof world !== "undefined") {
      world.lenia = this.state.summary;
    }
    return { width: dims.width, height: dims.height, speciesBytes: speciesBytes, scalarBytes: scalarBytes, config: config, state: this.state };
  },

  dispatch: function (commandEncoder, device) {
    if (!computeHarness) {
      throw new Error("Compute harness is required for Lenia dispatch");
    }
    return computeHarness.dispatch(this.passId, commandEncoder, device);
  }
};
