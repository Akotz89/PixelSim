const { assert, read } = require("./helpers/world-context.js");

const assertSource = read("js/core/assert.js");
const bitsmapSource = read("js/core/bitsmap.js");
const entityRegistrySource = read("js/core/entity-registry.js");
const resourceRegistrySource = read("js/sim/resource-registry.js");
const layerRegistrySource = read("js/layers/registry.js");
const civilizationsSource = read("js/sim/civilizations.js");
const organismAiSource = read("js/sim/organism-ai.js");
const terrainPressureSource = read("js/sim/terrain-pressure.js");
const lineageTrackingSource = read("js/sim/lineage-tracking.js");
const biomeLutSource = read("js/sim/biome-lut.js");
const parameterRegistrySource = read("js/sim/parameter-registry.js");
const environmentDriversSource = read("js/sim/environment-drivers.js");
const geochemistrySource = read("js/sim/geochemistry.js");
const molecularDynamicsSource = read("js/sim/molecular-dynamics.js");
const moistureSource = read("js/sim/moisture.js");
const pixelCaSource = read("js/sim/pixel-ca.js");
const reactionDiffusionSource = read("js/sim/reaction-diffusion.js");
const lbmOceanSource = read("js/sim/lbm-ocean.js");
const thermohalineSource = read("js/sim/thermohaline.js");
const heatDiffusionSource = read("js/sim/heat-diffusion.js");
const leniaSource = read("js/sim/lenia.js");
const migratedAssertConsumers = [
  "js/core/events.js",
  "js/core/log.js",
  "js/systems/pool-manager.js",
  "js/render/wgsl-shader-manager.js"
];
const migratedBitsmapConsumers = [
  "js/render/environment-overlays.js",
  "js/sim/vegetation.js"
];
const migratedEntityRegistryConsumers = [
  "js/main-loop.js",
  "js/sim/organisms-traits.js"
];
const migratedResourceRegistryConsumers = [
  "js/sim/settlements-growth.js",
  "js/sim/settlements-founding.js",
  "js/sim/settlements-routes.js",
  "js/ui/inspect-history.js",
  "js/ui/summary.js"
];
const migratedLayerRegistryConsumers = [
  "js/layers/geology.js",
  "js/layers/atmosphere.js",
  "js/main-simulation.js"
];
const migratedOrganismAiConsumers = [
  "js/sim/organisms-behavior.js",
  "js/systems/persistence-db.js",
  "js/systems/persistence-restore-entities.js"
];
const migratedTerrainPressureConsumers = [
  "js/sim/organisms-behavior.js",
  "js/sim/representatives.js",
  "js/ui/observation-overlays.js"
];
const migratedLineageTrackingConsumers = [
  "js/main-simulation.js",
  "js/systems/persistence-io.js",
  "js/ui/bookmarks.js",
  "js/ui/evolutionary-tree.js",
  "js/ui/inspect.js",
  "js/ui/observation-overlays.js",
  "js/ui/summary.js",
  "js/ui/timeline.js"
];
const migratedBiomeLutConsumers = [
  "js/epochs/state-machine.js",
  "js/sim/moisture.js"
];
const migratedParameterRegistryConsumers = [
  "js/sim/environment-drivers.js"
];
const migratedEnvironmentDriversConsumers = [
  "js/epochs/state-machine.js"
];
const migratedGeochemistryConsumers = [
  "js/layers/atmosphere.js",
  "js/sim/environment-drivers.js"
];
const migratedHeatDiffusionConsumers = [
  "js/epochs/state-machine.js",
  "js/main-loop.js"
];
const migratedLeniaConsumers = [
  "js/epochs/state-machine.js",
  "js/ui/observation-overlays.js"
];

assert.ok(
  /export\s+\{\s*assertRuntime\s+as\s+assert\s*\}/.test(assertSource),
  "assert core should expose assert as a direct ES module export"
);
assert.strictEqual(
  assertSource.indexOf("namespace.js"),
  -1,
  "assert core should not import the PS namespace"
);
assert.strictEqual(
  assertSource.indexOf("PS.assert"),
  -1,
  "assert core should not register through PS.assert"
);

