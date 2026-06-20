import { PS } from "../core/namespace.js";

PS.sim = PS.sim || {};

export const parameters = {
  configPath: "sim/configs/parameters.json",
  defaults: {
    parameters: [
      { id: "atmosphere.co2_ppm", unit: "ppm", range: [0, 200000], value: 420, provenance: "epoch_preset", determinedBy: "outgassing, uptake, weathering, impacts, and biology", updateCadence: "driver_tick", fields: ["atmosphere", "greenhouse_forcing", "ocean_ph"] },
      { id: "atmosphere.o2_ppm", unit: "ppm", range: [0, 300000], value: 209500, provenance: "epoch_preset", determinedBy: "photosynthesis, respiration, sinks, and escape", updateCadence: "driver_tick", fields: ["atmosphere"] },
      { id: "volcanic.activity", unit: "normalized", range: [0, 1], value: 0.05, provenance: "planet_spec_or_epoch_preset", determinedBy: "tectonics, hotspots, mantle heat, and impacts", updateCadence: "event_tick", fields: ["volcanic_emission", "mineral_distribution"] },
      { id: "ocean.ph", unit: "pH", range: [5, 8.6], value: 8.1, provenance: "derived_from_atmosphere.co2_ppm", determinedBy: "atmospheric CO2, alkalinity, biology, and sulfur", updateCadence: "driver_tick", fields: ["ocean_ph"] },
      { id: "surface.albedo", unit: "ratio", range: [0, 1], value: 0.3, provenance: "terrain_and_driver_field", determinedBy: "surface and cloud state", updateCadence: "driver_tick", fields: ["albedo"] },
      { id: "biology.co2_to_o2_rate_ppm", unit: "ppm/tick", range: [0, 5000], value: 0.42, provenance: "biology_model_parameter", determinedBy: "productivity, burial, respiration, sinks, and nutrients", updateCadence: "driver_tick", fields: ["vegetation_density", "species_density", "atmosphere"] },
      { id: "solar.constant_w_m2", unit: "W/m2", range: [900, 1800], value: 1361, provenance: "stellar_preset", determinedBy: "star luminosity and orbit", updateCadence: "orbital_tick", fields: ["solar_forcing"] },
      { id: "mineral.abundance_index", unit: "normalized", range: [0, 1], value: 0.35, provenance: "tectonics_and_volcanism", determinedBy: "crust chemistry and resurfacing", updateCadence: "event_tick", fields: ["mineral_distribution"] }
    ],
    schema: {
      allowedFamilies: ["stellar_orbital", "planet_formation", "surface_interior", "atmosphere", "ocean_hydrology", "biology"],
      allowedSourceClasses: ["formation", "epoch_or_planet_spec", "derived_upstream", "model_state", "exogenous_driver"],
      forbiddenOutcomePrefixes: ["target_", "desired_", "healthy_"],
      forbiddenOutcomeFields: ["coral_density", "population_density", "biome_distribution"]
    },
    presets: {
      hadean: { "atmosphere.co2_ppm": 100000, "atmosphere.o2_ppm": 0, "volcanic.activity": 0.85, "surface.albedo": 0.18, "mineral.abundance_index": 0.75 },
      archean: { "atmosphere.co2_ppm": 10000, "atmosphere.o2_ppm": 1000, "volcanic.activity": 0.45, "surface.albedo": 0.22, "mineral.abundance_index": 0.62 },
      phanerozoic: { "atmosphere.co2_ppm": 1200, "atmosphere.o2_ppm": 210000, "volcanic.activity": 0.08, "surface.albedo": 0.31, "mineral.abundance_index": 0.40 },
      civilization: { "atmosphere.co2_ppm": 420, "atmosphere.o2_ppm": 209500, "volcanic.activity": 0.04, "surface.albedo": 0.30, "mineral.abundance_index": 0.35 }
    }
  },
  config: null,

  inferFamily: function (id) {
    var prefix = String(id || "").split(".")[0];
    if (prefix === "stellar" || prefix === "solar" || prefix === "orbital") { return "stellar_orbital"; }
    if (prefix === "planet") { return "planet_formation"; }
    if (prefix === "surface" || prefix === "crust" || prefix === "volcanic" || prefix === "mineral") { return "surface_interior"; }
    if (prefix === "atmosphere") { return "atmosphere"; }
    if (prefix === "ocean" || prefix === "hydrology") { return "ocean_hydrology"; }
    if (prefix === "biology") { return "biology"; }
    return "";
  },

  inferSourceClass: function (entry) {
    var cadence = String(entry && entry.updateCadence || "");
    var provenance = String(entry && entry.provenance || "");
    if (cadence === "formation_only" || provenance.indexOf("formation") >= 0) { return "formation"; }
    if (provenance.indexOf("epoch") >= 0 || provenance.indexOf("planet_spec") >= 0) { return "epoch_or_planet_spec"; }
    if (provenance.indexOf("derived") >= 0) { return "derived_upstream"; }
    if (provenance.indexOf("driver") >= 0) { return "exogenous_driver"; }
    if (provenance.indexOf("model") >= 0 || provenance.indexOf("life_model") >= 0 || provenance.indexOf("biology") >= 0) { return "model_state"; }
    return "derived_upstream";
  },

  normalizeEntry: function (entry) {
    var normalized = {};
    var key;
    for (key in entry) {
      if (Object.prototype.hasOwnProperty.call(entry, key)) { normalized[key] = entry[key]; }
    }
    normalized.family = normalized.family || this.inferFamily(normalized.id);
    normalized.sourceClass = normalized.sourceClass || this.inferSourceClass(normalized);
    normalized.driverIds = Array.isArray(normalized.driverIds) ? normalized.driverIds : [];
    return normalized;
  },

  normalizeConfig: function (config) {
    var source = config || {};
    if (!Array.isArray(source.parameters) && PS.assets && PS.assets.jsonData && PS.assets.jsonData[this.configPath]) {
      source = PS.assets.jsonData[this.configPath];
    }
    var sourceParameters = Array.isArray(source.parameters) ? source.parameters : this.defaults.parameters;
    var parameters = [];
    for (var i = 0; i < sourceParameters.length; i += 1) {
      parameters.push(this.normalizeEntry(sourceParameters[i]));
    }
    return {
      parameters: parameters,
      schema: source.schema || this.defaults.schema,
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
    return !!(entry && entry.id && entry.unit && Array.isArray(entry.range) && entry.range.length === 2 && entry.provenance && entry.determinedBy && entry.updateCadence);
  },

  containsAllowed: function (list, value) {
    return Array.isArray(list) && list.indexOf(value) >= 0;
  },

  isForbiddenOutcomeField: function (field, schema) {
    var key = String(field || "");
    var forbiddenFields = schema && Array.isArray(schema.forbiddenOutcomeFields) ? schema.forbiddenOutcomeFields : [];
    var forbiddenPrefixes = schema && Array.isArray(schema.forbiddenOutcomePrefixes) ? schema.forbiddenOutcomePrefixes : [];
    if (forbiddenFields.indexOf(key) >= 0) { return true; }
    for (var i = 0; i < forbiddenPrefixes.length; i += 1) {
      if (key.indexOf(forbiddenPrefixes[i]) === 0) { return true; }
    }
    return false;
  },

  validateOntology: function (entry, schema) {
    if (!entry.family || !this.containsAllowed(schema.allowedFamilies, entry.family)) { return "missing-or-invalid-family"; }
    if (!entry.sourceClass || !this.containsAllowed(schema.allowedSourceClasses, entry.sourceClass)) { return "missing-or-invalid-source-class"; }
    if (!Array.isArray(entry.fields) || entry.fields.length === 0) { return "missing-fields"; }
    for (var i = 0; i < entry.fields.length; i += 1) {
      if (this.isForbiddenOutcomeField(entry.fields[i], schema)) { return "forbidden-field:" + entry.fields[i]; }
    }
    return null;
  },

  validateRegistry: function (config) {
    var normalized = this.normalizeConfig(config || this.config || {});
    var list = normalized.parameters;
    var schema = normalized.schema || this.defaults.schema;
    var errors = [];
    for (var i = 0; i < list.length; i += 1) {
      if (!this.validateEntry(list[i])) { errors.push(String(list[i] && list[i].id || i)); }
      var ontologyError = this.validateOntology(list[i], schema);
      if (ontologyError) { errors.push(String(list[i] && list[i].id || i) + ":" + ontologyError); }
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
        family: entry.family,
        sourceClass: entry.sourceClass,
        determinedBy: entry.determinedBy,
        updateCadence: entry.updateCadence,
        driverIds: Array.isArray(entry.driverIds) ? entry.driverIds.slice() : [],
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
