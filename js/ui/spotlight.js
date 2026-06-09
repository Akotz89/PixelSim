"use strict";
PS.ui = PS.ui || {};

PS.ui.spotlight = {
  timeoutId: null,
  restoreSpeedId: null,
  hasSetup: false,
  getConfig: function() {
    return {
      autoPan: CONFIG.SPOTLIGHT_AUTO_PAN !== false,
      slowdown: CONFIG.SPOTLIGHT_SLOWDOWN_ENABLED !== false,
      slowdownSpeed: Math.max(1, Math.min(10, Math.round(Number(CONFIG.SPOTLIGHT_SLOWDOWN_SPEED) || 1))),
      durationMs: Math.max(500, Math.round(Number(CONFIG.SPOTLIGHT_DURATION_MS) || 4200))
    };
  },
  setup: function() {
    if (this.hasSetup) {
      return;
    }

    this.hasSetup = true;

    if (spotlightDismissButton) {
      spotlightDismissButton.addEventListener("click", this.dismiss.bind(this));
    }

    if (spotlightInvestigateButton) {
      spotlightInvestigateButton.addEventListener("click", this.investigate.bind(this));
    }

    if (PS.events && typeof PS.events.on === "function") {
      PS.events.on(PS.events.types.MILESTONE_REACHED, function(payload) {
        if (payload && payload.watcher && payload.watcher.spotlight) {
          PS.ui.spotlight.show(payload);
        }
      });
    }

    this.sync();
  },
  makeSpotlightEvent: function(payload) {
    return {
      type: payload.type,
      label: payload.label,
      detail: payload.detail,
      tick: payload.tick,
      deepTime: payload.deepTime,
      location: payload.location,
      inspectTarget: payload.inspectTarget,
      severity: payload.severity,
      category: payload.category
    };
  },
  show: function(payload) {
    var config = this.getConfig();
    var previousSpeed = world.spotlightState && world.spotlightState.active
      ? world.spotlightState.previousSpeed
      : world.speed;

    world.spotlightEvent = this.makeSpotlightEvent(payload);
    world.spotlightState = {
      active: true,
      previousSpeed: previousSpeed,
      startedTick: world.tick,
      expiresAt: Date.now() + config.durationMs,
      autoPan: config.autoPan,
      slowdown: config.slowdown
    };

    if (config.autoPan) {
      this.focus(world.spotlightEvent);
    }

    if (config.slowdown && world.speed > config.slowdownSpeed && typeof setSimulationSpeed === "function") {
      setSimulationSpeed(config.slowdownSpeed);
    }

    if (PS.ui.notifications) {
      PS.ui.notifications.show(payload.label, payload.detail, payload.severity);
    }

    this.scheduleRestore(config.durationMs);
    this.sync();
    world.needsRender = true;
    return world.spotlightEvent;
  },
  scheduleRestore: function(durationMs) {
    if (this.timeoutId && typeof window.clearTimeout === "function") {
      window.clearTimeout(this.timeoutId);
    }

    this.timeoutId = window.setTimeout(this.dismiss.bind(this), durationMs);
  },
  restoreSpeed: function() {
    var previousSpeed = world.spotlightState ? world.spotlightState.previousSpeed : null;

    if (Number.isFinite(Number(previousSpeed)) && typeof setSimulationSpeed === "function") {
      setSimulationSpeed(previousSpeed);
    }
  },
  dismiss: function() {
    this.restoreSpeed();

    if (this.timeoutId && typeof window.clearTimeout === "function") {
      window.clearTimeout(this.timeoutId);
    }

    world.spotlightState.active = false;
    this.sync();
    return false;
  },
  investigate: function() {
    if (world.spotlightEvent) {
      this.focus(world.spotlightEvent);
    }

    return this.dismiss();
  },
  focus: function(event) {
    if (!event) {
      return false;
    }

    if (event.inspectTarget && event.inspectTarget.type === "tile" && typeof inspectTile === "function") {
      inspectTile(event.inspectTarget.x, event.inspectTarget.y, true);
      return true;
    }

    if (event.location && typeof focusPlanetViewOnLatLon === "function") {
      focusPlanetViewOnLatLon(event.location.latitude, event.location.longitude);
      world.needsRender = true;
      return true;
    }

    return false;
  },
  sync: function() {
    if (!spotlightPanel) {
      return;
    }

    var active = Boolean(world.spotlightState && world.spotlightState.active && world.spotlightEvent);

    spotlightPanel.hidden = !active;

    if (!active) {
      return;
    }

    setElementText(spotlightTitle, world.spotlightEvent.label || "Event");
    setElementText(spotlightDetail, world.spotlightEvent.detail || "");
  }
};
