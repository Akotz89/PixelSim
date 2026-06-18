"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";
// fallow-ignore-next-line circular-dependency
import { getDistanceLabel } from "../ui/summary.js";

// Pixeldarium - planet.js
// Earth-scale projection helpers for the planet-sized simulation map.

export var planetSurfaceChunkCache = {
  chunks: {},
  order: [],
  stats: {
    hits: 0,
    misses: 0,
    generatedChunks: 0,
    evictions: 0,
    lastChunkKey: "-",
    lastSampleKey: "-"
  }
};

export var planetGroundFeatureBlockCache = {
  blocks: {},
  order: [],
  stats: {
    hits: 0,
    misses: 0,
    evictions: 0,
    lastBlockKey: "-"
  }
};

export function getPlanetRadiusKm() {
  return PS.planet.metrics.getRadiusKm();
}

export function getPlanetCircumferenceKm() {
  return PS.planet.metrics.getCircumferenceKm();
}

export function getPlanetPoleToPoleKm() {
  return PS.planet.metrics.getPoleToPoleKm();
}

export function getPlanetEquatorKmPerTile() {
  return PS.planet.metrics.getEquatorKmPerTile();
}

export function getPlanetMeridianKmPerTile() {
  return PS.planet.metrics.getMeridianKmPerTile();
}

export function getPlanetLatitudeForTile(y) {
  return PS.planet.metrics.getLatitudeForTile(y);
}

export function getPlanetLongitudeForTile(x) {
  return PS.planet.metrics.getLongitudeForTile(x);
}

export function getPlanetTileLatitudeStepDeg() {
  return PS.planet.metrics.getTileLatitudeStepDeg();
}

export function getPlanetTileLongitudeStepDeg() {
  return PS.planet.metrics.getTileLongitudeStepDeg();
}

export function getPlanetLatitudeScale(latitude) {
  return PS.planet.metrics.getLatitudeScale(latitude);
}

export function isGlobeRenderMode() {
  return CONFIG.PLANET_RENDER_MODE === "globe";
}

export function getPlanetZoomLevels() {
  return PS.camera.getZoomLevels();
}

export function getPlanetZoomLevel(index) {
  return PS.camera.getZoomLevel(index);
}

export function interpolatePlanetScaleValue(fromValue, toValue, amount) {
  return PS.camera.interpolateScaleValue(fromValue, toValue, amount);
}

export function getPlanetZoomAnchorIndex(zoomLevel) {
  return PS.camera.getZoomAnchorIndex(zoomLevel);
}

export function getPlanetSurfaceLodZoomIndex(zoomLevel) {
  return PS.camera.getSurfaceLodZoomIndex(zoomLevel);
}

export function getPlanetInterpolatedZoomLevel(zoomLevel) {
  return PS.camera.getInterpolatedZoomLevel(zoomLevel);
}

export function getPlanetZoomFactor() {
  return PS.camera.getZoomFactor();
}

export function getPlanetView() {
  return PS.camera.getView();
}

export function focusPlanetViewOnTile(x, y) {
  return PS.camera.focusTile(x, y);
}

export function focusPlanetViewOnLatLon(latitude, longitude) {
  return PS.camera.focusLatLon(latitude, longitude);
}

export function getPlanetViewPanVector() {
  return PS.camera.getPanVector();
}

export function invalidatePlanetRenderCache() {
  if (PS.render && PS.render.terrain && typeof PS.render.terrain.invalidateCache === "function") {
    PS.render.terrain.invalidateCache();
  }

  world.needsRender = true;
}

export function setPlanetZoomLevel(zoomLevel) {
  return PS.camera.setZoom(zoomLevel);
}

export function focusPlanetViewOnLatLonAtCanvasPoint(latitude, longitude, canvasX, canvasY) {
  return PS.camera.focusLatLonAtCanvasPoint(latitude, longitude, canvasX, canvasY);
}

export function setPlanetZoomLevelAtCanvasPoint(zoomLevel, canvasX, canvasY) {
  return PS.camera.setIntegerZoomAtCanvasPoint(zoomLevel, canvasX, canvasY);
}

export function adjustPlanetZoom(delta) {
  return PS.camera.adjustZoom(delta);
}

export function adjustPlanetZoomAtCanvasPoint(delta, canvasX, canvasY) {
  return PS.camera.adjustZoomAtCanvasPoint(delta, canvasX, canvasY);
}

export function adjustPlanetTouchPinchZoomAtCanvasPoint(delta, canvasX, canvasY) {
  return PS.camera.adjustTouchPinchZoomAtCanvasPoint(delta, canvasX, canvasY);
}

export function setPlanetTouchPinchZoomTargetAtCanvasPoint(zoomLevel, canvasX, canvasY) {
  return PS.camera.setTouchPinchZoomTargetAtCanvasPoint(zoomLevel, canvasX, canvasY);
}

export function getPlanetViewScale() {
  return PS.camera.getScale();
}

export function getPlanetLodTier(zoomLevel) {
  return PS.render.lod.getTier(
    typeof zoomLevel === "number" ? zoomLevel : getPlanetView().zoomLevel
  );
}

export function getPlanetScaleLabel() {
  return PS.camera.getScaleLabel();
}

