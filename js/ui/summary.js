import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { formatEcosystemStabilityFactorScore } from "../main-ecosystem-stability.js";
import { formatFoodRunway, refreshEcosystemSummary } from "../main-ecosystem-summary.js";
import { refreshSimulationAlerts } from "../main-simulation.js";
import { getTileGreatCircleDistanceKm, getTileManhattanDistance } from "../render/planet-grid.js";
import { countFoodInRadius, findNearestFoodInBuckets } from "../sim/food-runtime.js";
import { collectOrganismsInRadius } from "../sim/organisms-indexes.js";
import { ensureOrganismTraits } from "../sim/organisms-traits.js";
import { resourceRegistry } from "../sim/resource-registry.js";
import { getDistanceToNearestSettlement } from "../sim/settlements-founding.js";
import { refreshEarlyProgressionSummaryCache, refreshSettlementSummaryCache } from "../sim/settlements-routes.js";
import { getSettlementRouteStats } from "../sim/settlements-state.js";
import { world } from "../systems/state.js";
import { ecosystemSummaryText, lineageSummaryText, simulationAlertsText, traitSummaryText } from "./dom-refs.js";
import { countFertileTilesInRadius, getInspectContextRadius, setElementClass, setElementHtml, setElementText } from "./foundation.js";
import { drawEcosystemHistory, formatSignedNumber } from "./history-summary.js";
import { getStatisticsDashboardSnapshot } from "./statistics-dashboard.js";
import {
  getDashboardTraitMetric,
  makeAlertChip,
  makeDashboardCard,
  makeInspectChip,
  makeMetricRow,
  makePrimaryMetric,
  makeSummaryChip
} from "./summary-html.js";

export {
  escapeSummaryText,
  getDashboardTraitMetric,
  makeAlertChip,
  makeDashboardCard,
  makeInspectChip,
  makeMetricRow,
  makePrimaryMetric,
  makeSummaryChip
} from "./summary-html.js";

export function getDistanceLabel(distance, distanceKm) {
  if (!Number.isFinite(distance)) {
    return "-";
  }

  if (Number.isFinite(distanceKm)) {
    return String(distance) + " / " + Math.round(distanceKm).toLocaleString() + " km";
  }

  return String(distance);
}

export function getLocalInspectContext(tileX, tileY) {
  var contextRadius = getInspectContextRadius();
  var nearbyOrganisms = typeof collectOrganismsInRadius === "function"
    ? collectOrganismsInRadius(tileX, tileY, contextRadius, 0)
    : [];
  var nearbyFood = typeof countFoodInRadius === "function"
    ? countFoodInRadius(tileX, tileY, contextRadius)
    : 0;
  var fertileContext = countFertileTilesInRadius(tileX, tileY, contextRadius);
  var nearestFood = typeof findNearestFoodInBuckets === "function"
    ? findNearestFoodInBuckets(tileX, tileY, contextRadius * 2)
    : null;
  var nearestSettlementDistance = typeof getDistanceToNearestSettlement === "function"
    ? getDistanceToNearestSettlement(tileX, tileY, contextRadius * 4)
    : Infinity;
  var localPressure = "open";

  if (world.isExtinct) {
    localPressure = "extinct";
  } else if (nearbyOrganisms.length >= contextRadius * 2) {
    localPressure = "crowded";
  } else if (nearbyFood <= 0 && nearbyOrganisms.length > 0) {
    localPressure = "starving";
  } else if (nearbyFood >= nearbyOrganisms.length && fertileContext.fertilePercent >= 45) {
    localPressure = "rich";
  } else if (nearbyOrganisms.length > 0) {
    localPressure = "active";
  }

  return {
    radius: contextRadius,
    nearbyOrganisms: nearbyOrganisms.length,
    nearbyFood: nearbyFood,
    fertilePercent: fertileContext.fertilePercent,
    nearestFoodDistance: nearestFood ? getTileManhattanDistance(tileX, tileY, nearestFood.x, nearestFood.y) : Infinity,
    nearestFoodDistanceKm: nearestFood ? getTileGreatCircleDistanceKm(tileX, tileY, nearestFood.x, nearestFood.y) : Infinity,
    nearestSettlementDistance: nearestSettlementDistance,
    localPressure: localPressure
  };
}

