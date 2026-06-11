"use strict";
PS.systems = PS.systems || {};

PS.time = {
  accumulator: 0,
  dt: CONFIG.SIM_UPDATE_INTERVAL_MS || 1000 / 30,
  maxTicksPerFrame: CONFIG.MAX_SIM_UPDATES_PER_FRAME || 3,
  targetSpeed: 1,
  effectiveSpeed: 1,
  lastDropLogTime: 0,
  transitionRate: 0.18,
  speedGovernor: {
    active: false,
    pressureMs: 0,
    throttleCount: 0,
    recoveryCount: 0,
    minSpeed: CONFIG.SIM_SPEED_GOVERNOR_MIN_SPEED || 0.25,
    frameBudgetMs: CONFIG.FRAME_BUDGET_MS || 1000 / 60,
    throttleRate: CONFIG.SIM_SPEED_GOVERNOR_THROTTLE_RATE || 0.35,
    recoveryRate: CONFIG.SIM_SPEED_GOVERNOR_RECOVERY_RATE || 0.08,
    recoveryPressure: CONFIG.SIM_SPEED_GOVERNOR_RECOVERY_PRESSURE || 0.65
  },
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
    yearsPerTick: 1000,
    targetSpeed: 1,
    effectiveSpeed: 1,
    governorActive: false,
    governorPressureMs: 0
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
    this.configureSpeedGovernor();
    this.targetSpeed = this.getTargetSpeed();
    this.effectiveSpeed = this.targetSpeed;
    this.speedGovernor.active = false;
    this.speedGovernor.pressureMs = 0;
    this.speedGovernor.throttleCount = 0;
    this.speedGovernor.recoveryCount = 0;
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
      yearsPerTick: this.timeScale.currentYearsPerTick,
      targetSpeed: this.targetSpeed,
      effectiveSpeed: this.effectiveSpeed,
      governorActive: this.speedGovernor.active,
      governorPressureMs: this.speedGovernor.pressureMs
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
  getEpochYearsPerTick: function() {
    if (PS.epochs && typeof PS.epochs.getEpochState === "function") {
      try {
        var state = PS.epochs.getEpochState();
        if (state && Number.isFinite(Number(state.ticksPerYear))) {
          return Number(state.ticksPerYear);
        }
      } catch (error) {
        return null;
      }
    }
    return null;
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
    var epochYearsPerTick = this.timeScale.manualOverride ? null : this.getEpochYearsPerTick();
    var targetIndex = this.timeScale.manualOverride
      ? this.timeScale.targetIndex
      : this.getScaleIndexForEpoch(epochId);
    var target = this.timeScales[targetIndex] || this.timeScales[3];
    if (epochYearsPerTick !== null) {
      target = { id: "epoch-state", label: this.formatYearsPerTick(epochYearsPerTick), yearsPerTick: epochYearsPerTick, aliases: [] };
      targetIndex = -1;
    }
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
  formatYearsPerSecond: function(yearsPerSecond) {
    var years = Math.max(0, Number(yearsPerSecond) || 0);
    var days = years * 365;
    var months = years * 12;

    if (years <= 0) {
      return "0 days/sec";
    }

    if (years >= 1000000000) {
      return (years / 1000000000).toFixed(years >= 10000000000 ? 0 : 1).replace(/\.0$/, "") + " Gyr/sec";
    }

    if (years >= 1000000) {
      return (years / 1000000).toFixed(years >= 10000000 ? 0 : 1).replace(/\.0$/, "") + " Myr/sec";
    }

    if (years >= 1000) {
      return (years / 1000).toFixed(years >= 10000 ? 0 : 1).replace(/\.0$/, "") + " kyr/sec";
    }

    if (years >= 1) {
      return (years >= 10 ? Math.round(years) : Number(years.toFixed(1)).toString()) + " years/sec";
    }

    if (months >= 1) {
      return (months >= 10 ? Math.round(months) : Number(months.toFixed(1)).toString()) + " months/sec";
    }

    return Math.max(1, Math.round(days)) + " days/sec";
  },
  getTimeScaleLabel: function() {
    return this.timeScale.manualOverride ? this.timeScale.label + " manual" : this.timeScale.label;
  },
  getYearsPerSecond: function() {
    if (world.isPaused || world.isExtinct) {
      return 0;
    }

    var ticksPerSecond = this.dt > 0 ? 1000 / this.dt : 0;
    var speedScale = Math.max(0, Number(this.effectiveSpeed || this.getTargetSpeed()) || 0) *
      Math.max(0, Number(CONFIG.SIM_SPEED_MULTIPLIER) || 1);

    return Math.max(0, Number(this.timeScale.currentYearsPerTick) || 0) * ticksPerSecond * speedScale;
  },
  getTimeCompressionStateLabel: function() {
    var labels = [];

    labels.push(this.timeScale.manualOverride ? "manual override" : "adaptive baseline");

    if (world.isPaused) {
      labels.push("paused");
    }

    if (world.spotlightState && world.spotlightState.active && world.spotlightState.slowdown) {
      labels.push("spotlight slowdown");
    }

    if (this.speedGovernor && this.speedGovernor.active) {
      labels.push("performance governor");
    }

    return labels.join(" / ");
  },
  getTimeCompressionLabel: function() {
    return this.formatYearsPerSecond(this.getYearsPerSecond()) + " / " + this.getTimeCompressionStateLabel();
  },
  advanceDeepTime: function(ticks) {
    var tickCount = Math.max(0, Math.round(Number(ticks) || 0));
    var years = tickCount * Math.max(0, Number(this.timeScale.currentYearsPerTick) || 0);

    world.deepTimeYears = Math.max(0, Number(world.deepTimeYears) || 0) + years;
    return world.deepTimeYears;
  },
  configureSpeedGovernor: function() {
    var simConfig = PS.config && PS.config.sim ? PS.config.sim : {};

    this.speedGovernor.minSpeed = Math.max(0.01, Number(simConfig.speedGovernorMinSpeed) || Number(CONFIG.SIM_SPEED_GOVERNOR_MIN_SPEED) || 0.25);
    this.speedGovernor.frameBudgetMs = Math.max(1, Number(simConfig.frameBudgetMs) || Number(CONFIG.FRAME_BUDGET_MS) || 1000 / 60);
    this.speedGovernor.throttleRate = Math.max(0.01, Math.min(1, Number(simConfig.speedGovernorThrottleRate) || Number(CONFIG.SIM_SPEED_GOVERNOR_THROTTLE_RATE) || 0.35));
    this.speedGovernor.recoveryRate = Math.max(0.001, Math.min(1, Number(simConfig.speedGovernorRecoveryRate) || Number(CONFIG.SIM_SPEED_GOVERNOR_RECOVERY_RATE) || 0.08));
    this.speedGovernor.recoveryPressure = Math.max(0.1, Math.min(1, Number(simConfig.speedGovernorRecoveryPressure) || Number(CONFIG.SIM_SPEED_GOVERNOR_RECOVERY_PRESSURE) || 0.65));
    this.speedGovernor.active = this.effectiveSpeed < this.targetSpeed - 0.001;
    return this.speedGovernor;
  },
  getTargetSpeed: function() {
    return Math.max(0, Number(world.speed) || 0);
  },
  syncTargetSpeed: function() {
    var nextTarget = this.getTargetSpeed();

    if (nextTarget !== this.targetSpeed) {
      this.targetSpeed = nextTarget;
      if (this.effectiveSpeed > this.targetSpeed || this.effectiveSpeed <= 0) {
        this.effectiveSpeed = this.targetSpeed;
      }
    }

    return this.targetSpeed;
  },
  getSpeedScale: function() {
    return Math.max(0, Number(this.effectiveSpeed) || 0) * Math.max(0, Number(CONFIG.SIM_SPEED_MULTIPLIER) || 1);
  },
  updateSpeedGovernor: function(updateMs, ticks) {
    var governor = this.configureSpeedGovernor();
    var measuredMs = Math.max(0, Number(updateMs) || 0);
    var target = this.syncTargetSpeed();
    var effective = Math.max(0, Number(this.effectiveSpeed) || 0);
    var budget = governor.frameBudgetMs;
    var pressureMs = ticks > 0 ? Math.max(0, measuredMs - budget) : 0;

    governor.pressureMs = pressureMs;

    if (target <= 0) {
      this.effectiveSpeed = 0;
      governor.active = false;
      return governor;
    }

    if (pressureMs > 0) {
      var pressureRatio = Math.min(3, pressureMs / budget);
      var reduction = Math.max(0.05, Math.min(0.75, pressureRatio * governor.throttleRate));
      var throttled = Math.max(governor.minSpeed, effective * (1 - reduction));

      this.effectiveSpeed = Math.min(target, throttled);
      governor.active = this.effectiveSpeed < target - 0.001;
      governor.throttleCount++;
      return governor;
    }

    if (measuredMs <= budget * governor.recoveryPressure && effective < target) {
      this.effectiveSpeed = Math.min(target, effective + (target - effective) * governor.recoveryRate);
      governor.recoveryCount++;
    }

    governor.active = this.effectiveSpeed < target - 0.001;
    return governor;
  },
  runFrame: function(elapsedMs, simulateTick) {
    var frameElapsed = Math.min(250, Math.max(0, Number(elapsedMs) || 0));
    var scaleState = this.updateAdaptiveTimeScale(false);
    this.syncTargetSpeed();
    var scaledElapsed = frameElapsed * this.getSpeedScale();
    var updateStart = performance.now();
    var ticks = 0;
    var droppedMs = 0;
    var governor;

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
    governor = this.updateSpeedGovernor(updateMs, ticks);

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
      yearsPerTick: scaleState.currentYearsPerTick,
      targetSpeed: this.targetSpeed,
      effectiveSpeed: this.effectiveSpeed,
      governorActive: governor.active,
      governorPressureMs: governor.pressureMs
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
