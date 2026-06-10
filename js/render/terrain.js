"use strict";
PS.render = PS.render || {};
PS.render.terrain = PS.render.terrain || {};

// Grounded Pixeldarium fallback biome colors. Runtime palette registrations in
// js/assets/registry.js override these when the asset registry is loaded.
PS.render.terrain.defaultBiomeColors = {
  grassland:  "#2e6010",
  forest:     "#0f351d",
  desert:     "#8a6a30",
  wetland:    "#173f34",
  mountain:   "#3a3a3a",
  mountains:  "#3a3a3a",
  barren:     "#323126",
  tundra:     "#243133",
  ice:        "#b8ddea",
  ocean:      "#1a3a6a",
  lake:       "#1a3a6a",
  woodland:   "#254d24",
  pasture:    "#3f4f31",
  volcanic:   "#241817",
  jungle:     "#0b3f1e"
};
PS.render.terrain.defaultBiomeColor = "#07080f";
PS.render.terrain._biomePaletteVersion = -1;

PS.render.terrain.getPaletteBiomeKey = function (biome) {
  return String(biome || "") === "mountains" ? "mountain" : String(biome || "");
};

PS.render.terrain.getPaletteBiomeColor = function (biome) {
  var key = PS.render.terrain.getPaletteBiomeKey(biome);
  var fallback = PS.render.terrain.defaultBiomeColors[key] || PS.render.terrain.defaultBiomeColor;

  return PS.assets && typeof PS.assets.getPaletteColor === "function"
    ? PS.assets.getPaletteColor("terrain", key, fallback)
    : fallback;
};

PS.render.terrain.getBaseBiomeColor = function (biome) {
  return PS.render.terrain.getPaletteBiomeColor(biome);
};

PS.render.terrain.applyDeepTimeHexTint = function (hexColor) {
  if (!PS.deepTime || typeof PS.deepTime.getTerrainTint !== "function") {
    return hexColor;
  }

  var tint = PS.deepTime.getTerrainTint();
  return PS.render.terrain.blendHexColors(hexColor, tint.color, tint.amount);
};

PS.render.terrain.applyDeepTimeRgbTint = function (rgb) {
  if (!PS.deepTime || typeof PS.deepTime.getTerrainTint !== "function") {
    return rgb;
  }

  var tint = PS.deepTime.getTerrainTint();
  return PS.render.terrain.blendRgbWithHex(rgb, tint.color, tint.amount);
};

PS.render.terrain.getBiomeColor = function (biome) {
  return PS.render.terrain.applyDeepTimeHexTint(PS.render.terrain.getBaseBiomeColor(biome));
};

PS.render.terrain.mixChannel = function (channel, target, amount) {
  return Math.round(channel + (target - channel) * clamp(amount, 0, 1));
};

PS.render.terrain.getRgbFromHex = function (hexColor) {
  var color = String(hexColor || "#ffffff").replace("#", "");

  if (color.length !== 6) {
    return { red: 255, green: 255, blue: 255 };
  }

  return {
    red: parseInt(color.slice(0, 2), 16),
    green: parseInt(color.slice(2, 4), 16),
    blue: parseInt(color.slice(4, 6), 16)
  };
};

PS.render.terrain.getHexFromRgb = function (red, green, blue) {
  function toHex(value) {
    return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  }

  return "#" + toHex(red) + toHex(green) + toHex(blue);
};

PS.render.terrain.clampRgb = function (rgb) {
  return {
    red: clamp(rgb && Number.isFinite(Number(rgb.red)) ? Number(rgb.red) : 0, 0, 255),
    green: clamp(rgb && Number.isFinite(Number(rgb.green)) ? Number(rgb.green) : 0, 0, 255),
    blue: clamp(rgb && Number.isFinite(Number(rgb.blue)) ? Number(rgb.blue) : 0, 0, 255)
  };
};

PS.render.terrain.shadeHexColor = function (hexColor, shade) {
  var rgb = PS.render.terrain.getRgbFromHex(hexColor);
  var normalizedShade = clamp(Number(shade) || 0, 0, 1);
  var target = normalizedShade > 0.5 ? 255 : 0;
  var amount = Math.abs(normalizedShade - 0.5) * 0.52;

  return PS.render.terrain.getHexFromRgb(
    PS.render.terrain.mixChannel(rgb.red, target, amount),
    PS.render.terrain.mixChannel(rgb.green, target, amount),
    PS.render.terrain.mixChannel(rgb.blue, target, amount)
  );
};

