"use strict";
function getGeologyConfig() {
  var constants = typeof CONFIG !== "undefined" ? CONFIG : {};

  return {
    plateMin: Math.max(1, Math.round(Number(constants.GEOLOGY_PLATE_MIN) || 6)),
    plateMax: Math.max(1, Math.round(Number(constants.GEOLOGY_PLATE_MAX) || 12)),
    driftRate: Math.max(0, Number(constants.GEOLOGY_DRIFT_RATE_TILES_PER_MY) || 0.018),
    erosionRate: Math.max(0, Number(constants.GEOLOGY_EROSION_RATE) || 0.0007),
    sedimentRate: Math.max(0, Number(constants.GEOLOGY_SEDIMENT_RATE) || 0.0005)
  };
}

function hashGeologySeed(seedText) {
  if (PS.math && typeof PS.math.hashSeedText === "function") {
    return PS.math.hashSeedText(seedText);
  }

  var hash = 2166136261;
  var text = String(seedText || "PIXELDARIUM");

  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0 || 1;
}

function getGeologyNoise(a, b, c) {
  if (PS.math && typeof PS.math.deterministicUnitNoise === "function") {
    return PS.math.deterministicUnitNoise(a, b, c);
  }

  var value = Math.sin((Number(a) || 0) * 12.9898 + (Number(b) || 0) * 78.233 + (Number(c) || 0) * 37.719) * 43758.5453;

  return value - Math.floor(value);
}

function clampGeology(value, min, max) {
  if (PS.math && typeof PS.math.clamp === "function") {
    return PS.math.clamp(value, min, max);
  }

  return Math.max(min, Math.min(max, value));
}

function getGeologyWorldSize() {
  return {
    width: Math.max(1, typeof WORLD_WIDTH === "number" ? WORLD_WIDTH : 320),
    height: Math.max(1, typeof WORLD_HEIGHT === "number" ? WORLD_HEIGHT : 170)
  };
}

function makeGeologyPlates(seedHash, config) {
  var size = getGeologyWorldSize();
  var minPlates = Math.min(config.plateMin, config.plateMax);
  var maxPlates = Math.max(config.plateMin, config.plateMax);
  var count = minPlates + (seedHash % (maxPlates - minPlates + 1));
  var plates = [];

  for (var i = 0; i < count; i++) {
    var angle = getGeologyNoise(i, 17, seedHash) * Math.PI * 2;
    var speed = config.driftRate * (0.55 + getGeologyNoise(i, 29, seedHash) * 0.9);
    var oceanicRatio = getGeologyNoise(i, 41, seedHash);

    plates.push({
      id: "plate-" + (i + 1),
      centerX: getGeologyNoise(i, 53, seedHash) * size.width,
      centerY: (0.08 + getGeologyNoise(i, 67, seedHash) * 0.84) * size.height,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      driftX: 0,
      driftY: 0,
      type: oceanicRatio > 0.58 ? "oceanic" : "continental",
      oceanicRatio: oceanicRatio,
      crustAgeMy: 30 + Math.round(getGeologyNoise(i, 79, seedHash) * 170)
    });
  }

  if (plates.length > 1 && plates[0].type === plates[1].type) {
    plates[1].type = plates[0].type === "oceanic" ? "continental" : "oceanic";
    plates[1].oceanicRatio = plates[1].type === "oceanic" ? 0.75 : 0.25;
  }

  return plates;
}

function classifyGeologyBoundary(plateA, plateB, index) {
  if (plateA.type !== plateB.type) {
    return "subduction";
  }

  if (index % 4 === 0) {
    return "collision";
  }

  if (index % 4 === 1) {
    return "rift";
  }

  return index % 4 === 2 ? "transform" : "collision";
}

function updateGeologyBoundaries(state) {
  var plates = state.plates || [];
  var size = getGeologyWorldSize();
  var boundaries = [];
  var collision = 0;
  var subduction = 0;
  var volcanic = 0;

  for (var i = 0; i < plates.length; i++) {
    var plateA = plates[i];
    var plateB = plates[(i + 1) % plates.length];
    var convergence = Math.abs(plateA.velocityX - plateB.velocityX) + Math.abs(plateA.velocityY - plateB.velocityY);
    var type = classifyGeologyBoundary(plateA, plateB, i);
    var activity = clampGeology(convergence / Math.max(0.001, state.config.driftRate * 2), 0.05, 1);

    if (type === "collision") {
      collision += activity;
    }

    if (type === "subduction") {
      subduction += activity;
      volcanic += activity * 0.65;
    }

    if (type === "rift") {
      volcanic += activity * 0.32;
    }

    boundaries.push({
      plateA: plateA.id,
      plateB: plateB.id,
      type: type,
      activity: activity,
      x: (plateA.centerX + plateA.driftX + plateB.centerX + plateB.driftX) * 0.5 % size.width,
      y: clampGeology((plateA.centerY + plateA.driftY + plateB.centerY + plateB.driftY) * 0.5, 0, size.height - 1),
      mountainLift: type === "collision" ? activity : activity * 0.18,
      subductionDepth: type === "subduction" ? 25 + activity * 95 : 0
    });
  }

  state.boundaries = boundaries;
  state.collisionZones = collision;
  state.subductionZones = subduction;
  state.tectonicActivity = clampGeology((collision + subduction) / Math.max(1, boundaries.length), 0, 1);
  state.volcanicActivity = clampGeology((volcanic + state.hotspots.length * 0.12) / Math.max(1, boundaries.length), 0, 1);
  state.hydrothermalVents = Math.round(boundaries.filter(function(boundary) {
    return boundary.type === "rift" || boundary.type === "subduction";
  }).length * (1 + state.volcanicActivity));
}

