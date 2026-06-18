"use strict";
import { PS } from "../core/namespace.js";

export function getPlanetSurfaceChunkParentAddress(address, parentZoomLevelIndex) {
  return PS.render.surface.getChunkParentAddress(address, parentZoomLevelIndex);
}

export function getPlanetSurfaceChunkLineage(address) {
  return PS.render.surface.getChunkLineage(address);
}

export function getPlanetSurfaceChunkLineageLabel(lineage) {
  return PS.render.surface.getChunkLineageLabel(lineage);
}

export function getPlanetLocalCanvasPoint(longitude, latitude) {
  return PS.render.globe.getLocalCanvasPoint(longitude, latitude);
}

export function getPlanetSurfaceChunkScreenRect(address) {
  return PS.render.surface.getChunkScreenRect(address);
}

export function getPlanetSurfaceChunkScreenPriority(screenRect) {
  return PS.render.surface.getChunkScreenPriority(screenRect);
}

export function getPlanetSurfaceChunkPriorityScore(screenRect) {
  return PS.render.surface.getChunkPriorityScore(screenRect);
}

export function getPlanetVisibleSurfaceChunks(guardSamples, maxChunks) {
  return PS.render.surface.getVisibleChunks(guardSamples, maxChunks);
}

export function getPlanetLocalSample(gridX, gridY) {
  return PS.render.surface.getLocalSample(gridX, gridY);
}

export function getDeterministicUnitNoise(a, b, c) {
  return PS.math.deterministicUnitNoise(a, b, c);
}

export function getQuantizedSurfaceNoise(latitude, longitude, metersPerPatch) {
  return PS.render.surfaceNoise.getQuantized(latitude, longitude, metersPerPatch);
}

export function getSurfaceMeterCoordinate(latitude, longitude) {
  return PS.render.globe.getSurfaceMeters(latitude, longitude);
}

export function getPlanetGroundFeatureBlockMeters() {
  return PS.render.surfaceFeatures.getBlockMeters();
}

export function getPlanetGroundFeatureQueryBlockLimit() {
  return PS.render.surfaceFeatures.getQueryBlockLimit();
}

export function getPlanetGroundFeatureBlockCacheLimit() {
  return PS.render.surfaceFeatures.getBlockCacheLimit();
}

export function resetPlanetGroundFeatureBlockCache() {
  PS.render.surfaceFeatures.resetBlockCache();
}

export function getPlanetGroundFeatureBlockCacheStats() {
  return PS.render.surfaceFeatures.getBlockCacheStats();
}

export function getPlanetGroundFeatureTypeColor(type) {
  return PS.render.surfaceFeatures.getTypeColor(type);
}

export function getPlanetGroundFeatureSeedOffset() {
  return PS.render.surfaceFeatures.getSeedOffset();
}

export function getPlanetGroundFeatureId(blockEast, blockNorth, type, localIndex) {
  return PS.render.surfaceFeatures.getFeatureId(blockEast, blockNorth, type, localIndex);
}

export function appendPlanetGroundFeature(features, blockEast, blockNorth, feature) {
  return PS.render.surfaceFeatures.appendFeature(features, blockEast, blockNorth, feature);
}

export function getPlanetGroundFeatureLineBends(blockEast, blockNorth, seed, lengthMeters) {
  return PS.render.surfaceFeatures.getLineBends(blockEast, blockNorth, seed, lengthMeters);
}

export function getPlanetGroundFeaturePatchPoints(blockEast, blockNorth, seed, radiusX, radiusY) {
  return PS.render.surfaceFeatures.getPatchPoints(blockEast, blockNorth, seed, radiusX, radiusY);
}

export function normalizePlanetLineAngleRadians(angle) {
  return PS.render.surfaceFeatures.normalizeLineAngleRadians(angle);
}

export function getPlanetLineAngleDifferenceRadians(firstAngle, secondAngle) {
  return PS.render.surfaceFeatures.getLineAngleDifferenceRadians(firstAngle, secondAngle);
}

export function getPlanetTileFlowAngleRadians(tile) {
  return PS.render.surfaceFeatures.getTileFlowAngleRadians(tile);
}

export function getPlanetTileRidgeAngleRadians(tile) {
  return PS.render.surfaceFeatures.getTileRidgeAngleRadians(tile);
}

export function getPlanetGroundFeatureOrientation(tile, type, blockEast, blockNorth, seed) {
  return PS.render.surfaceFeatures.getFeatureOrientation(tile, type, blockEast, blockNorth, seed);
}