PS.render.terrain.blendHexColors = function (fromHex, toHex, amount) {
  var from = PS.render.terrain.getRgbFromHex(fromHex);
  var to = PS.render.terrain.getRgbFromHex(toHex);
  var normalizedAmount = clamp(Number(amount) || 0, 0, 1);

  return PS.render.terrain.getHexFromRgb(
    from.red + (to.red - from.red) * normalizedAmount,
    from.green + (to.green - from.green) * normalizedAmount,
    from.blue + (to.blue - from.blue) * normalizedAmount
  );
};

PS.render.terrain.blendHexColorWithRgb = function (fromHex, toRgb, amount) {
  var from = PS.render.terrain.getRgbFromHex(fromHex);
  var normalizedAmount = clamp(Number(amount) || 0, 0, 1);
  var target = PS.render.terrain.clampRgb(toRgb || from);

  return PS.render.terrain.getHexFromRgb(
    from.red + (target.red - from.red) * normalizedAmount,
    from.green + (target.green - from.green) * normalizedAmount,
    from.blue + (target.blue - from.blue) * normalizedAmount
  );
};

PS.render.terrain.mixRgb = function (from, to, amount) {
  var normalizedAmount = clamp(Number(amount) || 0, 0, 1);

  return {
    red: from.red + (to.red - from.red) * normalizedAmount,
    green: from.green + (to.green - from.green) * normalizedAmount,
    blue: from.blue + (to.blue - from.blue) * normalizedAmount
  };
};

PS.render.terrain.blendRgbWithHex = function (rgb, hexColor, amount) {
  return PS.render.terrain.mixRgb(
    PS.render.terrain.clampRgb(rgb),
    PS.render.terrain.getRgbFromHex(hexColor),
    amount
  );
};

PS.render.terrain.shadeRgb = function (rgb, shade) {
  var color = PS.render.terrain.clampRgb(rgb);
  var normalizedShade = clamp(Number(shade) || 0, 0, 1);
  var target = normalizedShade > 0.5 ? 255 : 0;
  var amount = Math.abs(normalizedShade - 0.5) * 0.30;

  return {
    red: PS.render.terrain.mixChannel(color.red, target, amount),
    green: PS.render.terrain.mixChannel(color.green, target, amount),
    blue: PS.render.terrain.mixChannel(color.blue, target, amount)
  };
};

function getRgbFromHex(hexColor) {
  return PS.render.terrain.getRgbFromHex(hexColor);
}

function clampRgb(rgb) {
  return PS.render.terrain.clampRgb(rgb);
}

function shadeHexColor(hexColor, shade) {
  return PS.render.terrain.shadeHexColor(hexColor, shade);
}

function shadeRgb(rgb, shade) {
  return PS.render.terrain.shadeRgb(rgb, shade);
}

function blendHexColors(fromHex, toHex, amount) {
  return PS.render.terrain.blendHexColors(fromHex, toHex, amount);
}

function blendHexColorWithRgb(fromHex, toRgb, amount) {
  return PS.render.terrain.blendHexColorWithRgb(fromHex, toRgb, amount);
}

function blendRgbWithHex(rgb, hexColor, amount) {
  return PS.render.terrain.blendRgbWithHex(rgb, hexColor, amount);
}

// ── Packed uint32 color operations ─────────────────────────────────
// Colors stored as 0x00RRGGBB — zero string allocation, no parseInt/toString.
// These are the fast-path equivalents of blendHexColors/shadeHexColor.

PS.render.terrain.packRgb = function (r, g, b) {
  return ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
};

PS.render.terrain.unpackR = function (c) { return (c >> 16) & 0xFF; };
PS.render.terrain.unpackG = function (c) { return (c >> 8) & 0xFF; };
PS.render.terrain.unpackB = function (c) { return c & 0xFF; };

PS.render.terrain.blendPacked = function (from, to, t) {
  if (t <= 0) { return from; }
  if (t >= 1) { return to; }
  var invT = 1 - t;
  var r = ((from >> 16) & 0xFF) * invT + ((to >> 16) & 0xFF) * t + 0.5;
  var g = ((from >> 8) & 0xFF) * invT + ((to >> 8) & 0xFF) * t + 0.5;
  var b = (from & 0xFF) * invT + (to & 0xFF) * t + 0.5;
  return ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
};

