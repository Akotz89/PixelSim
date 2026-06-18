const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

function nearlyDifferent(a, b) {
  return Math.abs(Number(a) - Number(b)) > 0.01;
}

const packageJson = JSON.parse(read("package.json"));
const namespaceSource = read("js/core/namespace.js");
const lightingSource = read("js/render/lighting-cycle.js");
const shadowSource = read("js/render/shadow-stamping.js");
const compositorSource = read("js/render/webgpu-compositor.js");
const shaderSource = read("shaders/gbuffer-compose.wgsl");

assert.ok(
  namespaceSource.indexOf("js/render/lighting-cycle.js") > namespaceSource.indexOf("js/render/webgpu-gbuffer.js"),
  "lighting cycle should load after G-buffer setup"
);
assert.ok(
  namespaceSource.indexOf("js/render/lighting-cycle.js") < namespaceSource.indexOf("js/render/webgpu-compositor.js"),
  "lighting cycle should load before compositor consumers"
);
assert.ok(
  namespaceSource.indexOf("js/render/lighting-cycle.js") < namespaceSource.indexOf("js/render/shadow-stamping.js"),
  "lighting cycle should load before stamped shadow consumers"
);
assert.ok(
  packageJson.scripts.test.includes("tests/lighting-cycle.test.js"),
  "npm test should include lighting cycle checks"
);
assert.ok(shaderSource.indexOf("ambient_color: vec4<f32>") >= 0, "G-buffer compose shader should accept ambient RGB tint");
assert.ok(shaderSource.indexOf("ambient_hue_tint") >= 0, "G-buffer compose shader should apply ambient RGB as luminance-normalized hue");

const context = {
  PS: { render: {} },
  world: { tick: 0 },
  Math,
  Number,
  Array,
  Object,
  Float32Array
};

vm.createContext(context);
vm.runInContext(lightingSource, context, { filename: "js/render/lighting-cycle.js" });
vm.runInContext(shadowSource, context, { filename: "js/render/shadow-stamping.js" });
vm.runInContext(compositorSource, context, { filename: "js/render/webgpu-compositor.js" });

const lighting = context.PS.render.lightingCycle;
const dawn = lighting.getState({ timeOfDay: 0.08 });
const noon = lighting.getState({ timeOfDay: 0.5 });
const dusk = lighting.getState({ timeOfDay: 0.7 });
const night = lighting.getState({ timeOfDay: 0.86 });

assert.ok(dawn.shadowLength > noon.shadowLength, "dawn shadows should be longer than noon shadows");
assert.ok(dusk.shadowLength > noon.shadowLength, "dusk shadows should be longer than noon shadows");
assert.ok(nearlyDifferent(dawn.sunDirection.x, dusk.sunDirection.x), "sun direction should rotate over the day");
assert.ok(night.ambient < noon.ambient, "night ambient should be darker than noon");
assert.ok(night.ambientColor[2] > night.ambientColor[0], "night ambient should be blue tinted");
assert.ok(noon.ambientColor[0] >= noon.ambientColor[2], "noon ambient should stay neutral or warm");
assert.ok(night.indoorAmbient[0] > night.indoorAmbient[2], "indoor night ambient should be warm");
assert.ok(night.indoorAmbient[0] > noon.indoorAmbient[0], "indoor ambient should be stronger at night than noon");
assert.ok(night.shadowAlphaScale <= 1, "night shadow alpha scale should stay in valid alpha range");
assert.ok(noon.shadowAlphaScale <= 1, "noon shadow alpha scale should stay in valid alpha range");

const dawnRects = context.PS.render.shadows.makeStampedRects({
  x: 0,
  y: 0,
  width: 4,
  rectHeight: 2,
  heightUnits: 20,
  alpha: 0.3,
  timeOfDay: 0.08
});
const noonRects = context.PS.render.shadows.makeStampedRects({
  x: 0,
  y: 0,
  width: 4,
  rectHeight: 2,
  heightUnits: 20,
  alpha: 0.3,
  timeOfDay: 0.5
});
const duskRects = context.PS.render.shadows.makeStampedRects({
  x: 0,
  y: 0,
  width: 4,
  rectHeight: 2,
  heightUnits: 20,
  alpha: 0.3,
  timeOfDay: 0.7
});

assert.ok(Math.hypot(dawnRects[0], dawnRects[1]) > Math.hypot(noonRects[0], noonRects[1]), "dawn stamped shadow offset should be longer than noon");
assert.ok(Math.hypot(duskRects[0], duskRects[1]) > Math.hypot(noonRects[0], noonRects[1]), "dusk stamped shadow offset should be longer than noon");
assert.ok(nearlyDifferent(dawnRects[0], duskRects[0]) || nearlyDifferent(dawnRects[1], duskRects[1]), "stamped shadows should rotate from dawn to dusk");
assert.ok(dawnRects.every((value, index) => index % 8 !== 7 || value <= 1), "dawn stamped shadow alpha should stay within range");
assert.ok(duskRects.every((value, index) => index % 8 !== 7 || value <= 1), "dusk stamped shadow alpha should stay within range");

const nightUniforms = context.PS.render.webgpuCompositor.makeUniformData({ timeOfDay: 0.86 });
const noonUniforms = context.PS.render.webgpuCompositor.makeUniformData({ timeOfDay: 0.5 });
assert.ok(nightUniforms[4] < noonUniforms[4], "compositor night ambient intensity should be lower than noon");
assert.ok(nightUniforms[10] > nightUniforms[8], "compositor night ambient tint should favor blue");
assert.ok(noonUniforms[8] >= noonUniforms[10], "compositor noon ambient tint should not be blue");

const volcanicEra = lighting.getEraState({ era: "volcanic" });
const iceEra = lighting.getEraState({ era: "ice" });
const transitionEra = lighting.getEraState({ fromEra: "volcanic", toEra: "ice", transition: 0.25 });
const ambientLight = lighting.getEraAmbientLight({ era: "temperate" });
assert.ok(volcanicEra.ambientColor[0] > volcanicEra.ambientColor[2], "volcanic era ambient should be warm");
assert.ok(iceEra.ambientColor[2] > iceEra.ambientColor[0], "ice era ambient should be cool blue");
assert.ok(transitionEra.ambientColor[0] !== volcanicEra.ambientColor[0], "era transitions should interpolate color temperature");
assert.ok(transitionEra.shadowLength !== volcanicEra.shadowLength, "era transitions should affect shadow behavior");
assert.strictEqual(ambientLight.rgb.join(","), "1,1,1", "AmbientLight should expose RGB");
assert.ok(ambientLight.direction && Number.isFinite(ambientLight.direction.x), "AmbientLight should expose direction");
assert.ok(Number.isFinite(ambientLight.tilt), "AmbientLight should expose tilt");

console.log("lighting cycle checks passed");
