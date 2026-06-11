"use strict";
function getDistanceLabel(distance, distanceKm) {
  if (!Number.isFinite(distance)) {
    return "-";
  }

  if (Number.isFinite(distanceKm)) {
    return String(distance) + " / " + Math.round(distanceKm).toLocaleString() + " km";
  }

  return String(distance);
}

function getLocalInspectContext(tileX, tileY) {
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

function getRouteSummaryForSettlement(settlementId) {
  if (typeof getSettlementRouteStats === "function") {
    return getSettlementRouteStats(settlementId);
  }

  return {
    routeCount: 0,
    activeRoutes: 0,
    foodTransferred: 0
  };
}

function formatOrganismTraits(organism) {
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

function getPopulationTraitSummary() {
  return world.populationTraitSummary;
}

function getSummaryTraitValue(summary, key) {
  var value = Number(summary && summary[key]);

  if (Number.isFinite(value)) {
    return value;
  }

  return PS.core && PS.core.traitSchema && typeof PS.core.traitSchema.normalizeTraitValue === "function"
    ? PS.core.traitSchema.normalizeTraitValue(key, undefined)
    : 0;
}

function updateTraitSummary() {
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

function updateLineageSummary() {
  var summary = world.lineageSummary || null;

  if (!summary) {
    setElementClass(lineageSummaryText, "");
    setElementText(lineageSummaryText, world.lineageSummaryText || "LINEAGES: -");
    return;
  }

  var newestLabel = summary.newestParentId > 0
    ? "L" + summary.newestId + " <- L" + summary.newestParentId
    : "L" + summary.newestId + " founder";
  var chips = [
    makeSummaryChip("Active", summary.activeCount),
    makeSummaryChip("Extinct", summary.extinctCount),
    makeSummaryChip("Newest", newestLabel)
  ];

  for (var i = 0; i < summary.topLineages.length; i++) {
    var lineage = summary.topLineages[i];
    chips.push(makeSummaryChip(
      "Top L" + lineage.id,
      lineage.activeCount + " / peak " + lineage.peakPopulation
    ));
  }

  setElementClass(lineageSummaryText, "summary-grid lineage-summary-grid");
  setElementHtml(lineageSummaryText, chips.join(""));
}

function getSettlementSummary() {
  if (!world.settlementSummary && typeof refreshSettlementSummaryCache === "function") {
    return refreshSettlementSummaryCache();
  }

  return world.settlementSummary;
}

function getEarlyProgressionSummary() {
  if (typeof refreshEarlyProgressionSummaryCache === "function") {
    return refreshEarlyProgressionSummaryCache();
  }

  return null;
}

function escapeSummaryText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getProgressRatio(currentValue, targetValue) {
  var target = Math.max(1, Number(targetValue) || 1);
  return clamp((Number(currentValue) || 0) / target, 0, 1);
}

function makeSummaryChip(label, value) {
  return (
    "<span class=\"summary-chip\">" +
    "<b>" + escapeSummaryText(label) + "</b>" +
    "<span class=\"summary-chip-value\">" + escapeSummaryText(value) + "</span>" +
    "</span>"
  );
}

function makeDashboardCard(title, tone, bodyHtml) {
  return (
    "<section class=\"dashboard-card dashboard-" + escapeSummaryText(tone || "neutral") + "\">" +
    "<h2>" + escapeSummaryText(title) + "</h2>" +
    bodyHtml +
    "</section>"
  );
}

function makePrimaryMetric(label, value, detail) {
  return (
    "<div class=\"primary-metric\">" +
    "<span>" + escapeSummaryText(label) + "</span>" +
    "<strong>" + escapeSummaryText(value) + "</strong>" +
    "<small>" + escapeSummaryText(detail || "") + "</small>" +
    "</div>"
  );
}

function makeMetricRow(label, value) {
  return (
    "<span class=\"metric-row\">" +
    "<b>" + escapeSummaryText(label) + "</b>" +
    "<span>" + escapeSummaryText(value) + "</span>" +
    "</span>"
  );
}

function makeInspectChip(label, value) {
  return (
    "<span class=\"inspect-chip\">" +
    "<b>" + escapeSummaryText(label) + "</b>" +
    "<span>" + escapeSummaryText(value) + "</span>" +
    "</span>"
  );
}

function makeAlertChip(alert) {
  return (
    "<span class=\"alert-chip alert-" + escapeSummaryText(alert.severity || "info") + "\">" +
    "<b>" + escapeSummaryText(alert.label || "Simulation") + "</b>" +
    "<span>" + escapeSummaryText(alert.detail || "") + "</span>" +
    "</span>"
  );
}

function getEcosystemSummary() {
  if (!world.ecosystemSummary && typeof refreshEcosystemSummary === "function") {
    return refreshEcosystemSummary();
  }

  return world.ecosystemSummary;
}

function getSimulationAlerts() {
  if (typeof refreshSimulationAlerts === "function") {
    return refreshSimulationAlerts();
  }

  return Array.isArray(world.simulationAlerts) ? world.simulationAlerts : [];
}

function updateSimulationAlerts() {
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

function formatStabilityProfileMix(profile) {
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

function formatStabilityLimiter(profile) {
  if (!profile || !profile.limitingFactor) {
    return "-";
  }

  if (typeof formatEcosystemStabilityFactorScore === "function") {
    return formatEcosystemStabilityFactorScore(profile);
  }

  return String(profile.limitingFactor);
}

function updateEcosystemSummary() {
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
  var cards = [
    makeDashboardCard("System", "status",
      makePrimaryMetric("Pressure", summary.pressure, stabilityDetail) +
      makeMetricRow("Lifecycle", lifecycleLabel) +
      makeMetricRow("Stability", summary.stabilityScore + "/100") +
      makeMetricRow("Next Fix", summary.recoveryAction || "-") +
      makeMetricRow("Health Mix", formatStabilityProfileMix(summary.stabilityProfile))
    ),
    makeDashboardCard("Population", "population",
      makePrimaryMetric("Organisms", summary.population, populationDetail) +
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
    makeDashboardCard("Food Web", "biology",
      makePrimaryMetric("Trophic", Math.max(0, Math.round(Number(foodWeb.trophicBalance) || 0)) + "/100", foodWeb.recoveryTrend || "unknown") +
      makeMetricRow("Predators", Math.max(0, Math.round(Number(foodWebRoles.predator) || 0))) +
      makeMetricRow("Herbivores", Math.max(0, Math.round(Number(foodWebRoles.herbivore) || 0))) +
      makeMetricRow("Scavengers", Math.max(0, Math.round(Number(foodWebRoles.scavenger) || 0))) +
      makeMetricRow("Pred Pressure", (Number(foodWeb.predatorPressure) || 0).toFixed(2))
    ),
    makeDashboardCard("Selection", "biology",
      makePrimaryMetric("Terrain", (Number(terrainPressure.pressure) || 0).toFixed(2), terrainPressure.topDriver || "none") +
      makeMetricRow("Trait", terrainPressure.topTrait || "-") +
      makeMetricRow("Mismatch", (Number(terrainPressure.mismatch) || 0).toFixed(2)) +
      makeMetricRow("Isolation", (Number(terrainPressure.isolation) || 0).toFixed(2)) +
      makeMetricRow("Populations", Math.max(0, Math.round(Number(terrainPressure.highPressurePopulations) || 0)) + "/" + Math.max(0, Math.round(Number(terrainPressure.populationCount) || 0)))
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
