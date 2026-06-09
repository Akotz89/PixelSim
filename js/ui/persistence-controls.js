"use strict";
function setPersistenceStatus(message, isError) {
  setElementText(persistenceStatus, message);
  persistenceStatus.classList.toggle("error", Boolean(isError));
}

function restartSimulationFromControls() {
  applyTuningFromControls(false);
  seedWorld();
  drawWorld();
  updateHud();
  setPersistenceStatus("SAVE: Ready", false);
}

function requestRestartSimulationFromControls() {
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
