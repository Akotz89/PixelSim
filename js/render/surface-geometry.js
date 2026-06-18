"use strict";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getBiomeBaseHeightMeters, getBiomeReliefRangeMeters, getSurfaceMeterCoordinate } from "./planet-surface.js";
import { getLatitudeDistanceKmPerDegree, getLongitudeDistanceKmPerDegree, getPlanetViewScale, normalizeLongitude } from "./planet-view.js";

PS.render = PS.render || {};
PS.render.surfaceGeometry = PS.render.surfaceGeometry || {};

PS.render.surfaceGeometry.getGroundLod = function (latitude, longitude, sampleMetersOverride, tile) {
  var meters = getSurfaceMeterCoordinate(latitude, longitude);
  var sampleMeters = Math.max(
    1,
    Number(sampleMetersOverride) || getPlanetViewScale().metersPerSample
  );
  var regional = PS.render.surfaceNoise.getRegionalContext(tile);
  var continentalNoise = PS.render.surfaceNoise.getLayerNoise(meters, Math.max(1000, sampleMeters * 48), 1);
  var landformNoise = PS.render.surfaceNoise.getLayerNoise(meters, Math.max(160, sampleMeters * 24), 2);
  var canopyNoise = PS.render.surfaceNoise.getLayerNoise(meters, Math.max(30, sampleMeters * 10), 3);
  var groundNoise = PS.render.surfaceNoise.getLayerNoise(meters, Math.max(6, sampleMeters * 3), 4);
  var meter = PS.render.surfaceNoise.getLayerNoise(meters, Math.max(1, sampleMeters), 5);
  var micro = PS.render.surfaceNoise.getPixelNoise(meters, Math.max(1, sampleMeters), 6);
  var continental = clamp(continentalNoise * 0.56 + regional.continentShape * 0.24 + regional.plateInfluence * 0.12 + regional.islandArc * 0.08, 0, 1);
  var landform = clamp(landformNoise * 0.66 + regional.highlandLift * 0.14 + regional.islandArc * 0.10 + regional.shelfStrength * 0.06 + Math.max(0, regional.seaLevelDelta) * 0.04, 0, 1);
  var canopy = clamp(canopyNoise * 0.78 + regional.continentShape * 0.08 + regional.coastFactor * 0.06 + regional.coastlineNoise * 0.04 + regional.islandArc * 0.04, 0, 1);
  var ground = clamp(groundNoise * 0.76 + regional.shelfStrength * 0.08 + regional.coastlineNoise * 0.06 + regional.islandArc * 0.06 + regional.highlandLift * 0.04, 0, 1);
  var elevation = clamp(continental * 0.34 + landform * 0.28 + canopy * 0.16 + ground * 0.14 + meter * 0.08, 0, 1);
  var roughness = clamp(Math.abs(landform - ground) * 0.58 + Math.abs(ground - meter) * 0.30 + Math.abs(meter - micro) * 0.12 + regional.islandArc * 0.08 + regional.highlandLift * 0.07 + regional.coastlineNoise * regional.coastFactor * 0.05 - regional.shelfStrength * 0.04, 0, 1);

  return {
    sampleMeters: sampleMeters,
    northMeters: meters.northMeters,
    eastMeters: meters.eastMeters,
    continental: continental,
    landform: landform,
    canopy: canopy,
    ground: ground,
    meter: meter,
    micro: micro,
    elevation: elevation,
    roughness: roughness,
    regional: regional,
    continentShape: regional.continentShape,
    plateInfluence: regional.plateInfluence,
    islandArc: regional.islandArc,
    shelfStrength: regional.shelfStrength,
    seaLevelDelta: regional.seaLevelDelta,
    highlandLift: regional.highlandLift,
    coastFactor: regional.coastFactor,
    coastlineNoise: regional.coastlineNoise
  };
};

PS.render.surfaceGeometry.getLatLonOffset = function (latitude, longitude, eastKm, northKm) {
  var nextLatitude = clamp((Number(latitude) || 0) + (Number(northKm) || 0) / getLatitudeDistanceKmPerDegree(), -90, 90);
  var nextLongitude = normalizeLongitude((Number(longitude) || 0) + (Number(eastKm) || 0) / getLongitudeDistanceKmPerDegree(nextLatitude));

  return {
    latitude: nextLatitude,
    longitude: nextLongitude
  };
};

