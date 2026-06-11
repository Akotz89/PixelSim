"use strict";
PS.sim = PS.sim || {};

PS.sim.parameters = PS.sim.parameters || {
  configPath: "sim/configs/parameters.json",
  defaults: {
    parameters: [
      { id: "atmosphere.co2_ppm", unit: "ppm", range: [0, 200000], value: 420, provenance: "epoch_preset", updateCadence: "driver_tick", fields: ["atmosphere", "greenhouse_forcing", "ocean_ph"] },
      { id: "atmosphere.o2_ppm", unit: "ppm", range: [0, 300000], value: 209500, provenance: "epoch_preset", updateCadence: "driver_tick", fields: ["atmosphere"] },
      { id: "volcanic.activity", unit: "normalized", range: [0, 1], value: 0.05, provenance: "planet_spec_or_epoch_preset", updateCadence: "event_tick", fields: ["volcanic_emission", "mineral_distribution"] },
      { id: "ocean.ph", unit: "pH", range: [5, 8.6], value: 8.1, provenance: "derived_from_atmosphere.co2_ppm", updateCadence: "driver_tick", fields: ["ocean_ph"] },
      { id: "surface.albedo", unit: "ratio", range: [0, 1], value: 0.3, provenance: "terrain_and_driver_field", updateCadence: "driver_tick", fields: ["albedo"] },
      { id: "biology.co2_to_o2_rate_ppm", unit: "ppm/tick", range: [0, 5000], value: 0.42, provenance: "biology_model_parameter", updateCadence: "driver_tick", fields: ["vegetation_density", "species_density", "atmosphere"] },
      { id: "solar.constant_w_m2", unit: "W/m2", range: [900, 1800], value: 1361, provenance: "stellar_preset", updateCadence: "orbital_tick", fields: ["solar_forcing"] },
      { id: "mineral.abundance_index", unit: "normalized", range: [0, 1], value: 0.35, provenance: "tectonics_and_volcanism", updateCadence: "event_tick", fields: ["mineral_distribution"] }
    ],
    presets: {
      hadean: { "atmosphere.co2_ppm": 100000, "atmosphere.o2_ppm": 0, "volcanic.activity": 0.85, "surface.albedo": 0.18, "mineral.abundance_index": 0.75 },
      archean: { "atmosphere.co2_ppm": 10000, "atmosphere.o2_ppm": 1000, "volcanic.activity": 0.45, "surface.albedo": 0.22, "mineral.abundance_index": 0.62 },
      phanerozoic: { "atmosphere.co2_ppm": 1200, "atmosphere.o2_ppm": 210000, "volcanic.activity": 0.08, "surface.albedo": 0.31, "mineral.abundance_index": 0.40 },
      civilization: { "atmosphere.co2_ppm": 420, "atmosphere.o2_ppm": 209500, "volcanic.activity": 0.04, "surface.albedo": 0.30, "mineral.abundance_index": 0.35 }
    }
  },
  config: null,

  normalizeConfig: function (config) {
    var source = config || {};
    return {
      parameters: Array.isArray(source.parameters) ? source.parameters : this.defaults.parameters,
      presets: source.presets || this.defaults.presets
    };
  },

  loadAssets: function (loader) {
    var self = this;
    var assetLoader = loader || (PS.assets && PS.assets.startupLoader) || (PS.assets && PS.assets.AssetLoader ? new PS.assets.AssetLoader() : null);
    var configPromise = assetLoader && typeof assetLoader.loadJSON === "function"
      ? assetLoader.loadJSON(this.configPath)
      : Promise.resolve(this.defaults);
    return configPromise.then(function (config) {
      self.config = self.normalizeConfig(config);
      return self.config;
    });
  },

  list: function (config) {
    return this.normalizeConfig(config || this.config || {}).parameters.slice();
  },

  get: function (id, config) {
    var key = String(id || "");
    var list = this.list(config);
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i].id) === key) { return list[i]; }
    }
    return null;
  },

  clampValue: function (entry, value) {
    var range = Array.isArray(entry.range) ? entry.range : [-Infinity, Infinity];
    return Math.max(Number(range[0]), Math.min(Number(range[1]), Number(value)));
  },

  validateEntry: function (entry) {
    return !!(entry && entry.id && entry.unit && Array.isArray(entry.range) && entry.range.length === 2 && entry.provenance && entry.updateCadence);
  },

  validateRegistry: function (config) {
    var list = this.list(config);
    var errors = [];
    for (var i = 0; i < list.length; i += 1) {
      if (!this.validateEntry(list[i])) { errors.push(String(list[i] && list[i].id || i)); }
    }
    return { valid: errors.length === 0, errors: errors, count: list.length };
  },

  createBaseline: function (options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var presetId = String(spec.preset || spec.epoch || "civilization").toLowerCase();
    var preset = config.presets[presetId] || config.presets.civilization || {};
    var planetSpec = spec.planetSpec || {};
    var values = {};
    var provenance = {};
    var list = config.parameters;
    for (var i = 0; i < list.length; i += 1) {
      var entry = list[i];
      var hasPreset = Object.prototype.hasOwnProperty.call(preset, entry.id);
      var hasPlanet = Object.prototype.hasOwnProperty.call(planetSpec, entry.id);
      var raw = hasPlanet ? planetSpec[entry.id] : (hasPreset ? preset[entry.id] : entry.value);
      values[entry.id] = this.clampValue(entry, raw);
      provenance[entry.id] = {
        parameter: entry.id,
        unit: entry.unit,
        range: entry.range.slice(),
        source: hasPlanet ? "planet_spec" : (hasPreset ? "epoch_preset:" + presetId : entry.provenance),
        updateCadence: entry.updateCadence,
        fields: Array.isArray(entry.fields) ? entry.fields.slice() : []
      };
    }
    return { preset: presetId, values: values, provenance: provenance };
  },

  trace: function (baseline, id) {
    var base = baseline || {};
    var key = String(id || "");
    return base.provenance && base.provenance[key] ? base.provenance[key] : null;
  }
};
