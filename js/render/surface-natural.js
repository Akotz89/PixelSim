"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getDeterministicUnitNoise, getSurfaceMeterCoordinate, normalizePlanetLineAngleRadians } from "./planet-surface.js";
import { createDeterministicSwatches, getStringSeed } from "./surface-base.js";
import { blendHexColors, getPlanetVisualSeedOffset } from "./terrain.js";

PS.render = PS.render || {};
PS.render.surfaceNatural = PS.render.surfaceNatural || {};

PS.render.surfaceNatural.getElementShape = function (elementType, noise, index) {
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var maxSize = Math.max(1, CONFIG.TILE_SIZE - 1);
  var shortSize = 1;
  var midSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.20 + normalizedNoise * 0.20)), 1, maxSize);
  var longSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.44 + normalizedNoise * 0.28)), 1, maxSize);

  if (elementType === "water-ripple" || elementType === "sand-ripple" || elementType === "ice-crack") {
    return {
      width: longSize,
      height: shortSize
    };
  }

  if (elementType === "grass-blade") {
    return {
      width: shortSize,
      height: clamp(midSize + (index % 2), 1, maxSize)
    };
  }

  if (elementType === "leaf-litter" || elementType === "snow-crust") {
    return {
      width: clamp(midSize + 1, 1, maxSize),
      height: shortSize
    };
  }

  if (elementType === "stone-chip") {
    return index % 2 === 0
      ? { width: midSize, height: shortSize }
      : { width: shortSize, height: midSize };
  }

  return {
    width: midSize,
    height: midSize
  };
};

PS.render.surfaceNatural.getElementRotation = function (element, elementType, noise, index) {
  var base = Number.isFinite(Number(element && element.orientationRadians))
    ? Number(element.orientationRadians)
    : 0;
  var jitter = (clamp(Number(noise) || 0, 0, 1) - 0.5) * Math.PI * 0.18;

  if (elementType === "grass-blade") {
    jitter += (index % 2 === 0 ? -1 : 1) * Math.PI * 0.035;
  } else if (elementType === "stone-chip" || elementType === "pebble") {
    jitter += (index % 3 - 1) * Math.PI * 0.08;
  } else if (elementType === "leaf-litter" || elementType === "snow-crust") {
    jitter += Math.PI * 0.5;
  }

  return normalizePlanetLineAngleRadians(base + jitter);
};

PS.render.surfaceNatural.getElementColor = function (type) {
  switch (type) {
    case "water-ripple":
      return "#9bd8e7";
    case "grass-blade":
      return "#8fcf71";
    case "leaf-litter":
      return "#7a8f4d";
    case "pebble":
      return "#a9a18d";
    case "stone-chip":
      return "#c1b89f";
    case "sand-ripple":
      return "#d7bd78";
    case "snow-crust":
      return "#f6fdff";
    case "ice-crack":
      return "#8fc6dc";
    case "moss-clump":
      return "#78a66a";
    default:
      return "#d9e7ff";
  }
};

PS.render.surfaceNatural.getElementType = function (surface, biome, signals, relief) {
  var normalizedSurface = surface || "ground";
  var normalizedBiome = biome || "unknown";
  var surfaceRoughness = clamp(Number(signals && signals.surfaceRoughness) || 0, 0, 1);
  var wetness = clamp(Number(signals && signals.wetness) || 0, 0, 1);
  var slope = clamp(Number(relief && relief.slope) || 0, 0, 1);

  if (normalizedSurface === "open water" || normalizedSurface === "deep water" || normalizedSurface === "whitecap") {
    return "water-ripple";
  }

  if (normalizedSurface === "sand" || normalizedSurface === "dune") {
    return "sand-ripple";
  }

  if (normalizedSurface === "rock" || normalizedSurface === "stone") {
    return surfaceRoughness > 0.58 || slope > 0.20 ? "stone-chip" : "pebble";
  }

  if (normalizedSurface === "snow") {
    return "snow-crust";
  }

  if (normalizedSurface === "ice" || normalizedSurface === "ridge ice") {
    return "ice-crack";
  }

  if (normalizedSurface === "dense canopy" || normalizedSurface === "woodland") {
    return "leaf-litter";
  }

  if (normalizedSurface === "moss" || normalizedSurface === "scrub") {
    return "moss-clump";
  }

  if (normalizedSurface === "grass" || normalizedSurface === "brush" || normalizedSurface === "meadow" || normalizedSurface === "clearing") {
    return wetness > 0.56 && normalizedBiome !== "desert" ? "grass-blade" : (surfaceRoughness > 0.58 ? "pebble" : "grass-blade");
  }

  if (normalizedBiome === "desert") {
    return "sand-ripple";
  }

  return "pebble";
};

