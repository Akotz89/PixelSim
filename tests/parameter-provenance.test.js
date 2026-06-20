const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
const parameterSource = read("js/sim/parameter-registry.js");
const driverSource = read("js/sim/environment-drivers.js");
const geochemistrySource = read("js/sim/geochemistry.js");
const parameterConfigSource = read("sim/configs/parameters.json");
const driverConfigSource = read("sim/configs/environment-drivers.json");
const parameterSidecar = read("sim/configs/parameters.json.js");
const driverSidecar = read("sim/configs/environment-drivers.json.js");
const docs = read("docs/parameter-provenance-drivers.md");
const packageJson = JSON.parse(read("package.json"));

assert.ok(packageJson.scripts.test.includes("tests/parameter-provenance.test.js"), "npm test should include parameter provenance checks");
assert.ok(manifestSource.indexOf("js/sim/parameter-registry.js") > manifestSource.indexOf("js/sim/compute-harness.js"), "parameter registry should load after compute primitives");
assert.ok(manifestSource.indexOf("js/sim/parameter-registry.js") < manifestSource.indexOf("js/sim/heat-diffusion.js"), "parameter registry should load before simulation passes");
assert.ok(manifestSource.indexOf("js/sim/environment-drivers.js") > manifestSource.indexOf("js/sim/lenia.js"), "environment drivers should load after physical, chemistry, MD, and Lenia helpers");
assert.ok(manifestSource.indexOf("js/sim/environment-drivers.js") < manifestSource.indexOf("wasm/pixeldarium-sim.js"), "environment drivers should load before WASM bridge and coupling");
assert.ok(docs.includes("Drivers do not write coral density"), "docs should ban downstream population tuning");

assert.ok(parameterSidecar.includes('PS.assets.registerJSON("sim/configs/parameters.json"'), "parameter sidecar should register JSON");
assert.ok(driverSidecar.includes('PS.assets.registerJSON("sim/configs/environment-drivers.json"'), "driver sidecar should register JSON");

const sidecarContext = {
  PS: {
    assets: {
      jsonData: {},
      registerJSON(url, json) {
        this.jsonData[url] = json;
      }
    }
  }
};
vm.createContext(sidecarContext);
vm.runInContext(parameterSidecar, sidecarContext, { filename: "sim/configs/parameters.json.js" });
vm.runInContext(driverSidecar, sidecarContext, { filename: "sim/configs/environment-drivers.json.js" });
assert.strictEqual(JSON.stringify(sidecarContext.PS.assets.jsonData["sim/configs/parameters.json"]), JSON.stringify(JSON.parse(parameterConfigSource)), "parameter sidecar should match raw JSON");
assert.strictEqual(JSON.stringify(sidecarContext.PS.assets.jsonData["sim/configs/environment-drivers.json"]), JSON.stringify(JSON.parse(driverConfigSource)), "driver sidecar should match raw JSON");

const context = {
  PS: { sim: {} },
  Promise,
  Object,
  String,
  Number,
  Math,
  Error,
  Array,
  Float32Array
};
vm.createContext(context);
vm.runInContext(parameterSource, context, { filename: "js/sim/parameter-registry.js" });
vm.runInContext(geochemistrySource, context, { filename: "js/sim/geochemistry.js" });
vm.runInContext(driverSource, context, { filename: "js/sim/environment-drivers.js" });

const parameters = context.parameters;
const drivers = context.environmentDrivers;
const geo = context.geochemistry;
const parameterConfig = JSON.parse(parameterConfigSource);
const driverConfig = JSON.parse(driverConfigSource);

context.PS.assets = {
  jsonData: {
    "sim/configs/parameters.json": parameterConfig,
    "sim/configs/environment-drivers.json": driverConfig
  }
};
assert.strictEqual(parameters.list().length, parameterConfig.parameters.length, "registered sidecar should be the no-loader parameter fallback");
assert.strictEqual(drivers.normalizeConfig().drivers.length, driverConfig.drivers.length, "registered sidecar should be the no-loader driver fallback");

