const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const lodSource = read("js/render/lod.js");
const cameraSource = read("js/render/camera-unified.js");
const planetViewSource = read("js/render/planet-view.js");
const terrainSource = read("js/render/terrain.js");
const globeSource = read("js/render/webgpu-globe.js");
const globeWgsl = read("shaders/globe-sphere.wgsl");

const context = {
  PS: {
    render: {},
    camera: {
      getZoomLevels() {
        return [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}];
      },
      getView() {
        return { zoomLevel: 1.1, zoomDirection: 0 };
      },
      getZoomOutShift(zoomLevel) {
        return Math.max(0, Math.round(Number(zoomLevel) || 0));
      },
      getSurfaceLodZoomIndex() {
        return 2;
      },
      getInfo() {
        return {
          latitude: 12,
          longitude: -45,
          metersPerSample: 512,
          metersPerCanvasPixel: 8,
          footprintWidthKm: 131,
          footprintHeightKm: 74,
          approximateAltitudeKm: 89,
          surfaceLodLevel: 2,
          surfaceLodName: "regional",
          zoomOutShift: 3,
          powerOfTwoScale: 8
        };
      }
    }
  },
  world: {
    planetView: { zoomLevel: 1.1 }
  },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },
  Number,
  Math,
  Array,
  Object
};

vm.createContext(context);
vm.runInContext(lodSource, context, { filename: "js/render/lod.js" });

assert.deepStrictEqual(
  {
    globe: context.PS.render.lod.getLayerAlphas(0).globe,
    tiles: context.PS.render.lod.getLayerAlphas(0).tiles
  },
  { globe: 1, tiles: 0 },
  "zoom 0 should render globe only"
);

const transition = context.PS.render.lod.getLayerAlphas(1.1);
assert.ok(transition.globe > 0, "zoom 1.1 should keep globe visible");
assert.ok(transition.tiles > 0, "zoom 1.1 should bring terrain tiles in");
assert.ok(transition.underlay > 0, "zoom 1.1 should expose surface underlay alpha");
assert.ok(transition.globe < 1, "zoom 1.1 should fade globe down");
assert.ok(transition.tiles < 1, "zoom 1.1 should fade tiles up");

const local = context.PS.render.lod.getLayerAlphas(2);
assert.strictEqual(local.globe, 0, "zoom 2 should disable globe");
assert.strictEqual(local.tiles, 1, "zoom 2 should render tiles only");

assert.strictEqual(context.PS.render.lod.getVisualLevel(11), "SURFACE", "detailed camera zoom should use full surface visual LOD");
assert.strictEqual(context.PS.render.lod.getVisualLevel(8), "AREA", "area camera zoom should use reduced area visual LOD");
assert.strictEqual(context.PS.render.lod.getVisualLevel(5), "REGION", "region camera zoom should use aggregated region visual LOD");
assert.strictEqual(context.PS.render.lod.getVisualLevel(2), "WORLD", "wide camera zoom should use world/minimap visual LOD");
assert.strictEqual(context.PS.render.lod.getVisualPolicy(11).renderBudgetMs, 16, "surface visual LOD should keep a 16ms render budget");
assert.strictEqual(context.PS.render.lod.getVisualPolicy(5).renderBudgetMs, 8, "region visual LOD should target the 8ms render budget");
assert.strictEqual(context.PS.render.lod.getVisualPolicy(2).renderBudgetMs, 4, "world visual LOD should target the 4ms render budget");
assert.strictEqual(context.PS.render.lod.getVisualPolicy(2).mountainOverlays, "disabled", "world visual LOD should disable detailed mountain overlays");
assert.strictEqual(context.PS.render.lod.getVisualPolicy(2).autotileTransitions, "disabled", "world visual LOD should disable detailed autotile overlays");
assert.strictEqual(context.PS.render.lod.getVisualPolicy(2).waterUvScrollScale, 0, "world visual LOD should disable water UV scroll");
assert.ok(context.PS.render.lod.getVisualPolicy(7.9).transitionAlpha > 0, "near-boundary fractional zoom-out values should expose an LOD transition alpha");

