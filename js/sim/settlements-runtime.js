import { updateEmpireLegacyState, updateEmpireSectorState, updateInterstellarFleetState } from "./civilizations-empire.js";
import { updatePlanetarySurveyState } from "./civilizations-orbital.js";
import { updateProbeMissionState } from "./civilizations-probes.js";
import { updateGalacticInfluenceState, updateStarMapState } from "./civilizations-stars.js";
import { canFoundSettlement, foundSettlementForLineage, updateSettlementOutposts } from "./settlements-founding.js";
import { runSettlementGrowth, updateColonyNetworkState, updateSettlementMetrics, updateSpaceProgramState } from "./settlements-growth.js";
import { refreshSettlementSummaryCache, updateSettlementRoutes, updateSuppliedOutpostGrowth } from "./settlements-routes.js";
import { ensureSettlementState } from "./settlements-state.js";
import { world } from "../systems/state.js";

export function updateSettlements() {
  ensureSettlementState();

  for (var i = 0; i < world.settlements.length; i++) {
    var settlement = world.settlements[i];
    updateSettlementMetrics(settlement);
    runSettlementGrowth(settlement);
  }

  updateSettlementOutposts();
  updateSettlementRoutes();
  updateSuppliedOutpostGrowth();

  var lineages = world.lineages || {};

  for (var lineageKey in lineages) {
    if (
      Object.prototype.hasOwnProperty.call(lineages, lineageKey) &&
      canFoundSettlement(lineages[lineageKey])
    ) {
      foundSettlementForLineage(lineages[lineageKey]);
    }
  }

  var networkSummary = updateColonyNetworkState();
  updateSpaceProgramState(networkSummary);
  updatePlanetarySurveyState();
  updateProbeMissionState();
  updateStarMapState();
  updateGalacticInfluenceState();
  updateInterstellarFleetState();
  updateEmpireSectorState();
  updateEmpireLegacyState();
  refreshSettlementSummaryCache();
}
