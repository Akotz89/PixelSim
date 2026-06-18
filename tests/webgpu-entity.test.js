const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

function nearly(actual, expected) {
  return Math.abs(Number(actual) - Number(expected)) < 0.00001;
}

const namespaceSource = read("js/core/namespace.js");
const managerSource = read("js/render/wgsl-shader-manager.js");
const targetsSource = read("js/render/webgpu-targets.js");
const gbufferSource = read("js/render/webgpu-gbuffer.js");
const compositorSource = read("js/render/webgpu-compositor.js");
const entitySource = read("js/render/webgpu-entity.js");
const shadowSource = read("js/render/shadow-stamping.js");
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
assert.ok(
  namespaceSource.indexOf("js/render/shadow-stamping.js") < namespaceSource.indexOf("js/render/entities.js"),
  "shadow stamping helper should load before entity facades"
);
assert.strictEqual(namespaceSource.indexOf("js/render/entity-webgl.js"), -1, "runtime manifest must not load legacy entity renderer");
assert.strictEqual(entitySource.toLowerCase().indexOf("webgl"), -1, "WebGPU entity source must not reference WebGL");
assert.ok(entitySource.indexOf("usage: 128 | 8") >= 0, "entity instances should use GPUStorageBuffer usage");
assert.ok(entitySource.indexOf("entity-atlas.gbuffer.pipeline") >= 0, "entity renderer should expose a G-buffer MRT pipeline");
assert.ok(entitySource.indexOf("setVertexBuffer") < 0, "entity renderer should not use vertex-buffer instance attributes");
assert.ok(entitiesSource.indexOf("PS.render.webgpuEntity.drawBatches") >= 0, "entity facade should route batches to WebGPU entity renderer");
[
  "drawOrbitalAssets",
  "drawPlanetaryBodies",
  "drawProbeMissions",
  "drawStarSystems",
  "drawEmpireSectors",
  "drawInterstellarFleets",
  "drawEmpireLegacy"
].forEach(function (methodName) {
  assert.strictEqual(
    entitiesSource.indexOf("PS.render.entities." + methodName + " = function"),
    -1,
    methodName + " should not exist as an unused entities-to-overlays wrapper"
  );
});
assert.ok(
  entitiesSource.indexOf("CONFIG.ORGANISM_RENDER_LOW_ENERGY") >= 0 &&
    entitiesSource.indexOf("CONFIG.ORGANISM_RENDER_HIGH_ENERGY") >= 0,
  "organism render energy buckets should use CONFIG thresholds"
);