PS.render.terrain.shadePacked = function (color, shade) {
  var s = shade < 0 ? 0 : (shade > 1 ? 1 : shade);
  var target = s > 0.5 ? 0xFFFFFF : 0x000000;
  var amount = (s > 0.5 ? s - 0.5 : 0.5 - s) * 0.52;
  return PS.render.terrain.blendPacked(color, target, amount);
};

PS.render.terrain.hexToPacked = function (hex) {
  // "#RRGGBB" → 0x00RRGGBB
  var h = hex.charCodeAt(1) <= 57 ? hex.charCodeAt(1) - 48 : hex.charCodeAt(1) - 87;
  var h2 = hex.charCodeAt(2) <= 57 ? hex.charCodeAt(2) - 48 : hex.charCodeAt(2) - 87;
  var h3 = hex.charCodeAt(3) <= 57 ? hex.charCodeAt(3) - 48 : hex.charCodeAt(3) - 87;
  var h4 = hex.charCodeAt(4) <= 57 ? hex.charCodeAt(4) - 48 : hex.charCodeAt(4) - 87;
  var h5 = hex.charCodeAt(5) <= 57 ? hex.charCodeAt(5) - 48 : hex.charCodeAt(5) - 87;
  var h6 = hex.charCodeAt(6) <= 57 ? hex.charCodeAt(6) - 48 : hex.charCodeAt(6) - 87;
  return ((h << 4 | h2) << 16) | ((h3 << 4 | h4) << 8) | (h5 << 4 | h6);
};

PS.render.terrain.packedToHex = function (c) {
  var HEX = "0123456789abcdef";
  return "#" + HEX[(c >> 20) & 0xF] + HEX[(c >> 16) & 0xF]
             + HEX[(c >> 12) & 0xF] + HEX[(c >> 8) & 0xF]
             + HEX[(c >> 4) & 0xF] + HEX[c & 0xF];
};

PS.render.terrain.refreshBiomePaletteCache = function () {
  var version = PS.assets && typeof PS.assets.getPaletteVersion === "function"
    ? PS.assets.getPaletteVersion("terrain")
    : 0;
  var colors = PS.render.terrain.defaultBiomeColors;
  var key;

  if (PS.render.terrain._biomePaletteVersion === version && PS.render.terrain._biomePackedLUT) {
    return;
  }

  PS.render.terrain._biomePackedLUT = {};

  for (key in colors) {
    if (Object.prototype.hasOwnProperty.call(colors, key)) {
      PS.render.terrain._biomePackedLUT[key] = PS.render.terrain.hexToPacked(
        PS.render.terrain.getPaletteBiomeColor(key)
      );
    }
  }

  PS.render.terrain._biomePackedDefault = PS.render.terrain.hexToPacked(PS.render.terrain.defaultBiomeColor);
  PS.render.terrain._biomePaletteVersion = version;
};

PS.render.terrain.getBiomePackedColor = function (biome) {
  PS.render.terrain.refreshBiomePaletteCache();
  return PS.render.terrain._biomePackedLUT[biome] || PS.render.terrain._biomePackedDefault;
};

PS.render.terrain.applyDeepTimePackedTint = function (packed) {
  if (!PS.deepTime || typeof PS.deepTime.getTerrainTint !== "function") {
    return packed;
  }
  var tint = PS.deepTime.getTerrainTint();
  if (!tint || !tint.amount) { return packed; }
  var tintPacked = typeof tint._packed === "number" ? tint._packed : PS.render.terrain.hexToPacked(tint.color);
  tint._packed = tintPacked;
  return PS.render.terrain.blendPacked(packed, tintPacked, tint.amount);
};

PS.render.terrain.getBiomePackedColorTinted = function (biome) {
  return PS.render.terrain.applyDeepTimePackedTint(PS.render.terrain.getBiomePackedColor(biome));
};

// ── End packed color operations ────────────────────────────────────

PS.render.terrain.getVisualSeedOffset = function () {
  return typeof hashSeedText === "function" ? hashSeedText(world.seedText || "") % 100000 : 0;
};

function getPlanetVisualSeedOffset() {
  return PS.render.terrain.getVisualSeedOffset();
}

