"use strict";
PS.render = PS.render || {};
PS.render.surfacePatterns = PS.render.surfacePatterns || {};

PS.render.surfacePatterns.getPatternType = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = detail.surface || "ground";

  if (surface === "open water" || surface === "deep water" || surface === "whitecap") {
    return "water-streak";
  }

  if (surface === "sand" || surface === "dune") {
    return "sand-ripple";
  }

  if (surface === "rock" || surface === "stone" || surface === "ridge ice") {
    return "fracture";
  }

  if (surface === "dense canopy" || surface === "woodland" || surface === "grass" || surface === "brush" || surface === "meadow" || surface === "clearing" || surface === "scrub" || surface === "moss") {
    return "vegetation-clump";
  }

  if (surface === "snow" || surface === "ice") {
    return "ice-facet";
  }

  return "ground-grain";
};

PS.render.surfacePatterns.getPatternStrength = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var featureRelief = detail.featureRelief || {};
  var surface = detail.surface || "ground";
  var calmPenalty = surface === "deep water" || surface === "snow" || surface === "ice" ? 0.08 : 0;

  if (sampleMeters > 5 || CONFIG.TILE_SIZE < 4) {
    return 0;
  }

  return clamp(
    0.14 +
      (sampleMeters <= 1 ? 0.14 : 0.06) +
      (Number.isFinite(Number(detail.roughness)) ? Number(detail.roughness) : 0) * 0.18 +
      (Number.isFinite(Number(detail.slope)) ? Number(detail.slope) : 0) * 0.12 +
      (Number.isFinite(Number(detail.meterNoise)) ? Number(detail.meterNoise) : 0.5) * 0.06 +
      (Number.isFinite(Number(featureRelief.roughnessBoost)) ? Number(featureRelief.roughnessBoost) : 0) * 0.10 -
      calmPenalty,
    0,
    0.72
  );
};

PS.render.surfacePatterns.getPatternAccent = function (sample, baseColor, noise, patternType) {
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var target = normalizedNoise > 0.52 ? "#d7e4d8" : "#1f2b24";

  if (patternType === "water-streak") {
    target = normalizedNoise > 0.52 ? "#9bd8e7" : "#03142b";
  } else if (patternType === "sand-ripple") {
    target = normalizedNoise > 0.52 ? "#d8bf78" : "#604d23";
  } else if (patternType === "fracture") {
    target = normalizedNoise > 0.52 ? "#aaa797" : "#242621";
  } else if (patternType === "vegetation-clump") {
    target = normalizedNoise > 0.52 ? "#86ad4f" : "#102718";
  } else if (patternType === "ice-facet") {
    target = normalizedNoise > 0.52 ? "#ffffff" : "#86b7c8";
  }

  return blendHexColors(baseColor, target, clamp(0.14 + normalizedNoise * 0.20, 0.14, 0.40));
};

PS.render.surfacePatterns.getPatternShape = function (patternType, noise, index) {
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var maxSize = Math.max(1, CONFIG.TILE_SIZE - 1);
  var shortSize = 1;
  var midSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.24 + normalizedNoise * 0.18)), 1, maxSize);
  var longSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.48 + normalizedNoise * 0.22)), 1, maxSize);

  if (patternType === "water-streak" || patternType === "sand-ripple") {
    return {
      width: longSize,
      height: shortSize
    };
  }

  if (patternType === "fracture") {
    return index % 2 === 0
      ? { width: shortSize, height: longSize }
      : { width: longSize, height: shortSize };
  }

  if (patternType === "vegetation-clump") {
    return {
      width: midSize,
      height: clamp(midSize + (index % 2), 1, maxSize)
    };
  }

  if (patternType === "ice-facet") {
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

PS.render.surfacePatterns.getPatternSwatches = function (sample, baseColor) {
  var strength = PS.render.surfacePatterns.getPatternStrength(sample);
  var swatches = [];
  var seedEast = Math.round(Number(sample && sample.surfaceSampleX) || 0);
  var seedNorth = Math.round(Number(sample && sample.surfaceSampleY) || 0);
  var patternType = PS.render.surfacePatterns.getPatternType(sample);
  var count = strength <= 0.14 ? 0 : clamp(Math.round(1 + strength * 6), 1, 6);

  if (count <= 0) {
    return swatches;
  }

  for (var i = 0; i < count; i++) {
    var noise = getDeterministicUnitNoise(seedEast + i * 47, seedNorth - i * 53, getPlanetVisualSeedOffset() + 4211 + i * 31);
    var shape = PS.render.surfacePatterns.getPatternShape(patternType, noise, i);
    var maxX = Math.max(1, CONFIG.TILE_SIZE - shape.width + 1);
    var maxY = Math.max(1, CONFIG.TILE_SIZE - shape.height + 1);

    if (i > 0 && noise > strength + 0.48) {
      continue;
    }

    swatches.push({
      x: Math.floor(getDeterministicUnitNoise(seedEast - i * 11, seedNorth + i * 13, getPlanetVisualSeedOffset() + 443 + i) * maxX),
      y: Math.floor(getDeterministicUnitNoise(seedEast + i * 17, seedNorth - i * 19, getPlanetVisualSeedOffset() + 557 + i) * maxY),
      width: shape.width,
      height: shape.height,
      size: Math.max(shape.width, shape.height),
      color: PS.render.surfacePatterns.getPatternAccent(sample, baseColor, noise, patternType),
      alpha: clamp(0.08 + strength * 0.22 + noise * 0.08, 0.10, 0.40),
      patternType: patternType
    });
  }

  return swatches;
};
