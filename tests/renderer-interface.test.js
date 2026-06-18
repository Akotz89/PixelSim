const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

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
      },
      webgpuEntity: {
        spriteCells: [],
        spriteBatches: [],
        shadowRects: [],
        shadowRectRefs: [],
        particleRects: [],
        particleRectRefs: [],
        drawCell(cell, x, y, width, height, options) {
          this.spriteCells.push({ cell, x, y, width, height, options });
          return Boolean(cell);
        },
        beginBatches() {
          return { count: 0, pages: {}, kinds: {} };
        },
        appendCell(batches, cell, x, y, width, height, alpha, tint, kind) {
          if (!cell) {
            return batches;
          }
          batches.count += 1;
          batches.pages[String(cell.pageIndex || 0)] = true;
          batches.items = batches.items || [];
          batches.items.push({ cell, x, y, width, height, alpha, tint, kind });
          return batches;
        },
        drawBatches(batches) {
          this.spriteBatches.push(batches);
          return batches && batches.count > 0;
        },
        drawShadowRects(values) {
          this.shadowRectRefs.push(values);
          this.shadowRects.push(Array.from(values));
          return values && values.length > 0;
        },
        drawParticleRects(values) {
          this.particleRectRefs.push(values);
          this.particleRects.push(Array.from(values));
          return values && values.length > 0;
        },
        resetFrameStats() {
          this.didReset = true;
        },
        getStats() {
          return {
            frameInstanceDrawCount: this.spriteCells.length + (this.spriteBatches[0] ? this.spriteBatches[0].count : 0),
            settlementDrawCount: 0,
            routeDrawCount: 0,
            influenceDrawCount: 0,
            shadowDrawCount: this.shadowRects.length,
            vegetationDrawCount: 0,
            citizenDrawCount: 0,
            worldUiDrawCount: 0,
            stockpileDrawCount: 0,
            workStatusDrawCount: 0,
            effectDrawCount: 0,
            particleDrawCount: this.particleRects.length,
            foodDrawCount: 0,
            organismDrawCount: 0,
            eventMarkerDrawCount: 0,
            intentDrawCount: 0,
            readinessDrawCount: 0,
            lastFrameMs: 1
          };
        }
      },
      webgpuPointLights: {
        queued: [],
        queueLight(x, y, radius, color, intensity, kind) {
          const light = { x, y, radius, color, intensity, kind };
          this.queued.push(light);
          return light;
        },
        getStats() {
          return {
            drawCount: 0,
            submittedLights: 0,
            culledLights: 0,
            queuedLightCount: this.queued.length,
            lastFrameMs: 0
          };
        }
      }
    },
    atlas: {
      cells: {
        "entity.test": { name: "entity.test", pageIndex: 0, w: 12, h: 14 },
        "entity.other": { name: "entity.other", pageIndex: 0, w: 8, h: 8 }
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
assert.strictEqual(
  webgpuContext.PS.render.renderer.drawSprite("entity.test", 10, 20, { kind: "organism" }),
  true,
  "WebGPU renderer should route generic sprites through the WebGPU entity draw path"
);
assert.strictEqual(
  webgpuContext.PS.render.renderer.drawSprite("missing.sprite", 10, 20, { kind: "organism" }),
  false,
  "WebGPU renderer should not count missing generic sprites as rendered output"
);
assert.strictEqual(
  webgpuContext.PS.render.renderer.batchSprites([
    { spriteId: "entity.test", x: 1, y: 2, width: 3, height: 4, kind: "food" },
    { spriteId: "entity.other", x: 5, y: 6, width: 7, height: 8, kind: "organism" }
  ]),
  2,
  "WebGPU renderer should route generic sprite batches through the WebGPU entity batch path"
);
assert.strictEqual(
  webgpuContext.PS.render.renderer.drawShadow("entity.test", 12, 18, { width: 9, height: 5, alpha: 0.4 }),
  true,
  "WebGPU renderer should route generic shadows through the WebGPU shadow rect path"
);
const firstShadowRectRef = webgpuContext.PS.render.webgpuEntity.shadowRectRefs[0];
assert.strictEqual(
  webgpuContext.PS.render.renderer.drawShadow("entity.test", 14, 22, { width: 10, height: 6, alpha: 0.5 }),
  true,
  "WebGPU renderer should keep routing subsequent shadows through the WebGPU shadow rect path"
);
assert.strictEqual(
  webgpuContext.PS.render.webgpuEntity.shadowRectRefs[1],
  firstShadowRectRef,
  "WebGPU renderer should reuse its preallocated shadow rect Float32Array"
);
assert.deepStrictEqual(
  webgpuContext.PS.render.webgpuEntity.shadowRects[1].slice(0, 7),
  [14, 22, 10, 6, 0, 0, 0],
  "reused shadow scratch buffer should be overwritten with the latest draw geometry and color channels"
);
assert.ok(
  Math.abs(webgpuContext.PS.render.webgpuEntity.shadowRects[1][7] - 0.35) < 0.000001,
  "default shadow color alpha should preserve existing shadow opacity"
);
assert.strictEqual(
  webgpuContext.PS.render.renderer.drawParticle(30, 40, [1, 0.5, 0.25, 0.8], 6),
  true,
  "WebGPU renderer should route generic particles through the WebGPU particle rect path"
);
const firstParticleRectRef = webgpuContext.PS.render.webgpuEntity.particleRectRefs[0];
assert.strictEqual(
  webgpuContext.PS.render.renderer.drawParticle(34, 44, [0.25, 0.5, 1, 0.6], { width: 7, height: 8 }),
  true,
  "WebGPU renderer should keep routing subsequent particles through the WebGPU particle rect path"
);
assert.strictEqual(
  webgpuContext.PS.render.webgpuEntity.particleRectRefs[1],
  firstParticleRectRef,
  "WebGPU renderer should reuse its preallocated particle rect Float32Array"
);
assert.deepStrictEqual(
  webgpuContext.PS.render.webgpuEntity.particleRects[1].slice(0, 7),
  [34, 44, 7, 8, 0.25, 0.5, 1],
  "reused particle scratch buffer should be overwritten with the latest draw geometry and color channels"
);
assert.ok(
  Math.abs(webgpuContext.PS.render.webgpuEntity.particleRects[1][7] - 0.6) < 0.000001,
  "reused particle scratch buffer should preserve latest alpha within Float32 precision"
);
assert.strictEqual(
  webgpuContext.PS.render.renderer.addLight(50, 60, 24, [1, 0.8, 0.4], 0.9, "testLight"),
  true,
  "WebGPU renderer should queue generic lights through the WebGPU point-light path"
);

const webgpuStats = webgpuContext.PS.render.renderer.endFrame();
assert.strictEqual(webgpuStats.tilemapWebgpuDraws, 2, "WebGPU renderer should count WebGPU terrain submissions");
assert.strictEqual(webgpuStats.spriteDraws, 3, "WebGPU renderer should count only successfully submitted generic sprites");
assert.strictEqual(webgpuStats.shadowDraws, 2, "WebGPU renderer should count only successfully submitted generic shadows");
assert.strictEqual(webgpuStats.particleDraws, 2, "WebGPU renderer should count only successfully submitted generic particles");
assert.strictEqual(webgpuStats.lightCount, 1, "WebGPU renderer should count only successfully queued generic lights");
assert.strictEqual(webgpuStats.webgpuContextActive, true, "WebGPU renderer should report active WebGPU context");
assert.strictEqual(webgpuStats.singleVisibleCanvas, true, "WebGPU renderer should own the visible canvas");
assert.strictEqual(webgpuStats.terrainDraws, 6, "WebGPU renderer should report WebGPU terrain draw stats");
assert.strictEqual(webgpuStats.webgpuClearSubmitted, false, "WebGPU renderer must not clear over successful terrain draws");
assert.strictEqual(Object.prototype.hasOwnProperty.call(webgpuStats, "webglPresenterActive"), false, "WebGPU stats should not expose legacy presenter state");

console.log("renderer interface checks passed");
