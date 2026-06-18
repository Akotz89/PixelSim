"use strict";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { normalizeAtmosphereGases } from "../layers/atmosphere.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

PS.epochs = PS.epochs || {};

export var MICROBIAL_FIELD_WIDTH = 40;
export var MICROBIAL_FIELD_HEIGHT = 22;
export var MICROBIAL_MAX_POPULATIONS = 12;

export function clampMicrobial(value, min, max) {
  return PS.math && typeof PS.math.clamp === "function" ? PS.math.clamp(value, min, max) : Math.max(min, Math.min(max, value));
}

export function getMicrobialNoise(a, b, c) {
  return PS.math && typeof PS.math.deterministicUnitNoise === "function" ? PS.math.deterministicUnitNoise(a, b, c) : 0;
}

export function getMicrobialPrototypeEvaluation() {
  return {
    agentBased: {
      id: "agent",
      visualQuality: 0.35,
      performanceAtScale: 0.12,
      emergentBehavior: 0.42,
      decision: "reject",
      notes: "Individual microbes are too numerous for watcher-scale simulation and are not visible as individuals."
    },
    fieldBased: {
      id: "field",
      visualQuality: 0.82,
      performanceAtScale: 0.92,
      emergentBehavior: 0.70,
      decision: "candidate",
      notes: "Density, chemical energy, oxygen, stress, and bloom fields scale well and render as visible planet patterns."
    },
    populationBased: {
      id: "population",
      visualQuality: 0.56,
      performanceAtScale: 0.88,
      emergentBehavior: 0.58,
      decision: "candidate",
      notes: "Named population summaries are cheap and inspectable but need field backing to feel spatial."
    },
    selected: "field-population-hybrid",
    selectedReason: "Use fields for microbial ecology and named population records for notable visible blooms."
  };
}

export function makeMicrobialArray(length, value) {
  var values;

  if (PS.core && typeof PS.core.makeFloatFieldArray === "function") {
    return PS.core.makeFloatFieldArray(length, value);
  }

  values = new Float32Array(Math.max(0, Math.round(Number(length) || 0)));
  if (Number(value) !== 0) {
    values.fill(Number(value) || 0);
  }
  return values;
}

export function normalizeMicrobialField(fields, name, cellCount) {
  if (PS.core && typeof PS.core.normalizeFloatField === "function") {
    PS.core.normalizeFloatField(fields, name, cellCount, makeMicrobialArray);
    return;
  }

  fields[name] = makeMicrobialArray(cellCount, 0);
}

export function getMicrobialInitialState() {
  var cellCount = MICROBIAL_FIELD_WIDTH * MICROBIAL_FIELD_HEIGHT;

  return {
    model: "field-population-hybrid",
    ageTicks: 0,
    fieldWidth: MICROBIAL_FIELD_WIDTH,
    fieldHeight: MICROBIAL_FIELD_HEIGHT,
    fields: {
      density: makeMicrobialArray(cellCount, 0),
      chemicalEnergy: makeMicrobialArray(cellCount, 0),
      oxygenProduction: makeMicrobialArray(cellCount, 0),
      stress: makeMicrobialArray(cellCount, 0),
      bloomIntensity: makeMicrobialArray(cellCount, 0)
    },
    populations: [],
    populationById: {},
    nextPopulationId: 1,
    visibleBlooms: [],
    prototypeEvaluation: getMicrobialPrototypeEvaluation(),
    selectedPrototype: "field-population-hybrid",
    lastUpdatedTick: 0
  };
}

export function ensureMicrobialState() {
  var cellCount;

  if (!world.microbial || !world.microbial.fields) {
    world.microbial = getMicrobialInitialState();
  }

  world.microbial.fieldWidth = Math.max(1, Math.round(Number(world.microbial.fieldWidth) || MICROBIAL_FIELD_WIDTH));
  world.microbial.fieldHeight = Math.max(1, Math.round(Number(world.microbial.fieldHeight) || MICROBIAL_FIELD_HEIGHT));
  cellCount = world.microbial.fieldWidth * world.microbial.fieldHeight;
  world.microbial.fields = world.microbial.fields || {};
  normalizeMicrobialField(world.microbial.fields, "density", cellCount);
  normalizeMicrobialField(world.microbial.fields, "chemicalEnergy", cellCount);
  normalizeMicrobialField(world.microbial.fields, "oxygenProduction", cellCount);
  normalizeMicrobialField(world.microbial.fields, "stress", cellCount);
  normalizeMicrobialField(world.microbial.fields, "bloomIntensity", cellCount);

  if (!Array.isArray(world.microbial.populations)) {
    world.microbial.populations = [];
  }

  if (!world.microbial.populationById) {
    rebuildMicrobialPopulationIndex(world.microbial);
  }

  if (typeof world.microbial.nextPopulationId !== "number" || world.microbial.nextPopulationId < 1) {
    world.microbial.nextPopulationId = 1;
    rebuildMicrobialPopulationIndex(world.microbial);
  }

  if (!Array.isArray(world.microbial.visibleBlooms)) {
    world.microbial.visibleBlooms = [];
  }

  if (!world.microbial.prototypeEvaluation) {
    world.microbial.prototypeEvaluation = getMicrobialPrototypeEvaluation();
  }

  return world.microbial;
}