export function getPlanetViewFootprintKm() {
  var scale = getPlanetViewScale();
  var sampleCount = Math.max(WORLD_WIDTH, WORLD_HEIGHT);

  return (scale.metersPerSample * sampleCount) / 1000;
}

export function isPlanetLocalView() {
  var view = getPlanetView();

  if (PS.camera && PS.camera.unified && typeof PS.camera.unified.isLocalView === "function") {
    return PS.camera.unified.isLocalView();
  }

  return view.zoomLevel >= 1.4;
}

export function getPlanetLocalViewFootprint() {
  return PS.camera.getLocalViewFootprint();
}

export function getPlanetDistanceLabel(meters) {
  return PS.camera.getDistanceLabel(meters);
}

export function getPlanetCameraScaleInfo() {
  return PS.camera.getInfo();
}

export function getNicePlanetDistanceMeters(targetMeters) {
  return PS.camera.getNiceDistanceMeters(targetMeters);
}

export function getPlanetScaleBar(targetPixels) {
  return PS.camera.getScaleBar(targetPixels);
}

export function getPlanetSurfaceChunkSampleCount() {
  return PS.render.surface.getChunkSampleCount();
}

export function getPlanetSurfaceChunkCacheLimit() {
  return PS.render.surface.getChunkCacheLimit();
}

export function getPlanetSurfaceVisibleChunkLimit() {
  return PS.render.surface.getVisibleChunkLimit();
}

export function getPositiveModulo(value, divisor) {
  var normalizedDivisor = Math.max(1, Math.round(Number(divisor) || 1));
  return ((Math.round(Number(value) || 0) % normalizedDivisor) + normalizedDivisor) % normalizedDivisor;
}

export function resetPlanetSurfaceChunkCache() {
  return PS.render.surface.resetChunkCache();
}

export function getPlanetSurfaceCacheStats() {
  return PS.render.surface.getCacheStats();
}

export function getLongitudeDistanceKmPerDegree(latitude) {
  return PS.render.globe.getLongitudeDistanceKmPerDegree(latitude);
}

export function getLatitudeDistanceKmPerDegree() {
  return PS.render.globe.getLatitudeDistanceKmPerDegree();
}

export function normalizeLongitude(longitude) {
  return PS.render.globe.normalizeLongitude(longitude);
}

export function getLatLonFromLocalOffset(eastKm, northKm) {
  return PS.render.globe.getLatLonFromLocalOffset(eastKm, northKm);
}

export function getLatLonFromSurfaceMeterCoordinate(eastMeters, northMeters) {
  return PS.render.globe.getLatLonFromSurfaceMeters(eastMeters, northMeters);
}

export function getPlanetLocalLatLonFromCanvasPoint(canvasX, canvasY) {
  return PS.render.globe.getLocalLatLonFromCanvasPoint(canvasX, canvasY);
}

export function getPlanetLatLonFromCanvasPoint(canvasX, canvasY) {
  return PS.render.globe.getLatLonFromCanvasPoint(canvasX, canvasY);
}

export function focusPlanetViewOnCanvasPoint(canvasX, canvasY) {
  return PS.camera.focusCanvasPoint(canvasX, canvasY);
}

export function panPlanetViewByKm(eastKm, northKm) {
  return PS.camera.panKm(eastKm, northKm);
}

export function panPlanetViewByScreenDelta(deltaX, deltaY) {
  return PS.camera.panScreen(deltaX, deltaY);
}

export function panPlanetViewBySamples(eastSamples, northSamples) {
  return PS.camera.panSamples(eastSamples, northSamples);
}

export function getTileFromLatLon(latitude, longitude) {
  return PS.render.globe.getTileFromLatLon(latitude, longitude);
}

export function getPlanetSurfaceTileBlend(latitude, longitude) {
  return PS.render.surface.getTileBlend(latitude, longitude);
}

export function getPlanetTileCenterLatLon(x, y) {
  return PS.render.globe.getTileLatLon(x, y);
}

export function getRandomLatLonInTile(x, y) {
  return PS.render.globe.getRandomLatLonInTile(x, y);
}

export function getEntitySurfacePosition(entity) {
  return PS.render.globe.getEntitySurfacePosition(entity);
}

export function setEntitySurfacePosition(entity, latitude, longitude) {
  return PS.render.globe.setEntitySurfacePosition(entity, latitude, longitude);
}

export function assignRandomSurfacePositionInTile(entity) {
  return PS.render.globe.assignRandomEntitySurfacePositionInTile(entity);
}

export function ensureEntitySurfacePosition(entity) {
  return PS.render.globe.ensureEntitySurfacePosition(entity);
}

export function syncEntityTileFromSurfacePosition(entity) {
  return PS.render.globe.syncEntityTileFromSurfacePosition(entity);
}

export function interpolateLongitudeDeg(fromLongitude, toLongitude, amount) {
  return PS.render.globe.interpolateLongitude(fromLongitude, toLongitude, amount);
}

export function getPlanetLocalSurfaceAddress(gridX, gridY) {
  return PS.render.surface.getLocalAddress(gridX, gridY);
}

export function makePlanetSurfaceChunkAddress(zoomLevelIndex, chunkX, chunkY) {
  return PS.render.surface.makeChunkAddress(zoomLevelIndex, chunkX, chunkY);
}

export function getPlanetSurfaceChunkCenterLatLon(address) {
  return PS.render.surface.getChunkCenterLatLon(address);
}
