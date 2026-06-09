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
const targetsSource = read("js/render/webgpu-targets.js");
const gbufferSource = read("js/render/webgpu-gbuffer.js");
const compositorSource = read("js/render/webgpu-compositor.js");
const entitySource = read("js/render/webgpu-entity.js");
const entitiesSource = read("js/render/entities.js");
const gbufferComposeWgsl = read("shaders/gbuffer-compose.wgsl");

assert.ok(
  namespaceSource.indexOf("js/render/webgpu-entity.js") > namespaceSource.indexOf("js/render/webgpu-compositor.js"),
  "WebGPU entity renderer should load after WebGPU render target primitives"
);
assert.ok(
  namespaceSource.indexOf("js/render/webgpu-entity.js") < namespaceSource.indexOf("js/render/webgpu-renderer.js"),
  "WebGPU entity renderer should load before the active WebGPU renderer"
);
assert.strictEqual(namespaceSource.indexOf("js/render/entity-webgl.js"), -1, "runtime manifest must not load legacy entity renderer");
assert.strictEqual(entitySource.toLowerCase().indexOf("webgl"), -1, "WebGPU entity source must not reference WebGL");
assert.ok(entitySource.indexOf("usage: 128 | 8") >= 0, "entity instances should use GPUStorageBuffer usage");
assert.ok(entitySource.indexOf("entity-atlas.gbuffer.pipeline") >= 0, "entity renderer should expose a G-buffer MRT pipeline");
assert.ok(entitySource.indexOf("setVertexBuffer") < 0, "entity renderer should not use vertex-buffer instance attributes");
assert.ok(entitiesSource.indexOf("PS.render.webgpuEntity.drawBatches") >= 0, "entity facade should route batches to WebGPU entity renderer");

["sprite-batch", "entity-atlas", "particle", "shadow"].forEach(function (name) {
  const shaderPath = path.join(root, "shaders", name + ".wgsl");
  const sidecarPath = shaderPath + ".js";
  const shader = fs.readFileSync(shaderPath, "utf8");
  const sidecar = fs.readFileSync(sidecarPath, "utf8");
  const globalName = "SHADER_SHADERS_" + name.replace(/-/g, "_").toUpperCase() + "_WGSL";

  assert.ok(shader.indexOf("@builtin(instance_index)") >= 0, name + " should use WebGPU instancing");
  assert.ok(shader.indexOf("var<storage, read>") >= 0, name + " should read instances from a storage buffer");
  if (name === "entity-atlas") {
    assert.ok(shader.indexOf("fn fs_gbuffer") >= 0, "entity atlas shader should expose a G-buffer fragment entry");
    assert.ok(shader.indexOf("@location(1) normal_height") >= 0, "entity atlas G-buffer entry should write normal/height MRT output");
  }
  assert.ok(sidecar.indexOf(globalName) >= 0, name + " sidecar should expose the expected global");
  assert.ok(sidecar.indexOf(JSON.stringify(shader)) >= 0, name + " sidecar should embed raw WGSL");
  assert.ok(sidecar.indexOf('PS.assets.registerText("shaders/' + name + '.wgsl"') >= 0, name + " sidecar should register shader text");
});

const fakePasses = [];
const fakeDevice = {
  buffers: [],
  textures: [],
  pipelines: [],
  bindGroups: [],
  writes: [],
  textureWrites: [],
  submits: [],
  queue: {
    writeBuffer(buffer, offset, data, dataOffset, size) {
      fakeDevice.writes.push({ buffer, offset, data, dataOffset, size });
    },
    writeTexture(destination, data, layout, size) {
      fakeDevice.textureWrites.push({ destination, data, layout, size });
    },
    submit(commands) {
      fakeDevice.submits.push(commands);
    }
  },
  createBuffer(descriptor) {
    const buffer = { descriptor };
    this.buffers.push(buffer);
    return buffer;
  },
  createTexture(descriptor) {
    const texture = {
      descriptor,
      createView() {
        return { texture: this };
      }
    };
    this.textures.push(texture);
    return texture;
  },
  createSampler(descriptor) {
    return { descriptor };
  },
  createShaderModule(descriptor) {
    return { descriptor };
  },
  createRenderPipeline(descriptor) {
    const pipeline = {
      descriptor,
      getBindGroupLayout(index) {
        return { pipeline: this, index };
      }
    };
    this.pipelines.push(pipeline);
    return pipeline;
  },
  createBindGroup(descriptor) {
    const bindGroup = { descriptor };
    this.bindGroups.push(bindGroup);
    return bindGroup;
  },
  createCommandEncoder(descriptor) {
    return {
      descriptor,
      beginRenderPass(passDescriptor) {
        const pass = {
          descriptor: passDescriptor,
          draws: [],
          setPipeline(pipeline) {
            this.pipeline = pipeline;
          },
          setBindGroup(index, bindGroup) {
            this.bindGroup = bindGroup;
            this.bindGroupIndex = index;
          },
          draw() {
            this.draws.push(Array.from(arguments));
          },
          end() {
            this.ended = true;
          }
        };
        fakePasses.push(pass);
        return pass;
      },
      finish() {
        return { encoder: this };
      }
    };
  }
};

