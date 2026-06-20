import { PS } from "../core/namespace.js";
import { geochemistry } from "./geochemistry.js";
import { parameters as parameterRegistry } from "./parameter-registry.js";

export const environmentDrivers = {
  configPath: "sim/configs/environment-drivers.json",
  defaults: {
    drivers: [
      { id: "volcanism", cadence: "event_tick", causes: ["tectonics", "mantle_heat", "hotspot", "impact"], outputs: ["volcanic_emission", "atmosphere", "greenhouse_forcing", "mineral_distribution", "ocean_ph"], forbiddenOutputs: ["coral_density", "target_biome_distribution"] },
      { id: "orbital_solar", cadence: "orbital_tick", causes: ["stellar_luminosity", "orbital_distance", "eccentricity", "axial_tilt"], outputs: ["solar_forcing", "seasonality", "albedo"], forbiddenOutputs: ["target_temperature_distribution"] },
      { id: "asteroid_dust", cadence: "event_tick", causes: ["impact_energy", "ejecta_mass", "impact_location"], outputs: ["dust_opacity", "albedo", "solar_forcing", "mineral_distribution"], forbiddenOutputs: ["target_extinction_rate"] },
      { id: "agent_intervention", cadence: "event_tick", causes: ["explicit_agent_action"], outputs: ["greenhouse_forcing", "albedo", "vegetation_density", "species_density", "atmosphere"], forbiddenOutputs: ["target_population", "target_biome_distribution"] },
      { id: "runaway_biology", cadence: "driver_tick", causes: ["primary_productivity", "species_density", "nutrient_limit", "respiration"], outputs: ["vegetation_density", "species_density", "atmosphere", "greenhouse_forcing", "ocean_ph"], forbiddenOutputs: ["coral_density", "target_oxygen_distribution"] }
    ],
    schema: {
      eventFields: ["type", "startTick", "durationTicks", "decay", "strength", "causes", "outputs"],
      allowedDecay: ["none", "linear", "exponential"],
      forbiddenOutcomePrefixes: ["target_", "desired_", "healthy_"],
      forbiddenOutcomeFields: ["coral_density", "population_density", "biome_distribution", "target_population"]
    },
    fieldConsumers: {
      volcanic_emission: ["geochemistry", "pixel-ca"],
      atmosphere: ["geochemistry", "heat-diffusion", "lenia"],
      greenhouse_forcing: ["heat-diffusion", "geochemistry"],
      mineral_distribution: ["geochemistry", "pixel-ca"],
      ocean_ph: ["geochemistry", "lenia"],
      albedo: ["heat-diffusion", "biome-lut"],
      vegetation_density: ["geochemistry", "reaction-diffusion", "lenia"],
      species_density: ["lenia", "biome-lut"],
      solar_forcing: ["heat-diffusion"],
      seasonality: ["heat-diffusion", "moisture"],
      dust_opacity: ["heat-diffusion", "moisture"]
    }
  },
  config: null,

  normalizeConfig: function (config) {
    var source = config || {};
    if (!Array.isArray(source.drivers) && PS.assets && PS.assets.jsonData && PS.assets.jsonData[this.configPath]) {
      source = PS.assets.jsonData[this.configPath];
    }
    return {
      drivers: Array.isArray(source.drivers) ? source.drivers : this.defaults.drivers,
      schema: source.schema || this.defaults.schema,
      fieldConsumers: source.fieldConsumers || this.defaults.fieldConsumers
    };
  },

  getDriver: function (config, id) {
    var drivers = this.normalizeConfig(config || this.config || {}).drivers;
    var key = String(id || "");
    for (var i = 0; i < drivers.length; i += 1) {
      if (String(drivers[i].id) === key) { return drivers[i]; }
    }
    return null;
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

  validateDriver: function (driver, schema) {
    if (!driver || !driver.id || !driver.cadence) { return "missing-id-or-cadence"; }
    if (!Array.isArray(driver.causes) || driver.causes.length === 0) { return "missing-causes"; }
    if (!Array.isArray(driver.outputs) || driver.outputs.length === 0) { return "missing-outputs"; }
    if (!Array.isArray(driver.forbiddenOutputs) || driver.forbiddenOutputs.length === 0) { return "missing-forbidden-outputs"; }
    if (!driver.eventSchema) { return "missing-event-schema"; }
    if (!this.containsAllowed(schema.allowedDecay, driver.eventSchema.decay)) { return "invalid-decay"; }
    if (!Number.isFinite(Number(driver.eventSchema.durationTicks))) { return "invalid-duration"; }
    for (var i = 0; i < driver.outputs.length; i += 1) {
      if (this.isForbiddenOutcomeField(driver.outputs[i], schema)) { return "forbidden-output:" + driver.outputs[i]; }
    }
    return null;
  },

  validateConfig: function (config) {
    var normalized = this.normalizeConfig(config || this.config || {});
    var drivers = normalized.drivers;
    var schema = normalized.schema || this.defaults.schema;
    var errors = [];
    for (var i = 0; i < drivers.length; i += 1) {
      var error = this.validateDriver(drivers[i], schema);
      if (error) { errors.push(String(drivers[i] && drivers[i].id || i) + ":" + error); }
    }
    return { valid: errors.length === 0, errors: errors, count: drivers.length };
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

  getFieldContract: function (config) {
    var consumers = this.normalizeConfig(config || this.config || {}).fieldConsumers;
    var fields = {};
    var key;
    for (key in consumers) {
      if (Object.prototype.hasOwnProperty.call(consumers, key)) {
        fields[key] = { writtenBy: "environment-drivers", readBy: consumers[key].slice ? consumers[key].slice() : consumers[key] };
      }
    }
    return fields;
  },

  createState: function (options) {
    var spec = options || {};
    var parameters = parameterRegistry;
    var baseline = spec.baseline || (parameters ? parameters.createBaseline(spec) : { values: {}, provenance: {} });
    var co2 = Number(baseline.values["atmosphere.co2_ppm"]) || 420;
    var o2 = Number(baseline.values["atmosphere.o2_ppm"]) || 209500;
    var albedo = Number(baseline.values["surface.albedo"]) || 0.3;
    return {
      tick: 0,
      baseline: baseline,
      atmosphere: { co2Ppm: co2, o2Ppm: o2, so2Ppm: 0 },
      fields: {
        volcanic_emission: Number(baseline.values["volcanic.activity"]) || 0,
        greenhouse_forcing: this.computeGreenhouse(co2),
        mineral_distribution: Number(baseline.values["mineral.abundance_index"]) || 0.35,
        ocean_ph: this.computeOceanPh(co2),
        albedo: albedo,
        vegetation_density: 0,
        species_density: 0,
        solar_forcing: Number(baseline.values["solar.constant_w_m2"]) || 1361,
        dust_opacity: 0
      },
      events: [],
      provenance: baseline.provenance
    };
  },

  computeGreenhouse: function (co2Ppm) {
    return Math.max(0, Math.log(Math.max(1, Number(co2Ppm) || 1) / 280) / Math.log(2));
  },

  computeOceanPh: function (co2Ppm) {
    if (geochemistry && typeof geochemistry.computeOceanPh === "function") {
      return geochemistry.computeOceanPh(co2Ppm);
    }
    return Math.max(5, Math.min(8.6, 8.1 - 0.3 * ((Math.max(0, Number(co2Ppm) || 0) / 280) - 1)));
  },

  normalizeEvent: function (state, event, driver) {
    var item = event || {};
    var schema = driver && driver.eventSchema ? driver.eventSchema : {};
    return {
      type: String(item.type || item.id || ""),
      startTick: Math.max(0, Math.round(Number(item.startTick) || Number(state.tick) || Number(schema.startTick) || 0)),
      durationTicks: Math.max(1, Math.round(Number(item.durationTicks) || Number(item.duration) || Number(schema.durationTicks) || 1)),
      decay: String(item.decay || schema.decay || "none"),
      strength: Math.max(0, Number(item.strength) || 0),
      fields: item.fields || {},
      forcingDelta: Number(item.forcingDelta || item.delta || 0),
      causes: item.causes || schema.causes || []
    };
  },

  getEventStrengthAtTick: function (event, tick) {
    var elapsed = Math.max(0, Number(tick) - Number(event.startTick));
    if (elapsed >= Number(event.durationTicks)) { return 0; }
    if (event.decay === "linear") {
      return event.strength * Math.max(0, 1 - elapsed / Math.max(1, event.durationTicks));
    }
    if (event.decay === "exponential") {
      return event.strength * Math.pow(0.5, elapsed / Math.max(1, event.durationTicks));
    }
    return event.strength;
  },

  assertAllowedOutput: function (driver, field) {
    var key = String(field || "");
    var schema = this.normalizeConfig(this.config || {}).schema || this.defaults.schema;
    if (!driver || !Array.isArray(driver.outputs) || driver.outputs.indexOf(key) < 0) {
      throw new Error("Driver " + String(driver && driver.id || "unknown") + " cannot write undeclared field " + key);
    }
    if (this.isForbiddenOutcomeField(key, schema) || (Array.isArray(driver.forbiddenOutputs) && driver.forbiddenOutputs.indexOf(key) >= 0)) {
      throw new Error("Driver " + String(driver && driver.id || "unknown") + " cannot write forbidden outcome " + key);
    }
  },

  setField: function (state, driver, field, value) {
    this.assertAllowedOutput(driver, field);
    if (field === "atmosphere") { return; }
    if (Object.prototype.hasOwnProperty.call(state.fields, field)) {
      state.fields[field] = value;
    }
  },

  applyEvent: function (state, event) {
    var type = String((event || {}).type || (event || {}).id || "");
    var driver = this.getDriver(null, type);
    if (!driver) { throw new Error("Unknown environmental driver event " + type); }
    var item = this.normalizeEvent(state, event, driver);
    var strength = this.getEventStrengthAtTick(item, state.tick);
    if (type === "volcanism") {
      this.setField(state, driver, "volcanic_emission", state.fields.volcanic_emission + strength);
      this.assertAllowedOutput(driver, "atmosphere");
      state.atmosphere.co2Ppm += strength * 80;
      state.atmosphere.so2Ppm += strength * 12;
      this.setField(state, driver, "mineral_distribution", Math.min(1, state.fields.mineral_distribution + strength * 0.08));
    } else if (type === "asteroid_dust") {
      this.setField(state, driver, "dust_opacity", state.fields.dust_opacity + strength);
      this.setField(state, driver, "albedo", Math.min(1, state.fields.albedo + strength * 0.12));
      this.setField(state, driver, "solar_forcing", state.fields.solar_forcing * Math.max(0, 1 - strength * 0.18));
    } else if (type === "orbital_solar") {
      this.setField(state, driver, "solar_forcing", state.fields.solar_forcing * Math.max(0.1, 1 + item.forcingDelta));
    } else if (type === "agent_intervention") {
      this.applyPatchFields(state, item.fields || {}, driver);
    } else if (type === "runaway_biology") {
      this.applyRunawayBiology(state, strength, Number((event || {}).dt) || 1, driver);
    }
    state.events.push({ type: type, startTick: item.startTick, durationTicks: item.durationTicks, decay: item.decay, strength: strength, tick: state.tick });
    return state;
  },

  applyPatchFields: function (state, fields, driver) {
    var key;
    for (key in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        this.setField(state, driver, key, Number(fields[key]));
      }
    }
  },

  applyRunawayBiology: function (state, strength, dt, driver) {
    var conversion = Math.max(0, Number(strength) || 0) * Math.max(0, Number(dt) || 1);
    this.setField(state, driver, "vegetation_density", Math.min(1, state.fields.vegetation_density + conversion * 0.01));
    this.setField(state, driver, "species_density", Math.min(1, state.fields.species_density + conversion * 0.008));
    this.assertAllowedOutput(driver, "atmosphere");
    state.atmosphere.co2Ppm = Math.max(0, state.atmosphere.co2Ppm - conversion * 25);
    state.atmosphere.o2Ppm = Math.min(300000, state.atmosphere.o2Ppm + conversion * 25);
  },

  evolve: function (state, options) {
    var spec = options || {};
    var events = Array.isArray(spec.events) ? spec.events : [];
    state.tick += Math.max(1, Math.round(Number(spec.dt) || 1));
    for (var i = 0; i < events.length; i += 1) {
      this.applyEvent(state, events[i]);
    }
    state.fields.greenhouse_forcing = this.computeGreenhouse(state.atmosphere.co2Ppm);
    state.fields.ocean_ph = this.computeOceanPh(state.atmosphere.co2Ppm);
    return state;
  },

  makeGeochemistryInputs: function (state, width, height) {
    var geo = geochemistry;
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var volcanicValue = Math.max(0, Number(state.fields.volcanic_emission) || 0);
    return {
      co2Ppm: state.atmosphere.co2Ppm,
      o2Ppm: state.atmosphere.o2Ppm,
      volcanic: geo && geo.makeVolcanicEmissionField ? geo.makeVolcanicEmissionField(w, h, { value: volcanicValue }) : null,
      vegetation: geo && geo.makeVegetationField ? geo.makeVegetationField(w, h, state.fields.vegetation_density) : null,
      oceanPh: state.fields.ocean_ph
    };
  }
};
