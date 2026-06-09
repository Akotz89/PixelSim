const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

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
        return [{}, {}, {}, {}, {}, {}, {}, {}];
      },
      getView() {
        return { zoomLevel: 1.1, zoomDirection: 0 };
      },
      getSurfaceLodZoomIndex() {
        return 2;
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

assert.ok(cameraSource.indexOf("isTransitioning") >= 0, "camera should expose transition state");
assert.ok(cameraSource.indexOf("getLayerAlphas(zoom)") >= 0, "camera local/transition state should use LOD alphas");
assert.ok(planetViewSource.indexOf("PS.camera.unified.isLocalView") >= 0, "planet local view helper should share unified camera threshold");
assert.ok(terrainSource.indexOf("PS.render.lod.getLayerAlphas") >= 0, "terrain draw should consume layer alphas");
assert.ok(terrainSource.indexOf("PS.render.webgpuGlobe.draw(projection") >= 0, "terrain draw should keep globe draw path active");
assert.ok(terrainSource.indexOf("PS.render.terrain.drawLocalSurface(layerAlphas.tiles") >= 0, "terrain draw should submit tile layer with tile alpha");
assert.ok(terrainSource.indexOf('loadOp: globeDrawn ? "load" : "clear"') >= 0, "tiles should load over an already drawn globe during transition");
assert.ok(globeSource.indexOf("options.alpha") >= 0, "WebGPU globe renderer should accept render alpha");
assert.ok(globeSource.indexOf("spec.loadOp") >= 0, "WebGPU globe renderer should accept render-pass loadOp");
assert.ok(globeWgsl.indexOf("render_alpha") >= 0, "globe WGSL should apply render alpha");
assert.ok(globeWgsl.indexOf("return vec4<f32>(color, render_alpha)") >= 0, "globe WGSL should output render alpha");
assert.ok(globeSource.indexOf('srcFactor: "src-alpha"') >= 0, "globe pipeline should blend render alpha during LOD transition");

console.log("LOD layer alpha checks passed");
