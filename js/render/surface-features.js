import { PS } from "../core/namespace.js";
import { clamp, hashSeedText } from "../core/utils.js";
import { getPlanetTile } from "./planet-grid.js";
import { getDeterministicUnitNoise } from "./planet-surface.js";
import { getLatLonFromSurfaceMeterCoordinate, getTileFromLatLon, planetGroundFeatureBlockCache } from "./planet-view.js";
import { world } from "../systems/state.js";

PS.render = PS.render || {};
PS.render.surfaceFeatures = PS.render.surfaceFeatures || {};

PS.render.surfaceFeatures.getBlockMeters = function () {
  return 64;
};

PS.render.surfaceFeatures.getQueryBlockLimit = function () {
  return 4096;
};

PS.render.surfaceFeatures.getBlockCacheLimit = function () {
  return 2048;
};

PS.render.surfaceFeatures.resetBlockCache = function () {
  planetGroundFeatureBlockCache.blocks = {};
  planetGroundFeatureBlockCache.order = [];
  planetGroundFeatureBlockCache.stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    lastBlockKey: "-"
  };
};

PS.render.surfaceFeatures.getBlockCacheStats = function () {
  return {
    blocks: planetGroundFeatureBlockCache.order.length,
    hits: planetGroundFeatureBlockCache.stats.hits,
    misses: planetGroundFeatureBlockCache.stats.misses,
    evictions: planetGroundFeatureBlockCache.stats.evictions,
    lastBlockKey: planetGroundFeatureBlockCache.stats.lastBlockKey
  };
};

PS.render.surfaceFeatures.getTypeColor = function (type) {
  switch (type) {
    case "stream":
      return "#7ec8ff";
    case "wetland":
      return "#5da879";
    case "reef":
      return "#8ed7c9";
    case "shoal":
      return "#a5d9c7";
    case "ridge":
      return "#b9b081";
    case "swale":
      return "#6fa778";
    case "rockfield":
      return "#a99d8a";
    case "meadow":
      return "#8fcf71";
    case "clearing":
      return "#8fcf71";
    default:
      return "#d9e7ff";
  }
};

PS.render.surfaceFeatures.getSeedOffset = function () {
  return typeof hashSeedText === "function" ? hashSeedText(world.seedText || "") % 100000 : 0;
};

PS.render.surfaceFeatures.getFeatureId = function (blockEast, blockNorth, type, localIndex) {
  return [
    "GF",
    Math.round(Number(blockEast) || 0),
    Math.round(Number(blockNorth) || 0),
    String(type || "feature"),
    Math.round(Number(localIndex) || 0)
  ].join(":");
};

PS.render.surfaceFeatures.appendFeature = function (features, blockEast, blockNorth, feature) {
  var localIndex = features.length;

  feature.blockEast = Math.round(Number(blockEast) || 0);
  feature.blockNorth = Math.round(Number(blockNorth) || 0);
  feature.localIndex = localIndex;
  feature.id = PS.render.surfaceFeatures.getFeatureId(blockEast, blockNorth, feature.type, localIndex);
  features.push(feature);
  return feature;
};

PS.render.surfaceFeatures.getLineBends = function (blockEast, blockNorth, seed, lengthMeters) {
  var bends = [];
  var normalizedLengthMeters = Math.max(1, Number(lengthMeters) || 1);
  var bendScale = normalizedLengthMeters * 0.13;

  for (var i = 1; i <= 3; i++) {
    bends.push({
      t: i / 4,
      offsetMeters: (getDeterministicUnitNoise(blockEast, blockNorth, seed + 31 + i * 11) - 0.5) * bendScale
    });
  }

  return bends;
};

PS.render.surfaceFeatures.getPatchPoints = function (blockEast, blockNorth, seed, radiusX, radiusY) {
  var points = [];
  var normalizedRadiusX = Math.max(1, Number(radiusX) || 1);
  var normalizedRadiusY = Math.max(1, Number(radiusY) || 1);
  var pointCount = 8;

  for (var i = 0; i < pointCount; i++) {
    var angle = (Math.PI * 2 * i) / pointCount;
    var jitter = 0.74 + getDeterministicUnitNoise(blockEast, blockNorth, seed + 41 + i * 17) * 0.34;

    points.push({
      x: Math.cos(angle) * normalizedRadiusX * jitter,
      y: Math.sin(angle) * normalizedRadiusY * jitter
    });
  }

  return points;
};

