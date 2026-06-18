const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

function makeElement() {
  return {
    hidden: false,
    textContent: "",
    innerHTML: "",
    className: "",
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute() {},
    classList: {
      toggle() {}
    }
  };
}

const elements = {
  "spotlight-panel": makeElement(),
  "spotlight-title": makeElement(),
  "spotlight-detail": makeElement(),
  "spotlight-investigate-button": makeElement(),
  "spotlight-dismiss-button": makeElement(),
  "notification-toast": makeElement()
};
const timers = [];
const focusedTiles = [];
const focusedLocations = [];
const notifications = [];
const speedChanges = [];

const context = {
  console,
  Date,
  window: {
    setTimeout(handler, delay) {
      timers.push({ handler, delay });
      return timers.length;
    },
    clearTimeout() {},
    addEventListener() {}
  },
  document: {
    getElementById(id) {
      return elements[id] || makeElement();
    }
  },
  world: {
    tick: 42,
    speed: 4,
    eventLog: [],
    timelineEvents: [],
    milestonesReached: {},
    needsRender: false,
    spotlightEvent: null,
    spotlightState: {
      active: false,
      previousSpeed: null,
      startedTick: 0,
      expiresAt: 0,
      autoPan: true,
      slowdown: true
    }
  },
  spotlightPanel: elements["spotlight-panel"],
  spotlightTitle: elements["spotlight-title"],
  spotlightDetail: elements["spotlight-detail"],
  spotlightInvestigateButton: elements["spotlight-investigate-button"],
  spotlightDismissButton: elements["spotlight-dismiss-button"],
  focusPlanetViewOnTile(x, y) {
    focusedTiles.push({ x, y });
  },
  focusPlanetViewOnLatLon(latitude, longitude) {
    focusedLocations.push({ latitude, longitude });
  },
  inspectTile(x, y) {
    focusedTiles.push({ x, y, inspected: true });
  },
  setSimulationSpeed(speed) {
    context.world.speed = speed;
    speedChanges.push(speed);
    return speed;
  },
  setElementText(element, text) {
    element.textContent = text;
  },
  escapeSummaryText(value) {
    return String(value == null ? "" : value);
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/core/config.js",
  "js/core/assert.js",
  "js/core/event-types.js",
  "js/core/events.js",
  "js/ui/notifications.js",
  "js/ui/spotlight.js"
].map(read).join("\n");

vm.runInNewContext(source, context);

assert.strictEqual(context.PS.config.spotlight.autoPan, true, "spotlight config should expose autopan");
assert.strictEqual(context.PS.config.spotlight.durationMs, 4200, "spotlight config should expose duration");

context.PS.ui.notifications.show = function(label, detail, level) {
  notifications.push({ label, detail, level });
  return notifications[notifications.length - 1];
};
context.PS.ui.spotlight.setup();

context.PS.events.emitMilestone({
  type: "geology.test",
  label: "Tectonic surge",
  detail: "rift activity",
  source: "geology",
  severity: "major",
  inspectTarget: { type: "tile", x: 7, y: 8 },
  watcher: {
    eventLog: true,
    timeline: true,
    notification: true,
    spotlight: true
  }
});

assert.strictEqual(context.world.spotlightState.active, true, "spotlight should activate for watcher spotlight events");
assert.strictEqual(context.world.spotlightState.previousSpeed, 4, "spotlight should remember previous speed");
assert.strictEqual(context.world.speed, 1, "spotlight should slow speed to configured value");
assert.ok(speedChanges.indexOf(1) >= 0, "spotlight should call speed setter for slowdown");
assert.strictEqual(elements["spotlight-panel"].hidden, false, "spotlight panel should become visible");
assert.strictEqual(elements["spotlight-title"].textContent, "Tectonic surge", "spotlight should render event title");
assert.strictEqual(elements["spotlight-detail"].textContent, "rift activity", "spotlight should render event detail");
assert.ok(notifications.some((entry) => entry.label === "Tectonic surge"), "spotlight event should show notification");
assert.ok(focusedTiles.some((entry) => entry.x === 7 && entry.y === 8), "spotlight should focus inspect target");
assert.strictEqual(timers[0].delay, 4200, "spotlight dismiss timer should use configured duration");

context.PS.ui.spotlight.dismiss();
assert.strictEqual(context.world.spotlightState.active, false, "dismiss should deactivate spotlight");
assert.strictEqual(context.world.speed, 4, "dismiss should restore previous speed");

vm.runInNewContext("CONFIG.SPOTLIGHT_AUTO_PAN = false; CONFIG.SPOTLIGHT_SLOWDOWN_ENABLED = false;", context);
focusedLocations.length = 0;
speedChanges.length = 0;
context.world.speed = 3;
context.PS.ui.spotlight.show({
  type: "atmosphere.location",
  label: "Oxygen pulse",
  detail: "photosynthesis bloom",
  tick: 50,
  deepTime: 1000,
  category: "atmosphere",
  severity: "info",
  location: { latitude: 12.5, longitude: -44 }
});

assert.strictEqual(focusedLocations.length, 0, "disabled autopan should not focus location");
assert.strictEqual(speedChanges.length, 0, "disabled slowdown should not change speed");
assert.strictEqual(context.world.speed, 3, "disabled slowdown should preserve current speed");

context.PS.ui.spotlight.investigate();
assert.deepStrictEqual(focusedLocations[0], { latitude: 12.5, longitude: -44 }, "investigate should focus stored event location");

console.log("event spotlight checks passed");
