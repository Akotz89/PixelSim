"use strict";
PS.epochs = PS.epochs || {};

var PRIMORDIAL_FIELD_WIDTH = 32;
var PRIMORDIAL_FIELD_HEIGHT = 18;
var PRIMORDIAL_THRESHOLD = 1.0;
var PRIMORDIAL_MAX_SITES = 8;

function clampPrimordial(value, min, max) {
  if (PS.math && typeof PS.math.clamp === "function") {
    return PS.math.clamp(value, min, max);
  }

  return Math.max(min, Math.min(max, value));
}

function getPrimordialNoise(a, b, c) {
  if (PS.math && typeof PS.math.deterministicUnitNoise === "function") {
    return PS.math.deterministicUnitNoise(a, b, c);
  }

  var value = Math.sin((Number(a) || 0) * 12.9898 + (Number(b) || 0) * 78.233 + (Number(c) || 0) * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function makePrimordialArray(length, value) {
  var values = [];

  for (var i = 0; i < length; i++) {
    values.push(value);
  }

  return values;
}

function getPrimordialInitialState() {
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

function ensurePrimordialState() {
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

  ["complexity", "lightning", "hydrothermal", "uv", "tidalPools", "soupIntensity"].forEach(function(field) {
    if (!Array.isArray(state.fields[field]) || state.fields[field].length !== cellCount) {
      state.fields[field] = makePrimordialArray(cellCount, 0);
    }
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

function getPrimordialCellIndex(cellX, cellY, state) {
  var x = clampPrimordial(Math.round(Number(cellX) || 0), 0, state.fieldWidth - 1);
  var y = clampPrimordial(Math.round(Number(cellY) || 0), 0, state.fieldHeight - 1);
  return y * state.fieldWidth + x;
}

function getPrimordialCellForTile(tileX, tileY) {
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

function getPrimordialTileSignals(cellX, cellY, state) {
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

function makeAbiogenesisSite(state, cellX, cellY, index, signals) {
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

function emitAbiogenesisTransition(site) {
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

function updatePrimordialEpoch(dt) {
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

function getPrimordialSoupIntensityForTile(tile) {
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