const atlasPage = {
  pageIndex: 0,
  width: 64,
  height: 64,
  version: 1,
  data: new Uint8Array(64 * 64 * 4)
};
const foodCell = { name: "entity.food.test", pageIndex: 0, x: 0, y: 0, w: 16, h: 16, u0: 0, v0: 0, u1: 0.25, v1: 0.25 };
const organismCell = { name: "entity.organism.test", pageIndex: 0, x: 16, y: 0, w: 16, h: 16, u0: 0.25, v0: 0, u1: 0.5, v1: 0.25 };
const settlementCell = { name: "entity.settlement.test", pageIndex: 0, x: 32, y: 0, w: 16, h: 16, u0: 0.5, v0: 0, u1: 0.75, v1: 0.25 };
const routeCell = { name: "entity.route.test", pageIndex: 0, x: 48, y: 0, w: 16, h: 16, u0: 0.75, v0: 0, u1: 1, v1: 0.25 };
const influenceCell = { name: "entity.influence.test", pageIndex: 0, x: 0, y: 16, w: 16, h: 16, u0: 0, v0: 0.25, u1: 0.25, v1: 0.5 };
const readinessCell = { name: "entity.readiness.test", pageIndex: 0, x: 16, y: 16, w: 16, h: 16, u0: 0.25, v0: 0.25, u1: 0.5, v1: 0.5 };
const intentCell = { name: "entity.intent.test", pageIndex: 0, x: 32, y: 16, w: 16, h: 16, u0: 0.5, v0: 0.25, u1: 0.75, v1: 0.5 };
const eventCell = { name: "entity.event.test", pageIndex: 0, x: 48, y: 16, w: 16, h: 16, u0: 0.75, v0: 0.25, u1: 1, v1: 0.5 };
const worldUiCell = { name: "entity.world-ui.test", pageIndex: 0, x: 0, y: 32, w: 16, h: 16, u0: 0, v0: 0.5, u1: 0.25, v1: 0.75 };
const stockpileCell = { name: "equivalence.stockpile.test", pageIndex: 0, x: 16, y: 32, w: 16, h: 16, u0: 0.25, v0: 0.5, u1: 0.5, v1: 0.75 };
const vegetationCell = { name: "equivalence.vegetation.test", pageIndex: 0, x: 32, y: 32, w: 16, h: 16, u0: 0.5, v0: 0.5, u1: 0.75, v1: 0.75 };
const citizenCell = { name: "equivalence.citizen.test", pageIndex: 0, x: 48, y: 32, w: 16, h: 16, u0: 0.75, v0: 0.5, u1: 1, v1: 0.75 };
const workStatusCell = { name: "equivalence.work-status.test", pageIndex: 0, x: 0, y: 48, w: 16, h: 16, u0: 0, v0: 0.75, u1: 0.25, v1: 1 };
const effectCell = { name: "equivalence.effect.test", pageIndex: 0, x: 16, y: 48, w: 16, h: 16, u0: 0.25, v0: 0.75, u1: 0.5, v1: 1 };