export function rebuildMicrobialPopulationIndex(state) {
  state.populationById = {};

  for (var i = 0; i < state.populations.length; i++) {
    var population = state.populations[i];
    state.populationById[String(population.id)] = population;

    if (population.id >= state.nextPopulationId) {
      state.nextPopulationId = population.id + 1;
    }
  }
}

export function getMicrobialCellIndex(cellX, cellY, state) {
  var x = clampMicrobial(Math.round(Number(cellX) || 0), 0, state.fieldWidth - 1);
  var y = clampMicrobial(Math.round(Number(cellY) || 0), 0, state.fieldHeight - 1);
  return y * state.fieldWidth + x;
}

export function getMicrobialCellForTile(tileX, tileY) {
  var state = ensureMicrobialState();
  var cellX = Math.floor((Number(tileX) || 0) / Math.max(1, WORLD_WIDTH) * state.fieldWidth);
  var cellY = Math.floor((Number(tileY) || 0) / Math.max(1, WORLD_HEIGHT) * state.fieldHeight);
  var index = getMicrobialCellIndex(cellX, cellY, state);

  return {
    index: index,
    cellX: cellX,
    cellY: cellY,
    density: state.fields.density[index],
    chemicalEnergy: state.fields.chemicalEnergy[index],
    oxygenProduction: state.fields.oxygenProduction[index],
    stress: state.fields.stress[index],
    bloomIntensity: state.fields.bloomIntensity[index]
  };
}

export function getMicrobialHydrothermalEnergy(cellX, cellY, state) {
  var geology = world.geology || {};
  var ventBoost = Math.max(0, Number(geology.hydrothermalVents) || 0) / 24;
  var volcanicBoost = Math.max(0, Number(geology.volcanicActivity) || 0) * 0.45;
  var seed = state.seedHash || (world.rngState || 1);
  var noise = getMicrobialNoise(cellX, cellY, seed);

  return clampMicrobial(0.08 + noise * 0.24 + ventBoost + volcanicBoost, 0, 1);
}

export function getMicrobialStress(cellX, cellY) {
  var atmosphere = world.atmosphere || {};
  var temperature = Number(atmosphere.temperatureC);
  var oxygen = atmosphere.gases ? Number(atmosphere.gases.o2) || 0 : Number(atmosphere.oxygen) || 0;
  var temperatureStress = Number.isFinite(temperature) ? Math.abs(temperature - 35) / 90 : 0.2;
  var oxygenStress = clampMicrobial(oxygen / 0.24, 0, 1) * 0.18;
  var latitudeStress = Math.abs((cellY / Math.max(1, MICROBIAL_FIELD_HEIGHT - 1)) - 0.5) * 0.16;

  return clampMicrobial(temperatureStress + oxygenStress + latitudeStress, 0, 1);
}

export function updateMicrobialFields(state, dt) {
  var timeStep = Math.max(0.25, Math.min(4, (Number(dt) || 16) / 1000));
  var totalDensity = 0;
  var totalOxygen = 0;

  for (var y = 0; y < state.fieldHeight; y++) {
    for (var x = 0; x < state.fieldWidth; x++) {
      var index = getMicrobialCellIndex(x, y, state);
      var energy = getMicrobialHydrothermalEnergy(x, y, state);
      var stress = getMicrobialStress(x, y);
      var density = Math.max(0, Number(state.fields.density[index]) || 0);

      if (density <= 0 && energy > 0.32 && stress < 0.72) {
        density = energy * 0.16;
      }

      density += (density * (energy * 0.18 - stress * 0.08) + energy * 0.006) * timeStep;
      density = clampMicrobial(density, 0, 1);

      state.fields.chemicalEnergy[index] = energy;
      state.fields.stress[index] = stress;
      state.fields.density[index] = density;
      state.fields.oxygenProduction[index] = density * Math.max(0, 1 - stress) * 0.018;
      state.fields.bloomIntensity[index] = clampMicrobial(density * (1 - stress * 0.55) + energy * 0.12, 0, 1);
      totalDensity += density;
      totalOxygen += state.fields.oxygenProduction[index];
    }
  }

  state.totalDensity = totalDensity;
  state.totalOxygenProduction = totalOxygen;
}

