const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const architecture = read("docs/ARCHITECTURE.md");
const rendering = read("docs/RENDERING.md");
const gettingStarted = read("docs/GETTING_STARTED.md");
const conventions = read("docs/CODING_CONVENTIONS.md");
const index = read("docs/index.md");
const packageJson = JSON.parse(read("package.json"));
const scaffoldingWarning = "SCAFFOLDING: This file is a progress bar, not a game system. Redesign required.";

[
  "core/",
  "assets/",
  "systems/",
  "sim/",
  "render/",
  "ui/",
  "debug/",
  "data/",
  "shaders/",
  "tests/"
].forEach((section) => {
  assert.ok(architecture.includes(section), "architecture doc should describe module area " + section);
});

[
  "WebGPU Render Pipeline",
  "Coordinate Systems",
  "Zoom Bands",
  "Atlas System",
  "Frame Budget"
].forEach((section) => {
  assert.ok(rendering.includes(section), "rendering doc should include " + section);
});

[
  "npm install",
  "npm test",
  "npm run dev",
  "Add A Terrain Type",
  "Add An Entity Type",
  "Change Simulation Parameters",
  "set CONFIG.MAX_FOOD 1000",
  "npm run test:visual"
].forEach((text) => {
  assert.ok(gettingStarted.includes(text), "getting started guide should include " + text);
});

[
  "PS.*",
  "Do not use ES modules",
  "WebGPU is required",
  "data/config.json",
  "PS.core.worldGen.generateWorld",
  "Keep `npm test` passing"
].forEach((text) => {
  assert.ok(conventions.includes(text), "coding conventions should include " + text);
});

assert.ok(index.includes("GETTING_STARTED.md"), "docs index should link the getting started guide");
assert.ok(index.includes("CODING_CONVENTIONS.md"), "docs index should link coding conventions");
assert.ok(packageJson.scripts.test.includes("tests/documentation-guide.test.js"), "npm test should include documentation guide checks");

[
  "js/sim/civilizations-orbital.js",
  "js/sim/civilizations-probes.js",
  "js/sim/civilizations-stars.js",
  "js/sim/civilizations-empire.js"
].forEach((file) => {
  const source = read(file);
  assert.ok(source.startsWith("// " + scaffoldingWarning), file + " should declare civilization scaffolding warning");
  assert.ok(source.includes("Freeze new features here"), file + " should freeze new features until real gameplay prerequisites exist");
});

console.log("documentation guide checks passed");
