import { PS } from "../core/namespace.js";
import { biomeLut } from "../sim/biome-lut.js";
import { environmentDrivers } from "../sim/environment-drivers.js";
import { heatDiffusion } from "../sim/heat-diffusion.js";
import { world } from "../systems/state.js";

PS.epochs = PS.epochs || {};

PS.epochs.StateMachine = function (options) {
  var spec = options || {};
  this.config = PS.epochs.resolveEpochConfig(spec.config);
  PS.epochs.assertValidEpochConfig(this.config);
  PS.epochs.epochConfig = this.config;
  this.pipeline = spec.pipeline || (PS.sim && PS.sim.coupling) || null;
  this.epoch = Math.max(0, Math.round(Number(spec.epoch) || 0));
  this.history = [];
  this.state = null;
  this.transition(this.epoch, { initial: true });
};

PS.epochs.StateMachine.prototype.transition = function (targetEpoch, options) {
  var spec = options || {};
  var previous = this.epoch;
  var config = PS.epochs.getEpochConfig(targetEpoch, this.config);
  if (!config) { throw new Error("Unknown epoch: " + targetEpoch); }
  this.epoch = config.id;
  this.state = PS.epochs.makeEpochState(config, previous, this.pipeline);
  PS.epochs.applyEpochToPipeline(this.pipeline, this.state);
  PS.epochs.applyEpochAtmosphere(this.state);
  PS.epochs.applyEpochPalette(this.state);
  PS.epochs.applyEpochLife(this.state);
  this.history.push({ from: previous, to: config.id, name: config.name, initial: spec.initial === true });
  PS.epochs.emitEpochTransition(previous, config.id, this.state);
  return this.state;
};

PS.epochs.StateMachine.prototype.getState = function () {
  return PS.epochs.cloneEpochState(this.state);
};

PS.epochs.epochConfigPath = "sim/configs/epoch-configs.json";
PS.epochs.epochDefaults = PS.epochs.epochDefaults || { epochs: [] };
PS.epochs.epochConfig = PS.epochs.epochConfig || null;
PS.epochs.machine = PS.epochs.machine || null;
PS.epochs.pendingAtmosphereState = PS.epochs.pendingAtmosphereState || null;

PS.epochs.normalizeEpochConfig = function (config) {
  var source = config || {};
  return { epochs: Array.isArray(source.epochs) ? source.epochs : [] };
};

PS.epochs.resolveEpochConfig = function (config) {
  var source = config || this.epochConfig;
  if (!source && PS.assets && PS.assets.jsonData && PS.assets.jsonData[this.epochConfigPath]) {
    source = PS.assets.jsonData[this.epochConfigPath];
  }
  return this.normalizeEpochConfig(source || this.epochDefaults);
};

PS.epochs.loadEpochConfig = function (loader) {
  var self = this;
  var assetLoader = loader || (PS.assets && PS.assets.startupLoader) || (PS.assets && PS.assets.AssetLoader ? new PS.assets.AssetLoader() : null);
  var configPromise = assetLoader && typeof assetLoader.loadJSON === "function"
    ? assetLoader.loadJSON(this.epochConfigPath)
    : Promise.resolve(this.epochDefaults);
  return configPromise.then(function (config) {
    self.epochConfig = self.normalizeEpochConfig(config);
    self.assertValidEpochConfig(self.epochConfig);
    return self.epochConfig;
  });
};

PS.epochs.getEpochConfig = function (id, config) {
  var epochs = this.resolveEpochConfig(config).epochs;
  var target = Math.max(0, Math.round(Number(id) || 0));
  for (var i = 0; i < epochs.length; i += 1) {
    if (Number(epochs[i].id) === target) { return epochs[i]; }
  }
  return null;
};

PS.epochs.validateEpochConfig = function (config) {
  var epochs = this.resolveEpochConfig(config).epochs;
  var errors = [];
  var seen = {};
  for (var i = 0; i < epochs.length; i += 1) {
    var epoch = epochs[i] || {};
    if (!Number.isFinite(Number(epoch.id))) { errors.push("missing-id:" + i); }
    if (!epoch.name) { errors.push("missing-name:" + i); }
    if (!Array.isArray(epoch.active_passes)) { errors.push("missing-active-passes:" + epoch.id); }
    if (!epoch.atmosphere || !Number.isFinite(Number(epoch.atmosphere.co2_ppm))) { errors.push("missing-atmosphere:" + epoch.id); }
    if (!Number.isFinite(Number(epoch.ticks_per_year))) { errors.push("missing-timescale:" + epoch.id); }
    if (!epoch.visual_palette || !Array.isArray(epoch.visual_palette.colors)) { errors.push("missing-palette:" + epoch.id); }
    seen[String(epoch.id)] = true;
  }
  for (var id = 0; id < 13; id += 1) {
    if (!seen[String(id)]) { errors.push("missing-epoch:" + id); }
  }
  return { valid: errors.length === 0, errors: errors, count: epochs.length };
};

