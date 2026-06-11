const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const context = {
  PS: {
    render: {},
    atlas: null
  },
  CONFIG: {
    LINEAGE_COLORS: ["#72d7ff", "#58f06c", "#c884ff", "#f4c84a"],
    ORGANISM_DRAW_SIZE: 8
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
  },
  world: {
    organisms: []
  },
  getFrameInterpolation() {
    return 1;
  },
  isGlobeRenderMode() {
    return false;
  },
  isPlanetLocalView() {
    return false;
  }
};

vm.createContext(context);
vm.runInContext(read("js/render/entity-atlas.js"), context, { filename: "js/render/entity-atlas.js" });
vm.runInContext(read("js/render/entity-atlas-organisms.js"), context, { filename: "js/render/entity-atlas-organisms.js" });
vm.runInContext(read("js/render/entities.js"), context, { filename: "js/render/entities.js" });

function makeOrganism(id, traits) {
  return {
    id,
    representativeId: id,
    lineageId: 1,
    x: 8,
    y: 8,
    prevX: 8,
    prevY: 8,
    energy: 100,
    traits: Object.assign({
      bodySize: 1,
      bodyShape: 1,
      limbCount: 4,
      appendageType: 0,
      camouflage: 0,
      thermalTolerance: 0.5,
      waterDependency: 0,
      carnivory: 0,
      movementTendency: 0.5,
      terrainAffinity: 0.5,
      intelligence: 0,
      sociality: 0
    }, traits || {})
  };
}

function cellBytes(cell) {
  const page = context.PS.atlas.pages[cell.pageIndex];
  const bytes = [];

  for (let y = 0; y < cell.h; y += 1) {
    for (let x = 0; x < cell.w; x += 1) {
      const index = ((cell.y + y) * page.width + cell.x + x) * 4;
      bytes.push(page.data[index], page.data[index + 1], page.data[index + 2], page.data[index + 3]);
    }
  }

  return bytes.join(",");
}

context.PS.atlas.ensurePage();

const aquaticPredator = makeOrganism(11, {
  bodySize: 2.7,
  bodyShape: 4,
  limbCount: 10,
  appendageType: 6,
  camouflage: 0.9,
  thermalTolerance: 0.9,
  waterDependency: 1,
  carnivory: 1,
  movementTendency: 1,
  terrainAffinity: 0,
  intelligence: 0.8,
  sociality: 0.9
});
const aquaticPredatorAgain = makeOrganism(11, Object.assign({}, aquaticPredator.traits));
const slowUplandGrazer = makeOrganism(12, {
  bodySize: 0.6,
  bodyShape: 2,
  limbCount: 2,
  appendageType: 1,
  camouflage: 0.1,
  thermalTolerance: 0,
  waterDependency: 0,
  carnivory: 0,
  movementTendency: 0,
  terrainAffinity: 1,
  intelligence: 0.1,
  sociality: 0
});

const firstSprite = context.PS.render.entities.generateSprite(aquaticPredator.traits, aquaticPredator.id, {
  organism: aquaticPredator,
  lineageId: aquaticPredator.lineageId,
  frameVariant: 2
});
const secondSprite = context.PS.render.entities.generateSprite(aquaticPredatorAgain.traits, aquaticPredatorAgain.id, {
  organism: aquaticPredatorAgain,
  lineageId: aquaticPredatorAgain.lineageId,
  frameVariant: 2
});
const grazerSprite = context.PS.render.entities.generateSprite(slowUplandGrazer.traits, slowUplandGrazer.id, {
  organism: slowUplandGrazer,
  lineageId: slowUplandGrazer.lineageId,
  frameVariant: 2
});

assert.strictEqual(firstSprite.morphologyKey, secondSprite.morphologyKey, "same seed/entity/traits should produce deterministic morphology key");
assert.strictEqual(firstSprite.cell, secondSprite.cell, "same morphology key should reuse the cached atlas cell");
assert.notStrictEqual(firstSprite.morphologyKey, grazerSprite.morphologyKey, "different trait vectors should produce distinct morphology keys");
assert.notStrictEqual(cellBytes(firstSprite.cell), cellBytes(grazerSprite.cell), "different morphology keys should produce visibly different sprite pixels");
assert.strictEqual(firstSprite.preview.tags.habitat, "aquatic", "water dependency should label aquatic morphology");
assert.strictEqual(firstSprite.preview.tags.defense, "predator", "carnivory should label predator morphology");
assert.strictEqual(firstSprite.preview.tags.cover, "camouflaged", "camouflage should label hidden morphology");
assert.strictEqual(firstSprite.preview.tags.motion, "fast", "movement tendency should label mobility morphology");
assert.strictEqual(firstSprite.preview.tags.mind, "social", "sociality should label social morphology");
assert.strictEqual(grazerSprite.preview.tags.scale, "tiny", "body size should label tiny morphology");
assert.strictEqual(grazerSprite.preview.tags.climate, "cold-adapted", "thermal tolerance should label cold morphology");
assert.strictEqual(grazerSprite.preview.tags.habitat, "upland", "terrain affinity should label upland morphology");

const cacheOrganism = makeOrganism(21, aquaticPredator.traits);
let cache = context.PS.render.entities.getOrganismSpriteCache(cacheOrganism, 0);
assert.ok(cache.cell, "sprite cache should store generated morphology cell");
cacheOrganism.energy = 250;
cache = context.PS.render.entities.getOrganismSpriteCache(cacheOrganism, 0);
assert.strictEqual(context.PS.render.entities.getOrganismRenderPerfStats().lastSpriteCacheHits, 1, "non-visual energy changes should not invalidate morphology cache");
cacheOrganism.traits.carnivory = 0;
cache = context.PS.render.entities.getOrganismSpriteCache(cacheOrganism, 0);
assert.ok(cache.morphologyKey.indexOf(".0.") >= 0, "meaningful trait deltas should refresh morphology key");

console.log("morphological rendering checks passed");