["sprite-batch", "entity-atlas", "particle", "shadow", "sprite-displace"].forEach(function (name) {
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
    assert.ok(shader.indexOf("normal_uv_rect: vec4<f32>") >= 0, "entity atlas instances should carry an explicit normal UV rect");
    assert.ok(shader.indexOf("material_uv_rect: vec4<f32>") >= 0, "entity atlas instances should carry an explicit material UV rect");
    assert.ok(shader.indexOf("input.normal_uv") >= 0, "entity atlas G-buffer should sample normals from explicit normal UVs");
    assert.ok(shader.indexOf("input.material_uv") >= 0, "entity atlas G-buffer should sample packed material channels from explicit material UVs");
    assert.ok(shader.indexOf("packed_height") >= 0, "entity atlas G-buffer should consume packed material height");
    assert.ok(shader.indexOf("material_coverage") >= 0, "entity atlas G-buffer should consume packed material coverage");
    assert.strictEqual(shader.indexOf("fract(input.uv.x + 0.5)"), -1, "entity atlas normals must not wrap UVs across atlas midpoint");
  } else if (name === "sprite-displace") {
    assert.ok(shader.indexOf("struct DisplacementInstance") >= 0, "sprite displacement shader should define displacement instances");
    assert.ok(shader.indexOf("source_radius") >= 0, "sprite displacement shader should carry a source and radius");
    assert.ok(shader.indexOf("distance_to_source") >= 0, "sprite displacement shader should scale by distance from source");
    assert.ok(shader.indexOf("displacement_texture") >= 0, "sprite displacement shader should use a displacement texture function");
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
const rabbitSouthCell = { name: "equivalence.creature.rabbit.s", sourceCellName: "rabbit.s", pageIndex: 0, x: 0, y: 0, w: 16, h: 16, u0: 0, v0: 0, u1: 0.25, v1: 0.25 };
const rabbitEastCell = { name: "equivalence.creature.rabbit.e", sourceCellName: "rabbit.e", pageIndex: 0, x: 16, y: 0, w: 16, h: 16, u0: 0.25, v0: 0, u1: 0.5, v1: 0.25 };
const rabbitWestCell = { name: "equivalence.creature.rabbit.w", sourceCellName: "rabbit.w", pageIndex: 0, x: 32, y: 0, w: 16, h: 16, u0: 0.5, v0: 0, u1: 0.75, v1: 0.25 };
const rabbitNorthCell = { name: "equivalence.creature.rabbit.n", sourceCellName: "rabbit.n", pageIndex: 0, x: 48, y: 0, w: 16, h: 16, u0: 0.75, v0: 0, u1: 1, v1: 0.25 };
const settlementCell = { name: "entity.settlement.test", pageIndex: 0, x: 32, y: 0, w: 16, h: 16, u0: 0.5, v0: 0, u1: 0.75, v1: 0.25 };
const routeCell = { name: "entity.route.test", pageIndex: 0, x: 48, y: 0, w: 16, h: 16, u0: 0.75, v0: 0, u1: 1, v1: 0.25 };
const influenceCell = { name: "entity.influence.test", pageIndex: 0, x: 0, y: 16, w: 16, h: 16, u0: 0, v0: 0.25, u1: 0.25, v1: 0.5 };
const readinessCell = { name: "entity.readiness.test", pageIndex: 0, x: 16, y: 16, w: 16, h: 16, u0: 0.25, v0: 0.25, u1: 0.5, v1: 0.5 };
const intentCell = { name: "entity.intent.test", pageIndex: 0, x: 32, y: 16, w: 16, h: 16, u0: 0.5, v0: 0.25, u1: 0.75, v1: 0.5 };
const eventCell = { name: "entity.event.test", pageIndex: 0, x: 48, y: 16, w: 16, h: 16, u0: 0.75, v0: 0.25, u1: 1, v1: 0.5 };
const worldUiCell = { name: "entity.world-ui.test", pageIndex: 0, x: 0, y: 32, w: 16, h: 16, u0: 0, v0: 0.5, u1: 0.25, v1: 0.75 };
const populationClusterCell = { name: "entity.population.test", pageIndex: 0, x: 32, y: 16, w: 16, h: 16, u0: 0.5, v0: 0.25, u1: 0.75, v1: 0.5 };
const stockpileCell = { name: "equivalence.stockpile.test", pageIndex: 0, x: 16, y: 32, w: 16, h: 16, u0: 0.25, v0: 0.5, u1: 0.5, v1: 0.75 };
const vegetationCell = { name: "equivalence.vegetation.test", pageIndex: 0, x: 32, y: 32, w: 16, h: 16, u0: 0.5, v0: 0.5, u1: 0.75, v1: 0.75 };
const citizenCell = { name: "equivalence.citizen.test", pageIndex: 0, x: 48, y: 32, w: 16, h: 16, u0: 0.75, v0: 0.5, u1: 1, v1: 0.75 };
const workStatusCell = { name: "equivalence.work-status.test", pageIndex: 0, x: 0, y: 48, w: 16, h: 16, u0: 0, v0: 0.75, u1: 0.25, v1: 1 };
const effectCell = { name: "equivalence.effect.test", pageIndex: 0, x: 16, y: 48, w: 16, h: 16, u0: 0.25, v0: 0.75, u1: 0.5, v1: 1 };
let traitOrganismCellCalls = 0;
let creatureCellCalls = 0;

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
        selectCell(family, cellName) {
          const creatureCells = {
            "rabbit.s": rabbitSouthCell,
            "rabbit.e": rabbitEastCell,
            "rabbit.w": rabbitWestCell,
            "rabbit.n": rabbitNorthCell
          };
          const cell = family === "creatures" ? creatureCells[cellName] || null : null;

          if (family === "creatures") {
            creatureCellCalls += 1;
          }

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
        "entity.population.test": populationClusterCell,
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
        traitOrganismCellCalls += 1;
        return organismCell;
      },
      getOrganismTraitBuckets(organism, frameVariant) {
        const traits = organism && organism.traits ? organism.traits : {};
        return {
          lineage: Math.max(1, Math.round(Number(organism && organism.lineageId) || 1)) % 16,
          bodySize: Math.max(1, Math.min(6, Math.round((Number(traits.bodySize) || 1) * 2))),
          bodyShape: Math.max(0, Math.min(7, Math.round(Number(traits.bodyShape) || 0))),
          limbCount: Math.max(0, Math.min(12, Math.round(Number(traits.limbCount) || 0))),
          appendageType: Math.max(0, Math.min(7, Math.round(Number(traits.appendageType) || 0))),
          camouflage: Math.max(0, Math.min(4, Math.round((Number(traits.camouflage) || 0) * 4))),
          thermal: Math.max(0, Math.min(4, Math.round((Number(traits.thermalTolerance) || 0) * 4))),
          water: Math.max(0, Math.min(4, Math.round((Number(traits.waterDependency) || 0) * 4))),
          predator: Math.max(0, Math.min(4, Math.round((Number(traits.carnivory) || 0) * 4))),
          mobility: Math.max(0, Math.min(4, Math.round((Number(traits.movementTendency) || 0) * 4))),
          terrain: Math.max(0, Math.min(4, Math.round((Number(traits.terrainAffinity) || 0) * 4))),
          cognition: Math.max(0, Math.min(3, Math.round((Number(traits.intelligence) || 0) * 3))),
          social: Math.max(0, Math.min(3, Math.round((Number(traits.sociality) || 0) * 3))),
          variant: Math.max(0, Math.min(3, Math.round(Number(frameVariant) || 0)))
        };
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
      getPopulationClusterCell() {
        return populationClusterCell;
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
vm.runInContext(shadowSource, context, { filename: "js/render/shadow-stamping.js" });
vm.runInContext(entitiesSource, context, { filename: "js/render/entities.js" });

["sprite-batch", "entity-atlas", "particle", "shadow", "sprite-displace"].forEach(function (name) {
  context.PS.render.wgslShaders.register(name, read("shaders/" + name + ".wgsl"), { path: "shaders/" + name + ".wgsl" });
});
context.PS.render.wgslShaders.register("gbuffer-compose", gbufferComposeWgsl, { path: "shaders/gbuffer-compose.wgsl" });

context.PS.render.webgpuEntity.registerManifest();
["sprite-batch", "entity-atlas", "particle", "shadow", "sprite-displace"].forEach(function (name) {
  assert.ok(
    context.PS.render.wgslShaderManifest.some(function (entry) { return entry.name === name; }),
    name + " should be registered in the WGSL startup manifest"
  );
});

const batches = context.PS.render.webgpuEntity.beginBatches();
context.PS.render.webgpuEntity.appendCell(batches, foodCell, 10, 20, 6, 6, 0.75, null, "food");
context.PS.render.webgpuEntity.appendCell(batches, organismCell, 40, 50, 8, 8, 1, null, "organism");
const splitUvRects = context.PS.render.webgpuEntity.getCellUvRects({
  name: "entity.cross-midpoint.test",
  pageIndex: 0,
  x: 24,
  y: 0,
  w: 32,
  h: 16,
  u0: 0.375,
  v0: 0,
  u1: 0.5,
  v1: 0.0625
});
assert.deepStrictEqual(
  Array.from(splitUvRects.diffuse),
  [0.375, 0, 0.625, 0.25],
  "split entity diffuse UVs should stay in the sprite's left half"
);
assert.deepStrictEqual(
  Array.from(splitUvRects.normal),
  [0.625, 0, 0.875, 0.25],
  "split entity normal UVs should stay in the sprite's right half without wrapping"
);
const explicitNormalUvRects = context.PS.render.webgpuEntity.getCellUvRects({
  name: "entity.explicit-normal-rect.test",
  pageIndex: 0,
  x: 8,
  y: 16,
  w: 16,
  h: 16,
  normalX: 40,
  normalY: 32,
  normalW: 16,
  normalH: 16
});
assert.deepStrictEqual(
  Array.from(explicitNormalUvRects.diffuse),
  [0.125, 0.25, 0.375, 0.5],
  "entity diffuse UVs should use the authored albedo rect"
);
assert.deepStrictEqual(
  Array.from(explicitNormalUvRects.normal),
  [0.625, 0.5, 0.875, 0.75],
  "entity normal UVs should use the explicit atlas normal rect"
);
const explicitMaterialUvRect = context.PS.render.webgpuEntity.getCellMaterialUvRect({
  name: "entity.explicit-material-rect.test",
  pageIndex: 0,
  x: 8,
  y: 16,
  w: 16,
  h: 16,
  materialX: 48,
  materialY: 16,
  materialW: 16,
  materialH: 16
});
assert.deepStrictEqual(
  Array.from(explicitMaterialUvRect),
  [0.75, 0.25, 1, 0.5],
  "entity material UVs should use the explicit packed material rect"
);
assert.strictEqual(context.PS.render.webgpuEntity.drawBatches(batches), true, "WebGPU entity renderer should draw atlas batches");

const instanceBuffer = fakeDevice.buffers.find(function (buffer) {
  return buffer.descriptor.label === "entity-atlas.instances.storage";
});
assert.ok(instanceBuffer, "entity renderer should allocate a storage instance buffer");
assert.strictEqual(instanceBuffer.descriptor.usage, 128 | 8, "entity instance buffer should be storage plus copy-dst");
assert.ok(fakeDevice.writes.some(function (write) { return write.buffer === instanceBuffer; }), "entity renderer should upload instance data with queue.writeBuffer");
const entityInstanceWrite = fakeDevice.writes.find(function (write) { return write.buffer === instanceBuffer; });
assert.strictEqual(entityInstanceWrite.data.length % 20, 0, "entity instance uploads should use the 20-float diffuse+normal+material stride");
assert.deepStrictEqual(
  Array.from(entityInstanceWrite.data.slice(12, 16)),
  [0, 0, 0.25, 0.25],
  "entity instance upload should include material UV rects before tint"
);
assert.deepStrictEqual(fakePasses[0].draws[0], [4, 2, 0, 0], "entity renderer should draw a fullscreen quad per instance");
assert.strictEqual(fakeDevice.bindGroups[0].descriptor.entries[3].resource.buffer, instanceBuffer, "entity bind group should expose instance storage at binding 3");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().frameInstanceDrawCount, 2, "entity stats should count frame instances");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().foodDrawCount, 1, "entity stats should count food instances");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().organismDrawCount, 1, "entity stats should count organism instances");

context.PS.render.webgpuEntity.resetFrameStats();
fakePasses.length = 0;
assert.strictEqual(
  context.PS.render.webgpuEntity.drawBatches(batches, {
    useGbuffer: true,
    sunDirection: [0, 3, 4],
    ambient: 0.43,
    directionalStrength: 0.63,
    wrapStrength: 0.19,
    heightTintStrength: 0.08
  }),
  true,
  "WebGPU entity renderer should draw atlas batches through the G-buffer"
);
assert.strictEqual(fakeDevice.pipelines.some(function (pipeline) {
  return pipeline.descriptor.label === "entity-atlas.gbuffer.pipeline";
}), true, "entity renderer should create an MRT G-buffer pipeline");
assert.strictEqual(fakePasses[0].descriptor.label, "gbuffer.entity-pass", "entity G-buffer draw should write through a labeled MRT pass");
assert.strictEqual(fakePasses[0].descriptor.colorAttachments.length, 2, "entity G-buffer pass should bind albedo and normal attachments");
assert.strictEqual(fakePasses[fakePasses.length - 1].descriptor.label, "gbuffer-compose.render-pass", "entity G-buffer draw should composite after MRT fill");
assert.ok(fakeDevice.writes.some(function (write) {
  return write.buffer.descriptor.label === "gbuffer-compose.uniforms" &&
    nearly(write.data[1], 0.6) &&
    nearly(write.data[2], 0.8) &&
    nearly(write.data[4], 0.43) &&
    nearly(write.data[5], 0.63) &&
    nearly(write.data[6], 0.19) &&
    nearly(write.data[7], 0.08);
}), "entity G-buffer compositor should forward lighting uniforms");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().gbufferDrawCount, 2, "entity G-buffer stats should count MRT instances");