export function getTopMicrobialBloomCells(state) {
  var cells = [];

  for (var y = 0; y < state.fieldHeight; y++) {
    for (var x = 0; x < state.fieldWidth; x++) {
      var index = getMicrobialCellIndex(x, y, state);
      var bloom = state.fields.bloomIntensity[index];

      if (bloom >= 0.28) {
        cells.push({
          index: index,
          cellX: x,
          cellY: y,
          bloomIntensity: bloom,
          density: state.fields.density[index],
          chemicalEnergy: state.fields.chemicalEnergy[index],
          oxygenProduction: state.fields.oxygenProduction[index],
          stress: state.fields.stress[index]
        });
      }
    }
  }

  cells.sort(function(a, b) {
    return b.bloomIntensity - a.bloomIntensity || a.index - b.index;
  });

  return cells.slice(0, MICROBIAL_MAX_POPULATIONS);
}

export function syncMicrobialPopulations(state) {
  var blooms = getTopMicrobialBloomCells(state);
  var populations = [];

  for (var i = 0; i < blooms.length; i++) {
    var bloom = blooms[i];
    var existing = state.populations[i] || null;
    var id = existing ? existing.id : state.nextPopulationId++;
    var worldX = Math.round((bloom.cellX + 0.5) / state.fieldWidth * WORLD_WIDTH);
    var worldY = Math.round((bloom.cellY + 0.5) / state.fieldHeight * WORLD_HEIGHT);
    var morphology = bloom.bloomIntensity > 0.66 ? "stromatolite" : (bloom.density > 0.45 ? "mat" : "bloom");

    populations.push({
      id: id,
      name: "Microbial " + morphology + " " + id,
      lineageId: "microbial-" + id,
      x: clampMicrobial(worldX, 0, WORLD_WIDTH - 1),
      y: clampMicrobial(worldY, 0, WORLD_HEIGHT - 1),
      cellX: bloom.cellX,
      cellY: bloom.cellY,
      density: bloom.density,
      chemicalEnergy: bloom.chemicalEnergy,
      oxygenProduction: bloom.oxygenProduction,
      stress: bloom.stress,
      bloomIntensity: bloom.bloomIntensity,
      morphology: morphology,
      isVisible: true,
      lastUpdatedTick: world.tick
    });
  }

  state.populations = populations;
  state.visibleBlooms = populations.map(function(population) {
    return {
      id: population.id,
      x: population.x,
      y: population.y,
      intensity: population.bloomIntensity,
      morphology: population.morphology
    };
  });
  rebuildMicrobialPopulationIndex(state);
}

export function applyMicrobialAtmosphereOutput(state) {
  if (!world.atmosphere || !world.atmosphere.gases) {
    return;
  }

  var oxygen = Math.min(0.006, state.totalOxygenProduction * 0.0002);
  world.atmosphere.gases.o2 += oxygen;
  world.atmosphere.gases.co2 = Math.max(0, world.atmosphere.gases.co2 - oxygen * 0.45);

  if (typeof normalizeAtmosphereGases === "function") {
    normalizeAtmosphereGases(world.atmosphere);
  }
}

export function updateMicrobialEpoch(dt) {
  var state = ensureMicrobialState();

  state.ageTicks++;
  state.seedHash = state.seedHash || (world.rngState || 1);
  updateMicrobialFields(state, dt);
  syncMicrobialPopulations(state);
  applyMicrobialAtmosphereOutput(state);
  state.lastUpdatedTick = world.tick;
  world.microbialReady = state.totalDensity > 0.1;
  return state;
}

PS.epochs.microbial = {
  ensureState: ensureMicrobialState,
  getCellForTile: getMicrobialCellForTile,
  evaluatePrototypes: getMicrobialPrototypeEvaluation,
  update: updateMicrobialEpoch
};

PS.epochs.register("microbial", {
  family: "epoch",
  watcherOutputs: ["overlays", "timeline", "inspect"],
  enter: function() {
    ensureMicrobialState();
  },
  detect: function() {
    return world.era === "microbial" || world.microbialReady === true;
  },
  update: function(dt) {
    return updateMicrobialEpoch(dt);
  }
});
