import { CONFIG } from "../config.js";
import { PS } from "./core/namespace.js";
import { formatEcosystemStabilityFactorScore, formatEcosystemTrendDelta, recordSimulationMilestones } from "./main-ecosystem-stability.js";
import { formatFoodRunway, getSimulationAlertSeverityRank, makeSimulationAlert, recordEcosystemHistorySample, refreshEcosystemSummary, resetFoodFlowCounters, resetPopulationFlowCounters } from "./main-ecosystem-summary.js";
import { formatMilestoneSignedNumber, getSimulationMilestoneSnapshot, recordSimulationEvent } from "./main-runtime.js";
import { layerRegistry } from "./layers/registry.js";
import { growFood } from "./sim/food-growth.js";
import { lineageTracking } from "./sim/lineage-tracking.js";
import { massExtinction } from "./sim/mass-extinction.js";
import { removeDeadOrganisms, trimOrganismPopulation, updateOrganism, updatePooledOrganismsForTick } from "./sim/organisms-behavior.js";
import { refreshLineageRegistry } from "./sim/organisms-indexes.js";
import { representatives } from "./sim/representatives.js";
import { refreshEarlyProgressionSummaryCache, refreshSettlementSummaryCache } from "./sim/settlements-routes.js";
import { updateSettlements } from "./sim/settlements-runtime.js";
import { traitRegistry } from "./sim/trait-registry.js";
import { world } from "./systems/state.js";
// fallow-ignore-next-line circular-dependency
import { syncControlStates } from "./ui/foundation.js";
// fallow-ignore-next-line circular-dependency
import { recordTraitHistorySample } from "./ui/inspect-history.js";

export function compareSimulationAlerts(left, right) {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  var leftSeverity = getSimulationAlertSeverityRank(left.severity);
  var rightSeverity = getSimulationAlertSeverityRank(right.severity);

  if (leftSeverity !== rightSeverity) {
    return leftSeverity - rightSeverity;
  }

  return left.order - right.order;
}

export function addSimulationAlert(alerts, severity, label, detail, priority) {
  var nextAlert = makeSimulationAlert(severity, label, detail, priority);
  nextAlert.order = alerts.length;

  for (var i = 0; i < alerts.length; i++) {
    if (alerts[i].label === nextAlert.label) {
      if (compareSimulationAlerts(nextAlert, alerts[i]) < 0) {
        nextAlert.order = alerts[i].order;
        alerts[i] = nextAlert;
      }

      return;
    }
  }

  alerts.push(nextAlert);
}

export function rankSimulationAlerts(alerts) {
  return alerts.slice().sort(compareSimulationAlerts).map(function(alert) {
    return {
      severity: alert.severity,
      label: alert.label,
      detail: alert.detail,
      priority: alert.priority
    };
  });
}