PS.render.surfaceNatural.getElement = function (latitude, longitude, biome, material, lod, relief) {
  var sampleMeters = Math.max(1, Number(lod && lod.sampleMeters) || 1);
  var surface = material && material.surface ? material.surface : "ground";
  var signals = material && material.signals ? material.signals : {};
  var meters = getSurfaceMeterCoordinate(latitude, longitude);
  var elementNoise = PS.render.surfaceNoise.getLayerNoise(meters, Math.max(1, sampleMeters), 89);
  var detailNoise = PS.render.surfaceNoise.getPixelNoise(meters, Math.max(1, sampleMeters), 97);
  var type = PS.render.surfaceNatural.getElementType(surface, biome, signals, relief);
  var density = 0;
  var roughness = clamp(Number(signals.surfaceRoughness) || Number(lod && lod.roughness) || 0, 0, 1);
  var wetness = clamp(Number(signals.wetness) || 0, 0, 1);
  var slope = clamp(Number(relief && relief.slope) || 0, 0, 1);

  if (sampleMeters > 5) {
    return { type: "none", density: 0, sizeMeters: 0, orientationRadians: 0, color: "#000000", alpha: 0 };
  }

  density = clamp(0.18 + elementNoise * 0.22 + detailNoise * 0.16 + roughness * 0.18 + wetness * 0.10 + slope * 0.10, 0, 0.86);

  if (type === "water-ripple") {
    density = clamp(density + (Number(signals.chop) || 0) * 0.18, 0, 0.88);
  } else if (type === "sand-ripple") {
    density = clamp(density + (Number(signals.dryness) || 0) * 0.14, 0, 0.88);
  } else if (type === "leaf-litter") {
    density = clamp(density + (Number(signals.canopyDensity) || 0) * 0.16, 0, 0.88);
  } else if (type === "snow-crust" || type === "ice-crack") {
    density = clamp(density + (Number(signals.snow) || 0) * 0.08, 0, 0.82);
  }

  return {
    type: type,
    density: density,
    sizeMeters: clamp(0.12 + density * 0.62 + detailNoise * 0.18, 0.08, sampleMeters),
    orientationRadians: normalizePlanetLineAngleRadians(Number.isFinite(Number(relief && relief.aspect)) ? (Number(relief.aspect) * Math.PI / 180) : elementNoise * Math.PI),
    color: PS.render.surfaceNatural.getElementColor(type),
    alpha: clamp(0.12 + density * 0.28, 0.12, 0.42)
  };
};

PS.render.surfaceNatural.getElementSwatches = function (sample, baseColor) {
  var detail = sample && sample.detail ? sample.detail : {};
  var element = detail.naturalElement || null;
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var density = clamp(Number(element && element.density) || 0, 0, 1);
  var type = element && element.type ? element.type : "none";
  var typeSeed = getStringSeed(type);
  var count = density <= 0.18 ? 0 : clamp(Math.round(1 + density * 5), 1, 6);

  if (!element || type === "none" || sampleMeters > 5 || CONFIG.TILE_SIZE < 4 || count <= 0) {
    return [];
  }

  return createDeterministicSwatches({
    sample: sample,
    count: count,
    seedExtra: typeSeed,
    noiseBase: 5303,
    noiseEastStep: 29,
    noiseNorthStep: -31,
    noiseSeedStep: 17,
    xBase: 5417,
    xEastStep: -13,
    xNorthStep: 11,
    yBase: 5521,
    yEastStep: 7,
    yNorthStep: -19,
    shouldSkip: function(noise) {
      return noise > density + 0.42;
    },
    getShape: function(noise, index) {
      return PS.render.surfaceNatural.getElementShape(type, noise, index);
    },
    getColor: function(noise) {
      return blendHexColors(baseColor, element.color || "#d9e7ff", clamp(0.18 + density * 0.28 + noise * 0.10, 0.18, 0.54));
    },
    getAlpha: function(noise) {
      return clamp((Number(element.alpha) || 0.18) + noise * 0.08, 0.12, 0.50);
    },
    getRotationRadians: function(noise, index) {
      return PS.render.surfaceNatural.getElementRotation(element, type, noise, index);
    },
    getExtraProperties: function() {
      return { elementType: type };
    }
  });
};