context.PS.render.webgpuEntity.resetFrameStats();
assert.strictEqual(context.PS.render.entities.drawFood(), true, "food facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.entities.drawOrganisms(), true, "organism facade should render through WebGPU entity batches");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().foodDrawCount, 1, "food facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().organismDrawCount, 1, "organism facade should update entity stats");
let organismPerfStats = context.PS.render.entities.getOrganismRenderPerfStats();
assert.strictEqual(organismPerfStats.lastOrganismRenderCount, 1, "organism render perf should count rendered candidates");
assert.strictEqual(organismPerfStats.lastSpriteCacheMisses, 1, "first organism render should populate the sprite cache");
assert.strictEqual(organismPerfStats.lastAnimationSeedComputes, 1, "first organism render should precompute a stable animation seed");
assert.strictEqual(traitOrganismCellCalls, 0, "authored organism render should not fall through to procedural morphology cells");
assert.strictEqual(creatureCellCalls, 3, "first organism render should resolve the authored directional creature cell");
assert.strictEqual(context.world.organisms[0]._renderSpriteCache.cell.name, "equivalence.creature.rabbit.s", "idle organism render should use the south-facing authored idle cell");

context.PS.render.webgpuEntity.resetFrameStats();
assert.strictEqual(context.PS.render.entities.drawOrganisms(), true, "cached organism facade should still render through WebGPU entity batches");
organismPerfStats = context.PS.render.entities.getOrganismRenderPerfStats();
assert.strictEqual(organismPerfStats.lastSpriteCacheHits, 1, "unchanged organism render should reuse cached sprite variant");
assert.strictEqual(organismPerfStats.lastSpriteCacheMisses, 0, "unchanged organism render should not recompute sprite variant");
assert.strictEqual(organismPerfStats.lastAnimationSeedComputes, 0, "unchanged organism render should reuse precomputed animation seed");
assert.strictEqual(organismPerfStats.lastEstimatedRenderObjectsPerSecond, 0, "steady-state organism render GC pressure should stay below 10,000 objects/sec");
assert.strictEqual(traitOrganismCellCalls, 0, "unchanged authored organism render should not call procedural atlas variant resolution");
assert.strictEqual(creatureCellCalls, 3, "unchanged authored organism render should reuse the cached directional cell");

