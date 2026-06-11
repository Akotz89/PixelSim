#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

function hashSeed(seed) {
  const text = String(seed || "pixeldarium");
  let hash = 2166136261;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createPrng(seed) {
  let state = hashSeed(seed) || 1;

  return function nextRandom() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    if (key === "check") {
      args.check = args.check || [];
      args.check.push(next);
    } else {
      args[key] = next;
    }

    i += 1;
  }

  return args;
}

function parseScalar(value) {
  const trimmed = value.trim();

  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }

  return trimmed.replace(/^["']|["']$/g, "");
}

function parseSimpleYaml(source) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = source.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const withoutComment = raw.replace(/\s+#.*$/, "");

    if (!withoutComment.trim()) {
      continue;
    }

    const indent = withoutComment.match(/^\s*/)[0].length;
    const match = withoutComment.trim().match(/^([^:]+):(.*)$/);

    if (!match) {
      throw new Error("Unsupported YAML at line " + (i + 1));
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].value;
    const key = match[1].trim();
    const value = match[2].trim();

    if (value === "") {
      parent[key] = {};
      stack.push({ indent: indent, value: parent[key] });
    } else {
      parent[key] = parseScalar(value);
    }
  }

  return root;
}

function loadPlanetSpec(specPath) {
  const source = fs.readFileSync(specPath, "utf8");
  const ext = path.extname(specPath).toLowerCase();
  const spec = ext === ".yaml" || ext === ".yml" ? parseSimpleYaml(source) : JSON.parse(source);

  validatePlanetSpec(spec);
  return spec;
}

function requireNumber(value, label, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(label + " must be a finite number between " + min + " and " + max);
  }
}

function requireInteger(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(label + " must be an integer between " + min + " and " + max);
  }
}

function validatePlanetSpec(spec) {
  if (!spec || typeof spec !== "object") {
    throw new Error("Planet spec must be an object");
  }
  if (typeof spec.seed !== "string" || spec.seed.length === 0) {
    throw new Error("Planet spec requires a non-empty seed");
  }

  requireInteger(spec.width, "width", 8, 2048);
  requireInteger(spec.height, "height", 8, 2048);

  if (!spec.climate || typeof spec.climate !== "object") {
    throw new Error("Planet spec requires climate");
  }

  requireNumber(spec.climate.meanTemperatureC, "climate.meanTemperatureC", -80, 80);
  requireNumber(spec.climate.temperatureAmplitudeC, "climate.temperatureAmplitudeC", 0, 90);
  requireNumber(spec.climate.oceanRatio, "climate.oceanRatio", 0.05, 0.95);
  if (spec.climate.salinityPsu !== undefined) {
    requireNumber(spec.climate.salinityPsu, "climate.salinityPsu", 0, 60);
  }
  if (spec.climate.currentStrength !== undefined) {
    requireNumber(spec.climate.currentStrength, "climate.currentStrength", 0, 10);
  }

  if (!spec.simulation || typeof spec.simulation !== "object") {
    throw new Error("Planet spec requires simulation");
  }

  requireNumber(spec.simulation.dt, "simulation.dt", Number.MIN_VALUE, 10);
  requireNumber(spec.simulation.diffusion, "simulation.diffusion", 0, 1);
  requireInteger(spec.simulation.iterations, "simulation.iterations", 1, 1000000);

  return true;
}

function createOceanMask(spec) {
  const count = spec.width * spec.height;
  const random = createPrng(spec.seed + ":ocean");
  const mask = new Uint8Array(count);
  const centerX = spec.width * (0.45 + random() * 0.1);
  const centerY = spec.height * (0.42 + random() * 0.16);
  const landTarget = 1 - spec.climate.oceanRatio;
  const radiusX = spec.width * (0.18 + landTarget * 0.38);
  const radiusY = spec.height * (0.16 + landTarget * 0.34);
  let landCells = 0;

  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      const index = y * spec.width + x;
      const dx = (x - centerX) / radiusX;
      const dy = (y - centerY) / radiusY;
      const polarShelf = Math.abs((y / Math.max(1, spec.height - 1)) - 0.5) * 0.25;
      const noise = (random() - 0.5) * 0.55;
      const isLand = dx * dx + dy * dy + polarShelf + noise < 1;

      mask[index] = isLand ? 0 : 1;
      if (isLand) {
        landCells += 1;
      }
    }
  }

  if (landCells < count * 0.2) {
    for (let i = 0; i < count && landCells < count * 0.22; i += 3) {
      if (mask[i] === 1) {
        mask[i] = 0;
        landCells += 1;
      }
    }
  }

  return mask;
}

function diffuse(values, width, height, alpha, steps) {
  if (steps <= 0 || alpha <= 0) {
    return values;
  }

  let current = values;
  let next = new Float32Array(values.length);
  const clampedAlpha = Math.min(0.24, Math.max(0, alpha));

  for (let step = 0; step < steps; step += 1) {
    for (let y = 0; y < height; y += 1) {
      const yN = Math.max(0, y - 1);
      const yS = Math.min(height - 1, y + 1);

      for (let x = 0; x < width; x += 1) {
        const xW = (x + width - 1) % width;
        const xE = (x + 1) % width;
        const index = y * width + x;
        const north = current[yN * width + x];
        const south = current[yS * width + x];
        const west = current[y * width + xW];
        const east = current[y * width + xE];
        const average = (north + south + west + east) * 0.25;

        next[index] = current[index] + (average - current[index]) * clampedAlpha;
      }
    }

    const swap = current;
    current = next;
    next = swap;
  }

  return current;
}

