"use strict";

function hashSeedText(seedText) {
  var text = String(seedText == null ? "PIXELDARIUM" : seedText);
  var hash = 2166136261;
  for (var i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function makePrng(seedText) {
  var state = hashSeedText(seedText);
  return function next() {
    state += 0x6D2B79F5;
    var value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function wrapX(x, width) {
  var w = Math.max(1, Math.round(Number(width) || 1));
  return ((Math.round(Number(x) || 0) % w) + w) % w;
}

function indexOf(x, y, width) {
  return y * width + wrapX(x, width);
}

function makePlates(seed, width, height, count) {
  var random = makePrng(String(seed) + ":plates");
  var plates = [];
  for (var i = 0; i < count; i += 1) {
    var angle = random() * Math.PI * 2;
    plates.push({
      id: i,
      x: random() * width,
      y: (0.08 + random() * 0.84) * height,
      vx: Math.cos(angle) * (0.35 + random() * 0.65),
      vy: Math.sin(angle) * (0.35 + random() * 0.65),
      continental: random() > 0.46,
      buoyancy: random()
    });
  }
  return plates;
}

function wrappedDeltaX(x, centerX, width) {
  var delta = x - centerX;
  if (delta > width / 2) { delta -= width; }
  if (delta < -width / 2) { delta += width; }
  return delta;
}

function findNearestPlate(x, y, plates, width) {
  var best = null;
  var second = null;
  for (var i = 0; i < plates.length; i += 1) {
    var plate = plates[i];
    var dx = wrappedDeltaX(x, plate.x, width);
    var dy = y - plate.y;
    var distanceSq = dx * dx + dy * dy;
    if (!best || distanceSq < best.distanceSq) {
      second = best;
      best = { plate: plate, distanceSq: distanceSq, dx: dx, dy: dy };
    } else if (!second || distanceSq < second.distanceSq) {
      second = { plate: plate, distanceSq: distanceSq, dx: dx, dy: dy };
    }
  }
  return { primary: best, secondary: second || best };
}

function boundaryFor(primary, secondary, maxDistance) {
  var gap = Math.abs(Math.sqrt(secondary.distanceSq) - Math.sqrt(primary.distanceSq));
  return clamp(1 - gap / Math.max(1, maxDistance), 0, 1);
}

function boundaryInteraction(primary, secondary) {
  var a = primary.plate;
  var b = secondary.plate;
  var nx = secondary.dx - primary.dx;
  var ny = secondary.dy - primary.dy;
  var length = Math.sqrt(nx * nx + ny * ny) || 1;
  nx /= length;
  ny /= length;
  var relativeX = a.vx - b.vx;
  var relativeY = a.vy - b.vy;
  var convergence = relativeX * nx + relativeY * ny;
  return {
    convergence: convergence,
    collision: Math.max(0, convergence),
    divergent: Math.max(0, -convergence),
    transform: Math.abs(relativeX * -ny + relativeY * nx)
  };
}

function runEmbeddedTectonics(seed, params) {
  var options = params || {};
  var width = Math.max(8, Math.round(Number(options.width) || 512));
  var height = Math.max(8, Math.round(Number(options.height) || 512));
  var steps = Math.max(1, Math.round(Number(options.tectonic_steps) || 500));
  var plateCount = Math.max(4, Math.round(Number(options.plate_count) || 12));
  var plates = makePlates(seed, width, height, plateCount);
  var elevation = new Float32Array(width * height);
  var oceanMask = new Uint8Array(width * height);
  var boundaries = new Float32Array(width * height);
  var faults = new Float32Array(width * height);
  var volcanic = new Float32Array(width * height);
  var plateIds = new Uint16Array(width * height);
  var maxDistance = Math.max(width, height) / Math.max(5, plateCount * 0.8);

  for (var y = 0; y < height; y += 1) {
    var latitude = Math.abs((y / Math.max(1, height - 1)) * 180 - 90);
    for (var x = 0; x < width; x += 1) {
      var nearest = findNearestPlate(x, y, plates, width);
      var primary = nearest.primary;
      var secondary = nearest.secondary;
      var plate = primary.plate;
      var interaction = boundaryInteraction(primary, secondary);
      var boundary = boundaryFor(primary, secondary, maxDistance);
      var local = Math.sin((x + hashSeedText(seed)) * 0.071) * Math.cos((y + plate.id * 17) * 0.053);
      var cell = indexOf(x, y, width);
      var continentalLift = plate.continental ? 520 + plate.buoyancy * 850 : -6200 + plate.buoyancy * 1600;
      var basinAge = clamp(steps / 500, 0.25, 2.5);
      var mountain = boundary * interaction.collision * (plate.continental || secondary.plate.continental ? 5400 : 1200);
      var ridge = boundary * interaction.divergent * (plate.continental ? 650 : 2400);
      var trench = boundary * interaction.collision * (!plate.continental || !secondary.plate.continental ? -2100 : 0);
      var abyssal = plate.continental ? 0 : -900 * basinAge * (1 - boundary);
      var shelf = plate.continental && boundary > 0.2 && !secondary.plate.continental ? -280 * (1 - boundary) : 0;
      var polarWeight = latitude > 72 ? -120 : 0;
      var value = continentalLift + mountain + ridge + trench + abyssal + shelf + local * (plate.continental ? 180 : 620) + polarWeight;

      if (!plate.continental && boundary < 0.12) {
        value = Math.min(value, -4300 - plate.buoyancy * 2200);
      }

      elevation[cell] = clamp(value, -10000, 8849);
      oceanMask[cell] = elevation[cell] < 0 ? 1 : 0;
      boundaries[cell] = boundary;
      faults[cell] = clamp(boundary * interaction.transform, 0, 1);
      volcanic[cell] = clamp(boundary * (interaction.divergent + interaction.collision * (!plate.continental || !secondary.plate.continental ? 1 : 0.2)), 0, 1);
      plateIds[cell] = plate.id;
    }
  }

  return {
    elevation: elevation,
    ocean_mask: oceanMask,
    boundaries: boundaries,
    faults: faults,
    volcanic: volcanic,
    plate_ids: plateIds,
    plates: plates,
    metadata: {
      engine: "tectonics.js-adapter:embedded-headless",
      seed: String(seed),
      width: width,
      height: height,
      tectonic_steps: steps,
      plate_count: plateCount,
      elevation_unit: "meters",
      elevation_format: "r32float"
    }
  };
}

async function runTectonicsjs(seed, params) {
  var options = params || {};
  if (options.engine && typeof options.engine.generate === "function") {
    return options.engine.generate(seed, options);
  }
  if (options.engine && typeof options.engine.run === "function") {
    return options.engine.run(seed, options);
  }
  return runEmbeddedTectonics(seed, options);
}

function createElevationTextureDescriptor(width, height) {
  return {
    id: "tectonics.elevation",
    format: "r32float",
    width: Math.max(1, Math.round(Number(width) || 1)),
    height: Math.max(1, Math.round(Number(height) || 1)),
    unit: "meters",
    rangeMeters: [-10000, 8849],
    consumers: ["heat-diffusion", "lbm-ocean", "moisture"]
  };
}

module.exports = {
  runTectonicsjs: runTectonicsjs,
  createElevationTextureDescriptor: createElevationTextureDescriptor
};