context.world.organisms[0].energy = 250;
context.PS.render.webgpuEntity.resetFrameStats();
assert.strictEqual(context.PS.render.entities.drawOrganisms(), true, "non-visual state-changed organism facade should still render through WebGPU entity batches");
organismPerfStats = context.PS.render.entities.getOrganismRenderPerfStats();
assert.strictEqual(organismPerfStats.lastSpriteCacheHits, 1, "organism energy bucket change should not invalidate non-visual morphology");
assert.strictEqual(organismPerfStats.lastSpriteCacheMisses, 0, "organism energy bucket change should not regenerate sprite variant");
assert.strictEqual(traitOrganismCellCalls, 0, "non-visual authored organism render should not call procedural atlas variant resolution");
assert.strictEqual(creatureCellCalls, 3, "non-visual state change should not refresh the authored creature cell");
assert.strictEqual(organismPerfStats.lastEstimatedRenderObjectsPerSecond, 0, "non-visual state changes should not estimate sprite cache GC pressure");

context.world.organisms[0].directionX = 1;
context.world.organisms[0].directionY = 0;
context.world.organisms[0].facing = 2;
context.world.organisms[0].animFrame = 1;
context.PS.render.webgpuEntity.resetFrameStats();
assert.strictEqual(context.PS.render.entities.drawOrganisms(), true, "facing-changed organism facade should render through WebGPU entity batches");
organismPerfStats = context.PS.render.entities.getOrganismRenderPerfStats();
assert.strictEqual(organismPerfStats.lastSpriteCacheMisses, 1, "visual facing change should invalidate the organism sprite cache");
assert.strictEqual(context.world.organisms[0]._renderSpriteCache.cell.name, "equivalence.creature.rabbit.e", "east-moving organism should use the east authored creature cell");
const eastVisualState = context.PS.render.entities.getOrganismVisualState(context.world.organisms[0], 0);
assert.strictEqual(eastVisualState.family, "organism", "organism visual projection should expose render family");
assert.strictEqual(eastVisualState.state, "move", "organism visual projection should expose movement state");
assert.strictEqual(eastVisualState.direction, 2, "organism visual projection should expose numeric facing");
assert.strictEqual(eastVisualState.directionSuffix, "e", "organism visual projection should expose authored asset facing suffix");
assert.strictEqual(eastVisualState.frameCount, 4, "organism visual projection should expose frame count");
assert.strictEqual(eastVisualState.frameRate, 8, "organism visual projection should expose frame cadence");
assert.strictEqual(eastVisualState.frameVariant, 1, "organism visual projection should expose selected frame");
assert.strictEqual(
  eastVisualState.phaseOffset,
  context.PS.render.entities.getOrganismVisualSeed(context.world.organisms[0], 0) & 1023,
  "organism visual projection should expose deterministic phase"
);
assert.strictEqual(eastVisualState.tint, "#72d7ff", "organism visual projection should expose lineage tint");
assert.strictEqual(eastVisualState.statusPixel, "", "organism visual projection should expose status marker");
assert.strictEqual(creatureCellCalls, 6, "facing change should resolve a new authored direction once");
context.world.organisms[0].directionX = 0;
context.world.organisms[0].directionY = 0;
context.world.organisms[0].facing = 0;
context.world.organisms[0].animFrame = 0;

