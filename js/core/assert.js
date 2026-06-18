import { world } from "../systems/state.js";

function assertRuntime(condition, message) {
  if (condition) {
    return;
  }

  var errorMessage = message || "Assertion failed";

  if (typeof world !== "undefined" && world) {
    world.isPaused = true;
  }

  if (typeof showDebugMessage === "function") {
    showDebugMessage("ASSERT: " + errorMessage);
  }

  throw new Error(errorMessage);
}

export { assertRuntime as assert };
