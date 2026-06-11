#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  loadPlanetSpec,
  parseArgs,
  simulateField,
  writeSimulationExport
} = require("./sim-control");

function printUsage() {
  console.error("Usage: node scripts/sim-runner.js --spec planet.json --sim heat --ticks 1000 --export reports/temp.png");
}

function main(argv) {
  const args = parseArgs(argv);

  if (!args.spec || !args.sim || !args.export) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const specPath = path.resolve(process.cwd(), args.spec);
  const exportPath = path.resolve(process.cwd(), args.export);
  const spec = loadPlanetSpec(specPath);
  const field = simulateField(spec, args.sim, args.ticks || spec.simulation.iterations);
  const result = writeSimulationExport(exportPath, spec, field);

  process.stdout.write(JSON.stringify({
    ok: true,
    spec: specPath,
    output: result.output,
    sidecar: result.sidecar,
    sim: result.sim,
    unit: result.unit,
    ticks: result.ticks,
    stats: result.stats,
    biome: result.biome
  }, null, 2) + "\n");
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
  main
};