const context = {
  PS: {
    render: {},
    gpu: {
      format: "bgra8unorm",
      device: fakeDevice,
      canvas: { width: 800, height: 450 },
      context: {
        getCurrentTexture() {
          return fakeDevice.createTexture({
            label: "current",
            size: { width: 800, height: 450 },
            format: "bgra8unorm",
            usage: 16
          });
        }
      }
    },
    assets: {
      equivalence: {
        stats: {
          selected: 0,
          rendered: 0,
          missing: 0,
          byUse: {}
        },
        select(use) {
          const cells = {
            stockpile: stockpileCell,
            vegetation: vegetationCell,
            citizen: citizenCell,
            workStatus: workStatusCell,
            effect: effectCell
          };
          const cell = cells[use] || null;

          this.stats.selected += 1;
          this.stats.rendered += cell ? 1 : 0;
          this.stats.missing += cell ? 0 : 1;
          this.stats.byUse[use] = (this.stats.byUse[use] || 0) + 1;
          return cell ? { renderCell: cell } : null;
        },
        getStats() {
          return {
            selected: this.stats.selected,
            rendered: this.stats.rendered,
            missing: this.stats.missing,
            byUse: Object.assign({}, this.stats.byUse),
            bySheet: {}
          };
        }
      }
    },
    atlas: {
      initialized: true,
      pages: [atlasPage],
      cells: {
        "entity.food.test": foodCell,
        "entity.organism.test": organismCell,
        "entity.settlement.test": settlementCell,
        "entity.route.test": routeCell,
        "entity.influence.test": influenceCell,
        "entity.readiness.test": readinessCell,
        "entity.intent.test": intentCell,
        "entity.event.test": eventCell,
        "entity.world-ui.test": worldUiCell,
        "equivalence.stockpile.test": stockpileCell,
        "equivalence.vegetation.test": vegetationCell,
        "equivalence.citizen.test": citizenCell,
        "equivalence.work-status.test": workStatusCell,
        "equivalence.effect.test": effectCell
      },
      getCell(name) {
        return this.cells[name] || null;
      },
      getFoodCell() {
        return foodCell;
      },
      getTraitOrganismCell() {
        return organismCell;
      },
      getSettlementCell() {
        return settlementCell;
      },
      getRouteCell() {
        return routeCell;
      },
      getSettlementInfluenceCell() {
        return influenceCell;
      },
      getSettlementReadinessCell() {
        return readinessCell;
      },
      getRepresentativeIntentCell() {
        return intentCell;
      },
      getOrbitEventMarkerCell() {
        return eventCell;
      },
      getSettlementWorldUiCell() {
        return worldUiCell;
      }
    }
  },
  CONFIG: {
    TILE_SIZE: 16,
    ORGANISM_DRAW_SIZE: 8,
    FOOD_DRAW_SIZE: 6,
    LINEAGE_COLORS: ["#72d7ff"]
  },
  WORLD_WIDTH: 100,
  WORLD_HEIGHT: 80,
  world: {
    food: [{ x: 5, y: 6, prevX: 5, prevY: 6, amount: 80 }],
    organisms: [{ id: 7, x: 8, y: 9, prevX: 8, prevY: 9, lineageId: 1, traits: {} }],
    settlements: [
      { id: "settlement-a", x: 12, y: 13, prevX: 12, prevY: 13, lineageId: 1, level: 2, population: 24, foodStock: 40, development: 0.5, influenceRadius: 3, isActive: true },
      { id: "settlement-b", x: 18, y: 13, prevX: 18, prevY: 13, lineageId: 1, level: 1, population: 8, foodStock: 12, development: 0.2, influenceRadius: 2, isActive: true }
    ],
    settlementRoutes: [
      { id: "route-a", parentSettlementId: "settlement-a", childSettlementId: "settlement-b", lineageId: 1, isActive: true }
    ],
    biologyRepresentatives: [
      { id: "rep-a", x: 8, y: 9, prevX: 8, prevY: 9, lineageId: 1, behavior: "watching", target: null, selected: true, isActive: true }
    ],
    settlementReadinessMarkers: [
      { settlementId: "settlement-a", x: 12, y: 13, prevX: 12, prevY: 13, lineageId: 1, progressBucket: 2 }
    ],
    timelineEvents: [
      { id: "event-a", x: 16, y: 12, category: "biology", severity: "info" }
    ],
    planetView: { zoomLevel: 16 }
  },
  canvas: { width: 800, height: 450 },
  performance: {
    now() {
      return Date.now();
    }
  },
  isGlobeRenderMode() {
    return false;
  },
  isPlanetLocalView() {
    return false;
  },
  getFrameInterpolation() {
    return 1;
  },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },
  Object,
  String,
  Number,
  Boolean,
  Array,
  Math,
  Date,
  Error,
  Float32Array,
  Uint8Array
};

