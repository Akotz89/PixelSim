import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getDeterministicUnitNoise } from "./planet-surface.js";
import { normalizeLongitude } from "./planet-view.js";
import { blendHexColors, blendHexColorWithRgb, getPlanetVisualSeedOffset, shadeHexColor } from "./terrain.js";

PS.render = PS.render || {};
PS.render.surfaceRelief = PS.render.surfaceRelief || {};

PS.render.surfaceRelief.getAccentStrength = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var featureRelief = detail.featureRelief || {};
  var surface = detail.surface || "ground";
  var slope = clamp(Number(detail.slope) || 0, 0, 1);
  var roughness = clamp(Number(detail.roughness) || 0, 0, 1);
  var hillshade = clamp(Number(detail.hillshade) || 0.5, 0, 1);
  var shadow = clamp(1 - hillshade, 0, 1);
  var reliefBoost = clamp(Number(featureRelief.roughnessBoost) || 0, 0, 1);
  var calmPenalty = surface === "deep water" || surface === "snow" || surface === "ice" ? 0.18 : 0;

  if (sampleMeters > 5 || CONFIG.TILE_SIZE < 4) {
    return 0;
  }

  return clamp(
    slope * 0.46 +
      roughness * 0.18 +
      shadow * 0.16 +
      reliefBoost * 0.24 -
      calmPenalty,
    0,
    0.82
  );
};

PS.render.surfaceRelief.getAccentColor = function (sample, baseColor, amount, index) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = detail.surface || "ground";
  var hillshade = clamp(Number(detail.hillshade) || 0.5, 0, 1);
  var normalizedAmount = clamp(Number(amount) || 0, 0, 1);
  var shade = index % 2 === 0
    ? clamp(0.32 + hillshade * 0.22 - normalizedAmount * 0.10, 0.18, 0.62)
    : clamp(0.54 + hillshade * 0.24 + normalizedAmount * 0.10, 0.44, 0.82);
  var color = shadeHexColor(baseColor, shade);

  if (surface === "rock" || surface === "stone" || surface === "ridge ice") {
    color = blendHexColors(color, index % 2 === 0 ? "#252722" : "#b5b2a1", 0.18);
  } else if (surface === "sand" || surface === "dune") {
    color = blendHexColors(color, index % 2 === 0 ? "#5d4c24" : "#d9bd74", 0.16);
  } else if (surface === "open water" || surface === "whitecap") {
    color = blendHexColors(color, index % 2 === 0 ? "#041b36" : "#9bd8e7", 0.14);
  } else if (surface === "grass" || surface === "brush" || surface === "meadow" || surface === "clearing") {
    color = blendHexColors(color, index % 2 === 0 ? "#15341f" : "#8eae58", 0.12);
  }

  return color;
};

PS.render.surfaceRelief.getAccentSwatches = function (sample, baseColor) {
  var detail = sample && sample.detail ? sample.detail : {};
  var strength = PS.render.surfaceRelief.getAccentStrength(sample);
  var swatches = [];
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var swatchCount = strength <= 0.16 ? 0 : clamp(Math.round(2 + strength * (sampleMeters <= 1 ? 6 : 4)), 1, sampleMeters <= 1 ? 8 : 6);
  var seedEast = Math.round(Number(sample && sample.surfaceSampleX) || 0);
  var seedNorth = Math.round(Number(sample && sample.surfaceSampleY) || 0);
  var aspect = normalizeLongitude(Number(detail.aspect) || 0);
  var contourRadians = (aspect + 90) * Math.PI / 180;
  var horizontalBias = Math.abs(Math.cos(contourRadians));
  var verticalBias = Math.abs(Math.sin(contourRadians));
  var mostlyHorizontal = horizontalBias >= verticalBias;
  var longSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.46 + strength * 0.28)), 1, CONFIG.TILE_SIZE);
  var shortSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.12 + strength * 0.08)), 1, Math.max(1, CONFIG.TILE_SIZE - 1));
  var lineWidth = mostlyHorizontal ? longSize : shortSize;
  var lineHeight = mostlyHorizontal ? shortSize : longSize;

  if (swatchCount <= 0) {
    return swatches;
  }

  for (var i = 0; i < swatchCount; i++) {
    var noise = getDeterministicUnitNoise(seedEast + i * 31, seedNorth - i * 37, getPlanetVisualSeedOffset() + 2203 + Math.round(aspect) + i * 19);
    var jitter = getDeterministicUnitNoise(seedEast - i * 11, seedNorth + i * 13, getPlanetVisualSeedOffset() + 2477 + i * 23);
    var width = lineWidth;
    var height = lineHeight;
    var x;
    var y;

    if (i > 0 && noise > strength + 0.46) {
      continue;
    }

    if (mostlyHorizontal) {
      x = Math.floor(jitter * Math.max(1, CONFIG.TILE_SIZE - width + 1));
      y = Math.floor(((i + noise) / Math.max(1, swatchCount + 1)) * Math.max(1, CONFIG.TILE_SIZE - height + 1));
    } else {
      x = Math.floor(((i + noise) / Math.max(1, swatchCount + 1)) * Math.max(1, CONFIG.TILE_SIZE - width + 1));
      y = Math.floor(jitter * Math.max(1, CONFIG.TILE_SIZE - height + 1));
    }

    swatches.push({
      x: clamp(x, 0, Math.max(0, CONFIG.TILE_SIZE - width)),
      y: clamp(y, 0, Math.max(0, CONFIG.TILE_SIZE - height)),
      width: width,
      height: height,
      size: Math.max(width, height),
      color: PS.render.surfaceRelief.getAccentColor(sample, baseColor, noise, i),
      alpha: clamp(0.08 + strength * 0.26 + noise * 0.08, 0.10, 0.48),
      aspect: aspect
    });
  }

  return swatches;
};

