"use strict";
function updateSettlements() {
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
