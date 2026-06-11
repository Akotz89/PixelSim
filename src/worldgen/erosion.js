"use strict";

var rivers = require("./rivers");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function wrapX(x, width) {
  var w = Math.max(1, Math.round(Number(width) || 1));
  return ((Math.round(Number(x) || 0) % w) + w) % w;
}

function clampY(y, height) {
  return Math.max(0, Math.min(Math.max(1, height) - 1, Math.round(Number(y) || 0)));
}

function indexOf(x, y, width) {
  return y * width + wrapX(x, width);
}

function smoothPeaks(elevation, width, height, strength) {
  var next = new Float32Array(elevation.length);
  for (var y = 0; y < height; y += 1) {
    for (var x = 0; x < width; x += 1) {
      var cell = indexOf(x, y, width);
      var center = Number(elevation[cell]) || 0;
      var sum = 0;
      var count = 0;
      for (var dy = -1; dy <= 1; dy += 1) {
        for (var dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          sum += Number(elevation[indexOf(x + dx, clampY(y + dy, height), width)]) || 0;
          count += 1;
        }
      }
      var average = sum / Math.max(1, count);
      var peakWeight = center > 900 ? strength : strength * 0.25;
      next[cell] = center + (average - center) * peakWeight;
    }
  }
  return next;
}

function runErosion(elevation, width, height, options) {
  var spec = options || {};
  var passes = Math.max(0, Math.round(Number(spec.erosion_passes) || 2));
  var oceanMask = spec.ocean_mask || spec.oceanMask || null;
  var eroded = new Float32Array(elevation);
  var beforeMax = -Infinity;
  var afterMax = -Infinity;

  for (var i = 0; i < eroded.length; i += 1) {
    beforeMax = Math.max(beforeMax, eroded[i]);
  }

  for (var pass = 0; pass < passes; pass += 1) {
    eroded = smoothPeaks(eroded, width, height, 0.14);
    var network = rivers.computeRiverNetwork(eroded, width, height, {
      ocean_mask: oceanMask,
      drainage_threshold: spec.drainage_threshold
    });
    for (var cell = 0; cell < eroded.length; cell += 1) {
      if (network.river_mask[cell]) {
        var cut = clamp(network.accumulation[cell] / Math.max(1, width * height) * 1600, 12, 140);
        eroded[cell] -= cut;
        var target = network.flow_to[cell];
        if (target >= 0 && oceanMask && oceanMask[target]) {
          eroded[target] += cut * 0.18;
        }
      }
    }
  }

  for (var j = 0; j < eroded.length; j += 1) {
    eroded[j] = clamp(eroded[j], -10000, 8849);
    afterMax = Math.max(afterMax, eroded[j]);
  }

  return {
    elevation: eroded,
    metadata: {
      erosion_passes: passes,
      before_max_m: beforeMax,
      after_max_m: afterMax,
      peak_reduction_m: Math.max(0, beforeMax - afterMax)
    }
  };
}

module.exports = {
  runErosion: runErosion,
  smoothPeaks: smoothPeaks
};
