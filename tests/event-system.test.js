const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

const runtimeErrors = [];
const context = {
  assert,
  console,
  runtimeErrors,
  window: {
    addEventListener() {}
  }
};

const source = [
  "js/core/namespace.js",
  "js/core/assert.js",
  "js/core/event-types.js",
  "js/core/events.js"
].map(read).join("\n");

vm.runInNewContext(`${source}
PS.runtime.recordError = function(kind, payload) {
  runtimeErrors.push({ kind: kind, payload: payload });
};

var eventTypeKeys = Object.keys(PS.eventTypes);
assert.ok(eventTypeKeys.length >= 15, "event type registry should include current and planned event contracts");

for (var i = 0; i < eventTypeKeys.length; i++) {
  var eventName = PS.eventTypes[eventTypeKeys[i]];
  assert.ok(PS.eventPayloads[eventName], "payload docs should exist for " + eventName);
  assert.ok(String(PS.eventPayloads[eventName].jsdoc || "").indexOf("@payload") >= 0, "payload docs should include JSDoc payload shape for " + eventName);
}

var calls = [];
PS.events.on(PS.eventTypes.CONFIG_CHANGED, function(payload) {
  calls.push("first:" + payload.key);
});
PS.events.on(PS.eventTypes.CONFIG_CHANGED, function() {
  throw new Error("subscriber failed");
});
PS.events.on(PS.eventTypes.CONFIG_CHANGED, function(payload) {
  calls.push("third:" + payload.nextValue);
});

var entry = PS.events.emit(PS.eventTypes.CONFIG_CHANGED, {
  key: "TEST_VALUE",
  previousValue: 1,
  nextValue: 2,
  source: "test"
});
var stats = PS.events.stats();

assert.deepStrictEqual(calls, ["first:TEST_VALUE", "third:2"], "bad subscriber should not stop later handlers");
assert.strictEqual(entry.handlerCount, 3, "event entry should record handler count");
assert.strictEqual(entry.errorCount, 1, "event entry should record handler errors");
assert.strictEqual(stats.emitCounts[PS.eventTypes.CONFIG_CHANGED], 1, "stats should track per-event emit frequency");
assert.strictEqual(stats.totalEmits, 1, "stats should track total event frequency");
assert.strictEqual(stats.listenerCounts[PS.eventTypes.CONFIG_CHANGED], 3, "stats should expose listener counts");
assert.strictEqual(stats.handlerErrors.length, 1, "stats should expose isolated handler errors");
assert.strictEqual(runtimeErrors[0].kind, "event.handler.error", "handler error should be logged");
`, context);

const runtimeFiles = [
  "js/core/events.js",
  "js/epochs/primordial.js",
  "js/render/gpu.js",
  "js/ui/spotlight.js"
];

for (const file of runtimeFiles) {
  const sourceText = read(file);
  assert.ok(!/PS\.events\.(?:on|emit)\(\s*["']/.test(sourceText), `${file} should use event constants, not raw event strings`);
}

console.log("event system checks passed");
