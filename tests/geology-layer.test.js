const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const planetTiles = [];

for (let y = 0; y < 12; y++) {
  for (let x = 0; x < 16; x++) {
    planetTiles.push({
      x,
      y,
      elevation: x % 3 === 0 ? 0.8 : -0.2
    });
  }
}

const context = {
  assert,
  console,
  WORLD_WIDTH: 16,
  WORLD_HEIGHT: 12,
  window: {
    addEventListener() {}
  },
  world: {
    tick: 1,
    seedText: "AZR-290-GEOLOGY",
    era: "primordial",
    planetTiles
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/core/config.js",
  "js/core/assert.js",
  "js/core/math.js",
  "js/layers/registry.js",
  "js/layers/geology.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

var manifest = layerRegistry.getManifest();
assert.strictEqual(manifest[0].id, "geology", "geology should register in the layer manifest");
assert.strictEqual(manifest[0].alwaysOn, true, "geology should be always-on");

var geologyLayer = layerRegistry.get("geology");
var state = geologyLayer.ensureState();
assert.ok(state.plates.length >= CONFIG.GEOLOGY_PLATE_MIN, "world creation should define at least the configured minimum plates");
assert.ok(state.plates.length <= CONFIG.GEOLOGY_PLATE_MAX, "world creation should define no more than the configured maximum plates");
assert.ok(state.plates.every(function(plate) {
  return Number.isFinite(plate.velocityX) && Number.isFinite(plate.velocityY);
}), "every plate should have finite drift velocity");

assert.ok(state.boundaries.some(function(boundary) {
  return boundary.type === "collision";
}), "geology should model collision zones");
assert.ok(state.boundaries.some(function(boundary) {
  return boundary.type === "subduction";
}), "geology should model subduction zones");
assert.ok(state.hotspots.length >= 3, "geology should define volcanic hotspots");
assert.ok(state.volcanicActivity > 0, "volcanic activity should include hotspots and active boundaries");

var firstPlate = state.plates[0];
var driftX = firstPlate.driftX;
var mountainMass = state.mountainMass;
var updated = layerRegistry.updateAll(1000);

assert.deepStrictEqual(updated, ["geology"], "layer registry should update geology as an always-on layer");
assert.notStrictEqual(firstPlate.driftX, driftX, "plate drift should advance with layer updates");
assert.ok(state.mountainMass >= mountainMass, "collision zones should form mountain mass");
assert.ok(state.erosionSediment > 0, "erosion should produce sediment");
assert.ok(state.basinSediment >= 0, "sediment should fill basins");
assert.ok(state.continentFormation > 0, "continents should form over geological time");
assert.ok(state.hydrothermalVents >= 0, "subduction and rifts should expose hydrothermal vent counts");

assert.ok(world.planetTiles.some(function(tile) {
  return tile.tectonicPlateId && Number.isFinite(tile.tectonicStress);
}), "planet tiles should receive tectonic annotations");
assert.ok(world.planetTiles.some(function(tile) {
  return Number.isFinite(tile.erosionRate) && Number.isFinite(tile.geologyElevationDelta);
}), "planet tiles should receive erosion and elevation delta annotations");

console.log("geology layer checks passed");
`, context);

const mainLoopSource = read("js/main-simulation.js");

assert.ok(
  /function updateWorld\(dt\)/.test(mainLoopSource) &&
    mainLoopSource.includes("layerRegistry.updateAll(dt)"),
  "main simulation tick should advance always-on layers"
);