export function getPlanetGroundFeatureBlock(blockEast, blockNorth, blockMeters) {
  return PS.render.surfaceFeatures.getBlock(blockEast, blockNorth, blockMeters);
}

export function getPointToSegmentDistanceMeters(pointEast, pointNorth, lineEast1, lineNorth1, lineEast2, lineNorth2) {
  return PS.render.surfaceFeatureQuery.getPointToSegmentDistanceMeters(pointEast, pointNorth, lineEast1, lineNorth1, lineEast2, lineNorth2);
}

export function getPointToRotatedRectDistanceMeters(pointEast, pointNorth, feature) {
  return PS.render.surfaceFeatureQuery.getPointToRotatedRectDistanceMeters(pointEast, pointNorth, feature);
}

export function getPlanetGroundFeatureDistanceMeters(feature, eastMeters, northMeters) {
  return PS.render.surfaceFeatureQuery.getFeatureDistanceMeters(feature, eastMeters, northMeters);
}

export function getPlanetGroundFeatureQueryWindow(minEastMeters, maxEastMeters, minNorthMeters, maxNorthMeters, blockMeters) {
  return PS.render.surfaceFeatureQuery.getQueryWindow(minEastMeters, maxEastMeters, minNorthMeters, maxNorthMeters, blockMeters);
}

export function getPlanetGroundFeaturesForMeterBounds(minEastMeters, maxEastMeters, minNorthMeters, maxNorthMeters, blockMeters) {
  return PS.render.surfaceFeatureQuery.getFeaturesForMeterBounds(minEastMeters, maxEastMeters, minNorthMeters, maxNorthMeters, blockMeters);
}

export function getNearestPlanetGroundFeature(latitude, longitude, radiusMeters) {
  return PS.render.surfaceFeatureQuery.getNearestFeature(latitude, longitude, radiusMeters);
}

export function getPlanetGroundFeatureInfluenceRadius(feature, sampleMeters) {
  return PS.render.surfaceFeatureQuery.getFeatureInfluenceRadius(feature, sampleMeters);
}

export function getPlanetSurfaceGroundFeatureInfluence(latitude, longitude, sampleMeters) {
  return PS.render.surfaceFeatureQuery.getSurfaceFeatureInfluence(latitude, longitude, sampleMeters);
}

export function getPlanetGroundFeatureDimensionLabel(feature) {
  return PS.render.surfaceFeatureQuery.getDimensionLabel(feature);
}

export function getPlanetGroundFeatureSummary(latitude, longitude, radiusMeters) {
  return PS.render.surfaceFeatureQuery.getSummary(latitude, longitude, radiusMeters);
}

export function getPlanetSurfaceSampleAddress(latitude, longitude, zoomLevelIndex) {
  return PS.render.surface.getSampleAddress(latitude, longitude, zoomLevelIndex);
}

export function getPlanetSurfaceChunkKeyForLatLon(latitude, longitude, zoomLevelIndex) {
  return PS.render.surface.getChunkKeyForLatLon(latitude, longitude, zoomLevelIndex);
}

export function getPlanetSurfaceLatLonFromChunkAddress(address, localSampleX, localSampleY) {
  return PS.render.surface.getLatLonFromChunkAddress(address, localSampleX, localSampleY);
}

export function getPlanetSurfaceChunkSampleAtAddress(address, localSampleX, localSampleY) {
  return PS.render.surface.getChunkSampleAtAddress(address, localSampleX, localSampleY);
}

export function getPlanetSurfaceChunk(address) {
  return PS.render.surface.getChunk(address);
}

export function getPlanetSurfaceChunkSample(latitude, longitude, tile, zoomLevelIndex) {
  return PS.render.surface.getChunkSample(latitude, longitude, tile, zoomLevelIndex);
}

export function getSurfaceLayerNoise(meters, patchMeters, salt) {
  return PS.render.surfaceNoise.getLayerNoise(meters, patchMeters, salt);
}

export function smoothSurfaceNoiseAmount(amount) {
  return PS.render.surfaceNoise.smoothAmount(amount);
}

export function getSurfaceNoiseSeed(patchMeters, salt) {
  return PS.render.surfaceNoise.getSeed(patchMeters, salt);
}

export function getSurfaceCellNoise(cellEast, cellNorth, patchMeters, salt) {
  return PS.render.surfaceNoise.getCellNoise(cellEast, cellNorth, patchMeters, salt);
}

export function getSurfacePixelNoise(meters, patchMeters, salt) {
  return PS.render.surfaceNoise.getPixelNoise(meters, patchMeters, salt);
}

