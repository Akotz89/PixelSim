const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  window: {
    addEventListener() {}
  }
};

context.window.window = context.window;

vm.runInNewContext(`${read("js/core/namespace.js")}
${read("js/core/input.js")}

var triggered = [];
PS.input.clearHandlers();
PS.input.setBindings({
  pan_up: ["ArrowUp", "KeyW"],
  zoom_in: ["Equal", "NumpadAdd", "+"],
  custom_action: ["KeyJ"]
});

PS.input.on("pan_up", function(event, meta) {
  triggered.push("pan_up:" + meta.type);
  return true;
});
PS.input.on("zoom_in", function() {
  triggered.push("zoom_in");
  return true;
});

assert.deepStrictEqual(PS.input.bindings.pan_up, ["ArrowUp", "KeyW"], "setBindings should install action bindings");
assert.strictEqual(PS.input.isDown("pan_up"), false, "isDown should start false");

var handled = PS.input.handleKeyDown({ code: "ArrowUp", key: "ArrowUp" });
assert.strictEqual(handled, true, "handleKeyDown should report handled actions");
assert.strictEqual(PS.input.isDown("pan_up"), true, "isDown should track active action keys");
assert.deepStrictEqual(triggered, ["pan_up:keydown"], "keydown should dispatch named action");

PS.input.handleKeyUp({ code: "ArrowUp", key: "ArrowUp" });
assert.strictEqual(PS.input.isDown("pan_up"), false, "keyup should clear active action keys");

PS.input.handleKeyDown({ code: "NumpadAdd", key: "+" });
assert.strictEqual(triggered[1], "zoom_in", "alternate bindings should dispatch the same action");

PS.input.bind("custom_action", "KeyK");
assert.ok(PS.input.bindings.custom_action.indexOf("KeyK") >= 0, "bind should add a new key to an action");

var pointerHandled = false;
PS.input.on("wheel_zoom", function(event) {
  pointerHandled = event.deltaY < 0;
  return true;
});
assert.strictEqual(PS.input.handlePointer("wheel_zoom", { deltaY: -1 }), true, "pointer action should dispatch handlers");
assert.strictEqual(pointerHandled, true, "pointer action should pass event payload");

console.log("input manager checks passed");
`, context);

const interactionSource = read("js/ui/interaction.js");
const handleShortcutSource = interactionSource.slice(
  interactionSource.indexOf("function handleSimulationShortcut"),
  interactionSource.indexOf("function handleSimulationShortcut") + 420
);
assert.ok(
  handleShortcutSource.indexOf("shouldIgnoreSimulationShortcut(event.target)") >= 0,
  "handleSimulationShortcut should check ignored targets once at entry"
);
assert.strictEqual(
  (interactionSource.match(/shouldIgnoreSimulationShortcut\(event\.target\)/g) || []).length,
  1,
  "shortcut handlers should not repeat the ignored-target guard"
);
assert.strictEqual(interactionSource.indexOf("!window.PS"), -1, "shortcut handlers should not keep redundant window.PS guards");
