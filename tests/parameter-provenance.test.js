const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const namespaceSource = read("js/core/namespace.js");
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
assert.ok(namespaceSource.indexOf("js/sim/parameter-registry.js") > namespaceSource.indexOf("js/sim/compute-harness.js"), "parameter registry should load after compute primitives");
assert.ok(namespaceSource.indexOf("js/sim/parameter-registry.js") < namespaceSource.indexOf("js/sim/heat-diffusion.js"), "parameter registry should load before simulation passes");
assert.ok(namespaceSource.indexOf("js/sim/environment-drivers.js") > namespaceSource.indexOf("js/sim/lenia.js"), "environment drivers should load after physical, chemistry, MD, and Lenia helpers");
assert.ok(namespaceSource.indexOf("js/sim/environment-drivers.js") < namespaceSource.indexOf("wasm/pixeldarium-sim.js"), "environment drivers should load before WASM bridge and coupling");
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

const parameters = context.PS.sim.parameters;
const drivers = context.PS.sim.environmentDrivers;
const geo = context.PS.sim.geochemistry;
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
assert.ok(parameters.get("atmosphere.co2_ppm", parameterConfig).fields.includes("ocean_ph"), "CO2 should declare ocean pH as affected field");

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
});

const hadean = parameters.createBaseline({ config: parameterConfig, epoch: "hadean" });
const custom = parameters.createBaseline({
  config: parameterConfig,
  epoch: "hadean",
  planetSpec: { "atmosphere.co2_ppm": 900, "volcanic.activity": 0.2 }
});
assert.strictEqual(hadean.values["atmosphere.co2_ppm"], 100000, "epoch preset should seed high Hadean CO2");
assert.strictEqual(parameters.trace(hadean, "atmosphere.co2_ppm").source, "epoch_preset:hadean", "epoch baseline should keep provenance");
assert.ok(parameters.trace(hadean, "atmosphere.co2_ppm").determinedBy.indexOf("outgassing") >= 0, "provenance trace should preserve causal determination rule");
assert.strictEqual(custom.values["atmosphere.co2_ppm"], 900, "planet spec should override baseline CO2");
assert.strictEqual(parameters.trace(custom, "atmosphere.co2_ppm").source, "planet_spec", "planet spec override should keep provenance");

const fieldContract = drivers.getFieldContract(driverConfig);
assert.ok(fieldContract.volcanic_emission.readBy.includes("geochemistry"), "volcanic emission should be consumed by geochemistry");
assert.ok(fieldContract.atmosphere.readBy.includes("heat-diffusion"), "atmosphere should be a named driver output consumed by heat diffusion");
assert.ok(fieldContract.ocean_ph.readBy.includes("lenia"), "ocean pH should be consumed by Lenia");
assert.ok(fieldContract.albedo.readBy.includes("heat-diffusion"), "albedo should be consumed by heat diffusion");

driverConfig.drivers.forEach(function (driver) {
  assert.ok(Array.isArray(driver.causes) && driver.causes.length > 0, driver.id + " should declare upstream causes");
  assert.ok(Array.isArray(driver.outputs) && driver.outputs.length > 0, driver.id + " should declare upstream outputs");
  assert.ok(Array.isArray(driver.forbiddenOutputs) && driver.forbiddenOutputs.length > 0, driver.id + " should declare forbidden tuned outcomes");
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
drivers.evolve(volcanic, { events: [{ type: "volcanism", strength: 2 }], dt: 1 });
assert.ok(volcanic.atmosphere.co2Ppm > quiet.atmosphere.co2Ppm, "volcanism should raise upstream CO2");
assert.ok(volcanic.atmosphere.so2Ppm > quiet.atmosphere.so2Ppm, "volcanism should raise upstream SO2");
assert.ok(volcanic.fields.mineral_distribution > quiet.fields.mineral_distribution, "volcanism should raise mineral distribution");
assert.ok(volcanic.fields.ocean_ph < quiet.fields.ocean_ph, "volcanism-driven CO2 should lower ocean pH");

const dusty = drivers.createState({ baseline: parameters.createBaseline({ config: parameterConfig, epoch: "civilization" }) });
drivers.evolve(dusty, { events: [{ type: "asteroid_dust", strength: 1.5 }], dt: 1 });
assert.ok(dusty.fields.albedo > quiet.fields.albedo, "dust should raise albedo");
assert.ok(dusty.fields.solar_forcing < quiet.fields.solar_forcing, "dust should reduce solar forcing");

const bloom = drivers.createState({ baseline: parameters.createBaseline({ config: parameterConfig, epoch: "civilization" }) });
drivers.evolve(bloom, { events: [{ type: "runaway_biology", strength: 5, dt: 4 }], dt: 1 });
assert.ok(bloom.atmosphere.co2Ppm < quiet.atmosphere.co2Ppm, "runaway biology should consume CO2");
assert.ok(bloom.atmosphere.o2Ppm > quiet.atmosphere.o2Ppm, "runaway biology should produce O2");
assert.ok(bloom.fields.ocean_ph > quiet.fields.ocean_ph, "biology-driven CO2 drawdown should raise pH");

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
