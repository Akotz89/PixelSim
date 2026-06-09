// Pixeldarium - planet.js
// Earth-scale projection helpers for the planet-sized simulation map.

var planetSurfaceChunkCache = {
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

var planetGroundFeatureBlockCache = {
  blocks: {},
  order: [],
  stats: {
    hits: 0,
    misses: 0,
    evictions: 0,
    lastBlockKey: "-"
  }
};

function getPlanetRadiusKm() {
  return PS.planet.metrics.getRadiusKm();
}

function getPlanetCircumferenceKm() {
  return PS.planet.metrics.getCircumferenceKm();
}

function getPlanetPoleToPoleKm() {
  return PS.planet.metrics.getPoleToPoleKm();
}

function getPlanetEquatorKmPerTile() {
  return PS.planet.metrics.getEquatorKmPerTile();
}

function getPlanetMeridianKmPerTile() {
  return PS.planet.metrics.getMeridianKmPerTile();
}

function getPlanetLatitudeForTile(y) {
  return PS.planet.metrics.getLatitudeForTile(y);
}

function getPlanetLongitudeForTile(x) {
  return PS.planet.metrics.getLongitudeForTile(x);
}

function getPlanetTileLatitudeStepDeg() {
  return PS.planet.metrics.getTileLatitudeStepDeg();
}

function getPlanetTileLongitudeStepDeg() {
  return PS.planet.metrics.getTileLongitudeStepDeg();
}

function getPlanetLatitudeScale(latitude) {
  return PS.planet.metrics.getLatitudeScale(latitude);
}

function isGlobeRenderMode() {
  return CONFIG.PLANET_RENDER_MODE === "globe";
}

function getPlanetZoomLevels() {
  return PS.camera.getZoomLevels();
}

function getPlanetZoomLevel(index) {
  return PS.camera.getZoomLevel(index);
}

function interpolatePlanetScaleValue(fromValue, toValue, amount) {
  return PS.camera.interpolateScaleValue(fromValue, toValue, amount);
}

function getPlanetZoomAnchorIndex(zoomLevel) {
  return PS.camera.getZoomAnchorIndex(zoomLevel);
}

function getPlanetSurfaceLodZoomIndex(zoomLevel) {
  return PS.camera.getSurfaceLodZoomIndex(zoomLevel);
}

function getPlanetInterpolatedZoomLevel(zoomLevel) {
  return PS.camera.getInterpolatedZoomLevel(zoomLevel);
}

function getPlanetZoomFactor() {
  return PS.camera.getZoomFactor();
}

function getPlanetView() {
  return PS.camera.getView();
}

function focusPlanetViewOnTile(x, y) {
  return PS.camera.focusTile(x, y);
}

function focusPlanetViewOnLatLon(latitude, longitude) {
  return PS.camera.focusLatLon(latitude, longitude);
}

function getPlanetViewPanVector() {
  return PS.camera.getPanVector();
}

function invalidatePlanetRenderCache() {
  if (typeof invalidateTerrainCache === "function") {
    invalidateTerrainCache();
  }

  world.needsRender = true;
}

function setPlanetZoomLevel(zoomLevel) {
  return PS.camera.setZoom(zoomLevel);
}

function focusPlanetViewOnLatLonAtCanvasPoint(latitude, longitude, canvasX, canvasY) {
  return PS.camera.focusLatLonAtCanvasPoint(latitude, longitude, canvasX, canvasY);
}

function setPlanetZoomLevelAtCanvasPoint(zoomLevel, canvasX, canvasY) {
  return PS.camera.setZoomAtCanvasPoint(zoomLevel, canvasX, canvasY);
}

function adjustPlanetZoom(delta) {
  return PS.camera.adjustZoom(delta);
}

function adjustPlanetZoomAtCanvasPoint(delta, canvasX, canvasY) {
  return PS.camera.adjustZoomAtCanvasPoint(delta, canvasX, canvasY);
}

function getPlanetViewScale() {
  return PS.camera.getScale();
}

function getPlanetLodTier(zoomLevel) {
  return PS.render.lod.getTier(
    typeof zoomLevel === "number" ? zoomLevel : getPlanetView().zoomLevel
  );
}

function getPlanetScaleLabel() {
  return PS.camera.getScaleLabel();
}

function getPlanetViewFootprintKm() {
  var scale = getPlanetViewScale();
  var sampleCount = Math.max(WORLD_WIDTH, WORLD_HEIGHT);

  return (scale.metersPerSample * sampleCount) / 1000;
}

function isPlanetLocalView() {
  var view = getPlanetView();

  if (PS.camera && PS.camera.unified && typeof PS.camera.unified.isLocalView === "function") {
    return PS.camera.unified.isLocalView();
  }

  return view.zoomLevel >= 1.4;
}

function getPlanetLocalViewFootprint() {
  return PS.camera.getLocalViewFootprint();
}

function getPlanetDistanceLabel(meters) {
  return PS.camera.getDistanceLabel(meters);
}

function getPlanetCameraScaleInfo() {
  return PS.camera.getInfo();
}

function getNicePlanetDistanceMeters(targetMeters) {
  return PS.camera.getNiceDistanceMeters(targetMeters);
}

function getPlanetScaleBar(targetPixels) {
  return PS.camera.getScaleBar(targetPixels);
}

function getPlanetSurfaceChunkSampleCount() {
  return PS.render.surface.getChunkSampleCount();
}

function getPlanetSurfaceChunkCacheLimit() {
  return PS.render.surface.getChunkCacheLimit();
}

function getPlanetSurfaceVisibleChunkLimit() {
  return PS.render.surface.getVisibleChunkLimit();
}

function getPositiveModulo(value, divisor) {
  var normalizedDivisor = Math.max(1, Math.round(Number(divisor) || 1));
  return ((Math.round(Number(value) || 0) % normalizedDivisor) + normalizedDivisor) % normalizedDivisor;
}

function resetPlanetSurfaceChunkCache() {
  return PS.render.surface.resetChunkCache();
}

function getPlanetSurfaceCacheStats() {
  return PS.render.surface.getCacheStats();
}

function getLongitudeDistanceKmPerDegree(latitude) {
  return PS.render.globe.getLongitudeDistanceKmPerDegree(latitude);
}

function getLatitudeDistanceKmPerDegree() {
  return PS.render.globe.getLatitudeDistanceKmPerDegree();
}

function normalizeLongitude(longitude) {
  return PS.render.globe.normalizeLongitude(longitude);
}

function getLatLonFromLocalOffset(eastKm, northKm) {
  return PS.render.globe.getLatLonFromLocalOffset(eastKm, northKm);
}

function getLatLonFromSurfaceMeterCoordinate(eastMeters, northMeters) {
  return PS.render.globe.getLatLonFromSurfaceMeters(eastMeters, northMeters);
}

function getPlanetLocalLatLonFromCanvasPoint(canvasX, canvasY) {
  return PS.render.globe.getLocalLatLonFromCanvasPoint(canvasX, canvasY);
}

function getPlanetLatLonFromCanvasPoint(canvasX, canvasY) {
  return PS.render.globe.getLatLonFromCanvasPoint(canvasX, canvasY);
}

function focusPlanetViewOnCanvasPoint(canvasX, canvasY) {
  return PS.camera.focusCanvasPoint(canvasX, canvasY);
}

function panPlanetViewByKm(eastKm, northKm) {
  return PS.camera.panKm(eastKm, northKm);
}

function panPlanetViewByScreenDelta(deltaX, deltaY) {
  return PS.camera.panScreen(deltaX, deltaY);
}

function panPlanetViewBySamples(eastSamples, northSamples) {
  return PS.camera.panSamples(eastSamples, northSamples);
}

function getTileFromLatLon(latitude, longitude) {
  return PS.render.globe.getTileFromLatLon(latitude, longitude);
}

function getPlanetSurfaceTileBlend(latitude, longitude) {
  return PS.render.surface.getTileBlend(latitude, longitude);
}

function getPlanetTileCenterLatLon(x, y) {
  return PS.render.globe.getTileLatLon(x, y);
}

function getRandomLatLonInTile(x, y) {
  return PS.render.globe.getRandomLatLonInTile(x, y);
}

function getEntitySurfacePosition(entity) {
  return PS.render.globe.getEntitySurfacePosition(entity);
}

function setEntitySurfacePosition(entity, latitude, longitude) {
  return PS.render.globe.setEntitySurfacePosition(entity, latitude, longitude);
}

function assignRandomSurfacePositionInTile(entity) {
  return PS.render.globe.assignRandomEntitySurfacePositionInTile(entity);
}

function ensureEntitySurfacePosition(entity) {
  return PS.render.globe.ensureEntitySurfacePosition(entity);
}

function syncEntityTileFromSurfacePosition(entity) {
  return PS.render.globe.syncEntityTileFromSurfacePosition(entity);
}

function interpolateLongitudeDeg(fromLongitude, toLongitude, amount) {
  return PS.render.globe.interpolateLongitude(fromLongitude, toLongitude, amount);
}

function getPlanetLocalSurfaceAddress(gridX, gridY) {
  return PS.render.surface.getLocalAddress(gridX, gridY);
}

function makePlanetSurfaceChunkAddress(zoomLevelIndex, chunkX, chunkY) {
  return PS.render.surface.makeChunkAddress(zoomLevelIndex, chunkX, chunkY);
}

function getPlanetSurfaceChunkCenterLatLon(address) {
  return PS.render.surface.getChunkCenterLatLon(address);
}
