import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getPointToRotatedRectDistanceMeters, getPointToSegmentDistanceMeters, getSurfaceMeterCoordinate } from "./planet-surface.js";

PS.render = PS.render || {};
PS.render.surfaceFeatureQuery = PS.render.surfaceFeatureQuery || {};

PS.render.surfaceFeatureQuery.getPointToSegmentDistanceMeters = function (pointEast, pointNorth, lineEast1, lineNorth1, lineEast2, lineNorth2) {
  var dx = (Number(lineEast2) || 0) - (Number(lineEast1) || 0);
  var dy = (Number(lineNorth2) || 0) - (Number(lineNorth1) || 0);
  var lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 0) {
    var pointDx = (Number(pointEast) || 0) - (Number(lineEast1) || 0);
    var pointDy = (Number(pointNorth) || 0) - (Number(lineNorth1) || 0);

    return Math.sqrt(pointDx * pointDx + pointDy * pointDy);
  }

  var amount = clamp(
    (((Number(pointEast) || 0) - (Number(lineEast1) || 0)) * dx +
      ((Number(pointNorth) || 0) - (Number(lineNorth1) || 0)) * dy) / lengthSquared,
    0,
    1
  );
  var nearestEast = (Number(lineEast1) || 0) + amount * dx;
  var nearestNorth = (Number(lineNorth1) || 0) + amount * dy;
  var nearestDx = (Number(pointEast) || 0) - nearestEast;
  var nearestDy = (Number(pointNorth) || 0) - nearestNorth;

  return Math.sqrt(nearestDx * nearestDx + nearestDy * nearestDy);
};

PS.render.surfaceFeatureQuery.getPointToRotatedRectDistanceMeters = function (pointEast, pointNorth, feature) {
  var rotation = -(Number(feature.rotation) || 0);
  var cos = Math.cos(rotation);
  var sin = Math.sin(rotation);
  var localEast = ((Number(pointEast) || 0) - (Number(feature.east) || 0)) * cos -
    ((Number(pointNorth) || 0) - (Number(feature.north) || 0)) * sin;
  var localNorth = ((Number(pointEast) || 0) - (Number(feature.east) || 0)) * sin +
    ((Number(pointNorth) || 0) - (Number(feature.north) || 0)) * cos;
  var outsideEast = Math.max(Math.abs(localEast) - (Number(feature.widthMeters) || 0) / 2, 0);
  var outsideNorth = Math.max(Math.abs(localNorth) - (Number(feature.heightMeters) || 0) / 2, 0);

  return Math.sqrt(outsideEast * outsideEast + outsideNorth * outsideNorth);
};

PS.render.surfaceFeatureQuery.getFeatureDistanceMeters = function (feature, eastMeters, northMeters) {
  if (!feature) {
    return Infinity;
  }

  if (feature.shape === "line") {
    return PS.render.surfaceFeatureQuery.getPointToSegmentDistanceMeters(
      eastMeters,
      northMeters,
      feature.east1,
      feature.north1,
      feature.east2,
      feature.north2
    );
  }

  if (feature.shape === "rect") {
    return PS.render.surfaceFeatureQuery.getPointToRotatedRectDistanceMeters(eastMeters, northMeters, feature);
  }

  return Infinity;
};

PS.render.surfaceFeatureQuery.getQueryWindow = function (minEastMeters, maxEastMeters, minNorthMeters, maxNorthMeters, blockMeters) {
  var normalizedBlockMeters = Math.max(16, Number(blockMeters) || PS.render.surfaceFeatures.getBlockMeters());
  var minEast = Math.min(Number(minEastMeters) || 0, Number(maxEastMeters) || 0);
  var maxEast = Math.max(Number(minEastMeters) || 0, Number(maxEastMeters) || 0);
  var minNorth = Math.min(Number(minNorthMeters) || 0, Number(maxNorthMeters) || 0);
  var maxNorth = Math.max(Number(minNorthMeters) || 0, Number(maxNorthMeters) || 0);
  var minBlockEast = Math.floor(minEast / normalizedBlockMeters) - 1;
  var maxBlockEast = Math.floor(maxEast / normalizedBlockMeters) + 1;
  var minBlockNorth = Math.floor(minNorth / normalizedBlockMeters) - 1;
  var maxBlockNorth = Math.floor(maxNorth / normalizedBlockMeters) + 1;
  var blockColumns = Math.max(0, maxBlockEast - minBlockEast + 1);
  var blockRows = Math.max(0, maxBlockNorth - minBlockNorth + 1);

  return {
    blockMeters: normalizedBlockMeters,
    minBlockEast: minBlockEast,
    maxBlockEast: maxBlockEast,
    minBlockNorth: minBlockNorth,
    maxBlockNorth: maxBlockNorth,
    blockCount: blockColumns * blockRows,
    capped: blockColumns * blockRows > PS.render.surfaceFeatures.getQueryBlockLimit()
  };
};

PS.render.surfaceFeatureQuery.getFeaturesForMeterBounds = function (minEastMeters, maxEastMeters, minNorthMeters, maxNorthMeters, blockMeters) {
  var queryWindow = PS.render.surfaceFeatureQuery.getQueryWindow(
    minEastMeters,
    maxEastMeters,
    minNorthMeters,
    maxNorthMeters,
    blockMeters
  );
  var features = [];

  if (queryWindow.capped) {
    return features;
  }

  for (var blockNorth = queryWindow.minBlockNorth; blockNorth <= queryWindow.maxBlockNorth; blockNorth++) {
    for (var blockEast = queryWindow.minBlockEast; blockEast <= queryWindow.maxBlockEast; blockEast++) {
      var blockFeatures = PS.render.surfaceFeatures.getBlock(blockEast, blockNorth, queryWindow.blockMeters);

      for (var i = 0; i < blockFeatures.length; i++) {
        features.push(blockFeatures[i]);
      }
    }
  }

  return features;
};