export function getRouteSummaryForSettlement(settlementId) {
  if (typeof getSettlementRouteStats === "function") {
    return getSettlementRouteStats(settlementId);
  }

  return {
    routeCount: 0,
    activeRoutes: 0,
    foodTransferred: 0
  };
}

export function getResourceSummaryForSettlement(settlement) {
  return resourceRegistry.getSettlementSummary(settlement);
}

export function formatResourceBreakdown(summary) {
  var entries = summary && Array.isArray(summary.entries) ? summary.entries : [];
  var labels = [];

  for (var i = 0; i < Math.min(5, entries.length); i++) {
    labels.push(entries[i].label + " " + Math.round(entries[i].stock));
  }

  return labels.length ? labels.join(" / ") : "-";
}

export function formatOrganismTraits(organism) {
  var traits = ensureOrganismTraits(organism);

  return (
    "vision " + traits.vision +
    " metabolism " + traits.metabolism +
    " reproduce " + traits.reproductionEnergy +
    " roam " + traits.movementTendency.toFixed(2) +
    " habitat " + traits.terrainAffinity.toFixed(2) +
    " body " + traits.bodySize.toFixed(2) +
    " limbs " + traits.limbCount +
    " shape " + traits.bodyShape +
    " appendage " + traits.appendageType +
    " camo " + traits.camouflage.toFixed(2) +
    " thermal " + traits.thermalTolerance.toFixed(2) +
    " water " + traits.waterDependency.toFixed(2) +
    " predator " + traits.carnivory.toFixed(2) +
    " mind " + traits.intelligence.toFixed(2) +
    " social " + traits.sociality.toFixed(2)
  );
}

export function getPopulationTraitSummary() {
  return world.populationTraitSummary;
}

export function getSummaryTraitValue(summary, key) {
  var value = Number(summary && summary[key]);

  if (Number.isFinite(value)) {
    return value;
  }

  return PS.core && PS.core.traitSchema && typeof PS.core.traitSchema.normalizeTraitValue === "function"
    ? PS.core.traitSchema.normalizeTraitValue(key, undefined)
    : 0;
}

export function updateTraitSummary() {
  var summary = getPopulationTraitSummary();

  if (!summary) {
    setElementClass(traitSummaryText, "");
    setElementText(traitSummaryText, "TRAITS AVG: vision -   metabolism -   reproduce -   roam -   habitat -");
    return;
  }

  var chips = [
    makeSummaryChip("Vision", getSummaryTraitValue(summary, "vision").toFixed(1)),
    makeSummaryChip("Metabolism", getSummaryTraitValue(summary, "metabolism").toFixed(2)),
    makeSummaryChip("Reproduce", getSummaryTraitValue(summary, "reproductionEnergy").toFixed(1)),
    makeSummaryChip("Roam", getSummaryTraitValue(summary, "movementTendency").toFixed(2)),
    makeSummaryChip("Habitat", getSummaryTraitValue(summary, "terrainAffinity").toFixed(2)),
    makeSummaryChip("Carnivory", getSummaryTraitValue(summary, "carnivory").toFixed(2)),
    makeSummaryChip("Body", getSummaryTraitValue(summary, "bodySize").toFixed(2)),
    makeSummaryChip("Limbs", getSummaryTraitValue(summary, "limbCount").toFixed(1)),
    makeSummaryChip("Camouflage", getSummaryTraitValue(summary, "camouflage").toFixed(2)),
    makeSummaryChip("Thermal", getSummaryTraitValue(summary, "thermalTolerance").toFixed(2)),
    makeSummaryChip("Water", getSummaryTraitValue(summary, "waterDependency").toFixed(2)),
    makeSummaryChip("Mind", getSummaryTraitValue(summary, "intelligence").toFixed(2)),
    makeSummaryChip("Social", getSummaryTraitValue(summary, "sociality").toFixed(2))
  ];

  setElementClass(traitSummaryText, "summary-grid trait-summary-grid");
  setElementHtml(traitSummaryText, chips.join(""));
}

