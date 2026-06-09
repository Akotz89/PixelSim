"use strict";
PS.render = PS.render || {};
PS.render.surfaceTexture = PS.render.surfaceTexture || {};

PS.render.surfaceTexture.getMicrotextureAccent = function (sample, baseColor, amount) {
  var detail = sample && sample.detail ? sample.detail : {};
  var biome = sample && sample.biome ? sample.biome : "unknown";
  var surface = detail.surface || "ground";
  var normalizedAmount = clamp(Number(amount) || 0, 0, 1);
  var accent = "#ffffff";

  if (biome === "ocean" || surface === "open water" || surface === "deep water" || surface === "whitecap") {
    accent = surface === "whitecap" ? "#e9fbff" : "#86c8df";
  } else if (surface === "dense canopy" || surface === "woodland") {
    accent = normalizedAmount > 0.58 ? "#1b5630" : "#071f12";
  } else if (surface === "grass" || surface === "brush" || surface === "meadow" || surface === "clearing") {
    accent = normalizedAmount > 0.55 ? "#80a84b" : "#244c28";
  } else if (surface === "rock" || surface === "stone") {
    accent = normalizedAmount > 0.50 ? "#9b998a" : "#343632";
  } else if (surface === "sand" || surface === "dune") {
    accent = normalizedAmount > 0.50 ? "#d0b36c" : "#6a572a";
  } else if (surface === "snow" || surface === "ice" || surface === "ridge ice") {
    accent = normalizedAmount > 0.50 ? "#f5fdff" : "#8bbfd1";
  } else if (surface === "scrub" || surface === "moss") {
    accent = normalizedAmount > 0.50 ? "#708764" : "#26352c";
  } else {
    accent = normalizedAmount > 0.50 ? "#d7e4d8" : "#1f2b24";
  }

  return blendHexColors(baseColor, accent, clamp(0.14 + normalizedAmount * 0.22, 0, 0.42));
};

PS.render.surfaceTexture.getTextureStrength = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var featureRelief = detail.featureRelief || {};
  var groundFeature = detail.groundFeature || null;
  var surface = detail.surface || "ground";
  var closeScaleBoost = sampleMeters <= 5 ? 0.24 : sampleMeters <= 25 ? 0.12 : 0;
  var calmSurfacePenalty = surface === "deep water" || surface === "snow" || surface === "ice" ? 0.06 : 0;

  return clamp(
    0.12 +
      (Number(detail.roughness) || 0) * 0.28 +
      (Number(detail.slope) || 0) * 0.18 +
      (Number(featureRelief.roughnessBoost) || 0) * 0.18 +
      (groundFeature ? clamp(Number(groundFeature.influence) || 0, 0, 1) * 0.10 : 0) +
      closeScaleBoost -
      calmSurfacePenalty,
    0,
    0.74
  );
};

PS.render.surfaceTexture.getTextureSwatchCount = function (sample, strength) {
  var detail = sample && sample.detail ? sample.detail : {};
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var normalizedStrength = clamp(Number(strength) || 0, 0, 1);

  if (sampleMeters > 25 || CONFIG.TILE_SIZE < 4 || normalizedStrength <= 0.14) {
    return 0;
  }

  return clamp(
    Math.round((sampleMeters <= 5 ? 4 : 2) + normalizedStrength * (sampleMeters <= 5 ? 5 : 3)),
    1,
    sampleMeters <= 5 ? 9 : 5
  );
};

PS.render.surfaceTexture.getTextureSwatchShape = function (sample, noise, index) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = detail.surface || "ground";
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var maxSize = Math.max(1, CONFIG.TILE_SIZE - 1);
  var smallSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.16 + normalizedNoise * 0.20)), 1, maxSize);
  var wideSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.34 + normalizedNoise * 0.30)), 1, maxSize);
  var thinSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.14 + normalizedNoise * 0.12)), 1, maxSize);

  if (surface === "open water" || surface === "deep water" || surface === "whitecap") {
    return {
      width: wideSize,
      height: thinSize
    };
  }

  if (surface === "grass" || surface === "brush" || surface === "meadow" || surface === "clearing") {
    return {
      width: index % 2 === 0 ? smallSize : clamp(smallSize + 1, 1, maxSize),
      height: smallSize
    };
  }

  if (surface === "rock" || surface === "stone" || surface === "ridge ice") {
    return {
      width: clamp(smallSize + 1, 1, maxSize),
      height: clamp(smallSize + (index % 2), 1, maxSize)
    };
  }

  if (surface === "sand" || surface === "dune") {
    return {
      width: wideSize,
      height: 1
    };
  }

  return {
    width: smallSize,
    height: smallSize
  };
};

