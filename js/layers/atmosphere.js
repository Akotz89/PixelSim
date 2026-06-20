import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { geochemistry } from "../sim/geochemistry.js";
import { world } from "../systems/state.js";
import { layerRegistry } from "./registry.js";

export function getAtmosphereConfig() {
  var constants = typeof CONFIG !== "undefined" ? CONFIG : {};

  return {
    ozoneO2Threshold: Math.max(0, Number(constants.ATMOSPHERE_OZONE_O2_THRESHOLD) || 0.12),
    organismO2Requirement: Math.max(0, Number(constants.ATMOSPHERE_ORGANISM_O2_REQUIREMENT) || 0.16),
    anoxiaEnergyCost: Math.max(0, Number(constants.ATMOSPHERE_ANOXIA_ENERGY_COST) || 0.35),
    photosynthesisO2Rate: Math.max(0, Number(constants.ATMOSPHERE_PHOTOSYNTHESIS_O2_RATE) || 0.00008),
    outgassingRate: Math.max(0, Number(constants.ATMOSPHERE_OUTGASSING_RATE) || 0.0005)
  };
}

export function clampAtmosphere(value, min, max) {
  return PS.math && typeof PS.math.clamp === "function" ? PS.math.clamp(value, min, max) : Math.max(min, Math.min(max, value));
}

export function getAtmosphereInitialState() {
  var config = getAtmosphereConfig();

  return {
    ageTicks: 0,
    geologicalTimeMy: 0,
    gases: {
      co2: 0.74,
      o2: 0.001,
      n2: 0.22,
      ch4: 0.025,
      h2o: 0.004,
      o3: 0,
      sulfur: 0
    },
    co2: 0.74,
    oxygen: 0.001,
    nitrogen: 0.22,
    methane: 0.025,
    waterVapor: 0.004,
    ozone: 0,
    sulfur: 0,
    greenhouseForcing: 0,
    temperatureC: 18,
    temperatureBias: 0,
    volcanicOutgassing: 0,
    photosyntheticOxygen: 0,
    oxygenStress: 1,
    anoxiaDeaths: 0,
    config: config
  };
}

export function normalizeAtmosphereGases(state) {
  var gases = state.gases;
  var total =
    Math.max(0, Number(gases.co2) || 0) +
    Math.max(0, Number(gases.o2) || 0) +
    Math.max(0, Number(gases.n2) || 0) +
    Math.max(0, Number(gases.ch4) || 0) +
    Math.max(0, Number(gases.h2o) || 0) +
    Math.max(0, Number(gases.o3) || 0) +
    Math.max(0, Number(gases.sulfur) || 0);

  if (total <= 0) {
    gases.n2 = 1;
    total = 1;
  }

  gases.co2 = clampAtmosphere(gases.co2 / total, 0, 1);
  gases.o2 = clampAtmosphere(gases.o2 / total, 0, 1);
  gases.n2 = clampAtmosphere(gases.n2 / total, 0, 1);
  gases.ch4 = clampAtmosphere(gases.ch4 / total, 0, 1);
  gases.h2o = clampAtmosphere(gases.h2o / total, 0, 1);
  gases.o3 = clampAtmosphere(gases.o3 / total, 0, 1);
  gases.sulfur = clampAtmosphere(gases.sulfur / total, 0, 1);

  state.co2 = gases.co2;
  state.oxygen = gases.o2;
  state.nitrogen = gases.n2;
  state.methane = gases.ch4;
  state.waterVapor = gases.h2o;
  state.ozone = gases.o3;
  state.sulfur = gases.sulfur;
}

export function getAtmosphereVolcanicActivity() {
  if (world.geology && Number.isFinite(Number(world.geology.volcanicActivity))) {
    return Math.max(0, Number(world.geology.volcanicActivity));
  }

  return 0.08;
}

export function isPhotosyntheticOrganism(organism) {
  if (!organism) {
    return false;
  }

  if (organism.photosynthetic || organism.isPhotosynthetic) {
    return true;
  }

  var traits = organism.traits || {};

  return Boolean(traits.photosynthesis || traits.photosynthetic || traits.chlorophyll);
}

export function getPhotosyntheticBiomass() {
  if (!Array.isArray(world.organisms)) {
    return 0;
  }

  var biomass = 0;

  for (var i = 0; i < world.organisms.length; i++) {
    var organism = world.organisms[i];

    if (isPhotosyntheticOrganism(organism)) {
      biomass += Math.max(1, Number(organism.population) || 1);
    }
  }

  return biomass;
}

