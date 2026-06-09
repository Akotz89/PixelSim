"use strict";
function normalizeSeedText(seedValue) {
  var seedText = String(seedValue == null ? "" : seedValue).trim();
  return seedText || String(CONFIG.DEFAULT_SEED || "PIXELDARIUM");
}

function hashSeedText(seedText) {
  var hash = 2166136261;

  for (var i = 0; i < seedText.length; i++) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  hash = hash >>> 0;
  return hash === 0 ? 1 : hash;
}

function setWorldSeed(seedValue) {
  world.seedText = normalizeSeedText(seedValue);
  world.prng = PS.core && typeof PS.core.createPRNG === "function"
    ? PS.core.createPRNG(world.seedText)
    : null;
  world.rngState = world.prng ? world.prng.getState32() : hashSeedText(world.seedText);
  return world.seedText;
}

function ensureRandomState() {
  if (!world.prng && PS.core && typeof PS.core.createPRNG === "function") {
    world.prng = PS.core.createPRNG(world.seedText || CONFIG.DEFAULT_SEED);
  }

  if (!world.prng && (typeof world.rngState !== "number" || !Number.isFinite(world.rngState) || world.rngState <= 0)) {
    setWorldSeed(world.seedText);
  }
}

function randomUnit() {
  ensureRandomState();

  if (world.prng) {
    var value = world.prng.next();
    world.rngState = world.prng.getState32();
    return value;
  }

  var state = world.rngState >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  world.rngState = state >>> 0 || 1;

  return world.rngState / 4294967296;
}

function randomInt(max) {
  var normalizedMax = Math.max(1, Math.floor(Number(max) || 1));
  return Math.floor(randomUnit() * normalizedMax);
}

function chance(percent) {
  return randomUnit() < percent;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTileIndex(x, y) {
  var tileX = typeof getWrappedWorldX === "function"
    ? getWrappedWorldX(x)
    : clamp(Math.round(Number(x) || 0), 0, WORLD_WIDTH - 1);
  var tileY = typeof getClampedWorldY === "function"
    ? getClampedWorldY(y)
    : clamp(Math.round(Number(y) || 0), 0, WORLD_HEIGHT - 1);

  return tileY * WORLD_WIDTH + tileX;
}

function clampToWorld(entity) {
  if (typeof normalizeWorldPosition === "function") {
    normalizeWorldPosition(entity);
    return;
  }

  entity.x = clamp(entity.x, 0, WORLD_WIDTH - 1);
  entity.y = clamp(entity.y, 0, WORLD_HEIGHT - 1);
}
