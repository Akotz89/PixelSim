"use strict";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { world } from "./state.js";

PS.systems = PS.systems || {};

PS.deepTime = (function() {
  var totalYears = 4700000000;
  var eras = [
    { id: "hadean", name: "Hadean", startYears: 0, endYears: 500000000, color: "#9b4a32", epochId: "primordial", terrainTint: "#4a332a", terrainAmount: 0.52 },
    { id: "archean", name: "Archean", startYears: 500000000, endYears: 2500000000, color: "#4f7a54", epochId: "microbial", terrainTint: "#203f36", terrainAmount: 0.28 },
    { id: "proterozoic", name: "Proterozoic", startYears: 2500000000, endYears: 4000000000, color: "#2f7d76", epochId: "microbial", terrainTint: "#275a46", terrainAmount: 0.16 },
    { id: "phanerozoic", name: "Phanerozoic", startYears: 4000000000, endYears: 4600000000, color: "#4d9a4f", epochId: "complex-life", terrainTint: "#3f7c3e", terrainAmount: 0.10 },
    { id: "anthropic", name: "Anthropic", startYears: 4600000000, endYears: 4700000000, color: "#d6b85b", epochId: "civilization", terrainTint: "#6f7f58", terrainAmount: 0.08 }
  ];

  function getYears(value) {
    if (value && typeof value === "object" && Number.isFinite(Number(value.years))) {
      return Math.max(0, Number(value.years));
    }

    return Math.max(0, Number(value) || 0);
  }

  function formatYears(years) {
    var value = Math.max(0, Number(years) || 0);

    if (value >= 1000000000) {
      return (value / 1000000000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "B years";
    }

    if (value >= 1000000) {
      return Math.round(value / 1000000).toLocaleString() + "M years";
    }

    if (value >= 1000) {
      return Math.round(value / 1000).toLocaleString() + "K years";
    }

    return Math.round(value).toLocaleString() + " years";
  }

  function getCurrentYears() {
    return getYears(world.deepTimeYears);
  }

  function getEraById(id) {
    var normalized = String(id || "").toLowerCase();

    for (var i = 0; i < eras.length; i++) {
      if (eras[i].id === normalized) {
        return eras[i];
      }
    }

    return null;
  }

  function getEraForYears(years) {
    var currentYears = getYears(years);

    for (var i = 0; i < eras.length; i++) {
      if (currentYears >= eras[i].startYears && currentYears < eras[i].endYears) {
        return eras[i];
      }
    }

    return eras[eras.length - 1];
  }

  function getEventsForEra(era) {
    var events = Array.isArray(world.timelineEvents) ? world.timelineEvents : [];
    var matched = [];

    for (var i = 0; i < events.length; i++) {
      var eventYears = getYears(events[i].deepTime);

      if (eventYears >= era.startYears && eventYears < era.endYears) {
        matched.push(events[i]);
      }
    }

    return matched;
  }

  function getEraLabel(era) {
    var events = getEventsForEra(era);

    if (events.length === 0) {
      return era.name;
    }

    return era.name + " / " + String(events[0].label || events[0].type || "event");
  }

  function getTimelineSegments() {
    var currentYears = getCurrentYears();
    var currentEra = getEraForYears(currentYears);

    return eras.map(function(era) {
      var matchingEvents = getEventsForEra(era);

      return {
        id: era.id,
        name: era.name,
        label: getEraLabel(era),
        startYears: era.startYears,
        endYears: era.endYears,
        color: era.color,
        epochId: era.epochId,
        widthPercent: ((era.endYears - era.startYears) / totalYears) * 100,
        eventCount: matchingEvents.length,
        active: currentEra.id === era.id
      };
    });
  }

  function getProgressPercent() {
    return clamp(getCurrentYears() / totalYears * 100, 0, 100);
  }

  function jumpToEra(id) {
    var era = getEraById(id);

    if (!era) {
      return false;
    }

    world.deepTimeYears = era.startYears;
    world.era = era.epochId;
    if (PS.epochs && typeof PS.epochs.setEra === "function") {
      PS.epochs.setEra(era.epochId);
    }
    if (PS.time && typeof PS.time.clearManualTimeScale === "function") {
      PS.time.clearManualTimeScale();
      PS.time.updateAdaptiveTimeScale(true);
    }
    if (PS.render && PS.render.terrain && typeof PS.render.terrain.invalidateCache === "function") {
      PS.render.terrain.invalidateCache();
    }
    world.needsRender = true;
    return true;
  }

  function getTerrainTint() {
    var era = getEraForYears(getCurrentYears());
    return {
      eraId: era.id,
      color: era.terrainTint,
      amount: era.terrainAmount
    };
  }

  return {
    totalYears: totalYears,
    eras: eras,
    getYears: getYears,
    formatYears: formatYears,
    getCurrentYears: getCurrentYears,
    getCurrentEra: function() { return getEraForYears(getCurrentYears()); },
    getEraForYears: getEraForYears,
    getTimelineSegments: getTimelineSegments,
    getProgressPercent: getProgressPercent,
    jumpToEra: jumpToEra,
    getTerrainTint: getTerrainTint
  };
})();

PS.systems.deepTime = PS.deepTime;
