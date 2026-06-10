const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const namespaceSource = read("js/core/namespace.js");
const drawOrderSource = read("js/render/draw-order.js");
const pipelineSource = read("js/render/pipeline.js");
const debugOverlaySource = read("js/debug/overlays.js");

assert.ok(namespaceSource.indexOf("js/render/draw-order.js") >= 0, "script manifest should load draw-order before pipeline");
assert.ok(pipelineSource.indexOf("PS.render.drawOrder.submit") >= 0, "pipeline should submit registered steps through draw order");
assert.ok(pipelineSource.indexOf("PS.render.drawOrder.flush") >= 0, "pipeline should flush draw order once per frame");
assert.ok(pipelineSource.indexOf("PS.render.lod.getTier") >= 0, "pipeline should consume LOD tier state");
assert.ok(pipelineSource.indexOf("getPreloadSurfaceLodIndex") >= 0, "pipeline should consume preload LOD readiness state");
assert.ok(pipelineSource.indexOf("transitionAlpha") >= 0, "pipeline should publish LOD transition alpha");
assert.ok(pipelineSource.indexOf("getLayerLodAlpha") >= 0, "pipeline should gate layers through LOD alpha");
assert.ok(pipelineSource.indexOf("PS.render.entities.drawSettlementInfluence()") >= 0, "settlement influence layer should call the border renderer");
assert.ok(pipelineSource.indexOf("PS.render.entities.drawSettlementRoutes()") >= 0, "settlement route layer should call the route renderer");
assert.ok(pipelineSource.indexOf("PS.render.entities.drawSettlements()") >= 0, "settlement structure layer should call the structure renderer");
assert.ok(pipelineSource.indexOf("PS.render.entities.drawRepresentativeIntents()") >= 0, "presence layer should call the representative intent renderer");
assert.ok(pipelineSource.indexOf("PS.render.entities.drawSettlementReadiness()") >= 0, "readiness layer should call the pre-settlement facade renderer");
assert.ok(debugOverlaySource.indexOf("getDebugSnapshot") >= 0, "F4 overlay should expose draw-order layer stats");

const events = [];
const context = {
  PS: {
    render: {
      terrain: {
        draw() {
          events.push("terrain");
        }
      },
      overlays: {
        drawReferenceGrid() {
          events.push("debug");
        },
        drawOrbitalAssets() {
          events.push("space.assets");
        },
        drawPlanetaryBodies() {
          events.push("space.bodies");
        },
        drawProbeMissions() {
          events.push("space.probes");
        },
        drawEmpireSectors() {
          events.push("space.sectors");
        },
        drawInterstellarFleets() {
          events.push("space.fleets");
        },
        drawEmpireLegacy() {
          events.push("space.legacy");
        },
        drawStarSystems() {
          events.push("space.stars");
        },
        drawInspectSelection() {
          events.push("selection.inspect");
        },
        drawRegistered() {
          events.push("selection.registered");
        },
        drawScanlines() {
          events.push("selection.scanlines");
        }
      },
      entities: {
        drawSettlementInfluence() {
          events.push("influence");
        },
        drawSettlementRoutes() {
          events.push("routes");
        },
        drawFood() {
          events.push("food");
        },
        drawLocalPresenceField() {
          events.push("presence");
        },
        drawRepresentativeIntents() {
          events.push("intents");
        },
        drawSettlementReadiness() {
          events.push("readiness");
        },
        drawSettlements() {
          events.push("structures");
        },
        drawOrganisms() {
          events.push("organisms");
        }
      },
      vegetation: {
        drawGrassOverlay() {
          events.push("grass");
        },
        draw() {
          events.push("vegetation");
        }
      },
      lod: {
        getArchitectureZoom(zoomLevel) {
          return 1 + (Number(zoomLevel) || 0) / 7 * 19;
        },
        getTier(zoomLevel) {
          assert.strictEqual(zoomLevel, 7, "pipeline should pass the active zoom level into LOD tier lookup");
          return {
            name: "region",
            index: 3,
            previousName: "continent",
            nextName: "local",
            blendFromPrevious: 0.25,
            blendToNext: 0,
            transitionAlpha: 0.25
          };
        },
        getPreloadSurfaceLodIndex() {
          return 4;
        }
      },
      renderer: {
        beginFrame(state) {
          events.push("begin:" + state.zoom);
        },
        endFrame() {
          events.push("end");
        }
      },
      getSubsystems() {
        return [];
      }
    },
    camera: {
      unified: {
        getState() {
          return { zoom: 7 };
        }
      }
    }
  },
  CONFIG: {},
  world: {
    planetView: {
      zoomLevel: 7
    },
    foodBuckets: {},
    organismBuckets: {},
    settlementBuckets: {}
  },
  canvas: { width: 1600, height: 900 },
  performance: {
    _now: 0,
    now() {
      this._now += 8;
      return this._now;
    }
  },
  Object,
  String,
  Number,
  Boolean,
  Array,
  Math,
  Error,
  console
};

