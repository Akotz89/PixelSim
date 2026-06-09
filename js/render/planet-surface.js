"use strict";
function getPlanetSurfaceChunkParentAddress(address, parentZoomLevelIndex) {
  return PS.render.surface.getChunkParentAddress(address, parentZoomLevelIndex);
}

function getPlanetSurfaceChunkLineage(address) {
  return PS.render.surface.getChunkLineage(address);
}

function getPlanetSurfaceChunkLineageLabel(lineage) {
  return PS.render.surface.getChunkLineageLabel(lineage);
}

function getPlanetLocalCanvasPoint(longitude, latitude) {
  return PS.render.globe.getLocalCanvasPoint(longitude, latitude);
}

function getPlanetSurfaceChunkScreenRect(address) {
  return PS.render.surface.getChunkScreenRect(address);
}

function getPlanetSurfaceChunkScreenPriority(screenRect) {
  return PS.render.surface.getChunkScreenPriority(screenRect);
}

function getPlanetSurfaceChunkPriorityScore(screenRect) {
  return PS.render.surface.getChunkPriorityScore(screenRect);
}

function getPlanetVisibleSurfaceChunks(guardSamples, maxChunks) {
  return PS.render.surface.getVisibleChunks(guardSamples, maxChunks);
}

function getPlanetLocalSample(gridX, gridY) {
  return PS.render.surface.getLocalSample(gridX, gridY);
}

function getDeterministicUnitNoise(a, b, c) {
  return PS.math.deterministicUnitNoise(a, b, c);
}

function getQuantizedSurfaceNoise(latitude, longitude, metersPerPatch) {
  return PS.render.surfaceNoise.getQuantized(latitude, longitude, metersPerPatch);
}

function getSurfaceMeterCoordinate(latitude, longitude) {
  return PS.render.globe.getSurfaceMeters(latitude, longitude);
}

function getPlanetGroundFeatureBlockMeters() {
  return PS.render.surfaceFeatures.getBlockMeters();
}

function getPlanetGroundFeatureQueryBlockLimit() {
  return PS.render.surfaceFeatures.getQueryBlockLimit();
}

function getPlanetGroundFeatureBlockCacheLimit() {
  return PS.render.surfaceFeatures.getBlockCacheLimit();
}

function resetPlanetGroundFeatureBlockCache() {
  PS.render.surfaceFeatures.resetBlockCache();
}

function getPlanetGroundFeatureBlockCacheStats() {
  return PS.render.surfaceFeatures.getBlockCacheStats();
}

function getPlanetGroundFeatureTypeColor(type) {
  return PS.render.surfaceFeatures.getTypeColor(type);
}

function getPlanetGroundFeatureSeedOffset() {
  return PS.render.surfaceFeatures.getSeedOffset();
}

function getPlanetGroundFeatureId(blockEast, blockNorth, type, localIndex) {
  return PS.render.surfaceFeatures.getFeatureId(blockEast, blockNorth, type, localIndex);
}

function appendPlanetGroundFeature(features, blockEast, blockNorth, feature) {
  return PS.render.surfaceFeatures.appendFeature(features, blockEast, blockNorth, feature);
}

function getPlanetGroundFeatureLineBends(blockEast, blockNorth, seed, lengthMeters) {
  return PS.render.surfaceFeatures.getLineBends(blockEast, blockNorth, seed, lengthMeters);
}

function getPlanetGroundFeaturePatchPoints(blockEast, blockNorth, seed, radiusX, radiusY) {
  return PS.render.surfaceFeatures.getPatchPoints(blockEast, blockNorth, seed, radiusX, radiusY);
}

function normalizePlanetLineAngleRadians(angle) {
  return PS.render.surfaceFeatures.normalizeLineAngleRadians(angle);
}

function getPlanetLineAngleDifferenceRadians(firstAngle, secondAngle) {
  return PS.render.surfaceFeatures.getLineAngleDifferenceRadians(firstAngle, secondAngle);
}

function getPlanetTileFlowAngleRadians(tile) {
  return PS.render.surfaceFeatures.getTileFlowAngleRadians(tile);
}

function getPlanetTileRidgeAngleRadians(tile) {
  return PS.render.surfaceFeatures.getTileRidgeAngleRadians(tile);
}

function getPlanetGroundFeatureOrientation(tile, type, blockEast, blockNorth, seed) {
  return PS.render.surfaceFeatures.getFeatureOrientation(tile, type, blockEast, blockNorth, seed);
}