migratedAssertConsumers.forEach(function(file) {
  const source = read(file);

  assert.strictEqual(
    source.indexOf("PS.assert"),
    -1,
    file + " should import assert directly instead of using PS.assert"
  );
});

assert.ok(
  /export\s+function\s+Bitsmap\s*\(/.test(bitsmapSource),
  "Bitsmap core should expose Bitsmap as a direct ES module export"
);
assert.strictEqual(
  bitsmapSource.indexOf("namespace.js"),
  -1,
  "Bitsmap core should not import the PS namespace"
);
assert.strictEqual(
  bitsmapSource.indexOf("PS.core.Bitsmap"),
  -1,
  "Bitsmap core should not register through PS.core.Bitsmap"
);

migratedBitsmapConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { Bitsmap }") >= 0,
    file + " should import Bitsmap directly"
  );
  assert.strictEqual(
    source.indexOf("PS.core.Bitsmap"),
    -1,
    file + " should instantiate Bitsmap directly instead of using PS.core.Bitsmap"
  );
});

assert.ok(
  /export\s+const\s+EntityRegistry\s*=/.test(entityRegistrySource),
  "EntityRegistry core should expose EntityRegistry as a direct ES module export"
);
assert.strictEqual(
  entityRegistrySource.indexOf("namespace.js"),
  -1,
  "EntityRegistry core should not import the PS namespace"
);
assert.strictEqual(
  entityRegistrySource.indexOf("PS.core.EntityRegistry"),
  -1,
  "EntityRegistry core should not register through PS.core.EntityRegistry"
);

migratedEntityRegistryConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { EntityRegistry }") >= 0,
    file + " should import EntityRegistry directly"
  );
  assert.strictEqual(
    source.indexOf("PS.core.EntityRegistry"),
    -1,
    file + " should use EntityRegistry directly instead of PS.core.EntityRegistry"
  );
});

assert.ok(
  /export\s+const\s+resourceRegistry\s*=/.test(resourceRegistrySource),
  "resource registry should expose resourceRegistry as a direct ES module export"
);
assert.strictEqual(
  resourceRegistrySource.indexOf("namespace.js"),
  -1,
  "resource registry should not import the PS namespace"
);
assert.strictEqual(
  resourceRegistrySource.indexOf("PS.sim.resources"),
  -1,
  "resource registry should not register through PS.sim.resources"
);

migratedResourceRegistryConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { resourceRegistry }") >= 0,
    file + " should import resourceRegistry directly"
  );
  assert.strictEqual(
    source.indexOf("PS.sim.resources"),
    -1,
    file + " should use resourceRegistry directly instead of PS.sim.resources"
  );
});

assert.ok(
  /export\s+const\s+layerRegistry\s*=/.test(layerRegistrySource),
  "layer registry should expose layerRegistry as a direct ES module export"
);
assert.strictEqual(
  layerRegistrySource.indexOf("namespace.js"),
  -1,
  "layer registry should not import the PS namespace"
);
assert.strictEqual(
  layerRegistrySource.indexOf("PS.layers"),
  -1,
  "layer registry should not register through PS.layers"
);

migratedLayerRegistryConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { layerRegistry }") >= 0,
    file + " should import layerRegistry directly"
  );
  assert.strictEqual(
    source.indexOf("PS.layers"),
    -1,
    file + " should use layerRegistry directly instead of PS.layers"
  );
});

assert.ok(
  /export\s+const\s+civilizations\s*=/.test(civilizationsSource),
  "civilizations wrapper should expose civilizations as a direct ES module export"
);
assert.strictEqual(
  civilizationsSource.indexOf("namespace.js"),
  -1,
  "civilizations wrapper should not import the PS namespace"
);
assert.strictEqual(
  civilizationsSource.indexOf("PS.sim.civilizations"),
  -1,
  "civilizations wrapper should not register through PS.sim.civilizations"
);