export function updateLineageSummary() {
  var summary = world.lineageSummary || null;
  var trackedSummary = PS.sim && PS.sim.lineageTracking && typeof PS.sim.lineageTracking.getSummary === "function"
    ? PS.sim.lineageTracking.getSummary()
    : null;

  if (!summary) {
    if (!trackedSummary) {
      setElementClass(lineageSummaryText, "");
      setElementText(lineageSummaryText, world.lineageSummaryText || "LINEAGES: -");
      return;
    }

    setElementClass(lineageSummaryText, "summary-grid lineage-summary-grid");
    setElementHtml(lineageSummaryText, makeTrackedLineageChips(trackedSummary).join(""));
    return;
  }

  var newestLabel = summary.newestParentId > 0
    ? "L" + summary.newestId + " <- L" + summary.newestParentId
    : "L" + summary.newestId + " founder";
  var speciesSummary = world.speciesSummary || null;
  var chips = [
    makeSummaryChip("Active", summary.activeCount),
    makeSummaryChip("Extinct", summary.extinctCount),
    makeSummaryChip("Newest", newestLabel),
    makeSummaryChip("Species", speciesSummary ? speciesSummary.activeCount + " / " + speciesSummary.totalCount : "-")
  ];

  for (var i = 0; i < summary.topLineages.length; i++) {
    var lineage = summary.topLineages[i];
    chips.push(makeSummaryChip(
      "Top L" + lineage.id,
      lineage.activeCount + " / peak " + lineage.peakPopulation
    ));
  }

  if (trackedSummary) {
    chips = chips.concat(makeTrackedLineageChips(trackedSummary));
  }

  setElementClass(lineageSummaryText, "summary-grid lineage-summary-grid");
  setElementHtml(lineageSummaryText, chips.join(""));
}

export function makeTrackedLineageChips(trackedSummary) {
  var recent = trackedSummary.recentEvents && trackedSummary.recentEvents.length > 0
    ? trackedSummary.recentEvents[trackedSummary.recentEvents.length - 1].label
    : "-";

  return [
    makeSummaryChip("Pinned", trackedSummary.pinned ? trackedSummary.label : "selected " + trackedSummary.label),
    makeSummaryChip("Status", trackedSummary.status + " / " + trackedSummary.trend),
    makeSummaryChip("Parent", trackedSummary.parentSpeciesId > 0 ? "S" + trackedSummary.parentSpeciesId : "founder"),
    makeSummaryChip("Population", trackedSummary.population),
    makeSummaryChip("Range", trackedSummary.range),
    makeSummaryChip("Morphology", trackedSummary.morphology),
    makeSummaryChip("Traits", trackedSummary.traits.join(", ")),
    makeSummaryChip("Risk", "D" + Math.round(trackedSummary.divergenceRisk * 100) + "% E" + Math.round(trackedSummary.extinctionRisk * 100) + "%"),
    makeSummaryChip("Recent", recent)
  ];
}

export function getSettlementSummary() {
  if (!world.settlementSummary && typeof refreshSettlementSummaryCache === "function") {
    return refreshSettlementSummaryCache();
  }

  return world.settlementSummary;
}

export function getEarlyProgressionSummary() {
  if (typeof refreshEarlyProgressionSummaryCache === "function") {
    return refreshEarlyProgressionSummaryCache();
  }

  return null;
}

export function getProgressRatio(currentValue, targetValue) {
  var target = Math.max(1, Number(targetValue) || 1);
  return clamp((Number(currentValue) || 0) / target, 0, 1);
}

export function getEcosystemSummary() {
  if (!world.ecosystemSummary && typeof refreshEcosystemSummary === "function") {
    return refreshEcosystemSummary();
  }

  return world.ecosystemSummary;
}

export function getSimulationAlerts() {
  if (typeof refreshSimulationAlerts === "function") {
    return refreshSimulationAlerts();
  }

  return Array.isArray(world.simulationAlerts) ? world.simulationAlerts : [];
}

