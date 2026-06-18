"use strict";
import { PS } from "./core/namespace.js";
import { startGame } from "./main-loop.js";

PS.init = function() {
  if (PS.isInitialized) {
    return false;
  }

  PS.isInitialized = true;

  if (PS.ui) {
    if (PS.ui.hud && PS.ui.hud.setup) {
      PS.ui.hud.setup();
    }

    if (PS.ui.notifications && PS.ui.notifications.setup) {
      PS.ui.notifications.setup();
    }
  }

  if (PS.runtime && typeof PS.runtime.verify === "function") {
    PS.runtime.verify();
  }

  if (typeof startGame === "function") {
    startGame();
  }

  return true;
};

PS.init();