vm.createContext(context);
vm.runInContext(managerSource, context, { filename: "js/render/wgsl-shader-manager.js" });
vm.runInContext(targetsSource, context, { filename: "js/render/webgpu-targets.js" });
vm.runInContext(gbufferSource, context, { filename: "js/render/webgpu-gbuffer.js" });
vm.runInContext(compositorSource, context, { filename: "js/render/webgpu-compositor.js" });
vm.runInContext(entitySource, context, { filename: "js/render/webgpu-entity.js" });
vm.runInContext(entitiesSource, context, { filename: "js/render/entities.js" });

["sprite-batch", "entity-atlas", "particle", "shadow"].forEach(function (name) {
  context.PS.render.wgslShaders.register(name, read("shaders/" + name + ".wgsl"), { path: "shaders/" + name + ".wgsl" });
});
context.PS.render.wgslShaders.register("gbuffer-compose", gbufferComposeWgsl, { path: "shaders/gbuffer-compose.wgsl" });

context.PS.render.webgpuEntity.registerManifest();
["sprite-batch", "entity-atlas", "particle", "shadow"].forEach(function (name) {
  assert.ok(
    context.PS.render.wgslShaderManifest.some(function (entry) { return entry.name === name; }),
    name + " should be registered in the WGSL startup manifest"
  );
});

const batches = context.PS.render.webgpuEntity.beginBatches();
context.PS.render.webgpuEntity.appendCell(batches, foodCell, 10, 20, 6, 6, 0.75, null, "food");
context.PS.render.webgpuEntity.appendCell(batches, organismCell, 40, 50, 8, 8, 1, null, "organism");
assert.strictEqual(context.PS.render.webgpuEntity.drawBatches(batches), true, "WebGPU entity renderer should draw atlas batches");

const instanceBuffer = fakeDevice.buffers.find(function (buffer) {
  return buffer.descriptor.label === "entity-atlas.instances.storage";
});
assert.ok(instanceBuffer, "entity renderer should allocate a storage instance buffer");
assert.strictEqual(instanceBuffer.descriptor.usage, 128 | 8, "entity instance buffer should be storage plus copy-dst");
assert.ok(fakeDevice.writes.some(function (write) { return write.buffer === instanceBuffer; }), "entity renderer should upload instance data with queue.writeBuffer");
assert.deepStrictEqual(fakePasses[0].draws[0], [4, 2, 0, 0], "entity renderer should draw a fullscreen quad per instance");
assert.strictEqual(fakeDevice.bindGroups[0].descriptor.entries[3].resource.buffer, instanceBuffer, "entity bind group should expose instance storage at binding 3");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().frameInstanceDrawCount, 2, "entity stats should count frame instances");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().foodDrawCount, 1, "entity stats should count food instances");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().organismDrawCount, 1, "entity stats should count organism instances");

context.PS.render.webgpuEntity.resetFrameStats();
fakePasses.length = 0;
assert.strictEqual(
  context.PS.render.webgpuEntity.drawBatches(batches, { useGbuffer: true }),
  true,
  "WebGPU entity renderer should draw atlas batches through the G-buffer"
);
assert.strictEqual(fakeDevice.pipelines.some(function (pipeline) {
  return pipeline.descriptor.label === "entity-atlas.gbuffer.pipeline";
}), true, "entity renderer should create an MRT G-buffer pipeline");
assert.strictEqual(fakePasses[0].descriptor.label, "gbuffer.entity-pass", "entity G-buffer draw should write through a labeled MRT pass");
assert.strictEqual(fakePasses[0].descriptor.colorAttachments.length, 2, "entity G-buffer pass should bind albedo and normal attachments");
assert.strictEqual(fakePasses[fakePasses.length - 1].descriptor.label, "gbuffer-compose.render-pass", "entity G-buffer draw should composite after MRT fill");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().gbufferDrawCount, 2, "entity G-buffer stats should count MRT instances");