export function updateSimulationAlerts() {
  var alerts = getSimulationAlerts();

  if (alerts.length === 0) {
    setElementClass(simulationAlertsText, "");
    setElementText(simulationAlertsText, "ALERTS: -");
    return;
  }

  var chips = [];

  for (var i = 0; i < alerts.length; i++) {
    chips.push(makeAlertChip(alerts[i]));
  }

  setElementClass(simulationAlertsText, "alert-grid");
  setElementHtml(simulationAlertsText, chips.join(""));
}

export function formatStabilityProfileMix(profile) {
  if (!profile) {
    return "-";
  }

  return (
    "P" + Math.max(0, Math.round(Number(profile.population) || 0)) +
    " E" + Math.max(0, Math.round(Number(profile.energy) || 0)) +
    " F" + Math.max(0, Math.round(Number(profile.food) || 0)) +
    " D" + Math.max(0, Math.round(Number(profile.diversity) || 0)) +
    " M" + Math.max(0, Math.round(Number(profile.maturity) || 0))
  );
}

export function formatStabilityLimiter(profile) {
  if (!profile || !profile.limitingFactor) {
    return "-";
  }

  if (typeof formatEcosystemStabilityFactorScore === "function") {
    return formatEcosystemStabilityFactorScore(profile);
  }

  return String(profile.limitingFactor);
}

/**
 * @description Refreshes the ecosystem HUD summary, trend history, limiting-factor copy, stability messaging, and optional biomass/food-web diagnostics.
 * @returns {void} Updates the summary UI and history visualization in place.
 */
