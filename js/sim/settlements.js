"use strict";
PS.sim = PS.sim || {};

PS.sim.settlements = {
  ensureState: function() {
    return ensureSettlementState();
  },
  make: function(lineage, organisms) {
    return makeSettlement(lineage, organisms);
  },
  makeAt: function(lineageId, x, y, options) {
    return makeSettlementAt(lineageId, x, y, options);
  },
  foundForLineage: function(lineage) {
    return foundSettlementForLineage(lineage);
  },
  canFound: function(lineage) {
    return canFoundSettlement(lineage);
  },
  update: function() {
    return updateSettlements();
  },
  updateMetrics: function(settlement) {
    return updateSettlementMetrics(settlement);
  },
  rebuildIndexes: function() {
    return rebuildSettlementIndexes();
  },
  influenceRadius: function(settlement) {
    return getSettlementInfluenceRadius(settlement);
  },
  countClaimedTiles: function(settlement) {
    return countSettlementClaimedTiles(settlement);
  },
  refreshSummary: function() {
    return refreshSettlementSummaryCache();
  },
  earlyProgressionSummary: function() {
    return refreshEarlyProgressionSummaryCache();
  }
};
