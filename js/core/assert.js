"use strict";
import { PS } from "./namespace.js";
import { world } from "../systems/state.js";

PS.assert = function (condition, message) {
  if (condition) {
    return;
  }

  var errorMessage = message || "Assertion failed";

  if (typeof world !== "undefined" && world) {
    world.isPaused = true;
  }

  if (PS.world) {
    PS.world.isPaused = true;
  }

  if (typeof showDebugMessage === "function") {
    showDebugMessage("ASSERT: " + errorMessage);
  }

  throw new Error(errorMessage);
};
