"use strict";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { world } from "../systems/state.js";

PS.render = PS.render || {};
PS.render.waterRendering = PS.render.waterRendering || {};

PS.render.waterRendering.state = PS.render.waterRendering.state || {
  waterFrameIndex: 0,
  lastFrameTimeMs: -1
};

PS.render.waterRendering.getRenderTimeMs = function () {
  if (typeof world !== "undefined" && world && Number.isFinite(Number(world.timeMs))) {
    return Number(world.timeMs);
  }

  return typeof performance !== "undefined" && performance && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
};

PS.render.waterRendering.getWaterFrameIndex = function (timeMs) {
  var nowMs = Number.isFinite(Number(timeMs)) ? Number(timeMs) : PS.render.waterRendering.getRenderTimeMs();
  var frame = Math.floor(Math.max(0, nowMs) / 500) & 3;

  PS.render.waterRendering.state.waterFrameIndex = frame;
  PS.render.waterRendering.state.lastFrameTimeMs = nowMs;
  return frame;
};

PS.render.waterRendering.getAnimatedVariant = function (tileX, tileY, variantCount, timeMs) {
  var count = Math.max(1, Math.round(Number(variantCount) || 1));
  var frame = PS.render.waterRendering.getWaterFrameIndex(timeMs);
  var phase = PS.ranmap && typeof PS.ranmap.variant === "function"
    ? PS.ranmap.variant(tileX, tileY, 4)
    : Math.abs(Math.round(Number(tileX) || 0) * 17 + Math.round(Number(tileY) || 0) * 31) % 4;

  return (frame + phase) % count;
};

PS.render.waterRendering.isWaterSample = function (sample, biome) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = String(detail.surface || sample && sample.surface || "").toLowerCase();
  var feature = String(detail.feature || sample && sample.feature || "").toLowerCase();
  var biomeKey = String(biome || sample && sample.biome || "").toLowerCase();
  var signals = detail.materialSignals || sample && sample.materialSignals || {};

  return biomeKey === "ocean" ||
    biomeKey === "lake" ||
    surface.indexOf("water") >= 0 ||
    surface.indexOf("whitecap") >= 0 ||
    surface.indexOf("shore") >= 0 ||
    feature.indexOf("foam") >= 0 ||
    Number(signals.waterDepth) > 0.05 ||
    Number(signals.shallowWater) > 0.05;
};

PS.render.waterRendering.getDepthCode = function (sample, biome) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = String(detail.surface || sample && sample.surface || "").toLowerCase();
  var feature = String(detail.feature || sample && sample.feature || "").toLowerCase();
  var biomeKey = String(biome || sample && sample.biome || "").toLowerCase();
  var signals = detail.materialSignals || sample && sample.materialSignals || {};
  var depth = Number(signals.waterDepth);

  if (!Number.isFinite(depth)) {
    depth = Number(sample && sample.waterDepth) || 0;
  }

  if (surface.indexOf("deep water") >= 0 || biomeKey === "ocean" && depth >= 0.62 || depth >= 0.72) {
    return 3;
  }

  if (
    surface.indexOf("shore") >= 0 ||
    surface.indexOf("tidal") >= 0 ||
    feature.indexOf("foam") >= 0 ||
    Number(signals.coast) > 0.18 ||
    Number(signals.shallowWater) > 0.18 ||
    depth > 0 && depth < 0.38
  ) {
    return 1;
  }

  return 2;
};

PS.render.waterRendering.getExplicitMask = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || sample && sample.materialSignals || {};
  var raw = signals.shoreMask !== undefined ? signals.shoreMask : (
    sample && sample.shoreMask !== undefined ? sample.shoreMask : sample && sample.autotileMask
  );
  var mask = Math.round(Number(raw));

  return Number.isFinite(mask) ? mask & 15 : -1;
};