PS.render.terrain.getMeterNoise = function (eastMeters, northMeters, patchMeters, seedOffset) {
  var normalizedPatchMeters = Math.max(1, Number(patchMeters) || 1);
  var normalizedSeed = Math.round(Number(seedOffset) || 0) + PS.render.terrain.getVisualSeedOffset();

  return getDeterministicUnitNoise(
    Math.floor((Number(eastMeters) || 0) / normalizedPatchMeters),
    Math.floor((Number(northMeters) || 0) / normalizedPatchMeters),
    Math.round(normalizedPatchMeters) + normalizedSeed
  );
};

PS.render.terrain.smoothNoiseAmount = function (amount) {
  var t = clamp(Number(amount) || 0, 0, 1);

  return t * t * (3 - 2 * t);
};

PS.render.terrain.getSmoothMeterNoise = function (eastMeters, northMeters, patchMeters, seedOffset) {
  var normalizedPatchMeters = Math.max(1, Number(patchMeters) || 1);
  var normalizedSeed = Math.round(Number(seedOffset) || 0) + PS.render.terrain.getVisualSeedOffset();
  var eastCell = (Number(eastMeters) || 0) / normalizedPatchMeters;
  var northCell = (Number(northMeters) || 0) / normalizedPatchMeters;
  var x0 = Math.floor(eastCell);
  var y0 = Math.floor(northCell);
  var xAmount = PS.render.terrain.smoothNoiseAmount(eastCell - x0);
  var yAmount = PS.render.terrain.smoothNoiseAmount(northCell - y0);
  var seed = Math.round(normalizedPatchMeters) + normalizedSeed;
  var topLeft = getDeterministicUnitNoise(x0, y0, seed);
  var topRight = getDeterministicUnitNoise(x0 + 1, y0, seed);
  var bottomLeft = getDeterministicUnitNoise(x0, y0 + 1, seed);
  var bottomRight = getDeterministicUnitNoise(x0 + 1, y0 + 1, seed);
  var top = topLeft + (topRight - topLeft) * xAmount;
  var bottom = bottomLeft + (bottomRight - bottomLeft) * xAmount;

  return top + (bottom - top) * yAmount;
};

PS.render.terrain.getTileRgb = function (tileX, tileY, tileRgbCache) {
  var x = getWrappedWorldX(tileX);
  var y = getClampedWorldY(tileY);
  var index = getTileIndex(x, y);

  if (tileRgbCache && tileRgbCache[index]) {
    return tileRgbCache[index];
  }

  return PS.render.terrain.getRgbFromHex(getPlanetTileCompositedColor(getPlanetTile(x, y)));
};

PS.render.terrain.getSurfaceRgbAtLatLon = function (latitude, longitude, tileRgbCache) {
  var normalizedLatitude = clamp(Number(latitude) || 0, -90, 90);
  var normalizedLongitude = normalizeLongitude(longitude);
  var xFloat = ((normalizedLongitude + 180) / 360) * Math.max(1, WORLD_WIDTH) - 0.5;
  var yFloat = ((90 - normalizedLatitude) / 180) * Math.max(1, WORLD_HEIGHT) - 0.5;
  var x0 = Math.floor(xFloat);
  var y0 = Math.floor(yFloat);
  var xAmount = xFloat - x0;
  var yAmount = yFloat - y0;
  var top = PS.render.terrain.mixRgb(
    PS.render.terrain.getTileRgb(x0, y0, tileRgbCache),
    PS.render.terrain.getTileRgb(x0 + 1, y0, tileRgbCache),
    xAmount
  );
  var bottom = PS.render.terrain.mixRgb(
    PS.render.terrain.getTileRgb(x0, y0 + 1, tileRgbCache),
    PS.render.terrain.getTileRgb(x0 + 1, y0 + 1, tileRgbCache),
    xAmount
  );

  return PS.render.terrain.mixRgb(top, bottom, yAmount);
};

PS.render.terrain.getTileNumericSignal = function (tile, key, fallback) {
  return tile && Number.isFinite(Number(tile[key])) ? Number(tile[key]) : fallback;
};