PS.epochs.assertValidEpochConfig = function (config) {
  var report = this.validateEpochConfig(config);
  if (!report.valid) {
    throw new Error("Invalid epoch config: " + report.errors.join(", "));
  }
  return report;
};

PS.epochs.canonicalPassIds = function (pipeline) {
  var source = pipeline && Array.isArray(pipeline.passOrder) ? pipeline.passOrder : (PS.sim && PS.sim.coupling && PS.sim.coupling.passOrder) || [];
  return source.map(function (pass) { return pass.id; });
};

PS.epochs.filterActivePasses = function (activePasses, pipeline) {
  var active = {};
  var canonical = this.canonicalPassIds(pipeline);
  var list = Array.isArray(activePasses) ? activePasses : [];
  for (var i = 0; i < list.length; i += 1) { active[String(list[i])] = true; }
  return canonical.filter(function (id) { return active[id] === true; });
};

PS.epochs.makeEpochState = function (config, previous, pipeline) {
  var co2 = Number(config.atmosphere.co2_ppm) || 0;
  var o2 = Number(config.atmosphere.o2_ppm) || 0;
  var drivers = environmentDrivers;
  var activePasses = this.filterActivePasses(config.active_passes, pipeline);
  var greenhouse = drivers && typeof drivers.computeGreenhouse === "function" ? drivers.computeGreenhouse(co2) : Math.max(0, Math.log(Math.max(1, co2) / 280) / Math.log(2));
  return {
    id: Number(config.id),
    name: config.name,
    previousEpoch: Number(previous),
    order: this.normalizeEpochConfig(this.epochConfig || this.epochDefaults).epochs.map(function (epoch) { return epoch.id; }),
    simTimeGa: Number(config.sim_time_ga),
    yearRange: config.year_range || "",
    activePasses: activePasses,
    configuredPasses: config.active_passes.slice(),
    atmosphere: {
      co2Ppm: co2,
      o2Ppm: o2,
      ch4Ppm: Number(config.atmosphere.ch4_ppm) || 0,
      n2Ppm: Number(config.atmosphere.n2_ppm) || 0
    },
    greenhouseForcing: greenhouse,
    ticksPerYear: Number(config.ticks_per_year),
    yearsPerGameSecond: Number(config.years_per_game_second),
    paletteId: config.visual_palette.id,
    palette: config.visual_palette.colors.slice(),
    ocean: config.ocean || {},
    life: config.life || {},
    transitionTick: typeof world !== "undefined" && world ? Number(world.tick) || 0 : 0,
    configVersion: "azr-841"
  };
};

PS.epochs.applyEpochToPipeline = function (pipeline, state) {
  if (!pipeline || !state) { return state; }
  pipeline.activePassIds = state.activePasses.slice();
  pipeline.ticksPerYear = state.ticksPerYear;
  if (typeof pipeline.setActivePasses === "function") { pipeline.setActivePasses(state.activePasses.slice()); }
  if (typeof pipeline.setTimescale === "function") { pipeline.setTimescale(state.ticksPerYear); }
  return state;
};

PS.epochs.isAtmosphereUpdateActive = function () {
  return typeof world !== "undefined" &&
    world &&
    (
      world.epochAtmospherePhase === "updating" ||
      world.isAtmosphereUpdating === true
    );
};

PS.epochs.queueEpochAtmosphere = function (state) {
  var snapshot = this.cloneEpochState(state);
  this.pendingAtmosphereState = snapshot;
  if (typeof world !== "undefined" && world) {
    world.pendingEpochAtmosphere = snapshot;
  }
  return state;
};

PS.epochs.flushPendingEpochAtmosphere = function () {
  var pending = this.pendingAtmosphereState ||
    (typeof world !== "undefined" && world ? world.pendingEpochAtmosphere : null);

  if (!pending) { return null; }
  this.pendingAtmosphereState = null;
  if (typeof world !== "undefined" && world) {
    world.pendingEpochAtmosphere = null;
  }
  return this.applyEpochAtmosphere(pending, { force: true });
};