function getPlanetGroundFeatureBlock(blockEast, blockNorth, blockMeters) {
  return PS.render.surfaceFeatures.getBlock(blockEast, blockNorth, blockMeters);
}

function getPointToSegmentDistanceMeters(pointEast, pointNorth, lineEast1, lineNorth1, lineEast2, lineNorth2) {
  return PS.render.surfaceFeatureQuery.getPointToSegmentDistanceMeters(pointEast, pointNorth, lineEast1, lineNorth1, lineEast2, lineNorth2);
}

function getPointToRotatedRectDistanceMeters(pointEast, pointNorth, feature) {
  return PS.render.surfaceFeatureQuery.getPointToRotatedRectDistanceMeters(pointEast, pointNorth, feature);
}

function getPlanetGroundFeatureDistanceMeters(feature, eastMeters, northMeters) {
  return PS.render.surfaceFeatureQuery.getFeatureDistanceMeters(feature, eastMeters, northMeters);
}

function getPlanetGroundFeatureQueryWindow(minEastMeters, maxEastMeters, minNorthMeters, maxNorthMeters, blockMeters) {
  return PS.render.surfaceFeatureQuery.getQueryWindow(minEastMeters, maxEastMeters, minNorthMeters, maxNorthMeters, blockMeters);
}

function getPlanetGroundFeaturesForMeterBounds(minEastMeters, maxEastMeters, minNorthMeters, maxNorthMeters, blockMeters) {
  return PS.render.surfaceFeatureQuery.getFeaturesForMeterBounds(minEastMeters, maxEastMeters, minNorthMeters, maxNorthMeters, blockMeters);
}

function getNearestPlanetGroundFeature(latitude, longitude, radiusMeters) {
  return PS.render.surfaceFeatureQuery.getNearestFeature(latitude, longitude, radiusMeters);
}

function getPlanetGroundFeatureInfluenceRadius(feature, sampleMeters) {
  return PS.render.surfaceFeatureQuery.getFeatureInfluenceRadius(feature, sampleMeters);
}

function getPlanetSurfaceGroundFeatureInfluence(latitude, longitude, sampleMeters) {
  return PS.render.surfaceFeatureQuery.getSurfaceFeatureInfluence(latitude, longitude, sampleMeters);
}

function getPlanetGroundFeatureDimensionLabel(feature) {
  return PS.render.surfaceFeatureQuery.getDimensionLabel(feature);
}

function getPlanetGroundFeatureSummary(latitude, longitude, radiusMeters) {
  return PS.render.surfaceFeatureQuery.getSummary(latitude, longitude, radiusMeters);
}

function getPlanetSurfaceSampleAddress(latitude, longitude, zoomLevelIndex) {
  return PS.render.surface.getSampleAddress(latitude, longitude, zoomLevelIndex);
}

function getPlanetSurfaceChunkKeyForLatLon(latitude, longitude, zoomLevelIndex) {
  return PS.render.surface.getChunkKeyForLatLon(latitude, longitude, zoomLevelIndex);
}

function getPlanetSurfaceLatLonFromChunkAddress(address, localSampleX, localSampleY) {
  return PS.render.surface.getLatLonFromChunkAddress(address, localSampleX, localSampleY);
}

function getPlanetSurfaceChunkSampleAtAddress(address, localSampleX, localSampleY) {
  return PS.render.surface.getChunkSampleAtAddress(address, localSampleX, localSampleY);
}

function getPlanetSurfaceChunk(address) {
  return PS.render.surface.getChunk(address);
}

function getPlanetSurfaceChunkSample(latitude, longitude, tile, zoomLevelIndex) {
  return PS.render.surface.getChunkSample(latitude, longitude, tile, zoomLevelIndex);
}

function getSurfaceLayerNoise(meters, patchMeters, salt) {
  return PS.render.surfaceNoise.getLayerNoise(meters, patchMeters, salt);
}

function smoothSurfaceNoiseAmount(amount) {
  return PS.render.surfaceNoise.smoothAmount(amount);
}

function getSurfaceNoiseSeed(patchMeters, salt) {
  return PS.render.surfaceNoise.getSeed(patchMeters, salt);
}

function getSurfaceCellNoise(cellEast, cellNorth, patchMeters, salt) {
  return PS.render.surfaceNoise.getCellNoise(cellEast, cellNorth, patchMeters, salt);
}

function getSurfacePixelNoise(meters, patchMeters, salt) {
  return PS.render.surfaceNoise.getPixelNoise(meters, patchMeters, salt);
}