PS.render.surfaceFeatures.normalizeLineAngleRadians = function (angle) {
  var normalized = Number(angle) || 0;

  while (normalized < 0) {
    normalized += Math.PI;
  }

  while (normalized >= Math.PI) {
    normalized -= Math.PI;
  }

  return normalized;
};

PS.render.surfaceFeatures.getLineAngleDifferenceRadians = function (firstAngle, secondAngle) {
  var first = PS.render.surfaceFeatures.normalizeLineAngleRadians(firstAngle);
  var second = PS.render.surfaceFeatures.normalizeLineAngleRadians(secondAngle);
  var delta = Math.abs(first - second);

  return Math.min(delta, Math.PI - delta);
};

PS.render.surfaceFeatures.getTileFlowAngleRadians = function (tile) {
  if (!tile) {
    return null;
  }

  var dx = Number(tile.flowDirectionX) || 0;
  var dy = Number(tile.flowDirectionY) || 0;

  if (dx === 0 && dy === 0) {
    return null;
  }

  return PS.render.surfaceFeatures.normalizeLineAngleRadians(Math.atan2(-dy, dx));
};

PS.render.surfaceFeatures.getTileRidgeAngleRadians = function (tile) {
  if (!tile || !Number.isFinite(Number(tile.terrainAspect))) {
    return null;
  }

  return PS.render.surfaceFeatures.normalizeLineAngleRadians((Number(tile.terrainAspect) * Math.PI / 180) + Math.PI / 2);
};

PS.render.surfaceFeatures.getFeatureOrientation = function (tile, type, blockEast, blockNorth, seed) {
  var seededAngle = getDeterministicUnitNoise(blockEast, blockNorth, seed + 7) * Math.PI;
  var jitter = (getDeterministicUnitNoise(blockEast, blockNorth, seed + 23) - 0.5) * Math.PI * 0.18;
  var flowAngle = PS.render.surfaceFeatures.getTileFlowAngleRadians(tile);
  var ridgeAngle = PS.render.surfaceFeatures.getTileRidgeAngleRadians(tile);
  var preferredAngle = null;
  var source = "seed";

  if ((type === "stream" || type === "swale" || type === "wetland") && flowAngle !== null) {
    preferredAngle = flowAngle;
    source = "flow";
  } else if ((type === "ridge" || type === "rockfield") && ridgeAngle !== null) {
    preferredAngle = ridgeAngle;
    source = "ridge";
  } else if ((type === "shoal" || type === "reef") && ridgeAngle !== null) {
    preferredAngle = ridgeAngle;
    source = "coast";
  }

  if (preferredAngle === null) {
    preferredAngle = seededAngle;
  }

  return {
    angle: PS.render.surfaceFeatures.normalizeLineAngleRadians(preferredAngle + jitter),
    source: source,
    preferredAngle: PS.render.surfaceFeatures.normalizeLineAngleRadians(preferredAngle),
    seededAngle: PS.render.surfaceFeatures.normalizeLineAngleRadians(seededAngle),
    jitterRadians: jitter
  };
};

/**
 * @description Builds or retrieves a deterministic surface-feature block containing linework, vegetation hints, and geological feature samples for a meter-grid cell.
 * @param {number} blockEast Easting of the requested block in surface meters.
 * @param {number} blockNorth Northing of the requested block in surface meters.
 * @param {number} blockMeters Requested block size in meters.
 * @returns {Object} Cached feature block with seeded feature samples and metadata.
 */
