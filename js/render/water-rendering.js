"use strict";
PS.render = PS.render || {};
PS.render.waterRendering = PS.render.waterRendering || {};

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

PS.render.waterRendering.getRenderInfo = function (sample, biome, tileX, tileY) {
  if (!PS.render.waterRendering.isWaterSample(sample, biome)) {
    return null;
  }

  return {
    depthCode: PS.render.waterRendering.getDepthCode(sample, biome),
    stencilIndex: PS.render.waterRendering.getStencilIndex(sample, tileX, tileY),
    waveOffset: PS.render.waterRendering.getShoreWaveOffset(PS.render.waterRendering.getNowMs()),
    growth: PS.render.waterRendering.getSeasonalGrowth(sample)
  };
};