PS.render.waterRendering.computeShoreMask = function (sample, tileX, tileY) {
  var explicit = PS.render.waterRendering.getExplicitMask(sample);
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = String(detail.surface || sample && sample.surface || "").toLowerCase();
  var feature = String(detail.feature || sample && sample.feature || "").toLowerCase();
  var signals = detail.materialSignals || sample && sample.materialSignals || {};
  var coastal = surface.indexOf("shore") >= 0 ||
    surface.indexOf("tidal") >= 0 ||
    feature.indexOf("foam") >= 0 ||
    Number(signals.coast) > 0.18 ||
    Number(signals.shallowWater) > 0.18;
  var variant;

  if (explicit >= 0) {
    return explicit;
  }

  if (!coastal) {
    return 0;
  }

  variant = PS.ranmap && typeof PS.ranmap.variant === "function"
    ? PS.ranmap.variant(tileX, tileY, 4)
    : Math.abs(Math.round(Number(tileX) || 0) * 5 + Math.round(Number(tileY) || 0) * 7) % 4;

  if (variant === 0) { return 1; }
  if (variant === 1) { return 2; }
  if (variant === 2) { return 4; }
  return 8;
};

PS.render.waterRendering.getStencilIndex = function (sample, tileX, tileY) {
  var mask = PS.render.waterRendering.computeShoreMask(sample, tileX, tileY);
  var variant = PS.ranmap && typeof PS.ranmap.variant === "function"
    ? PS.ranmap.variant(tileX, tileY, 4)
    : Math.abs(Math.round(Number(tileX) || 0) * 17 + Math.round(Number(tileY) || 0) * 31) % 4;

  return (variant & 3) * 16 + (mask & 15);
};

PS.render.waterRendering.getShoreWaveOffset = function (nowMs) {
  var tick = Math.floor((Math.max(0, Number(nowMs) || 0) / 200)) % 14;
  return tick <= 7 ? tick : 14 - tick;
};

PS.render.waterRendering.getSeasonalGrowth = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || sample && sample.materialSignals || {};
  var raw = signals.growth !== undefined ? signals.growth : (
    sample && sample.growth !== undefined ? sample.growth : null
  );

  if (raw === null && typeof world !== "undefined" && world) {
    raw = world.seasonGrowth !== undefined ? world.seasonGrowth : world.growth;
  }

  return clamp(Number(raw === null ? 1 : raw), 0, 1);
};

PS.render.waterRendering.getNowMs = function () {
  if (typeof world !== "undefined" && world && Number.isFinite(Number(world.timeMs))) {
    return Number(world.timeMs);
  }
  return Date.now ? Date.now() : 0;
};

PS.render.waterRendering.getVisualPolicy = function (lodState) {
  if (!(PS.render.lod && typeof PS.render.lod.resolveVisualPolicy === "function") && lodState && lodState.visualPolicy) {
    return lodState.visualPolicy;
  }

  return PS.render.lod && typeof PS.render.lod.resolveVisualPolicy === "function"
    ? PS.render.lod.resolveVisualPolicy(lodState, { level: "SURFACE", waterUvScrollScale: 1 })
    : { level: "SURFACE", waterUvScrollScale: 1 };
};

PS.render.waterRendering.getDecorationSeed = function (tileX, tileY, salt) {
  var x = Math.round(Number(tileX) || 0);
  var y = Math.round(Number(tileY) || 0);
  var s = Math.round(Number(salt) || 0);
  var mixed;

  if (PS.ranmap && typeof PS.ranmap.variant === "function") {
    mixed = PS.ranmap.variant(x + s * 17, y - s * 31, 65536);
    return Math.max(0, Math.round(Number(mixed) || 0)) >>> 0;
  }

  mixed = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
  mixed = (mixed ^ (mixed >>> 13)) >>> 0;
  mixed = Math.imul(mixed, 1274126177) >>> 0;
  return (mixed ^ (mixed >>> 16)) >>> 0;
};

PS.render.waterRendering.isOpenWaterDecorationSample = function (sample, biome, tileX, tileY) {
  if (!PS.render.waterRendering.isWaterSample(sample, biome)) {
    return false;
  }

  return PS.render.waterRendering.getDepthCode(sample, biome) > 1 &&
    (PS.render.waterRendering.computeShoreMask(sample, tileX, tileY) & 15) === 0;
};