export function getPlanetSurfaceSnowSignal(tile, latitude) {
  return PS.render.surfaceNoise.getSnowSignal(tile, latitude);
}

export function getPlanetSurfaceRegionalContext(tile) {
  return PS.render.surfaceNoise.getRegionalContext(tile);
}

export function getPlanetGroundLod(latitude, longitude, sampleMetersOverride, tile) {
  return PS.render.surfaceGeometry.getGroundLod(latitude, longitude, sampleMetersOverride, tile);
}

export function getLatLonOffsetFromPoint(latitude, longitude, eastKm, northKm) {
  return PS.render.surfaceGeometry.getLatLonOffset(latitude, longitude, eastKm, northKm);
}

export function getBiomeReliefRangeMeters(biome) {
  return PS.render.surfaceGeometry.getBiomeReliefRangeMeters(biome);
}

export function getBiomeBaseHeightMeters(biome, tile) {
  return PS.render.surfaceGeometry.getBiomeBaseHeightMeters(biome, tile);
}

export function getPlanetGroundFeatureReliefDeltaMeters(groundFeature, biome) {
  return PS.render.surfaceGeometry.getFeatureReliefDeltaMeters(groundFeature, biome);
}

export function getPlanetSurfaceFeatureReliefAdjustment(latitude, longitude, sampleMeters, biome, groundFeature) {
  return PS.render.surfaceGeometry.getFeatureReliefAdjustment(latitude, longitude, sampleMeters, biome, groundFeature);
}

export function getPlanetSurfaceHeightMeters(latitude, longitude, tile, sampleMeters, featureReliefOverride) {
  return PS.render.surfaceGeometry.getHeightMeters(latitude, longitude, tile, sampleMeters, featureReliefOverride);
}

export function getPlanetSurfaceRelief(latitude, longitude, tile, sampleMetersOverride) {
  return PS.render.surfaceGeometry.getRelief(latitude, longitude, tile, sampleMetersOverride);
}

export function getPlanetSurfaceFeatureMarker(biome, lod, relief) {
  return PS.render.surfaceGeometry.getFeatureMarker(biome, lod, relief);
}

export function getPlanetNaturalElementColor(type) {
  return PS.render.surfaceNatural.getElementColor(type);
}

export function getPlanetNaturalElementType(surface, biome, signals, relief) {
  return PS.render.surfaceNatural.getElementType(surface, biome, signals, relief);
}

export function getPlanetSurfaceNaturalElement(latitude, longitude, biome, material, lod, relief) {
  return PS.render.surfaceNatural.getElement(latitude, longitude, biome, material, lod, relief);
}

export function getPlanetSurfaceStrataTintColor(primary, secondary, surface) {
  return PS.render.surfaceStrata.getTintColor(primary, secondary, surface);
}

export function getPlanetSurfaceMaterialStrata(latitude, longitude, biome, material, lod, relief) {
  return PS.render.surfaceStrata.getMaterial(latitude, longitude, biome, material, lod, relief);
}

export function getPlanetLocalShorelineRefinement(latitude, longitude, tile, lod) {
  return PS.render.surfaceMaterial.getShorelineRefinement(latitude, longitude, tile, lod);
}

export function getPlanetLocalSurfaceMaterialSignals(latitude, tile, lod, relief, longitude) {
  return PS.render.surfaceMaterial.getSignals(latitude, tile, lod, relief, longitude);
}

export function getPlanetLocalSurfaceMaterialClassification(latitude, biome, lod, relief, tile, longitude) {
  return PS.render.surfaceMaterial.classify(latitude, biome, lod, relief, tile, longitude);
}

export function applyPlanetGroundFeatureInfluenceToMaterial(material, groundFeature, biome) {
  return PS.render.surfaceMaterial.applyGroundFeatureInfluence(material, groundFeature, biome);
}

export function getPlanetSurfaceDetail(latitude, longitude, tile, sampleMetersOverride) {
  return PS.render.surfaceMaterial.getDetail(latitude, longitude, tile, sampleMetersOverride);
}

export function projectPlanetLocalPoint(longitude, latitude) {
  return PS.render.projection.projectLocalPoint(longitude, latitude);
}

export function getPlanetChunkKeyForTile(x, y, zoomLevelIndex) {
  return PS.render.projection.getChunkKeyForTile(x, y, zoomLevelIndex);
}

export function getPlanetProjection() {
  return PS.render.projection.getProjection();
}

export function wrapPlanetLongitudeDelta(degrees) {
  return PS.render.projection.wrapLongitudeDelta(degrees);
}