PS.render.surfaceFeatures.getBlock = function (blockEast, blockNorth, blockMeters) {
  var normalizedBlockMeters = Math.max(16, Number(blockMeters) || PS.render.surfaceFeatures.getBlockMeters());
  var normalizedBlockEast = Math.round(Number(blockEast) || 0);
  var normalizedBlockNorth = Math.round(Number(blockNorth) || 0);
  var seedOffset = PS.render.surfaceFeatures.getSeedOffset();
  var cacheKey = [
    seedOffset,
    Math.round(normalizedBlockMeters * 100) / 100,
    normalizedBlockEast,
    normalizedBlockNorth
  ].join(":");
  var cachedBlock = planetGroundFeatureBlockCache.blocks[cacheKey];

  planetGroundFeatureBlockCache.stats.lastBlockKey = cacheKey;

  if (cachedBlock) {
    planetGroundFeatureBlockCache.stats.hits++;
    return cachedBlock;
  }

  var centerEast = (Number(blockEast) || 0) * normalizedBlockMeters + normalizedBlockMeters / 2;
  var centerNorth = (Number(blockNorth) || 0) * normalizedBlockMeters + normalizedBlockMeters / 2;
  var center = getLatLonFromSurfaceMeterCoordinate(centerEast, centerNorth);
  var tilePosition = getTileFromLatLon(center.latitude, center.longitude);
  var tile = getPlanetTile(tilePosition.x, tilePosition.y);
  var biome = tile ? tile.biome : "unknown";
  var landBiome = biome !== "ocean" && biome !== "ice" && biome !== "unknown";
  var forestBiome = biome === "forest" || biome === "tundra";
  var openBiome = biome === "grassland" || biome === "desert" || biome === "tundra";
  var riverStrength = clamp(tile && Number.isFinite(Number(tile.riverStrength)) ? Number(tile.riverStrength) : 0, 0, 1);
  var moisture = clamp(tile && Number.isFinite(Number(tile.moisture)) ? Number(tile.moisture) / 2.2 : 0.35, 0, 1);
  var coast = clamp(tile && Number.isFinite(Number(tile.coastFactor)) ? Number(tile.coastFactor) : 0, 0, 1);
  var shallowWater = clamp(Math.max(
    tile && Number.isFinite(Number(tile.shallowWater)) ? Number(tile.shallowWater) : 0,
    tile && Number.isFinite(Number(tile.shelfStrength)) ? Number(tile.shelfStrength) : 0
  ), 0, 1);
  var ridgeStrength = clamp(tile && Number.isFinite(Number(tile.ridgeStrength)) ? Number(tile.ridgeStrength) : 0, 0, 1);
  var roughness = clamp(tile && Number.isFinite(Number(tile.roughness)) ? Number(tile.roughness) : 0, 0, 1);
  var highlandLift = clamp(tile && Number.isFinite(Number(tile.highlandLift)) ? Number(tile.highlandLift) / 1.4 : 0, 0, 1);
  var features = [];
  var naturalSeed = getDeterministicUnitNoise(blockEast, blockNorth, 41 + seedOffset);
  var ridgeSeed = getDeterministicUnitNoise(blockEast, blockNorth, 73 + seedOffset);
  var rockSeed = getDeterministicUnitNoise(blockEast, blockNorth, 109 + seedOffset);
  var meadowSeed = getDeterministicUnitNoise(blockEast, blockNorth, 131 + seedOffset);
  var wetSignal = clamp(riverStrength * 0.62 + moisture * 0.30 + coast * 0.18, 0, 1);
  var ridgeSignal = clamp(ridgeStrength * 0.58 + roughness * 0.24 + highlandLift * 0.34, 0, 1);
  var oceanSignal = clamp(shallowWater * 0.56 + coast * 0.34 + naturalSeed * 0.10, 0, 1);

  function makeLine(type, seed, widthMeters, alpha) {
    var orientation = PS.render.surfaceFeatures.getFeatureOrientation(tile, type, blockEast, blockNorth, seed);
    var angle = orientation.angle;
    var offset = (getDeterministicUnitNoise(blockEast, blockNorth, seed + 13) - 0.5) * normalizedBlockMeters * 0.62;
    var length = normalizedBlockMeters * (1.18 + getDeterministicUnitNoise(blockEast, blockNorth, seed + 19) * 0.62);
    var normalX = -Math.sin(angle);
    var normalY = Math.cos(angle);
    var centerLineEast = centerEast + normalX * offset;
    var centerLineNorth = centerNorth + normalY * offset;
    var dx = Math.cos(angle) * length / 2;
    var dy = Math.sin(angle) * length / 2;

    PS.render.surfaceFeatures.appendFeature(features, blockEast, blockNorth, {
      type: type,
      shape: "line",
      biome: biome,
      east1: centerLineEast - dx,
      north1: centerLineNorth - dy,
      east2: centerLineEast + dx,
      north2: centerLineNorth + dy,
      widthMeters: widthMeters,
      bends: PS.render.surfaceFeatures.getLineBends(blockEast, blockNorth, seed, length),
      angleRadians: angle,
      orientationSource: orientation.source,
      preferredAngleRadians: orientation.preferredAngle,
      seededAngleRadians: orientation.seededAngle,
      color: PS.render.surfaceFeatures.getTypeColor(type),
      alpha: alpha
    });
  }

  if (biome === "ocean") {
    if (oceanSignal > 0.46 || naturalSeed > 0.58) {
      makeLine(shallowWater > 0.44 ? "shoal" : "reef", 211, 1.2 + naturalSeed * 2.4 + oceanSignal * 1.6, 0.12 + oceanSignal * 0.08);
    }
  } else if (landBiome && naturalSeed > 0.34) {
    makeLine(forestBiome ? "swale" : "ridge", 223, 0.7 + naturalSeed * 1.8, forestBiome ? 0.16 : 0.20);
  }

  if (landBiome && (wetSignal > 0.58 || (wetSignal > 0.34 && naturalSeed > 0.26))) {
    makeLine("stream", 257, 1.2 + wetSignal * 3.2, 0.20 + wetSignal * 0.20);
  }

  if (landBiome && (ridgeSeed > 0.72 || ridgeSignal > 0.52)) {
    makeLine(openBiome || ridgeSignal > 0.52 ? "ridge" : "swale", 307, openBiome ? 2.2 + ridgeSignal * 2.0 : 1.4 + ridgeSignal, openBiome ? 0.20 + ridgeSignal * 0.16 : 0.16 + ridgeSignal * 0.12);
  }

  if (landBiome && (meadowSeed > 0.82 || wetSignal > 0.66)) {
    var clearingWidth = normalizedBlockMeters * (0.18 + meadowSeed * 0.20);
    var clearingHeight = normalizedBlockMeters * (0.12 + getDeterministicUnitNoise(blockEast, blockNorth, 149) * 0.18);
    var patchType = wetSignal > 0.66 ? "wetland" : "meadow";
    var patchOrientation = PS.render.surfaceFeatures.getFeatureOrientation(tile, patchType, blockEast, blockNorth, 163);

    PS.render.surfaceFeatures.appendFeature(features, blockEast, blockNorth, {
      type: patchType,
      shape: "rect",
      biome: biome,
      east: centerEast + (getDeterministicUnitNoise(blockEast, blockNorth, 151) - 0.5) * normalizedBlockMeters * 0.46,
      north: centerNorth + (getDeterministicUnitNoise(blockEast, blockNorth, 157) - 0.5) * normalizedBlockMeters * 0.46,
      widthMeters: clearingWidth,
      heightMeters: clearingHeight,
      rotation: patchOrientation.angle,
      orientationSource: patchOrientation.source,
      preferredAngleRadians: patchOrientation.preferredAngle,
      seededAngleRadians: patchOrientation.seededAngle,
      patchPoints: PS.render.surfaceFeatures.getPatchPoints(blockEast, blockNorth, 167, clearingWidth / 2, clearingHeight / 2),
      color: PS.render.surfaceFeatures.getTypeColor(patchType),
      alpha: patchType === "wetland" ? 0.18 : 0.13
    });
  }

  if (openBiome && (rockSeed > 0.88 || ridgeSignal > 0.62)) {
    var widthMeters = 7 + getDeterministicUnitNoise(blockEast, blockNorth, 173) * 18 + ridgeSignal * 8;
    var heightMeters = 6 + getDeterministicUnitNoise(blockEast, blockNorth, 181) * 14 + roughness * 6;
    var rockfieldOrientation = PS.render.surfaceFeatures.getFeatureOrientation(tile, "rockfield", blockEast, blockNorth, 197);

    PS.render.surfaceFeatures.appendFeature(features, blockEast, blockNorth, {
      type: "rockfield",
      shape: "rect",
      biome: biome,
      east: centerEast + (getDeterministicUnitNoise(blockEast, blockNorth, 191) - 0.5) * normalizedBlockMeters * 0.52,
      north: centerNorth + (getDeterministicUnitNoise(blockEast, blockNorth, 193) - 0.5) * normalizedBlockMeters * 0.52,
      widthMeters: widthMeters,
      heightMeters: heightMeters,
      rotation: rockfieldOrientation.angle,
      orientationSource: rockfieldOrientation.source,
      preferredAngleRadians: rockfieldOrientation.preferredAngle,
      seededAngleRadians: rockfieldOrientation.seededAngle,
      patchPoints: PS.render.surfaceFeatures.getPatchPoints(blockEast, blockNorth, 199, widthMeters / 2, heightMeters / 2),
      color: PS.render.surfaceFeatures.getTypeColor("rockfield"),
      alpha: 0.20
    });
  }

  planetGroundFeatureBlockCache.stats.misses++;
  planetGroundFeatureBlockCache.blocks[cacheKey] = features;
  planetGroundFeatureBlockCache.order.push(cacheKey);

  while (planetGroundFeatureBlockCache.order.length > PS.render.surfaceFeatures.getBlockCacheLimit()) {
    var evictedKey = planetGroundFeatureBlockCache.order.shift();
    delete planetGroundFeatureBlockCache.blocks[evictedKey];
    planetGroundFeatureBlockCache.stats.evictions++;
  }

  return features;
};