const singleOrganismFixture = context.world.organisms;
const perfOrganisms = [];
for (let i = 0; i < 1400; i += 1) {
  perfOrganisms.push({
    id: i + 100,
    x: i % 100,
    y: Math.floor(i / 100),
    prevX: i % 100,
    prevY: Math.floor(i / 100),
    lineageId: 1 + (i % 3),
    energy: 100,
    traits: {
      bodySize: 0.7 + (i % 5) * 0.2,
      bodyShape: i % 4,
      limbCount: 2 + (i % 6),
      appendageType: i % 3,
      camouflage: (i % 10) / 10,
      thermalTolerance: (i % 5) / 4,
      waterDependency: ((i + 2) % 5) / 4
    }
  });
}
context.world.organisms = perfOrganisms;
traitOrganismCellCalls = 0;
creatureCellCalls = 0;
context.PS.render.webgpuEntity.resetFrameStats();
assert.strictEqual(context.PS.render.entities.drawOrganisms(), true, "large organism fixture should render through WebGPU entity batches");
context.PS.render.webgpuEntity.resetFrameStats();
assert.strictEqual(context.PS.render.entities.drawOrganisms(), true, "large cached organism fixture should render through WebGPU entity batches");
organismPerfStats = context.PS.render.entities.getOrganismRenderPerfStats();
assert.strictEqual(organismPerfStats.lastOrganismRenderCount, 1400, "large fixture should exercise the AZR-462 organism count");
assert.strictEqual(organismPerfStats.lastSpriteCacheHits, 1400, "large steady-state render should reuse every cached sprite variant");
assert.strictEqual(organismPerfStats.lastSpriteCacheMisses, 0, "large steady-state render should not allocate variant cache objects");
assert.strictEqual(organismPerfStats.lastAnimationSeedComputes, 0, "large steady-state render should not compute animation seeds");
assert.strictEqual(organismPerfStats.lastEstimatedRenderObjectsPerSecond, 0, "large steady-state render GC pressure should stay below 10,000 objects/sec");
assert.strictEqual(traitOrganismCellCalls, 0, "large authored fixture should not fall back to procedural organism sprite cells");
assert.strictEqual(creatureCellCalls, 4200, "large steady-state render should not repeat authored creature cell resolution after warm cache");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().lastBatchBufferReallocations, 0, "large steady-state render should reuse entity batch page buffers");
context.world.organisms.reverse();
context.PS.render.webgpuEntity.resetFrameStats();
assert.strictEqual(context.PS.render.entities.drawOrganisms(), true, "reordered organism fixture should render through WebGPU entity batches");
organismPerfStats = context.PS.render.entities.getOrganismRenderPerfStats();
assert.strictEqual(organismPerfStats.lastSpriteCacheHits, 1400, "reordered organism render should keep per-entity cached sprite variants stable");
assert.strictEqual(organismPerfStats.lastSpriteCacheMisses, 0, "reordered organism render should not invalidate by array index");
perfOrganisms[0].traits.thermalTolerance = 1;
perfOrganisms[1].traits.waterDependency = 1;
context.PS.render.webgpuEntity.resetFrameStats();
assert.strictEqual(context.PS.render.entities.drawOrganisms(), true, "thermal/water trait mutation should render through WebGPU entity batches");
organismPerfStats = context.PS.render.entities.getOrganismRenderPerfStats();
assert.strictEqual(organismPerfStats.lastSpriteCacheHits, 1400, "thermal/water trait mutations should keep authored directional organism cells cached");
assert.strictEqual(organismPerfStats.lastSpriteCacheMisses, 0, "thermal/water trait mutations should not regenerate authored organism sprites");
assert.strictEqual(organismPerfStats.lastEstimatedRenderObjectsPerSecond, 0, "authored organism trait mutations should not add sprite cache GC pressure");

