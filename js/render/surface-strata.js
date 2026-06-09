"use strict";
PS.render = PS.render || {};
PS.render.surfaceStrata = PS.render.surfaceStrata || {};

PS.render.surfaceStrata.getSwatchAccent = function (sample, baseColor, noise) {
  var detail = sample && sample.detail ? sample.detail : {};
  var strata = detail.materialStrata || {};
  var primary = strata.primary || "soil";
  var secondary = strata.secondary || "";
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var target = normalizedNoise > 0.52 ? "#8b8062" : "#302a22";

  if (primary === "water") {
    target = secondary === "shelf-sediment"
      ? (normalizedNoise > 0.52 ? "#87b8a8" : "#18394d")
      : (normalizedNoise > 0.52 ? "#5f8fb0" : "#05162d");
  } else if (primary === "sand" || primary === "sandy-soil") {
    target = secondary === "gravel"
      ? (normalizedNoise > 0.52 ? "#c8ad71" : "#675129")
      : (normalizedNoise > 0.52 ? "#d4bd79" : "#77602d");
  } else if (primary === "bedrock" || primary === "scree") {
    target = secondary === "mineral-vein"
      ? (normalizedNoise > 0.52 ? "#bbb6a2" : "#373933")
      : (normalizedNoise > 0.52 ? "#8f8e82" : "#272923");
  } else if (primary === "ice" || primary === "frost") {
    target = normalizedNoise > 0.52 ? "#f5fdff" : "#83b8cc";
  } else if (primary === "humus" || primary === "peat") {
    target = normalizedNoise > 0.52 ? "#566339" : "#1b2115";
  } else if (primary === "topsoil" || primary === "loam") {
    target = secondary === "root-mat"
      ? (normalizedNoise > 0.52 ? "#718046" : "#26321e")
      : (normalizedNoise > 0.52 ? "#756b4d" : "#2f2b20");
  }

  return blendHexColors(baseColor, target, clamp(0.16 + normalizedNoise * 0.18, 0.16, 0.38));
};

PS.render.surfaceStrata.getSwatchShape = function (strata, noise, index) {
  var primary = strata && strata.primary ? strata.primary : "soil";
  var secondary = strata && strata.secondary ? strata.secondary : "";
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var maxSize = Math.max(1, CONFIG.TILE_SIZE - 1);
  var shortSize = 1;
  var midSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.18 + normalizedNoise * 0.18)), 1, maxSize);
  var longSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.44 + normalizedNoise * 0.28)), 1, maxSize);

  if (primary === "water" || primary === "sand" || primary === "sandy-soil") {
    return {
      width: longSize,
      height: shortSize
    };
  }

  if (primary === "bedrock" || primary === "scree" || secondary === "mineral-vein") {
    return index % 2 === 0
      ? { width: shortSize, height: longSize }
      : { width: longSize, height: shortSize };
  }

  if (primary === "humus" || primary === "peat" || secondary === "root-mat" || secondary === "leaf-litter") {
    return {
      width: midSize,
      height: clamp(midSize + (index % 2), 1, maxSize)
    };
  }

  if (primary === "ice" || primary === "frost") {
    return {
      width: clamp(midSize + 1, 1, maxSize),
      height: shortSize
    };
  }

  return {
    width: midSize,
    height: midSize
  };
};

PS.render.surfaceStrata.getSwatchRotation = function (sample, strata, noise, index) {
  var detail = sample && sample.detail ? sample.detail : {};
  var primary = strata && strata.primary ? strata.primary : "soil";
  var base = Number.isFinite(Number(detail.aspect))
    ? (Number(detail.aspect) * Math.PI / 180)
    : 0;
  var jitter = (clamp(Number(noise) || 0, 0, 1) - 0.5) * Math.PI * 0.12;

  if (primary === "water" || primary === "sand" || primary === "sandy-soil" || primary === "ice" || primary === "frost") {
    return normalizePlanetLineAngleRadians(base + Math.PI * 0.5 + jitter);
  }

  if (primary === "bedrock" || primary === "scree") {
    return normalizePlanetLineAngleRadians(base + jitter + (index % 2) * Math.PI * 0.5);
  }

  return 0;
};