PS.render.surfaceTexture.getMicrotextureSwatches = function (sample, baseColor) {
  var strength = PS.render.surfaceTexture.getTextureStrength(sample);
  var swatchCount = PS.render.surfaceTexture.getTextureSwatchCount(sample, strength);
  var swatches = [];
  var seedEast = Math.round(Number(sample && sample.surfaceSampleX) || 0);
  var seedNorth = Math.round(Number(sample && sample.surfaceSampleY) || 0);

  if (swatchCount <= 0) {
    return swatches;
  }

  for (var i = 0; i < swatchCount; i++) {
    var noise = getDeterministicUnitNoise(seedEast + i * 13, seedNorth - i * 17, getPlanetVisualSeedOffset() + i * 29 + swatchCount);
    var shape;
    var maxX;
    var maxY;

    if (i > 0 && noise > strength + 0.38) {
      continue;
    }

    shape = PS.render.surfaceTexture.getTextureSwatchShape(sample, noise, i);
    maxX = Math.max(1, CONFIG.TILE_SIZE - shape.width + 1);
    maxY = Math.max(1, CONFIG.TILE_SIZE - shape.height + 1);

    swatches.push({
      x: Math.floor(getDeterministicUnitNoise(seedEast, seedNorth, 701 + i) * maxX),
      y: Math.floor(getDeterministicUnitNoise(seedEast, seedNorth, 811 + i) * maxY),
      size: Math.max(shape.width, shape.height),
      width: shape.width,
      height: shape.height,
      color: PS.render.surfaceTexture.getMicrotextureAccent(sample, baseColor, noise),
      alpha: clamp(0.14 + strength * 0.42 + noise * 0.16, 0.16, 0.68)
    });
  }

  return swatches;
};

PS.render.surfaceTexture.getFinePixelStrength = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var featureRelief = detail.featureRelief || {};
  var groundFeature = detail.groundFeature || null;
  var surface = detail.surface || "ground";
  var calmPenalty = surface === "deep water" || surface === "snow" || surface === "ice" ? 0.07 : 0;

  if (sampleMeters > 5 || CONFIG.TILE_SIZE < 4) {
    return 0;
  }

  return clamp(
    0.18 +
      (sampleMeters <= 1 ? 0.16 : 0.06) +
      (Number(detail.roughness) || 0) * 0.20 +
      (Number(detail.slope) || 0) * 0.18 +
      (Number(featureRelief.roughnessBoost) || 0) * 0.16 +
      (groundFeature ? clamp(Number(groundFeature.influence) || 0, 0, 1) * 0.08 : 0) -
      calmPenalty,
    0,
    0.78
  );
};

PS.render.surfaceTexture.getFinePixelCount = function (sample, strength) {
  var detail = sample && sample.detail ? sample.detail : {};
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var normalizedStrength = clamp(Number(strength) || 0, 0, 1);
  var baseCount = sampleMeters <= 1 ? 5 : 3;

  if (sampleMeters > 5 || CONFIG.TILE_SIZE < 4 || normalizedStrength <= 0.12) {
    return 0;
  }

  return clamp(Math.round(baseCount + normalizedStrength * (sampleMeters <= 1 ? 6 : 4)), 1, sampleMeters <= 1 ? 11 : 7);
};

