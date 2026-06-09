"use strict";
PS.render = PS.render || {};
PS.render.surfaceHydrology = PS.render.surfaceHydrology || {};

PS.render.surfaceHydrology.getSignals = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || {};
  var surface = detail.surface || "ground";
  var groundFeature = detail.groundFeature || null;
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var shoreline = clamp(
    Math.max(
      Number(signals.shorelineStrength) || 0,
      Number(signals.coast) || 0,
      Number(signals.shallowWater) || 0,
      Number(signals.shorelineBeach) || 0
    ),
    0,
    1
  );
  var river = clamp(Math.max(
    Number(signals.river) || 0,
    groundFeature && groundFeature.type === "stream" ? Number(groundFeature.influence) || 0 : 0
  ), 0, 1);
  var water = surface === "open water" || surface === "deep water" || surface === "whitecap";
  var beach = surface === "sand" && shoreline > 0 ? Math.max(shoreline, Number(signals.shorelineBeach) || 0) : Number(signals.shorelineBeach) || 0;

  return {
    surface: surface,
    sampleMeters: sampleMeters,
    shoreline: shoreline,
    river: river,
    water: water,
    beach: clamp(beach, 0, 1),
    shallowWater: clamp(Number(signals.shallowWater) || 0, 0, 1),
    chop: clamp(Number(signals.chop) || 0, 0, 1),
    waterDepth: clamp(Number(signals.waterDepth) || 0, 0, 1),
    shorelineWater: clamp(Number(signals.shorelineWater) || 0, 0, 1),
    shorelineLand: clamp(Number(signals.shorelineLand) || 0, 0, 1)
  };
};

PS.render.surfaceHydrology.getSwatchCount = function (hydrology) {
  if (!hydrology || hydrology.sampleMeters > 25 || CONFIG.TILE_SIZE < 4) {
    return 0;
  }

  return clamp(
    Math.round(
      hydrology.shoreline * 4 +
        hydrology.river * 5 +
        hydrology.beach * 3 +
        hydrology.shallowWater * 2 +
        (hydrology.water ? 2 + hydrology.chop * 3 : 0)
    ),
    0,
    hydrology.sampleMeters <= 5 ? 8 : 5
  );
};

PS.render.surfaceHydrology.getSwatchType = function (hydrology, noise, index) {
  if (hydrology.river > 0.42 && (index === 0 || noise > 0.32)) {
    return "river-thread";
  }

  if (hydrology.beach > 0.34 && noise > 0.28) {
    return "wet-beach";
  }

  if (hydrology.shoreline > 0.38 && noise > 0.22) {
    return hydrology.water || hydrology.shorelineWater > hydrology.shorelineLand ? "foam-edge" : "shoreline-edge";
  }

  if (hydrology.water && hydrology.shallowWater > 0.30) {
    return "shoal-band";
  }

  return hydrology.water ? "water-sheen" : "wet-pocket";
};

PS.render.surfaceHydrology.getSwatchColor = function (baseColor, swatchType, noise) {
  var amount = clamp(0.18 + (Number(noise) || 0) * 0.24, 0.18, 0.46);

  if (swatchType === "river-thread") {
    return blendHexColors(baseColor, "#7fd5ef", amount);
  }

  if (swatchType === "foam-edge") {
    return blendHexColors(baseColor, "#e9fbff", clamp(amount + 0.10, 0.24, 0.58));
  }

  if (swatchType === "shoreline-edge") {
    return blendHexColors(baseColor, "#c7b47a", amount);
  }

  if (swatchType === "wet-beach") {
    return blendHexColors(baseColor, "#6f8e87", amount);
  }

  if (swatchType === "shoal-band") {
    return blendHexColors(baseColor, "#63b7c8", amount);
  }

  if (swatchType === "water-sheen") {
    return blendHexColors(baseColor, "#a3e2f2", clamp(amount - 0.05, 0.14, 0.36));
  }

  return blendHexColors(baseColor, "#5f9c83", amount);
};

PS.render.surfaceHydrology.getSwatchShape = function (hydrology, swatchType, noise, index) {
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var maxSize = Math.max(1, CONFIG.TILE_SIZE - 1);
  var longSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.46 + normalizedNoise * 0.28)), 1, maxSize);
  var midSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.24 + normalizedNoise * 0.20)), 1, maxSize);
  var thinSize = swatchType === "river-thread" ? Math.max(1, Math.round(CONFIG.TILE_SIZE * 0.16)) : 1;

  if (swatchType === "river-thread") {
    return index % 2 === 0
      ? { width: thinSize, height: longSize, rotationRadians: 0 }
      : { width: longSize, height: thinSize, rotationRadians: 0 };
  }

  if (swatchType === "foam-edge" || swatchType === "shoreline-edge" || swatchType === "wet-beach" || swatchType === "shoal-band") {
    return { width: longSize, height: 1, rotationRadians: 0 };
  }

  return {
    width: midSize,
    height: Math.max(1, Math.round(midSize * 0.5)),
    rotationRadians: 0
  };
};

PS.render.surfaceHydrology.getSwatches = function (sample, baseColor) {
  var hydrology = PS.render.surfaceHydrology.getSignals(sample);
  var count = PS.render.surfaceHydrology.getSwatchCount(hydrology);
  var swatches = [];
  var seedEast = Math.round(Number(sample && sample.surfaceSampleX) || 0);
  var seedNorth = Math.round(Number(sample && sample.surfaceSampleY) || 0);

  if (count <= 0) {
    return swatches;
  }

  for (var i = 0; i < count; i++) {
    var noise = getDeterministicUnitNoise(seedEast + i * 61, seedNorth - i * 67, getPlanetVisualSeedOffset() + 8101 + i * 37);
    var swatchType = PS.render.surfaceHydrology.getSwatchType(hydrology, noise, i);
    var shape = PS.render.surfaceHydrology.getSwatchShape(hydrology, swatchType, noise, i);
    var maxX = Math.max(1, CONFIG.TILE_SIZE - shape.width + 1);
    var maxY = Math.max(1, CONFIG.TILE_SIZE - shape.height + 1);

    swatches.push({
      x: Math.floor(getDeterministicUnitNoise(seedEast - i * 19, seedNorth + i * 23, getPlanetVisualSeedOffset() + 8209 + i) * maxX),
      y: Math.floor(getDeterministicUnitNoise(seedEast + i * 29, seedNorth - i * 31, getPlanetVisualSeedOffset() + 8311 + i) * maxY),
      width: shape.width,
      height: shape.height,
      size: Math.max(shape.width, shape.height),
      rotationRadians: shape.rotationRadians,
      color: PS.render.surfaceHydrology.getSwatchColor(baseColor, swatchType, noise),
      alpha: clamp(
        0.14 +
          hydrology.shoreline * 0.22 +
          hydrology.river * 0.24 +
          hydrology.beach * 0.14 +
          hydrology.chop * 0.10 +
          noise * 0.08,
        0.14,
        0.58
      ),
      hydrologyType: swatchType
    });
  }

  return swatches;
};
