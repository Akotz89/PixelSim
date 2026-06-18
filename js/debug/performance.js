import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { world } from "../systems/state.js";

PS.debug = PS.debug || {};

PS.debug.performance = {
  visible: false,
  element: null,
  frameBudgetMs: 1000 / 60,
  historyLimit: 120,
  frameHistory: [],
  lastFrameStats: {
    simMs: 0,
    renderMs: 0,
    overheadMs: 0,
    totalMs: 0,
    overBudget: false,
    droppedMs: 0,
    droppedTicks: 0,
    drawCalls: 0,
    targetSpeed: 1,
    effectiveSpeed: 1,
    governorActive: false,
    governorPressureMs: 0
  },
  setup: function() {
    this.element = document.getElementById("debug-performance");
    this.configure();
    this.render();
  },
  configure: function() {
    var simConfig = PS.config && PS.config.sim ? PS.config.sim : {};

    this.frameBudgetMs = Math.max(1, Number(simConfig.frameBudgetMs) || Number(CONFIG.FRAME_BUDGET_MS) || 1000 / 60);
    this.historyLimit = Math.max(16, Math.round(Number(simConfig.frameBudgetHistoryLimit) || Number(CONFIG.FRAME_BUDGET_HISTORY_LIMIT) || 120));

    while (this.frameHistory.length > this.historyLimit) {
      this.frameHistory.shift();
    }
  },
  toggle: function() {
    this.visible = !this.visible;
    this.render();
    return this.visible;
  },
  recordFrame: function(frame) {
    var source = frame || {};
    var rendererStats = PS.render && PS.render.renderer && typeof PS.render.renderer.getStats === "function"
      ? PS.render.renderer.getStats()
      : null;
    var stats = {
      simMs: Math.max(0, Number(source.simMs) || 0),
      renderMs: Math.max(0, Number(source.renderMs) || 0),
      overheadMs: Math.max(0, Number(source.overheadMs) || 0),
      totalMs: Math.max(0, Number(source.totalMs) || 0),
      budgetMs: this.frameBudgetMs,
      overBudget: false,
      ticks: Math.max(0, Math.round(Number(source.ticks) || 0)),
      droppedMs: Math.max(0, Number(source.droppedMs) || 0),
      droppedTicks: Math.max(0, Math.round(Number(source.droppedTicks) || 0)),
      targetSpeed: PS.time ? Math.max(0, Number(PS.time.targetSpeed) || 0) : Math.max(0, Number(world.speed) || 0),
      effectiveSpeed: PS.time ? Math.max(0, Number(PS.time.effectiveSpeed) || 0) : Math.max(0, Number(world.speed) || 0),
      governorActive: Boolean(PS.time && PS.time.speedGovernor && PS.time.speedGovernor.active),
      governorPressureMs: PS.time && PS.time.speedGovernor ? Math.max(0, Number(PS.time.speedGovernor.pressureMs) || 0) : 0,
      drawCalls: rendererStats ? Math.max(0, Math.round(Number(rendererStats.drawCalls) || 0)) : 0,
      tilemapDraws: rendererStats ? Math.max(0, Math.round(Number(rendererStats.tilemapDraws) || 0)) : 0,
      entityDraws: rendererStats ? Math.max(0, Math.round(Number(rendererStats.entityDraws) || 0)) : 0,
      time: typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()
    };

    stats.overBudget = stats.totalMs > stats.budgetMs;
    this.lastFrameStats = stats;
    this.frameHistory.push(stats);

    while (this.frameHistory.length > this.historyLimit) {
      this.frameHistory.shift();
    }

    if (this.visible) {
      this.render();
    }

    return stats;
  },
  getFrameStats: function() {
    var overBudgetFrames = 0;
    var totalMs = 0;
    var maxTotalMs = 0;
    var droppedFrames = 0;

    for (var i = 0; i < this.frameHistory.length; i++) {
      var frame = this.frameHistory[i];
      totalMs += frame.totalMs;
      maxTotalMs = Math.max(maxTotalMs, frame.totalMs);

      if (frame.overBudget) {
        overBudgetFrames++;
      }

      if (frame.droppedMs > 0) {
        droppedFrames++;
      }
    }

    return {
      budgetMs: this.frameBudgetMs,
      historyLimit: this.historyLimit,
      historyLength: this.frameHistory.length,
      lastFrame: Object.assign({}, this.lastFrameStats),
      averageTotalMs: this.frameHistory.length > 0 ? totalMs / this.frameHistory.length : 0,
      maxTotalMs: maxTotalMs,
      overBudgetFrames: overBudgetFrames,
      droppedFrames: droppedFrames,
      catchUp: PS.time && PS.time.catchUpStats ? Object.assign({}, PS.time.catchUpStats) : null,
      speedGovernor: PS.time && PS.time.speedGovernor ? Object.assign({
        targetSpeed: PS.time.targetSpeed,
        effectiveSpeed: PS.time.effectiveSpeed
      }, PS.time.speedGovernor) : null,
      pools: PS.poolManager && typeof PS.poolManager.getStats === "function" ? PS.poolManager.getStats() : null
    };
  },
  getFrameGraph: function() {
    var chars = [];
    var maxBars = Math.min(this.frameHistory.length, 60);
    var start = this.frameHistory.length - maxBars;

    for (var i = start; i < this.frameHistory.length; i++) {
      var frame = this.frameHistory[i];
      var ratio = frame.totalMs / Math.max(1, this.frameBudgetMs);

      chars.push(frame.droppedMs > 0 ? "!" : (ratio > 1 ? "#" : (ratio > 0.75 ? "=" : "-")));
    }

    return chars.join("");
  },
  render: function() {
    if (!this.element) {
      this.element = document.getElementById("debug-performance");
    }

    if (!this.element) {
      return;
    }

    this.element.hidden = !this.visible;
    var frameStats = this.getFrameStats();
    var last = frameStats.lastFrame;
    this.element.textContent =
      "Render FPS " + world.fps.toFixed(1) +
      " | Sim TPS " + world.tps.toFixed(1) +
      " | Update " + world.updateMs.toFixed(2) + "ms" +
      " | Draw " + world.drawMs.toFixed(2) + "ms" +
      "\nFrame " + last.totalMs.toFixed(2) + "/" + frameStats.budgetMs.toFixed(2) + "ms" +
      " | sim " + last.simMs.toFixed(2) +
      " render " + last.renderMs.toFixed(2) +
      " overhead " + last.overheadMs.toFixed(2) +
      " | over " + frameStats.overBudgetFrames + "/" + frameStats.historyLength +
      " | dropped " + last.droppedTicks + " ticks" +
      " | draw calls " + last.drawCalls +
      "\nSpeed target " + last.targetSpeed.toFixed(2) +
      "x | effective " + last.effectiveSpeed.toFixed(2) +
      "x | governor " + (last.governorActive ? "active" : "idle") +
      " | pressure " + last.governorPressureMs.toFixed(2) + "ms" +
      "\n" + this.getFrameGraph() +
      " | Entities " + world.organisms.length + "/" + world.food.length +
      " | Memory " + this.getMemoryLabel() +
      " | Pools " + this.getPoolLabel();
  },
  getMemoryLabel: function() {
    var budget = PS.config && PS.config.pools ? PS.config.pools.memoryBudgetMb : 0;

    if (performance.memory) {
      return Math.round(performance.memory.usedJSHeapSize / 1048576) + "/" + budget + " MB";
    }

    return this.getEstimatedMemoryMb() + "/" + budget + " MB est";
  },
  getEstimatedMemoryMb: function() {
    var poolStats = PS.poolManager && typeof PS.poolManager.getStats === "function" ? PS.poolManager.getStats() : null;
    var pooledBytes = poolStats && poolStats.memory ? poolStats.memory.totalBytes : 0;

    return Math.max(1, Math.round(pooledBytes / 1048576));
  },
  getPoolLabel: function() {
    if (!PS.pools || typeof PS.pools.getStats !== "function") {
      return "-";
    }

    var stats = PS.poolManager && typeof PS.poolManager.getStats === "function" ? PS.poolManager.getStats() : PS.pools.getStats();
    var organisms = stats.organisms || { used: stats.activeOrganisms, total: stats.organismCapacity };
    var food = stats.food || { used: stats.activeFood, total: stats.foodCapacity };
    var memory = stats.memory || { totalMb: 0, budgetMb: PS.config && PS.config.pools ? PS.config.pools.memoryBudgetMb : 0 };

    return "org " + organisms.used + "/" + organisms.total +
      " food " + food.used + "/" + food.total +
      " poolMB " + memory.totalMb.toFixed(1) + "/" + memory.budgetMb;
  }
};