PS.render.surfaceTexture.getFinePixelAccent = function (sample, baseColor, noise) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = detail.surface || "ground";
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var accent = normalizedNoise > 0.52 ? shadeHexColor(baseColor, 0.62 + normalizedNoise * 0.16) : shadeHexColor(baseColor, 0.32 + normalizedNoise * 0.18);

  if (surface === "open water" || surface === "deep water" || surface === "whitecap") {
    accent = normalizedNoise > 0.56 ? blendHexColors(baseColor, "#9ad9eb", 0.26) : blendHexColors(baseColor, "#03142b", 0.20);
  } else if (surface === "dense canopy" || surface === "woodland") {
    accent = normalizedNoise > 0.54 ? blendHexColors(baseColor, "#2a6a3b", 0.22) : blendHexColors(baseColor, "#04160c", 0.24);
  } else if (surface === "grass" || surface === "brush" || surface === "meadow" || surface === "clearing") {
    accent = normalizedNoise > 0.54 ? blendHexColors(baseColor, "#91b85a", 0.24) : blendHexColors(baseColor, "#14331f", 0.22);
  } else if (surface === "rock" || surface === "stone") {
    accent = normalizedNoise > 0.50 ? blendHexColors(baseColor, "#aaa898", 0.24) : blendHexColors(baseColor, "#262824", 0.22);
  } else if (surface === "sand" || surface === "dune") {
    accent = normalizedNoise > 0.50 ? blendHexColors(baseColor, "#d7bd78", 0.25) : blendHexColors(baseColor, "#665226", 0.18);
  } else if (surface === "snow" || surface === "ice" || surface === "ridge ice") {
    accent = normalizedNoise > 0.50 ? blendHexColors(baseColor, "#ffffff", 0.18) : blendHexColors(baseColor, "#8bbfd1", 0.18);
  }

  return accent;
};

PS.render.surfaceTexture.getFinePixelSwatches = function (sample, baseColor) {
  var strength = PS.render.surfaceTexture.getFinePixelStrength(sample);
  var swatchCount = PS.render.surfaceTexture.getFinePixelCount(sample, strength);
  var swatches = [];
  var seedEast = Math.round(Number(sample && sample.surfaceSampleX) || 0);
  var seedNorth = Math.round(Number(sample && sample.surfaceSampleY) || 0);
  var cellMax = Math.max(1, CONFIG.TILE_SIZE - 1);

  if (swatchCount <= 0) {
    return swatches;
  }

  for (var i = 0; i < swatchCount; i++) {
    var noise = getDeterministicUnitNoise(seedEast + i * 19, seedNorth - i * 23, getPlanetVisualSeedOffset() + 1201 + i * 31);
    var wideNoise = getDeterministicUnitNoise(seedEast - i * 7, seedNorth + i * 11, getPlanetVisualSeedOffset() + 1439 + i * 17);
    var width = wideNoise > 0.82 && CONFIG.TILE_SIZE >= 5 ? 2 : 1;
    var height = wideNoise < 0.18 && CONFIG.TILE_SIZE >= 5 ? 2 : 1;

    if (i > 0 && noise > strength + 0.42) {
      continue;
    }

    swatches.push({
      x: Math.floor(getDeterministicUnitNoise(seedEast, seedNorth, 1601 + i * 13) * Math.max(1, CONFIG.TILE_SIZE - width + 1)),
      y: Math.floor(getDeterministicUnitNoise(seedEast, seedNorth, 1741 + i * 17) * Math.max(1, CONFIG.TILE_SIZE - height + 1)),
      width: clamp(width, 1, cellMax),
      height: clamp(height, 1, cellMax),
      size: Math.max(width, height),
      color: PS.render.surfaceTexture.getFinePixelAccent(sample, baseColor, noise),
      alpha: clamp(0.10 + strength * 0.24 + noise * 0.12, 0.12, 0.46)
    });
  }

  return swatches;
};

PS.render.surfaceTexture.getSilhouetteAccent = function (sample, baseColor, noise) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = detail.surface || "ground";
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var target = normalizedNoise > 0.52 ? "#dfeadf" : "#101713";

  if (surface === "open water" || surface === "deep water" || surface === "whitecap") {
    target = normalizedNoise > 0.52 ? "#8bd4e8" : "#021124";
  } else if (surface === "dense canopy" || surface === "woodland") {
    target = normalizedNoise > 0.52 ? "#2b6a38" : "#03140a";
  } else if (surface === "grass" || surface === "brush" || surface === "meadow" || surface === "clearing") {
    target = normalizedNoise > 0.52 ? "#83ad4e" : "#102819";
  } else if (surface === "rock" || surface === "stone") {
    target = normalizedNoise > 0.52 ? "#a9a592" : "#252722";
  } else if (surface === "sand" || surface === "dune") {
    target = normalizedNoise > 0.52 ? "#d2b66f" : "#5e4b22";
  } else if (surface === "snow" || surface === "ice" || surface === "ridge ice") {
    target = normalizedNoise > 0.52 ? "#ffffff" : "#88b9cb";
  } else if (surface === "scrub" || surface === "moss") {
    target = normalizedNoise > 0.52 ? "#738b66" : "#253428";
  }

  return blendHexColors(baseColor, target, clamp(0.16 + normalizedNoise * 0.24, 0.16, 0.46));
};