PS.render.surfaceGeometry.getBiomeReliefRangeMeters = function (biome) {
  switch (biome) {
    case "ocean":
      return 90;
    case "forest":
      return 180;
    case "grassland":
      return 90;
    case "desert":
      return 220;
    case "tundra":
      return 160;
    case "ice":
      return 260;
    default:
      return 120;
  }
};

PS.render.surfaceGeometry.getBiomeBaseHeightMeters = function (biome, tile) {
  var tileElevation = tile && Number.isFinite(Number(tile.elevation))
    ? Math.tanh(Number(tile.elevation) / 2)
    : 0;

  if (biome === "ocean") {
    return -4200 + tileElevation * 900;
  }

  if (biome === "ice") {
    return 1100 + tileElevation * 1400;
  }

  if (biome === "desert") {
    return 420 + tileElevation * 1250;
  }

  if (biome === "tundra") {
    return 650 + tileElevation * 1050;
  }

  return 260 + tileElevation * 950;
};

PS.render.surfaceGeometry.getFeatureReliefDeltaMeters = function (groundFeature, biome) {
  var type = groundFeature && groundFeature.type ? groundFeature.type : "";
  var influence = groundFeature ? clamp(Number(groundFeature.influence) || 0, 0, 1) : 0;
  var isOcean = biome === "ocean";

  if (!groundFeature || influence <= 0) {
    return { heightDeltaMeters: 0, roughnessBoost: 0, flattenAmount: 0, influence: 0, type: "" };
  }

  if (type === "stream") {
    return { heightDeltaMeters: isOcean ? 0 : -clamp(0.75 + influence * 2.35, 0, 3.1), roughnessBoost: clamp(influence * 0.08, 0, 0.12), flattenAmount: clamp(0.18 + influence * 0.32, 0, 0.56), influence: influence, type: type };
  }

  if (type === "wetland" || type === "meadow" || type === "clearing") {
    return { heightDeltaMeters: isOcean ? 0 : -clamp(0.18 + influence * 0.62, 0, 0.9), roughnessBoost: 0, flattenAmount: clamp(0.28 + influence * 0.38, 0, 0.72), influence: influence, type: type };
  }

  if (type === "swale") {
    return { heightDeltaMeters: isOcean ? 0 : -clamp(0.35 + influence * 1.05, 0, 1.55), roughnessBoost: clamp(influence * 0.04, 0, 0.08), flattenAmount: clamp(0.18 + influence * 0.28, 0, 0.50), influence: influence, type: type };
  }

  if (type === "ridge") {
    return { heightDeltaMeters: clamp(1.2 + influence * 4.8, 0, 6.2), roughnessBoost: clamp(0.22 + influence * 0.48, 0, 0.74), flattenAmount: 0, influence: influence, type: type };
  }

  if (type === "rockfield") {
    return { heightDeltaMeters: clamp(0.55 + influence * 2.25, 0, 3.0), roughnessBoost: clamp(0.28 + influence * 0.42, 0, 0.76), flattenAmount: 0, influence: influence, type: type };
  }

  if (type === "reef" || type === "shoal") {
    return {
      heightDeltaMeters: isOcean ? clamp(2.0 + influence * (type === "reef" ? 7.0 : 4.5), 0, type === "reef" ? 9.4 : 6.8) : 0,
      roughnessBoost: type === "reef" ? clamp(0.18 + influence * 0.32, 0, 0.54) : clamp(influence * 0.12, 0, 0.18),
      flattenAmount: type === "shoal" ? clamp(0.24 + influence * 0.30, 0, 0.58) : 0,
      influence: influence,
      type: type
    };
  }

  return { heightDeltaMeters: 0, roughnessBoost: 0, flattenAmount: 0, influence: influence, type: type };
};

PS.render.surfaceGeometry.getFeatureReliefAdjustment = function (latitude, longitude, sampleMeters, biome, groundFeature) {
  var normalizedSampleMeters = Math.max(1, Number(sampleMeters) || getPlanetViewScale().metersPerSample);
  var feature = groundFeature || null;
  var delta;

  if (normalizedSampleMeters > 25) {
    return { heightDeltaMeters: 0, roughnessBoost: 0, flattenAmount: 0, influence: 0, type: "", groundFeature: null };
  }

  if (!feature) {
    feature = PS.render.surfaceFeatureQuery.getSurfaceFeatureInfluence(latitude, longitude, normalizedSampleMeters);
  }

  delta = PS.render.surfaceGeometry.getFeatureReliefDeltaMeters(feature, biome);

  return {
    heightDeltaMeters: delta.heightDeltaMeters,
    roughnessBoost: delta.roughnessBoost,
    flattenAmount: delta.flattenAmount,
    influence: delta.influence,
    type: delta.type,
    groundFeature: feature || null
  };
};

