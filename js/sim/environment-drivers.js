"use strict";
PS.sim = PS.sim || {};

PS.sim.environmentDrivers = PS.sim.environmentDrivers || {
  configPath: "sim/configs/environment-drivers.json",
  defaults: {
    drivers: [
      { id: "volcanism", cadence: "event_tick", outputs: ["volcanic_emission", "greenhouse_forcing", "mineral_distribution"] },
      { id: "orbital_solar", cadence: "orbital_tick", outputs: ["solar_forcing", "albedo"] },
      { id: "asteroid_dust", cadence: "event_tick", outputs: ["dust_opacity", "albedo", "solar_forcing"] },
      { id: "agent_intervention", cadence: "event_tick", outputs: ["greenhouse_forcing", "albedo", "vegetation_density", "species_density"] },
      { id: "runaway_biology", cadence: "driver_tick", outputs: ["vegetation_density", "species_density", "greenhouse_forcing", "ocean_ph"] }
    ],
    fieldConsumers: {
      volcanic_emission: ["geochemistry", "pixel-ca"],
      greenhouse_forcing: ["heat-diffusion", "geochemistry"],
      mineral_distribution: ["geochemistry", "pixel-ca"],
      ocean_ph: ["geochemistry", "lenia"],
      albedo: ["heat-diffusion", "biome-lut"],
      vegetation_density: ["geochemistry", "reaction-diffusion", "lenia"],
      species_density: ["lenia", "biome-lut"],
      solar_forcing: ["heat-diffusion"],
      dust_opacity: ["heat-diffusion", "moisture"]
    }
  },
  config: null,

  normalizeConfig: function (config) {
    var source = config || {};
    return {
      drivers: Array.isArray(source.drivers) ? source.drivers : this.defaults.drivers,
      fieldConsumers: source.fieldConsumers || this.defaults.fieldConsumers
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
    var parameters = PS.sim && PS.sim.parameters;
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
    if (PS.sim && PS.sim.geochemistry && typeof PS.sim.geochemistry.computeOceanPh === "function") {
      return PS.sim.geochemistry.computeOceanPh(co2Ppm);
    }
    return Math.max(5, Math.min(8.6, 8.1 - 0.3 * ((Math.max(0, Number(co2Ppm) || 0) / 280) - 1)));
  },

  applyEvent: function (state, event) {
    var item = event || {};
    var type = String(item.type || item.id || "");
    var strength = Math.max(0, Number(item.strength) || 0);
    if (type === "volcanism") {
      state.fields.volcanic_emission += strength;
      state.atmosphere.co2Ppm += strength * 80;
      state.atmosphere.so2Ppm += strength * 12;
      state.fields.mineral_distribution = Math.min(1, state.fields.mineral_distribution + strength * 0.08);
    } else if (type === "asteroid_dust") {
      state.fields.dust_opacity += strength;
      state.fields.albedo = Math.min(1, state.fields.albedo + strength * 0.12);
      state.fields.solar_forcing *= Math.max(0, 1 - strength * 0.18);
    } else if (type === "orbital_solar") {
      state.fields.solar_forcing *= Math.max(0.1, 1 + Number(item.forcingDelta || item.delta || 0));
    } else if (type === "agent_intervention") {
      this.applyPatchFields(state, item.fields || {});
    } else if (type === "runaway_biology") {
      this.applyRunawayBiology(state, strength, Number(item.dt) || 1);
    }
    state.events.push({ type: type, strength: strength, tick: state.tick });
    return state;
  },

  applyPatchFields: function (state, fields) {
    var key;
    for (key in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, key) && Object.prototype.hasOwnProperty.call(state.fields, key)) {
        state.fields[key] = Number(fields[key]);
      }
    }
  },

  applyRunawayBiology: function (state, strength, dt) {
    var conversion = Math.max(0, Number(strength) || 0) * Math.max(0, Number(dt) || 1);
    state.fields.vegetation_density = Math.min(1, state.fields.vegetation_density + conversion * 0.01);
    state.fields.species_density = Math.min(1, state.fields.species_density + conversion * 0.008);
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
    var geo = PS.sim && PS.sim.geochemistry;
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