assert.ok(cameraSource.indexOf("isTransitioning") >= 0, "camera should expose transition state");
assert.ok(cameraSource.indexOf("getLayerAlphas(zoom)") >= 0, "camera local/transition state should use LOD alphas");
assert.ok(planetViewSource.indexOf("PS.camera.unified.isLocalView") >= 0, "planet local view helper should share unified camera threshold");
assert.ok(terrainSource.indexOf("PS.render.lod.getLayerAlphas") >= 0, "terrain draw should consume layer alphas");
assert.ok(terrainSource.indexOf("PS.render.webgpuGlobe.draw(projection") >= 0, "terrain draw should keep globe draw path active");
assert.ok(terrainSource.indexOf("PS.render.terrain.drawStableUnderlay") >= 0, "terrain draw should keep a stable parent underlay behind local tiles");
assert.ok(terrainSource.indexOf("uploadTerrainPyramidTexture") >= 0, "stable parent underlay should consume the multi-resolution underlay pyramid");
assert.ok(terrainSource.indexOf("prewarmTerrainPyramidTexture") >= 0, "stable parent underlay should prewarm the next pyramid level during zoom transitions");
assert.ok(terrainSource.indexOf("underlayLevel: 3") >= 0, "region-to-local transition should prewarm the local underlay before first local frame");
assert.ok(terrainSource.indexOf("readyChildCoverage") >= 0, "stable parent underlay should publish child coverage for fallback evidence");
assert.ok(terrainSource.indexOf("PS.render.terrain.drawLocalSurface(layerAlphas.tiles") >= 0, "terrain draw should submit tile layer with tile alpha");
assert.ok(terrainSource.indexOf('loadOp: globeDrawn || underlayDrawn ? "load" : "clear"') >= 0, "tiles should load over an already drawn globe or stable underlay during transition");
assert.ok(globeSource.indexOf("spec.alpha") >= 0, "WebGPU globe renderer should accept render alpha");
assert.ok(globeSource.indexOf("spec.loadOp") >= 0, "WebGPU globe renderer should accept render-pass loadOp");
assert.ok(globeSource.indexOf("lastUnderlayRequestedLevel") >= 0, "WebGPU globe renderer should expose requested underlay source level stats");
assert.ok(globeSource.indexOf("lastSmearEvidence") >= 0, "WebGPU globe renderer should expose smear evidence metrics");
assert.ok(globeSource.indexOf("lastFlatParentEvidence") >= 0, "WebGPU globe renderer should expose flat-parent evidence metrics");
assert.ok(globeWgsl.indexOf("render_alpha") >= 0, "globe WGSL should apply render alpha");
assert.ok(globeWgsl.indexOf("return vec4<f32>(color, render_alpha)") >= 0, "globe WGSL should output render alpha");
assert.ok(globeSource.indexOf('srcFactor: "src-alpha"') >= 0, "globe pipeline should blend render alpha during LOD transition");

assert.ok(context.PS.render.lod.getCausalFieldsForBand("orbit").includes("climate"), "orbit band should expose causal climate state, not decorative detail");
assert.ok(context.PS.render.lod.getCausalFieldsForBand("settlement").includes("workStatus"), "settlement band should expose causal work/status state");
assert.ok(context.PS.render.lod.getCausalFieldsForBand("settlement").includes("lights"), "settlement band should allow causal lighting fields");

const zoomFrame = context.PS.render.lod.getFrameContract(1.1);
assert.strictEqual(zoomFrame.contractVersion, 1, "frame contract should publish a version for tests and tools");
assert.strictEqual(zoomFrame.sourceRule, "simulation-fields-first", "frame contract should encode the simulation-first visual rule");
assert.ok(zoomFrame.layerAlphas.globe > 0, "frame contract should include globe alpha");
assert.ok(zoomFrame.layerAlphas.tiles > 0, "frame contract should include tile alpha");
assert.ok(zoomFrame.activeLayers.some((entry) => entry.name === "globe"), "frame contract should list active parent layers");
assert.ok(zoomFrame.activeLayers.some((entry) => entry.name === "tiles"), "frame contract should list active detail layers");
assert.strictEqual(zoomFrame.readiness.parentFallbackPolicy, "draw-ready-parent-lineage-while-child-pending", "frame contract should preserve parent underlay during streaming");
assert.strictEqual(zoomFrame.readiness.blankChunkPolicy, "never-present-uncovered-child-surface", "frame contract should forbid blank chunk presentation");
assert.strictEqual(zoomFrame.camera.surfaceLodName, "regional", "frame contract should include camera scale cues");
assert.strictEqual(zoomFrame.camera.metersPerCanvasPixel, 8, "frame contract should expose visible scale metrics");

console.log("LOD layer alpha checks passed");