const registryReport = parameters.validateRegistry(parameterConfig);
assert.strictEqual(registryReport.valid, true, "all parameters should have unit/range/provenance/cadence");
assert.strictEqual(registryReport.errors.length, 0, "parameter ontology errors should be explicit");
assert.ok(parameters.get("atmosphere.co2_ppm", parameterConfig).fields.includes("ocean_ph"), "CO2 should declare ocean pH as affected field");

const allowedFamilies = parameterConfig.schema.allowedFamilies;
const allowedSourceClasses = parameterConfig.schema.allowedSourceClasses;
assert.ok(allowedFamilies.includes("stellar_orbital"), "parameter schema should name stellar/orbital family");
assert.ok(allowedFamilies.includes("biology"), "parameter schema should name biology family");
assert.ok(allowedSourceClasses.includes("formation"), "parameter schema should distinguish formation sources");
assert.ok(allowedSourceClasses.includes("epoch_or_planet_spec"), "parameter schema should distinguish epoch or planet spec sources");
assert.ok(allowedSourceClasses.includes("derived_upstream"), "parameter schema should distinguish derived upstream fields");
assert.ok(allowedSourceClasses.includes("model_state"), "parameter schema should distinguish model state values");
assert.ok(allowedSourceClasses.includes("exogenous_driver"), "parameter schema should distinguish exogenous driver values");

const requiredParameterIds = [
  "stellar.mass_solar",
  "solar.constant_w_m2",
  "orbital.eccentricity",
  "orbital.axial_tilt_deg",
  "planet.radius_km",
  "planet.gravity_m_s2",
  "planet.rotation_hours",
  "surface.ocean_ratio",
  "surface.albedo",
  "crust.tectonic_activity",
  "volcanic.activity",
  "mineral.abundance_index",
  "atmosphere.pressure_kpa",
  "atmosphere.co2_ppm",
  "atmosphere.o2_ppm",
  "atmosphere.n2_ppm",
  "atmosphere.ch4_ppm",
  "atmosphere.so2_ppm",
  "ocean.salinity_psu",
  "ocean.ph",
  "hydrology.precipitation_mm_tick",
  "biology.primary_productivity",
  "biology.co2_to_o2_rate_ppm",
  "biology.mutation_rate"
];
assert.strictEqual(registryReport.count, requiredParameterIds.length, "base parameter catalog should cover the current canonical set");
requiredParameterIds.forEach(function (id) {
  const entry = parameters.get(id, parameterConfig);
  assert.ok(entry, id + " should exist in the base parameter catalog");
  assert.ok(entry.determinedBy && entry.determinedBy.length > 12, id + " should explain how it is determined");
  assert.ok(allowedFamilies.includes(entry.family), id + " should declare a canonical family");
  assert.ok(allowedSourceClasses.includes(entry.sourceClass), id + " should declare an allowed source class");
});
assert.strictEqual(parameters.get("volcanic.activity", parameterConfig).sourceClass, "exogenous_driver", "volcanic activity should be driven as outside/internal event input");
assert.strictEqual(parameters.get("ocean.ph", parameterConfig).sourceClass, "derived_upstream", "ocean pH should be derived from upstream chemistry");
assert.ok(parameters.get("atmosphere.co2_ppm", parameterConfig).driverIds.includes("volcanism"), "CO2 should name volcanism as a driver");
assert.ok(parameters.get("atmosphere.o2_ppm", parameterConfig).driverIds.includes("runaway_biology"), "O2 should name runaway biology as a driver");