PS.render.surfaceGeometry.getHeightMeters = function (latitude, longitude, tile, sampleMeters, featureReliefOverride) {
  var biome = tile ? tile.biome : "unknown";
  var normalizedSampleMeters = Math.max(1, Number(sampleMeters) || getPlanetViewScale().metersPerSample);
  var lod = PS.render.surfaceGeometry.getGroundLod(latitude, longitude, normalizedSampleMeters, tile);
  var featureRelief = featureReliefOverride || PS.render.surfaceGeometry.getFeatureReliefAdjustment(latitude, longitude, normalizedSampleMeters, biome);
  var tileRidge = clamp(tile && Number.isFinite(Number(tile.ridgeStrength)) ? Number(tile.ridgeStrength) : 0, 0, 1);
  var tileRoughness = clamp(tile && Number.isFinite(Number(tile.roughness)) ? Number(tile.roughness) : 0, 0, 1);
  var regional = lod.regional || PS.render.surfaceNoise.getRegionalContext(tile);
  var featureRoughnessBoost = clamp(Number(featureRelief.roughnessBoost) || 0, 0, 1);
  var featureFlattenAmount = clamp(Number(featureRelief.flattenAmount) || 0, 0, 1);
  var reliefRangeMeters = PS.render.surfaceGeometry.getBiomeReliefRangeMeters(biome) * (1 + tileRidge * 0.44 + tileRoughness * 0.16 + regional.islandArc * 0.18 + featureRoughnessBoost * 0.22) * (1 - featureFlattenAmount * 0.36);
  var landformMeters = (lod.elevation - 0.5) * reliefRangeMeters;
  var roughMeters = (lod.ground - 0.5) * reliefRangeMeters * 0.22;
  var microMeters = (lod.micro - 0.5) * reliefRangeMeters * 0.06;
  var highlandMeters = biome === "ocean" ? 0 : regional.highlandLift * 260;
  var continentMeters = biome === "ocean" ? 0 : regional.continentShape * 70 + regional.plateInfluence * 45;
  var islandArcMeters = biome === "ocean" ? regional.islandArc * 120 : regional.islandArc * 180;
  var shelfMeters = regional.shelfStrength * 1750 + regional.coastFactor * 180;
  var coastFlatten = regional.shelfStrength * featureFlattenAmount * 35;
  var featureHeightDeltaMeters = Number(featureRelief.heightDeltaMeters) || 0;

  if (biome === "ocean") {
    return PS.render.surfaceGeometry.getBiomeBaseHeightMeters(biome, tile) + shelfMeters + islandArcMeters + (lod.landform - 0.5) * 520 + roughMeters * 0.34 + microMeters * 0.18 + featureHeightDeltaMeters;
  }

  return PS.render.surfaceGeometry.getBiomeBaseHeightMeters(biome, tile) + highlandMeters + continentMeters + islandArcMeters - coastFlatten + landformMeters + roughMeters + microMeters + featureHeightDeltaMeters;
};

PS.render.surfaceGeometry.getRelief = function (latitude, longitude, tile, sampleMetersOverride) {
  var sampleMeters = Math.max(1, Number(sampleMetersOverride) || getPlanetViewScale().metersPerSample);
  var sampleKm = sampleMeters / 1000;
  var biome = tile ? tile.biome : "unknown";
  var centerFeatureRelief = PS.render.surfaceGeometry.getFeatureReliefAdjustment(latitude, longitude, sampleMeters, biome);
  var centerHeight = PS.render.surfaceGeometry.getHeightMeters(latitude, longitude, tile, sampleMeters, centerFeatureRelief);
  var east = PS.render.surfaceGeometry.getLatLonOffset(latitude, longitude, sampleKm, 0);
  var west = PS.render.surfaceGeometry.getLatLonOffset(latitude, longitude, -sampleKm, 0);
  var north = PS.render.surfaceGeometry.getLatLonOffset(latitude, longitude, 0, sampleKm);
  var south = PS.render.surfaceGeometry.getLatLonOffset(latitude, longitude, 0, -sampleKm);
  var dzdx = (PS.render.surfaceGeometry.getHeightMeters(east.latitude, east.longitude, tile, sampleMeters) - PS.render.surfaceGeometry.getHeightMeters(west.latitude, west.longitude, tile, sampleMeters)) / Math.max(1, sampleMeters * 2);
  var dzdy = (PS.render.surfaceGeometry.getHeightMeters(north.latitude, north.longitude, tile, sampleMeters) - PS.render.surfaceGeometry.getHeightMeters(south.latitude, south.longitude, tile, sampleMeters)) / Math.max(1, sampleMeters * 2);
  var normalLength = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1) || 1;
  var lightLength = Math.sqrt(0.52 * 0.52 + 0.58 * 0.58 + 0.63 * 0.63) || 1;
  var dot = (-dzdx / normalLength) * (-0.52 / lightLength) + (-dzdy / normalLength) * (0.58 / lightLength) + (1 / normalLength) * (0.63 / lightLength);

  return {
    heightMeters: centerHeight,
    slope: clamp(Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) / (Math.PI / 2), 0, 1),
    aspect: normalizeLongitude(Math.atan2(dzdy, dzdx) * 180 / Math.PI),
    hillshade: clamp(0.22 + Math.max(0, dot) * 0.78, 0, 1),
    dzdx: dzdx,
    dzdy: dzdy,
    featureRelief: centerFeatureRelief
  };
};

