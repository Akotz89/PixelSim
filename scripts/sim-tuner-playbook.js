#!/usr/bin/env node
"use strict";

const fs = require("fs");

const PATTERNS = [
  {
    id: "nan-immediate-halt",
    match: function(report) {
      const nanCheck = findCheck(report, "nan");
      return nanCheck && !nanCheck.ok;
    },
    recommendation: "halt run, reduce simulation.dt by 50%, clamp diffusion to <= 0.2, and rerun the same seed"
  },
  {
    id: "temperature-too-narrow",
    match: function(report) {
      return report.sim === "heat" && report.stats && (report.stats.max - report.stats.min) < 12;
    },
    recommendation: "increase climate.temperatureAmplitudeC by 25% or lower simulation.diffusion by 20%"
  },
  {
    id: "temperature-out-of-range",
    match: function(report) {
      const check = findCheck(report, "temperatureRange");
      return check && !check.ok;
    },
    recommendation: "inspect upstream solar forcing, greenhouse forcing, albedo, and diffusion inputs before changing temperature parameters"
  },
  {
    id: "currents-too-weak",
    match: function(report) {
      return report.sim === "velocity" && report.stats && report.stats.max < 0.35;
    },
    recommendation: "increase climate.currentStrength and verify velocity-range remains below 10 m/s"
  },
  {
    id: "salinity-out-of-range",
    match: function(report) {
      const check = findCheck(report, "salinityRange");
      return check && !check.ok;
    },
    recommendation: "inspect upstream evaporation, freshwater input, ocean ratio, and thermohaline exchange before changing salinity parameters"
  },
  {
    id: "biome-balance-miss",
    match: function(report) {
      const check = findCheck(report, "biomeDistribution");
      return check && !check.ok;
    },
    recommendation: "trace biome distribution through ocean inventory, elevation, moisture, albedo, and seed variance before changing climate.oceanRatio"
  }
];

function findCheck(report, name) {
  return (report.checks || []).find(function(check) {
    return check.name === name;
  });
}

function recommend(report) {
  const recommendations = PATTERNS.filter(function(pattern) {
    return pattern.match(report || {});
  }).map(function(pattern) {
    return {
      id: pattern.id,
      recommendation: pattern.recommendation
    };
  });

  if (recommendations.length === 0) {
    recommendations.push({
      id: "no-change",
      recommendation: "keep parameters stable and advance to a longer tick budget or broader seed sweep"
    });
  }

  return {
    ok: true,
    recommendations: recommendations
  };
}

function readReport(argv) {
  const fileIndex = argv.indexOf("--report");

  if (fileIndex >= 0 && argv[fileIndex + 1]) {
    return JSON.parse(fs.readFileSync(argv[fileIndex + 1], "utf8"));
  }

  const stdin = fs.readFileSync(0, "utf8");
  return JSON.parse(stdin);
}

function main(argv) {
  const report = readReport(argv);
  process.stdout.write(JSON.stringify(recommend(report), null, 2) + "\n");
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
  recommend
};
