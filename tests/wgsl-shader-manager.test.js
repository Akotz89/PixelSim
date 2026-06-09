const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const namespaceSource = read("js/core/namespace.js");
const managerSource = read("js/render/wgsl-shader-manager.js");
const gpuSource = read("js/render/gpu.js");

assert.ok(
  namespaceSource.indexOf("js/render/gpu.js") < namespaceSource.indexOf("js/render/wgsl-shader-manager.js"),
  "WGSL manager should load after the WebGPU bootstrap"
);
assert.ok(
  namespaceSource.indexOf("js/render/wgsl-shader-manager.js") < namespaceSource.indexOf("js/render/webgpu-renderer.js"),
  "WGSL manager should load before the WebGPU renderer"
);
assert.strictEqual(namespaceSource.indexOf("js/render/gl.js"), -1, "runtime manifest must not load the legacy WebGL bootstrap");

const runtimeErrors = [];
const context = {
  PS: {
    render: {},
    assets: {},
    runtime: {
      recordError(kind, payload) {
        runtimeErrors.push({ kind, payload });
      }
    }
  },
  window: {
    SHADER_TEST_GLOBAL_WGSL: "@compute @workgroup_size(1) fn main() {}"
  },
  Promise,
  Date,
  Object,
  String,
  Error
};

vm.createContext(context);
vm.runInContext(gpuSource, context, { filename: "js/render/gpu.js" });
vm.runInContext(managerSource, context, { filename: "js/render/wgsl-shader-manager.js" });

(async function() {
  const manager = context.PS.render.wgslShaderManager;

  assert.strictEqual(
    manager.getGlobalName("shaders/gbuffer-compose.wgsl"),
    "SHADER_SHADERS_GBUFFER_COMPOSE_WGSL",
    "global names should be deterministic for WGSL sidecars"
  );

  const globalShader = await manager.loadFromFile("test-global", "test-global.wgsl", {
    loadText() {
      throw new Error("global shader should not read through loader");
    }
  });
  assert.strictEqual(globalShader.source.indexOf("@compute"), 0, "WGSL global sidecar should load shader source");

  const fileShader = await manager.loadFromFile("file-backed", "shaders/file-backed.wgsl", {
    loadText(url) {
      assert.strictEqual(url, "shaders/file-backed.wgsl", "WGSL loader should read the requested path");
      return Promise.resolve("@vertex fn main() -> @builtin(position) vec4f { return vec4f(); }");
    }
  });
  assert.strictEqual(fileShader.loaded, true, "WGSL file source should register");

  const manifestReady = await manager.loadManifest([
    { name: "manifest-ready", path: "shaders/manifest-ready.wgsl" },
    { name: "manifest-missing", path: "shaders/manifest-missing.wgsl" }
  ], {
    loadText(url) {
      if (url.indexOf("missing") >= 0) {
        return Promise.reject(new Error("missing wgsl"));
      }
      return Promise.resolve("@fragment fn main() {}");
    }
  });

  assert.strictEqual(manifestReady.length, 1, "WGSL manifest should promote ready shaders");
  assert.strictEqual(manager.lastManifestStatus.loaded, 1, "WGSL manifest should count ready shaders");
  assert.strictEqual(manager.lastManifestStatus.failed, 1, "WGSL manifest should count failed shaders");
  assert.strictEqual(runtimeErrors[0].kind, "wgsl.error", "WGSL load failures should be recorded");

  const fakeDevice = {
    modules: [],
    renderPipelines: [],
    computePipelines: [],
    createShaderModule(descriptor) {
      const module = { descriptor };
      this.modules.push(module);
      return module;
    },
    createRenderPipeline(descriptor) {
      const pipeline = { descriptor, kind: "render" };
      this.renderPipelines.push(pipeline);
      return pipeline;
    },
    createComputePipeline(descriptor) {
      const pipeline = { descriptor, kind: "compute" };
      this.computePipelines.push(pipeline);
      return pipeline;
    }
  };

  const firstModule = manager.getShaderModule(fakeDevice, "file-backed");
  const secondModule = manager.getShaderModule(fakeDevice, "file-backed");

  assert.strictEqual(firstModule, secondModule, "WGSL modules should be cached per device and shader");
  assert.strictEqual(fakeDevice.modules.length, 1, "cached WGSL modules should not be recreated");
  assert.strictEqual(firstModule.descriptor.label, "file-backed", "WGSL module label should match shader name");
  assert.ok(firstModule.descriptor.code.indexOf("@vertex") >= 0, "WGSL module should receive shader source");
  assert.strictEqual(manager.getStats().moduleCount, 1, "WGSL stats should count cached modules");
  assert.strictEqual(
    manager.getRenderPipeline({ label: "terrain", layout: "auto" }, fakeDevice),
    manager.getRenderPipeline({ label: "terrain", layout: "auto" }, fakeDevice),
    "render pipelines should be cached by descriptor key"
  );
  assert.strictEqual(fakeDevice.renderPipelines.length, 1, "render pipeline cache should avoid duplicate creation");
  assert.strictEqual(
    manager.getComputePipeline({ label: "heat", layout: "auto" }, fakeDevice),
    manager.getComputePipeline({ label: "heat", layout: "auto" }, fakeDevice),
    "compute pipelines should be cached by descriptor key"
  );
  assert.strictEqual(fakeDevice.computePipelines.length, 1, "compute pipeline cache should avoid duplicate creation");
  assert.strictEqual(manager.getStats().renderPipelineCount, 1, "WGSL stats should count render pipelines");
  assert.strictEqual(manager.getStats().computePipelineCount, 1, "WGSL stats should count compute pipelines");

  console.log("wgsl shader manager checks passed");
}()).catch(function(error) {
  console.error(error);
  process.exit(1);
});
