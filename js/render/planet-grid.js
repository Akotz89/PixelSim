"use strict";
import { PS } from "../core/namespace.js";
import { getTileIndex } from "../core/utils.js";
import { world } from "../systems/state.js";

export function getWrappedWorldX(x) {
  return PS.worldGrid.getWrappedX(x);
}

export function getWrappedWorldCoordinateX(x) {
  return PS.worldGrid.getWrappedCoordinateX(x);
}

export function getClampedWorldY(y) {
  return PS.worldGrid.getClampedY(y);
}

export function normalizeWorldPosition(entity) {
  return PS.worldGrid.normalizePosition(entity);
}

export function getWrappedDeltaX(fromX, toX) {
  return PS.worldGrid.getWrappedDeltaX(fromX, toX);
}

export function getTileManhattanDistance(fromX, fromY, toX, toY) {
  return PS.worldGrid.getTileManhattanDistance(fromX, fromY, toX, toY);
}

export function getTileGreatCircleDistanceKm(fromX, fromY, toX, toY) {
  return PS.worldGrid.getTileGreatCircleDistanceKm(fromX, fromY, toX, toY);
}

export function getDirectionXToTile(fromX, toX) {
  return PS.worldGrid.getDirectionXToTile(fromX, toX);
}

export function getDirectionYToTile(fromY, toY) {
  return PS.worldGrid.getDirectionYToTile(fromY, toY);
}

export function getWrappedBucketIndexes(centerX, radius, bucketSize, worldSize) {
  return PS.worldGrid.getWrappedBucketIndexes(centerX, radius, bucketSize, worldSize);
}

export function getClampedBucketIndexes(centerY, radius, bucketSize, worldSize) {
  return PS.worldGrid.getClampedBucketIndexes(centerY, radius, bucketSize, worldSize);
}

export function projectPlanetPoint(longitudeDeg, latitudeDeg) {
  return PS.render.projection.projectPoint(longitudeDeg, latitudeDeg);
}

export function getPlanetTileProjection(x, y) {
  return PS.render.projection.getTileProjection(x, y);
}

export function getPlanetInterpolatedProjection(x, y) {
  return PS.render.projection.getInterpolatedProjection(x, y);
}

export function getPlanetTileFromCanvasPoint(canvasX, canvasY) {
  return PS.camera && PS.camera.unified
    ? PS.camera.unified.screenToTile(canvasX, canvasY)
    : PS.render.projection.getTileFromCanvasPoint(canvasX, canvasY);
}

export function getPlanetTileAreaKm2(latitude) {
  return PS.planet.metrics.getTileAreaKm2(latitude);
}

export function getPlanetTile(x, y) {
  if (!Array.isArray(world.planetTiles)) {
    return null;
  }

  return world.planetTiles[getTileIndex(x, y)] || null;
}

export function getPlanetTileBiome(x, y) {
  var tile = getPlanetTile(x, y);
  return tile ? tile.biome : "unknown";
}

export function makePlanetTile(x, y, biome, fertilityScore, moisture, elevation) {
  return PS.planet.metrics.makeTile(x, y, biome, fertilityScore, moisture, elevation);
}

export function refreshPlanetSummary() {
  return PS.planet.metrics.refreshSummary();
}