context.world.biologyPopulations = [
  { id: 1, x: 22, y: 16, prevX: 22, prevY: 16, lineageId: 1, count: 900, energyReserve: 120, isActive: true },
  { id: 2, x: 68, y: 34, prevX: 68, prevY: 34, lineageId: 2, count: 500, energyReserve: 80, isActive: true }
];
context.world.planetView.zoomLevel = 12;
context.PS.render.pipeline = { getZoomBand() { return "region"; } };
traitOrganismCellCalls = 0;
creatureCellCalls = 0;
context.PS.render.webgpuEntity.resetFrameStats();
assert.strictEqual(context.PS.render.entities.drawOrganisms(), true, "region zoom should collapse organisms into aggregate biology markers");
organismPerfStats = context.PS.render.entities.getOrganismRenderPerfStats();
assert.strictEqual(organismPerfStats.lastOrganismRenderCount, 1400, "aggregate mode should still report the source organism population");
assert.strictEqual(organismPerfStats.lastOrganismVisualMode, "aggregate", "region zoom should select aggregate organism visuals");
assert.strictEqual(organismPerfStats.lastOrganismClusterRenderCount, 2, "region zoom should draw bounded population clusters");
assert.strictEqual(organismPerfStats.lastOrganismIndividualRenderCount, 0, "region zoom should not draw individual organism sprites");
assert.strictEqual(organismPerfStats.lastSpriteCacheHits, 0, "aggregate mode should not touch per-organism sprite caches");
assert.strictEqual(organismPerfStats.lastSpriteCacheMisses, 0, "aggregate mode should not regenerate per-organism sprites");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().organismDrawCount, 2, "aggregate organism stats should count cluster instances");
assert.strictEqual(traitOrganismCellCalls, 0, "aggregate mode should not request procedural organism cells");
assert.strictEqual(creatureCellCalls, 0, "aggregate mode should not resolve individual creature cells");
context.PS.render.pipeline = { getZoomBand() { return "local"; } };
context.world.planetView.zoomLevel = 16;
context.world.organisms = singleOrganismFixture;

