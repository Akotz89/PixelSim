const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const namespaceSource = read("js/core/namespace.js");
const rendererSource = read("js/render/renderer.js");
const webgpuRendererSource = read("js/render/webgpu-renderer.js");
const pipelineSource = read("js/render/pipeline.js");
const mainLoopSource = read("js/main-loop.js");
const styleSource = read("style.css");
const legacyRuntimeScripts = [
  "js/render/gl.js",
  "js/render/webgl-presenter.js",
  "js/render/webgl-engine.js",
  "js/render/webgl-targets.js",
  "js/render/webgl-compositor.js",
  "js/render/webgl-gbuffer.js",
  "js/render/webgl-globe-shaders.js",
  "js/render/webgl-globe.js",
  "js/render/surface-underlay-webgl.js",
  "js/render/surface-tile-webgl.js",
  "js/render/entity-webgl.js",
  "js/render/entity-webgl-readiness.js",
  "js/render/entity-webgl-events.js",
  "js/render/webgl2-renderer.js"
];

assert.ok(namespaceSource.indexOf("js/render/renderer.js") >= 0, "script manifest should load renderer interface");
assert.ok(namespaceSource.indexOf("js/render/webgpu-renderer.js") > namespaceSource.indexOf("js/render/renderer.js"), "WebGPU renderer should load after the renderer interface");
legacyRuntimeScripts.forEach(function (script) {
  assert.strictEqual(namespaceSource.indexOf(script), -1, "script manifest must not load " + script);
});