const hadean = parameters.createBaseline({ config: parameterConfig, epoch: "hadean" });
const custom = parameters.createBaseline({
  config: parameterConfig,
  epoch: "hadean",
  planetSpec: { "atmosphere.co2_ppm": 900, "volcanic.activity": 0.2 }
});
assert.strictEqual(hadean.values["atmosphere.co2_ppm"], 100000, "epoch preset should seed high Hadean CO2");
assert.strictEqual(parameters.trace(hadean, "atmosphere.co2_ppm").source, "epoch_preset:hadean", "epoch baseline should keep provenance");
assert.strictEqual(parameters.trace(hadean, "atmosphere.co2_ppm").family, "atmosphere", "trace should preserve parameter family");
assert.strictEqual(parameters.trace(hadean, "atmosphere.co2_ppm").sourceClass, "epoch_or_planet_spec", "trace should preserve source class");
assert.ok(parameters.trace(hadean, "atmosphere.co2_ppm").determinedBy.indexOf("outgassing") >= 0, "provenance trace should preserve causal determination rule");
assert.strictEqual(custom.values["atmosphere.co2_ppm"], 900, "planet spec should override baseline CO2");
assert.strictEqual(parameters.trace(custom, "atmosphere.co2_ppm").source, "planet_spec", "planet spec override should keep provenance");

const fieldContract = drivers.getFieldContract(driverConfig);
assert.ok(fieldContract.volcanic_emission.readBy.includes("geochemistry"), "volcanic emission should be consumed by geochemistry");
assert.ok(fieldContract.atmosphere.readBy.includes("heat-diffusion"), "atmosphere should be a named driver output consumed by heat diffusion");
assert.ok(fieldContract.ocean_ph.readBy.includes("lenia"), "ocean pH should be consumed by Lenia");
assert.ok(fieldContract.albedo.readBy.includes("heat-diffusion"), "albedo should be consumed by heat diffusion");

const driverReport = drivers.validateConfig(driverConfig);
assert.strictEqual(driverReport.valid, true, "all drivers should pass schema validation");
assert.strictEqual(driverReport.errors.length, 0, "driver schema errors should be explicit");
assert.ok(driverConfig.schema.eventFields.includes("startTick"), "driver schema should represent start tick");
assert.ok(driverConfig.schema.eventFields.includes("durationTicks"), "driver schema should represent duration");
assert.ok(driverConfig.schema.eventFields.includes("decay"), "driver schema should represent decay");

driverConfig.drivers.forEach(function (driver) {
  assert.ok(Array.isArray(driver.causes) && driver.causes.length > 0, driver.id + " should declare upstream causes");
  assert.ok(Array.isArray(driver.outputs) && driver.outputs.length > 0, driver.id + " should declare upstream outputs");
  assert.ok(Array.isArray(driver.forbiddenOutputs) && driver.forbiddenOutputs.length > 0, driver.id + " should declare forbidden tuned outcomes");
  assert.ok(driver.kind === "exogenous" || driver.kind === "internal_feedback" || driver.kind === "intervention", driver.id + " should classify driver kind");
  assert.ok(driver.eventSchema && Number.isFinite(Number(driver.eventSchema.durationTicks)), driver.id + " should declare a time event schema");
  assert.ok(driverConfig.schema.allowedDecay.includes(driver.eventSchema.decay), driver.id + " should use an allowed decay curve");
  assert.strictEqual(
    driver.outputs.some(function (field) {
      return String(field).indexOf("target_") === 0 || String(field).indexOf("coral_density") >= 0;
    }),
    false,
    driver.id + " should not write target outcomes"
  );
});

const quiet = drivers.createState({ baseline: parameters.createBaseline({ config: parameterConfig, epoch: "civilization" }) });
const volcanic = drivers.createState({ baseline: parameters.createBaseline({ config: parameterConfig, epoch: "civilization" }) });
drivers.evolve(volcanic, { events: [{ type: "volcanism", strength: 2, startTick: 1, durationTicks: 3, decay: "linear" }], dt: 1 });
assert.ok(volcanic.atmosphere.co2Ppm > quiet.atmosphere.co2Ppm, "volcanism should raise upstream CO2");
assert.ok(volcanic.atmosphere.so2Ppm > quiet.atmosphere.so2Ppm, "volcanism should raise upstream SO2");
assert.ok(volcanic.fields.mineral_distribution > quiet.fields.mineral_distribution, "volcanism should raise mineral distribution");
assert.ok(volcanic.fields.ocean_ph < quiet.fields.ocean_ph, "volcanism-driven CO2 should lower ocean pH");
assert.strictEqual(volcanic.events[0].startTick, 1, "event trace should preserve start tick");
assert.strictEqual(volcanic.events[0].durationTicks, 3, "event trace should preserve duration");

