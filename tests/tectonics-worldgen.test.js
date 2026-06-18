const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

const root = path.resolve(__dirname, "..");
const packageSource = fs.readFileSync(path.join(root, "package.json"), "utf8");
const adapterSource = fs.readFileSync(path.join(root, "src/worldgen/tectonics-adapter.js"), "utf8");
const erosionSource = fs.readFileSync(path.join(root, "src/worldgen/erosion.js"), "utf8");
const riversSource = fs.readFileSync(path.join(root, "src/worldgen/rivers.js"), "utf8");
const generatorSource = fs.readFileSync(path.join(root, "src/worldgen/planet-generator.js"), "utf8");

assert.ok(JSON.parse(packageSource).scripts.test.includes("tests/tectonics-worldgen.test.js"), "npm test should include tectonics worldgen checks");
assert.ok(adapterSource.includes("runTectonicsjs"), "adapter should expose runTectonicsjs");
assert.ok(adapterSource.includes("tectonics.js-adapter:embedded-headless"), "adapter should identify embedded headless fallback");
assert.ok(adapterSource.includes("createElevationTextureDescriptor"), "adapter should expose r32float elevation texture descriptor");
assert.ok(erosionSource.includes("runErosion"), "erosion module should expose runErosion");
assert.ok(riversSource.includes("D8-steepest-downhill"), "rivers module should implement D8 flow");
assert.ok(generatorSource.includes("generatePlanet"), "planet generator should expose generatePlanet");

const tectonics = require("../src/worldgen/tectonics-adapter");
const erosion = require("../src/worldgen/erosion");
const rivers = require("../src/worldgen/rivers");
const planetGenerator = require("../src/worldgen/planet-generator");

function countValues(values, predicate) {
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (predicate(values[i], i)) {
      count += 1;
    }
  }
  return count;
}

function maxValue(values) {
  let max = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    max = Math.max(max, Number(values[i]) || 0);
  }
  return max;
}

function minValue(values) {
  let min = Infinity;
  for (let i = 0; i < values.length; i += 1) {
    min = Math.min(min, Number(values[i]) || 0);
  }
  return min;
}

