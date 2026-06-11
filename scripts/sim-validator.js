#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { parseArgs } = require("./sim-control");

const CHECK_ALIASES = {
  nan: "nan",
  "temperature-range": "temperatureRange",
  "salinity-range": "salinityRange",
  "velocity-range": "velocityRange",
  "biome-distribution": "biomeDistribution"
};

function loadExportMetadata(inputPath) {
  const sidecarPath = inputPath.endsWith(".json") ? inputPath : inputPath + ".json";
  const metadata = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));

  if (!metadata || metadata.pixeldariumSimExport !== 1) {
    throw new Error("Input sidecar is not a Pixeldarium simulation export: " + sidecarPath);
  }

  return { path: sidecarPath, metadata: metadata };
}

function pass(name, details) {
  return Object.assign({ name: name, ok: true }, details || {});
}

function fail(name, details) {
  return Object.assign({ name: name, ok: false }, details || {});
}

function evaluateCheck(name, metadata) {
  const stats = metadata.stats || {};
  const biome = metadata.biome || {};

  if (name === "nan") {
    return stats.nanCount === 0
      ? pass(name, { nanCount: stats.nanCount || 0 })
      : fail(name, { nanCount: stats.nanCount || 0, action: "halt" });
  }

  if (name === "temperatureRange") {
    return stats.min >= -100 && stats.max <= 100
      ? pass(name, { min: stats.min, max: stats.max, allowed: [-100, 100] })
      : fail(name, { min: stats.min, max: stats.max, allowed: [-100, 100] });
  }

  if (name === "salinityRange") {
    return stats.min >= 0 && stats.max <= 60
      ? pass(name, { min: stats.min, max: stats.max, allowed: [0, 60] })
      : fail(name, { min: stats.min, max: stats.max, allowed: [0, 60] });
  }

  if (name === "velocityRange") {
    return stats.min >= 0 && stats.max <= 10
      ? pass(name, { min: stats.min, max: stats.max, allowed: [0, 10] })
      : fail(name, { min: stats.min, max: stats.max, allowed: [0, 10] });
  }

  if (name === "biomeDistribution") {
    return biome.oceanRatio > 0.6 && biome.landRatio > 0.2
      ? pass(name, { oceanRatio: biome.oceanRatio, landRatio: biome.landRatio })
      : fail(name, { oceanRatio: biome.oceanRatio, landRatio: biome.landRatio, required: { oceanRatio: "> 0.6", landRatio: "> 0.2" } });
  }

  throw new Error("Unknown validation check: " + name);
}

function normalizeChecks(args) {
  const requested = [];
  const raw = Array.isArray(args.check) ? args.check : args.check ? [args.check] : ["nan"];

  raw.forEach(function(item) {
    String(item).split(",").forEach(function(part) {
      const key = part.trim();

      if (!key) {
        return;
      }

      if (!CHECK_ALIASES[key]) {
        throw new Error("Unsupported validation check: " + key);
      }

      requested.push(CHECK_ALIASES[key]);
    });
  });

  return requested;
}

function buildReport(inputPath, checks) {
  const loaded = loadExportMetadata(inputPath);
  const results = checks.map(function(check) {
    return evaluateCheck(check, loaded.metadata);
  });

  return {
    ok: results.every(function(result) { return result.ok; }),
    input: path.resolve(process.cwd(), inputPath),
    sidecar: loaded.path,
    sim: loaded.metadata.sim,
    stats: loaded.metadata.stats,
    biome: loaded.metadata.biome,
    checks: results
  };
}

function main(argv) {
  const args = parseArgs(argv);

  if (!args.input) {
    console.error("Usage: node scripts/sim-validator.js --input reports/temp.png --check temperature-range");
    process.exitCode = 2;
    return;
  }

  const checks = normalizeChecks(args);
  const report = buildReport(path.resolve(process.cwd(), args.input), checks);

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  }
}

module.exports = {
  buildReport,
  evaluateCheck,
  main,
  normalizeChecks
};
