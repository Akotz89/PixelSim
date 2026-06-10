const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const context = {
  assert,
  console,
  now: 0,
  window: {
    addEventListener() {}
  },
  performance: {
    now() {
      return context.now;
    }
  },
  world: {
    tick: 0,
    era: "Organisms",
    deepTimeYears: 0,
    speed: 1,
    isPaused: false
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/core/config.js",
  "js/epochs/registry.js",
  "js/systems/time.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

assert.strictEqual(PS.time.dt, 1000 / 30, "fixed timestep should default to 1000/30ms");
assert.strictEqual(PS.time.maxTicksPerFrame, 3, "max ticks per frame should default to 3");
assert.strictEqual(PS.time.timeScales.length, 7, "adaptive time table should cover all AZR-295 epochs");
assert.strictEqual(PS.time.timeScales[0].yearsPerTick, 10000000, "cosmological scale should be 10M years per tick");
assert.strictEqual(PS.time.timeScales[1].yearsPerTick, 100000, "primordial scale should be 100K years per tick");
assert.strictEqual(PS.time.timeScales[2].yearsPerTick, 10000, "microbial scale should be 10K years per tick");
assert.strictEqual(PS.time.timeScales[3].yearsPerTick, 1000, "complex life scale should be 1K years per tick");
assert.strictEqual(PS.time.timeScales[4].yearsPerTick, 100, "intelligence scale should be 100 years per tick");
assert.strictEqual(PS.time.timeScales[5].yearsPerTick, 1, "civilization scale should be 1 year per tick");
assert.strictEqual(PS.time.timeScales[6].yearsPerTick, 1 / 12, "space scale should be 1 month per tick");

var ticks = 0;
var receivedDt = [];

function simulateTick(dt) {
  receivedDt.push(dt);
  ticks++;
  world.tick++;
  now += 2;
}

PS.time.reset();
var first = PS.time.runFrame(16, simulateTick);
assert.strictEqual(first.ticks, 0, "sub-dt frame should not simulate");
assert.ok(first.interpolation > 0 && first.interpolation < 1, "sub-dt frame should interpolate");
assert.strictEqual(first.rendered, false, "runFrame should not imply a render frame");
PS.time.recordRenderFrame(3.5);
assert.strictEqual(PS.time.lastFrame.rendered, true, "render frame should be recorded separately from sim tick");
assert.strictEqual(PS.time.lastFrame.drawMs, 3.5, "render frame should record draw duration");

var second = PS.time.runFrame(20, simulateTick);
assert.strictEqual(second.ticks, 1, "accumulated elapsed should simulate one fixed tick");
assert.strictEqual(receivedDt[0], PS.time.dt, "simulateTick should receive fixed dt");
assert.ok(second.updateMs > 0, "update time should be measured when ticks run");

world.speed = 2;
PS.time.reset();
var scaled = PS.time.runFrame(20, simulateTick);
assert.strictEqual(scaled.ticks, 1, "speed scale should advance accumulator faster");
assert.strictEqual(scaled.targetSpeed, 2, "PS.time should track target speed separately from world.speed");
assert.strictEqual(scaled.effectiveSpeed, 2, "low-load frames should keep effective speed at the target");
assert.strictEqual(scaled.governorActive, false, "governor should stay idle when update work is within budget");

world.speed = 1;
PS.time.reset();
var capped = PS.time.runFrame(250, simulateTick);
assert.strictEqual(capped.ticks, 3, "spiral guard should cap ticks per frame");
assert.ok(capped.droppedMs > 0, "spiral guard should report dropped backlog");
assert.ok(PS.time.accumulator <= PS.time.dt, "spiral guard should clamp accumulator backlog");
assert.ok(PS.time.catchUpStats.droppedFrames > 0, "spiral guard should count dropped backlog frames");
assert.ok(PS.time.catchUpStats.droppedTicks > 0, "spiral guard should count dropped backlog ticks");

PS.config.sim.fixedDeltaMs = 25;
PS.config.sim.maxUpdatesPerFrame = 2;
PS.time.reset();
var configured = PS.time.runFrame(100, simulateTick);
assert.strictEqual(PS.time.dt, 25, "dt should be configurable through PS.config.sim");
assert.strictEqual(configured.ticks, 2, "configured max ticks should be honored");

PS.config.sim.fixedDeltaMs = 10;
PS.config.sim.maxUpdatesPerFrame = 3;
PS.config.sim.frameBudgetMs = 16;
world.speed = 10;
PS.time.reset();
function slowTick(dt) {
  receivedDt.push(dt);
  world.tick++;
  now += 12;
}
var throttled = PS.time.runFrame(100, slowTick);
assert.strictEqual(throttled.targetSpeed, 10, "governor target speed should preserve the user-selected speed");
assert.ok(throttled.updateMs > PS.time.speedGovernor.frameBudgetMs, "slow ticks should exceed the configured frame budget");
assert.ok(throttled.effectiveSpeed < throttled.targetSpeed, "governor should reduce effective speed under frame pressure");
assert.strictEqual(throttled.governorActive, true, "governor should report active after throttling");
assert.ok(throttled.governorPressureMs > 0, "governor should report measured budget pressure");
assert.ok(PS.time.accumulator <= PS.time.dt, "governor should preserve accumulator backlog clamping");

function fastTick(dt) {
  receivedDt.push(dt);
  world.tick++;
  now += 1;
}
var reducedSpeed = PS.time.effectiveSpeed;
var recovered = PS.time.runFrame(1, fastTick);
assert.ok(recovered.effectiveSpeed > reducedSpeed, "governor should gradually recover toward target under low pressure");
assert.ok(recovered.effectiveSpeed <= recovered.targetSpeed, "governor recovery should not exceed the target speed");

PS.config.sim.frameBudgetMs = CONFIG.FRAME_BUDGET_MS;
PS.config.sim.fixedDeltaMs = CONFIG.SIM_UPDATE_INTERVAL_MS;
PS.config.sim.maxUpdatesPerFrame = CONFIG.MAX_SIM_UPDATES_PER_FRAME;
world.speed = 1;

var currentCalls = 0;
PS.epochs.current = function() {
  currentCalls++;
  return world.era;
};

PS.time.clearManualTimeScale();
world.era = "Primordial";
PS.time.timeScale.currentYearsPerTick = 1000;
var primordialScale = PS.time.updateAdaptiveTimeScale(false);
assert.ok(currentCalls > 0, "PS.time should read PS.epochs.current to detect epoch");
assert.strictEqual(primordialScale.targetYearsPerTick, 100000, "primordial epoch should target 100K years per tick");
assert.ok(
  primordialScale.currentYearsPerTick > 1000 && primordialScale.currentYearsPerTick < 100000,
  "epoch changes should transition smoothly instead of snapping"
);

PS.time.setManualTimeScale(6);
world.era = "Cosmological";
var manualScale = PS.time.updateAdaptiveTimeScale(false);
assert.strictEqual(manualScale.manualOverride, true, "manual time scale slider should set override state");
assert.strictEqual(manualScale.targetYearsPerTick, 1 / 12, "manual override should keep selected scale despite epoch");
assert.ok(PS.time.getTimeScaleLabel().indexOf("manual") >= 0, "manual override should be visible in label");

world.deepTimeYears = 0;
PS.time.reset();
PS.time.runFrame(100, simulateTick);
assert.ok(world.deepTimeYears > 0, "sim ticks should advance deep-time units");

console.log("time accumulator checks passed");
`, context);
