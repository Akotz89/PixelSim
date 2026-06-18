"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getDeterministicUnitNoise } from "./planet-surface.js";
import { getPlanetVisualSeedOffset } from "./terrain.js";

PS.render = PS.render || {};
PS.render.surfaceBase = PS.render.surfaceBase || {};

function resolveNumber(value, fallback) {
  var number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

export function getSurfaceSampleDetail(sample) {
  return sample && sample.detail ? sample.detail : {};
}

export function getSurfaceSampleMeters(sample) {
  var detail = getSurfaceSampleDetail(sample);

  return Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
}

export function getSurfaceSampleSeed(sample) {
  return {
    east: Math.round(Number(sample && sample.surfaceSampleX) || 0),
    north: Math.round(Number(sample && sample.surfaceSampleY) || 0)
  };
}

export function getStringSeed(value) {
  return String(value || "").split("").reduce(function(total, character) {
    return total + character.charCodeAt(0);
  }, 0);
}

export function getTileShapeBounds(shape) {
  var width = Math.max(1, Math.round(Number(shape && shape.width) || 1));
  var height = Math.max(1, Math.round(Number(shape && shape.height) || 1));

  return {
    width: width,
    height: height,
    size: Math.max(width, height),
    maxX: Math.max(1, CONFIG.TILE_SIZE - width + 1),
    maxY: Math.max(1, CONFIG.TILE_SIZE - height + 1)
  };
}

export function createDeterministicSwatches(spec) {
  var sample = spec && spec.sample ? spec.sample : {};
  var count = Math.max(0, Math.round(Number(spec && spec.count) || 0));
  var seed = getSurfaceSampleSeed(sample);
  var swatches = [];
  var seedExtra = resolveNumber(spec && spec.seedExtra, 0);
  var visualSeed = getPlanetVisualSeedOffset() + seedExtra;
  var noiseBase = resolveNumber(spec && spec.noiseBase, 0);
  var noiseEastStep = resolveNumber(spec && spec.noiseEastStep, 1);
  var noiseNorthStep = resolveNumber(spec && spec.noiseNorthStep, -1);
  var noiseSeedStep = resolveNumber(spec && spec.noiseSeedStep, 1);
  var xBase = resolveNumber(spec && spec.xBase, 0);
  var xEastStep = resolveNumber(spec && spec.xEastStep, 0);
  var xNorthStep = resolveNumber(spec && spec.xNorthStep, 0);
  var xSeedStep = resolveNumber(spec && spec.xSeedStep, 1);
  var yBase = resolveNumber(spec && spec.yBase, 0);
  var yEastStep = resolveNumber(spec && spec.yEastStep, 0);
  var yNorthStep = resolveNumber(spec && spec.yNorthStep, 0);
  var ySeedStep = resolveNumber(spec && spec.ySeedStep, 1);
  var includeVisualSeedForPosition = !spec || spec.includeVisualSeedForPosition !== false;

  for (var i = 0; i < count; i++) {
    var noise = getDeterministicUnitNoise(
      seed.east + i * noiseEastStep,
      seed.north + i * noiseNorthStep,
      visualSeed + noiseBase + i * noiseSeedStep
    );
    var shape;
    var bounds;
    var positionSeedBase;
    var swatch;
    var extra;

    if (i > 0 && typeof spec.shouldSkip === "function" && spec.shouldSkip(noise, i)) {
      continue;
    }

    shape = typeof spec.getShape === "function" ? spec.getShape(noise, i) : { width: 1, height: 1 };
    bounds = getTileShapeBounds(shape);
    positionSeedBase = includeVisualSeedForPosition ? visualSeed : 0;
    swatch = {
      x: Math.floor(getDeterministicUnitNoise(seed.east + i * xEastStep, seed.north + i * xNorthStep, positionSeedBase + xBase + i * xSeedStep) * bounds.maxX),
      y: Math.floor(getDeterministicUnitNoise(seed.east + i * yEastStep, seed.north + i * yNorthStep, positionSeedBase + yBase + i * ySeedStep) * bounds.maxY),
      width: bounds.width,
      height: bounds.height,
      size: bounds.size,
      color: typeof spec.getColor === "function" ? spec.getColor(noise, i, bounds) : "#000000",
      alpha: typeof spec.getAlpha === "function" ? spec.getAlpha(noise, i, bounds) : 1
    };

    if (typeof spec.getRotationRadians === "function") {
      swatch.rotationRadians = spec.getRotationRadians(noise, i, bounds);
    }

    if (typeof spec.getExtraProperties === "function") {
      extra = spec.getExtraProperties(noise, i, bounds) || {};
      Object.keys(extra).forEach(function(key) {
        swatch[key] = extra[key];
      });
    }

    swatches.push(swatch);
  }

  return swatches;
}

PS.render.surfaceBase.getSurfaceSampleDetail = getSurfaceSampleDetail;
PS.render.surfaceBase.getSurfaceSampleMeters = getSurfaceSampleMeters;
PS.render.surfaceBase.getSurfaceSampleSeed = getSurfaceSampleSeed;
PS.render.surfaceBase.getStringSeed = getStringSeed;
PS.render.surfaceBase.getTileShapeBounds = getTileShapeBounds;
PS.render.surfaceBase.createDeterministicSwatches = createDeterministicSwatches;
