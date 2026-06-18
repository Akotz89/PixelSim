const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const agents = read("AGENTS.md");
const architecture = read("docs/ARCHITECTURE.md");
const rendering = read("docs/RENDERING.md");
const namespace = read("js/core/namespace.js");
const gpu = read("js/render/gpu.js");

assert.ok(
  agents.indexOf("WebGL2 is legacy migration") >= 0,
  "AGENTS.md should define WebGL2 as legacy migration debt, not fallback"
);
assert.strictEqual(
  /WebGL2\s+(?:is\s+)?(?:the\s+)?fallback/i.test(agents + architecture + rendering),
  false,
  "WebGPU/WASM mandate docs must not describe WebGL2 as a fallback"
);
assert.ok(
  architecture.indexOf("startup failure rather than a renderer fallback") >= 0,
  "architecture should require a hard WebGPU startup failure"
);
assert.ok(
  rendering.indexOf("WebGPU is the required renderer path") >= 0,
  "rendering doc should state that WebGPU is the required renderer"
);
assert.ok(
  namespace.indexOf('"js/render/gpu.js"') >= 0,
  "script manifest should load the WebGPU bootstrap"
);
assert.ok(
  namespace.indexOf('"js/render/gpu.js"') < namespace.indexOf('"js/render/webgpu-renderer.js"'),
  "WebGPU bootstrap should load before the WebGPU renderer"
);
[
  "js/render/gl.js",
  "js/render/webgl-engine.js",
  "js/render/webgl2-renderer.js",
  "js/render/surface-tile-webgl.js",
  "js/render/entity-webgl.js"
].forEach(function (script) {
  assert.strictEqual(namespace.indexOf(script), -1, "runtime manifest must not load " + script);
});
assert.ok(
  gpu.indexOf("PS.gpu.required = true") >= 0,
  "PS.gpu should mark WebGPU as required"
);
assert.ok(
  gpu.indexOf("navigator.gpu") >= 0,
  "PS.gpu should detect navigator.gpu"
);
assert.ok(
  gpu.indexOf("PS.gpu.failRequired") >= 0,
  "PS.gpu should stop startup when WebGPU is unavailable"
);

console.log("webgpu mandate checks passed");
