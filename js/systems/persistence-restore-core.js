"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getPlanetTileCenterLatLon, normalizeLongitude } from "../render/planet-view.js";
import { makeFood } from "../sim/food-runtime.js";
import { countSettlementClaimedTiles, getSettlementInfluenceRadius } from "../sim/settlements-state.js";
import { openPixeldariumDatabase, PIXELDARIUM_SAVE_STORE } from "./persistence-db.js";
import { createWorldSaveData } from "./persistence-save-data.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "./state.js";

export function saveWorldToIndexedDB() {
  return openPixeldariumDatabase().then(function(db) {
    return new Promise(function(resolve, reject) {
      var saveData = createWorldSaveData();
      var transaction = db.transaction(PIXELDARIUM_SAVE_STORE, "readwrite");
      var store = transaction.objectStore(PIXELDARIUM_SAVE_STORE);

      transaction.oncomplete = function() {
        db.close();
        resolve(saveData);
      };

      transaction.onerror = function() {
        db.close();
        reject(new Error(transaction.error ? transaction.error.message : "Could not save world"));
      };

      store.put(saveData);
    });
  });
}

export function validateWorldSaveData(saveData) {
  return PS.systems.saveMigration.validate(saveData);
}

export function restoreFood(food) {
  var tileX = clamp(Math.round(restoreNumber(food.x, 0)), 0, WORLD_WIDTH - 1);
  var tileY = clamp(Math.round(restoreNumber(food.y, 0)), 0, WORLD_HEIGHT - 1);
  var restoredFood = makeFood(tileX, tileY);
  var surfacePosition = getRestoredSurfacePosition(food, restoredFood.x, restoredFood.y);

  restoredFood.latitude = surfacePosition.latitude;
  restoredFood.longitude = surfacePosition.longitude;
  return restoredFood;
}

export function restoreNumber(value, fallback) {
  var numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function getRestoredSurfacePosition(source, tileX, tileY) {
  var latitude = Number(source && source.latitude);
  var longitude = Number(source && source.longitude);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return {
      latitude: clamp(latitude, -90, 90),
      longitude: normalizeLongitude(longitude)
    };
  }

  return getPlanetTileCenterLatLon(tileX, tileY);
}

export function restoreClampedNumber(value, fallback, minValue, maxValue) {
  return clamp(restoreNumber(value, fallback), minValue, maxValue);
}

export function restoreOrganismTraits(traits) {
  return PS.core.traitSchema.restore(traits);
}

export function restoreLineageRecord(lineage) {
  lineage = lineage || {};

  var id = Math.max(1, Math.round(restoreNumber(lineage.id, 1)));
  var record = {
    id: id,
    parentId: Math.max(0, Math.round(restoreNumber(lineage.parentId, 0))),
    createdTick: Math.max(0, Math.round(restoreNumber(lineage.createdTick, 0))),
    founderGeneration: Math.max(0, Math.round(restoreNumber(lineage.founderGeneration, 0))),
    founderTraits: restoreOrganismTraits(lineage.founderTraits),
    activeCount: Math.max(0, Math.round(restoreNumber(lineage.activeCount, 0))),
    lastSeenTick: Math.max(0, Math.round(restoreNumber(lineage.lastSeenTick, 0))),
    peakPopulation: Math.max(0, Math.round(restoreNumber(lineage.peakPopulation, 0))),
    isExtinct: Boolean(lineage.isExtinct)
  };

  if (record.lastSeenTick < record.createdTick) {
    record.lastSeenTick = record.createdTick;
  }

  if (record.peakPopulation < record.activeCount) {
    record.peakPopulation = record.activeCount;
  }

  return record;
}

export function restoreLineages(lineages) {
  var restoredLineages = {};

  if (!Array.isArray(lineages)) {
    return restoredLineages;
  }

  for (var i = 0; i < lineages.length; i++) {
    var record = restoreLineageRecord(lineages[i]);
    restoredLineages[String(record.id)] = record;

    if (record.id >= world.nextLineageId) {
      world.nextLineageId = record.id + 1;
    }
  }

  return restoredLineages;
}

