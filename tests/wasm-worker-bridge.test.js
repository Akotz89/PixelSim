const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const namespaceSource = fs.readFileSync(path.join(root, "js/core/namespace.js"), "utf8");
const workerSource = fs.readFileSync(path.join(root, "js/workers/sim-worker.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "js/sim/sim-worker-client.js"), "utf8");
const wasmGlueSource = fs.readFileSync(path.join(root, "wasm/pixeldarium-sim.js"), "utf8");
const wasmSidecarSource = fs.readFileSync(path.join(root, "wasm/pixeldarium-sim.wasm.js"), "utf8");
const wasmBridgeSource = fs.readFileSync(path.join(root, "js/sim/wasm-bridge.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.ok(namespaceSource.includes("js/sim/sim-worker-client.js"), "manifest should expose the simulation worker client");
assert.ok(
  namespaceSource.indexOf("js/sim/wasm-bridge.js") < namespaceSource.indexOf("js/sim/sim-worker-client.js") &&
    namespaceSource.indexOf("js/sim/sim-worker-client.js") < namespaceSource.indexOf("js/sim/coupling.js"),
  "worker client should load after WASM bridge and before coupling"
);
assert.ok(workerSource.includes("wasmInit"), "worker should support wasmInit");
assert.ok(workerSource.includes("wasmTick"), "worker should support wasmTick");
assert.ok(workerSource.includes("transferable-array-buffer"), "worker should declare transferable result buffers");
assert.ok(clientSource.includes("uploadElevationResultToGpu"), "client should expose GPU upload for worker results");
assert.ok(packageJson.scripts.test.includes("tests/wasm-worker-bridge.test.js"), "npm test should include WASM worker bridge checks");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--allow-file-access-from-files"]
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.PS && window.PS.sim && window.PS.sim.simWorkerClient), null, {
    timeout: 10000
  });

  const evidence = await page.evaluate(async (sources) => {
    const client = window.PS.sim.simWorkerClient;
    const workerSetup = client.createBlobWorker(sources.workerSource);
    const requestClient = client.createRequestClient(workerSetup.worker);
    const width = 3;
    const height = 3;
    const elevation = new Float32Array([
      9, 8, 7,
      8, 4, 6,
      7, 6, 0
    ]);
    const writes = [];
    const targetBuffer = { label: "elevation.gpu" };
    const fakeDevice = {
      queue: {
        writeBuffer(buffer, offset, data, dataOffset, length) {
          writes.push({
            buffer,
            offset,
            dataBuffer: data.buffer,
            dataLength: data.length,
            dataOffset,
            length
          });
        }
      }
    };

    const ready = await requestClient.request(client.makeWasmInitMessage({
      width,
      height,
      wasmGlueSource: sources.wasmGlueSource,
      wasmSidecarSource: sources.wasmSidecarSource,
      wasmBridgeSource: sources.wasmBridgeSource
    }));
    const result = await requestClient.request(client.makeWasmTickMessage({
      elevation: elevation.buffer,
      tectonicsDt: 1,
      erosionSteps: 1
    }), [elevation.buffer]);
    const upload = client.uploadElevationResultToGpu({
      device: fakeDevice,
      targetBuffer,
      result
    });
    const view = client.makeElevationResultView(result);

    requestClient.terminate();
    workerSetup.revoke();

    return {
      ready,
      resultType: result.type,
      resultCells: result.cells,
      resultTransfer: result.transfer,
      resultSource: result.source,
      elevationByteLength: result.elevation.byteLength,
      firstValueFinite: Number.isFinite(view[0]),
      upload,
      writes: writes.map((write) => ({
        offset: write.offset,
        dataBufferMatchesResult: write.dataBuffer === result.elevation,
        dataLength: write.dataLength,
        dataOffset: write.dataOffset,
        length: write.length
      }))
    };
  }, {
    workerSource,
    wasmGlueSource,
    wasmSidecarSource,
    wasmBridgeSource
  });

  await browser.close();

  assert.deepStrictEqual(consoleErrors, [], "browser console should have no errors");
  assert.deepStrictEqual(pageErrors, [], "browser page should have no errors");
  assert.strictEqual(evidence.ready.type, "wasmReady", "worker should initialize WASM");
  assert.strictEqual(evidence.ready.noFetch, true, "worker init should use the no-fetch base64 path");
  assert.strictEqual(evidence.resultType, "wasmTickComplete", "worker should complete a WASM tick");
  assert.strictEqual(evidence.resultCells, 9, "worker result should include all elevation cells");
  assert.strictEqual(evidence.resultTransfer, "transferable-array-buffer", "worker should transfer an ArrayBuffer result");
  assert.strictEqual(evidence.resultSource, "wasm-linear-memory-snapshot", "worker should declare the WASM result source");
  assert.strictEqual(evidence.elevationByteLength, 36, "worker result should contain r32float elevation bytes");
  assert.strictEqual(evidence.firstValueFinite, true, "worker elevation output should be finite");
  assert.strictEqual(evidence.upload.cells, 9, "GPU upload helper should report uploaded cells");
  assert.strictEqual(evidence.upload.format, "r32float", "GPU upload helper should use r32float");
  assert.strictEqual(evidence.writes.length, 1, "GPU upload helper should write once");
  assert.strictEqual(evidence.writes[0].dataBufferMatchesResult, true, "GPU upload should use a view over the transferred result buffer");
  assert.strictEqual(evidence.writes[0].length, 9, "GPU upload should write all cells");

  console.log("WASM worker bridge checks passed", JSON.stringify({
    cells: evidence.resultCells,
    transfer: evidence.resultTransfer,
    source: evidence.resultSource,
    uploadBytes: evidence.upload.bytes
  }));
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