(async function() {
  assert.strictEqual(typeof global.window, "undefined", "headless worldgen test should not require browser window");
  assert.strictEqual(typeof global.document, "undefined", "headless worldgen test should not require DOM document");

  const mockEngine = {
    generate(seed, params) {
      return {
        seed,
        params,
        elevation: new Float32Array([1, -1, 2, -2]),
        ocean_mask: new Uint8Array([0, 1, 0, 1]),
        boundaries: new Float32Array(4),
        faults: new Float32Array(4),
        volcanic: new Float32Array(4),
        metadata: { width: 2, height: 2, engine: "mock-tectonics.js" }
      };
    }
  };
  const mockResult = await tectonics.runTectonicsjs("adapter-seam", { width: 2, height: 2, engine: mockEngine });
  assert.strictEqual(mockResult.metadata.engine, "mock-tectonics.js", "runTectonicsjs should wrap an injected headless tectonics.js-compatible engine");

  const tectonic = await tectonics.runTectonicsjs("AZR-833-TECTONIC", {
    width: 128,
    height: 128,
    tectonic_steps: 500,
    plate_count: 14
  });
  assert.strictEqual(tectonic.elevation.length, 128 * 128, "tectonic elevation should be r32float-sized");
  assert.strictEqual(tectonic.ocean_mask.length, 128 * 128, "tectonic ocean mask should match dimensions");
  assert.strictEqual(tectonic.boundaries.length, 128 * 128, "tectonic boundary map should match dimensions");
  assert.strictEqual(tectonic.metadata.elevation_format, "r32float", "tectonic export should declare r32float elevation");
  assert.ok(minValue(tectonic.elevation) < -4500, "ocean floor should include abyssal plains");
  assert.ok(maxValue(tectonic.elevation) > 1800, "collision zones should produce visible mountain ranges");
  assert.ok(maxValue(tectonic.elevation) <= 8849, "mountains should stay within Everest-scale cap");
  assert.ok(minValue(tectonic.elevation) >= -10000, "ocean floor should stay above -10000m cap");

  const landCells = countValues(tectonic.ocean_mask, (value) => value === 0);
  const waterCells = countValues(tectonic.ocean_mask, (value) => value === 1);
  const boundaryMountainCells = countValues(tectonic.elevation, (value, index) => value > 1200 && tectonic.boundaries[index] > 0.2);
  const ridgeOceanCells = countValues(tectonic.elevation, (value, index) => value > -3300 && value < 0 && tectonic.boundaries[index] > 0.2);
  assert.ok(landCells > 128 * 128 * 0.18 && waterCells > 128 * 128 * 0.35, "tectonics output should contain continents and oceans");
  assert.ok(boundaryMountainCells > 20, "mountain ranges should align with plate boundaries");
  assert.ok(ridgeOceanCells > 20, "ocean floor should vary with mid-ocean ridge-like boundary uplift");

  const eroded = erosion.runErosion(tectonic.elevation, 128, 128, {
    ocean_mask: tectonic.ocean_mask,
    erosion_passes: 3
  });
  assert.strictEqual(eroded.elevation.length, tectonic.elevation.length, "erosion should preserve elevation dimensions");
  assert.ok(eroded.metadata.peak_reduction_m > 0, "erosion should smooth mountain peaks");
  assert.ok(maxValue(eroded.elevation) < maxValue(tectonic.elevation), "erosion should reduce the highest peak");

  const riverNetwork = rivers.computeRiverNetwork(eroded.elevation, 128, 128, {
    ocean_mask: tectonic.ocean_mask,
    drainage_threshold: 55
  });
  const riverValidation = rivers.validateRiverNetwork(riverNetwork, eroded.elevation, tectonic.ocean_mask);
  assert.ok(riverValidation.valid, "D8 river network should flow downhill and reach ocean");
  assert.ok(riverValidation.riverCells > 0, "river network should create river cells");
  assert.ok(Array.from(riverNetwork.river_mask).every((value) => value === 0 || value === 1), "river mask should be binary for salinity model");

  const descriptor = tectonics.createElevationTextureDescriptor(512, 512);
  assert.strictEqual(descriptor.format, "r32float", "elevation texture descriptor should use r32float");
  assert.deepStrictEqual(descriptor.rangeMeters, [-10000, 8849], "elevation descriptor should document meter range");
  assert.ok(descriptor.consumers.includes("heat-diffusion"), "elevation should seed heat diffusion");
  assert.ok(descriptor.consumers.includes("lbm-ocean"), "elevation should seed LBM bathymetry");
  assert.ok(descriptor.consumers.includes("moisture"), "elevation should seed orographic moisture");

  const startedAt = performance.now();
  const planet = await planetGenerator.generatePlanet("AZR-833-PLANET", {
    width: 512,
    height: 512,
    tectonic_steps: 500,
    plate_count: 12,
    erosion_passes: 2
  });
  const elapsedMs = performance.now() - startedAt;
  const summary = planetGenerator.summarizePlanet(planet);
  assert.strictEqual(planet.elevation.length, 512 * 512, "generatePlanet should export 512x512 elevation");
  assert.strictEqual(planet.rivers.length, 512 * 512, "generatePlanet should export 512x512 river mask");
  assert.ok(summary.waterRatio > 0.35 && summary.waterRatio < 0.85, "generated planet should have realistic ocean coverage");
  assert.ok(summary.mountainCells > 100, "generated planet should retain mountain ranges");
  assert.ok(summary.abyssalCells > 100, "generated planet should retain abyssal ocean floor variation");
  assert.ok(summary.riverCells > 0, "generated planet should include river network");
  assert.ok(planet.metadata.rivers.reaches_ocean, "generated river network should reach ocean");
  assert.ok(elapsedMs < 5 * 60 * 1000, "512x512 generation should complete within five minutes");
  assert.ok(planet.metadata.generation_ms < 5 * 60 * 1000, "metadata should record generation within budget");

  console.log("tectonics worldgen checks passed", JSON.stringify({
    minElevationM: Math.round(summary.minElevationM),
    maxElevationM: Math.round(summary.maxElevationM),
    waterRatio: Number(summary.waterRatio.toFixed(3)),
    riverCells: summary.riverCells,
    elapsedMs: Number(elapsedMs.toFixed(3))
  }));
})().catch(function(error) {
  console.error(error);
  process.exit(1);
});