export function applyAtmosphereChemistry(state, timeStep) {
  var gases = state.gases;
  var volcanicActivity = getAtmosphereVolcanicActivity();
  var outgassing = volcanicActivity * state.config.outgassingRate * timeStep;
  var photosyntheticBiomass = getPhotosyntheticBiomass();
  var photosynthesis = photosyntheticBiomass * state.config.photosynthesisO2Rate * timeStep;
  var methaneOxidation = Math.min(gases.ch4, gases.o2 * 0.08 * timeStep);

  gases.co2 += outgassing * 0.62;
  gases.sulfur += outgassing * 0.16;
  gases.h2o += outgassing * 0.12;
  gases.ch4 += outgassing * 0.05;
  gases.o2 += photosynthesis;
  gases.co2 = Math.max(0, gases.co2 - photosynthesis * 0.45);
  gases.ch4 = Math.max(0, gases.ch4 - methaneOxidation);
  gases.co2 += methaneOxidation * 0.62;
  gases.sulfur *= Math.max(0.92, 1 - 0.01 * timeStep);

  if (gases.o2 >= state.config.ozoneO2Threshold) {
    gases.o3 += (gases.o2 - state.config.ozoneO2Threshold) * 0.018 * timeStep;
  } else {
    gases.o3 *= Math.max(0.94, 1 - 0.02 * timeStep);
  }

  gases.o3 = clampAtmosphere(gases.o3, 0, 0.035);
  state.volcanicOutgassing += outgassing;
  state.photosyntheticOxygen += photosynthesis;
  normalizeAtmosphereGases(state);
}

export function updateAtmosphereTemperature(state) {
  var greenhouse =
    Math.log(1 + state.gases.co2 * 52) * 6.2 +
    Math.log(1 + state.gases.ch4 * 180) * 4.4 +
    state.gases.h2o * 42 -
    state.gases.sulfur * 18;

  state.greenhouseForcing = greenhouse;
  state.temperatureBias = greenhouse - 18;
  state.temperatureC = clampAtmosphere(4 + greenhouse, -60, 95);
}

export function applyAtmosphereOrganismSurvival(state, timeStep) {
  if (!Array.isArray(world.organisms) || world.organisms.length === 0) {
    state.oxygenStress = state.gases.o2 >= state.config.organismO2Requirement ? 0 : 1;
    return;
  }

  var oxygenDeficit = Math.max(0, state.config.organismO2Requirement - state.gases.o2);
  var stress = state.config.organismO2Requirement > 0
    ? clampAtmosphere(oxygenDeficit / state.config.organismO2Requirement, 0, 1)
    : 0;
  var energyCost = stress * state.config.anoxiaEnergyCost * Math.max(1, timeStep);
  var deaths = 0;

  state.oxygenStress = stress;

  if (energyCost <= 0) {
    return;
  }

  for (var i = 0; i < world.organisms.length; i++) {
    var organism = world.organisms[i];

    if (!organism || isPhotosyntheticOrganism(organism)) {
      continue;
    }

    organism.atmosphericOxygenStress = stress;
    organism.energy = Math.max(0, (Number(organism.energy) || 0) - energyCost);

    if (organism.energy <= 0) {
      deaths++;
    }
  }

  state.anoxiaDeaths += deaths;
}

export function syncAtmosphereAliases(state) {
  var gases = state.gases || {};
  state.carbonDioxidePpm = Number.isFinite(Number(state.carbonDioxidePpm)) ? Number(state.carbonDioxidePpm) : gases.co2 * 1000000;
  state.oxygenPercent = Number.isFinite(Number(state.oxygenPercent)) ? Number(state.oxygenPercent) : gases.o2 * 100;
  state.ozoneIndex = Number.isFinite(Number(state.ozoneIndex)) ? Number(state.ozoneIndex) : gases.o3;
  return state;
}

export function applyAtmosphereGeochemistrySummary(state) {
  var summary = geochemistry && geochemistry.state && geochemistry.state.summary;

  if (!summary) {
    syncAtmosphereAliases(state);
    return state;
  }

  state.carbonDioxidePpm = summary.co2Ppm;
  state.oxygenPercent = summary.oxygenPercent;
  state.methanePpm = summary.ch4Ppm;
  state.sulfurDioxidePpm = summary.so2Ppm;
  state.oceanPh = summary.oceanPh;
  state.debugOverlayRows = summary.debugOverlayRows;
  return state;
}

export const atmosphereLayer = layerRegistry.register("atmosphere", {
  family: "planet",
  alwaysOn: true,
  watcherOutputs: ["overlays", "timeline", "inspect"],
  ensureState: function() {
    if (!world.atmosphere || !world.atmosphere.gases) {
      world.atmosphere = getAtmosphereInitialState();
      normalizeAtmosphereGases(world.atmosphere);
      updateAtmosphereTemperature(world.atmosphere);
    }

    return world.atmosphere;
  },
  update: function(dt) {
    var state = this.ensureState();
    var deltaMs = Math.max(0, Number(dt) || 0);
    var timeStep = deltaMs > 0 ? deltaMs / 1000 : 1 / 30;

    world.isAtmosphereUpdating = true;
    world.epochAtmospherePhase = "updating";

    try {
      state.ageTicks += 1;
      state.geologicalTimeMy += timeStep;
      state.lastDeltaMs = deltaMs;

      applyAtmosphereChemistry(state, timeStep);
      updateAtmosphereTemperature(state);
      applyAtmosphereOrganismSurvival(state, timeStep);
      applyAtmosphereGeochemistrySummary(state);
    } finally {
      world.isAtmosphereUpdating = false;
      world.epochAtmospherePhase = "idle";
    }

    if (PS.epochs && typeof PS.epochs.flushPendingEpochAtmosphere === "function") {
      PS.epochs.flushPendingEpochAtmosphere();
    }

    return state;
  },
  getState: function() {
    return this.ensureState();
  }
});
