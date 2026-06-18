"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getPlanetTile } from "../render/planet-grid.js";
import { getPlanetChunkKeyForTile, getPlanetGroundFeatureDimensionLabel, getPlanetGroundFeatureSummary, getPlanetSurfaceChunkLineage, getPlanetSurfaceChunkLineageLabel, getPlanetSurfaceDetail } from "../render/planet-surface.js";
import { getEntitySurfacePosition, getPlanetCameraScaleInfo, getPlanetDistanceLabel, getPlanetLatitudeForTile, getPlanetLocalSurfaceAddress, getPlanetLongitudeForTile, getPlanetScaleLabel, getPlanetSurfaceCacheStats, isPlanetLocalView } from "../render/planet-view.js";
import { isFertile } from "../render/terrain-hydrology.js";
import { getCompletedProbeMissionCount } from "../sim/civilizations-probes.js";
import { foodExistsAt } from "../sim/food-growth.js";
import { ensureOrganismLineage, ensureOrganismTraits } from "../sim/organisms-traits.js";
import { world } from "../systems/state.js";
import { eventLogText, inspectDetailsText, inspectSummaryText, traitHistoryCanvas } from "./dom-refs.js";
import { getNearestOrganismToTile, getNearestSettlementToTile, setElementClass, setElementHtml, setElementText } from "./foundation.js";
import { makeEventChip } from "./history-summary.js";
import { getInspectSurfacePosition, getInspectSurfacePositionLabel } from "./inspect.js";
import { formatOrganismTraits, getDistanceLabel, getLocalInspectContext, getPopulationTraitSummary, getRouteSummaryForSettlement, getSettlementSummary, makeInspectChip } from "./summary.js";

export function updateEventLog() {
  var events = Array.isArray(world.eventLog) ? world.eventLog : [];

  if (events.length === 0) {
    setElementClass(eventLogText, "");
    setElementText(eventLogText, "EVENTS: Waiting for milestones");
    return;
  }

  var visibleCount = Math.max(1, Math.round(Number(CONFIG.EVENT_LOG_VISIBLE_ENTRIES) || 6));
  var startIndex = Math.max(0, events.length - visibleCount);
  var chips = [];

  for (var i = events.length - 1; i >= startIndex; i--) {
    chips.push(makeEventChip(events[i]));
  }

  setElementClass(eventLogText, "event-timeline");
  setElementHtml(eventLogText, chips.join(""));
}

export function makeTraitHistorySample(summary) {
  return {
    tick: world.tick,
    population: world.organisms.length,
    vision: summary.vision,
    metabolism: summary.metabolism,
    reproductionEnergy: summary.reproductionEnergy,
    movementTendency: summary.movementTendency,
    terrainAffinity: summary.terrainAffinity,
    intelligence: summary.intelligence,
    sociality: summary.sociality,
    carnivory: summary.carnivory,
    bodySize: summary.bodySize,
    limbCount: summary.limbCount,
    bodyShape: summary.bodyShape,
    appendageType: summary.appendageType,
    camouflage: summary.camouflage,
    thermalTolerance: summary.thermalTolerance,
    waterDependency: summary.waterDependency
  };
}

export function resetTraitHistory() {
  world.traitHistory = [];
  drawTraitHistory();
}

export function recordTraitHistorySample(force) {
  var summary = getPopulationTraitSummary();

  if (!summary) {
    return;
  }

  if (!force && world.tick % CONFIG.TRAIT_HISTORY_SAMPLE_INTERVAL !== 0) {
    return;
  }

  var lastSample = world.traitHistory[world.traitHistory.length - 1];

  if (lastSample && lastSample.tick === world.tick) {
    return;
  }

  world.traitHistory.push(makeTraitHistorySample(summary));

  while (world.traitHistory.length > CONFIG.TRAIT_HISTORY_MAX_SAMPLES) {
    world.traitHistory.shift();
  }

  drawTraitHistory();
}

export function scaleTraitValue(value, minValue, maxValue, height) {
  if (maxValue <= minValue) {
    return height / 2;
  }

  var normalized = (value - minValue) / (maxValue - minValue);
  normalized = clamp(normalized, 0, 1);
  return height - normalized * height;
}

export function drawTraitHistoryLine(samples, getValue, minValue, maxValue, color, chart) {
  return null;
}

