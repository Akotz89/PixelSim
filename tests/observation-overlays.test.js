const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  console,
  WORLD_WIDTH: 28,
  WORLD_HEIGHT: 16,
  CONFIG: {
    TILE_SIZE: 5
  },
  observationOverlayButtons: [],
  observationOverlayStatus: null,
  world: {
    activeObservationOverlay: "none",
    needsRender: false,
    overlayPerformance: {},
    organisms: [
      { x: 8, y: 8 },
      { x: 9, y: 8 },
      { x: 10, y: 8 }
    ],
    food: [
      { x: 18, y: 8 },
      { x: 19, y: 8 }
    ],
    atmosphere: {
      gases: {
        o2: 0.2,
        co2: 0.04
      },
      temperatureC: 21
    },
    microbial: {
      ageTicks: 3,
      fieldWidth: 2,
      fieldHeight: 2,
      fields: {
        bloomIntensity: [0.7, 0.1, 0.4, 0.2],
        stress: [0.1, 0.2, 0.3, 0.4]
      }
    }
  },
  PS: {
    epochs: {
      microbial: {
        getCellForTile(x, y) {
          const cellX = x < 14 ? 0 : 1;
          const cellY = y < 8 ? 0 : 1;
          const index = cellY * 2 + cellX;

          return {
            bloomIntensity: context.world.microbial.fields.bloomIntensity[index],
            stress: context.world.microbial.fields.stress[index]
          };
        }
      }
    },
    render: {},
    sim: {
      foodWeb: {
        getRole(traits) {
          return Number(traits && traits.carnivory) > 0.5 ? "predator" : "herbivore";
        }
      },
      terrainPressure: {
        getSample() {
          return {
            pressure: 0.72,
            isolation: 0.42,
            innovationPressure: 0.58
          };
        }
      },
      massExtinction: {
        getSummary() {
          return {
            activeEvent: {
              eventType: "volcanic-winter",
              severityScore: 0.7,
              location: { x: 9, y: 8 }
            },
            latest: null,
            recoveryWindow: {
              startTick: 20,
              endTick: 80,
              durationTicks: 100
            }
          };
        }
      }
    }
  },
  ensureOrganismTraits(organism) {
    return organism.traits || {};
  },
  collectOrganismsInRadius() {
    return [
      { traits: { carnivory: 0.9 } },
      { traits: { carnivory: 0.1 } },
      { traits: { carnivory: 0.1 } }
    ];
  },
  getTileManhattanDistance(fromX, fromY, toX, toY) {
    return Math.abs(fromX - toX) + Math.abs(fromY - toY);
  },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },
  setElementText(element, text) {
    if (element) {
      element.textContent = text;
    }
  }
};

vm.runInNewContext(read("js/ui/observation-overlays.js"), context);

const expectedIds = [
  "observation.temperature",
  "observation.population",
  "observation.resources",
  "observation.foodweb",
  "observation.selection",
  "observation.extinction",
  "observation.atmosphere",
  "observation.microbial"
];
const manifest = context.PS.render.overlays.getManifest();
const webgpuGlobeSource = read("js/render/webgpu-globe.js");
const shaderSource = read("shaders/globe-sphere.wgsl");

expectedIds.forEach((id) => {
  const entry = manifest.find((overlay) => overlay.id === id);

  assert.ok(entry, `${id} should be registered`);
  assert.ok(entry.blendMode === "screen" || entry.blendMode === "lighter", `${id} should expose WebGPU blend metadata`);
  assert.strictEqual(entry.shortcut, "O", `${id} should expose keyboard shortcut metadata`);
});

assert.strictEqual(context.PS.render.observationOverlays.setActive("observation.temperature"), "observation.temperature");
assert.strictEqual(context.world.needsRender, true, "activating an overlay should request render");
assert.strictEqual(context.PS.render.observationOverlays.setActive("unknown"), "none", "unknown overlay should normalize to none");
assert.strictEqual(context.PS.render.observationOverlays.cycle(), "observation.temperature", "cycle should move from none to first overlay");

const hotSample = context.PS.render.observationOverlays.getOverlaySample("observation.temperature", 8, 2, {
  latitude: 5,
  elevation: 0.1
});
const coldSample = context.PS.render.observationOverlays.getOverlaySample("observation.temperature", 8, 14, {
  latitude: 82,
  elevation: 0.9
});
const populationSample = context.PS.render.observationOverlays.getOverlaySample("observation.population", 9, 8, {});
const resourceSample = context.PS.render.observationOverlays.getOverlaySample("observation.resources", 18, 8, {});
const foodWebSample = context.PS.render.observationOverlays.getOverlaySample("observation.foodweb", 9, 8, {});
const selectionSample = context.PS.render.observationOverlays.getOverlaySample("observation.selection", 9, 8, {});
const extinctionSample = context.PS.render.observationOverlays.getOverlaySample("observation.extinction", 9, 8, {});
const atmosphereSample = context.PS.render.observationOverlays.getOverlaySample("observation.atmosphere", 1, 1, {});
const microbialSample = context.PS.render.observationOverlays.getOverlaySample("observation.microbial", 2, 2, {});
const noneSample = context.PS.render.observationOverlays.getOverlaySample("none", 2, 2, {});

assert.ok(hotSample.red > coldSample.red, "temperature samples should encode warmer low-latitude tiles");
assert.ok(populationSample.alpha > 0, "population overlay should encode organism density into texture alpha");
assert.ok(resourceSample.alpha > 0, "resource overlay should encode food density into texture alpha");
assert.ok(foodWebSample.red > 0 && foodWebSample.alpha > 0, "food-web overlay should encode local predator/prey pressure");
assert.ok(selectionSample.alpha > 0 && selectionSample.red > 0, "selection overlay should encode terrain pressure");
assert.ok(extinctionSample.alpha > 0 && extinctionSample.red > extinctionSample.green, "extinction overlay should encode devastation and recovery bloom");
assert.ok(atmosphereSample.alpha > 0, "atmosphere overlay should encode gas composition into texture alpha");
assert.ok(microbialSample.alpha > 0, "microbial overlay should encode bloom intensity into texture alpha");
assert.strictEqual(noneSample.red + noneSample.green + noneSample.blue + noneSample.alpha, 0, "inactive overlay samples should be transparent");

assert.ok(webgpuGlobeSource.indexOf("uploadObservationOverlayTexture") >= 0, "WebGPU globe should upload active observation overlay texture");
assert.ok(webgpuGlobeSource.indexOf("lastUsedObservationOverlay") >= 0, "WebGPU globe should record overlay compositor evidence");
assert.ok(shaderSource.indexOf("overlay_texture: texture_2d<f32>") >= 0, "WGSL globe shader should accept observation overlay texture");
assert.ok(shaderSource.indexOf("overlay_mode") >= 0, "WGSL globe shader should expose overlay blend mode");
assert.strictEqual(webgpuGlobeSource.indexOf("fillRect"), -1, "observation overlay upload should not depend on Canvas2D drawing");

console.log("observation overlay checks passed");