const dusty = drivers.createState({ baseline: parameters.createBaseline({ config: parameterConfig, epoch: "civilization" }) });
drivers.evolve(dusty, { events: [{ type: "asteroid_dust", strength: 1.5 }], dt: 1 });
assert.ok(dusty.fields.albedo > quiet.fields.albedo, "dust should raise albedo");
assert.ok(dusty.fields.solar_forcing < quiet.fields.solar_forcing, "dust should reduce solar forcing");

const bloom = drivers.createState({ baseline: parameters.createBaseline({ config: parameterConfig, epoch: "civilization" }) });
drivers.evolve(bloom, { events: [{ type: "runaway_biology", strength: 5, dt: 4 }], dt: 1 });
assert.ok(bloom.atmosphere.co2Ppm < quiet.atmosphere.co2Ppm, "runaway biology should consume CO2");
assert.ok(bloom.atmosphere.o2Ppm > quiet.atmosphere.o2Ppm, "runaway biology should produce O2");
assert.ok(bloom.fields.ocean_ph > quiet.fields.ocean_ph, "biology-driven CO2 drawdown should raise pH");

const intervention = drivers.createState({ baseline: parameters.createBaseline({ config: parameterConfig, epoch: "civilization" }) });
drivers.evolve(intervention, { events: [{ type: "agent_intervention", strength: 1, fields: { albedo: 0.5 } }], dt: 1 });
assert.strictEqual(intervention.fields.albedo, 0.5, "agent intervention should patch declared upstream fields");
assert.throws(function () {
  drivers.evolve(drivers.createState({ baseline: parameters.createBaseline({ config: parameterConfig, epoch: "civilization" }) }), {
    events: [{ type: "agent_intervention", strength: 1, fields: { coral_density: 0.8 } }],
    dt: 1
  });
}, /forbidden outcome|undeclared field/, "agent intervention should not patch downstream target outcomes");

assert.throws(function () {
  drivers.evolve(drivers.createState({ baseline: parameters.createBaseline({ config: parameterConfig, epoch: "civilization" }) }), {
    events: [{ type: "unknown_target_tuner", strength: 1 }],
    dt: 1
  });
}, /Unknown environmental driver/, "unknown driver events should hard fail instead of silently tuning");

const quietGeo = geo.createState({ width: 4, height: 4, epoch: "civilization", volcanicValue: 0, vegetationValue: 0, oceanRatio: 1 });
const volcanicInputs = drivers.makeGeochemistryInputs(volcanic, 4, 4);
const volcanicGeo = geo.createState({
  width: 4,
  height: 4,
  epoch: "civilization",
  co2Ppm: volcanicInputs.co2Ppm,
  o2Ppm: volcanicInputs.o2Ppm,
  volcanicValue: volcanic.fields.volcanic_emission,
  vegetationValue: 0,
  oceanRatio: 1
});
geo.stepCpu(quietGeo, { dt: 2 });
geo.stepCpu(volcanicGeo, { dt: 2 });
assert.ok(volcanicGeo.summary.co2Ppm > quietGeo.summary.co2Ppm, "driver-raised volcanic field should causally raise geochemistry CO2");
assert.ok(volcanicGeo.summary.so2Ppm > quietGeo.summary.so2Ppm, "driver-raised volcanic field should causally raise geochemistry SO2");
assert.ok(volcanicGeo.summary.oceanPh < quietGeo.summary.oceanPh, "driver-raised volcanic CO2 should causally acidify ocean pH");

console.log("parameter provenance checks passed", JSON.stringify({
  parameters: registryReport.count,
  volcanicCo2: Number(volcanic.atmosphere.co2Ppm.toFixed(2)),
  bloomCo2: Number(bloom.atmosphere.co2Ppm.toFixed(2))
}));
