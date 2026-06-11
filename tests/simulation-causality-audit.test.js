const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const docs = read("docs/simulation-causality-audit.md");
const docsIndex = read("docs/index.md");
const packageJson = JSON.parse(read("package.json"));
const tuner = read("scripts/sim-tuner-playbook.js");

assert.ok(packageJson.scripts.test.includes("tests/simulation-causality-audit.test.js"), "npm test should include simulation causality audit checks");
assert.ok(docsIndex.includes("simulation-causality-audit.md"), "docs index should link the simulation causality audit");

[
  "allowed_constraint",
  "upstream_baseline_parameter",
  "driver_input",
  "derived_field",
  "downstream_tuning_violation"
].forEach(function (classification) {
  assert.ok(docs.includes(classification), "audit docs should define " + classification);
});

[
  "js/render/terrain-seeding.js",
  "js/sim/food-growth.js",
  "js/sim/organisms-behavior.js",
  "js/sim/food-web.js",
  "js/sim/geochemistry.js",
  "js/epochs/state-machine.js",
  "js/main-simulation.js",
  "scripts/sim-tuner-playbook.js"
].forEach(function (file) {
  assert.ok(docs.includes(file), "audit docs should classify " + file);
});

assert.ok(docs.includes("If the result is collapse"), "audit checklist should require tracing collapse causes");
assert.ok(docs.includes("agent_intervention"), "direct agent patches should be routed through driver outputs");

[
  "move climate.meanTemperatureC toward 0",
  "move climate.salinityPsu toward 35",
  "adjust climate.oceanRatio until"
].forEach(function (forbiddenAdvice) {
  assert.strictEqual(tuner.indexOf(forbiddenAdvice), -1, "tuner should not give target-chasing advice: " + forbiddenAdvice);
});

assert.ok(tuner.includes("inspect upstream solar forcing"), "temperature advice should start with upstream causes");
assert.ok(tuner.includes("inspect upstream evaporation"), "salinity advice should start with upstream causes");
assert.ok(tuner.includes("trace biome distribution"), "biome advice should trace causes before parameter changes");

console.log("simulation causality audit checks passed");
