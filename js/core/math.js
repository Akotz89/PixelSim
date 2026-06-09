"use strict";
PS.math = PS.math || {};

PS.math.normalizeSeedText = function (seedValue) {
  if (typeof normalizeSeedText === "function") {
    return normalizeSeedText(seedValue);
  }

  var seedText = String(seedValue == null ? "" : seedValue).trim();
  return seedText || String(PS.config.constants.DEFAULT_SEED || "PIXELDARIUM");
};

PS.math.hashSeedText = function (seedText) {
  if (typeof hashSeedText === "function") {
    return hashSeedText(seedText);
  }

  var hash = 2166136261;

  for (var i = 0; i < seedText.length; i++) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  hash = hash >>> 0;
  return hash === 0 ? 1 : hash;
};

PS.math.setSeed = function (seedValue) {
  if (typeof setWorldSeed === "function" && typeof world !== "undefined") {
    return setWorldSeed(seedValue);
  }

  PS.math.seedText = PS.math.normalizeSeedText(seedValue);
  PS.math.prng = PS.core && typeof PS.core.createPRNG === "function"
    ? PS.core.createPRNG(PS.math.seedText)
    : null;
  PS.math.rngState = PS.math.prng ? PS.math.prng.getState32() : PS.math.hashSeedText(PS.math.seedText);
  return PS.math.seedText;
};

PS.math.random = function () {
  if (typeof randomUnit === "function" && typeof world !== "undefined") {
    return randomUnit();
  }

  if (!PS.math.prng && PS.core && typeof PS.core.createPRNG === "function") {
    PS.math.prng = PS.core.createPRNG(PS.math.seedText || PS.config.constants.DEFAULT_SEED);
  }

  if (!PS.math.prng && (typeof PS.math.rngState !== "number" || PS.math.rngState <= 0)) {
    PS.math.setSeed(PS.config.constants.DEFAULT_SEED);
  }

  if (PS.math.prng) {
    var value = PS.math.prng.next();
    PS.math.rngState = PS.math.prng.getState32();
    return value;
  }

  var state = PS.math.rngState >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  PS.math.rngState = state >>> 0 || 1;

  return PS.math.rngState / 4294967296;
};

PS.math.randomInt = function (max) {
  if (typeof randomInt === "function" && typeof world !== "undefined") {
    return randomInt(max);
  }

  var normalizedMax = Math.max(1, Math.floor(Number(max) || 1));
  return Math.floor(PS.math.random() * normalizedMax);
};

PS.math.chance = function (percent) {
  if (typeof chance === "function" && typeof world !== "undefined") {
    return chance(percent);
  }

  return PS.math.random() < percent;
};

PS.math.clamp = function (value, min, max) {
  if (typeof clamp === "function") {
    return clamp(value, min, max);
  }

  return Math.max(min, Math.min(max, value));
};

PS.math.lerp = function (a, b, amount) {
  return a + (b - a) * amount;
};

PS.math.distanceSquared = function (ax, ay, bx, by) {
  var dx = ax - bx;
  var dy = ay - by;
  return dx * dx + dy * dy;
};

PS.math.deterministicUnitNoise = function (a, b, c) {
  var value = Math.sin((Number(a) || 0) * 12.9898 + (Number(b) || 0) * 78.233 + (Number(c) || 0) * 37.719) * 43758.5453;

  return value - Math.floor(value);
};

PS.math.seedText = PS.math.seedText || "";
PS.math.rngState = PS.math.rngState || 1;
PS.math.prng = PS.math.prng || null;
