const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const names = [
  "make" + "Batches",
  "draw" + "TileEntity",
  "draw" + "SurfaceEntity",
  "draw" + "RepresentativeMarker",
  "upload" + "ToGL",
  "get" + "BuildingAutotileMask",
  "get" + "BuildingSpriteDescriptor"
];
const allowedFiles = new Set([
  path.normalize("js/render/webgpu-surface-tile.js"),
  path.normalize("tests/planet-zoom-anchor.test.js"),
  path.normalize("tests/webgpu-surface-tile.test.js")
]);
const roots = ["js", "tests"];
const matches = [];

function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      return;
    }

    if (!entry.isFile() || !entry.name.endsWith(".js")) {
      return;
    }

    const relative = path.normalize(path.relative(root, fullPath));

    if (relative === path.normalize("tests/render-dead-code.test.js") || allowedFiles.has(relative)) {
      return;
    }

    const source = fs.readFileSync(fullPath, "utf8");

    names.forEach(function (name) {
      if (source.indexOf(name) >= 0) {
        matches.push(relative + ": " + name);
      }
    });
  });
}

roots.forEach(function (dir) {
  walk(path.join(root, dir));
});

assert.deepStrictEqual(matches, [], "dead render helper names should not remain outside live WebGPU wrapper coverage");

console.log("render dead code checks passed");
