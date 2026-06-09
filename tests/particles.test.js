const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const particleData = JSON.parse(read("data/particles.json"));
const namespaceSource = read("js/core/namespace.js");
const particleSource = read("js/render/particles.js");
const pipelineSource = read("js/render/pipeline.js");

assert.ok(particleData.effects.rain, "particle data should define rain");
assert.strictEqual(particleData.effects.rain.rate, 200, "rain should emit 200 particles per second");
assert.ok(particleData.effects.snow, "particle data should define snow");
assert.ok(particleData.effects.birth_sparkle, "particle data should define birth sparkle burst");
assert.ok(particleData.effects.settlement_activity, "particle data should define settlement activity burst");
assert.ok(namespaceSource.indexOf("js/render/particles.js") >= 0, "runtime manifest should load particles");
assert.ok(pipelineSource.indexOf("PS.render.particles.update") >= 0, "render pipeline should update particles");
assert.ok(pipelineSource.indexOf("PS.render.particles.render") >= 0, "render pipeline should render particles");
assert.strictEqual(particleSource.indexOf("getContext(\"2d\""), -1, "particle runtime must not use Canvas2D");
assert.strictEqual(particleSource.toLowerCase().indexOf("webgl"), -1, "active particle runtime must not reference WebGL");
assert.ok(particleSource.indexOf("drawParticleRects") >= 0, "particle rendering should submit visible instances through the WebGPU particle shader");

const context = {
  PS: { render: {} },
  CONFIG: { PARTICLE_MAX_ACTIVE: 10000 },
  canvas: { width: 1600, height: 850 },
  performance: {
    now() {
      return Date.now();
    }
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
  Map,
  Uint8Array,
  Uint32Array,
  Float32Array
};

vm.createContext(context);
vm.runInContext(particleSource, context, { filename: "js/render/particles.js" });

const particleDraws = [];
context.PS.render.webgpuEntity = {
  drawParticleRects(values) {
    particleDraws.push(Array.from(values));
    return values && values.length > 0;
  }
};

function advance(system, seconds) {
  const step = 1 / 60;
  const frames = Math.round(seconds / step);

  for (let i = 0; i < frames; i++) {
    system.update(step);
  }
}

const system = new context.PS.render.ParticleSystem(10000);
system.loadDefinitions(particleData);
assert.strictEqual(system.getActiveCount(), 0, "new particle system should start empty");
assert.strictEqual(system.freeTop, 10000, "particle pool should preallocate all slots");

const rain = system.createEmitter("rain", {
  active: true,
  bounds: { x: 0, y: 0, width: 1600, height: 850 }
});
advance(system, 1);
assert.strictEqual(system.getActiveCount(), 200, "rain should emit 200 particles after one second");
assert.strictEqual(rain.carry, 0, "whole-rate rain emission should not retain fractional carry");

const snow = system.createEmitter("snow", {
  active: true,
  bounds: { x: 0, y: 0, width: 1600, height: 850 }
});
advance(system, 0.5);
assert.strictEqual(system.getActiveCount(), 340, "rain plus snow should emit at configured rates");

const burst = system.createEmitter("birth_sparkle", {
  active: false,
  position: { x: 100, y: 120 }
});
assert.strictEqual(burst.burst(12), 12, "birth sparkle should support burst emission");
assert.strictEqual(system.getActiveCount(), 352, "burst should add particles without starting an emitter");

const settlementActivity = system.createEmitter("settlement_activity", {
  active: false,
  position: { x: 180, y: 220 }
});
assert.strictEqual(settlementActivity.burst(24), 24, "settlement activity should support bounded burst emission");
assert.strictEqual(system.getActiveCount(), 376, "settlement activity should add visual particles without starting an emitter");
assert.strictEqual(system.render(), true, "visible particles should render through the WebGPU particle shader path");
assert.strictEqual(system.getStats().lastError, "", "successful WebGPU particle draw should clear the last error");
assert.strictEqual(system.getStats().drawCalls, 1, "successful particle render should count a WebGPU draw call");
assert.ok(particleDraws[0] && particleDraws[0].length % 8 === 0, "particle renderer should upload rect/color instance data");

context.PS.render.projection = {
  getInterpolatedProjection() {
    return { x: 320, y: 240, visible: true };
  }
};
assert.strictEqual(system.emitBirthSparkle({ x: 4, y: 8 }), 12, "organism birth should trigger a projected sparkle burst");

const full = new context.PS.render.ParticleSystem(4);
full.loadDefinitions(particleData);
assert.strictEqual(full.createEmitter("birth_sparkle", { active: false }).burst(10), 4, "particle pool should cap bursts at capacity");
assert.strictEqual(full.getStats().dropped, 6, "particle pool should count dropped particles when full");
assert.ok(full.x instanceof Float32Array && full.freeList instanceof Uint32Array, "particle pool should use typed arrays");

console.log("particle system checks passed");