function getPlanetSurfaceSnowSignal(tile, latitude) {
  return PS.render.surfaceNoise.getSnowSignal(tile, latitude);
}

function getPlanetSurfaceRegionalContext(tile) {
  return PS.render.surfaceNoise.getRegionalContext(tile);
}

function getPlanetGroundLod(latitude, longitude, sampleMetersOverride, tile) {
  return PS.render.surfaceGeometry.getGroundLod(latitude, longitude, sampleMetersOverride, tile);
}

function getLatLonOffsetFromPoint(latitude, longitude, eastKm, northKm) {
  return PS.render.surfaceGeometry.getLatLonOffset(latitude, longitude, eastKm, northKm);
}

function getBiomeReliefRangeMeters(biome) {
  return PS.render.surfaceGeometry.getBiomeReliefRangeMeters(biome);
}

function getBiomeBaseHeightMeters(biome, tile) {
  return PS.render.surfaceGeometry.getBiomeBaseHeightMeters(biome, tile);
}

function getPlanetGroundFeatureReliefDeltaMeters(groundFeature, biome) {
  return PS.render.surfaceGeometry.getFeatureReliefDeltaMeters(groundFeature, biome);
}

function getPlanetSurfaceFeatureReliefAdjustment(latitude, longitude, sampleMeters, biome, groundFeature) {
  return PS.render.surfaceGeometry.getFeatureReliefAdjustment(latitude, longitude, sampleMeters, biome, groundFeature);
}

function getPlanetSurfaceHeightMeters(latitude, longitude, tile, sampleMeters, featureReliefOverride) {
  return PS.render.surfaceGeometry.getHeightMeters(latitude, longitude, tile, sampleMeters, featureReliefOverride);
}

function getPlanetSurfaceRelief(latitude, longitude, tile, sampleMetersOverride) {
  return PS.render.surfaceGeometry.getRelief(latitude, longitude, tile, sampleMetersOverride);
}

function getPlanetSurfaceFeatureMarker(biome, lod, relief) {
  return PS.render.surfaceGeometry.getFeatureMarker(biome, lod, relief);
}

function getPlanetNaturalElementColor(type) {
  return PS.render.surfaceNatural.getElementColor(type);
}

function getPlanetNaturalElementType(surface, biome, signals, relief) {
  return PS.render.surfaceNatural.getElementType(surface, biome, signals, relief);
}

function getPlanetSurfaceNaturalElement(latitude, longitude, biome, material, lod, relief) {
  return PS.render.surfaceNatural.getElement(latitude, longitude, biome, material, lod, relief);
}

function getPlanetSurfaceStrataTintColor(primary, secondary, surface) {
  return PS.render.surfaceStrata.getTintColor(primary, secondary, surface);
}

function getPlanetSurfaceMaterialStrata(latitude, longitude, biome, material, lod, relief) {
  return PS.render.surfaceStrata.getMaterial(latitude, longitude, biome, material, lod, relief);
}

function getPlanetLocalShorelineRefinement(latitude, longitude, tile, lod) {
  return PS.render.surfaceMaterial.getShorelineRefinement(latitude, longitude, tile, lod);
}

function getPlanetLocalSurfaceMaterialSignals(latitude, tile, lod, relief, longitude) {
  return PS.render.surfaceMaterial.getSignals(latitude, tile, lod, relief, longitude);
}

function getPlanetLocalSurfaceMaterialClassification(latitude, biome, lod, relief, tile, longitude) {
  return PS.render.surfaceMaterial.classify(latitude, biome, lod, relief, tile, longitude);
}

function applyPlanetGroundFeatureInfluenceToMaterial(material, groundFeature, biome) {
  return PS.render.surfaceMaterial.applyGroundFeatureInfluence(material, groundFeature, biome);
}

function getPlanetSurfaceDetail(latitude, longitude, tile, sampleMetersOverride) {
  return PS.render.surfaceMaterial.getDetail(latitude, longitude, tile, sampleMetersOverride);
}

function projectPlanetLocalPoint(longitude, latitude) {
  return PS.render.projection.projectLocalPoint(longitude, latitude);
}

function getPlanetChunkKeyForTile(x, y, zoomLevelIndex) {
  return PS.render.projection.getChunkKeyForTile(x, y, zoomLevelIndex);
}

function getPlanetProjection() {
  return PS.render.projection.getProjection();
}

function wrapPlanetLongitudeDelta(degrees) {
  return PS.render.projection.wrapLongitudeDelta(degrees);
}
