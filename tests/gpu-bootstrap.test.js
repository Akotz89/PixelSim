const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const gpuSource = fs.readFileSync(path.join(root, "js/render/gpu.js"), "utf8");

function makeDocument() {
  const nodes = {};
  nodes["game-webgpu"] = {
    id: "game-webgpu",
    contexts: [],
    getContext(kind) {
      const context = {
        kind,
        configured: null,
        configure(descriptor) {
          this.configured = descriptor;
        }
      };
      this.contexts.push(context);
      return kind === "webgpu" ? context : null;
    }
  };

  return {
    visibilityState: "visible",
    body: {
      appended: [],
      appendChild(node) {
        this.appended.push(node);
        if (node.id) {
          nodes[node.id] = node;
        }
      }
    },
    createElement(tagName) {
      return {
        tagName,
        id: "",
        style: {},
        textContent: "",
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        }
      };
    },
    getElementById(id) {
      return nodes[id] || null;
    },
    nodes
  };
}

function makeContext(navigatorValue) {
  const document = makeDocument();
  const runtimeErrors = [];
  const context = {
    PS: {
      render: {},
      runtime: {
        recordError(kind, details) {
          runtimeErrors.push({ kind, details });
        }
      }
    },
    document,
    navigator: navigatorValue,
    Promise,
    Error,
    String
  };
  vm.createContext(context);
  vm.runInContext(gpuSource, context, { filename: "js/render/gpu.js" });
  context.runtimeErrors = runtimeErrors;
  return context;
}

(async function() {
  const missingContext = makeContext({});

  await assert.rejects(
    () => missingContext.PS.gpu.initialize(),
    /WebGPU Required/,
    "missing navigator.gpu should reject with WebGPU-required failure"
  );
  assert.strictEqual(missingContext.PS.gpu.status, "failed", "missing WebGPU should set failed status");
  assert.strictEqual(missingContext.PS.gpu.isWebGPU, false, "missing WebGPU should not be ready");
  assert.ok(
    missingContext.document.getElementById("webgpu-required-notice").textContent.indexOf("WebGPU Required") >= 0,
    "missing WebGPU should show required notice"
  );
  assert.strictEqual(
    missingContext.runtimeErrors[0].kind,
    "webgpu.required",
    "missing WebGPU should record a required runtime error"
  );

  const fakeDevice = { queue: { submit() {} }, lost: new Promise(() => {}) };
  const fakeAdapter = { requestDevice: () => Promise.resolve(fakeDevice) };
  const readyContext = makeContext({
    gpu: {
      getPreferredCanvasFormat() {
        return "rgba8unorm";
      },
      requestAdapter() {
        return Promise.resolve(fakeAdapter);
      }
    }
  });

  const gpu = await readyContext.PS.gpu.initialize();

  assert.strictEqual(gpu.status, "ready", "valid adapter/device should set ready status");
  assert.strictEqual(gpu.isWebGPU, true, "valid adapter/device should mark WebGPU ready");
  assert.strictEqual(gpu.adapter, fakeAdapter, "adapter should be stored for WebGPU systems");
  assert.strictEqual(gpu.device, fakeDevice, "device should be stored for WebGPU systems");
  assert.strictEqual(gpu.queue, fakeDevice.queue, "queue should be stored for command submission");
  assert.strictEqual(gpu.format, "rgba8unorm", "preferred WebGPU canvas format should be stored");
  assert.strictEqual(gpu.context.kind, "webgpu", "WebGPU canvas context should be created");
  assert.strictEqual(gpu.context.configured.device, fakeDevice, "WebGPU context should be configured with the device");
  assert.strictEqual(gpu.context.configured.format, "rgba8unorm", "WebGPU context should be configured with preferred format");
  assert.strictEqual(readyContext.runtimeErrors.length, 0, "ready WebGPU should not record runtime errors");
  assert.strictEqual(
    readyContext.PS.gpu.shouldRecoverDeviceLost("destroyed"),
    true,
    "active visible pages should recover destroyed WebGPU devices"
  );
  readyContext.document.visibilityState = "hidden";
  assert.strictEqual(
    readyContext.PS.gpu.shouldRecoverDeviceLost("destroyed"),
    false,
    "hidden/unloading pages should not loop recovering destroyed WebGPU devices"
  );
  assert.strictEqual(
    readyContext.PS.gpu.shouldRecoverDeviceLost("unknown"),
    true,
    "non-destroyed WebGPU device loss should still recover"
  );

  console.log("gpu bootstrap checks passed");
}()).catch(function(error) {
  console.error(error);
  process.exit(1);
});