PS.render.surfaceTexture.getSilhouetteStrength = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var featureInfluence = detail.groundFeature ? clamp(Number(detail.groundFeature.influence) || 0, 0, 1) : 0;
  var featureRelief = detail.featureRelief || {};
  var surface = detail.surface || "ground";
  var calmPenalty = surface === "deep water" || surface === "snow" || surface === "ice" ? 0.10 : 0;

  if (sampleMeters > 5 || CONFIG.TILE_SIZE < 4) {
    return 0;
  }

  return clamp(
    0.10 +
      (sampleMeters <= 1 ? 0.12 : 0.05) +
      (Number(detail.roughness) || 0) * 0.16 +
      (Number(detail.slope) || 0) * 0.12 +
      getPlanetSurfaceBiomeTransitionStrength(sample) * 0.16 +
      featureInfluence * 0.10 +
      (Number(featureRelief.roughnessBoost) || 0) * 0.10 -
      calmPenalty,
    0,
    0.64
  );
};

PS.render.surfaceTexture.getSilhouetteSwatches = function (sample, baseColor) {
  var strength = PS.render.surfaceTexture.getSilhouetteStrength(sample);
  var swatches = [];
  var seedEast = Math.round(Number(sample && sample.surfaceSampleX) || 0);
  var seedNorth = Math.round(Number(sample && sample.surfaceSampleY) || 0);
  var count = strength <= 0.14 ? 0 : clamp(Math.round(2 + strength * 7), 1, 6);
  var maxSize = Math.max(1, CONFIG.TILE_SIZE - 1);
  var edgeThickness = Math.max(1, Math.floor(CONFIG.TILE_SIZE * 0.20));

  if (count <= 0) {
    return swatches;
  }

  for (var i = 0; i < count; i++) {
    var noise = getDeterministicUnitNoise(seedEast + i * 41, seedNorth - i * 43, getPlanetVisualSeedOffset() + 3203 + i * 29);
    var sideNoise = getDeterministicUnitNoise(seedEast - i * 17, seedNorth + i * 19, getPlanetVisualSeedOffset() + 3511 + i * 31);
    var offsetNoise = getDeterministicUnitNoise(seedEast + i * 23, seedNorth + i * 7, getPlanetVisualSeedOffset() + 3761 + i * 13);
    var side = Math.floor(sideNoise * 4) % 4;
    var runLength = clamp(Math.round(CONFIG.TILE_SIZE * (0.28 + noise * 0.34)), 1, maxSize);
    var offset = Math.floor(offsetNoise * Math.max(1, CONFIG.TILE_SIZE - runLength + 1));
    var swatch = {
      x: 0,
      y: 0,
      width: edgeThickness,
      height: runLength,
      size: runLength,
      color: PS.render.surfaceTexture.getSilhouetteAccent(sample, baseColor, noise),
      alpha: clamp(0.08 + strength * 0.25 + noise * 0.10, 0.10, 0.42),
      side: side
    };

    if (side === 0) {
      swatch.x = offset;
      swatch.y = 0;
      swatch.width = runLength;
      swatch.height = edgeThickness;
    } else if (side === 1) {
      swatch.x = CONFIG.TILE_SIZE - edgeThickness;
      swatch.y = offset;
    } else if (side === 2) {
      swatch.x = offset;
      swatch.y = CONFIG.TILE_SIZE - edgeThickness;
      swatch.width = runLength;
      swatch.height = edgeThickness;
    } else {
      swatch.x = 0;
      swatch.y = offset;
    }

    swatches.push(swatch);
  }

  return swatches;
};
