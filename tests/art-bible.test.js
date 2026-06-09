const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const artBible = read("docs/pixeldarium-art-bible.md");
const index = read("docs/index.md");
const topDownContract = read("docs/top-down-simulation-art-contract.md");
const handoff = read("docs/agent-studio-handoff.md");
const packageJson = JSON.parse(read("package.json"));

[
  "Runtime Boundary",
  "Visual Pillars",
  "Perspective",
  "Dimensions",
  "Sprite Sheet Layouts",
  "Animation Specs",
  "Style Direction",
  "Color And Palette",
  "Naming Convention",
  "Asset Family Contracts",
  "Quality Gate"
].forEach((section) => {
  assert.ok(artBible.indexOf(section) >= 0, "art bible should include section: " + section);
});

[
  "Terrain tile source cells | 16x16",
  "Accepted terrain atlas cells | 32x32",
  "Entity sprite, small | 16x32",
  "Entity sprite, medium | 32x32",
  "Entity sprite, large | 32x64",
  "Building sprite, small | 32x32",
  "Building sprite, large | 64x64",
  "UI icon | 32x32"
].forEach((dimension) => {
  assert.ok(artBible.indexOf(dimension) >= 0, "art bible should document dimension: " + dimension);
});

[
  "Walk cycle | 4 frames per direction",
  "Idle | 2 frames",
  "Attack | 3 frames",
  "Death | 4 frames",
  "| 8 |"
].forEach((animationSpec) => {
  assert.ok(artBible.indexOf(animationSpec) >= 0, "art bible should document animation spec: " + animationSpec);
});

[
  "4 columns x 4 rows",
  "down, left, right, up",
  "16x16 grid",
  "8 columns x 1 row",
  "8 icons horizontal"
].forEach((layout) => {
  assert.ok(artBible.indexOf(layout) >= 0, "art bible should document sheet layout: " + layout);
});

[
  "{category}-{name}-{variant}.png",
  "{category}-{name}-sheet.png",
  "{category}-{name}-atlas.json",
  "{category}.{name}.{variant}"
].forEach((naming) => {
  assert.ok(artBible.indexOf(naming) >= 0, "art bible should document naming convention: " + naming);
});

[
  "PS.assets.getPaletteColor",
  "PS.render.terrain.getBaseBiomeColor",
  "PS.atlas.getPaletteRgb",
  "scripts/build-terrain-biomes.js",
  "assets/manifest.json"
].forEach((paletteAnchor) => {
  assert.ok(artBible.indexOf(paletteAnchor) >= 0, "art bible should anchor palette consistency: " + paletteAnchor);
});

[
  "WebGPU-only",
  "WASM",
  "Do not design assets around WebGL",
  "Candidate-only files",
  "must not supply copied pixels",
  "copied palettes",
  "copied UI layouts"
].forEach((boundary) => {
  assert.ok(artBible.indexOf(boundary) >= 0, "art bible should enforce boundary: " + boundary);
});

assert.strictEqual(
  artBible.indexOf("Songs of Syx"),
  -1,
  "art bible should describe original Pixeldarium style without naming a commercial source as an instruction"
);

assert.ok(
  index.indexOf("Pixeldarium Art Bible") >= 0 &&
    index.indexOf("docs/pixeldarium-art-bible.md") >= 0,
  "docs index should expose the Pixeldarium art bible"
);

assert.ok(
  topDownContract.indexOf("docs/pixeldarium-art-bible.md") >= 0,
  "top-down art contract should point at the repo-local art bible"
);

assert.ok(
  handoff.indexOf("docs/pixeldarium-art-bible.md") >= 0 &&
    handoff.indexOf("assets/manifest.json") >= 0,
  "Agent Studio handoff should retain art bible and runtime acceptance rules"
);

assert.ok(
  packageJson.scripts.test.indexOf("tests/art-bible.test.js") >= 0,
  "npm test should include art bible checks"
);

console.log("art bible checks passed");
