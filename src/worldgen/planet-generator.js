"use strict";

var tectonics = require("./tectonics-adapter");
var erosion = require("./erosion");
var rivers = require("./rivers");

async function generatePlanet(seed, params) {
  var options = params || {};
  var startedAt = Date.now();
  var tectonic = await tectonics.runTectonicsjs(seed, options);
  var width = tectonic.metadata.width;
  var height = tectonic.metadata.height;
  var eroded = erosion.runErosion(tectonic.elevation, width, height, {
    ocean_mask: tectonic.ocean_mask,
    erosion_passes: options.erosion_passes,
    drainage_threshold: options.drainage_threshold
  });
  var riverNetwork = rivers.computeRiverNetwork(eroded.elevation, width, height, {
    ocean_mask: tectonic.ocean_mask,
    drainage_threshold: options.drainage_threshold
  });
  var elapsedMs = Date.now() - startedAt;

  return {
    elevation: eroded.elevation,
    ocean_mask: tectonic.ocean_mask,
    plate_bounds: tectonic.boundaries,
    fault_lines: tectonic.faults,
    volcanic_activity: tectonic.volcanic,
    rivers: riverNetwork.river_mask,
    river_network: riverNetwork,
    metadata: {
      seed: String(seed),
      width: width,
      height: height,
      generation_ms: elapsedMs,
      generation_budget_ms: 5 * 60 * 1000,
      elevation: tectonics.createElevationTextureDescriptor(width, height),
      tectonics: tectonic.metadata,
      erosion: eroded.metadata,
      rivers: riverNetwork.metadata
    }
  };
}

function summarizePlanet(planet) {
  var elevation = planet.elevation;
  var ocean = planet.ocean_mask;
  var riversMask = planet.rivers;
  var land = 0;
  var water = 0;
  var mountains = 0;
  var abyssal = 0;
  var riverCells = 0;
  var min = Infinity;
  var max = -Infinity;

  for (var i = 0; i < elevation.length; i += 1) {
    var value = Number(elevation[i]) || 0;
    min = Math.min(min, value);
    max = Math.max(max, value);
    if (ocean[i]) { water += 1; } else { land += 1; }
    if (value > 1800) { mountains += 1; }
    if (value < -4500) { abyssal += 1; }
    if (riversMask[i]) { riverCells += 1; }
  }

  return {
    width: planet.metadata.width,
    height: planet.metadata.height,
    minElevationM: min,
    maxElevationM: max,
    landRatio: land / Math.max(1, land + water),
    waterRatio: water / Math.max(1, land + water),
    mountainCells: mountains,
    abyssalCells: abyssal,
    riverCells: riverCells
  };
}

module.exports = {
  generatePlanet: generatePlanet,
  summarizePlanet: summarizePlanet
};