PS.render.surfaceStrata.getTintColor = function (primary, secondary, surface) {
  var normalizedPrimary = primary || "soil";
  var normalizedSecondary = secondary || "";

  if (normalizedPrimary === "water") {
    return normalizedSecondary === "shelf-sediment" ? "#5d8f86" : "#244a62";
  }

  if (normalizedPrimary === "sand" || normalizedPrimary === "sandy-soil") {
    return normalizedSecondary === "gravel" ? "#a88d57" : "#c2a763";
  }

  if (normalizedPrimary === "bedrock" || normalizedPrimary === "scree") {
    return normalizedSecondary === "mineral-vein" ? "#8e8a7b" : "#66675e";
  }

  if (normalizedPrimary === "ice" || normalizedPrimary === "frost") {
    return surface === "snow" ? "#edf8fb" : "#a9d4e1";
  }

  if (normalizedPrimary === "peat" || normalizedPrimary === "humus") {
    return "#3a4a2c";
  }

  if (normalizedPrimary === "topsoil" || normalizedPrimary === "loam") {
    return normalizedSecondary === "clay" ? "#706447" : "#4f5636";
  }

  return "#6c6552";
};

PS.render.surfaceStrata.getMaterial = function (latitude, longitude, biome, material, lod, relief) {
  var sampleMeters = Math.max(1, Number(lod && lod.sampleMeters) || 1);
  var surface = material && material.surface ? material.surface : "ground";
  var signals = material && material.signals ? material.signals : {};
  var meters = getSurfaceMeterCoordinate(latitude, longitude);
  var layerNoise = PS.render.surfaceNoise.getLayerNoise(meters, Math.max(1, sampleMeters * 7), 109);
  var grainNoise = PS.render.surfaceNoise.getPixelNoise(meters, Math.max(1, sampleMeters * 2), 127);
  var wetness = clamp(Number(signals.wetness) || 0, 0, 1);
  var dryness = clamp(Number(signals.dryness) || 0, 0, 1);
  var roughness = clamp(Number(signals.surfaceRoughness) || Number(lod && lod.roughness) || 0, 0, 1);
  var slope = clamp(Number(relief && relief.slope) || 0, 0, 1);
  var canopy = clamp(Number(signals.canopyDensity) || 0, 0, 1);
  var snow = clamp(Number(signals.snow) || 0, 0, 1);
  var shallowWater = clamp(Number(signals.shallowWater) || 0, 0, 1);
  var coast = clamp(Number(signals.coast) || 0, 0, 1);
  var primary = "loam";
  var secondary = layerNoise > 0.56 ? "clay" : "silt";
  var organicCover = clamp(canopy * 0.46 + wetness * 0.18 + (biome === "forest" ? 0.28 : 0) + (surface === "moss" ? 0.18 : 0), 0, 1);
  var rockExposure = clamp(roughness * 0.44 + slope * 0.36 + (Number(signals.ridge) || 0) * 0.24, 0, 1);
  var granularity = clamp(0.22 + roughness * 0.34 + dryness * 0.18 + grainNoise * 0.22, 0, 1);
  var depthMix = clamp(layerNoise * 0.64 + grainNoise * 0.36, 0, 1);

  if (surface === "open water" || surface === "deep water" || surface === "whitecap") {
    primary = "water";
    secondary = shallowWater > 0.36 || coast > 0.34 ? "shelf-sediment" : "basalt-silt";
    organicCover = 0;
    rockExposure = clamp(shallowWater * 0.22 + roughness * 0.18, 0, 0.42);
    granularity = clamp(0.10 + shallowWater * 0.30 + grainNoise * 0.18, 0, 0.48);
    wetness = 1;
  } else if (surface === "sand" || surface === "dune") {
    primary = "sand";
    secondary = rockExposure > 0.46 || layerNoise > 0.68 ? "gravel" : "silt";
    organicCover = clamp(organicCover * 0.22, 0, 0.24);
    granularity = clamp(0.54 + dryness * 0.22 + grainNoise * 0.20 + rockExposure * 0.10, 0, 1);
  } else if (surface === "rock" || surface === "stone" || surface === "ridge ice") {
    primary = surface === "ridge ice" ? "ice" : (rockExposure > 0.62 ? "bedrock" : "scree");
    secondary = surface === "ridge ice" ? "frost" : (layerNoise > 0.54 ? "mineral-vein" : "weathered-soil");
    organicCover = clamp(organicCover * 0.18, 0, 0.20);
    rockExposure = clamp(0.50 + rockExposure * 0.48, 0, 1);
    granularity = clamp(0.38 + roughness * 0.28 + grainNoise * 0.22, 0, 1);
  } else if (surface === "snow" || surface === "ice") {
    primary = surface === "snow" ? "frost" : "ice";
    secondary = snow > 0.66 ? "snowpack" : "permafrost";
    organicCover = 0;
    rockExposure = clamp(rockExposure * (surface === "snow" ? 0.18 : 0.36), 0, 0.42);
    granularity = clamp(0.12 + roughness * 0.16 + grainNoise * 0.18, 0, 0.48);
  } else if (surface === "dense canopy" || surface === "woodland") {
    primary = "humus";
    secondary = canopy > 0.62 ? "leaf-litter" : "topsoil";
    organicCover = clamp(0.46 + canopy * 0.42 + wetness * 0.08, 0, 1);
    rockExposure = clamp(rockExposure * 0.38, 0, 0.46);
    granularity = clamp(0.18 + roughness * 0.18 + grainNoise * 0.18, 0, 0.62);
  } else if (surface === "moss" || surface === "scrub") {
    primary = biome === "tundra" ? "peat" : "topsoil";
    secondary = biome === "tundra" || snow > 0.28 ? "permafrost" : "root-mat";
    organicCover = clamp(0.30 + wetness * 0.26 + canopy * 0.18, 0, 0.82);
    rockExposure = clamp(rockExposure * 0.62, 0, 0.72);
  } else if (surface === "grass" || surface === "brush" || surface === "meadow" || surface === "clearing") {
    primary = wetness > 0.62 ? "loam" : (dryness > 0.58 ? "sandy-soil" : "topsoil");
    secondary = wetness > 0.62 ? "clay" : (rockExposure > 0.42 ? "gravel" : "root-mat");
    organicCover = clamp(0.24 + wetness * 0.24 + canopy * 0.16 + (surface === "meadow" ? 0.18 : 0), 0, 0.86);
    rockExposure = clamp(rockExposure * (surface === "brush" ? 0.82 : 0.56), 0, 0.76);
  }

  return {
    primary: primary,
    secondary: secondary,
    wetness: wetness,
    granularity: granularity,
    organicCover: organicCover,
    rockExposure: rockExposure,
    depthMix: depthMix,
    tintColor: PS.render.surfaceStrata.getTintColor(primary, secondary, surface)
  };
};

