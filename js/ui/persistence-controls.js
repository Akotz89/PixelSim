"use strict";
import { PS } from "../core/namespace.js";
import { seedWorld } from "../main-simulation.js";
import { drawWorld } from "../render/pipeline.js";
import { persistenceStatus } from "./dom-refs.js";
import { applyTuningFromControls, setElementText, updateHud } from "./foundation.js";

export function setPersistenceStatus(message, isError) {
  setElementText(persistenceStatus, message);
  persistenceStatus.classList.toggle("error", Boolean(isError));
}

export function restartSimulationFromControls() {
  applyTuningFromControls(false);
  seedWorld();
  drawWorld();
  updateHud();
  setPersistenceStatus("SAVE: Ready", false);
}

export function requestRestartSimulationFromControls() {
  if (PS.ui && PS.ui.modal && typeof PS.ui.modal.confirm === "function") {
    return PS.ui.modal.confirm({
      title: "Restart simulation",
      message: "Restart with the current tuning and seed settings?",
      confirmLabel: "Restart",
      cancelLabel: "Cancel"
    }).then(function(confirmed) {
      if (confirmed) {
        restartSimulationFromControls();
      }

      return confirmed;
    });
  }

  restartSimulationFromControls();
  return Promise.resolve(true);
}