PS.render.terrain.getImageryBlendSignals = function (latitude, longitude) {
  var normalizedLatitude = clamp(Number(latitude) || 0, -90, 90);
  var normalizedLongitude = normalizeLongitude(longitude);
  var tilePosition = getTileFromLatLon(normalizedLatitude, normalizedLongitude);
  var fallbackTile = getPlanetTile(tilePosition.x, tilePosition.y) || {};
  var tileBlend = typeof getPlanetSurfaceTileBlend === "function"
    ? getPlanetSurfaceTileBlend(normalizedLatitude, normalizedLongitude)
    : null;
  var blendItems = tileBlend && Array.isArray(tileBlend.tiles) && tileBlend.tiles.length > 0
    ? tileBlend.tiles
    : [{ tile: fallbackTile, biome: fallbackTile.biome || "unknown", weight: 1 }];
  var signals = {
    tile: fallbackTile,
    tileBlend: tileBlend,
    biomeWeights: {},
    dominantBiome: fallbackTile.biome || "unknown",
    dominantWeight: 0,
    transitionStrength: 0,
    elevation: 0,
    moisture: 0,
    highlandLift: 0,
    coastFactor: 0,
    coastlineNoise: 0,
    shallowWater: 0,
    shelfStrength: 0,
    riverStrength: 0,
    riverMouth: 0,
    ridgeStrength: 0,
    roughness: 0,
    terrainSlope: 0,
    terrainHillshade: 0,
    snowSignal: 0,
    totalWeight: 0
  };

  for (var i = 0; i < blendItems.length; i++) {
    var item = blendItems[i];
    var tile = item.tile || getPlanetTile(item.x, item.y) || fallbackTile;
    var biome = item.biome || (tile && tile.biome) || "unknown";
    var weight = clamp(Number(item.weight) || 0, 0, 1);

    if (weight <= 0) {
      continue;
    }

    signals.biomeWeights[biome] = (signals.biomeWeights[biome] || 0) + weight;
    signals.elevation += PS.render.terrain.getTileNumericSignal(tile, "elevation", 0) * weight;
    signals.moisture += PS.render.terrain.getTileNumericSignal(tile, "moisture", 0.8) * weight;
    signals.highlandLift += PS.render.terrain.getTileNumericSignal(tile, "highlandLift", 0) * weight;
    signals.coastFactor += PS.render.terrain.getTileNumericSignal(tile, "coastFactor", 0) * weight;
    signals.coastlineNoise += PS.render.terrain.getTileNumericSignal(tile, "coastlineNoise", 0) * weight;
    signals.shallowWater += PS.render.terrain.getTileNumericSignal(tile, "shallowWater", 0) * weight;
    signals.shelfStrength += PS.render.terrain.getTileNumericSignal(tile, "shelfStrength", 0) * weight;
    signals.riverStrength += PS.render.terrain.getTileNumericSignal(tile, "riverStrength", 0) * weight;
    signals.riverMouth += PS.render.terrain.getTileNumericSignal(tile, "riverMouth", 0) * weight;
    signals.ridgeStrength += PS.render.terrain.getTileNumericSignal(tile, "ridgeStrength", 0) * weight;
    signals.roughness += PS.render.terrain.getTileNumericSignal(tile, "roughness", 0) * weight;
    signals.terrainSlope += PS.render.terrain.getTileNumericSignal(tile, "terrainSlope", 0) * weight;
    signals.terrainHillshade += PS.render.terrain.getTileNumericSignal(tile, "terrainHillshade", 0.55) * weight;
    signals.snowSignal += getPlanetSurfaceSnowSignal(tile, normalizedLatitude) * weight;
    signals.totalWeight += weight;
  }

  if (signals.totalWeight <= 0) {
    signals.totalWeight = 1;
    signals.biomeWeights[signals.dominantBiome] = 1;
    signals.moisture = PS.render.terrain.getTileNumericSignal(fallbackTile, "moisture", 0.8);
    signals.terrainHillshade = PS.render.terrain.getTileNumericSignal(fallbackTile, "terrainHillshade", 0.55);
    signals.snowSignal = getPlanetSurfaceSnowSignal(fallbackTile, normalizedLatitude);
  } else if (Math.abs(signals.totalWeight - 1) > 0.000001) {
    Object.keys(signals.biomeWeights).forEach(function (biome) {
      signals.biomeWeights[biome] = signals.biomeWeights[biome] / signals.totalWeight;
    });
    [
      "elevation",
      "moisture",
      "highlandLift",
      "coastFactor",
      "coastlineNoise",
      "shallowWater",
      "shelfStrength",
      "riverStrength",
      "riverMouth",
      "ridgeStrength",
      "roughness",
      "terrainSlope",
      "terrainHillshade",
      "snowSignal"
    ].forEach(function (key) {
      signals[key] = signals[key] / signals.totalWeight;
    });
    signals.totalWeight = 1;
  }

  Object.keys(signals.biomeWeights).forEach(function (biome) {
    if (signals.biomeWeights[biome] > signals.dominantWeight) {
      signals.dominantWeight = signals.biomeWeights[biome];
      signals.dominantBiome = biome;
    }
  });

  signals.transitionStrength = clamp(1 - signals.dominantWeight, 0, 1);
  return signals;
};

