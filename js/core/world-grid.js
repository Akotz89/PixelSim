"use strict";
import { PS } from "./namespace.js";
import { clamp } from "./utils.js";
import { getClampedBucketIndexes, getDirectionXToTile, getDirectionYToTile, getTileGreatCircleDistanceKm, getTileManhattanDistance, getWrappedBucketIndexes, getWrappedDeltaX } from "../render/planet-grid.js";
import { wrapPlanetLongitudeDelta } from "../render/planet-surface.js";
import { getPlanetLatitudeForTile, getPlanetLongitudeForTile, getPlanetRadiusKm } from "../render/planet-view.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

PS.worldGrid = PS.worldGrid || {};

PS.worldGrid.getWrappedX = function (x) {
  var width = Math.max(1, WORLD_WIDTH);
  var wrappedX = Math.round(Number(x) || 0) % width;

  return wrappedX < 0 ? wrappedX + width : wrappedX;
};

PS.worldGrid.getWrappedCoordinateX = function (x) {
  var width = Math.max(1, WORLD_WIDTH);
  var wrappedX = (Number(x) || 0) % width;

  return wrappedX < 0 ? wrappedX + width : wrappedX;
};

PS.worldGrid.getClampedY = function (y) {
  return clamp(Math.round(Number(y) || 0), 0, WORLD_HEIGHT - 1);
};

PS.worldGrid.normalizePosition = function (entity) {
  entity.x = PS.worldGrid.getWrappedX(entity.x);
  entity.y = PS.worldGrid.getClampedY(entity.y);
  return entity;
};

PS.worldGrid.getWrappedDeltaX = function (fromX, toX) {
  var width = Math.max(1, WORLD_WIDTH);
  var delta = PS.worldGrid.getWrappedCoordinateX(toX) - PS.worldGrid.getWrappedCoordinateX(fromX);

  if (delta > width / 2) {
    delta -= width;
  } else if (delta < -width / 2) {
    delta += width;
  }

  return delta;
};

PS.worldGrid.getTileManhattanDistance = function (fromX, fromY, toX, toY) {
  return Math.abs(PS.worldGrid.getWrappedDeltaX(fromX, toX)) +
    Math.abs(PS.worldGrid.getClampedY(toY) - PS.worldGrid.getClampedY(fromY));
};

PS.worldGrid.getTileGreatCircleDistanceKm = function (fromX, fromY, toX, toY) {
  var fromLatitude = getPlanetLatitudeForTile(PS.worldGrid.getClampedY(fromY)) * Math.PI / 180;
  var toLatitude = getPlanetLatitudeForTile(PS.worldGrid.getClampedY(toY)) * Math.PI / 180;
  var deltaLatitude = toLatitude - fromLatitude;
  var deltaLongitude = wrapPlanetLongitudeDelta(
    getPlanetLongitudeForTile(PS.worldGrid.getWrappedX(toX)) -
      getPlanetLongitudeForTile(PS.worldGrid.getWrappedX(fromX))
  ) * Math.PI / 180;
  var haversine =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(fromLatitude) * Math.cos(toLatitude) *
      Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2);

  return 2 * getPlanetRadiusKm() * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
};

PS.worldGrid.getDirectionXToTile = function (fromX, toX) {
  var delta = PS.worldGrid.getWrappedDeltaX(fromX, toX);

  if (delta > 0) {
    return 1;
  }

  if (delta < 0) {
    return -1;
  }

  return 0;
};

PS.worldGrid.getDirectionYToTile = function (fromY, toY) {
  var delta = PS.worldGrid.getClampedY(toY) - PS.worldGrid.getClampedY(fromY);

  if (delta > 0) {
    return 1;
  }

  if (delta < 0) {
    return -1;
  }

  return 0;
};

PS.worldGrid.getWrappedBucketIndexes = function (centerX, radius, bucketSize, worldSize) {
  var normalizedBucketSize = Math.max(1, Math.round(Number(bucketSize) || 1));
  var normalizedWorldSize = Math.max(1, Math.round(Number(worldSize) || 1));
  var bucketCount = Math.ceil(normalizedWorldSize / normalizedBucketSize);
  var normalizedRadius = Math.max(0, Math.round(Number(radius) || 0));
  var minBucket = Math.floor((Math.round(Number(centerX) || 0) - normalizedRadius) / normalizedBucketSize);
  var maxBucket = Math.floor((Math.round(Number(centerX) || 0) + normalizedRadius) / normalizedBucketSize);
  var indexes = [];
  var seen = {};

  if (normalizedRadius >= normalizedWorldSize) {
    minBucket = 0;
    maxBucket = bucketCount - 1;
  }

  for (var bucket = minBucket; bucket <= maxBucket; bucket++) {
    var wrappedBucket = bucket % bucketCount;

    if (wrappedBucket < 0) {
      wrappedBucket += bucketCount;
    }

    if (!seen[wrappedBucket]) {
      seen[wrappedBucket] = true;
      indexes.push(wrappedBucket);
    }
  }

  return indexes;
};

PS.worldGrid.getClampedBucketIndexes = function (centerY, radius, bucketSize, worldSize) {
  var normalizedBucketSize = Math.max(1, Math.round(Number(bucketSize) || 1));
  var normalizedWorldSize = Math.max(1, Math.round(Number(worldSize) || 1));
  var normalizedRadius = Math.max(0, Math.round(Number(radius) || 0));
  var minBucket = Math.floor(Math.max(0, Math.round(Number(centerY) || 0) - normalizedRadius) / normalizedBucketSize);
  var maxBucket = Math.floor(Math.min(normalizedWorldSize - 1, Math.round(Number(centerY) || 0) + normalizedRadius) / normalizedBucketSize);
  var indexes = [];

  for (var bucket = minBucket; bucket <= maxBucket; bucket++) {
    indexes.push(bucket);
  }

  return indexes;
};
