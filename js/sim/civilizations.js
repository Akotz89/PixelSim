"use strict";
PS.sim = PS.sim || {};

PS.sim.civilizations = {
  updateColonyNetwork: function() {
    return updateColonyNetworkState();
  },
  updateSpaceProgram: function(networkSummary) {
    return updateSpaceProgramState(networkSummary);
  },
  updatePlanetarySurvey: function() {
    return updatePlanetarySurveyState();
  },
  updateProbeMissions: function() {
    return updateProbeMissionState();
  },
  updateStarMap: function() {
    return updateStarMapState();
  },
  updateGalacticInfluence: function() {
    return updateGalacticInfluenceState();
  },
  updateInterstellarFleets: function() {
    return updateInterstellarFleetState();
  },
  updateEmpireSectors: function() {
    return updateEmpireSectorState();
  },
  updateEmpireLegacy: function() {
    return updateEmpireLegacyState();
  }
};