/**
 * @description Selects a small surface feature marker from biome, LOD noise, and relief signals for localized visual accents.
 * @param {string} biome Normalized biome id for the sample.
 * @param {Object} lod Level-of-detail noise signals for the sample.
 * @param {Object} relief Slope, hillshade, and feature-relief signals.
 * @returns {Object} Feature marker descriptor with type, intensity, color, size, and seed.
 */
PS.render.surfaceGeometry.getFeatureMarker = function (biome, lod, relief) {
  var type = "none";
  var intensity = 0;
  var color = "#ffffff";
  var size = 0;
  var markerSeed = clamp(lod.micro * 0.48 + lod.meter * 0.32 + relief.slope * 0.20, 0, 1);

  if (biome === "ocean") {
    intensity = markerSeed > 0.72 || relief.hillshade > 0.82 ? clamp(markerSeed * 0.78 + relief.hillshade * 0.22, 0, 1) : 0;
    type = intensity > 0 ? "wave cap" : "swell";
    color = "#c6f0ff";
    size = 0.32 + intensity * 0.42;
  } else if (biome === "forest") {
    intensity = lod.canopy > 0.52 ? clamp(lod.canopy * 0.68 + lod.micro * 0.20 + relief.hillshade * 0.12, 0, 1) : 0;
    type = intensity > 0.72 ? "canopy crown" : (intensity > 0 ? "leaf gap" : "understory");
    color = intensity > 0.72 ? "#4f8f45" : "#193f20";
    size = 0.26 + intensity * 0.58;
  } else if (biome === "grassland") {
    intensity = markerSeed > 0.58 ? clamp(markerSeed * 0.70 + lod.ground * 0.30, 0, 1) : 0;
    type = intensity > 0.72 ? "grass tuft" : (intensity > 0 ? "field fleck" : "short grass");
    color = "#9fdd5b";
    size = 0.20 + intensity * 0.44;
  } else if (biome === "desert") {
    intensity = lod.ground > 0.62 || relief.slope > 0.18 ? clamp(lod.ground * 0.62 + relief.slope * 0.38, 0, 1) : 0;
    type = intensity > 0.72 ? "rock fleck" : (intensity > 0 ? "sand grain" : "smooth sand");
    color = intensity > 0.72 ? "#a99561" : "#c7a85a";
    size = 0.18 + intensity * 0.50;
  } else if (biome === "tundra") {
    intensity = markerSeed > 0.54 ? clamp(markerSeed * 0.58 + relief.slope * 0.42, 0, 1) : 0;
    type = intensity > 0.70 ? "frost stone" : (intensity > 0 ? "moss clump" : "scrub mat");
    color = intensity > 0.70 ? "#8c9691" : "#6a875f";
    size = 0.22 + intensity * 0.48;
  } else if (biome === "ice") {
    intensity = lod.micro < 0.28 || relief.slope > 0.16 ? clamp((1 - lod.micro) * 0.54 + relief.slope * 0.46, 0, 1) : 0;
    type = intensity > 0.72 ? "ice ridge" : (intensity > 0 ? "snow crust" : "smooth ice");
    color = intensity > 0.72 ? "#e8fbff" : "#b9dce8";
    size = 0.22 + intensity * 0.54;
  }

  return {
    type: type,
    intensity: intensity,
    color: color,
    size: clamp(size, 0, 1)
  };
};
