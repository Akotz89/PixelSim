const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const namespaceSource = read("js/core/namespace.js");
const atlasSource = read("js/render/entity-atlas.js");
const organismAtlasSource = read("js/render/entity-atlas-organisms.js");

assert.ok(
  namespaceSource.indexOf("js/render/entity-atlas-organisms.js") > namespaceSource.indexOf("js/render/entity-atlas.js"),
  "organism atlas identity sidecar should load after atlas core"
);
assert.ok(
  namespaceSource.indexOf("js/render/entity-atlas-organisms.js") < namespaceSource.indexOf("js/render/entity-atlas-intents.js"),
  "organism atlas identity sidecar should load before later atlas consumers"
);
assert.strictEqual(namespaceSource.indexOf("js/render/entity-webgl.js"), -1, "runtime manifest must not load the legacy entity WebGL renderer");

const context = {
  PS: {
    render: {},
    atlas: null
  },
  CONFIG: {
    LINEAGE_COLORS: ["#72d7ff", "#58f06c", "#c884ff", "#f4c84a"]
  },
  Uint8Array,
  Date,
  Object,
  String,
  Number,
  Boolean,
  Array,
  Map,
  Math,
  Error,
  performance,
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
};

vm.createContext(context);
vm.runInContext(atlasSource, context, { filename: "js/render/entity-atlas.js" });
vm.runInContext(organismAtlasSource, context, { filename: "js/render/entity-atlas-organisms.js" });

function pixelAt(cell, x, y) {
  const page = context.PS.atlas.pages[cell.pageIndex];
  const index = ((cell.y + y) * page.width + cell.x + x) * 4;
  return Array.from(page.data.slice(index, index + 4));
}

function uniqueColorCount(cell) {
  const colors = new Set();

  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      colors.add(pixelAt(cell, x, y).join(","));
    }
  }

  return colors.size;
}

function makeOrganism(lineageId, overrides) {
  return {
    lineageId,
    x: 12,
    y: 8,
    traits: Object.assign({
      bodySize: 1.4,
      bodyShape: 2,
      limbCount: 6,
      appendageType: 1,
      camouflage: 0.25,
      thermalTolerance: 0.25,
      waterDependency: 0.1
    }, overrides || {})
  };
}

context.PS.atlas.ensurePage();

const baseline = makeOrganism(1);
const aquatic = makeOrganism(1, {
  waterDependency: 0.95,
  appendageType: 5,
  bodyShape: 4
});
const heatSpined = makeOrganism(1, {
  thermalTolerance: 1,
  appendageType: 6,
  limbCount: 12
});
const camouflaged = makeOrganism(2, {
  camouflage: 0.95,
  bodySize: 2.8,
  bodyShape: 3
});

const baselineCell = context.PS.atlas.getTraitOrganismCell(baseline, 0);
const baselineAgain = context.PS.atlas.getTraitOrganismCell(baseline, 0);
const aquaticCell = context.PS.atlas.getTraitOrganismCell(aquatic, 0);
const heatCell = context.PS.atlas.getTraitOrganismCell(heatSpined, 0);
const camoCell = context.PS.atlas.getTraitOrganismCell(camouflaged, 0);
const lookupOrganisms = [];

for (let i = 0; i < 1400; i++) {
  lookupOrganisms.push(
    makeOrganism(1 + (i % 4), {
      bodySize: 0.5 + (i % 6) * 0.25,
      bodyShape: i % 8,
      limbCount: i % 13,
      appendageType: i % 8,
      camouflage: (i % 5) / 4,
      thermalTolerance: (i % 5) / 4,
      waterDependency: ((i + 2) % 5) / 4
    })
  );
}

for (let i = 0; i < lookupOrganisms.length; i++) {
  context.PS.atlas.getTraitOrganismCell(lookupOrganisms[i], i % 4);
}

const beforeWarmLookup = performance.now();

for (let i = 0; i < lookupOrganisms.length; i++) {
  context.PS.atlas.getTraitOrganismCell(lookupOrganisms[i], i % 4);
}

const warmLookupMs = performance.now() - beforeWarmLookup;
const stats = context.PS.atlas.getStats();

assert.strictEqual(baselineCell, baselineAgain, "same organism traits should reuse the cached atlas cell");
assert.notStrictEqual(baselineCell.name, aquaticCell.name, "water dependency should be part of organism atlas identity");
assert.notStrictEqual(baselineCell.name, heatCell.name, "thermal tolerance should be part of organism atlas identity");
assert.notStrictEqual(aquaticCell.name, heatCell.name, "ecological trait buckets should not collide");
assert.ok(baselineCell.name.split(".").length >= 11, "organism cell key should encode bounded ecology buckets");
assert.notDeepStrictEqual(pixelAt(aquaticCell, 2, 7), pixelAt(baselineCell, 2, 7), "aquatic traits should add visible fin pixels");
assert.notDeepStrictEqual(pixelAt(heatCell, 7, 5), pixelAt(baselineCell, 7, 5), "thermal traits should add visible body marks");
assert.notDeepStrictEqual(pixelAt(camoCell, 7, 7), pixelAt(baselineCell, 7, 7), "lineage/body traits should remain visibly distinct");
assert.ok(uniqueColorCount(aquaticCell) >= uniqueColorCount(baselineCell), "trait-decorated cells should preserve dense pixel detail");
assert.ok(stats.traitCells >= 4, "atlas stats should count generated organism trait sprite cells");
assert.ok(warmLookupMs < 16, "1400 cached organism atlas lookups should stay under 16ms, got " + warmLookupMs.toFixed(3) + "ms");

console.log("organism atlas identity checks passed");