PS.epochs.applyEpochAtmosphere = function (state, options) {
  var spec = options || {};
  if (typeof world === "undefined" || !world || !state) { return state; }
  if (spec.force !== true && this.isAtmosphereUpdateActive()) {
    return this.queueEpochAtmosphere(state);
  }
  world.epochScaling = this.cloneEpochState(state);
  world.era = state.name;
  world.atmosphere = world.atmosphere || {};
  world.atmosphere.carbonDioxidePpm = state.atmosphere.co2Ppm;
  world.atmosphere.oxygenPpm = state.atmosphere.o2Ppm;
  world.atmosphere.methanePpm = state.atmosphere.ch4Ppm;
  world.atmosphere.greenhouseForcing = state.greenhouseForcing;
  if (heatDiffusion && typeof heatDiffusion.applyGreenhouseForcing === "function") {
    heatDiffusion.applyGreenhouseForcing(state.greenhouseForcing);
  }
  return state;
};

PS.epochs.applyEpochPalette = function (state) {
  var biome = biomeLut;
  if (biome && biome.state && state) {
    if (typeof biome.setEpochPalette === "function") {
      biome.setEpochPalette(state.paletteId, state.palette);
    } else {
      biome.state.epochPaletteId = state.paletteId;
      biome.state.epochPalette = state.palette.slice();
    }
  }
  return state;
};

PS.epochs.isBiomeStable = function () {
  var biome = biomeLut && biomeLut.state;
  if (biome && biome.stable === true) { return true; }
  if (biome && Number(biome.stability) >= 1) { return true; }
  return typeof world !== "undefined" && world && world.biomeStable === true;
};

PS.epochs.applyEpochLife = function (state) {
  var lenia = PS.sim && PS.sim.lenia;
  if (!state || !state.life || !lenia) { return state; }
  if (state.life.spawn_after === "biome-stable" && !this.isBiomeStable()) {
    lenia.pendingEpochSpawn = this.cloneEpochState(state);
    lenia.state = lenia.state || {};
    delete lenia.state.activeEpochSpecies;
    delete lenia.state.spawnedEpochSpecies;
    if (lenia.state) {
      lenia.state.pendingEpochSpawn = { epoch: state.id, gate: "biome-stable", species: (state.life.lenia_species || []).slice() };
    }
    return state;
  }
  if (Array.isArray(state.life.lenia_species)) {
    if (typeof lenia.activateEpochSpecies === "function") {
      lenia.activateEpochSpecies(state.life.lenia_species, { epoch: state.id, gate: state.life.spawn_after || "transition" });
    } else {
      lenia.state = lenia.state || {};
      lenia.state.activeEpochSpecies = state.life.lenia_species.slice();
      lenia.state.spawnedEpochSpecies = {
        epoch: state.id,
        gate: state.life.spawn_after || "transition",
        species: state.life.lenia_species.slice()
      };
    }
  }
  return state;
};

PS.epochs.updateEpochGates = function () {
  var lenia = PS.sim && PS.sim.lenia;
  if (lenia && lenia.pendingEpochSpawn && this.isBiomeStable()) {
    var pending = lenia.pendingEpochSpawn;
    lenia.pendingEpochSpawn = null;
    this.applyEpochLife(pending);
    return this.cloneEpochState(pending);
  }
  return null;
};

PS.epochs.emitEpochTransition = function (from, to, state) {
  if (PS.events && typeof PS.events.emit === "function") {
    var type = PS.events.types && PS.events.types.EPOCH_TRANSITION ? PS.events.types.EPOCH_TRANSITION : "epoch.changed";
    PS.events.emit(type, { from: from, to: to, state: this.cloneEpochState(state) });
  }
};

PS.epochs.setEpoch = function (id, options) {
  var spec = options || {};
  if (!this.machine) {
    this.machine = new PS.epochs.StateMachine({ config: spec.config, pipeline: spec.pipeline, epoch: id });
    return this.machine.getState();
  }
  if (spec.pipeline) { this.machine.pipeline = spec.pipeline; }
  return this.machine.transition(id, spec);
};

PS.epochs.getEpochState = function () {
  if (!this.machine) {
    this.machine = new PS.epochs.StateMachine();
  }
  return this.machine.getState();
};

PS.epochs.cloneEpochState = function (state) {
  return JSON.parse(JSON.stringify(state || {}));
};