export function drawTraitHistory() {
  var samples = Array.isArray(world.traitHistory) ? world.traitHistory : [];
  var latest = samples.length ? samples[samples.length - 1] : null;

  if (!traitHistoryCanvas) {
    return;
  }

  traitHistoryCanvas.textContent = latest
    ? "TRAIT HISTORY: vision " + Number(latest.vision || 0).toFixed(1) +
      " metabolism " + Number(latest.metabolism || 0).toFixed(1) +
      " reproduce " + Number(latest.reproductionEnergy || 0).toFixed(0) +
      " intelligence " + Number(latest.intelligence || 0).toFixed(2) +
      " sociality " + Number(latest.sociality || 0).toFixed(2) +
      " carnivory " + Number(latest.carnivory || 0).toFixed(2)
    : "TRAIT HISTORY: Waiting for samples";
}

/**
 * @description Rebuilds the inspect side panel from the currently selected tile, including terrain, organism, lineage, settlement, and trait-history details.
 * @returns {void} Updates cached DOM text and classes in place.
 */
export function updateInspectPanel() {
  if (!world.inspectedTile) {
    setElementClass(inspectDetailsText, "");
    setElementText(inspectSummaryText, "INSPECT: None");
    setElementText(inspectDetailsText, "TERRAIN: -   FOOD: -   ORGANISM: -");
    return;
  }

  var tileX = world.inspectedTile.x;
  var tileY = world.inspectedTile.y;
  var planetTile = getPlanetTile(tileX, tileY);
  var terrainName = planetTile ? planetTile.biome : (isFertile(tileX, tileY) ? "fertile" : "barren");
  var hasFood = foodExistsAt(tileX, tileY);
  var organism = getNearestOrganismToTile(tileX, tileY);
  var settlement = getNearestSettlementToTile(tileX, tileY);
  var localContext = getLocalInspectContext(tileX, tileY);
  var planetScaleInfo = getPlanetCameraScaleInfo();
  var planetCacheStats = getPlanetSurfaceCacheStats();
  var renderCacheStats = PS.render && PS.render.surfaceRender && typeof PS.render.surfaceRender.getCacheStats === "function"
    ? PS.render.surfaceRender.getCacheStats()
    : {
      chunks: 0,
      lastVisibleChunks: 0,
      lastPendingChunks: 0,
      lastGeneratedThisPass: 0,
      lastFallbackChunks: 0
    };
  var inspectedEntity = world.inspectedEntity;
  var inspectedPyramidLineage = isPlanetLocalView()
    ? getPlanetSurfaceChunkLineage(getPlanetLocalSurfaceAddress(tileX, tileY).address)
    : [];
  var detailChips = [
    makeInspectChip("Terrain", terrainName),
    makeInspectChip("Food", hasFood ? "yes" : "no"),
    makeInspectChip("Lat/Lon", planetTile ? planetTile.latitude.toFixed(1) + " / " + planetTile.longitude.toFixed(1) : "-"),
    makeInspectChip("Surface Lat/Lon", getInspectSurfacePositionLabel(tileX, tileY)),
    makeInspectChip("Tile Area", planetTile ? Math.round(planetTile.areaKm2).toLocaleString() + " km2" : "-"),
    makeInspectChip("Zoom Scale", getPlanetScaleLabel()),
    makeInspectChip("Cache LOD", planetScaleInfo.anchorName + " " + planetScaleInfo.anchorLevel),
    makeInspectChip("Ground Px", getPlanetDistanceLabel(planetScaleInfo.metersPerCanvasPixel) + "/px"),
    makeInspectChip("Footprint", getPlanetDistanceLabel(planetScaleInfo.footprintWidthKm * 1000) + " x " + getPlanetDistanceLabel(planetScaleInfo.footprintHeightKm * 1000)),
    makeInspectChip("Camera Alt", "~" + getPlanetDistanceLabel(planetScaleInfo.approximateAltitudeKm * 1000)),
    makeInspectChip("Surface Cache", planetCacheStats.chunks + " chunks / " + planetCacheStats.samples + " samples"),
    makeInspectChip("Surface Chunk", planetCacheStats.lastChunkKey),
    makeInspectChip("Render Chunks", renderCacheStats.lastVisibleChunks + " visible / " + renderCacheStats.chunks + " cached / " + renderCacheStats.lastPendingChunks + " pending / " + renderCacheStats.lastGeneratedThisPass + " generated / " + renderCacheStats.lastFallbackChunks + " fallback"),
    makeInspectChip("Pyramid", getPlanetSurfaceChunkLineageLabel(inspectedPyramidLineage)),
    makeInspectChip("Chunk", planetTile ? getPlanetChunkKeyForTile(tileX, tileY) : "-"),
    makeInspectChip("Surface", getInspectSurfaceLabel(tileX, tileY)),
    makeInspectChip("Ground Features", getInspectGroundFeatureLabel(tileX, tileY)),
    makeInspectChip("Selected", inspectedEntity ? inspectedEntity.type : "tile"),
    makeInspectChip("Local", "R" + localContext.radius + " " + localContext.localPressure),
    makeInspectChip("Local Org", localContext.nearbyOrganisms),
    makeInspectChip("Local Food", localContext.nearbyFood),
    makeInspectChip("Local Fertile", Math.round(localContext.fertilePercent) + "%"),
    makeInspectChip("Near Food", getDistanceLabel(localContext.nearestFoodDistance, localContext.nearestFoodDistanceKm)),
    makeInspectChip("Near Camp", getDistanceLabel(localContext.nearestSettlementDistance))
  ];

  if (organism) {
    var lineageRecord = world.lineages ? world.lineages[String(ensureOrganismLineage(organism))] : null;
    var parentText = lineageRecord && lineageRecord.parentId > 0 ? " parent L" + lineageRecord.parentId : " founder";
    var traits = ensureOrganismTraits(organism);
    var organismSurfacePosition = getEntitySurfacePosition(organism);
    var representativeContext = PS.sim.representatives && PS.sim.representatives.inspect
      ? PS.sim.representatives.inspect(organism)
      : null;
    var representativeRecord = representativeContext ? representativeContext.representative : null;
    var populationRecord = representativeContext ? representativeContext.population : null;
    var pressure = populationRecord && populationRecord.pressure ? populationRecord.pressure : null;
    var foodWeb = populationRecord && populationRecord.foodWeb ? populationRecord.foodWeb : null;
    var speciesRecord = PS.sim.speciation && typeof PS.sim.speciation.getSpecies === "function"
      ? PS.sim.speciation.getSpecies(organism.speciesId)
      : null;

    detailChips.push(makeInspectChip("Organism", "L" + ensureOrganismLineage(organism) + parentText));
    detailChips.push(makeInspectChip("Rep ID", representativeRecord ? "R" + representativeRecord.id : "-"));
    detailChips.push(makeInspectChip("Population", populationRecord ? "P" + populationRecord.id + " count " + populationRecord.count : "-"));
    detailChips.push(makeInspectChip("Species", organism.speciesId ? "S" + organism.speciesId : "-"));
    detailChips.push(makeInspectChip("Parent Species", speciesRecord && speciesRecord.parentId ? "S" + speciesRecord.parentId : "-"));
    detailChips.push(makeInspectChip("Speciation", populationRecord && populationRecord.speciation ? populationRecord.speciation.cause + " d" + populationRecord.speciation.divergence.toFixed(2) : (speciesRecord ? speciesRecord.cause : "-")));
    detailChips.push(makeInspectChip("Rep State", representativeRecord ? representativeRecord.behavior : "-"));
    detailChips.push(makeInspectChip("Rep Pin", representativeRecord && representativeRecord.pinned ? "pinned" : "open"));
    detailChips.push(makeInspectChip("Bookmark", representativeRecord ? representativeRecord.bookmarkScore.toFixed(2) : "0.00"));
    detailChips.push(makeInspectChip("Morphology", representativeRecord && representativeRecord.morphologyPreview ? representativeRecord.morphologyPreview.label : "-"));
    detailChips.push(makeInspectChip("Trophic Role", foodWeb ? foodWeb.role : "-"));
    detailChips.push(makeInspectChip("Food Web", foodWeb ? "balance " + foodWeb.trophicBalance + " predator " + foodWeb.predatorPressure.toFixed(2) + " " + foodWeb.recoveryTrend : "-"));
    detailChips.push(makeInspectChip("Agg Pressure", pressure ? "food " + pressure.food + " scarcity " + pressure.scarcity.toFixed(2) + " terrain " + pressure.terrain.toFixed(2) : "-"));
    detailChips.push(makeInspectChip("Terrain Driver", populationRecord && populationRecord.terrainPressure ? populationRecord.terrainPressure.terrainDriver : "-"));
    detailChips.push(makeInspectChip("Selection", populationRecord && populationRecord.terrainPressure ? populationRecord.terrainPressure.dominantTrait + " p" + populationRecord.terrainPressure.pressure.toFixed(2) + " iso " + populationRecord.terrainPressure.isolation.toFixed(2) : "-"));
    if (PS.sim && PS.sim.massExtinction && typeof PS.sim.massExtinction.getSummary === "function") {
      var extinctionSummary = PS.sim.massExtinction.getSummary();
      var extinctionLatest = extinctionSummary.latest;
      var recoveryWindow = extinctionSummary.recoveryWindow;
      var populationExtinctionLoss = extinctionLatest && extinctionLatest.losses && extinctionLatest.losses.byPopulation
        ? extinctionLatest.losses.byPopulation[String(organism.populationId)] || 0
        : 0;

      detailChips.push(makeInspectChip("Extinction", extinctionLatest ? extinctionLatest.eventType + " -" + populationExtinctionLoss : "-"));
      detailChips.push(makeInspectChip("Recovery", recoveryWindow && recoveryWindow.survivorPopulationIds.indexOf(organism.populationId) >= 0 ? "radiating to T" + recoveryWindow.endTick : "-"));
    }
    detailChips.push(makeInspectChip("Org Unit", "~" + Math.max(1, Math.round(Number(CONFIG.ORGANISM_POPULATION_UNIT) || 1)).toLocaleString()));
    detailChips.push(makeInspectChip("Org Energy", organism.energy));
    detailChips.push(makeInspectChip("Org Age", Math.round(organism.age * Math.max(0, Number(CONFIG.SIM_DAYS_PER_TICK) || 0)).toLocaleString() + " days"));
    detailChips.push(makeInspectChip("Travel Bank", Math.round(Math.max(0, Number(organism.travelKm) || 0)).toLocaleString() + " km"));
    detailChips.push(makeInspectChip("Org Gen", organism.generation));
    detailChips.push(makeInspectChip("Org Pos", organism.x + "," + organism.y));
    detailChips.push(makeInspectChip("Org Lat/Lon", organismSurfacePosition ? organismSurfacePosition.latitude.toFixed(4) + " / " + organismSurfacePosition.longitude.toFixed(4) : "-"));
    detailChips.push(makeInspectChip("Org Dir", organism.directionX + "," + organism.directionY));
    detailChips.push(makeInspectChip("Org Traits", formatOrganismTraits(organism)));
  } else {
    detailChips.push(makeInspectChip("Organism", "none"));
  }

  if (settlement) {
    var settlementRouteSummary = getRouteSummaryForSettlement(settlement.id);
    var settlementType = settlement.isColony ? "colony S" + settlement.parentSettlementId : (settlement.isOutpost ? "outpost S" + settlement.parentSettlementId : "root camp");

    detailChips.push(makeInspectChip("Settlement", "S" + settlement.id + " L" + settlement.lineageId));
    detailChips.push(makeInspectChip("Set Type", settlementType));
    detailChips.push(makeInspectChip("Routes", settlementRouteSummary.activeRoutes + "/" + settlementRouteSummary.routeCount));
    detailChips.push(makeInspectChip("Route Food", settlementRouteSummary.foodTransferred));
    detailChips.push(makeInspectChip("Level", settlement.level));
    detailChips.push(makeInspectChip("Influence", settlement.influenceRadius));
    detailChips.push(makeInspectChip("Claimed", settlement.claimedTiles + " / food " + settlement.claimedFood));
    detailChips.push(makeInspectChip("Population", settlement.population));
    detailChips.push(makeInspectChip("Nearby Food", settlement.foodStock));
    detailChips.push(makeInspectChip("Stored", settlement.storedFood));
    if (PS.sim && PS.sim.resources && typeof PS.sim.resources.getSettlementSummary === "function") {
      var resourceSummary = PS.sim.resources.getSettlementSummary(settlement);
      detailChips.push(makeInspectChip("Resources", resourceSummary.entries.map(function(entry) {
        return entry.id + " " + Math.round(entry.stock);
      }).slice(0, 5).join(" / ")));
    }
    detailChips.push(makeInspectChip("Dev", settlement.development.toFixed(1)));
    detailChips.push(makeInspectChip("Growth", "last " + settlement.lastGrowthTick + " supply " + settlement.lastSupplyGrowthTick));
    detailChips.push(makeInspectChip("Outpost", "last " + settlement.lastOutpostTick));
    detailChips.push(makeInspectChip("Founded", settlement.foundedTick));
    detailChips.push(makeInspectChip("Status", settlement.isActive ? "active" : "stale"));

    if (settlement.isColony) {
      detailChips.push(makeInspectChip("Network", Math.max(0, Math.round(Number(world.colonyNetworkScore) || 0))));
      detailChips.push(makeInspectChip("Space", Math.max(0, Number(world.spaceProgramProgress) || 0).toFixed(1) + "/" + CONFIG.SPACE_PROGRAM_LAUNCH_THRESHOLD));
      detailChips.push(makeInspectChip("Orbit", (Array.isArray(world.orbitalAssets) ? world.orbitalAssets.length : 0) + " / " + Math.max(0, Math.round(Number(world.orbitalInfrastructureScore) || 0))));
      detailChips.push(makeInspectChip("Planets", (Array.isArray(world.planetaryBodies) ? world.planetaryBodies.length : 0) + " / " + Math.max(0, Number(world.planetarySurveyProgress) || 0).toFixed(1)));
      detailChips.push(makeInspectChip("Probes", (typeof getCompletedProbeMissionCount === "function" ? getCompletedProbeMissionCount() : 0) + "/" + (Array.isArray(world.probeMissions) ? world.probeMissions.length : 0)));
      detailChips.push(makeInspectChip("Stars", (Array.isArray(world.starSystems) ? world.starSystems.length : 0) + " / " + Math.max(0, Number(world.starMapProgress) || 0).toFixed(1)));
      detailChips.push(makeInspectChip("Claims", Math.max(0, Math.round(Number(world.galacticClaimedSystems) || 0)) + " / " + Math.max(0, Number(world.galacticInfluenceProgress) || 0).toFixed(1)));
      detailChips.push(makeInspectChip("Fleets", Math.max(0, Math.round(Number(world.interstellarFleetCompleted) || 0)) + "/" + (Array.isArray(world.interstellarFleets) ? world.interstellarFleets.length : 0)));
      detailChips.push(makeInspectChip("Sectors", (Array.isArray(world.empireSectors) ? world.empireSectors.length : 0) + " / " + Math.max(0, Number(world.empireSectorProgress) || 0).toFixed(1)));
      detailChips.push(makeInspectChip("Legacy", "L" + Math.max(0, Math.round(Number(world.empireLegacyLevel) || 0)) + " / " + Math.max(0, Number(world.empireLegacyProgress) || 0).toFixed(1)));
    }
  } else {
    detailChips.push(makeInspectChip("Settlement", "none"));
  }

  setElementText(
    inspectSummaryText,
    inspectedEntity
      ? "INSPECT: " + inspectedEntity.type + " " + tileX + "," + tileY
      : "INSPECT: Tile " + tileX + "," + tileY
  );
  setElementClass(inspectDetailsText, "inspect-grid");
  setElementHtml(inspectDetailsText, detailChips.join(""));
}