assert.ok(rendererSource.indexOf("beginFrame") >= 0, "renderer interface should expose beginFrame");
assert.ok(rendererSource.indexOf("drawTilemap") >= 0, "renderer interface should expose drawTilemap");
assert.ok(rendererSource.indexOf("batchSprites") >= 0, "renderer interface should expose batchSprites");
assert.ok(rendererSource.indexOf("getStats") >= 0, "renderer interface should expose stats");
assert.ok(rendererSource.indexOf("lodTier") >= 0, "renderer stats should expose the active LOD tier");
assert.ok(rendererSource.indexOf("preloadSurfaceLodIndex") >= 0, "renderer stats should expose the preload LOD target");
assert.ok(read("index.html").indexOf('id="game-webgpu"') >= 0, "runtime should include the WebGPU presentation canvas");
assert.strictEqual(read("index.html").indexOf('id="game"'), -1, "runtime should not include a separate Canvas2D game surface");
assert.ok(/#game-webgpu\s*\{[^}]*pointer-events:\s*auto/s.test(styleSource), "single WebGPU presentation canvas should receive pointer and wheel input");
assert.strictEqual(/#game-webgpu\s*\{[^}]*pointer-events:\s*none/s.test(styleSource), false, "single WebGPU presentation canvas should not discard interaction events");
assert.ok(pipelineSource.indexOf("PS.render.renderer.beginFrame") >= 0, "pipeline should begin renderer frames");
assert.ok(pipelineSource.indexOf("PS.render.renderer.endFrame") >= 0, "pipeline should end renderer frames");
assert.strictEqual(pipelineSource.indexOf("webgl"), -1, "pipeline subsystem list must not retain WebGL runtime hooks");
assert.ok(mainLoopSource.indexOf("PS.gpu.initialize()") >= 0, "startup should claim and configure the WebGPU canvas");
assert.strictEqual(read("js/render/gpu.js").indexOf("deferCanvasContext"), -1, "GPU bootstrap should not expose deferred canvas ownership");
assert.ok(webgpuRendererSource.indexOf('PS.render.Renderer.call(this, "webgpu")') >= 0, "WebGPU renderer should identify itself as the active renderer");
assert.ok(webgpuRendererSource.indexOf("PS.render.renderer.setActive(PS.render.webgpuRenderer)") >= 0, "WebGPU renderer should become active at load");
assert.ok(webgpuRendererSource.indexOf("PS.render.webgpuSurfaceTile.drawTerrainAtlasBatch") >= 0, "WebGPU renderer should route terrain batches to WebGPU surface tiles");
assert.ok(webgpuRendererSource.indexOf("PS.render.webgpuSurfaceTile.drawTerrainAtlas") >= 0, "WebGPU renderer should route terrain chunks to WebGPU surface tiles");
assert.ok(webgpuRendererSource.indexOf("PS.render.webgpuSurfaceTile.drawDataTextureTilemap") >= 0, "WebGPU renderer should route data-texture tilemap layers to WebGPU surface tiles");
assert.strictEqual(webgpuRendererSource.toLowerCase().indexOf("webgl"), -1, "WebGPU renderer source must not reference WebGL");
assert.strictEqual(webgpuRendererSource.indexOf("getContext(\"webgl2\""), -1, "WebGPU renderer must not request a WebGL2 context");

const webgpuContext = {
  PS: {
    gpu: {
      status: "ready",
      device: {
        queue: {
          submit(commandBuffers) {
            this.commandBuffers = commandBuffers;
          }
        },
        createCommandEncoder(descriptor) {
          return {
            descriptor,
            beginRenderPass(passDescriptor) {
              return {
                descriptor: passDescriptor,
                end() {
                  this.ended = true;
                }
              };
            },
            finish() {
              return { finished: true };
            }
          };
        }
      },
      context: {
        getCurrentTexture() {
          return {
            createView() {
              return { view: "swapchain" };
            }
          };
        }
      },
      canvas: { width: 1600, height: 850 }
    },
    render: {
      webgpuSurfaceTile: {
        state: {
          drawCount: 0,
          tileDrawCount: 3,
          pageDrawCount: 1,
          lastFrameMs: 2
        },
        resetFrameStats() {
          this.didReset = true;
        },
        drawTerrainAtlasBatch() {
          this.state.drawCount += 1;
          this.state.tileDrawCount += 2;
          return true;
        },
        drawTerrainAtlas() {
          this.state.drawCount += 1;
          this.state.tileDrawCount += 1;
          return true;
        }
      },
      webgpuGlobe: {
        state: {
          drawCount: 0,
          lastFrameMs: 1
        }
      }
    }
  },
  performance: { now() { return 20; } },
  Object,
  String,
  Number,
  Boolean,
  Array,
  Math
};

vm.createContext(webgpuContext);
vm.runInContext(rendererSource, webgpuContext, { filename: "js/render/renderer.js" });
vm.runInContext(webgpuRendererSource, webgpuContext, { filename: "js/render/webgpu-renderer.js" });

assert.strictEqual(webgpuContext.PS.render.renderer.getActive().name, "webgpu", "WebGPU renderer should be active after load");
assert.strictEqual(webgpuContext.PS.render.renderer.beginFrame({ zoom: 4 }), true, "WebGPU renderer should begin with a ready context");
assert.strictEqual(
  webgpuContext.PS.render.renderer.drawTilemap({ chunks: [{ address: {}, cellCache: [{}] }], alpha: 1 }),
  true,
  "WebGPU renderer should route grouped terrain chunks to WebGPU"
);
assert.strictEqual(
  webgpuContext.PS.render.renderer.drawTilemap({ address: {}, cellCache: [{}], alpha: 1 }),
  true,
  "WebGPU renderer should route terrain chunks to WebGPU"
);

const webgpuStats = webgpuContext.PS.render.renderer.endFrame();
assert.strictEqual(webgpuStats.tilemapWebgpuDraws, 2, "WebGPU renderer should count WebGPU terrain submissions");
assert.strictEqual(webgpuStats.webgpuContextActive, true, "WebGPU renderer should report active WebGPU context");
assert.strictEqual(webgpuStats.singleVisibleCanvas, true, "WebGPU renderer should own the visible canvas");
assert.strictEqual(webgpuStats.terrainDraws, 6, "WebGPU renderer should report WebGPU terrain draw stats");
assert.strictEqual(webgpuStats.webgpuClearSubmitted, false, "WebGPU renderer must not clear over successful terrain draws");
assert.strictEqual(Object.prototype.hasOwnProperty.call(webgpuStats, "webglPresenterActive"), false, "WebGPU stats should not expose legacy presenter state");

console.log("renderer interface checks passed");
