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
    recommendation: "move climate.meanTemperatureC toward 0 and reduce climate.temperatureAmplitudeC before increasing ticks"
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
    recommendation: "move climate.salinityPsu toward 35 and reduce evaporation-biased temperature amplitude"
  },
  {
    id: "biome-balance-miss",
    match: function(report) {
      const check = findCheck(report, "biomeDistribution");
      return check && !check.ok;
    },
    recommendation: "adjust climate.oceanRatio until oceanRatio > 0.6 and landRatio > 0.2 in the validator report"
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
  PATTERNS,
  recommend
};