export function getInspectSurfaceLabel(tileX, tileY) {
  if (!isPlanetLocalView()) {
    return "global";
  }

  var tile = getPlanetTile(tileX, tileY);
  var surfacePosition = getInspectSurfacePosition(tileX, tileY);
  var latitude = surfacePosition ? surfacePosition.latitude : (tile ? tile.latitude : getPlanetLatitudeForTile(tileY));
  var longitude = surfacePosition ? surfacePosition.longitude : (tile ? tile.longitude : getPlanetLongitudeForTile(tileX));
  var detail = getPlanetSurfaceDetail(latitude, longitude, tile);

  return detail.surface + " / " + detail.feature +
    " marker " + detail.marker.type +
    " elev " + Math.round(detail.elevation * 100) +
    " rough " + Math.round(detail.roughness * 100) +
    " height " + Math.round(detail.heightMeters).toLocaleString() + "m" +
    " shade " + Math.round(detail.hillshade * 100) +
    " @ " + detail.sampleMeters + "m";
}

export function getInspectGroundFeatureLabel(tileX, tileY) {
  if (!isPlanetLocalView() || typeof getPlanetGroundFeatureSummary !== "function") {
    return "-";
  }

  var tile = getPlanetTile(tileX, tileY);
  var surfacePosition = getInspectSurfacePosition(tileX, tileY);
  var latitude = surfacePosition ? surfacePosition.latitude : (tile ? tile.latitude : getPlanetLatitudeForTile(tileY));
  var longitude = surfacePosition ? surfacePosition.longitude : (tile ? tile.longitude : getPlanetLongitudeForTile(tileX));
  var scaleInfo = getPlanetCameraScaleInfo();

  if (scaleInfo.metersPerSample > 25) {
    return "available at Detail scale";
  }

  var summary = getPlanetGroundFeatureSummary(
    latitude,
    longitude,
    Math.max(32, scaleInfo.metersPerCanvasPixel * 90)
  );

  if (summary.capped) {
    return summary.label;
  }

  if (!summary.nearest) {
    return summary.label;
  }

  return "nearest " + summary.nearest.type +
    " " + summary.nearest.id +
    " " + getPlanetDistanceLabel(summary.nearest.distanceMeters) +
    " " + getPlanetGroundFeatureDimensionLabel(summary.nearest) +
    " | nearby " + summary.label;
}
