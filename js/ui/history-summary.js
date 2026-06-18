import { CONFIG } from "../../config.js";
import { clamp } from "../core/utils.js";
import { world } from "../systems/state.js";
import { ecosystemHistoryCanvas, settlementSummaryText } from "./dom-refs.js";
import { setElementClass, setElementHtml, setElementText } from "./foundation.js";
// fallow-ignore-next-line circular-dependency
import { escapeSummaryText, getEarlyProgressionSummary, getProgressRatio, getSettlementSummary, makeSummaryChip } from "./summary.js";

export function formatSignedNumber(value, decimals) {
  var numberValue = Number(value) || 0;
  var fixedValue = Math.abs(numberValue).toFixed(decimals);

  if (numberValue > 0) {
    return "+" + fixedValue;
  }

  if (numberValue < 0) {
    return "-" + fixedValue;
  }

  return decimals > 0 ? "0." + "0".repeat(decimals) : "0";
}

export function makeEventChip(event) {
  return (
    "<article class=\"event-entry event-" + escapeSummaryText(event.type || "sim") + "\">" +
    "<span class=\"event-tick\">T" + escapeSummaryText(event.tick) + "</span>" +
    "<span class=\"event-copy\">" +
    "<b>" + escapeSummaryText(event.label || "Event") + "</b>" +
    "<span>" + escapeSummaryText(event.detail || "") + "</span>" +
    "</span>" +
    "</article>"
  );
}

export function scaleHistoryValue(value, minValue, maxValue, height) {
  if (maxValue <= minValue) {
    return height / 2;
  }

  return height - clamp((value - minValue) / (maxValue - minValue), 0, 1) * height;
}

export function getHistoryRange(samples, getValue, fallbackMax) {
  var minValue = Infinity;
  var maxValue = -Infinity;

  for (var i = 0; i < samples.length; i++) {
    var value = Number(getValue(samples[i])) || 0;
    minValue = Math.min(minValue, value);
    maxValue = Math.max(maxValue, value);
  }

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return {
      min: 0,
      max: fallbackMax
    };
  }

  if (minValue === maxValue) {
    maxValue = Math.max(fallbackMax, maxValue + 1);
    minValue = 0;
  }

  return {
    min: minValue,
    max: maxValue
  };
}

export function getSymmetricHistoryRange(samples, getValue, fallbackMagnitude) {
  var magnitude = Math.max(1, Math.abs(Number(fallbackMagnitude) || 1));

  for (var i = 0; i < samples.length; i++) {
    magnitude = Math.max(magnitude, Math.abs(Number(getValue(samples[i])) || 0));
  }

  return {
    min: -magnitude,
    max: magnitude
  };
}

export function getFoodRunwayHistoryRange(samples) {
  var maxRunway = 40;

  for (var i = 0; i < samples.length; i++) {
    var value = Number(samples[i].foodRunwayTicks);

    if (Number.isFinite(value) && value >= 0) {
      maxRunway = Math.max(maxRunway, value);
    }
  }

  return {
    min: 0,
    max: Math.max(1, maxRunway)
  };
}

export function getFoodRunwayHistoryValue(sample, range) {
  var runwayTicks = Number(sample.foodRunwayTicks);

  if (Number.isFinite(runwayTicks) && runwayTicks >= 0) {
    return runwayTicks;
  }

  return null;
}

export function drawEcosystemHistoryGuide(chart, ratio, color) {
  return null;
}

export function drawEcosystemHistoryLine(samples, getValue, color, chart, range) {
  return null;
}

export function drawEcosystemHistory() {
  var samples = Array.isArray(world.ecosystemHistory) ? world.ecosystemHistory : [];
  var latest = samples.length ? samples[samples.length - 1] : null;

  if (!ecosystemHistoryCanvas) {
    return;
  }

  ecosystemHistoryCanvas.textContent = latest
    ? "HISTORY: stability " + Math.round(Number(latest.stabilityScore) || 0) +
      " population " + Math.round(Number(latest.population) || 0) +
      " food " + Math.round(Number(latest.food) || 0)
    : "HISTORY: Waiting for samples";
}

export function makeSummaryProgressChip(label, currentValue, targetValue, value, isReady, isComplete) {
  var ratio = getProgressRatio(currentValue, targetValue);
  var percent = Math.round(ratio * 100);
  var className = "summary-chip summary-progress-chip";

  if (isReady) {
    className += " ready";
  }

  if (isComplete) {
    className += " complete";
  }

  return (
    "<span class=\"" + className + "\">" +
    "<span class=\"summary-chip-top\">" +
    "<b>" + escapeSummaryText(label) + "</b>" +
    "<span class=\"summary-chip-value\">" + escapeSummaryText(value) + "</span>" +
    "</span>" +
    "<span class=\"summary-progress-track\"><span style=\"width: " + percent + "%\"></span></span>" +
    "</span>"
  );
}

