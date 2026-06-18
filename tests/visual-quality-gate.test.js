const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const gate = read("docs/visual-quality-gate.md");
const proofScene = read("docs/proof-scene-acceptance.md");
const index = read("docs/index.md");
const rendering = read("docs/RENDERING.md");
const optimizationGate = read("docs/optimization-implementation-gate.md");
const artContract = read("docs/top-down-simulation-art-contract.md");
const featureTemplate = read(".github/ISSUE_TEMPLATE/feature_request.yml");
const prTemplate = read(".github/PULL_REQUEST_TEMPLATE.md");
const packageJson = JSON.parse(read("package.json"));

[
  "Required Checklist",
  "Zoom Band Contracts",
  "Camera Contract",
  "Simulation Readability Contract",
  "Snake2D-Equivalent Render Capability Matrix",
  "Actor-Scale Readability Gate",
  "Screenshot And Performance Evidence",
  "Required Verification Commands"
].forEach((section) => {
  assert.ok(gate.indexOf(section) >= 0, "visual quality gate should include section: " + section);
});

[
  "Orbit",
  "Planet",
  "Continent",
  "Region",
  "Local",
  "Settlement/Ground",
  "Space"
].forEach((band) => {
  assert.ok(gate.indexOf(band) >= 0, "visual quality gate should define zoom band: " + band);
});

[
  "Smooth wheel zoom with stable screen anchor",
  "Drag/pan without disorienting jumps",
  "No visible black-frame gap",
  "Direct `file://` playability",
  "Decorative noise is not enough",
  "must remain original"
].forEach((contract) => {
  assert.ok(gate.indexOf(contract) >= 0, "visual quality gate should require: " + contract);
});

[
  "Albedo/normal/material atlas contract",
  "G-buffer attachments",
  "Sprite/entity batching",
  "Ambient lighting",
  "Point lighting",
  "Tile lighting",
  "Shadows/stencil equivalent",
  "Displacement/distortion",
  "Particles/VFX",
  "Animation frames",
  "Deterministic variation",
  "Final composite order",
  "Zoom/LOD integration"
].forEach((capability) => {
  assert.ok(gate.indexOf(capability) >= 0, "visual quality gate should include render capability: " + capability);
});

[
  "AZR-1137",
  "AZR-549",
  "AZR-539",
  "AZR-1084",
  "AZR-1093",
  "AZR-1085",
  "AZR-596",
  "AZR-595",
  "AZR-1075",
  "AZR-1138"
].forEach((issueId) => {
  assert.ok(gate.indexOf(issueId) >= 0, "render capability matrix should name Linear owner: " + issueId);
});

[
  "_reference/songs-of-syx-source/CATALOG.md",
  "_reference/songs-of-syx-source/ENGINE_INVENTORY.md",
  "do not copy Songs of Syx source",
  "One WebGPU frame proves terrain, material normals, entities, shadows, particles/effects, tile lights, point lights, overlays, and HUD"
].forEach((reference) => {
  assert.ok(gate.indexOf(reference) >= 0, "render capability matrix should require: " + reference);
});

[
  "Affected zoom band",
  "Initial state",
  "Trigger",
  "Visible tell",
  "Behavior",
  "Consequence",
  "Termination condition",
  "Pass/fail observation",
  "Evidence artifact",
  "Verification command",
  "Source evidence alone is never enough"
].forEach((field) => {
  assert.ok(proofScene.indexOf(field) >= 0, "proof-scene doc should require: " + field);
});

[
  "Actor type",
  "Primary verb",
  "Simulation consequence",
  "Mitigation, adaptation, or counterplay",
  "Simulation state being communicated",
  "Dense-prop or overlap stress case",
  "Decorative polish"
].forEach((field) => {
  assert.ok(proofScene.indexOf(field) >= 0, "proof-scene doc should define readability field: " + field);
});

assert.ok(
  gate.indexOf("docs/proof-scene-acceptance.md") >= 0,
  "visual quality gate should link proof-scene acceptance"
);
assert.ok(
  optimizationGate.indexOf("docs/proof-scene-acceptance.md") >= 0,
  "optimization gate should link proof-scene acceptance"
);
assert.ok(
  artContract.indexOf("actor-scale readability proof") >= 0,
  "top-down art contract should require actor-scale readability proof"
);
assert.ok(
  featureTemplate.indexOf("Proof Scene") >= 0 &&
    featureTemplate.indexOf("Actor / VFX Readability Gate") >= 0,
  "feature template should request proof-scene and readability gate fields"
);
assert.ok(
  prTemplate.indexOf("docs/proof-scene-acceptance.md") >= 0 &&
    prTemplate.indexOf("not local runtime proof") >= 0,
  "PR template should keep source evidence separate from local runtime proof"
);

[
  "node tests/planet-zoom-anchor.test.js",
  "node tests/globe-interaction.test.js",
  "node tests/observation-overlays.test.js",
  "node tests/no-canvas2d-source.test.js",
  "file:///C:/Users/Aaron/Azyrra/projects/pixeldarium/index.html"
].forEach((command) => {
  assert.ok(gate.indexOf(command) >= 0, "visual quality gate should name verification: " + command);
});

assert.ok(
  index.indexOf("Visual Quality Gate") >= 0 &&
    index.indexOf("docs/visual-quality-gate.md") >= 0,
  "docs index should expose the visual quality gate"
);
assert.ok(
  index.indexOf("Proof Scene Acceptance") >= 0 &&
    index.indexOf("docs/proof-scene-acceptance.md") >= 0,
  "docs index should expose the proof-scene acceptance gate"
);

assert.ok(
  rendering.indexOf("Zoom Bands") >= 0 &&
    rendering.indexOf("Perception contract") >= 0,
  "rendering documentation should retain zoom-band perception contracts"
);

assert.ok(
  packageJson.scripts.test.indexOf("tests/visual-quality-gate.test.js") >= 0,
  "npm test should include visual quality gate checks"
);

console.log("visual quality gate checks passed");