context.PS.weather = { type: "clear" };

vm.createContext(context);
vm.runInContext(drawOrderSource, context, { filename: "js/render/draw-order.js" });
vm.runInContext(pipelineSource, context, { filename: "js/render/pipeline.js" });

assert.strictEqual(context.PS.render.pipeline.getZoomBand(0), "orbit", "first camera stop should classify as orbit band");
assert.strictEqual(context.PS.render.pipeline.getZoomBand(2), "continent", "mid camera stop should classify through architecture zoom");
assert.strictEqual(context.PS.render.pipeline.getZoomBand(5.5), "local", "detail camera stop should classify as local band");
assert.strictEqual(context.PS.render.pipeline.getZoomBand(7), "settlement", "final camera stop should classify as settlement band");

assert.deepStrictEqual(
  Object.keys(context.PS.render.DrawLayer).map((key) => context.PS.render.DrawLayer[key]),
  Array.from({ length: 18 }, (_, index) => index),
  "draw layer constants should cover 0 through 17 without gaps"
);

const manager = new context.PS.render.DrawOrderManager();
const sorted = [];
manager.submit(context.PS.render.DrawLayer.ENTITY_SORTED, {
  id: "south",
  sortY: 200,
  draw() {
    sorted.push("south");
  }
});
manager.submit(context.PS.render.DrawLayer.SHADOW, {
  id: "shadow",
  draw() {
    sorted.push("shadow");
  }
});
manager.submit(context.PS.render.DrawLayer.ENTITY_SORTED, {
  id: "north",
  sortY: 20,
  draw() {
    sorted.push("north");
  }
});
manager.submit(context.PS.render.DrawLayer.BUILDING_ROOF, {
  id: "roof",
  draw() {
    sorted.push("roof");
  }
});
manager.flush({});

assert.deepStrictEqual(sorted, ["shadow", "north", "south", "roof"], "manager should flush layers in numeric order and Y-sort entity layer south on top");
assert.strictEqual(manager.getLayerStats()[context.PS.render.DrawLayer.ENTITY_SORTED].drawCalls, 2, "stats should retain entity-sorted draw calls after flush");

const manifest = context.PS.render.pipeline.getLayerManifest();
function layer(id) {
  return manifest.find((entry) => entry.id === id);
}