export function refreshSimulationAlerts() {
  var alerts = [];
  var ecosystemSummary = world.ecosystemSummary || refreshEcosystemSummary();
  var settlementSummary = world.settlementSummary || (
    typeof refreshSettlementSummaryCache === "function" ? refreshSettlementSummaryCache() : null
  );
  var earlySummary = !settlementSummary && typeof refreshEarlyProgressionSummaryCache === "function"
    ? refreshEarlyProgressionSummaryCache()
    : null;

  if (world.isExtinct) {
    addSimulationAlert(alerts, "danger", "Extinction", "restart available", 0);
  } else if (ecosystemSummary.pressure === "starving") {
    addSimulationAlert(alerts, "danger", "Food stress", "energy " + ecosystemSummary.averageEnergy.toFixed(1), 10);
  } else if (ecosystemSummary.pressure === "crowded") {
    addSimulationAlert(alerts, "warning", "Crowding", ecosystemSummary.population + "/" + CONFIG.MAX_ORGANISMS, 35);
  } else if (ecosystemSummary.pressure === "strained") {
    addSimulationAlert(alerts, "warning", "Strained", "food/org " + ecosystemSummary.foodPerOrganism.toFixed(2), 35);
  }

  if (!world.isExtinct && ecosystemSummary.populationBalance === "crashing") {
    addSimulationAlert(alerts, "danger", "Population crash", String(world.populationDeltaThisTick), 12);
  }

  if (!world.isExtinct && massExtinction && typeof massExtinction.getSummary === "function") {
    var extinctionSummary = massExtinction.getSummary();
    if (extinctionSummary.recoveryWindow) {
      addSimulationAlert(
        alerts,
        "ready",
        "Adaptive radiation",
        "until T" + Math.max(0, Math.round(Number(extinctionSummary.recoveryWindow.endTick) || 0)),
        14
      );
    }
  }

  if (
    !world.isExtinct &&
    ecosystemSummary.reproductionScarcityPressure >= 0.55
  ) {
    addSimulationAlert(
      alerts,
      "warning",
      "Birth throttle",
      Math.round(ecosystemSummary.reproductionScarcityPressure * 100) + "% scarce",
      34
    );
  }

  if (!world.isExtinct && ecosystemSummary.resourceBalance === "draining") {
    addSimulationAlert(alerts, "warning", "Food draining", String(ecosystemSummary.foodNetThisTick), 28);
  }

  if (
    !world.isExtinct &&
    ecosystemSummary.foodRecoveryPressure >= 0.55 &&
    ecosystemSummary.foodRecoveryAttempts > 0
  ) {
    addSimulationAlert(
      alerts,
      "ready",
      "Regrowth push",
      Math.round(ecosystemSummary.foodRecoveryPressure * 100) + "% x" + ecosystemSummary.foodRecoveryAttempts,
      56
    );
  }

  if (
    !world.isExtinct &&
    ecosystemSummary.foodRunwayTicks >= 0 &&
    ecosystemSummary.foodRunwayTicks <= 20
  ) {
    addSimulationAlert(
      alerts,
      "warning",
      "Food runway",
      formatFoodRunway(ecosystemSummary.foodRunwayTicks),
      22
    );
  }

  if (!world.isExtinct && ecosystemSummary.momentum === "draining") {
    addSimulationAlert(
      alerts,
      "warning",
      "Flow worsening",
      formatEcosystemTrendDelta(ecosystemSummary.trend, "foodNetDelta") + " food net",
      27
    );
  }

  if (
    !world.isExtinct &&
    ecosystemSummary.foodRunwayTicks >= 0 &&
    ecosystemSummary.foodRunwayTicks <= 40 &&
    ecosystemSummary.trend &&
    ecosystemSummary.trend.foodRunwayDelta <= -8
  ) {
    addSimulationAlert(
      alerts,
      "warning",
      "Runway shrinking",
      formatEcosystemTrendDelta(ecosystemSummary.trend, "foodRunwayDelta") + " ticks",
      25
    );
  }

  if (!world.isExtinct && ecosystemSummary.stabilityScore <= 20) {
    addSimulationAlert(
      alerts,
      "warning",
      "Low stability",
      ecosystemSummary.recoveryAction + " - " + formatEcosystemStabilityFactorScore(ecosystemSummary.stabilityProfile),
      24
    );
  }

  if (!world.isExtinct && ecosystemSummary.trend && ecosystemSummary.trend.stabilityDelta <= -12) {
    addSimulationAlert(
      alerts,
      "warning",
      "Stability falling",
      formatMilestoneSignedNumber(ecosystemSummary.trend.stabilityDelta) + " - " + ecosystemSummary.recoveryAction,
      26
    );
  }

  if (!world.isExtinct && ecosystemSummary.momentum === "recovering") {
    addSimulationAlert(
      alerts,
      "ready",
      "Recovery improving",
      formatMilestoneSignedNumber(ecosystemSummary.trend.stabilityDelta) + " stability",
      58
    );
  }

  if (earlySummary && earlySummary.settlementReady) {
    addSimulationAlert(alerts, "ready", "Settlement ready", "top " + earlySummary.topActive + "/" + earlySummary.populationTarget, 60);
  }

  if (world.spaceProgramReady) {
    addSimulationAlert(alerts, "ready", "Launch ready", world.spaceProgramProgress.toFixed(1) + "/" + CONFIG.SPACE_PROGRAM_LAUNCH_THRESHOLD, 62);
  }

  if (world.planetarySurveyReady) {
    addSimulationAlert(alerts, "ready", "Survey ready", world.planetarySurveyProgress.toFixed(1), 64);
  }

  if (world.probeMissionReady) {
    addSimulationAlert(alerts, "ready", "Probe ready", world.probeMissionProgress.toFixed(1), 66);
  }

  if (alerts.length === 0) {
    addSimulationAlert(alerts, "info", "Nominal", ecosystemSummary.pressure + " stability " + ecosystemSummary.stabilityScore + "/100", 90);
  }

  world.simulationAlerts = rankSimulationAlerts(alerts).slice(0, 5);
  return world.simulationAlerts;
}

export function syncLifecycleState() {
  var population = Array.isArray(world.organisms) ? world.organisms.length : 0;

  if (population <= 0) {
    if (!world.isExtinct) {
      world.isExtinct = true;
      world.extinctionTick = world.tick;
    }

    world.isPaused = true;
    world.needsRender = true;
    return;
  }

  if (world.isExtinct) {
    world.isExtinct = false;
    world.extinctionTick = 0;
    world.needsRender = true;
  }
}

