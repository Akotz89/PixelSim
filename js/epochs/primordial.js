"use strict";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getPlanetTile } from "../render/planet-grid.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

PS.epochs = PS.epochs || {};

export var PRIMORDIAL_FIELD_WIDTH = 32;
export var PRIMORDIAL_FIELD_HEIGHT = 18;
export var PRIMORDIAL_THRESHOLD = 1.0;
export var PRIMORDIAL_MAX_SITES = 8;

export function clampPrimordial(value, min, max) {
  return PS.math && typeof PS.math.clamp === "function" ? PS.math.clamp(value, min, max) : Math.max(min, Math.min(max, value));
}

export function getPrimordialNoise(a, b, c) {
  return PS.math && typeof PS.math.deterministicUnitNoise === "function" ? PS.math.deterministicUnitNoise(a, b, c) : 0;
}

export function makePrimordialArray(length, value) {
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

export function normalizePrimordialField(fields, name, cellCount) {
  if (PS.core && typeof PS.core.normalizeFloatField === "function") {
    PS.core.normalizeFloatField(fields, name, cellCount, makePrimordialArray);
    return;
  }

  fields[name] = makePrimordialArray(cellCount, 0);
}

export function getPrimordialInitialState() {
  var cellCount = PRIMORDIAL_FIELD_WIDTH * PRIMORDIAL_FIELD_HEIGHT;

  return {
    ageTicks: 0,
    fieldWidth: PRIMORDIAL_FIELD_WIDTH,
    fieldHeight: PRIMORDIAL_FIELD_HEIGHT,
    threshold: PRIMORDIAL_THRESHOLD,
    fields: {
      complexity: makePrimordialArray(cellCount, 0),
      lightning: makePrimordialArray(cellCount, 0),
      hydrothermal: makePrimordialArray(cellCount, 0),
      uv: makePrimordialArray(cellCount, 0),
      tidalPools: makePrimordialArray(cellCount, 0),
      soupIntensity: makePrimordialArray(cellCount, 0)
    },
    sites: [],
    protoOrganisms: [],
    nextSiteId: 1,
    ready: false,
    transitionEmitted: false,
    lastUpdatedTick: 0
  };
}

export function ensurePrimordialState() {
  var state = world.abiogenesis;
  var cellCount;

  if (!state || !state.fields) {
    state = getPrimordialInitialState();
    world.abiogenesis = state;
  }

  state.fieldWidth = Math.max(1, Math.round(Number(state.fieldWidth) || PRIMORDIAL_FIELD_WIDTH));
  state.fieldHeight = Math.max(1, Math.round(Number(state.fieldHeight) || PRIMORDIAL_FIELD_HEIGHT));
  state.threshold = Math.max(0.1, Number(state.threshold) || PRIMORDIAL_THRESHOLD);
  cellCount = state.fieldWidth * state.fieldHeight;

  state.fields = state.fields || {};
  ["complexity", "lightning", "hydrothermal", "uv", "tidalPools", "soupIntensity"].forEach(function(field) {
    normalizePrimordialField(state.fields, field, cellCount);
  });

  if (!Array.isArray(state.sites)) {
    state.sites = [];
  }

  if (!Array.isArray(state.protoOrganisms)) {
    state.protoOrganisms = [];
  }

  state.nextSiteId = Math.max(1, Math.round(Number(state.nextSiteId) || 1));
  return state;
}

export function getPrimordialCellIndex(cellX, cellY, state) {
  var x = clampPrimordial(Math.round(Number(cellX) || 0), 0, state.fieldWidth - 1);
  var y = clampPrimordial(Math.round(Number(cellY) || 0), 0, state.fieldHeight - 1);
  return y * state.fieldWidth + x;
}

export function getPrimordialCellForTile(tileX, tileY) {
  var state = ensurePrimordialState();
  var cellX = Math.floor((Number(tileX) || 0) / Math.max(1, WORLD_WIDTH) * state.fieldWidth);
  var cellY = Math.floor((Number(tileY) || 0) / Math.max(1, WORLD_HEIGHT) * state.fieldHeight);
  var index = getPrimordialCellIndex(cellX, cellY, state);

  return {
    index: index,
    cellX: cellX,
    cellY: cellY,
    complexity: state.fields.complexity[index],
    lightning: state.fields.lightning[index],
    hydrothermal: state.fields.hydrothermal[index],
    uv: state.fields.uv[index],
    tidalPools: state.fields.tidalPools[index],
    soupIntensity: state.fields.soupIntensity[index]
  };
}

export function getPrimordialTileSignals(cellX, cellY, state) {
  var seed = state.seedHash || (world.rngState || 1);
  var tileX = Math.floor((cellX + 0.5) / state.fieldWidth * Math.max(1, WORLD_WIDTH));
  var tileY = Math.floor((cellY + 0.5) / state.fieldHeight * Math.max(1, WORLD_HEIGHT));
  var tile = typeof getPlanetTile === "function" ? getPlanetTile(tileX, tileY) : null;
  var atmosphere = world.atmosphere || {};
  var geology = world.geology || {};
  var gases = atmosphere.gases || {};
  var temperature = Number.isFinite(Number(atmosphere.temperatureC)) ? Number(atmosphere.temperatureC) : 38;
  var water = Math.max(Number(gases.h2o) || 0, Number(atmosphere.waterVapor) || 0);
  var ozone = Math.max(Number(gases.o3) || 0, Number(atmosphere.ozone) || 0);
  var elevation = tile && Number.isFinite(Number(tile.elevation)) ? Number(tile.elevation) : getPrimordialNoise(cellX, cellY, seed) - 0.35;
  var shallowWater = tile && Number.isFinite(Number(tile.shallowWater)) ? Number(tile.shallowWater) : clampPrimordial(0.42 - elevation, 0, 1);
  var coast = tile && Number.isFinite(Number(tile.coastFactor)) ? Number(tile.coastFactor) : getPrimordialNoise(cellX, cellY, seed + 17);
  var volcanic = Math.max(0, Number(geology.volcanicActivity) || 0);
  var vents = Math.max(0, Number(geology.hydrothermalVents) || 0);
  var warm = clampPrimordial(1 - Math.abs(temperature - 42) / 70, 0, 1);

  return {
    lightning: clampPrimordial((0.18 + water * 12 + volcanic * 0.22) * getPrimordialNoise(cellX, cellY, seed + 31), 0, 1),
    hydrothermal: clampPrimordial(volcanic * 0.34 + vents / 32 + shallowWater * 0.22 + getPrimordialNoise(cellX, cellY, seed + 43) * 0.18, 0, 1),
    uv: clampPrimordial((1 - ozone * 14) * (0.22 + getPrimordialNoise(cellX, cellY, seed + 59) * 0.62), 0, 1),
    tidalPools: clampPrimordial(coast * 0.42 + shallowWater * 0.38 + warm * 0.28, 0, 1),
    warmShallowWater: clampPrimordial(shallowWater * warm, 0, 1),
    x: tileX,
    y: tileY
  };
}

export function makeAbiogenesisSite(state, cellX, cellY, index, signals) {
  var existing = state.sites.filter(function(site) {
    return site.cellX === cellX && site.cellY === cellY;
  })[0];
  var site;

  if (existing) {
    return existing;
  }

  site = {
    id: state.nextSiteId++,
    cellX: cellX,
    cellY: cellY,
    x: clampPrimordial(signals.x, 0, WORLD_WIDTH - 1),
    y: clampPrimordial(signals.y, 0, WORLD_HEIGHT - 1),
    complexity: state.fields.complexity[index],
    sourceMix: {
      lightning: signals.lightning,
      hydrothermal: signals.hydrothermal,
      uv: signals.uv,
      tidalPools: signals.tidalPools
    },
    spawnedTick: world.tick,
    morphology: signals.hydrothermal > signals.tidalPools ? "vent protocell" : "tidal protocell"
  };

  state.sites.push(site);
  state.protoOrganisms.push({
    id: "proto-" + site.id,
    siteId: site.id,
    x: site.x,
    y: site.y,
    cellX: cellX,
    cellY: cellY,
    complexity: site.complexity,
    morphology: site.morphology,
    bornTick: world.tick
  });

  if (Array.isArray(world.biologyPopulations)) {
    world.biologyPopulations.push({
      id: Math.max(1, Math.round(Number(world.nextBiologyPopulationId) || 1)),
      lineageId: "abiogenesis-" + site.id,
      speciesId: "proto-life",
      label: "Proto-life site " + site.id,
      population: 1,
      x: site.x,
      y: site.y,
      morphology: site.morphology,
      source: "abiogenesis",
      createdTick: world.tick
    });
    world.nextBiologyPopulationId = Math.max(1, Math.round(Number(world.nextBiologyPopulationId) || 1)) + 1;
  }

  return site;
}

export function emitAbiogenesisTransition(site) {
  if (PS.events && typeof PS.events.emit === "function") {
    PS.events.emit(PS.events.types.EPOCH_TRANSITION, {
      from: "primordial",
      to: "microbial",
      siteId: site.id,
      tick: world.tick
    });
  }

  if (PS.events && typeof PS.events.emitMilestone === "function") {
    PS.events.emitMilestone({
      type: "abiogenesis.first-life",
      label: "First life",
      detail: site.morphology + " emerged from chemical soup.",
      category: "biology",
      severity: "major",
      inspectTarget: { type: "tile", x: site.x, y: site.y },
      source: "abiogenesis"
    });
  }
}

export function updatePrimordialEpoch(dt) {
  var state = ensurePrimordialState();
  var timeStep = Math.max(0.25, Math.min(4, (Number(dt) || 16) / 1000));
  var bestSite = null;

  state.ageTicks++;
  state.seedHash = state.seedHash || (world.rngState || 1);

  for (var y = 0; y < state.fieldHeight; y++) {
    for (var x = 0; x < state.fieldWidth; x++) {
      var index = getPrimordialCellIndex(x, y, state);
      var signals = getPrimordialTileSignals(x, y, state);
      var source = signals.lightning * 0.20 + signals.hydrothermal * 0.34 + signals.uv * 0.18 + signals.tidalPools * 0.28;
      var soup = clampPrimordial(signals.warmShallowWater * (0.25 + source * 0.75), 0, 1);
      var complexity = Math.max(0, Number(state.fields.complexity[index]) || 0);

      complexity += source * soup * 0.014 * timeStep;
      complexity = clampPrimordial(complexity, 0, state.threshold * 1.35);
      state.fields.lightning[index] = signals.lightning;
      state.fields.hydrothermal[index] = signals.hydrothermal;
      state.fields.uv[index] = signals.uv;
      state.fields.tidalPools[index] = signals.tidalPools;
      state.fields.soupIntensity[index] = clampPrimordial(soup * Math.min(1, complexity / state.threshold), 0, 1);
      state.fields.complexity[index] = complexity;

      if (complexity >= state.threshold && state.sites.length < PRIMORDIAL_MAX_SITES) {
        bestSite = makeAbiogenesisSite(state, x, y, index, signals);
      }
    }
  }

  state.ready = state.sites.length > 0;
  state.lastUpdatedTick = world.tick;

  if (state.ready && !state.transitionEmitted) {
    state.transitionEmitted = true;
    world.microbialReady = true;
    emitAbiogenesisTransition(bestSite || state.sites[0]);
    if (PS.epochs && typeof PS.epochs.setEra === "function") {
      PS.epochs.setEra("microbial");
    } else {
      world.era = "microbial";
    }
  }

  return state;
}

export function getPrimordialSoupIntensityForTile(tile) {
  if (!tile || !world.abiogenesis || !world.abiogenesis.fields) {
    return 0;
  }

  return getPrimordialCellForTile(tile.x || 0, tile.y || 0).soupIntensity;
}

PS.epochs.primordial = {
  ensureState: ensurePrimordialState,
  getCellForTile: getPrimordialCellForTile,
  getSoupIntensityForTile: getPrimordialSoupIntensityForTile,
  detect: function() {
    var state = ensurePrimordialState();
    return state.ready || state.fields.complexity.some(function(value) {
      return value >= state.threshold;
    });
  },
  update: updatePrimordialEpoch
};

PS.epochs.register("primordial", {
  family: "epoch",
  watcherOutputs: ["overlays", "timeline", "inspect"],
  enter: function() {
    ensurePrimordialState();
  },
  detect: function() {
    return world.era === "primordial" && !PS.epochs.primordial.detect();
  },
  update: function(dt) {
    return updatePrimordialEpoch(dt);
  }
});