PS.render.surfaceNatural.getLandmarkType = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = detail.surface || "ground";
  var biome = sample && sample.biome ? sample.biome : "unknown";
  var signals = detail.materialSignals || {};

  if (surface === "open water" || surface === "deep water" || surface === "whitecap") {
    return "water-band";
  }

  if (surface === "dense canopy" || surface === "woodland") {
    return "canopy-crown";
  }

  if (surface === "rock" || surface === "stone" || surface === "ridge ice") {
    return "stone-ridge";
  }

  if (surface === "sand" || surface === "dune" || biome === "desert") {
    return "dune-line";
  }

  if (surface === "snow" || surface === "ice") {
    return "ice-facet";
  }

  if (surface === "moss" || surface === "meadow" || Number(signals.wetness) > 0.58) {
    return "wet-pocket";
  }

  return "grass-clump";
};

PS.render.surfaceNatural.getLandmarkColor = function (landmarkType, baseColor, noise) {
  var amount = clamp(0.20 + (Number(noise) || 0) * 0.20, 0.20, 0.44);

  if (landmarkType === "water-band") {
    return blendHexColors(baseColor, "#9bd8e7", amount);
  }

  if (landmarkType === "canopy-crown") {
    return blendHexColors(baseColor, "#1f6a38", amount);
  }

  if (landmarkType === "dune-line") {
    return blendHexColors(baseColor, "#d9bd73", amount);
  }

  if (landmarkType === "stone-ridge") {
    return blendHexColors(baseColor, "#bdb79e", amount);
  }

  if (landmarkType === "ice-facet") {
    return blendHexColors(baseColor, "#f4fdff", amount);
  }

  if (landmarkType === "wet-pocket") {
    return blendHexColors(baseColor, "#72b887", amount);
  }

  return blendHexColors(baseColor, "#92bd5d", amount);
};

PS.render.surfaceNatural.getLandmarkShape = function (landmarkType, noise) {
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var maxSize = Math.max(1, CONFIG.TILE_SIZE - 1);
  var wide = clamp(Math.round(CONFIG.TILE_SIZE * (0.42 + normalizedNoise * 0.22)), 1, maxSize);
  var mid = clamp(Math.round(CONFIG.TILE_SIZE * (0.24 + normalizedNoise * 0.18)), 1, maxSize);

  if (landmarkType === "water-band" || landmarkType === "dune-line") {
    return { width: wide, height: 1 };
  }

  if (landmarkType === "stone-ridge" || landmarkType === "ice-facet") {
    return normalizedNoise > 0.5 ? { width: wide, height: 1 } : { width: 1, height: wide };
  }

  return { width: mid, height: mid };
};

PS.render.surfaceNatural.getLandmarkSwatches = function (sample, baseColor) {
  var detail = sample && sample.detail ? sample.detail : {};
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var landmarkType = PS.render.surfaceNatural.getLandmarkType(sample);
  var strength = clamp(
    0.22 +
      getPlanetSurfaceBiomeTransitionStrength(sample) * 0.24 +
      (Number(detail.roughness) || 0) * 0.12 +
      (Number(detail.slope) || 0) * 0.10 +
      (detail.groundFeature ? clamp(Number(detail.groundFeature.influence) || 0, 0, 1) * 0.14 : 0),
    0,
    0.74
  );
  var count = sampleMeters <= 5 ? 3 : (sampleMeters <= 25 ? 2 : 0);

  if (count <= 0 || CONFIG.TILE_SIZE < 4) {
    return [];
  }

  return createDeterministicSwatches({
    sample: sample,
    count: count,
    noiseBase: 6101,
    noiseEastStep: 37,
    noiseNorthStep: -41,
    noiseSeedStep: 23,
    xBase: 6203,
    xEastStep: -11,
    xNorthStep: 13,
    yBase: 6311,
    yEastStep: 17,
    yNorthStep: -19,
    getShape: function(noise) {
      return PS.render.surfaceNatural.getLandmarkShape(landmarkType, noise);
    },
    getColor: function(noise) {
      return PS.render.surfaceNatural.getLandmarkColor(landmarkType, baseColor, noise);
    },
    getAlpha: function(noise) {
      return clamp(0.16 + strength * 0.24 + noise * 0.08, 0.16, 0.48);
    },
    getExtraProperties: function() {
      return { landmarkType: landmarkType };
    }
  });
};