export function seedWorld() {
  PS.core.worldGen.generateWorld(world.seedText, CONFIG);

  if (representatives && typeof representatives.refresh === "function") {
    representatives.refresh();
  }
  if (lineageTracking && typeof lineageTracking.update === "function") {
    lineageTracking.update(true);
  }

  refreshEcosystemSummary();
  syncLifecycleState();
  recordEcosystemHistorySample(true);

  if (typeof recordTraitHistorySample === "function") {
    recordTraitHistorySample(true);
  }

  recordSimulationEvent("seed", "Simulation seeded", world.organisms.length + " organisms seed " + world.seedText);
  refreshSimulationAlerts();
}

export function updateWorld(dt) {
  var tickProfile = {
    organisms: 0,
    food: 0,
    settlements: 0,
    terrain: 0,
    events: 0
  };
  var profileStart = performance.now();

  world.tick++;
  layerRegistry.updateAll(dt);

  if (PS.epochs && typeof PS.epochs.updateCurrent === "function") {
    PS.epochs.updateCurrent(dt);
  }

  var shouldRefreshSummaries = world.tick % CONFIG.SIM_SUMMARY_UPDATE_INTERVAL === 0;
  world.needsRender = true;
  resetPopulationFlowCounters();
  resetFoodFlowCounters();
  var milestoneSnapshot = getSimulationMilestoneSnapshot();
  growFood();
  tickProfile.food = performance.now() - profileStart;

  var organismsAtStartOfTick = world.organisms.length;
  profileStart = performance.now();

  if (typeof updatePooledOrganismsForTick !== "function" || !updatePooledOrganismsForTick(organismsAtStartOfTick)) {
    for (var i = 0; i < organismsAtStartOfTick; i++) {
      updateOrganism(world.organisms[i], i);
    }
  }

  removeDeadOrganisms();
  trimOrganismPopulation();

  if (massExtinction && typeof massExtinction.maybeTrigger === "function") {
    massExtinction.maybeTrigger();
  }

  world.populationDeltaThisTick = world.organisms.length - organismsAtStartOfTick;

  if (typeof refreshLineageRegistry === "function" && shouldRefreshSummaries) {
    refreshLineageRegistry();
  }

  if (representatives && typeof representatives.refresh === "function" && shouldRefreshSummaries) {
    representatives.refresh();
  }
  if (lineageTracking && typeof lineageTracking.update === "function" && shouldRefreshSummaries) {
    lineageTracking.update(false);
  }

  // Update environmental modifiers periodically (AZR-493)
  if (
    shouldRefreshSummaries &&
    typeof traitRegistry !== "undefined" &&
    traitRegistry &&
    typeof traitRegistry.updateEnvironmentalModifiers === "function"
  ) {
    traitRegistry.updateEnvironmentalModifiers();
  }

  tickProfile.organisms = performance.now() - profileStart;
  profileStart = performance.now();

  if (shouldRefreshSummaries || !world.ecosystemSummary) {
    refreshEcosystemSummary();
  }

  syncLifecycleState();
  recordEcosystemHistorySample(!milestoneSnapshot.isExtinct && world.isExtinct);
  tickProfile.events += performance.now() - profileStart;

  if (shouldRefreshSummaries && !world.isExtinct && typeof updateSettlements === "function") {
    profileStart = performance.now();
    updateSettlements();
    tickProfile.settlements = performance.now() - profileStart;
  }

  profileStart = performance.now();
  if (shouldRefreshSummaries) {
    recordSimulationMilestones(milestoneSnapshot);
    if (PS.events && typeof PS.events.detectMilestones === "function") {
      PS.events.detectMilestones();
    }
  }

  if (shouldRefreshSummaries && typeof recordTraitHistorySample === "function") {
    recordTraitHistorySample(false);
  }

  if (shouldRefreshSummaries || !world.simulationAlerts) {
    refreshSimulationAlerts();
  }
  tickProfile.events += performance.now() - profileStart;
  world.tickProfileMs = tickProfile;
}

export function setSimulationPaused(isPaused) {
  if (world.isExtinct) {
    return false;
  }

  var nextPaused = Boolean(isPaused);

  if (world.isPaused === nextPaused) {
    return false;
  }

  world.isPaused = nextPaused;
  world.needsRender = true;

  if (typeof syncControlStates === "function") {
    syncControlStates();
  }

  return true;
}