PS.render.surfaceStrata.getSwatches = function (sample, baseColor) {
  var detail = sample && sample.detail ? sample.detail : {};
  var strata = detail.materialStrata || null;
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var seedEast = Math.round(Number(sample && sample.surfaceSampleX) || 0);
  var seedNorth = Math.round(Number(sample && sample.surfaceSampleY) || 0);
  var swatches = [];
  var strength;
  var count;
  var typeSeed;

  if (!strata || sampleMeters > 5 || CONFIG.TILE_SIZE < 4) {
    return swatches;
  }

  strength = clamp(
    0.12 +
      (Number(strata.granularity) || 0) * 0.24 +
      (Number(strata.organicCover) || 0) * 0.18 +
      (Number(strata.rockExposure) || 0) * 0.22 +
      (Number(strata.wetness) || 0) * 0.06,
    0,
    0.78
  );
  count = strength <= 0.14 ? 0 : clamp(Math.round(1 + strength * (sampleMeters <= 1 ? 6 : 4)), 1, sampleMeters <= 1 ? 7 : 5);

  if (count <= 0) {
    return swatches;
  }

  typeSeed = String(strata.primary || "").split("").reduce(function(total, character) {
    return total + character.charCodeAt(0);
  }, 0) + String(strata.secondary || "").split("").reduce(function(total, character) {
    return total + character.charCodeAt(0);
  }, 0);

  for (var i = 0; i < count; i++) {
    var noise = getDeterministicUnitNoise(seedEast + i * 41, seedNorth - i * 43, getPlanetVisualSeedOffset() + typeSeed + 6101 + i * 29);
    var shape = PS.render.surfaceStrata.getSwatchShape(strata, noise, i);
    var maxX = Math.max(1, CONFIG.TILE_SIZE - shape.width + 1);
    var maxY = Math.max(1, CONFIG.TILE_SIZE - shape.height + 1);

    if (i > 0 && noise > strength + 0.46) {
      continue;
    }

    swatches.push({
      x: Math.floor(getDeterministicUnitNoise(seedEast - i * 17, seedNorth + i * 19, getPlanetVisualSeedOffset() + typeSeed + 6221 + i) * maxX),
      y: Math.floor(getDeterministicUnitNoise(seedEast + i * 23, seedNorth - i * 29, getPlanetVisualSeedOffset() + typeSeed + 6359 + i) * maxY),
      width: shape.width,
      height: shape.height,
      size: Math.max(shape.width, shape.height),
      color: PS.render.surfaceStrata.getSwatchAccent(sample, baseColor, noise),
      alpha: clamp(0.08 + strength * 0.20 + noise * 0.10, 0.10, 0.42),
      rotationRadians: PS.render.surfaceStrata.getSwatchRotation(sample, strata, noise, i),
      strataPrimary: strata.primary,
      strataSecondary: strata.secondary
    });
  }

  return swatches;
};
