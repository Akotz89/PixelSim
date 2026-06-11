"use strict";

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

var D8 = [
  { dx: -1, dy: -1, code: 1 },
  { dx: 0, dy: -1, code: 2 },
  { dx: 1, dy: -1, code: 4 },
  { dx: -1, dy: 0, code: 8 },
  { dx: 1, dy: 0, code: 16 },
  { dx: -1, dy: 1, code: 32 },
  { dx: 0, dy: 1, code: 64 },
  { dx: 1, dy: 1, code: 128 }
];

function computeFlowDirection(elevation, oceanMask, width, height) {
  var cells = width * height;
  var flowTo = new Int32Array(cells);
  var flowDirection = new Uint8Array(cells);
  flowTo.fill(-1);

  for (var y = 0; y < height; y += 1) {
    for (var x = 0; x < width; x += 1) {
      var cell = indexOf(x, y, width);
      var source = Number(elevation[cell]) || 0;
      var bestDrop = 0;
      var bestIndex = -1;
      var bestCode = 0;

      if (oceanMask && oceanMask[cell]) {
        continue;
      }

      for (var n = 0; n < D8.length; n += 1) {
        var neighbor = D8[n];
        var nx = wrapX(x + neighbor.dx, width);
        var ny = clampY(y + neighbor.dy, height);
        var ni = indexOf(nx, ny, width);
        var distance = neighbor.dx !== 0 && neighbor.dy !== 0 ? Math.SQRT2 : 1;
        var drop = (source - (Number(elevation[ni]) || 0)) / distance;
        if ((oceanMask && oceanMask[ni]) || drop > bestDrop) {
          bestDrop = drop;
          bestIndex = ni;
          bestCode = neighbor.code;
        }
      }

      flowTo[cell] = bestIndex;
      flowDirection[cell] = bestCode;
    }
  }

  return { flowTo: flowTo, flowDirection: flowDirection };
}

function computeRiverNetwork(elevation, width, height, options) {
  var spec = options || {};
  var oceanMask = spec.ocean_mask || spec.oceanMask || null;
  var cells = width * height;
  var flow = computeFlowDirection(elevation, oceanMask, width, height);
  var accumulation = new Float32Array(cells);
  var riverMask = new Uint8Array(cells);
  var riverMouths = new Uint8Array(cells);
  var order = [];
  var threshold = Math.max(3, Number(spec.drainage_threshold) || Math.sqrt(cells) * 0.9);
  var reachesOcean = 0;

  for (var i = 0; i < cells; i += 1) {
    accumulation[i] = oceanMask && oceanMask[i] ? 0 : 1;
    order.push(i);
  }

  order.sort(function(a, b) {
    return (Number(elevation[b]) || 0) - (Number(elevation[a]) || 0);
  });

  for (var o = 0; o < order.length; o += 1) {
    var cell = order[o];
    var target = flow.flowTo[cell];
    if (target >= 0) {
      accumulation[target] += accumulation[cell];
      if (oceanMask && oceanMask[target] && !(oceanMask && oceanMask[cell])) {
        riverMouths[target] = 1;
        reachesOcean += 1;
      }
    }
  }

  for (var r = 0; r < cells; r += 1) {
    if (!(oceanMask && oceanMask[r]) && accumulation[r] >= threshold) {
      riverMask[r] = 1;
    }
  }

  return {
    flow_to: flow.flowTo,
    flow_direction: flow.flowDirection,
    accumulation: accumulation,
    river_mask: riverMask,
    river_mouths: riverMouths,
    metadata: {
      algorithm: "D8-steepest-downhill",
      drainage_threshold: threshold,
      river_cells: Array.from(riverMask).reduce(function(sum, value) { return sum + value; }, 0),
      reaches_ocean: reachesOcean > 0
    }
  };
}

function validateRiverNetwork(network, elevation, oceanMask) {
  var riverMask = network && network.river_mask;
  var flowTo = network && network.flow_to;
  var downhill = 0;
  var checked = 0;
  var riverCells = 0;
  var reachesOcean = false;

  for (var i = 0; riverMask && i < riverMask.length; i += 1) {
    if (riverMask[i]) {
      riverCells += 1;
      var target = flowTo[i];
      if (target >= 0) {
        checked += 1;
        if ((Number(elevation[target]) || 0) <= (Number(elevation[i]) || 0) || (oceanMask && oceanMask[target])) {
          downhill += 1;
        }
        if (oceanMask && oceanMask[target]) {
          reachesOcean = true;
        }
      }
    }
  }

  return {
    valid: riverCells > 0 && checked > 0 && downhill === checked && (reachesOcean || !!(network && network.metadata && network.metadata.reaches_ocean)),
    riverCells: riverCells,
    checked: checked,
    downhill: downhill,
    reachesOcean: reachesOcean || !!(network && network.metadata && network.metadata.reaches_ocean)
  };
}

module.exports = {
  computeFlowDirection: computeFlowDirection,
  computeRiverNetwork: computeRiverNetwork,
  validateRiverNetwork: validateRiverNetwork,
  D8: D8
};