PS.render.terrain.getMaterialPixelNoise = function (latitude, longitude, patchMeters, seedOffset) {
  var surfaceMeters = getSurfaceMeterCoordinate(latitude, longitude);
  var normalizedPatchMeters = Math.max(1, Number(patchMeters) || 1);
  var smoothNoise = PS.render.terrain.getSmoothMeterNoise(
    surfaceMeters.eastMeters,
    surfaceMeters.northMeters,
    normalizedPatchMeters,
    seedOffset
  );
  var quantizedSteps = normalizedPatchMeters >= 10000
    ? 10
    : (normalizedPatchMeters >= 4000 ? 8 : 6);

  return Math.round(clamp(smoothNoise, 0, 1) * quantizedSteps) / quantizedSteps;
};

PS.render.terrain.getImageryWarpedLatLon = function (latitude, longitude) {
  var normalizedLatitude = clamp(Number(latitude) || 0, -90, 90);
  var normalizedLongitude = normalizeLongitude(longitude);
  var surfaceMeters = getSurfaceMeterCoordinate(normalizedLatitude, normalizedLongitude);
  var longitudeStep = typeof getPlanetTileLongitudeStepDeg === "function" ? getPlanetTileLongitudeStepDeg() : 360 / Math.max(1, WORLD_WIDTH);
  var latitudeStep = typeof getPlanetTileLatitudeStepDeg === "function" ? getPlanetTileLatitudeStepDeg() : 180 / Math.max(1, WORLD_HEIGHT);
  var broadEast = PS.render.terrain.getSmoothMeterNoise(surfaceMeters.eastMeters, surfaceMeters.northMeters, 190000, 1181) - 0.5;
  var broadNorth = PS.render.terrain.getSmoothMeterNoise(surfaceMeters.eastMeters, surfaceMeters.northMeters, 170000, 1213) - 0.5;
  var localEast = PS.render.terrain.getSmoothMeterNoise(surfaceMeters.eastMeters, surfaceMeters.northMeters, 72000, 1249) - 0.5;
  var localNorth = PS.render.terrain.getSmoothMeterNoise(surfaceMeters.eastMeters, surfaceMeters.northMeters, 68000, 1283) - 0.5;
  var latitudeFalloff = clamp(1 - Math.abs(normalizedLatitude) / 88, 0.35, 1);
  var warpScale = 0.34 * latitudeFalloff;

  return {
    latitude: clamp(normalizedLatitude + (broadNorth * 0.70 + localNorth * 0.30) * latitudeStep * warpScale, -90, 90),
    longitude: normalizeLongitude(normalizedLongitude + (broadEast * 0.68 + localEast * 0.32) * longitudeStep * warpScale)
  };
};

PS.render.terrain.getPixelArtQuantizedRgb = function (rgb, latitude, longitude) {
  var color = PS.render.terrain.clampRgb(rgb);
  var surfaceMeters = getSurfaceMeterCoordinate(latitude, longitude);
  var dither = PS.render.terrain.getSmoothMeterNoise(surfaceMeters.eastMeters, surfaceMeters.northMeters, 2400, 1543) - 0.5;
  var grain = PS.render.terrain.getSmoothMeterNoise(surfaceMeters.eastMeters, surfaceMeters.northMeters, 820, 1567) - 0.5;
  var step = 4;
  var offset = (dither * 3.0) + (grain * 1.4);

  function quantizeChannel(value, bias) {
    return clamp(Math.round((Number(value) + offset + bias) / step) * step, 0, 255);
  }

  return {
    red: quantizeChannel(color.red, 0.5),
    green: quantizeChannel(color.green, 0),
    blue: quantizeChannel(color.blue, -0.5)
  };
};

PS.render.terrain.getImageryRgb = function (latitude, longitude, tileRgbCache) {
  return getPlanetImageryRgbAtLatLon(latitude, longitude, tileRgbCache);
};

PS.render.terrain.getSurfaceColor = function (sample) {
  return getPlanetSurfaceColor(sample);
};

PS.render.terrain.buildCache = function () {
  return null;
};

