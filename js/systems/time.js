"use strict";
PS.systems = PS.systems || {};

PS.time = {
  accumulator: 0,
  dt: CONFIG.SIM_UPDATE_INTERVAL_MS || 1000 / 30,
  maxTicksPerFrame: CONFIG.MAX_SIM_UPDATES_PER_FRAME || 3,
  lastDropLogTime: 0,
  transitionRate: 0.18,
  timeScales: [
    { id: "cosmological", label: "10M years/tick", yearsPerTick: 10000000, aliases: ["cosmological", "cosmos"] },
    { id: "primordial", label: "100K years/tick", yearsPerTick: 100000, aliases: ["primordial"] },
    { id: "microbial", label: "10K years/tick", yearsPerTick: 10000, aliases: ["microbial"] },
    { id: "complex-life", label: "1K years/tick", yearsPerTick: 1000, aliases: ["complex-life", "complex life", "organisms", "biological"] },
    { id: "intelligence", label: "100 years/tick", yearsPerTick: 100, aliases: ["intelligence", "sentience"] },
    { id: "civilization", label: "1 year/tick", yearsPerTick: 1, aliases: ["civilization", "civilisation", "colony network"] },
    { id: "space", label: "1 month/tick", yearsPerTick: 1 / 12, aliases: ["space", "space age", "space program"] }
  ],
  timeScale: {
    currentIndex: 3,
    targetIndex: 3,
    currentYearsPerTick: 1000,
    targetYearsPerTick: 1000,
    manualOverride: false,
    epochId: "complex-life",
    label: "1K years/tick"
  },
  lastFrame: {
    elapsedMs: 0,
    scaledElapsedMs: 0,
    ticks: 0,
    interpolation: 0,
    updateMs: 0,
    droppedMs: 0,
    rendered: false,
    drawMs: 0,
    timeScaleLabel: "1K years/tick",
    yearsPerTick: 1000
  },
  catchUpStats: {
    droppedFrames: 0,
    droppedMs: 0,
    droppedTicks: 0,
    lastDroppedMs: 0,
    lastDroppedTicks: 0
  },
  get tick() {
    return world.tick;
  },
  get speed() {
    return world.speed;
  },
  setPaused: function(isPaused) {
    if (typeof setSimulationPaused === "function") {
      return setSimulationPaused(isPaused);
    }

    world.isPaused = Boolean(isPaused);
    return world.isPaused;
  },
  togglePaused: function() {
    return typeof toggleSimulationPaused === "function" ? toggleSimulationPaused() : this.setPaused(!world.isPaused);
  },
  setSpeed: function(speed) {
    return typeof setSimulationSpeed === "function" ? setSimulationSpeed(speed) : null;
  },
  stepOnce: function() {
    return typeof stepSimulationOnce === "function" ? stepSimulationOnce() : null;
  },
  updateWorld: function() {
    return typeof updateWorld === "function" ? updateWorld() : null;
  },
  reset: function() {
    this.accumulator = 0;
    this.dt = Math.max(1, Number(PS.config.sim.fixedDeltaMs) || 1000 / 30);
    this.maxTicksPerFrame = Math.max(1, Math.round(Number(PS.config.sim.maxUpdatesPerFrame) || 3));
    this.catchUpStats = {
      droppedFrames: 0,
      droppedMs: 0,
      droppedTicks: 0,
      lastDroppedMs: 0,
      lastDroppedTicks: 0
    };
    this.lastDropLogTime = 0;
    this.updateAdaptiveTimeScale(true);
    this.lastFrame = {
      elapsedMs: 0,
      scaledElapsedMs: 0,
      ticks: 0,
      interpolation: 0,
      updateMs: 0,
      droppedMs: 0,
      rendered: false,
      drawMs: 0,
      timeScaleLabel: this.getTimeScaleLabel(),
      yearsPerTick: this.timeScale.currentYearsPerTick
    };
  },
  normalizeEpochId: function(epoch) {
    return String(epoch || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  },
  getCurrentEpochId: function() {
    if (PS.epochs && typeof PS.epochs.current === "function") {
      return this.normalizeEpochId(PS.epochs.current());
    }

    return this.normalizeEpochId(world.era || "complex-life");
  },
  getScaleIndexForEpoch: function(epoch) {
    var normalizedEpoch = this.normalizeEpochId(epoch);

    for (var i = 0; i < this.timeScales.length; i++) {
      var scale = this.timeScales[i];

      if (this.normalizeEpochId(scale.id) === normalizedEpoch) {
        return i;
      }

      for (var aliasIndex = 0; aliasIndex < scale.aliases.length; aliasIndex++) {
        if (this.normalizeEpochId(scale.aliases[aliasIndex]) === normalizedEpoch) {
          return i;
        }
      }
    }

    return 3;
  },
  setManualTimeScale: function(index) {
    var nextIndex = Math.max(0, Math.min(this.timeScales.length - 1, Math.round(Number(index) || 0)));
    var scale = this.timeScales[nextIndex];

    this.timeScale.manualOverride = true;
    this.timeScale.targetIndex = nextIndex;
    this.timeScale.currentIndex = nextIndex;
    this.timeScale.targetYearsPerTick = scale.yearsPerTick;
    this.timeScale.currentYearsPerTick = scale.yearsPerTick;
    this.timeScale.label = scale.label;
    return this.timeScale;
  },
  clearManualTimeScale: function() {
    this.timeScale.manualOverride = false;
    return this.updateAdaptiveTimeScale(false);
  },
  updateAdaptiveTimeScale: function(force) {
    var epochId = this.getCurrentEpochId();
    var targetIndex = this.timeScale.manualOverride
      ? this.timeScale.targetIndex
      : this.getScaleIndexForEpoch(epochId);
    var target = this.timeScales[targetIndex] || this.timeScales[3];
    var current = Number(this.timeScale.currentYearsPerTick) || target.yearsPerTick;
    var next = force || this.timeScale.manualOverride
      ? target.yearsPerTick
      : current + (target.yearsPerTick - current) * this.transitionRate;

    if (Math.abs(next - target.yearsPerTick) < Math.max(0.0001, target.yearsPerTick * 0.01)) {
      next = target.yearsPerTick;
    }

    this.timeScale.epochId = epochId;
    this.timeScale.targetIndex = targetIndex;
    this.timeScale.targetYearsPerTick = target.yearsPerTick;
    this.timeScale.currentYearsPerTick = next;
    this.timeScale.currentIndex = targetIndex;
    this.timeScale.label = this.formatYearsPerTick(next);

    return this.timeScale;
  },
  formatYearsPerTick: function(yearsPerTick) {
    var years = Number(yearsPerTick) || 0;

    if (years >= 1000000) {
      return Math.round(years / 1000000) + "M years/tick";
    }

    if (years >= 1000) {
      return Math.round(years / 1000) + "K years/tick";
    }

    if (years >= 1) {
      return Math.round(years) + (Math.round(years) === 1 ? " year/tick" : " years/tick");
    }

    return "1 month/tick";
  },
  getTimeScaleLabel: function() {
    return this.timeScale.manualOverride ? this.timeScale.label + " manual" : this.timeScale.label;
  },
  advanceDeepTime: function(ticks) {
    var tickCount = Math.max(0, Math.round(Number(ticks) || 0));
    var years = tickCount * Math.max(0, Number(this.timeScale.currentYearsPerTick) || 0);

    world.deepTimeYears = Math.max(0, Number(world.deepTimeYears) || 0) + years;
    return world.deepTimeYears;
  },
  getSpeedScale: function() {
    return Math.max(0, Number(world.speed) || 0) * Math.max(0, Number(CONFIG.SIM_SPEED_MULTIPLIER) || 1);
  },
  runFrame: function(elapsedMs, simulateTick) {
    var frameElapsed = Math.min(250, Math.max(0, Number(elapsedMs) || 0));
    var scaleState = this.updateAdaptiveTimeScale(false);
    var scaledElapsed = frameElapsed * this.getSpeedScale();
    var updateStart = performance.now();
    var ticks = 0;
    var droppedMs = 0;

    this.dt = Math.max(1, Number(PS.config.sim.fixedDeltaMs) || this.dt || 1000 / 30);
    this.maxTicksPerFrame = Math.max(1, Math.round(Number(PS.config.sim.maxUpdatesPerFrame) || this.maxTicksPerFrame || 3));
    this.accumulator += scaledElapsed;

    while (this.accumulator >= this.dt && ticks < this.maxTicksPerFrame) {
      simulateTick(this.dt);
      this.advanceDeepTime(1);
      this.accumulator -= this.dt;
      ticks++;
    }

    if (ticks >= this.maxTicksPerFrame && this.accumulator > this.dt) {
      droppedMs = this.accumulator - this.dt;
      this.accumulator = this.dt;
      this.recordDroppedBacklog(droppedMs);
    }

    var interpolation = this.dt > 0 ? Math.min(this.accumulator / this.dt, 1) : 0;
    var updateMs = ticks > 0 ? performance.now() - updateStart : 0;

    this.lastFrame = {
      elapsedMs: frameElapsed,
      scaledElapsedMs: scaledElapsed,
      ticks: ticks,
      interpolation: interpolation,
      updateMs: updateMs,
      droppedMs: droppedMs,
      rendered: false,
      drawMs: 0,
      timeScaleLabel: this.getTimeScaleLabel(),
      yearsPerTick: scaleState.currentYearsPerTick
    };

    return this.lastFrame;
  },
  recordRenderFrame: function(drawMs) {
    var elapsed = Math.max(0, Number(drawMs) || 0);

    this.lastFrame.rendered = true;
    this.lastFrame.drawMs = elapsed;
    return this.lastFrame;
  },
  recordDroppedBacklog: function(droppedMs) {
    var elapsed = Math.max(0, Number(droppedMs) || 0);
    var droppedTicks = this.dt > 0 ? Math.floor(elapsed / this.dt) : 0;

    this.catchUpStats.droppedFrames++;
    this.catchUpStats.droppedMs += elapsed;
    this.catchUpStats.droppedTicks += droppedTicks;
    this.catchUpStats.lastDroppedMs = elapsed;
    this.catchUpStats.lastDroppedTicks = droppedTicks;

    var now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

    if (PS.log && typeof PS.log === "function" && now - this.lastDropLogTime >= 1000) {
      this.lastDropLogTime = now;
      PS.log("performance", "WARN", "Dropped simulation catch-up backlog", {
        droppedMs: elapsed,
        droppedTicks: droppedTicks,
        maxTicksPerFrame: this.maxTicksPerFrame
      });
    }

    return this.catchUpStats;
  }
};

PS.systems.time = PS.time;
