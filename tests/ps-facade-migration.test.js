const { assert, read } = require("./helpers/world-context.js");

const assertSource = read("js/core/assert.js");
const bitsmapSource = read("js/core/bitsmap.js");
const entityRegistrySource = read("js/core/entity-registry.js");
const resourceRegistrySource = read("js/sim/resource-registry.js");
const layerRegistrySource = read("js/layers/registry.js");
const civilizationsSource = read("js/sim/civilizations.js");
const organismAiSource = read("js/sim/organism-ai.js");
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

console.log("PS facade migration checks passed");
