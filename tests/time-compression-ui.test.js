const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  console,
  world: {
    speed: 4,
    isPaused: false,
    isExtinct: false
  },
  PS: {
    time: {
      getTimeCompressionLabel() {
        return "120 kyr/sec / adaptive baseline";
      },
      getTimeScaleLabel() {
        return "1K years/tick";
      }
    }
  },
  escapeSummaryText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
};

vm.createContext(context);
vm.runInContext(read("js/ui/foundation.js"), context, { filename: "js/ui/foundation.js" });

const running = vm.runInContext("makeTimeCompressionControl()", context);
assert.ok(running.indexOf("Speed 4x") >= 0, "control should show selected speed");
assert.ok(running.indexOf("120 kyr/sec") >= 0, "control should show compression per second");
assert.ok(running.indexOf("adaptive baseline") >= 0, "control should show adaptive/manual state");
assert.ok(running.indexOf("1K years/tick / running") >= 0, "control should preserve tick scale and run state");

context.world.isPaused = true;
const paused = vm.runInContext("makeTimeCompressionControl()", context);
assert.ok(paused.indexOf("/ paused") >= 0, "control should show paused state");

console.log("time compression UI checks passed");
