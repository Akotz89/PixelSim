const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/planet-spec.schema.json"), "utf8"));
const docs = fs.readFileSync(path.join(root, "docs/agent-simulation-control.md"), "utf8");
const runnerSource = fs.readFileSync(path.join(root, "scripts/sim-runner.js"), "utf8");
const validatorSource = fs.readFileSync(path.join(root, "scripts/sim-validator.js"), "utf8");
const tunerSource = fs.readFileSync(path.join(root, "scripts/sim-tuner-playbook.js"), "utf8");
const control = require("../scripts/sim-control");
const validator = require("../scripts/sim-validator");
const tuner = require("../scripts/sim-tuner-playbook");

const tmpDir = path.join(root, "tests", ".tmp-sim-control");
const outputPng = path.join(tmpDir, "temp-arctic.png");

function runNode(args, options) {
  const result = spawnSync(process.execPath, args, Object.assign({
    cwd: root,
    encoding: "utf8"
  }, options || {}));

  if (result.status !== 0) {
    throw new Error(args.join(" ") + "\nSTDOUT:\n" + result.stdout + "\nSTDERR:\n" + result.stderr);
  }

  return result;
}

fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

assert.ok(packageJson.scripts.test.includes("tests/sim-control.test.js"), "npm test should include sim control checks");
assert.strictEqual(schema.title, "Pixeldarium Planet Spec", "schema should declare planet spec title");
assert.ok(schema.required.includes("seed"), "schema should require seed");
assert.ok(schema.required.includes("climate"), "schema should require climate");
assert.ok(schema.properties.climate.properties.oceanRatio, "schema should define ocean ratio");

assert.ok(runnerSource.includes("sim-runner.js --spec"), "runner should document CLI usage");
assert.ok(validatorSource.includes("temperature-range"), "validator should implement temperature-range");
assert.ok(validatorSource.includes("salinity-range"), "validator should implement salinity-range");
assert.ok(validatorSource.includes("velocity-range"), "validator should implement velocity-range");
assert.ok(validatorSource.includes("biome-distribution"), "validator should implement biome-distribution");
assert.ok(tunerSource.includes("nan-immediate-halt"), "tuner should include NaN halt pattern");
assert.ok(tunerSource.includes("temperature-too-narrow"), "tuner should include heat tuning pattern");
assert.ok(tunerSource.includes("currents-too-weak"), "tuner should include current tuning pattern");

assert.ok(docs.includes("WASM Worker Integration Spec"), "docs should include WASM worker integration spec");
assert.ok(docs.includes("SharedArrayBuffer"), "docs should cover SharedArrayBuffer bridge");
assert.ok(docs.includes("Cross-Origin-Opener-Policy: same-origin"), "docs should specify COOP header");
assert.ok(docs.includes("Cross-Origin-Embedder-Policy: require-corp"), "docs should specify COEP header");
assert.ok(docs.includes("Tuner Playbook"), "docs should include tuner playbook");

const jsonSpec = control.loadPlanetSpec(path.join(root, "examples/planet-arctic.json"));
const yamlSpec = control.loadPlanetSpec(path.join(root, "examples/planet-temperate.yaml"));
assert.strictEqual(jsonSpec.seed, "AZR-835-ARCTIC", "JSON specs should load");
assert.strictEqual(yamlSpec.seed, "AZR-835-TEMPERATE", "YAML specs should load");

const field = control.simulateField(jsonSpec, "heat", 24);
const summary = control.summarizeValues(field.values, 16);
assert.strictEqual(field.values.length, jsonSpec.width * jsonSpec.height, "runner field should match spec dimensions");
assert.ok(summary.min >= -100 && summary.max <= 100, "heat field should stay in validator range");

const runner = runNode([
  "scripts/sim-runner.js",
  "--spec", "examples/planet-arctic.json",
  "--sim", "heat",
  "--ticks", "24",
  "--export", path.relative(root, outputPng)
]);
const runnerReport = JSON.parse(runner.stdout);
assert.strictEqual(runnerReport.ok, true, "runner should emit ok JSON");
assert.ok(fs.existsSync(outputPng), "runner should write PNG export");
assert.ok(fs.readFileSync(outputPng).slice(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")), "export should be a PNG");
assert.ok(fs.existsSync(outputPng + ".json"), "runner should write validator sidecar");

const validation = runNode([
  "scripts/sim-validator.js",
  "--input", path.relative(root, outputPng),
  "--check", "nan",
  "--check", "temperature-range",
  "--check", "biome-distribution"
]);
const validationReport = JSON.parse(validation.stdout);
assert.strictEqual(validationReport.ok, true, "validator report should pass target checks");
assert.ok(validationReport.checks.some(function(check) { return check.name === "temperatureRange"; }), "validator should report temperatureRange");
assert.ok(validationReport.biome.oceanRatio > 0.6, "validator should report ocean coverage above acceptance minimum");
assert.ok(validationReport.biome.landRatio > 0.2, "validator should report land coverage above acceptance minimum");

const sidecar = JSON.parse(fs.readFileSync(outputPng + ".json", "utf8"));
sidecar.stats.nanCount = 2;
fs.writeFileSync(path.join(tmpDir, "bad.png.json"), JSON.stringify(sidecar, null, 2));
const failed = validator.buildReport(path.join(tmpDir, "bad.png"), ["nan"]);
assert.strictEqual(failed.ok, false, "validator should fail NaN reports");
assert.strictEqual(failed.checks[0].action, "halt", "NaN failure should require immediate halt");

const recommendations = tuner.recommend({
  sim: "heat",
  stats: { min: 1, max: 8 },
  checks: validationReport.checks
});
assert.ok(recommendations.recommendations.some(function(item) {
  return item.id === "temperature-too-narrow";
}), "tuner should recommend widening narrow heat bands");

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log("sim control checks passed");
