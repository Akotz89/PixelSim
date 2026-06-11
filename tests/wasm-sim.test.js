const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const namespaceSource = fs.readFileSync(path.join(root, "js/core/namespace.js"), "utf8");
const wasmGlueSource = fs.readFileSync(path.join(root, "wasm/pixeldarium-sim.js"), "utf8");
const wasmSidecarSource = fs.readFileSync(path.join(root, "wasm/pixeldarium-sim.wasm.js"), "utf8");
const bridgeSource = fs.readFileSync(path.join(root, "js/sim/wasm-bridge.js"), "utf8");
const metadata = JSON.parse(fs.readFileSync(path.join(root, "wasm/pixeldarium-sim.build.json"), "utf8"));
const docs = fs.readFileSync(path.join(root, "docs/wasm-sim-module.md"), "utf8");

assert.ok(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts.test.includes("tests/wasm-sim.test.js"), "npm test should include WASM sim checks");
assert.ok(fs.existsSync(path.join(root, "src/sim/Cargo.toml")), "Rust simulation crate should exist");
assert.ok(fs.existsSync(path.join(root, "src/sim/src/lib.rs")), "Rust simulation lib should exist");
assert.ok(fs.existsSync(path.join(root, "wasm/pixeldarium-sim.js")), "wasm-pack JS output should exist");
assert.ok(fs.existsSync(path.join(root, "wasm/pixeldarium-sim_bg.wasm")), "WASM binary should exist");
assert.ok(fs.existsSync(path.join(root, "wasm/pixeldarium-sim.wasm.js")), "file protocol base64 sidecar should exist");
assert.ok(metadata.sizeBytes < 500 * 1024, "WASM binary should remain under 500KB");
assert.strictEqual(metadata.sizePass, true, "build metadata should record size gate pass");
assert.strictEqual(metadata.fileProtocol, "script-tag + base64 sidecar, no fetch required", "metadata should document no-fetch file protocol");
assert.ok(bridgeSource.includes("instantiateFromBase64"), "bridge should expose base64 init");
assert.ok(!bridgeSource.includes("fetch("), "bridge should not fetch WASM");
assert.ok(docs.includes("file://"), "docs should describe file protocol support");
assert.ok(docs.includes("get_elevation_ptr()"), "docs should document pointer API");
assert.ok(docs.includes("run_d8_rivers()"), "docs should document D8 river API");

const context = {
  window: {
    addEventListener: function() {}
  },
  console: console,
  WebAssembly: WebAssembly,
  Uint8Array: Uint8Array,
  Float32Array: Float32Array,
  TextDecoder: TextDecoder,
  FinalizationRegistry: FinalizationRegistry,
  Symbol: Symbol,
  Buffer: Buffer,
  Error: Error,
  Object: Object
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(namespaceSource, context, { filename: "js/core/namespace.js" });

const manifest = context.window.PS.core.manifest;
assert.ok(manifest.includes("wasm/pixeldarium-sim.js"), "manifest should load wasm-bindgen glue");
assert.ok(manifest.includes("wasm/pixeldarium-sim.wasm.js"), "manifest should load base64 sidecar");
assert.ok(manifest.includes("js/sim/wasm-bridge.js"), "manifest should load bridge");
assert.ok(
  manifest.indexOf("wasm/pixeldarium-sim.js") < manifest.indexOf("wasm/pixeldarium-sim.wasm.js") &&
    manifest.indexOf("wasm/pixeldarium-sim.wasm.js") < manifest.indexOf("js/sim/wasm-bridge.js"),
  "manifest should load wasm glue, sidecar, then bridge"
);

vm.runInContext(wasmGlueSource, context, { filename: "wasm/pixeldarium-sim.js" });
vm.runInContext(wasmSidecarSource, context, { filename: "wasm/pixeldarium-sim.wasm.js" });
vm.runInContext(bridgeSource, context, { filename: "js/sim/wasm-bridge.js" });

const runtime = context.window.PS.sim.wasmBridge.instantiateFromBase64();
const simBuffer = context.window.PS.sim.wasmBridge.createBuffer(runtime, 3, 3);
const heights = [
  9, 8, 7,
  8, 4, 6,
  7, 6, 0
];
for (let i = 0; i < heights.length; i += 1) {
  simBuffer.set_elevation(i, heights[i]);
}

simBuffer.run_d8_rivers();
assert.ok(simBuffer.get_elevation_ptr() > 0, "get_elevation_ptr should return a valid pointer");
assert.ok(simBuffer.get_rivers_ptr() > 0, "get_rivers_ptr should return a valid pointer");
assert.ok(simBuffer.get_flow_order_ptr() > 0, "get_flow_order_ptr should return a valid pointer");
assert.ok(simBuffer.get_river(8) > simBuffer.get_river(0), "D8 accumulation should increase downstream flow");
assert.ok(simBuffer.get_flow_order(0) < simBuffer.get_flow_order(8), "D8 flow order should process upstream before downstream");

simBuffer.run_tectonics(1);
simBuffer.run_erosion(2);
const view = context.window.PS.sim.wasmBridge.makeElevationView(simBuffer, runtime.exports, 3, 3);
assert.strictEqual(view.length, 9, "WASM elevation view should match dimensions");
for (let i = 0; i < view.length; i += 1) {
  assert.ok(Number.isFinite(view[i]), "WASM elevation values should remain finite");
}

const writes = [];
const fakeDevice = {
  queue: {
    writeBuffer(buffer, offset, data, dataOffset, length) {
      writes.push({ buffer: buffer, offset: offset, data: data, dataOffset: dataOffset, length: length });
    }
  }
};
const targetBuffer = { label: "elevation.gpu" };
const upload = context.window.PS.sim.wasmBridge.uploadElevationToGpu({
  device: fakeDevice,
  targetBuffer: targetBuffer,
  simBuffer: simBuffer,
  wasmExports: runtime.exports,
  width: 3,
  height: 3
});
assert.strictEqual(upload.cells, 9, "upload should report uploaded cell count");
assert.strictEqual(upload.format, "r32float", "upload should declare r32float elevation format");
assert.strictEqual(writes.length, 1, "upload should write to GPU queue once");
assert.strictEqual(writes[0].buffer, targetBuffer, "upload should target requested GPU buffer");
assert.strictEqual(writes[0].data.buffer, runtime.exports.memory.buffer, "upload data should view WASM linear memory");
assert.strictEqual(writes[0].length, 9, "upload should write all cells");

console.log("WASM sim checks passed", JSON.stringify({
  wasmBytes: metadata.sizeBytes,
  wasmOptAvailable: metadata.wasmOptAvailable,
  riverSinkFlow: Number(simBuffer.get_river(8).toFixed(3))
}));
