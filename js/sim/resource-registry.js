"use strict";
import { PS } from "../core/namespace.js";
import { world } from "../systems/state.js";
import { getSettlementSummary } from "../ui/summary.js";

PS.sim = PS.sim || {};

PS.sim.resources = {
  definitions: [
    { id: "food", label: "Food", category: "edible", stackLimit: 500, spoilagePerTick: 0.0005, production: [] },
    { id: "wood", label: "Wood", category: "growable", stackLimit: 400, spoilagePerTick: 0, production: ["forest", "tools"] },
    { id: "stone", label: "Stone", category: "minable", stackLimit: 600, spoilagePerTick: 0, production: ["quarry"] },
    { id: "metal", label: "Metal", category: "refined", stackLimit: 250, spoilagePerTick: 0, production: ["mine", "forge"] },
    { id: "knowledge", label: "Knowledge", category: "civic", stackLimit: 1000, spoilagePerTick: 0, production: ["population", "stability"] }
  ],

  flows: ["produced", "consumed", "spoiled", "traded"],

  getDefinition: function (resourceId) {
    for (var i = 0; i < this.definitions.length; i++) {
      if (this.definitions[i].id === resourceId) {
        return this.definitions[i];
      }
    }
    return null;
  },

  getDefinitions: function () {
    return this.definitions.slice();
  },

  makeEmptyLedger: function () {
    var ledger = {};

    for (var i = 0; i < this.definitions.length; i++) {
      ledger[this.definitions[i].id] = {
        produced: 0,
        consumed: 0,
        spoiled: 0,
        traded: 0,
        lastTickNet: 0
      };
    }

    return ledger;
  },

  normalizeSettlement: function (settlement) {
    var definition;
    var stock = settlement.resources && typeof settlement.resources === "object" ? settlement.resources : {};
    var ledger = settlement.resourceLedger && typeof settlement.resourceLedger === "object" ? settlement.resourceLedger : {};
    var foodStock = Math.max(0, Number(settlement.storedFood) || 0);

    settlement.resources = stock;
    settlement.resourceLedger = ledger;

    for (var i = 0; i < this.definitions.length; i++) {
      definition = this.definitions[i];

      if (!Number.isFinite(Number(stock[definition.id]))) {
        stock[definition.id] = definition.id === "food" ? foodStock : 0;
      } else {
        stock[definition.id] = Math.max(0, Number(stock[definition.id]) || 0);
      }

      if (!ledger[definition.id] || typeof ledger[definition.id] !== "object") {
        ledger[definition.id] = {
          produced: 0,
          consumed: 0,
          spoiled: 0,
          traded: 0,
          lastTickNet: 0
        };
      } else {
        ledger[definition.id].produced = Math.max(0, Number(ledger[definition.id].produced) || 0);
        ledger[definition.id].consumed = Math.max(0, Number(ledger[definition.id].consumed) || 0);
        ledger[definition.id].spoiled = Math.max(0, Number(ledger[definition.id].spoiled) || 0);
        ledger[definition.id].traded = Math.max(0, Number(ledger[definition.id].traded) || 0);
        ledger[definition.id].lastTickNet = Number(ledger[definition.id].lastTickNet) || 0;
      }
    }

    settlement.storedFood = Math.max(0, Math.round(stock.food || 0));
    settlement.lastResourceTick = Math.max(0, Math.round(Number(settlement.lastResourceTick) || Number(settlement.foundedTick) || 0));
    return settlement;
  },

  recordFlow: function (settlement, resourceId, flow, amount) {
    var definition = this.getDefinition(resourceId);
    var value = Math.max(0, Number(amount) || 0);
    var ledger;

    if (!settlement || !definition || this.flows.indexOf(flow) === -1 || value <= 0) {
      return 0;
    }

    this.normalizeSettlement(settlement);
    if (flow === "produced" || flow === "traded") {
      ledger = settlement.resourceLedger[resourceId];
      ledger[flow] += value;
      settlement.resources[resourceId] = Math.min(definition.stackLimit, settlement.resources[resourceId] + value);
      ledger.lastTickNet += value;
    } else {
      value = Math.min(value, settlement.resources[resourceId]);
      ledger = settlement.resourceLedger[resourceId];
      ledger[flow] += value;
      settlement.resources[resourceId] = Math.max(0, settlement.resources[resourceId] - value);
      ledger.lastTickNet -= value;
    }

    if (resourceId === "food") {
      settlement.storedFood = Math.max(0, Math.round(settlement.resources.food));
    }

    return value;
  },

  beginTick: function (settlement, tick) {
    var key;

    this.normalizeSettlement(settlement);
    if (settlement.lastResourceTick === tick) {
      return 0;
    }

    for (key in settlement.resourceLedger) {
      if (Object.prototype.hasOwnProperty.call(settlement.resourceLedger, key)) {
        settlement.resourceLedger[key].lastTickNet = 0;
      }
    }

    var elapsed = Math.max(0, Math.round(Number(tick) || 0) - settlement.lastResourceTick);
    settlement.lastResourceTick = Math.max(0, Math.round(Number(tick) || 0));
    return elapsed;
  },

  applySpoilage: function (settlement, tick) {
    var elapsed = this.beginTick(settlement, tick);
    var totalSpoiled = 0;

    for (var i = 0; i < this.definitions.length; i++) {
      var definition = this.definitions[i];
      var rate = Math.max(0, Number(definition.spoilagePerTick) || 0);
      var stock = settlement.resources[definition.id];
      var spoiled = stock * rate * elapsed;

      if (spoiled > 0) {
        totalSpoiled += this.recordFlow(settlement, definition.id, "spoiled", spoiled);
      }
    }

    return totalSpoiled;
  },

  getSettlementSummary: function (settlement) {
    var entries = [];
    var totalStock = 0;
    var totalNet = 0;

    this.normalizeSettlement(settlement);

    for (var i = 0; i < this.definitions.length; i++) {
      var definition = this.definitions[i];
      var stock = Math.max(0, Number(settlement.resources[definition.id]) || 0);
      var ledger = settlement.resourceLedger[definition.id];

      totalStock += stock;
      totalNet += Number(ledger.lastTickNet) || 0;
      entries.push({
        id: definition.id,
        label: definition.label,
        category: definition.category,
        stock: stock,
        produced: ledger.produced,
        consumed: ledger.consumed,
        spoiled: ledger.spoiled,
        traded: ledger.traded,
        net: ledger.lastTickNet,
        perishable: definition.spoilagePerTick > 0
      });
    }

    return {
      entries: entries,
      totalStock: totalStock,
      net: totalNet,
      top: entries.slice().sort(function (a, b) {
        return b.stock - a.stock;
      })[0] || null
    };
  },

  getWorldSummary: function () {
    var totals = {};
    var net = {};
    var settlements = Array.isArray(world.settlements) ? world.settlements : [];

    for (var i = 0; i < this.definitions.length; i++) {
      totals[this.definitions[i].id] = 0;
      net[this.definitions[i].id] = 0;
    }

    for (var settlementIndex = 0; settlementIndex < settlements.length; settlementIndex++) {
      var summary = this.getSettlementSummary(settlements[settlementIndex]);

      for (var entryIndex = 0; entryIndex < summary.entries.length; entryIndex++) {
        var entry = summary.entries[entryIndex];
        totals[entry.id] += entry.stock;
        net[entry.id] += entry.net;
      }
    }

    return {
      totals: totals,
      net: net,
      settlementCount: settlements.length
    };
  }
};
