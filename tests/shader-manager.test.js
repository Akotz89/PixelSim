const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const namespaceSource = read("js/core/namespace.js");
const loaderSource = read("js/assets/loader.js");
const mainLoopSource = read("js/main-loop.js");
const terrainSource = read("js/render/terrain.js");

assert.strictEqual(namespaceSource.indexOf("js/render/shader-manager.js"), -1, "runtime manifest must not load the legacy GLSL shader manager");
assert.strictEqual(namespaceSource.indexOf("js/render/gl.js"), -1, "runtime manifest must not load the legacy WebGL bootstrap");
assert.ok(mainLoopSource.indexOf("loadStartupShaders") >= 0, "startup should load shader files before first draw");
assert.ok(mainLoopSource.indexOf("loadRequiredWgslShaders") >= 0, "startup should load required WGSL shaders before first draw");
assert.ok(mainLoopSource.indexOf("Required WGSL shaders failed to load") >= 0, "startup should fail loudly when required WGSL is missing");
assert.ok(mainLoopSource.indexOf("PS.render.webgpuPointLights") >= 0, "startup should register point-light WGSL before first draw");
assert.ok(loaderSource.indexOf("loadText") >= 0, "asset loader should support shader text loading");
assert.ok(loaderSource.indexOf("_loadJSONWithScriptFallback") >= 0, "asset loader should support JSON sidecar loading");
assert.ok(terrainSource.indexOf("PS.render.webgpuGlobe.draw") >= 0, "terrain draw should use the WebGPU globe renderer");

[
  "globe-sphere",
  "surface-underlay",
  "surface-chunk",
  "terrain",
  "terrain-tile",
  "gbuffer-compose",
  "gbuffer-terrain",
  "sprite-batch",
  "entity-atlas",
  "particle",
  "point-light",
  "shadow",
  "heat-diffusion"
].forEach(function (name) {
  var shaderPath = path.join(root, "shaders", name + ".wgsl");
  var sidecarPath = shaderPath + ".js";
  var source = fs.readFileSync(shaderPath, "utf8");
  var sidecar = fs.readFileSync(sidecarPath, "utf8");
  var globalName = "SHADER_SHADERS_" + name.replace(/-/g, "_").toUpperCase() + "_WGSL";

  assert.ok(fs.existsSync(shaderPath), "missing WGSL shader " + name);
  assert.ok(fs.existsSync(sidecarPath), "missing WGSL shader sidecar " + name);
  assert.ok(sidecar.indexOf(globalName) >= 0, name + " sidecar should expose the expected global");
  assert.ok(sidecar.indexOf(JSON.stringify(source)) >= 0, name + " sidecar should embed the raw WGSL source");
  assert.ok(sidecar.indexOf('PS.assets.registerText("shaders/' + name + '.wgsl"') >= 0, name + " sidecar should register shader text");
});

[
  "js/render/webgl-globe-shaders.js",
  "js/render/surface-tile-webgl.js",
  "js/render/entity-webgl.js",
  "js/render/webgl-gbuffer.js",
  "js/render/webgl-compositor.js"
].forEach(function (file) {
  assert.strictEqual(namespaceSource.indexOf(file), -1, "runtime manifest must not load " + file);
});

console.log("shader manager mandate checks passed");