export function updateEcosystemSummary() {
  var summary = getEcosystemSummary();

  if (!summary) {
    setElementClass(ecosystemSummaryText, "");
    setElementText(ecosystemSummaryText, "ECOSYSTEM: -");
    drawEcosystemHistory();
    return;
  }

  var trend = summary.trend || {};
  var lifecycleLabel = world.isExtinct
    ? "extinct T" + Math.max(0, Math.round(Number(world.extinctionTick) || 0))
    : "active";
  var stabilityDetail = summary.momentum + " / " + formatStabilityLimiter(summary.stabilityProfile);
  var populationDetail = summary.populationBalance + " " + formatSignedNumber(world.populationDeltaThisTick, 0);
  var foodRunway = typeof formatFoodRunway === "function" ? formatFoodRunway(summary.foodRunwayTicks) : "-";
  var foodWeb = world.foodWebSummary || {};
  var foodWebRoles = foodWeb.roles || {};
  var terrainPressure = world.terrainPressureSummary || {};
  var speciesSummary = world.speciesSummary || {};
  var extinctionSummary = PS.sim && PS.sim.massExtinction && typeof PS.sim.massExtinction.getSummary === "function"
    ? PS.sim.massExtinction.getSummary()
    : { latest: null, recoveryWindow: null, pressureSummary: null, totalEvents: 0 };
  var extinctionLatest = extinctionSummary.latest || null;
  var recoveryWindow = extinctionSummary.recoveryWindow || null;
  var extinctionPressure = extinctionSummary.pressureSummary || {};
  var stats = typeof getStatisticsDashboardSnapshot === "function"
    ? getStatisticsDashboardSnapshot(summary)
    : null;
  var worldResourceSummary = resourceRegistry.getWorldSummary();
  var resourceDefinitions = resourceRegistry.getDefinitions();
  var cards = [
    makeDashboardCard("Planet Stats", "status",
      makePrimaryMetric("Epoch", stats ? stats.epoch : world.era, stats ? stats.deepTime : "-") +
      makeMetricRow("Time Scale", stats ? stats.timeScale : "-") +
      makeMetricRow("Overlay", stats ? stats.overlay : "-") +
      makeMetricRow("Origin", stats ? stats.microbialStatus : "-") +
      makeMetricRow("Cadence", stats ? stats.updatedEveryTicks + " ticks" : "-")
    ),
    makeDashboardCard("Biodiversity", "biology",
      makePrimaryMetric("Index", stats ? stats.biodiversity.index + "/100" : "0/100", "evenness") +
      makeMetricRow("Species", stats ? stats.species.active + " / " + stats.species.total : "-") +
      makeMetricRow("Extinct", stats ? stats.species.extinct : 0) +
      makeMetricRow("Top Share", stats ? Math.round(stats.biodiversity.topShare * 100) + "%" : "0%") +
      makeMetricRow("Biome", stats ? stats.biomeMix.topBiome + " / " + stats.biomeMix.biomeCount : "-")
    ),
    makeDashboardCard("System", "status",
      makePrimaryMetric("Pressure", summary.pressure, stabilityDetail) +
      makeMetricRow("Lifecycle", lifecycleLabel) +
      makeMetricRow("Stability", summary.stabilityScore + "/100") +
      makeMetricRow("Next Fix", summary.recoveryAction || "-") +
      makeMetricRow("Health Mix", formatStabilityProfileMix(summary.stabilityProfile))
    ),
    makeDashboardCard("Population", "population",
      makePrimaryMetric("Organisms", summary.population, populationDetail) +
      makeMetricRow("Estimated", stats ? stats.estimatedIndividuals : summary.population) +
      makeMetricRow("Flow", "+" + world.birthsThisTick + " / -" + world.deathsThisTick) +
      makeMetricRow("Lifetime", world.totalBirths + " / " + world.totalDeaths) +
      makeMetricRow("Mature", summary.matureOrganisms + "/" + summary.population) +
      makeMetricRow("Lineages", summary.activeLineages)
    ),
    makeDashboardCard("Food", "food",
      makePrimaryMetric("Stock", summary.food, summary.resourceBalance + " " + formatSignedNumber(summary.foodNetThisTick || 0, 0)) +
      makeMetricRow("Food/Org", summary.foodPerOrganism.toFixed(2)) +
      makeMetricRow("Runway", foodRunway) +
      makeMetricRow("Regrowth", Math.round((summary.foodRecoveryPressure || 0) * 100) + "% / " + (summary.foodRecoveryAttempts || 0)) +
      makeMetricRow("Food Life", world.totalFoodSpawned + " / " + world.totalFoodConsumed)
    ),
    makeDashboardCard("Resources", "food",
      makePrimaryMetric("Settlements", worldResourceSummary ? worldResourceSummary.settlementCount : 0, "tracked") +
      makeMetricRow("Stock", worldResourceSummary ? formatResourceBreakdown({
        entries: resourceDefinitions.map(function (definition) {
          return {
            label: definition.label,
            stock: worldResourceSummary.totals[definition.id] || 0
          };
        })
      }) : "-") +
      makeMetricRow("Net", worldResourceSummary ? formatResourceBreakdown({
        entries: resourceDefinitions.map(function (definition) {
          return {
            label: definition.label,
            stock: worldResourceSummary.net[definition.id] || 0
          };
        })
      }) : "-") +
      makeMetricRow("Categories", resourceDefinitions.length ? resourceDefinitions.map(function (definition) { return definition.category; }).slice(0, 5).join(" / ") : "-")
    ),
    makeDashboardCard("Food Web", "biology",
      makePrimaryMetric("Trophic", Math.max(0, Math.round(Number(foodWeb.trophicBalance) || 0)) + "/100", foodWeb.recoveryTrend || "unknown") +
      makeMetricRow("Predators", Math.max(0, Math.round(Number(foodWebRoles.predator) || 0))) +
      makeMetricRow("Herbivores", Math.max(0, Math.round(Number(foodWebRoles.herbivore) || 0))) +
      makeMetricRow("Scavengers", Math.max(0, Math.round(Number(foodWebRoles.scavenger) || 0))) +
      makeMetricRow("Pred Pressure", (Number(foodWeb.predatorPressure) || 0).toFixed(2))
    ),
    makeDashboardCard("Environment", "status",
      makePrimaryMetric("Atmosphere", stats && stats.environment.oxygen !== null ? stats.environment.oxygen.toFixed(1) + "% O2" : "-", stats && stats.environment.temperature !== null ? stats.environment.temperature.toFixed(1) + " C" : "-") +
      makeMetricRow("CO2", stats && stats.environment.carbonDioxide !== null ? Math.round(stats.environment.carbonDioxide) + " ppm" : "-") +
      makeMetricRow("Ozone", stats && stats.environment.ozone !== null ? stats.environment.ozone.toFixed(2) : "-") +
      makeMetricRow("Volcanism", stats && stats.environment.volcanic !== null ? stats.environment.volcanic.toFixed(2) : "-") +
      makeMetricRow("Vents", stats ? stats.environment.hydrothermalVents : 0)
    ),
    makeDashboardCard("Selection", "biology",
      makePrimaryMetric("Terrain", (Number(terrainPressure.pressure) || 0).toFixed(2), terrainPressure.topDriver || "none") +
      makeMetricRow("Trait", terrainPressure.topTrait || "-") +
      makeMetricRow("Mismatch", (Number(terrainPressure.mismatch) || 0).toFixed(2)) +
      makeMetricRow("Isolation", (Number(terrainPressure.isolation) || 0).toFixed(2)) +
      makeMetricRow("Populations", Math.max(0, Math.round(Number(terrainPressure.highPressurePopulations) || 0)) + "/" + Math.max(0, Math.round(Number(terrainPressure.populationCount) || 0)))
    ),
    makeDashboardCard("Traits", "biology",
      makePrimaryMetric("Distribution", stats ? stats.traitDistribution.length + " traits" : "0 traits", "population means") +
      makeMetricRow("Body", getDashboardTraitMetric(stats, "bodySize")) +
      makeMetricRow("Carnivory", getDashboardTraitMetric(stats, "carnivory")) +
      makeMetricRow("Mind", getDashboardTraitMetric(stats, "intelligence")) +
      makeMetricRow("Thermal", getDashboardTraitMetric(stats, "thermalTolerance"))
    ),
    makeDashboardCard("Species", "biology",
      makePrimaryMetric("Active", Math.max(0, Math.round(Number(speciesSummary.activeCount) || 0)), Math.max(0, Math.round(Number(speciesSummary.totalCount) || 0)) + " total") +
      makeMetricRow("Extinct", Math.max(0, Math.round(Number(speciesSummary.extinctCount) || 0))) +
      makeMetricRow("Recent", Math.max(0, Math.round(Number(speciesSummary.recentSpeciationCount) || 0))) +
      makeMetricRow("Top", speciesSummary.topSpecies && speciesSummary.topSpecies[0] ? "S" + speciesSummary.topSpecies[0].id + " L" + speciesSummary.topSpecies[0].lineageId : "-")
    ),
    makeDashboardCard("Extinction", "biology",
      makePrimaryMetric(
        "Events",
        Math.max(0, Math.round(Number(extinctionSummary.totalEvents) || 0)),
        recoveryWindow ? "recovery to T" + Math.max(0, Math.round(Number(recoveryWindow.endTick) || 0)) : "dormant"
      ) +
      makeMetricRow("Latest", extinctionLatest ? extinctionLatest.eventType : "-") +
      makeMetricRow("Losses", extinctionLatest ? extinctionLatest.losses.total + " / " + extinctionLatest.prePopulation : "-") +
      makeMetricRow("Cause Pressure", extinctionPressure.eventType ? extinctionPressure.eventType + " " + (Number(extinctionPressure.pressure) || 0).toFixed(2) : "-") +
      makeMetricRow("Recovery Pops", recoveryWindow ? recoveryWindow.survivorPopulationIds.length : 0)
    ),
    makeDashboardCard("Trends", "trend",
      makePrimaryMetric("Stability", formatSignedNumber(trend.stabilityDelta || 0, 0), "since last sample") +
      makeMetricRow("Population", formatSignedNumber(trend.populationDelta || 0, 0)) +
      makeMetricRow("Energy", formatSignedNumber(trend.energyDelta || 0, 1)) +
      makeMetricRow("Food", formatSignedNumber(trend.foodDelta || 0, 0)) +
      makeMetricRow("Flow", formatSignedNumber(trend.foodNetDelta || 0, 0)) +
      makeMetricRow("Runway", formatSignedNumber(trend.foodRunwayDelta || 0, 0))
    )
  ];

  setElementClass(ecosystemSummaryText, "ecosystem-dashboard ecosystem-" + summary.pressure);
  setElementHtml(ecosystemSummaryText, cards.join(""));
  drawEcosystemHistory();
}