context.PS.render.webgpuEntity.resetFrameStats();
assert.strictEqual(context.PS.render.entities.drawSettlementShadows(), true, "settlement shadows should render through stamped WebGPU shadow rects");
assert.ok(context.PS.render.webgpuEntity.getStats().shadowDrawCount > 2, "settlement shadows should emit multiple stamped shadow instances");
assert.ok(
  context.PS.render.webgpuEntity.getStats().shadowDrawCount > context.world.settlements.length,
  "shadow stats should document physical stamped rect instances rather than logical settlement casters"
);
assert.strictEqual(context.PS.render.entities.settlementVisualStats.lastSettlementShadowCasters, 2, "settlement shadow diagnostics should count logical casters");
assert.ok(
  context.PS.render.entities.settlementVisualStats.lastSettlementShadowRects <= context.world.settlements.length * 3,
  "settlement shadows should keep stamped rect count bounded for readability"
);
assert.ok(
  context.PS.render.entities.settlementVisualStats.lastSettlementShadowMaxAlpha <= 0.18,
  "settlement shadows should stay soft enough not to dominate terrain readability"
);
const parentSettlementSize = context.PS.render.entities.getSettlementDrawSize(context.world.settlements[0]);
const childSettlementSize = context.PS.render.entities.getSettlementDrawSize(context.world.settlements[1]);
assert.ok(
  parentSettlementSize > childSettlementSize,
  "settlement draw footprint should scale from causal simulated population/development/radius state"
);
const settlementFootprint = context.PS.render.entities.getSettlementVisualFootprint(context.world.settlements, { width: 800, height: 450 });
assert.strictEqual(settlementFootprint.count, 2, "settlement footprint should count active visible settlements");
assert.ok(settlementFootprint.widthCoverage > 0, "settlement footprint should report nonzero screen width coverage");
assert.ok(settlementFootprint.areaCoverage > 0, "settlement footprint should report nonzero screen area coverage");
context.PS.render.webgpuEntity.resetFrameStats();
fakePasses.length = 0;
assert.strictEqual(
  context.PS.render.webgpuEntity.drawDisplacementRects(new Float32Array([
    10, 12, 64, 64,
    42, 44, 48, 9,
    0.65, 1.15, 5.5, 1.1,
    1, 0.44, 0.16, 0.22
  ])),
  true,
  "sprite displacement should render through the WebGPU entity rect path"
);
const displacementBuffer = fakeDevice.buffers.find(function (buffer) {
  return buffer.descriptor.label === "displacement.instances.storage";
});
assert.ok(displacementBuffer, "sprite displacement should allocate a storage instance buffer");
const displacementWrite = fakeDevice.writes.find(function (write) { return write.buffer === displacementBuffer; });
assert.ok(displacementWrite, "sprite displacement should upload instance data");
assert.strictEqual(displacementWrite.data.length % 16, 0, "sprite displacement uploads should use the 16-float source/radius/tint stride");
assert.strictEqual(fakePasses[fakePasses.length - 1].pipeline.descriptor.label, "displacement.pipeline", "sprite displacement should use its own WGSL pipeline");
assert.deepStrictEqual(fakePasses[fakePasses.length - 1].draws[0], [4, 1, 0, 0], "sprite displacement should draw one quad per heat-haze instance");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().displacementDrawCount, 1, "entity stats should count displacement instances");
assert.ok(context.PS.render.webgpuEntity.getStats().displacementLastFrameMs >= 0, "entity stats should expose displacement frame time");
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
assert.ok(context.PS.render.webgpuEntity.getStats().routeDrawCount > 1, "route facade should stamp readable path segments, not one midpoint marker");
assert.strictEqual(
  context.PS.render.entities.settlementVisualStats.lastSettlementRouteSegments,
  context.PS.render.webgpuEntity.getStats().routeDrawCount,
  "route diagnostics should report stamped path segment count"
);
assert.ok(context.PS.render.entities.settlementVisualStats.lastSettlementRouteBedSegments > 0, "routes should include a low-alpha grounding bed under crisp path marks");
assert.ok(context.PS.render.webgpuEntity.getStats().influenceDrawCount > 2, "influence facade should draw clustered district grounding cells");
assert.strictEqual(
  context.PS.render.entities.settlementVisualStats.lastSettlementInfluenceCells,
  context.PS.render.webgpuEntity.getStats().influenceDrawCount,
  "influence diagnostics should report clustered district grounding count"
);
assert.ok(
  context.PS.render.entities.settlementVisualStats.lastSettlementInfluenceMaxAlpha <= 0.32,
  "influence grounding should stay low-alpha enough not to become a square slab"
);
assert.strictEqual(context.PS.render.webgpuEntity.getStats().readinessDrawCount, 1, "readiness facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().intentDrawCount, 1, "intent facade should update entity stats");
assert.strictEqual(context.PS.render.webgpuEntity.getStats().worldUiDrawCount, 2, "world UI facade should keep status marks visible without stamping every metric over every settlement");
assert.strictEqual(
  context.PS.render.entities.settlementVisualStats.lastSettlementWorldUiMarks,
  context.PS.render.webgpuEntity.getStats().worldUiDrawCount,
  "world UI diagnostics should report visible map-scale status mark count"
);
assert.ok(
  context.PS.render.entities.settlementVisualStats.lastSettlementWorldUiMaxAlpha <= 0.76,
  "world UI marks should stay below full-opacity icon dominance"
);
assert.ok(
  context.PS.render.entities.settlementVisualStats.lastSettlementDistrictOffsets > 0,
  "settlement entity facades should use deterministic district offsets"
);
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
