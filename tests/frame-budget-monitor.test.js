const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  now: 0,
  window: {
    addEventListener() {}
  },
  document: {
    getElementById() {
      return {
        hidden: true,
        textContent: ""
      };
    }
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
    isPaused: false,
    fps: 60,
    tps: 30,
    updateMs: 0,
    drawMs: 0,
    organisms: [],
    food: []
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/core/config.js",
  "js/core/log.js",
  "js/epochs/registry.js",
  "js/systems/time.js",
  "js/debug/performance.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

PS.render = {
  renderer: {
    getStats: function() {
      return {
        drawCalls: 7,
        tilemapDraws: 1,
        entityDraws: 12
      };
    }
  }
};
PS.pools = {
  getStats: function() {
    return {
      activeOrganisms: 0,
      organismCapacity: 10,
      organismArrayCount: 4,
      activeFood: 0,
      foodCapacity: 10
    };
  }
};

assert.strictEqual(CONFIG.MAX_SIM_UPDATES_PER_FRAME, 3, "catch-up limiter should default to three ticks");
PS.time.reset();

var ticks = 0;
function simulateTick() {
  ticks++;
  world.tick++;
  now += 1;
}

var capped = PS.time.runFrame(250, simulateTick);
assert.strictEqual(capped.ticks, 3, "runFrame should cap catch-up ticks at three");
assert.ok(capped.droppedMs > 0, "runFrame should report dropped catch-up time");
assert.ok(PS.time.catchUpStats.droppedTicks > 0, "catch-up stats should record dropped ticks");

PS.debug.performance.configure();
var first = PS.debug.performance.recordFrame({
  simMs: capped.updateMs,
  renderMs: 6,
  overheadMs: 2,
  totalMs: 18,
  ticks: capped.ticks,
  droppedMs: capped.droppedMs,
  droppedTicks: PS.time.catchUpStats.lastDroppedTicks
});

assert.strictEqual(first.overBudget, true, "frame monitor should flag over-budget frames");
assert.strictEqual(first.drawCalls, 7, "frame monitor should include renderer draw call count");
assert.strictEqual(first.targetSpeed, PS.time.targetSpeed, "frame monitor should expose target simulation speed");
assert.strictEqual(first.effectiveSpeed, PS.time.effectiveSpeed, "frame monitor should expose effective simulation speed");
assert.strictEqual(first.governorActive, PS.time.speedGovernor.active, "frame monitor should expose governor active state");

PS.debug.performance.recordFrame({
  simMs: 1,
  renderMs: 2,
  overheadMs: 1,
  totalMs: 4,
  ticks: 0,
  droppedMs: 0,
  droppedTicks: 0
});

var stats = PS.debug.performance.getFrameStats();
assert.strictEqual(stats.historyLimit, 120, "frame monitor should keep 120-frame history by default");
assert.strictEqual(stats.historyLength, 2, "frame monitor should retain frame history");
assert.strictEqual(stats.overBudgetFrames, 1, "frame monitor should count over-budget frames");
assert.strictEqual(stats.droppedFrames, 1, "frame monitor should count dropped catch-up frames");
assert.ok(stats.averageTotalMs > 0, "frame monitor should report average frame time");
assert.ok(PS.debug.performance.getFrameGraph().indexOf("!") >= 0, "frame graph should mark dropped frames");

PS.debug.performance.visible = true;
PS.debug.performance.render();
assert.ok(
  PS.debug.performance.element.textContent.indexOf("Frame") >= 0 &&
    PS.debug.performance.element.textContent.indexOf("draw calls") >= 0 &&
    PS.debug.performance.element.textContent.indexOf("effective") >= 0,
  "performance overlay should render frame breakdown, draw calls, and speed governor diagnostics"
);

console.log("frame budget monitor checks passed");
`, context);