assert.ok(
  /export\s+const\s+organismAi\s*=/.test(organismAiSource),
  "organism AI wrapper should expose organismAi as a direct ES module export"
);
assert.strictEqual(
  organismAiSource.indexOf("namespace.js"),
  -1,
  "organism AI wrapper should not import the PS namespace"
);
assert.strictEqual(
  organismAiSource.indexOf("PS.sim.organismAi"),
  -1,
  "organism AI wrapper should not register through PS.sim.organismAi"
);

migratedOrganismAiConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { organismAi }") >= 0,
    file + " should import organismAi directly"
  );
  assert.strictEqual(
    source.indexOf("PS.sim.organismAi"),
    -1,
    file + " should use organismAi directly instead of PS.sim.organismAi"
  );
});

assert.ok(
  /export\s+const\s+terrainPressure\s*=/.test(terrainPressureSource),
  "terrain pressure wrapper should expose terrainPressure as a direct ES module export"
);
assert.strictEqual(
  terrainPressureSource.indexOf("PS.sim.terrainPressure"),
  -1,
  "terrain pressure wrapper should not register through PS.sim.terrainPressure"
);

migratedTerrainPressureConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { terrainPressure }") >= 0,
    file + " should import terrainPressure directly"
  );
  assert.strictEqual(
    source.indexOf("PS.sim.terrainPressure"),
    -1,
    file + " should use terrainPressure directly instead of PS.sim.terrainPressure"
  );
});

assert.ok(
  /export\s+const\s+lineageTracking\s*=/.test(lineageTrackingSource),
  "lineage tracking wrapper should expose lineageTracking as a direct ES module export"
);
assert.strictEqual(
  lineageTrackingSource.indexOf("PS.sim.lineageTracking"),
  -1,
  "lineage tracking wrapper should not register through PS.sim.lineageTracking"
);

migratedLineageTrackingConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { lineageTracking }") >= 0,
    file + " should import lineageTracking directly"
  );
  assert.strictEqual(
    source.indexOf("PS.sim.lineageTracking"),
    -1,
    file + " should use lineageTracking directly instead of PS.sim.lineageTracking"
  );
});

assert.ok(
  /export\s+const\s+biomeLut\s*=/.test(biomeLutSource),
  "biome LUT wrapper should expose biomeLut as a direct ES module export"
);
assert.strictEqual(
  biomeLutSource.indexOf("PS.sim.biomeLut"),
  -1,
  "biome LUT wrapper should not register through PS.sim.biomeLut"
);

migratedBiomeLutConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { biomeLut }") >= 0,
    file + " should import biomeLut directly"
  );
  assert.strictEqual(
    source.indexOf("PS.sim.biomeLut"),
    -1,
    file + " should use biomeLut directly instead of PS.sim.biomeLut"
  );
});

assert.ok(
  /export\s+const\s+parameters\s*=/.test(parameterRegistrySource),
  "parameter registry should expose parameters as a direct ES module export"
);
assert.strictEqual(
  parameterRegistrySource.indexOf("PS.sim.parameters"),
  -1,
  "parameter registry should not register through PS.sim.parameters"
);

migratedParameterRegistryConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { parameters") >= 0,
    file + " should import parameters directly"
  );
  assert.strictEqual(
    source.indexOf("PS.sim.parameters"),
    -1,
    file + " should use parameters directly instead of PS.sim.parameters"
  );
});

assert.ok(
  /export\s+const\s+environmentDrivers\s*=/.test(environmentDriversSource),
  "environment drivers should expose environmentDrivers as a direct ES module export"
);
assert.strictEqual(
  environmentDriversSource.indexOf("PS.sim.environmentDrivers"),
  -1,
  "environment drivers should not register through PS.sim.environmentDrivers"
);

migratedEnvironmentDriversConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { environmentDrivers }") >= 0,
    file + " should import environmentDrivers directly"
  );
  assert.strictEqual(
    source.indexOf("PS.sim.environmentDrivers"),
    -1,
    file + " should use environmentDrivers directly instead of PS.sim.environmentDrivers"
  );
});

assert.ok(
  /export\s+const\s+geochemistry\s*=/.test(geochemistrySource),
  "geochemistry wrapper should expose geochemistry as a direct ES module export"
);
assert.strictEqual(
  geochemistrySource.indexOf("PS.sim.geochemistry"),
  -1,
  "geochemistry wrapper should not register through PS.sim.geochemistry"
);

migratedGeochemistryConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { geochemistry }") >= 0,
    file + " should import geochemistry directly"
  );
  assert.strictEqual(
    source.indexOf("PS.sim.geochemistry"),
    -1,
    file + " should use geochemistry directly instead of PS.sim.geochemistry"
  );
});

assert.ok(
  /export\s+const\s+molecularDynamics\s*=/.test(molecularDynamicsSource),
  "molecular dynamics wrapper should expose molecularDynamics as a direct ES module export"
);
assert.strictEqual(
  molecularDynamicsSource.indexOf("PS.sim.molecularDynamics"),
  -1,
  "molecular dynamics wrapper should not register through PS.sim.molecularDynamics"
);

assert.ok(
  /export\s+const\s+moisture\s*=/.test(moistureSource),
  "moisture wrapper should expose moisture as a direct ES module export"
);
assert.strictEqual(
  moistureSource.indexOf("PS.sim.moisture"),
  -1,
  "moisture wrapper should not register through PS.sim.moisture"
);

assert.ok(
  /export\s+const\s+pixelCa\s*=/.test(pixelCaSource),
  "pixel CA wrapper should expose pixelCa as a direct ES module export"
);
assert.strictEqual(
  pixelCaSource.indexOf("PS.sim.pixelCa"),
  -1,
  "pixel CA wrapper should not register through PS.sim.pixelCa"
);

assert.ok(
  /export\s+const\s+reactionDiffusion\s*=/.test(reactionDiffusionSource),
  "reaction diffusion wrapper should expose reactionDiffusion as a direct ES module export"
);
assert.strictEqual(
  reactionDiffusionSource.indexOf("PS.sim.reactionDiffusion"),
  -1,
  "reaction diffusion wrapper should not register through PS.sim.reactionDiffusion"
);

assert.ok(
  /export\s+const\s+lbmOcean\s*=/.test(lbmOceanSource),
  "LBM ocean wrapper should expose lbmOcean as a direct ES module export"
);
assert.strictEqual(
  lbmOceanSource.indexOf("PS.sim.lbmOcean"),
  -1,
  "LBM ocean wrapper should not register through PS.sim.lbmOcean"
);

assert.ok(
  /export\s+const\s+thermohaline\s*=/.test(thermohalineSource),
  "thermohaline wrapper should expose thermohaline as a direct ES module export"
);
assert.strictEqual(
  thermohalineSource.indexOf("PS.sim.thermohaline"),
  -1,
  "thermohaline wrapper should not register through PS.sim.thermohaline"
);

assert.ok(
  /export\s+const\s+heatDiffusion\s*=/.test(heatDiffusionSource),
  "heat diffusion wrapper should expose heatDiffusion as a direct ES module export"
);
assert.strictEqual(
  heatDiffusionSource.indexOf("PS.sim.heatDiffusion"),
  -1,
  "heat diffusion wrapper should not register through PS.sim.heatDiffusion"
);

migratedHeatDiffusionConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { heatDiffusion }") >= 0,
    file + " should import heatDiffusion directly"
  );
  assert.strictEqual(
    source.indexOf("PS.sim.heatDiffusion"),
    -1,
    file + " should use heatDiffusion directly instead of PS.sim.heatDiffusion"
  );
});

assert.ok(
  /export\s+const\s+lenia\s*=/.test(leniaSource),
  "Lenia wrapper should expose lenia as a direct ES module export"
);
assert.strictEqual(
  leniaSource.indexOf("PS.sim.lenia"),
  -1,
  "Lenia wrapper should not register through PS.sim.lenia"
);

migratedLeniaConsumers.forEach(function(file) {
  const source = read(file);

  assert.ok(
    source.indexOf("import { lenia }") >= 0,
    file + " should import lenia directly"
  );
  assert.strictEqual(
    source.indexOf("PS.sim.lenia"),
    -1,
    file + " should use lenia directly instead of PS.sim.lenia"
  );
});

console.log("PS facade migration checks passed");