export function updateSettlementSummary() {
  var summary = getSettlementSummary();

  if (!summary) {
    var earlySummary = getEarlyProgressionSummary();

    if (!earlySummary) {
      setElementClass(settlementSummaryText, "");
      setElementText(settlementSummaryText, "SETTLEMENTS: -");
      return;
    }

    var topLineageText = earlySummary.topLineage ? "L" + earlySummary.topLineage.id : "-";
    var nextStep = earlySummary.settlementReady ? "founding" : "lineage growth";
    var earlyChips = [
      makeSummaryChip("Stage", earlySummary.status),
      makeSummaryProgressChip(
        "Population",
        earlySummary.topActive,
        earlySummary.populationTarget,
        earlySummary.topActive + "/" + earlySummary.populationTarget,
        earlySummary.topActive >= earlySummary.populationTarget,
        earlySummary.settlementReady
      ),
      makeSummaryProgressChip(
        "Peak",
        earlySummary.topPeak,
        earlySummary.peakTarget,
        earlySummary.topPeak + "/" + earlySummary.peakTarget,
        earlySummary.topPeak >= earlySummary.peakTarget,
        earlySummary.settlementReady
      ),
      makeSummaryChip("Lineages", earlySummary.activeLineages + "/" + earlySummary.totalLineages),
      makeSummaryChip("Top", topLineageText),
      makeSummaryChip("Next", nextStep)
    ];

    setElementClass(settlementSummaryText, "summary-grid early-summary");
    setElementHtml(settlementSummaryText, earlyChips.join(""));
    return;
  }

  var topType = "Root";

  if (summary.topSettlement.isColony) {
    topType = "Colony S" + summary.topSettlement.parentSettlementId;
  } else if (summary.topSettlement.isOutpost) {
    topType = "Outpost S" + summary.topSettlement.parentSettlementId;
  }

  var legacyState = summary.empireLegacyComplete ? "complete" : (summary.empireLegacyReady ? "ascending" : "waiting");
  var chips = [
    makeSummaryChip("Settlements", summary.active + "/" + summary.total),
    makeSummaryChip("Outposts", summary.totalOutposts),
    makeSummaryChip("Colonies", summary.totalColonies),
    makeSummaryChip("Routes", summary.activeRoutes + "/" + summary.totalRoutes),
    makeSummaryChip("Moved", summary.totalRouteFoodTransferred),
    makeSummaryChip("Network", summary.colonyNetworkScore),
    makeSummaryProgressChip("Space", summary.spaceProgramProgress, CONFIG.SPACE_PROGRAM_LAUNCH_THRESHOLD, summary.spaceProgramProgress.toFixed(1) + "/" + CONFIG.SPACE_PROGRAM_LAUNCH_THRESHOLD, summary.spaceProgramReady, summary.orbitalLaunches > 0),
    makeSummaryChip("Launches", summary.orbitalLaunches),
    makeSummaryChip("Orbit", summary.orbitalAssets + " / " + summary.orbitalInfrastructureScore),
    makeSummaryProgressChip("Planets", summary.planetarySurveyProgress, CONFIG.PLANETARY_DISCOVERY_THRESHOLD, summary.planetaryBodies + " / " + summary.planetarySurveyProgress.toFixed(1), summary.planetarySurveyReady, summary.planetaryBodies > 0),
    makeSummaryProgressChip("Probes", summary.probeMissionProgress, CONFIG.PROBE_MISSION_THRESHOLD, summary.completedProbeMissions + "/" + summary.probeMissions, summary.probeMissionReady, summary.completedProbeMissions > 0),
    makeSummaryProgressChip("Stars", summary.starMapProgress, CONFIG.STAR_SYSTEM_DISCOVERY_THRESHOLD, summary.starSystems + " / " + summary.starMapProgress.toFixed(1), summary.starMapReady, summary.starSystems > 0),
    makeSummaryProgressChip("Claims", summary.galacticInfluenceProgress, CONFIG.GALACTIC_SYSTEM_CLAIM_THRESHOLD, summary.galacticClaimedSystems + " / " + summary.galacticInfluenceProgress.toFixed(1), summary.galacticInfluenceReady, summary.galacticClaimedSystems > 0),
    makeSummaryProgressChip("Fleets", summary.interstellarFleetProgress, CONFIG.INTERSTELLAR_FLEET_BUILD_THRESHOLD, summary.interstellarFleetCompleted + "/" + summary.interstellarFleets, summary.interstellarFleetReady, summary.interstellarFleetCompleted > 0),
    makeSummaryProgressChip("Sectors", summary.empireSectorProgress, CONFIG.EMPIRE_SECTOR_BUILD_THRESHOLD, summary.empireSectors + " / " + summary.empireSectorProgress.toFixed(1), summary.empireSectorReady, summary.empireSectors > 0),
    makeSummaryProgressChip("Legacy", summary.empireLegacyProgress, CONFIG.EMPIRE_LEGACY_THRESHOLD, "L" + summary.empireLegacyLevel + " " + legacyState, summary.empireLegacyReady, summary.empireLegacyComplete),
    makeSummaryChip("Camp Pop", summary.totalPopulation),
    makeSummaryChip("Stored", summary.totalStoredFood),
    makeSummaryChip("Claimed", summary.totalClaimedTiles),
    makeSummaryChip("Top", "S" + summary.topSettlement.id + " L" + summary.topSettlement.lineageId),
    makeSummaryChip("Top Level", summary.topSettlement.level + " / " + summary.topSettlement.influenceRadius),
    makeSummaryChip("Top Type", topType),
    makeSummaryChip("Top Pop", summary.topSettlement.population),
    makeSummaryChip("Top Dev", summary.topSettlement.development.toFixed(1))
  ];

  setElementClass(settlementSummaryText, "summary-grid");
  setElementHtml(settlementSummaryText, chips.join(""));
}
