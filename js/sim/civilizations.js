import { updateEmpireLegacyState, updateEmpireSectorState, updateInterstellarFleetState } from "./civilizations-empire.js";
import { updatePlanetarySurveyState } from "./civilizations-orbital.js";
import { updateProbeMissionState } from "./civilizations-probes.js";
import { updateGalacticInfluenceState, updateStarMapState } from "./civilizations-stars.js";
import { updateColonyNetworkState, updateSpaceProgramState } from "./settlements-growth.js";

export const civilizations = {
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