function simulateField(spec, simName, ticks) {
  const width = spec.width;
  const height = spec.height;
  const count = width * height;
  const random = createPrng(spec.seed + ":" + simName);
  const values = new Float32Array(count);
  const oceanMask = createOceanMask(spec);
  const totalTicks = Math.max(1, Math.round(Number(ticks) || spec.simulation.iterations));
  const diffusionSteps = Math.min(32, Math.max(1, Math.round(Math.log2(totalTicks + 1))));
  const diffusionAlpha = spec.simulation.diffusion * Math.min(1, spec.simulation.dt);
  const currentStrength = spec.climate.currentStrength === undefined ? 1 : spec.climate.currentStrength;
  const salinity = spec.climate.salinityPsu === undefined ? 35 : spec.climate.salinityPsu;
  const field = simName || "heat";
  let unit = "normalized";

  for (let y = 0; y < height; y += 1) {
    const latitude = y / Math.max(1, height - 1);
    const equator = 1 - Math.abs(latitude - 0.5) * 2;

    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const wave = Math.sin((x / width) * Math.PI * 2 + hashSeed(spec.seed) * 0.00001);
      const jitter = (random() - 0.5) * 0.8;

      if (field === "salinity") {
        unit = "PSU";
        values[index] = oceanMask[index]
          ? salinity + (equator - 0.5) * 4 + wave * 0.8 + jitter
          : Math.max(0, salinity * 0.12 + jitter);
      } else if (field === "velocity") {
        unit = "m/s";
        values[index] = oceanMask[index]
          ? Math.abs(Math.sin(latitude * Math.PI * 2)) * currentStrength + Math.abs(wave) * currentStrength * 0.35
          : 0;
      } else if (field === "biome") {
        unit = "biome-id";
        values[index] = oceanMask[index] ? 0 : (latitude < 0.18 || latitude > 0.82 ? 2 : equator > 0.7 ? 4 : 3);
      } else {
        unit = "C";
        values[index] = spec.climate.meanTemperatureC +
          (equator - 0.5) * spec.climate.temperatureAmplitudeC +
          (oceanMask[index] ? 2 : -2) +
          wave * 1.5 +
          jitter;
      }
    }
  }

  const diffused = field === "biome" ? values : diffuse(values, width, height, diffusionAlpha, diffusionSteps);

  return {
    name: field,
    unit: unit,
    width: width,
    height: height,
    ticks: totalTicks,
    values: diffused,
    oceanMask: oceanMask
  };
}

function summarizeValues(values, bins) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let nanCount = 0;

  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);

    if (!Number.isFinite(value)) {
      nanCount += 1;
      continue;
    }

    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  }

  if (min === Infinity) {
    min = 0;
    max = 0;
  }

  const histogram = new Array(bins || 16).fill(0);
  const range = max - min || 1;

  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);

    if (!Number.isFinite(value)) {
      continue;
    }

    const bucket = Math.max(0, Math.min(histogram.length - 1, Math.floor(((value - min) / range) * histogram.length)));
    histogram[bucket] += 1;
  }

  return {
    min: min,
    max: max,
    mean: sum / Math.max(1, values.length - nanCount),
    nanCount: nanCount,
    histogram: histogram
  };
}

function summarizeBiome(oceanMask) {
  let ocean = 0;

  for (let i = 0; i < oceanMask.length; i += 1) {
    if (oceanMask[i]) {
      ocean += 1;
    }
  }

  return {
    oceanRatio: ocean / oceanMask.length,
    landRatio: (oceanMask.length - ocean) / oceanMask.length
  };
}

function crc32(buffer) {
  let crc = -1;

  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xFF];
  }

  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = (function buildCrcTable() {
  const table = new Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  const payload = Buffer.concat([typeBuffer, data]);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([length, payload, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  const raw = Buffer.alloc((width * 4 + 1) * height);

  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, row + 1);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function valuesToRgba(values, width, height, summary) {
  const rgba = new Uint8Array(width * height * 4);
  const min = summary.min;
  const range = summary.max - summary.min || 1;

  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);
    const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, (value - min) / range)) : 1;
    const byte = Math.round(normalized * 255);
    const offset = i * 4;

    rgba[offset] = byte;
    rgba[offset + 1] = Math.round((1 - normalized) * 160);
    rgba[offset + 2] = 255 - byte;
    rgba[offset + 3] = 255;
  }

  return rgba;
}

function writeSimulationExport(outputPath, spec, field) {
  const summary = summarizeValues(field.values, 16);
  const biome = summarizeBiome(field.oceanMask);
  const rgba = valuesToRgba(field.values, field.width, field.height, summary);
  const sidecar = outputPath + ".json";

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, encodePng(field.width, field.height, rgba));
  fs.writeFileSync(sidecar, JSON.stringify({
    pixeldariumSimExport: 1,
    exportPath: outputPath,
    specSeed: spec.seed,
    sim: field.name,
    unit: field.unit,
    ticks: field.ticks,
    width: field.width,
    height: field.height,
    stats: summary,
    biome: biome,
    validatorRanges: {
      temperatureC: [-100, 100],
      salinityPsu: [0, 60],
      velocityMps: [0, 10],
      biomeOceanMin: 0.6,
      biomeLandMin: 0.2
    }
  }, null, 2));

  return {
    output: outputPath,
    sidecar: sidecar,
    sim: field.name,
    unit: field.unit,
    ticks: field.ticks,
    stats: summary,
    biome: biome
  };
}

module.exports = {
  createPrng,
  encodePng,
  loadPlanetSpec,
  parseArgs,
  parseSimpleYaml,
  simulateField,
  summarizeBiome,
  summarizeValues,
  validatePlanetSpec,
  writeSimulationExport
};