PS.render.surfaceRelief.getEdgeAccentSwatches = function (sample, baseColor) {
  var tileBlend = sample && sample.tileBlend ? sample.tileBlend : null;
  var transitionStrength = getPlanetSurfaceBiomeTransitionStrength(sample);
  var detail = sample && sample.detail ? sample.detail : {};
  var featureInfluence = detail.groundFeature ? clamp(Number(detail.groundFeature.influence) || 0, 0, 1) : 0;
  var featureRelief = detail.featureRelief || {};
  var reliefEdge = clamp((Number(featureRelief.roughnessBoost) || 0) * 0.24 + featureInfluence * 0.16, 0, 0.28);
  var edgeStrength = clamp(transitionStrength * 0.55 + reliefEdge, 0, 0.52);
  var targetRgb;
  var targetColor;
  var swatches = [];
  var xAmount = tileBlend ? clamp(Number(tileBlend.xAmount) || 0, 0, 1) : 0.5;
  var yAmount = tileBlend ? clamp(Number(tileBlend.yAmount) || 0, 0, 1) : 0.5;
  var edgeSize = Math.max(1, Math.floor(CONFIG.TILE_SIZE * 0.22));

  if (CONFIG.TILE_SIZE < 4 || edgeStrength <= 0.06) {
    return swatches;
  }

  targetRgb = getPlanetSurfaceTileBlendRgb(tileBlend);
  targetColor = targetRgb
    ? blendHexColorWithRgb(baseColor, targetRgb, clamp(edgeStrength * 0.72, 0, 0.36))
    : shadeHexColor(baseColor, 0.50 + edgeStrength * 0.28);

  if (xAmount < 0.34 || featureInfluence > 0.62) {
    swatches.push({
      x: 0,
      y: 0,
      width: edgeSize,
      height: CONFIG.TILE_SIZE,
      size: CONFIG.TILE_SIZE,
      color: targetColor,
      alpha: clamp(0.10 + edgeStrength * 0.34, 0.10, 0.38)
    });
  }

  if (xAmount > 0.66 || featureInfluence > 0.72) {
    swatches.push({
      x: CONFIG.TILE_SIZE - edgeSize,
      y: 0,
      width: edgeSize,
      height: CONFIG.TILE_SIZE,
      size: CONFIG.TILE_SIZE,
      color: targetColor,
      alpha: clamp(0.10 + edgeStrength * 0.30, 0.10, 0.36)
    });
  }

  if (yAmount < 0.34) {
    swatches.push({
      x: 0,
      y: 0,
      width: CONFIG.TILE_SIZE,
      height: edgeSize,
      size: CONFIG.TILE_SIZE,
      color: targetColor,
      alpha: clamp(0.09 + edgeStrength * 0.28, 0.09, 0.34)
    });
  }

  if (yAmount > 0.66) {
    swatches.push({
      x: 0,
      y: CONFIG.TILE_SIZE - edgeSize,
      width: CONFIG.TILE_SIZE,
      height: edgeSize,
      size: CONFIG.TILE_SIZE,
      color: targetColor,
      alpha: clamp(0.09 + edgeStrength * 0.28, 0.09, 0.34)
    });
  }

  return swatches;
};
