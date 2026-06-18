"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getDeterministicUnitNoise } from "./planet-surface.js";
import { createDeterministicSwatches } from "./surface-base.js";
import { blendHexColors, getPlanetVisualSeedOffset } from "./terrain.js";

PS.render = PS.render || {};
PS.render.surfaceTransitions = PS.render.surfaceTransitions || {};

PS.render.surfaceTransitions.getNeighborBiome = function (sample) {
  var tileBlend = sample && sample.tileBlend ? sample.tileBlend : null;
  var weights = tileBlend && tileBlend.biomeWeights ? tileBlend.biomeWeights : {};
  var sampleBiome = sample && sample.biome ? sample.biome : "unknown";
  var bestBiome = "";
  var bestWeight = 0;

  Object.keys(weights).forEach(function(biome) {
    var weight = clamp(Number(weights[biome]) || 0, 0, 1);

    if (biome !== sampleBiome && weight > bestWeight) {
      bestBiome = biome;
      bestWeight = weight;
    }
  });

  return {
    biome: bestBiome,
    weight: bestWeight
  };
};

PS.render.surfaceTransitions.getTransitionStrength = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var neighbor = PS.render.surfaceTransitions.getNeighborBiome(sample);
  var transitionStrength = PS.render.surfaceColor.getBiomeTransitionStrength(sample);

  if (!neighbor.biome || sampleMeters > 25 || CONFIG.TILE_SIZE < 4) {
    return 0;
  }

  return clamp(transitionStrength * 0.74 + neighbor.weight * 0.26, 0, 1);
};

PS.render.surfaceTransitions.getTransitionType = function (sample, neighborBiome) {
  var biome = sample && sample.biome ? sample.biome : "unknown";
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = detail.surface || "ground";

  if (biome === "ocean" || neighborBiome === "ocean" || surface === "open water" || surface === "deep water" || surface === "whitecap") {
    return "coast-dither";
  }

  if (biome === "ice" || neighborBiome === "ice" || surface === "snow" || surface === "ice" || surface === "ridge ice") {
    return "frost-dither";
  }

  if (biome === "desert" || neighborBiome === "desert" || surface === "sand" || surface === "dune") {
    return "dry-edge";
  }

  if (biome === "forest" || neighborBiome === "forest" || surface === "dense canopy" || surface === "woodland") {
    return "canopy-edge";
  }

  if (biome === "tundra" || neighborBiome === "tundra" || surface === "moss" || surface === "scrub") {
    return "scrub-edge";
  }

  return "grass-edge";
};

PS.render.surfaceTransitions.getTransitionColor = function (sample, baseColor, neighborBiome, transitionType, noise) {
  var neighborColor = getPlanetBiomeColor(neighborBiome);
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var amount = clamp(0.22 + normalizedNoise * 0.20, 0.22, 0.46);
  var color = blendHexColors(baseColor, neighborColor, amount);

  if (transitionType === "coast-dither") {
    color = blendHexColors(color, normalizedNoise > 0.54 ? "#c8efe9" : "#0b4b66", 0.18);
  } else if (transitionType === "frost-dither") {
    color = blendHexColors(color, normalizedNoise > 0.52 ? "#f4fdff" : "#8bbfd1", 0.20);
  } else if (transitionType === "dry-edge") {
    color = blendHexColors(color, normalizedNoise > 0.52 ? "#d5b970" : "#655025", 0.18);
  } else if (transitionType === "canopy-edge") {
    color = blendHexColors(color, normalizedNoise > 0.52 ? "#204f2c" : "#081b10", 0.18);
  } else if (transitionType === "scrub-edge") {
    color = blendHexColors(color, normalizedNoise > 0.52 ? "#7d8c65" : "#2a3529", 0.16);
  }

  return color;
};

PS.render.surfaceTransitions.getTransitionShape = function (transitionType, noise, index) {
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var maxSize = Math.max(1, CONFIG.TILE_SIZE - 1);
  var fleck = clamp(Math.round(CONFIG.TILE_SIZE * (0.14 + normalizedNoise * 0.14)), 1, maxSize);
  var run = clamp(Math.round(CONFIG.TILE_SIZE * (0.32 + normalizedNoise * 0.28)), 1, maxSize);

  if (transitionType === "coast-dither" || transitionType === "dry-edge" || transitionType === "frost-dither") {
    return index % 2 === 0
      ? { width: run, height: 1 }
      : { width: fleck, height: fleck };
  }

  if (transitionType === "canopy-edge" || transitionType === "scrub-edge") {
    return {
      width: fleck,
      height: clamp(fleck + index % 2, 1, maxSize)
    };
  }

  return { width: fleck, height: fleck };
};

PS.render.surfaceTransitions.getSwatches = function (sample, baseColor) {
  var neighbor = PS.render.surfaceTransitions.getNeighborBiome(sample);
  var strength = PS.render.surfaceTransitions.getTransitionStrength(sample);
  var detail = sample && sample.detail ? sample.detail : {};
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var count = strength <= 0.08 ? 0 : clamp(Math.round(1 + strength * (sampleMeters <= 5 ? 7 : 4)), 1, sampleMeters <= 5 ? 8 : 5);
  var transitionType = PS.render.surfaceTransitions.getTransitionType(sample, neighbor.biome);

  if (count <= 0) {
    return [];
  }

  return createDeterministicSwatches({
    sample: sample,
    count: count,
    noiseBase: 9101,
    noiseEastStep: 71,
    noiseNorthStep: -73,
    noiseSeedStep: 41,
    xBase: 9203,
    xEastStep: -31,
    xNorthStep: 37,
    yBase: 9311,
    yEastStep: 43,
    yNorthStep: -47,
    shouldSkip: function(noise) {
      return noise > strength + 0.54;
    },
    getShape: function(noise, index) {
      return PS.render.surfaceTransitions.getTransitionShape(transitionType, noise, index);
    },
    getColor: function(noise) {
      return PS.render.surfaceTransitions.getTransitionColor(sample, baseColor, neighbor.biome, transitionType, noise);
    },
    getAlpha: function(noise) {
      return clamp(0.10 + strength * 0.28 + noise * 0.08, 0.10, 0.48);
    },
    getExtraProperties: function() {
      return {
        transitionType: transitionType,
        transitionBiome: neighbor.biome
      };
    }
  });
};