export function restoreSettlement(settlement) {
  settlement = settlement || {};

  var restoredSettlement = {
    id: Math.max(1, Math.round(restoreNumber(settlement.id, world.nextSettlementId))),
    lineageId: Math.max(1, Math.round(restoreNumber(settlement.lineageId, 1))),
    x: clamp(Math.round(restoreNumber(settlement.x, 0)), 0, WORLD_WIDTH - 1),
    y: clamp(Math.round(restoreNumber(settlement.y, 0)), 0, WORLD_HEIGHT - 1),
    foundedTick: Math.max(0, Math.round(restoreNumber(settlement.foundedTick, 0))),
    radius: Math.max(1, Math.round(restoreNumber(settlement.radius, CONFIG.SETTLEMENT_RADIUS))),
    population: Math.max(0, Math.round(restoreNumber(settlement.population, 0))),
    foodStock: Math.max(0, Math.round(restoreNumber(settlement.foodStock, 0))),
    storedFood: Math.max(0, Math.round(restoreNumber(settlement.storedFood, 0))),
    development: Math.max(0, restoreNumber(settlement.development, 0)),
    level: Math.max(1, Math.round(restoreNumber(settlement.level, 1))),
    lastGrowthTick: Math.max(
      0,
      Math.round(restoreNumber(settlement.lastGrowthTick, restoreNumber(settlement.foundedTick, 0)))
    ),
    influenceRadius: Math.max(1, Math.round(restoreNumber(settlement.influenceRadius, CONFIG.SETTLEMENT_INFLUENCE_BASE_RADIUS))),
    claimedTiles: Math.max(0, Math.round(restoreNumber(settlement.claimedTiles, 0))),
    claimedFood: Math.max(0, Math.round(restoreNumber(settlement.claimedFood, 0))),
    parentSettlementId: Math.max(0, Math.round(restoreNumber(settlement.parentSettlementId, 0))),
    isOutpost: Boolean(settlement.isOutpost),
    isColony: Boolean(settlement.isColony),
    lastOutpostTick: Math.max(
      0,
      Math.round(restoreNumber(settlement.lastOutpostTick, restoreNumber(settlement.foundedTick, 0)))
    ),
    lastSupplyGrowthTick: Math.max(
      0,
      Math.round(restoreNumber(settlement.lastSupplyGrowthTick, restoreNumber(settlement.foundedTick, 0)))
    ),
    isActive: Boolean(settlement.isActive),
    lastActiveTick: Math.max(0, Math.round(restoreNumber(settlement.lastActiveTick, 0)))
  };

  if (typeof getSettlementInfluenceRadius === "function") {
    restoredSettlement.influenceRadius = getSettlementInfluenceRadius(restoredSettlement);
  }

  if (typeof countSettlementClaimedTiles === "function") {
    restoredSettlement.claimedTiles = countSettlementClaimedTiles(restoredSettlement);
  }

  if (restoredSettlement.isOutpost && restoredSettlement.level >= CONFIG.SETTLEMENT_COLONY_LEVEL) {
    restoredSettlement.isColony = true;
  }

  if (restoredSettlement.id >= world.nextSettlementId) {
    world.nextSettlementId = restoredSettlement.id + 1;
  }

  return restoredSettlement;
}

export function restoreSettlements(settlements) {
  if (!Array.isArray(settlements)) {
    return [];
  }

  return settlements.map(restoreSettlement);
}

export function restoreSettlementRoute(route) {
  route = route || {};

  var restoredRoute = {
    id: Math.max(1, Math.round(restoreNumber(route.id, world.nextSettlementRouteId))),
    parentSettlementId: Math.max(1, Math.round(restoreNumber(route.parentSettlementId, 1))),
    childSettlementId: Math.max(1, Math.round(restoreNumber(route.childSettlementId, 1))),
    lineageId: Math.max(1, Math.round(restoreNumber(route.lineageId, 1))),
    foundedTick: Math.max(0, Math.round(restoreNumber(route.foundedTick, 0))),
    distance: Math.max(0, Math.round(restoreNumber(route.distance, 0))),
    foodTransferred: Math.max(0, Math.round(restoreNumber(route.foodTransferred, 0))),
    lastTransferTick: Math.max(0, Math.round(restoreNumber(route.lastTransferTick, restoreNumber(route.foundedTick, 0)))),
    isActive: Boolean(route.isActive)
  };

  if (restoredRoute.id >= world.nextSettlementRouteId) {
    world.nextSettlementRouteId = restoredRoute.id + 1;
  }

  return restoredRoute;
}

export function restoreSettlementRoutes(routes) {
  if (!Array.isArray(routes)) {
    return [];
  }

  return routes.map(restoreSettlementRoute);
}

export function restoreOrbitalAsset(asset) {
  asset = asset || {};

  var restoredAsset = {
    id: Math.max(1, Math.round(restoreNumber(asset.id, world.nextOrbitalAssetId))),
    launchNumber: Math.max(1, Math.round(restoreNumber(asset.launchNumber, asset.id || 1))),
    launchedTick: Math.max(0, Math.round(restoreNumber(asset.launchedTick, 0))),
    infrastructureScore: Math.max(0, Math.round(restoreNumber(asset.infrastructureScore, CONFIG.ORBITAL_ASSET_SCORE))),
    orbitAngle: Math.max(0, Math.round(restoreNumber(asset.orbitAngle, 0))) % 360,
    orbitBand: Math.max(1, Math.round(restoreNumber(asset.orbitBand, 1))),
    isActive: asset.isActive !== false
  };

  if (restoredAsset.id >= world.nextOrbitalAssetId) {
    world.nextOrbitalAssetId = restoredAsset.id + 1;
  }

  return restoredAsset;
}

export function restoreOrbitalAssets(assets) {
  if (!Array.isArray(assets)) {
    return [];
  }

  return assets.map(restoreOrbitalAsset);
}

export function restorePlanetaryBody(body) {
  body = body || {};

  var id = Math.max(1, Math.round(restoreNumber(body.id, world.nextPlanetaryBodyId)));
  var restoredBody = {
    id: id,
    name: String(body.name || "P-" + String(100 + id)),
    discoveredTick: Math.max(0, Math.round(restoreNumber(body.discoveredTick, 0))),
    surveyValue: Math.max(1, Math.round(restoreNumber(body.surveyValue, 20 + id * 7))),
    orbitAngle: Math.max(0, Math.round(restoreNumber(body.orbitAngle, id * 67))) % 360,
    orbitRadius: Math.max(1, Math.round(restoreNumber(body.orbitRadius, 64 + id * 10))),
    isSurveyed: body.isSurveyed !== false
  };

  if (restoredBody.id >= world.nextPlanetaryBodyId) {
    world.nextPlanetaryBodyId = restoredBody.id + 1;
  }

  return restoredBody;
}
