"use strict";
import { PS } from "../core/namespace.js";
import { canFoundSettlement, foundSettlementForLineage, makeSettlement, makeSettlementAt } from "./settlements-founding.js";
import { updateSettlementMetrics } from "./settlements-growth.js";
import { refreshEarlyProgressionSummaryCache, refreshSettlementSummaryCache } from "./settlements-routes.js";
import { updateSettlements } from "./settlements-runtime.js";
import { countSettlementClaimedTiles, ensureSettlementState, getSettlementInfluenceRadius, rebuildSettlementIndexes } from "./settlements-state.js";

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