function makeGeologyHotspots(seedHash) {
  var size = getGeologyWorldSize();
  var hotspots = [];
  var count = 3 + (seedHash % 3);

  for (var i = 0; i < count; i++) {
    hotspots.push({
      id: "hotspot-" + (i + 1),
      x: getGeologyNoise(i, 101, seedHash) * size.width,
      y: getGeologyNoise(i, 109, seedHash) * size.height,
      activity: 0.35 + getGeologyNoise(i, 113, seedHash) * 0.6
    });
  }

  return hotspots;
}

function findNearestGeologyPlate(x, y, plates) {
  var size = getGeologyWorldSize();
  var bestPlate = plates[0] || null;
  var bestDistance = Infinity;

  for (var i = 0; i < plates.length; i++) {
    var plate = plates[i];
    var dxRaw = Math.abs((Number(x) || 0) - (plate.centerX + plate.driftX));
    var dx = Math.min(dxRaw, size.width - dxRaw);
    var dy = (Number(y) || 0) - (plate.centerY + plate.driftY);
    var distance = dx * dx + dy * dy;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestPlate = plate;
    }
  }

  return bestPlate;
}

function annotateGeologyTiles(state) {
  if (!Array.isArray(world.planetTiles) || world.planetTiles.length === 0 || !state.plates.length) {
    return;
  }

  var size = getGeologyWorldSize();
  var sampleLimit = Math.min(world.planetTiles.length, 512);
  var step = Math.max(1, Math.floor(world.planetTiles.length / sampleLimit));
  var continentalTiles = 0;
  var sampledTiles = 0;

  for (var i = 0; i < world.planetTiles.length; i += step) {
    var tile = world.planetTiles[i];
    var x = typeof tile.x === "number" ? tile.x : i % size.width;
    var y = typeof tile.y === "number" ? tile.y : Math.floor(i / size.width);
    var plate = findNearestGeologyPlate(x, y, state.plates);
    var boundary = state.boundaries[i % Math.max(1, state.boundaries.length)];
    var stress = boundary ? boundary.activity : state.tectonicActivity;
    var elevation = Number(tile.elevation) || 0;

    tile.tectonicPlateId = plate ? plate.id : null;
    tile.tectonicStress = stress;
    tile.volcanicActivity = boundary && (boundary.type === "subduction" || boundary.type === "rift") ? stress : state.volcanicActivity * 0.25;
    tile.erosionRate = clampGeology(Math.max(0, elevation) * state.config.erosionRate + stress * 0.0002, 0, 1);
    tile.geologyElevationDelta = boundary && boundary.type === "collision" ? boundary.mountainLift * 0.02 : -tile.erosionRate;

    if (plate && plate.type === "continental") {
      continentalTiles++;
    }

    sampledTiles++;
  }

  state.continentalArea = sampledTiles > 0 ? continentalTiles / sampledTiles : state.continentalArea;
}

PS.layers.geology = PS.layers.register("geology", {
  family: "planet",
  alwaysOn: true,
  watcherOutputs: ["terrain", "overlays", "timeline", "inspect"],
  ensureState: function() {
    if (!world.geology || !Array.isArray(world.geology.plates)) {
      var config = getGeologyConfig();
      var seedHash = hashGeologySeed(world.seedText || "PIXELDARIUM");

      world.geology = {
        ageTicks: 0,
        geologicalTimeMy: 0,
        seedHash: seedHash,
        config: config,
        plates: makeGeologyPlates(seedHash, config),
        boundaries: [],
        hotspots: makeGeologyHotspots(seedHash),
        collisionZones: 0,
        subductionZones: 0,
        tectonicActivity: 0,
        volcanicActivity: 0,
        hydrothermalVents: 0,
        mountainMass: 0,
        erosionSediment: 0,
        basinSediment: 0,
        continentalArea: 0,
        continentFormation: 0,
        lastMilestoneTick: 0
      };

      updateGeologyBoundaries(world.geology);
      annotateGeologyTiles(world.geology);
    }

    return world.geology;
  },
  update: function(dt) {
    var state = this.ensureState();
    var deltaMs = Math.max(0, Number(dt) || 0);
    var timeStepMy = deltaMs > 0 ? deltaMs / 1000 : 1 / 30;

    state.ageTicks += 1;
    state.geologicalTimeMy += timeStepMy;
    state.lastDeltaMs = deltaMs;

    for (var i = 0; i < state.plates.length; i++) {
      var plate = state.plates[i];

      plate.driftX += plate.velocityX * timeStepMy;
      plate.driftY += plate.velocityY * timeStepMy;
      plate.crustAgeMy += timeStepMy;
    }

    updateGeologyBoundaries(state);
    state.mountainMass = Math.max(0, state.mountainMass + state.collisionZones * 0.02 - state.config.erosionRate * state.mountainMass);
    state.erosionSediment += state.mountainMass * state.config.erosionRate;
    state.basinSediment += state.erosionSediment * state.config.sedimentRate;
    state.continentFormation = clampGeology(state.continentFormation + state.collisionZones * 0.001 + state.basinSediment * 0.00001, 0, 1);
    annotateGeologyTiles(state);

    return state;
  },
  getState: function() {
    return this.ensureState();
  }
});