PS.render.waterRendering.shouldPlaceDecoration = function (sample, biome, tileX, tileY) {
  if (!PS.render.waterRendering.isOpenWaterDecorationSample(sample, biome, tileX, tileY)) {
    return false;
  }

  return (PS.render.waterRendering.getDecorationSeed(tileX, tileY, 0) & 7) === 0;
};

PS.render.waterRendering.getDecorationWaveOffset = function (tileX, tileY, nowMs, axis, speedScale) {
  var seed = PS.render.waterRendering.getDecorationSeed(tileX, tileY, axis === "y" ? 1 : 0);
  var phase = seed & 15;
  var speed = (10 / (1 + ((seed >>> 4) & 15))) * Math.max(0, Number(speedScale === undefined ? 1 : speedScale) || 0);
  var seconds = Math.max(0, Number(nowMs) || 0) / 1000;
  var frame = (phase + Math.floor(speed * seconds)) & 15;
  var distance = Math.abs(8 - frame);
  var triangle = Math.min(distance, 16 - distance);

  return {
    seed: seed,
    phase: phase,
    speed: speed,
    frame: frame,
    distance: triangle
  };
};

PS.render.waterRendering.getDecorationRenderInfo = function (sample, biome, tileX, tileY, samplePixelSize, nowMs, lodState) {
  var policy = PS.render.waterRendering.getVisualPolicy(lodState);
  var size = Math.max(1, Number(samplePixelSize) || 1);
  var timeMs = nowMs === undefined ? PS.render.waterRendering.getNowMs() : nowMs;
  var xWave;
  var yWave;
  var seed;
  var kind;
  var width;
  var height;
  var offsetX;
  var offsetY;

  if (Math.max(0, Number(policy.waterUvScrollScale) || 0) <= 0 || !PS.render.waterRendering.shouldPlaceDecoration(sample, biome, tileX, tileY)) {
    return null;
  }

  seed = PS.render.waterRendering.getDecorationSeed(tileX, tileY, 2);
  xWave = PS.render.waterRendering.getDecorationWaveOffset(tileX, tileY, timeMs, "x", policy.waterUvScrollScale);
  yWave = PS.render.waterRendering.getDecorationWaveOffset(tileX, tileY, timeMs, "y", policy.waterUvScrollScale);
  kind = seed % 3;
  width = size * (kind === 0 ? 0.34 : 0.26);
  height = size * (kind === 2 ? 0.18 : 0.22);
  offsetX = (xWave.distance - 4) * size * 0.035;
  offsetY = (yWave.distance - 4) * size * 0.026;

  return {
    kind: kind,
    seed: seed,
    phaseX: xWave.phase,
    phaseY: yWave.phase,
    speedX: xWave.speed,
    speedY: yWave.speed,
    offsetX: offsetX,
    offsetY: offsetY,
    width: width,
    height: height,
    color: kind === 0 ? [0.36, 0.58, 0.32, 0.88] : (kind === 1 ? [0.63, 0.72, 0.56, 0.78] : [0.84, 0.9, 0.78, 0.62])
  };
};

PS.render.waterRendering.getRenderInfo = function (sample, biome, tileX, tileY, lodState) {
  var policy = PS.render.waterRendering.getVisualPolicy(lodState);
  if (!PS.render.waterRendering.isWaterSample(sample, biome)) {
    return null;
  }

  return {
    depthCode: PS.render.waterRendering.getDepthCode(sample, biome),
    stencilIndex: PS.render.waterRendering.getStencilIndex(sample, tileX, tileY),
    waveOffset: Math.round(PS.render.waterRendering.getShoreWaveOffset(PS.render.waterRendering.getNowMs()) * Math.max(0, Number(policy.waterUvScrollScale) || 0)),
    growth: PS.render.waterRendering.getSeasonalGrowth(sample)
  };
};