context.PS.render.webgpuEntity.resetFrameStats();
assert.strictEqual(context.PS.render.entities.drawFood(), true, "food facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawOrganisms(), true, "organism facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().foodDrawCount, 1, "food facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().organismDrawCount, 1, "organism facade should update entity stats");

context.PS.render.webgpuEntity.resetFrameStats();
assert.strictEqual(context.PS.render.entities.drawSettlements(), true, "settlement facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawSettlementRoutes(), true, "settlement route facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawSettlementInfluence(), true, "settlement influence facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawSettlementReadiness(), true, "settlement readiness facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawRepresentativeIntents(), true, "representative intent facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawSettlementWorldUi(), true, "settlement world UI facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawOrbitEventMarkers(), true, "orbit event marker facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawSettlementStockpiles(), true, "settlement stockpile facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawSettlementVegetation(), true, "settlement vegetation facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawSettlementCitizens(), true, "settlement citizen facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawSettlementWorkStatus(), true, "settlement work status facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawSettlementEffects(), true, "settlement effect facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().settlementDrawCount, 2, "settlement facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().routeDrawCount, 1, "route facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().influenceDrawCount, 2, "influence facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().readinessDrawCount, 1, "readiness facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().intentDrawCount, 1, "intent facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().worldUiDrawCount, 6, "world UI facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().eventMarkerDrawCount, 1, "orbit event facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().stockpileDrawCount, 2, "stockpile facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().vegetationDrawCount, 4, "vegetation facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().citizenDrawCount, 4, "citizen facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().workStatusDrawCount, 2, "work status facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().effectDrawCount, 2, "effect facade should update entity stats");
assert.strictEqual(context.PS.assets.equivalence.getStats().byUse.stockpile, 2, "stockpile facade should select accepted stockpile cells");
assert.strictEqual(context.PS.assets.equivalence.getStats().byUse.vegetation, 2, "vegetation facade should select accepted vegetation cells");
assert.strictEqual(context.PS.assets.equivalence.getStats().byUse.citizen, 4, "citizen facade should select accepted citizen cells");
assert.strictEqual(context.PS.assets.equivalence.getStats().byUse.workStatus, 2, "work status facade should select accepted overlay cells");
assert.strictEqual(context.PS.assets.equivalence.getStats().byUse.effect, 2, "effect facade should select accepted effect cells");

context.PS.render.webgpuEntity.resetFrameStats();
const thousand = context.PS.render.webgpuEntity.beginBatches();
for (let i = 0; i < 1000; i++) {
  context.PS.render.webgpuEntity.appendCell(thousand, organismCell, i % 100, Math.floor(i / 100), 8, 8, 1, null, "organism");
}
assert.strictEqual(context.PS.render.webgpuEntity.drawBatches(thousand), true, "WebGPU entity renderer should accept a 1000-instance batch");
assert.strictEqual(
  context.PS.render.webgpuEntity.getStats().frameInstanceDrawCount,
  1000,
  "1000-instance draw should be reported in frame stats"
);
assert.ok(
  context.PS.render.webgpuEntity.getStats().instanceCapacity >= 1000,
  "1000-instance draw should fit in storage-buffer capacity"
);

context.PS.render.webgpuEntity.resetFrameStats();
const particleRects = new context.Float32Array([
  10, 20, 4, 4, 1, 0.5, 0.25, 0.9,
  40, 50, 8, 8, 0.2, 0.7, 1, 0.8
]);
assert.strictEqual(context.PS.render.webgpuEntity.drawParticleRects(particleRects), true, "WebGPU particle renderer should draw rect/color storage instances");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().particleDrawCount, 2, "particle stats should count particle instances");
assert.ok(
  context.PS.render.webgpuEntity.getStats().particleInstanceCapacity >= 2,
  "particle draw should allocate storage-buffer capacity"
);

const shadowRects = new context.Float32Array([
  80, 90, 18, 7, 0.02, 0.03, 0.05, 0.35
]);
assert.strictEqual(context.PS.render.webgpuEntity.drawShadowRects(shadowRects), true, "WebGPU shadow renderer should draw rect/color storage instances");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().shadowDrawCount, 1, "shadow stats should count shadow instances");
assert.ok(
  context.PS.render.webgpuEntity.getStats().shadowInstanceCapacity >= 1,
  "shadow draw should allocate storage-buffer capacity"
);

console.log("webgpu entity checks passed");
