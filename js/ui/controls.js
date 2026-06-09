"use strict";
PS.ui = PS.ui || {};

PS.ui.controls = {
  setup: function() {
    this.sync();
  },
  sync: function() {
    if (typeof syncControlStates === "function") {
      syncControlStates();
    }
  },
  applyTuning: function(redraw) {
    return applyTuningFromControls(redraw);
  },
  shortcut: function(event) {
    return handleSimulationShortcut(event);
  },
  inspectTile: function(tileX, tileY, shouldFocus, surfacePosition) {
    return inspectTile(tileX, tileY, shouldFocus, surfacePosition);
  },
  markCameraInteracting: function() {
    return markCameraInteracting();
  },
  zoom: function(delta, anchorPoint) {
    return zoomPlanetView(delta, anchorPoint);
  },
  pan: function(eastSamples, northSamples) {
    return panPlanetViewFromKeyboard(eastSamples, northSamples);
  }
};