PS.render.terrain.invalidateCache = function () {
  if (PS.render.surfaceRender && typeof PS.render.surfaceRender.invalidateTerrainCache === "function") {
    PS.render.surfaceRender.invalidateTerrainCache();
  } else if (typeof invalidateTerrainCache === "function") {
    invalidateTerrainCache();
  }
  if (typeof world !== "undefined" && world) {
    world.needsRender = true;
  }
  return true;
};

PS.render.terrain.drawLocalSurface = function (alpha, options) {
  if (
    !PS.render.surfaceStreaming ||
    !PS.render.surfaceRender ||
    !PS.render.renderer ||
    typeof PS.render.renderer.drawTilemap !== "function"
  ) {
    return false;
  }

  var startedAt = performance.now();
  var chunkSamples = PS.render.surface.getChunkSampleCount();
  var maxChunks = PS.render.surface.getVisibleChunkLimit();
  var queue = PS.render.surfaceStreaming.makeQueue(chunkSamples, maxChunks);
  var generatedBudget = PS.render.surfaceRender.getChunksPerPass();
  var generatedThisPass = 0;
  var drawnChunks = 0;
  var pendingChunks = 0;
  var placeholderChunks = 0;
  var fallbackBudget = PS.render.surfaceRender.getFallbackChunksPerPass();
  var fallbackGeneratedThisPass = 0;
  var fallbackPendingChunks = 0;
  var fallbackChunks = 0;
  var readyChunks = [];

  function queueReadyChunk(address, chunk, chunkAlpha, extra) {
    var screenRect = PS.render.surface.getChunkScreenRect(address);
    var drawAddress = Object.assign({}, address, {
      renderScreenX: screenRect.x,
      renderScreenY: screenRect.y,
      renderSamplePixelSize: screenRect.width / Math.max(1, address.chunkSamples)
    }, extra || {});

    if (PS.render.surfaceReadyFeather && typeof PS.render.surfaceReadyFeather.applyAddress === "function") {
      PS.render.surfaceReadyFeather.applyAddress(drawAddress, canvas);
    }

    readyChunks.push({
      address: drawAddress,
      cellCache: chunk.cellCache,
      alpha: chunkAlpha
    });
  }

  function queueParentFallback(fineAddress, chunkAlpha) {
    var lineage = PS.render.surface.getChunkLineage(fineAddress);

    for (var parentIndex = 0; parentIndex < lineage.length; parentIndex++) {
      var parentInfo = lineage[parentIndex];
      var parentAddress = PS.render.surface.getChunkParentAddress(fineAddress, parentInfo.zoomLevel);
      var allowFallbackGenerate = fallbackGeneratedThisPass < fallbackBudget;
      var generatedBefore = localSurfaceRenderChunkCache.stats.generatedChunks;
      var parentChunk = PS.render.surfaceRender.getChunk(parentAddress, allowFallbackGenerate);
      var generatedAfter = localSurfaceRenderChunkCache.stats.generatedChunks;

      if (generatedAfter > generatedBefore) {
        fallbackGeneratedThisPass += generatedAfter - generatedBefore;
      }

      if (!parentChunk || parentChunk.readyState !== "ready" || !Array.isArray(parentChunk.cellCache)) {
        fallbackPendingChunks++;
        continue;
      }

      queueReadyChunk(parentAddress, parentChunk, chunkAlpha, {
        fallbackForChunkKey: fineAddress.chunkKey,
        fallbackZoomLevel: parentAddress.zoomLevel
      });
      fallbackChunks++;
      return true;
    }

    return false;
  }

  localSurfaceRenderChunkCache.stats.lastVisibleChunks = queue.visibleCount || 0;
  localSurfaceRenderChunkCache.stats.lastVisibleQueueChunks = queue.visibleCount || 0;
  localSurfaceRenderChunkCache.stats.lastPrefetchQueueChunks = queue.prefetchCount || 0;
  localSurfaceRenderChunkCache.stats.lastVisibleCandidateChunks = queue.totalCandidateChunks || queue.length;
  localSurfaceRenderChunkCache.stats.lastWorkingSetLimit = queue.workingSetLimit || maxChunks;
  localSurfaceRenderChunkCache.stats.lastCulledChunks = queue.culledChunks || 0;

  for (var i = 0; i < queue.length; i++) {
    var item = queue[i];
    var allowGenerate = generatedThisPass < generatedBudget;
    var generatedBefore = localSurfaceRenderChunkCache.stats.generatedChunks;
    var chunk = PS.render.surfaceRender.getChunk(item.address, allowGenerate);
    var generatedAfter = localSurfaceRenderChunkCache.stats.generatedChunks;

    if (generatedAfter > generatedBefore) {
      generatedThisPass += generatedAfter - generatedBefore;
    }

    if (!chunk || chunk.readyState !== "ready" || !Array.isArray(chunk.cellCache)) {
      pendingChunks++;
      if (item.queueType === "visible") {
        queueParentFallback(item.address, alpha);
      }
      if (allowGenerate && generatedAfter === generatedBefore) {
        generatedThisPass++;
      }
      continue;
    }

    if (item.queueType !== "visible") {
      continue;
    }

    queueReadyChunk(item.address, chunk, alpha);
  }

  if (readyChunks.length > 0) {
    if (PS.render.renderer.drawTilemap({
      chunks: readyChunks,
      alpha: alpha,
      options: Object.assign({ skipPresent: false }, options || {})
    }, PS.camera && PS.camera.unified ? PS.camera.unified.getState() : null)) {
      drawnChunks = readyChunks.length;
    } else {
      placeholderChunks = readyChunks.length;
    }
  }

  localSurfaceRenderChunkCache.stats.lastPendingChunks = pendingChunks;
  localSurfaceRenderChunkCache.stats.lastGeneratedThisPass = generatedThisPass;
  localSurfaceRenderChunkCache.stats.lastFallbackChunks = fallbackChunks;
  localSurfaceRenderChunkCache.stats.lastFallbackGeneratedThisPass = fallbackGeneratedThisPass;
  localSurfaceRenderChunkCache.stats.lastFallbackPendingChunks = fallbackPendingChunks;
  localSurfaceRenderChunkCache.stats.lastPlaceholderChunks = placeholderChunks;

  if (pendingChunks > 0 && typeof world !== "undefined" && world) {
    world.needsRender = true;
  }

  if (PS.render.webgpuSurfaceTile && PS.render.webgpuSurfaceTile.state) {
    PS.render.webgpuSurfaceTile.state.lastFrameMs = Math.max(
      PS.render.webgpuSurfaceTile.state.lastFrameMs || 0,
      performance.now() - startedAt
    );
  }

  return drawnChunks > 0;
};