PS.render.surfaceFeatureQuery.getNearestFeature = function (latitude, longitude, radiusMeters) {
  var meters = getSurfaceMeterCoordinate(latitude, longitude);
  var radius = Math.max(1, Number(radiusMeters) || 48);
  var features = PS.render.surfaceFeatureQuery.getFeaturesForMeterBounds(
    meters.eastMeters - radius,
    meters.eastMeters + radius,
    meters.northMeters - radius,
    meters.northMeters + radius
  );
  var nearest = null;
  var nearestDistance = Infinity;

  for (var i = 0; i < features.length; i++) {
    var distance = PS.render.surfaceFeatureQuery.getFeatureDistanceMeters(features[i], meters.eastMeters, meters.northMeters);

    if (distance < nearestDistance) {
      nearest = features[i];
      nearestDistance = distance;
    }
  }

  if (!nearest || nearestDistance > radius) {
    return null;
  }

  var result = {};

  for (var key in nearest) {
    if (Object.prototype.hasOwnProperty.call(nearest, key)) {
      result[key] = nearest[key];
    }
  }

  result.distanceMeters = nearestDistance;
  return result;
};

PS.render.surfaceFeatureQuery.getFeatureInfluenceRadius = function (feature, sampleMeters) {
  var normalizedSampleMeters = Math.max(1, Number(sampleMeters) || 1);
  var baseRadius = clamp(normalizedSampleMeters * 3 + 6, 8, 48);

  if (!feature) {
    return baseRadius;
  }

  if (feature.shape === "line") {
    return Math.max(baseRadius, (Number(feature.widthMeters) || 1) / 2 + normalizedSampleMeters * 2 + 3);
  }

  if (feature.shape === "rect") {
    return Math.max(baseRadius, normalizedSampleMeters * 2 + 6);
  }

  return baseRadius;
};

PS.render.surfaceFeatureQuery.getSurfaceFeatureInfluence = function (latitude, longitude, sampleMeters) {
  var normalizedSampleMeters = Math.max(1, Number(sampleMeters) || 1);
  var queryRadius = clamp(normalizedSampleMeters * 4 + 12, 16, 64);
  var nearest = normalizedSampleMeters <= 25
    ? PS.render.surfaceFeatureQuery.getNearestFeature(latitude, longitude, queryRadius)
    : null;
  var influenceRadius;
  var influence;

  if (!nearest) {
    return null;
  }

  influenceRadius = PS.render.surfaceFeatureQuery.getFeatureInfluenceRadius(nearest, normalizedSampleMeters);
  influence = clamp(1 - (Number(nearest.distanceMeters) || 0) / Math.max(1, influenceRadius), 0, 1);

  if (influence <= 0.01) {
    return null;
  }

  return {
    id: nearest.id,
    type: nearest.type,
    shape: nearest.shape,
    biome: nearest.biome,
    distanceMeters: Number(nearest.distanceMeters) || 0,
    influenceRadiusMeters: influenceRadius,
    influence: influence,
    color: nearest.color,
    widthMeters: nearest.widthMeters,
    heightMeters: nearest.heightMeters
  };
};

PS.render.surfaceFeatureQuery.getDimensionLabel = function (feature) {
  if (!feature) {
    return "-";
  }

  if (feature.shape === "line") {
    var dx = (Number(feature.east2) || 0) - (Number(feature.east1) || 0);
    var dy = (Number(feature.north2) || 0) - (Number(feature.north1) || 0);
    var lengthMeters = Math.sqrt(dx * dx + dy * dy);

    return Math.round(lengthMeters) + "m x " + (Number(feature.widthMeters) || 0).toFixed(1) + "m";
  }

  if (feature.shape === "rect") {
    return Math.round(Number(feature.widthMeters) || 0) + "m x " +
      Math.round(Number(feature.heightMeters) || 0) + "m";
  }

  return "-";
};

PS.render.surfaceFeatureQuery.getSummary = function (latitude, longitude, radiusMeters) {
  var meters = getSurfaceMeterCoordinate(latitude, longitude);
  var radius = Math.max(8, Number(radiusMeters) || 48);
  var queryWindow = PS.render.surfaceFeatureQuery.getQueryWindow(
    meters.eastMeters - radius,
    meters.eastMeters + radius,
    meters.northMeters - radius,
    meters.northMeters + radius
  );

  if (queryWindow.capped) {
    return {
      count: 0,
      counts: {},
      nearest: null,
      capped: true,
      blockCount: queryWindow.blockCount,
      label: "zoom closer"
    };
  }

  var features = PS.render.surfaceFeatureQuery.getFeaturesForMeterBounds(
    meters.eastMeters - radius,
    meters.eastMeters + radius,
    meters.northMeters - radius,
    meters.northMeters + radius
  );
  var counts = {};

  for (var i = 0; i < features.length; i++) {
    counts[features[i].type] = (counts[features[i].type] || 0) + 1;
  }

  return {
    count: features.length,
    counts: counts,
    nearest: PS.render.surfaceFeatureQuery.getNearestFeature(latitude, longitude, radius),
    capped: false,
    blockCount: queryWindow.blockCount,
    label: Object.keys(counts).sort().map(function(type) {
      return type + " " + counts[type];
    }).join(", ") || "none"
  };
};
