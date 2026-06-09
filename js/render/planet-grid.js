"use strict";
function getWrappedWorldX(x) {
  return PS.worldGrid.getWrappedX(x);
}

function getWrappedWorldCoordinateX(x) {
  return PS.worldGrid.getWrappedCoordinateX(x);
}

function getClampedWorldY(y) {
  return PS.worldGrid.getClampedY(y);
}

function normalizeWorldPosition(entity) {
  return PS.worldGrid.normalizePosition(entity);
}

function getWrappedDeltaX(fromX, toX) {
  return PS.worldGrid.getWrappedDeltaX(fromX, toX);
}

function getTileManhattanDistance(fromX, fromY, toX, toY) {
  return PS.worldGrid.getTileManhattanDistance(fromX, fromY, toX, toY);
}

function getTileGreatCircleDistanceKm(fromX, fromY, toX, toY) {
  return PS.worldGrid.getTileGreatCircleDistanceKm(fromX, fromY, toX, toY);
}

function getDirectionXToTile(fromX, toX) {
  return PS.worldGrid.getDirectionXToTile(fromX, toX);
}

function getDirectionYToTile(fromY, toY) {
  return PS.worldGrid.getDirectionYToTile(fromY, toY);
}

function getWrappedBucketIndexes(centerX, radius, bucketSize, worldSize) {
  return PS.worldGrid.getWrappedBucketIndexes(centerX, radius, bucketSize, worldSize);
}

function getClampedBucketIndexes(centerY, radius, bucketSize, worldSize) {
  return PS.worldGrid.getClampedBucketIndexes(centerY, radius, bucketSize, worldSize);
}

function projectPlanetPoint(longitudeDeg, latitudeDeg) {
  return PS.render.projection.projectPoint(longitudeDeg, latitudeDeg);
}

function getPlanetTileProjection(x, y) {
  return PS.render.projection.getTileProjection(x, y);
}

function getPlanetInterpolatedProjection(x, y) {
  return PS.render.projection.getInterpolatedProjection(x, y);
}

function getPlanetTileFromCanvasPoint(canvasX, canvasY) {
  return PS.camera && PS.camera.unified
    ? PS.camera.unified.screenToTile(canvasX, canvasY)
    : PS.render.projection.getTileFromCanvasPoint(canvasX, canvasY);
}

function getPlanetTileAreaKm2(latitude) {
  return PS.planet.metrics.getTileAreaKm2(latitude);
}

function getPlanetTile(x, y) {
  if (!Array.isArray(world.planetTiles)) {
    return null;
  }

  return world.planetTiles[getTileIndex(x, y)] || null;
}

function getPlanetTileBiome(x, y) {
  var tile = getPlanetTile(x, y);
  return tile ? tile.biome : "unknown";
}

function makePlanetTile(x, y, biome, fertilityScore, moisture, elevation) {
  return PS.planet.metrics.makeTile(x, y, biome, fertilityScore, moisture, elevation);
}

function refreshPlanetSummary() {
  return PS.planet.metrics.refreshSummary();
}