assert.strictEqual(layer("terrain.base").drawLayer, context.PS.render.DrawLayer.TERRAIN_BASE, "terrain should map to base layer");
assert.strictEqual(layer("vegetation.grass").order, 34, "grass density should register immediately before world vegetation");
assert.strictEqual(layer("vegetation.grass").drawLayer, context.PS.render.DrawLayer.TERRAIN_DECORATION, "grass density should submit as terrain decoration");
assert.strictEqual(layer("vegetation.world").order, 35, "world vegetation should register between terrain and entity layers");
assert.strictEqual(layer("vegetation.world").drawLayer, context.PS.render.DrawLayer.VEGETATION_TRUNK, "world vegetation should submit trunk layer commands");
assert.strictEqual(layer("resources.food").drawLayer, context.PS.render.DrawLayer.ENTITY_GROUND, "food should draw on ground entity layer");
assert.strictEqual(layer("settlement.readiness").drawLayer, context.PS.render.DrawLayer.ENTITY_GROUND, "settlement readiness should draw as a ground facade before structures");
assert.strictEqual(layer("entities.organisms").drawLayer, context.PS.render.DrawLayer.ENTITY_SORTED, "organisms should draw in Y-sorted entity layer");
assert.strictEqual(layer("settlement.structures").drawLayer, context.PS.render.DrawLayer.BUILDING_WALL, "settlements should draw before roof/canopy overlays");
assert.strictEqual(layer("weather.particles").drawLayer, context.PS.render.DrawLayer.WEATHER, "weather should draw above world entities");
assert.strictEqual(layer("settlement.worldUi").drawLayer, context.PS.render.DrawLayer.UI_WORLD, "settlement world UI should draw in the world UI layer");
assert.strictEqual(layer("ui.minimap").drawLayer, context.PS.render.DrawLayer.UI_SCREEN, "minimap should draw as screen UI");
assert.ok(layer("resources.food").drawLayer < layer("entities.organisms").drawLayer, "food should draw before sorted entities");
assert.ok(layer("entities.organisms").drawLayer < context.PS.render.DrawLayer.BUILDING_ROOF, "sorted entities should remain below future roofs");
assert.ok(layer("weather.particles").drawLayer > context.PS.render.DrawLayer.BUILDING_ROOF, "weather should remain above roofs");
assert.ok(layer("settlement.worldUi").drawLayer > layer("weather.particles").drawLayer, "settlement world UI should draw above particles");
assert.ok(layer("ui.minimap").drawLayer > layer("status.selection").drawLayer, "screen UI should draw above selection overlays");
assert.ok(manifest.every((entry) => entry.minTier && entry.maxTier), "every default layer should declare a LOD tier range");

context.PS.render.pipeline.drawWorld();

assert.deepStrictEqual(
  events,
  [
    "begin:7",
    "terrain",
    "grass",
    "food",
    "intents",
    "readiness",
    "vegetation",
    "organisms",
    "structures",
    "influence",
    "routes",
    "end"
  ],
  "pipeline should execute active WebGPU runtime layers through formal draw order"
);

const stats = context.PS.render.pipeline.getStats();
assert.strictEqual(stats.lodTier, "region", "pipeline stats should expose consumed LOD tier");
assert.strictEqual(stats.lodTierIndex, 3, "pipeline stats should expose consumed LOD tier index");
assert.strictEqual(stats.transitionAlpha, 0.25, "pipeline stats should expose LOD transition alpha");
assert.strictEqual(stats.preloadSurfaceLodIndex, 4, "pipeline stats should expose preload LOD target");
assert.ok(stats.submittedLayers > 0, "pipeline stats should count submitted layers");
assert.ok(stats.skippedLayers > 0, "pipeline stats should count skipped layers outside the active LOD");

const transitionLayer = {
  minTier: "continent",
  maxTier: "continent"
};
const transitionAlpha = context.PS.render.pipeline.getLayerLodAlpha(
  transitionLayer,
  context.PS.render.pipeline.getLodState()
);
assert.strictEqual(transitionAlpha, 0.25, "pipeline should keep previous-tier layers visible during LOD blend windows");

const debugSnapshot = context.PS.render.drawOrder.getDebugSnapshot();
assert.strictEqual(debugSnapshot.length, 18, "debug snapshot should expose all formal layer boundaries for F4 overlay");
assert.ok(debugSnapshot.some((entry) => entry.layerName === "ENTITY_SORTED" && entry.drawCalls === 1), "debug snapshot should include sorted entity layer stats");

console.log("render layer order checks passed");
