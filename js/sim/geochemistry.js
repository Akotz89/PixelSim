import { PS } from "../core/namespace.js";
import { world } from "../systems/state.js";

PS.sim = PS.sim || {};

export const geochemistry = {
  shaderName: "geochemistry",
  shaderPath: "shaders/geochemistry.wgsl",
  configPath: "sim/configs/geochemistry.json",
  passId: "geochemistry",
  stateId: "geochemistry.atmosphere",
  workgroupSize: [8, 8, 1],
  channels: {
    co2: 0,
    o2: 1,
    ch4: 2,
    h2o: 3,
    so2: 4,
    n2: 5
  },
  oceanChannels: {
    ph: 0,
    co2: 1,
    o2: 2,
    alkalinity: 3,
    ca: 4,
    mg: 5
  },
  soilChannels: {
    organicCarbon: 0,
    mineralN: 1,
    mineralP: 2,
    ph: 3,
    weatheringRate: 4,
    fossilCarbon: 5
  },
  defaults: {
    width: 512,
    height: 512,
    target_tick_ms: 5,
    atmosphere_stride: 8,
    ocean_stride: 8,
    soil_stride: 8,
    photosynthesis_rate_ppm: 0.42,
    respiration_rate_ppm: 0.08,
    silicate_weathering_base_ppm: 0.035,
    silicate_weathering_temp_coeff: 0.055,
    silicate_weathering_moisture_coeff: 0.8,
    volcanic_co2_ppm: 7.5,
    volcanic_so2_ppm: 1.2,
    methane_oxidation_rate: 0.00000001,
    air_sea_exchange_rate: 0.018,
    ocean_ph_base: 8.1,
    ocean_ph_co2_coeff: 0.3,
    epoch_presets: {
      hadean: { co2_ppm: 100000, o2_ppm: 0, ch4_ppm: 1800, h2o_ppm: 24000, so2_ppm: 90, n2_ppm: 874110 },
      archean: { co2_ppm: 10000, o2_ppm: 1000, ch4_ppm: 800, h2o_ppm: 12000, so2_ppm: 18, n2_ppm: 976182 },
      proterozoic: { co2_ppm: 1000, o2_ppm: 20000, ch4_ppm: 80, h2o_ppm: 8000, so2_ppm: 5, n2_ppm: 970915 },
      phanerozoic: { co2_ppm: 1200, o2_ppm: 210000, ch4_ppm: 2, h2o_ppm: 7000, so2_ppm: 1, n2_ppm: 781797 },
      civilization: { co2_ppm: 420, o2_ppm: 209500, ch4_ppm: 2, h2o_ppm: 9000, so2_ppm: 1, n2_ppm: 781077 }
    }
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
    merged.epoch_presets = source.epoch_presets || this.defaults.epoch_presets;
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
      return Promise.reject(new Error("WGSL shader manager is required for geochemistry"));
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

  getEpochPreset: function (epoch, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var id = String(epoch || "civilization").toLowerCase();
    return settings.epoch_presets[id] || settings.epoch_presets.civilization;
  },

  makeAtmosphereField: function (width, height, options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var preset = this.getEpochPreset(spec.epoch || spec.era || "civilization", config);
    var stride = Math.max(6, Math.round(Number(config.atmosphere_stride) || 8));
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells * stride);

    for (var i = 0; i < cells; i += 1) {
      var offset = i * stride;
      values[offset + this.channels.co2] = Number(preset.co2_ppm) || 0;
      values[offset + this.channels.o2] = Number(preset.o2_ppm) || 0;
      values[offset + this.channels.ch4] = Number(preset.ch4_ppm) || 0;
      values[offset + this.channels.h2o] = Number(preset.h2o_ppm) || 0;
      values[offset + this.channels.so2] = Number(preset.so2_ppm) || 0;
      values[offset + this.channels.n2] = Number(preset.n2_ppm) || 0;
    }

    return values;
  },

  makeOceanChemistryField: function (width, height, options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var co2 = Math.max(0, Number(spec.co2Ppm) || 280);
    var o2 = Math.max(0, Number(spec.o2Ppm) || 210000);
    var stride = Math.max(6, Math.round(Number(config.ocean_stride) || 8));
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells * stride);
    var ph = this.computeOceanPh(co2, config);

    for (var i = 0; i < cells; i += 1) {
      var offset = i * stride;
      values[offset + this.oceanChannels.ph] = ph;
      values[offset + this.oceanChannels.co2] = co2;
      values[offset + this.oceanChannels.o2] = o2 * 0.00003;
      values[offset + this.oceanChannels.alkalinity] = 2.3;
      values[offset + this.oceanChannels.ca] = 10.3;
      values[offset + this.oceanChannels.mg] = 52.8;
    }

    return values;
  },

  makeSoilChemistryField: function (width, height, options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var stride = Math.max(6, Math.round(Number(config.soil_stride) || 8));
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells * stride);

    for (var i = 0; i < cells; i += 1) {
      var offset = i * stride;
      values[offset + this.soilChannels.organicCarbon] = Math.max(0, Number(spec.organicCarbon) || 0.2);
      values[offset + this.soilChannels.mineralN] = Math.max(0, Number(spec.mineralN) || 0.35);
      values[offset + this.soilChannels.mineralP] = Math.max(0, Number(spec.mineralP) || 0.25);
      values[offset + this.soilChannels.ph] = Number(spec.ph) || 6.6;
      values[offset + this.soilChannels.weatheringRate] = 0;
      values[offset + this.soilChannels.fossilCarbon] = 0;
    }

    return values;
  },

  makeScalarField: function (width, height, value) {
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells);
    values.fill(Number(value) || 0);
    return values;
  },

  makeLatitudeTemperature: function (width, height) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var values = new Float32Array(w * h);
    for (var y = 0; y < h; y += 1) {
      var latitude = Math.abs((y / Math.max(1, h - 1)) * 180 - 90);
      var temp = 30 - latitude * 0.45;
      for (var x = 0; x < w; x += 1) {
        values[y * w + x] = temp;
      }
    }
    return values;
  },

  makeOceanMask: function (width, height, oceanRatio) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var ratio = Math.max(0, Math.min(1, Number(oceanRatio) || 0.65));
    var values = new Float32Array(w * h);
    var oceanRows = Math.max(1, Math.round(h * ratio));
    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        values[y * w + x] = y >= h - oceanRows ? 1 : 0;
      }
    }
    return values;
  },

  makeVegetationField: function (width, height, value) {
    return this.makeScalarField(width, height, value === undefined ? 0.45 : value);
  },

  makeVolcanicEmissionField: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var values = new Float32Array(w * h);
    if (Number.isFinite(Number(spec.value))) {
      values.fill(Math.max(0, Number(spec.value)));
      return values;
    }
    values[Math.floor(h / 2) * w + Math.floor(w / 2)] = 1;
    return values;
  },

  computeOceanPh: function (co2Ppm, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var co2 = Math.max(0, Number(co2Ppm) || 0);
    var ph = Number(settings.ocean_ph_base) - Number(settings.ocean_ph_co2_coeff) * ((co2 / 280) - 1);
    return Math.max(5, Math.min(8.6, ph));
  },

  calculateWeatheringRate: function (temperatureC, moisture, landFraction, co2Ppm, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var tempTerm = Math.exp((Number(temperatureC) - 15) * Number(settings.silicate_weathering_temp_coeff));
    var moistureTerm = 0.2 + Math.max(0, Math.min(1, Number(moisture) || 0)) * Number(settings.silicate_weathering_moisture_coeff);
    var co2Term = Math.max(0.1, (Number(co2Ppm) || 0) / 280);
    return Math.max(0, Number(settings.silicate_weathering_base_ppm) * tempTerm * moistureTerm * Math.max(0, Number(landFraction) || 0) * co2Term);
  },

  applyAgentPatch: function (state, patch) {
    var target = state || this.state;
    var update = patch || {};
    if (!target || !target.atmosphere || !target.width || !target.height) {
      throw new Error("geochemistry state is required for agent patch");
    }
    if (Number.isFinite(Number(update.co2Ppm))) {
      this.setGasPpm(target.atmosphere, target.width, target.height, "co2", Number(update.co2Ppm), target.config);
    }
    if (Number.isFinite(Number(update.o2Ppm))) {
      this.setGasPpm(target.atmosphere, target.width, target.height, "o2", Number(update.o2Ppm), target.config);
    }
    if (Number.isFinite(Number(update.ch4Ppm))) {
      this.setGasPpm(target.atmosphere, target.width, target.height, "ch4", Number(update.ch4Ppm), target.config);
    }
    target.summary = this.summarizeState(target);
    return target.summary;
  },

  setGasPpm: function (field, width, height, gas, value, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var channel = this.channels[String(gas || "").toLowerCase()];
    var stride = Math.max(6, Math.round(Number(settings.atmosphere_stride) || 8));
    var cells = this.getCellCount(width, height);
    if (!Number.isFinite(channel)) {
      throw new Error("Unknown atmosphere gas: " + gas);
    }
    for (var i = 0; i < cells; i += 1) {
      field[i * stride + channel] = Math.max(0, Number(value) || 0);
    }
  },

  stepCpu: function (state, options) {
    var target = state || this.state;
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || target && target.config || this.config || {});
    var width = Math.max(1, Math.round(Number(target.width) || 1));
    var height = Math.max(1, Math.round(Number(target.height) || 1));
    var cells = this.getCellCount(width, height);
    var atmoStride = Math.max(6, Math.round(Number(config.atmosphere_stride) || 8));
    var oceanStride = Math.max(6, Math.round(Number(config.ocean_stride) || 8));
    var soilStride = Math.max(6, Math.round(Number(config.soil_stride) || 8));
    var next = new Float32Array(target.atmosphere.length);
    var dt = Math.max(0, Number(spec.dt) || 1);

    for (var i = 0; i < cells; i += 1) {
      var atmoOffset = i * atmoStride;
      var oceanOffset = i * oceanStride;
      var soilOffset = i * soilStride;
      var co2 = target.atmosphere[atmoOffset + this.channels.co2];
      var o2 = target.atmosphere[atmoOffset + this.channels.o2];
      var ch4 = target.atmosphere[atmoOffset + this.channels.ch4];
      var h2o = target.atmosphere[atmoOffset + this.channels.h2o];
      var so2 = target.atmosphere[atmoOffset + this.channels.so2];
      var n2 = target.atmosphere[atmoOffset + this.channels.n2];
      var temp = target.temperature[i];
      var veg = Math.max(0, Math.min(1, target.vegetation[i]));
      var isOcean = Math.max(0, Math.min(1, target.oceanMask[i]));
      var moisture = target.moisture ? Math.max(0, Math.min(1, target.moisture[i])) : isOcean;
      var volcanic = Math.max(0, target.volcanicEmission[i]);
      var tempSuitability = Math.max(0, Math.min(1, (temp + 5) / 35));
      var photosynthesis = veg * tempSuitability * Number(config.photosynthesis_rate_ppm) * dt;
      var respiration = veg * Number(config.respiration_rate_ppm) * dt;
      var weathering = this.calculateWeatheringRate(temp, moisture, 1 - isOcean, co2, config) * dt;
      var oxidation = Math.min(ch4, ch4 * Math.max(0, o2) * Number(config.methane_oxidation_rate) * dt);
      var exchange;

      co2 = Math.max(0, co2 - photosynthesis + respiration - weathering + oxidation + volcanic * Number(config.volcanic_co2_ppm) * dt);
      o2 = Math.max(0, o2 + photosynthesis - respiration - oxidation * 2);
      ch4 = Math.max(0, ch4 - oxidation);
      h2o = Math.max(0, h2o + respiration * 0.4 + oxidation * 0.3);
      so2 = Math.max(0, so2 * Math.max(0, 1 - 0.01 * dt) + volcanic * Number(config.volcanic_so2_ppm) * dt);

      exchange = isOcean * (co2 - target.ocean[oceanOffset + this.oceanChannels.co2]) * Number(config.air_sea_exchange_rate) * dt;
      target.ocean[oceanOffset + this.oceanChannels.co2] = Math.max(0, target.ocean[oceanOffset + this.oceanChannels.co2] + exchange);
      target.ocean[oceanOffset + this.oceanChannels.o2] = Math.max(0, target.ocean[oceanOffset + this.oceanChannels.o2] + isOcean * (o2 * 0.00003 - target.ocean[oceanOffset + this.oceanChannels.o2] * 0.001) * dt);
      target.ocean[oceanOffset + this.oceanChannels.ph] = this.computeOceanPh(target.ocean[oceanOffset + this.oceanChannels.co2], config);
      target.soil[soilOffset + this.soilChannels.weatheringRate] = weathering;

      next[atmoOffset + this.channels.co2] = co2;
      next[atmoOffset + this.channels.o2] = o2;
      next[atmoOffset + this.channels.ch4] = ch4;
      next[atmoOffset + this.channels.h2o] = h2o;
      next[atmoOffset + this.channels.so2] = so2;
      next[atmoOffset + this.channels.n2] = n2;
    }

    target.atmosphere = next;
    target.ticks = Math.max(0, Math.round(Number(target.ticks) || 0)) + 1;
    target.summary = this.summarizeState(target);
    this.applyWorldSummary(target.summary);
    return target;
  },

  createState: function (options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var dims = this.getDimensions({ width: spec.width, height: spec.height, config: config });
    var preset = this.getEpochPreset(spec.epoch || (typeof world !== "undefined" && world && world.era) || "civilization", config);
    var state = {
      width: dims.width,
      height: dims.height,
      config: config,
      atmosphere: spec.atmosphere || this.makeAtmosphereField(dims.width, dims.height, { config: config, epoch: spec.epoch }),
      ocean: spec.ocean || this.makeOceanChemistryField(dims.width, dims.height, { config: config, co2Ppm: preset.co2_ppm, o2Ppm: preset.o2_ppm }),
      soil: spec.soil || this.makeSoilChemistryField(dims.width, dims.height, { config: config }),
      temperature: spec.temperature || this.makeLatitudeTemperature(dims.width, dims.height),
      vegetation: spec.vegetation || this.makeVegetationField(dims.width, dims.height, spec.vegetationValue),
      oceanMask: spec.oceanMask || this.makeOceanMask(dims.width, dims.height, spec.oceanRatio),
      moisture: spec.moisture || this.makeScalarField(dims.width, dims.height, 0.6),
      volcanicEmission: spec.volcanicEmission || this.makeVolcanicEmissionField(dims.width, dims.height, { value: spec.volcanicValue }),
      ticks: 0
    };
    state.summary = this.summarizeState(state);
    return state;
  },

  summarizeState: function (state) {
    var target = state || this.state;
    var config = this.normalizeConfig(target && target.config || this.config || {});
    var cells = this.getCellCount(target.width, target.height);
    var atmoStride = Math.max(6, Math.round(Number(config.atmosphere_stride) || 8));
    var oceanStride = Math.max(6, Math.round(Number(config.ocean_stride) || 8));
    var soilStride = Math.max(6, Math.round(Number(config.soil_stride) || 8));
    var totals = { co2Ppm: 0, o2Ppm: 0, ch4Ppm: 0, h2oPpm: 0, so2Ppm: 0, n2Ppm: 0, oceanPh: 0, weatheringPpm: 0 };

    for (var i = 0; i < cells; i += 1) {
      var atmoOffset = i * atmoStride;
      var oceanOffset = i * oceanStride;
      var soilOffset = i * soilStride;
      totals.co2Ppm += target.atmosphere[atmoOffset + this.channels.co2];
      totals.o2Ppm += target.atmosphere[atmoOffset + this.channels.o2];
      totals.ch4Ppm += target.atmosphere[atmoOffset + this.channels.ch4];
      totals.h2oPpm += target.atmosphere[atmoOffset + this.channels.h2o];
      totals.so2Ppm += target.atmosphere[atmoOffset + this.channels.so2];
      totals.n2Ppm += target.atmosphere[atmoOffset + this.channels.n2];
      totals.oceanPh += target.ocean[oceanOffset + this.oceanChannels.ph];
      totals.weatheringPpm += target.soil[soilOffset + this.soilChannels.weatheringRate];
    }

    totals.co2Ppm /= cells;
    totals.o2Ppm /= cells;
    totals.ch4Ppm /= cells;
    totals.h2oPpm /= cells;
    totals.so2Ppm /= cells;
    totals.n2Ppm /= cells;
    totals.oceanPh /= cells;
    totals.weatheringPpm /= cells;
    totals.oxygenPercent = totals.o2Ppm / 10000;
    totals.debugOverlayRows = this.getDebugOverlayRows(totals);
    return totals;
  },

  getDebugOverlayRows: function (summary) {
    var data = summary || {};
    return [
      { label: "CO2", value: Math.round(Number(data.co2Ppm) || 0) + " ppm" },
      { label: "O2", value: (Number(data.oxygenPercent) || 0).toFixed(2) + "%" },
      { label: "CH4", value: Math.round(Number(data.ch4Ppm) || 0) + " ppm" },
      { label: "Ocean pH", value: (Number(data.oceanPh) || 0).toFixed(2) },
      { label: "Weathering", value: (Number(data.weatheringPpm) || 0).toFixed(3) + " ppm/tick" }
    ];
  },

  applyWorldSummary: function (summary) {
    if (typeof world === "undefined" || !world || !summary) {
      return summary;
    }
    world.geochemistry = summary;
    world.atmosphere = world.atmosphere || {};
    world.atmosphere.carbonDioxidePpm = summary.co2Ppm;
    world.atmosphere.oxygenPercent = summary.oxygenPercent;
    world.atmosphere.methanePpm = summary.ch4Ppm;
    world.atmosphere.sulfurDioxidePpm = summary.so2Ppm;
    world.atmosphere.oceanPh = summary.oceanPh;
    world.atmosphere.debugOverlayRows = summary.debugOverlayRows;
    return summary;
  },

  validateState: function (state) {
    var target = state || this.state;
    var fields = [target.atmosphere, target.ocean, target.soil];
    for (var f = 0; f < fields.length; f += 1) {
      for (var i = 0; i < fields[f].length; i += 1) {
        if (!Number.isFinite(fields[f][i]) || fields[f][i] < 0) {
          return { valid: false, index: i, field: f };
        }
      }
    }
    return { valid: true };
  },

  makeParamsData: function (width, height, config, dt) {
    var settings = this.normalizeConfig(config || this.config || {});
    var data = new ArrayBuffer(64);
    var view = new DataView(data);
    view.setUint32(0, Math.max(1, Math.round(Number(width) || 1)), true);
    view.setUint32(4, Math.max(1, Math.round(Number(height) || 1)), true);
    view.setUint32(8, Math.max(6, Math.round(Number(settings.atmosphere_stride) || 8)), true);
    view.setUint32(12, Math.max(6, Math.round(Number(settings.ocean_stride) || 8)), true);
    view.setFloat32(16, Number(dt) || 1, true);
    view.setFloat32(20, Number(settings.photosynthesis_rate_ppm), true);
    view.setFloat32(24, Number(settings.respiration_rate_ppm), true);
    view.setFloat32(28, Number(settings.silicate_weathering_base_ppm), true);
    view.setFloat32(32, Number(settings.silicate_weathering_temp_coeff), true);
    view.setFloat32(36, Number(settings.volcanic_co2_ppm), true);
    view.setFloat32(40, Number(settings.volcanic_so2_ppm), true);
    view.setFloat32(44, Number(settings.methane_oxidation_rate), true);
    view.setFloat32(48, Number(settings.air_sea_exchange_rate), true);
    view.setFloat32(52, Number(settings.ocean_ph_base), true);
    view.setFloat32(56, Number(settings.ocean_ph_co2_coeff), true);
    return new Uint8Array(data);
  },

  init: function (options) {
    var spec = options || {};
    var device = spec.device || (PS.gpu && PS.gpu.device);
    var harness = spec.harness || PS.sim.computeHarness;
    var config = this.normalizeConfig(spec.config || this.config || {});
    var state = spec.state || this.createState({ width: spec.width, height: spec.height, config: config, epoch: spec.epoch });
    var cells = this.getCellCount(state.width, state.height);
    var atmoBytes = state.atmosphere.byteLength;
    var oceanBytes = state.ocean.byteLength;
    var soilBytes = state.soil.byteLength;
    var scalarBytes = cells * 4;
    var shaderModule;
    var self = this;

    if (!device || typeof device.createBuffer !== "function") {
      throw new Error("GPUDevice is required for geochemistry");
    }
    if (!harness) {
      throw new Error("compute harness is required for geochemistry");
    }
    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.getShaderModule !== "function") {
      throw new Error("WGSL shader manager is required for geochemistry");
    }

    this.registerManifest();
    if (spec.shaderSource) {
      PS.render.wgslShaders.register(this.shaderName, spec.shaderSource, { path: this.shaderPath });
    }
    shaderModule = PS.render.wgslShaders.getShaderModule(device, this.shaderName);
    this.state = state;
    this.config = config;
    harness.registerState(this.stateId, {
      width: state.width,
      height: state.height,
      bytesPerCell: Math.max(6, Math.round(Number(config.atmosphere_stride) || 8)) * 4,
      format: "atmosphere-ppm-grid",
      initialData: state.atmosphere,
      usage: ["storage", "copySrc", "copyDst"],
      device: device,
      meta: { unit: "ppm", source: "geochemistry" }
    });
    harness.createBuffer("geochemistry.ocean", oceanBytes, ["storage", "copySrc", "copyDst"], state.ocean, device);
    harness.createBuffer("geochemistry.soil", soilBytes, ["storage", "copySrc", "copyDst"], state.soil, device);
    harness.createBuffer("geochemistry.temperature", scalarBytes, ["storage", "copyDst"], state.temperature, device);
    harness.createBuffer("geochemistry.vegetation", scalarBytes, ["storage", "copyDst"], state.vegetation, device);
    harness.createBuffer("geochemistry.oceanMask", scalarBytes, ["storage", "copyDst"], state.oceanMask, device);
    harness.createBuffer("geochemistry.volcanicEmission", scalarBytes, ["storage", "copyDst"], state.volcanicEmission, device);
    harness.createBuffer("geochemistry.params", 64, ["uniform", "copyDst"], this.makeParamsData(state.width, state.height, config, spec.dt || 1), device);
    harness.registerPass(this.passId, {
      pipelineDescriptor: { label: "geochemistry.pipeline", layout: "auto", compute: { module: shaderModule, entryPoint: "update_geochemistry" } },
      bindGroups: [],
      workgroups: function () {
        return [Math.ceil(state.width / self.workgroupSize[0]), Math.ceil(state.height / self.workgroupSize[1]), 1];
      },
      beforeDispatch: function (pass, owner) {
        var pipeline = pass.pipeline || owner.getPassPipeline(pass, device);
        var descriptor = {
          label: "geochemistry.bind-group",
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: owner.getReadBuffer(self.stateId).buffer } },
            { binding: 1, resource: { buffer: owner.getWriteBuffer(self.stateId).buffer } },
            { binding: 2, resource: { buffer: owner.buffers["geochemistry.ocean"].buffer } },
            { binding: 3, resource: { buffer: owner.buffers["geochemistry.soil"].buffer } },
            { binding: 4, resource: { buffer: owner.buffers["geochemistry.temperature"].buffer } },
            { binding: 5, resource: { buffer: owner.buffers["geochemistry.vegetation"].buffer } },
            { binding: 6, resource: { buffer: owner.buffers["geochemistry.oceanMask"].buffer } },
            { binding: 7, resource: { buffer: owner.buffers["geochemistry.volcanicEmission"].buffer } },
            { binding: 8, resource: { buffer: owner.buffers["geochemistry.params"].buffer } }
          ]
        };
        pass.bindGroups = [owner.createCachedBindGroup(pass, device, 0, descriptor)];
      },
      afterDispatch: function () {
        harness.swap(self.stateId);
      }
    });

    return {
      width: state.width,
      height: state.height,
      atmosphereBytes: atmoBytes,
      oceanBytes: oceanBytes,
      soilBytes: soilBytes
    };
  }
};
