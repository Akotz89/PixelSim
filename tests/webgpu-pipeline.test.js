const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const namespaceSource = read("js/core/namespace.js");
const manifestSource = read("js/core/manifest.js");
assert.ok(
  manifestSource.indexOf("js/render/webgpu-pipeline.js") > manifestSource.indexOf("js/render/webgpu-renderer.js"),
  "WebGPU pipeline should load after the WebGPU renderer facade"
);
assert.strictEqual(
  read("js/render/pipeline.js").indexOf("webgpuPipeline"),
  -1,
  "semantic pipeline.js should remain untouched by the WebGPU pipeline layer"
);

const context = {
  console,
  performance,
  PS: {
    render: {
      pipeline: {
        getZoomBand() {
          return "local";
        }
      },
      webgpuTargets: null
    },
    gpu: {}
  }
};
vm.createContext(context);
vm.runInContext(read("js/render/webgpu-targets.js"), context, { filename: "js/render/webgpu-targets.js" });
vm.runInContext(read("js/render/webgpu-gbuffer.js"), context, { filename: "js/render/webgpu-gbuffer.js" });

let compositorDraws = 0;
context.PS.render.webgpuCompositor = {
  draw(options) {
    compositorDraws++;
    assert.ok(options.commandEncoder, "compositor should receive the frame command encoder");
    assert.ok(options.albedoTexture, "compositor should receive the albedo attachment");
    assert.ok(options.normalHeightTexture, "compositor should receive the normal-height attachment");
    return true;
  }
};

vm.runInContext(read("js/render/webgpu-pipeline.js"), context, { filename: "js/render/webgpu-pipeline.js" });

const passes = [];
const submissions = [];
const fakeDevice = {
  queue: {
    submit(commands) {
      submissions.push(commands);
    },
    writeBuffer() {}
  },
  createCommandEncoder(descriptor) {
    return {
      descriptor,
      beginRenderPass(passDescriptor) {
        const pass = {
          descriptor: passDescriptor,
          rendered: [],
          ended: false,
          end() {
            this.ended = true;
          }
        };
        passes.push(pass);
        return pass;
      },
      finish() {
        return { label: descriptor.label };
      }
    };
  },
  createTexture(descriptor) {
    return {
      descriptor,
      width: descriptor.size[0],
      height: descriptor.size[1],
      format: descriptor.format,
      createView() {
        return { texture: this };
      },
      destroy() {}
    };
  }
};

context.PS.gpu = {
  device: fakeDevice,
  queue: fakeDevice.queue,
  canvas: { width: 320, height: 180 },
  context: {
    getCurrentTexture() {
      return {
        createView() {
          return {};
        }
      };
    }
  },
  format: "bgra8unorm"
};

const pipeline = context.PS.render.webgpuPipeline;
pipeline.registerLayer("orbit.layer", {
  band: "orbit",
  order: 1,
  render(pass) {
    pass.rendered.push("orbit.layer");
  }
});
pipeline.registerLayer("local.layer", {
  band: "local",
  order: 1,
  render(pass, camera, frame) {
    assert.strictEqual(frame.band, "local", "render frame should expose the selected band");
    pass.rendered.push("local.layer");
  }
});

assert.strictEqual(pipeline.renderFrame({ camera: { zoomLevel: 15 }, width: 320, height: 180 }), true, "WebGPU pipeline frame should render");
assert.strictEqual(passes.length, 1, "WebGPU pipeline should create one G-buffer render pass");
assert.strictEqual(passes[0].descriptor.label, "webgpu-pipeline.gbuffer-pass", "G-buffer pass should be labeled");
assert.deepStrictEqual(passes[0].rendered, ["local.layer"], "pipeline should render only matching band layers");
assert.strictEqual(passes[0].ended, true, "pipeline should end the G-buffer pass");
assert.strictEqual(compositorDraws, 1, "pipeline should composite the G-buffer once");
assert.strictEqual(submissions.length, 1, "pipeline should submit one command buffer");
assert.strictEqual(pipeline.getStats().submittedLayers, 1, "stats should count submitted layers");
assert.strictEqual(pipeline.getStats().skippedLayers, 1, "stats should count skipped layers");
assert.strictEqual(pipeline.getStats().lastBand, "local", "stats should expose selected band");

console.log("webgpu pipeline checks passed");