PS.render.terrain.draw = function () {
  var zoomLevel = world && world.planetView ? Number(world.planetView.zoomLevel) || 0 : 0;
  var layerAlphas = PS.render.lod && typeof PS.render.lod.getLayerAlphas === "function"
    ? PS.render.lod.getLayerAlphas(zoomLevel)
    : { globe: typeof isPlanetLocalView === "function" && isPlanetLocalView() ? 0 : 1, tiles: typeof isPlanetLocalView === "function" && isPlanetLocalView() ? 1 : 0 };
  var projection = PS.render.projection && typeof PS.render.projection.getProjection === "function"
    ? PS.render.projection.getProjection()
    : typeof getPlanetGlobeProjection === "function"
      ? getPlanetGlobeProjection()
      : typeof getPlanetProjection === "function"
        ? getPlanetProjection()
        : null;
  var globeDrawn = false;
  var tilesDrawn = false;

  if (layerAlphas.globe > 0.01 && PS.render.webgpuGlobe && typeof PS.render.webgpuGlobe.draw === "function") {
    globeDrawn = PS.render.webgpuGlobe.draw(projection, {
      alpha: layerAlphas.globe,
      loadOp: "clear"
    });
  }

  if (layerAlphas.tiles > 0.01) {
    tilesDrawn = PS.render.terrain.drawLocalSurface(layerAlphas.tiles, {
      loadOp: globeDrawn ? "load" : "clear"
    });
  }

  return Boolean(globeDrawn || tilesDrawn);
};

PS.render.terrain.advanceSurfaceWork = function (maxChunksOverride) {
  return 0;
};

PS.render.terrain.getSurfaceCacheStats = function () {
  return {
    planet: PS.render.surface ? PS.render.surface.getCacheStats() : null,
    render: PS.render.surfaceRender ? PS.render.surfaceRender.getCacheStats() : null
  };
};

PS.render.terrain.rebuildShaders = function () {};
PS.render.terrain.rebuildTextures = function () {
  PS.render.terrain.invalidateCache();
};
