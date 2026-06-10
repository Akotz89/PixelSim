"use strict";
PS.render = PS.render || {};
PS.render.surfaceColor = PS.render.surfaceColor || {};

PS.render.surfaceColor.getTileBlendRgb = function (tileBlend) {
  var tiles = tileBlend && Array.isArray(tileBlend.tiles) ? tileBlend.tiles : [];
  var red = 0;
  var green = 0;
  var blue = 0;
  var totalWeight = 0;

  for (var i = 0; i < tiles.length; i++) {
    var item = tiles[i];
    var weight = clamp(Number(item.weight) || 0, 0, 1);
    var tile = item.tile || getPlanetTile(item.x, item.y);

    if (!tile || weight <= 0) {
      continue;
    }

    var rgb = getRgbFromHex(getPlanetTileCompositedColor(tile));
    var gradientHex = PS.render.surfaceColor.getGroundMoistureColor({
      biome: item.biome || tile.biome,
      detail: item.detail || { surface: item.surface || "" },
      tile: tile,
      x: item.x,
      y: item.y,
      ran: item.ran
    });

    if (gradientHex) {
      rgb = getRgbFromHex(gradientHex);
    }

    red += rgb.red * weight;
    green += rgb.green * weight;
    blue += rgb.blue * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    return null;
  }

  return clampRgb({
    red: red / totalWeight,
    green: green / totalWeight,
    blue: blue / totalWeight
  });
};

PS.render.surfaceColor.groundGradientSurfaceKeys = {
  grass: "grass",
  meadow: "meadow",
  clearing: "clearing",
  woodland: "woodland",
  "dense canopy": "woodland",
  "forest floor": "woodland",
  brush: "brush",
  sand: "sand",
  dune: "sand",
  rock: "rock",
  stone: "rock",
  moss: "moss",
  scrub: "scrub",
  ice: "ice",
  "ridge ice": "ice",
  snow: "snow",
  ground: "ground"
};

PS.render.surfaceColor.groundGradientBiomeKeys = {
  grassland: "grass",
  forest: "woodland",
  wetland: "moss",
  desert: "sand",
  mountain: "rock",
  highland: "rock",
  tundra: "scrub",
  ice: "ice",
  barren: "ground"
};
PS.render.surfaceColor.groundMoistureGradients = PS.render.surfaceColor.groundMoistureGradients || {};
PS.render.surfaceColor.groundMoistureGradientVersion = PS.render.surfaceColor.groundMoistureGradientVersion || 0;
PS.render.surfaceColor.eraPalettes = PS.render.surfaceColor.eraPalettes || {};
PS.render.surfaceColor.eraWaterPalette = PS.render.surfaceColor.eraWaterPalette || null;
PS.render.surfaceColor.eraPaletteVersion = PS.render.surfaceColor.eraPaletteVersion || 0;
PS.render.surfaceColor.eraPaletteOrder = ["winter", "spring", "summer", "autumn"];

PS.render.surfaceColor.loadGroundGradientConfig = function (data) {
  var source = data && data.gradients ? data.gradients : data;
  var normalized = {};
  var key;
  var i;

  if (!source || typeof source !== "object") {
    throw new Error("Ground moisture gradients config must be an object or { gradients: {} }");
  }

  for (key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }
    if (!Array.isArray(source[key]) || source[key].length !== 16) {
      throw new Error("Ground moisture gradient " + key + " must define exactly 16 colors");
    }
    normalized[key] = [];
    for (i = 0; i < 16; i += 1) {
      if (!/^#[0-9a-fA-F]{6}$/.test(source[key][i])) {
        throw new Error("Ground moisture gradient " + key + " color " + i + " must be #rrggbb");
      }
      normalized[key][i] = source[key][i];
    }
  }

  PS.render.surfaceColor.groundMoistureGradients = normalized;
  PS.render.surfaceColor.groundMoistureGradientVersion += 1;
  return normalized;
};

PS.render.surfaceColor.loadEraPaletteConfig = function (data) {
  var source = data && data.palettes ? data.palettes : data;
  var water = data && data.water ? data.water : null;
  var normalized = {};
  var order = PS.render.surfaceColor.eraPaletteOrder;
  var key;
  var seasonIndex;
  var i;
  var season;

  if (!source || typeof source !== "object") {
    throw new Error("Era palettes config must be an object or { palettes: {} }");
  }

  for (key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }
    normalized[key] = {};
    for (seasonIndex = 0; seasonIndex < order.length; seasonIndex += 1) {
      season = order[seasonIndex];
      if (!Array.isArray(source[key][season]) || source[key][season].length !== 16) {
        throw new Error("Era palette " + key + "." + season + " must define exactly 16 colors");
      }
      normalized[key][season] = [];
      for (i = 0; i < 16; i += 1) {
        if (!/^#[0-9a-fA-F]{6}$/.test(source[key][season][i])) {
          throw new Error("Era palette " + key + "." + season + " color " + i + " must be #rrggbb");
        }
        normalized[key][season][i] = source[key][season][i];
      }
    }
  }

  if (water) {
    if (!/^#[0-9a-fA-F]{6}$/.test(water.normal) || !/^#[0-9a-fA-F]{6}$/.test(water.winter)) {
      throw new Error("Era water palette must define normal and winter #rrggbb colors");
    }
    PS.render.surfaceColor.eraWaterPalette = {
      normal: water.normal,
      winter: water.winter
    };
  }

  PS.render.surfaceColor.eraPalettes = normalized;
  PS.render.surfaceColor.eraPaletteVersion += 1;
  return normalized;
};

PS.render.surfaceColor.getGroundMoisturePalette = function () {
  return PS.render.surfaceColor.groundMoistureGradients || null;
};

PS.render.surfaceColor.getEraSeasonPosition = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || {};
  var raw = signals.eraPalettePosition !== undefined ? signals.eraPalettePosition : (
    signals.growth !== undefined ? signals.growth : (
      detail.eraPalettePosition !== undefined ? detail.eraPalettePosition : (
        sample && sample.eraPalettePosition !== undefined ? sample.eraPalettePosition : (
          sample && sample.growth !== undefined ? sample.growth : null
        )
      )
    )
  );

  if (raw === null && typeof world !== "undefined" && world) {
    raw = world.seasonGrowth !== undefined ? world.seasonGrowth : world.growth;
  }

  return clamp(Number(raw === null ? 1 : raw), 0, 1);
};

PS.render.surfaceColor.getEraPaletteColor = function (key, index, seasonPosition) {
  var palette = PS.render.surfaceColor.eraPalettes && PS.render.surfaceColor.eraPalettes[key];
  var order = PS.render.surfaceColor.eraPaletteOrder;
  var safeIndex = clamp(Math.round(Number(index) || 0), 0, 15);
  var position = clamp(Number(seasonPosition) || 0, 0, 1) * (order.length - 1);
  var fromIndex = Math.min(order.length - 1, Math.floor(position));
  var toIndex = Math.min(order.length - 1, fromIndex + 1);
  var amount = position - fromIndex;
  var fromColor;
  var toColor;

  if (!palette) {
    return null;
  }

  fromColor = palette[order[fromIndex]][safeIndex];
  toColor = palette[order[toIndex]][safeIndex];

  return blendHexColors(fromColor, toColor, amount);
};

PS.render.surfaceColor.getEraPaletteKey = function (sample) {
  var key = PS.render.surfaceColor.getGroundGradientKey(sample);
  var position = PS.render.surfaceColor.getEraSeasonPosition(sample);
  var version = Math.max(0, Math.round(Number(PS.render.surfaceColor.eraPaletteVersion) || 0));
  var bucket = clamp(Math.round(position * 63), 0, 63);

  if (!key || !PS.render.surfaceColor.eraPalettes || !PS.render.surfaceColor.eraPalettes[key]) {
    return "era.v" + version + ".none";
  }

  return "era.v" + version + "." + key + "." + bucket;
};

PS.render.surfaceColor.getEraWaterColor = function (growth) {
  var water = PS.render.surfaceColor.eraWaterPalette;
  var amount = clamp(Number(growth) || 0, 0, 1);

  if (!water) {
    return null;
  }

  return blendHexColors(water.winter, water.normal, amount);
};

PS.render.surfaceColor.getGroundGradientKey = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = String(detail.surface || "").toLowerCase();
  var biome = String(sample && sample.biome || "").toLowerCase();
  var palette = PS.render.surfaceColor.getGroundMoisturePalette();
  var key = PS.render.surfaceColor.groundGradientSurfaceKeys[surface] ||
    PS.render.surfaceColor.groundGradientBiomeKeys[biome] ||
    "ground";

  if (!palette || !Array.isArray(palette[key])) {
    return null;
  }

  return key;
};

PS.render.surfaceColor.hasGroundMoistureSignal = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || {};
  var tile = sample && sample.tile ? sample.tile : {};

  return Number.isFinite(Number(signals.moisture)) ||
    Number.isFinite(Number(detail.moisture)) ||
    Number.isFinite(Number(tile.moisture));
};

PS.render.surfaceColor.getSampleMoisture = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || {};
  var tile = sample && sample.tile ? sample.tile : {};
  var moisture;

  if (Number.isFinite(Number(signals.moisture))) {
    moisture = Number(signals.moisture);
  } else if (Number.isFinite(Number(detail.moisture))) {
    moisture = Number(detail.moisture);
  } else if (Number.isFinite(Number(tile.moisture))) {
    moisture = Number(tile.moisture);
    if (moisture > 1) {
      moisture = moisture / 2.2;
    }
  } else {
    return null;
  }

  return clamp(moisture, 0, 1);
};

PS.render.surfaceColor.getGroundGradientRandomOffset = function (sample) {
  var tile = sample && sample.tile ? sample.tile : {};
  var source = Number.isFinite(Number(sample && sample.ran)) ? Number(sample.ran)
    : (Number.isFinite(Number(sample && sample.ranMap)) ? Number(sample.ranMap)
      : (Number.isFinite(Number(tile.ran)) ? Number(tile.ran)
        : (Number.isFinite(Number(tile.ranMap)) ? Number(tile.ranMap) : NaN)));
  var x;
  var y;
  var hash;

  if (Number.isFinite(source)) {
    return (Math.abs(Math.round(source)) % 3) - 1;
  }

  if (PS.ranmap && typeof PS.ranmap.normalizedBits === "function" && Number.isFinite(Number(sample && sample.x)) && Number.isFinite(Number(sample && sample.y))) {
    return Math.min(2, Math.floor(PS.ranmap.normalizedBits(sample.x, sample.y, 3, 2) * 3)) - 1;
  }

  x = Number.isFinite(Number(sample && sample.x)) ? Number(sample.x)
    : (Number.isFinite(Number(tile.x)) ? Number(tile.x)
      : Math.round((Number(sample && sample.longitude) || 0) * 1000));
  y = Number.isFinite(Number(sample && sample.y)) ? Number(sample.y)
    : (Number.isFinite(Number(tile.y)) ? Number(tile.y)
      : Math.round((Number(sample && sample.latitude) || 0) * 1000));
  hash = Math.sin(x * 12.9898 + y * 78.233 + 41.113) * 43758.5453;
  return (Math.abs(Math.floor(hash)) % 3) - 1;
};

PS.render.surfaceColor.getMoistureGradientIndex = function (moisture, randomOffset) {
  return clamp(Math.floor(clamp(Number(moisture) || 0, 0, 1) * 16) + Math.round(Number(randomOffset) || 0), 0, 15);
};

PS.render.surfaceColor.getGroundMoistureKey = function (sample) {
  var key = PS.render.surfaceColor.getGroundGradientKey(sample);
  var moisture = PS.render.surfaceColor.getSampleMoisture(sample);
  var index;
  var version = Math.max(0, Math.round(Number(PS.render.surfaceColor.groundMoistureGradientVersion) || 0));

  if (!key || moisture === null || !PS.render.surfaceColor.hasGroundMoistureSignal(sample)) {
    return "gmoist.v" + version + ".none";
  }

  index = PS.render.surfaceColor.getMoistureGradientIndex(
    moisture,
    PS.render.surfaceColor.getGroundGradientRandomOffset(sample)
  );
  return "gmoist.v" + version + "." + key + "." + index;
};

PS.render.surfaceColor.getGroundMoistureColor = function (sample) {
  var palette = PS.render.surfaceColor.getGroundMoisturePalette();
  var key = PS.render.surfaceColor.getGroundGradientKey(sample);
  var moisture = PS.render.surfaceColor.getSampleMoisture(sample);
  var gradient;
  var index;

  if (!palette || !key || moisture === null || !PS.render.surfaceColor.hasGroundMoistureSignal(sample)) {
    return null;
  }

  gradient = palette[key];
  if (!Array.isArray(gradient) || gradient.length !== 16) {
    return null;
  }

  index = PS.render.surfaceColor.getMoistureGradientIndex(
    moisture,
    PS.render.surfaceColor.getGroundGradientRandomOffset(sample)
  );
  return PS.render.surfaceColor.getEraPaletteColor(
    key,
    index,
    PS.render.surfaceColor.getEraSeasonPosition(sample)
  ) || gradient[index] || null;
};

PS.render.surfaceColor.getBiomeTransitionStrength = function (sample) {
  var tileBlend = sample && sample.tileBlend ? sample.tileBlend : null;
  var biomeWeights = tileBlend && tileBlend.biomeWeights ? tileBlend.biomeWeights : null;
  var sampleBiome = sample && sample.biome ? sample.biome : "unknown";

  if (!biomeWeights) {
    return 0;
  }

  return clamp(1 - (Number(biomeWeights[sampleBiome]) || 0), 0, 1);
};

PS.render.surfaceColor.getMaterialIdentity = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = String(detail.surface || "").toLowerCase();
  var biome = String(sample && sample.biome || "").toLowerCase();
  var signals = detail.materialSignals || {};

  if (surface.indexOf("lava") >= 0 || surface.indexOf("magma") >= 0 ||
      surface.indexOf("volcano") >= 0 || Number(signals.lava) > 0.35 ||
      Number(signals.heat) > 0.75) {
    return "lava";
  }

  if (surface.indexOf("ice") >= 0 || surface.indexOf("snow") >= 0 || biome === "ice") {
    return "ice";
  }

  if (surface === "whitecap") {
    return "";
  }

  if (surface.indexOf("water") >= 0 ||
      biome === "ocean" || biome === "lake" || Number(signals.waterDepth) > 0.35) {
    return "water";
  }

  return "";
};

PS.render.surfaceColor.protectMaterialIdentityRgb = function (sample, rgb) {
  var identity = PS.render.surfaceColor.getMaterialIdentity(sample);
  var color = clampRgb(rgb || {});
  var total;
  var scale;

  if (identity === "water") {
    color.blue = Math.max(color.blue, 92);
    color.red = Math.min(color.red, Math.floor(color.blue * 0.48));
    color.green = Math.min(color.green, Math.floor(color.blue * 0.78));
    total = color.red + color.green;

    if (total >= color.blue - 8 && total > 0) {
      scale = (color.blue - 10) / total;
      color.red = Math.floor(color.red * scale);
      color.green = Math.floor(color.green * scale);
    }
  } else if (identity === "lava") {
    color.red = Math.max(color.red, 154);
    color.green = Math.min(color.green, Math.floor(color.red * 0.42));
    color.blue = Math.min(color.blue, Math.floor(color.red * 0.22));
  } else if (identity === "ice") {
    color.red = Math.max(color.red, 145);
    color.green = Math.max(color.green, 175);
    color.blue = Math.max(color.blue, 185);
  }

  return clampRgb(color);
};

PS.render.surfaceColor.protectMaterialIdentityHex = function (sample, hexColor) {
  var protectedRgb = PS.render.surfaceColor.protectMaterialIdentityRgb(sample, getRgbFromHex(hexColor));

  return PS.render.terrain.getHexFromRgb(protectedRgb.red, protectedRgb.green, protectedRgb.blue);
};

PS.render.surfaceColor.blendWithTileBlend = function (sample, localColor) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = detail.surface || "";
  var transitionStrength = PS.render.surfaceColor.getBiomeTransitionStrength(sample);
  var targetRgb;
  var strongSurfaceScale = 1;

  if (transitionStrength <= 0.01) {
    return localColor;
  }

  targetRgb = PS.render.surfaceColor.getTileBlendRgb(sample.tileBlend);

  if (!targetRgb) {
    return localColor;
  }

  if (surface === "whitecap" || surface === "deep water" || surface === "ridge ice" || surface === "snow") {
    strongSurfaceScale = 0.18;
  } else if (surface === "open water" || surface === "rock" || surface === "stone") {
    strongSurfaceScale = 0.62;
  }

  return PS.render.surfaceColor.protectMaterialIdentityHex(
    sample,
    blendHexColorWithRgb(localColor, targetRgb, clamp(transitionStrength * 0.34 * strongSurfaceScale, 0, 0.25))
  );
};

PS.render.surfaceColor.getLocalTerrainBandTint = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var materialSignals = detail.materialSignals || {};
  var tile = sample && sample.tile ? sample.tile : {};
  var biome = sample && sample.biome ? sample.biome : "unknown";
  var surface = detail.surface || "ground";
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var elevationSignal = tile && Number.isFinite(Number(tile.elevation))
    ? Number(tile.elevation)
    : ((Number.isFinite(Number(detail.elevation)) ? Number(detail.elevation) : 0.5) - 0.5) * 2;
  var signals = {
    elevation: elevationSignal,
    moisture: tile && Number.isFinite(Number(tile.moisture))
      ? Number(tile.moisture)
      : clamp(Number.isFinite(Number(materialSignals.moisture)) ? Number(materialSignals.moisture) : 0.35, 0, 1) * 1.8,
    ridgeStrength: Number.isFinite(Number(materialSignals.ridge))
      ? Number(materialSignals.ridge)
      : (tile && Number.isFinite(Number(tile.ridgeStrength)) ? Number(tile.ridgeStrength) : 0),
    roughness: Number.isFinite(Number(materialSignals.surfaceRoughness))
      ? Number(materialSignals.surfaceRoughness)
      : (Number.isFinite(Number(detail.roughness)) ? Number(detail.roughness) : 0),
    terrainSlope: Number.isFinite(Number(detail.slope)) ? Number(detail.slope) : 0,
    terrainHillshade: Number.isFinite(Number(detail.hillshade)) ? Number(detail.hillshade) : 0.55,
    coastFactor: Number.isFinite(Number(materialSignals.coast))
      ? Number(materialSignals.coast)
      : (tile && Number.isFinite(Number(tile.coastFactor)) ? Number(tile.coastFactor) : 0),
    shallowWater: Number.isFinite(Number(materialSignals.shallowWater))
      ? Number(materialSignals.shallowWater)
      : (tile && Number.isFinite(Number(tile.shallowWater)) ? Number(tile.shallowWater) : 0),
    shelfStrength: Number.isFinite(Number(materialSignals.shelfStrength))
      ? Number(materialSignals.shelfStrength)
      : (tile && Number.isFinite(Number(tile.shelfStrength)) ? Number(tile.shelfStrength) : 0),
    riverStrength: Number.isFinite(Number(materialSignals.river))
      ? Number(materialSignals.river)
      : (tile && Number.isFinite(Number(tile.riverStrength)) ? Number(tile.riverStrength) : 0)
  };
  var noise = {
    regional: Number.isFinite(Number(detail.meterNoise))
      ? Number(detail.meterNoise)
      : (Number.isFinite(Number(detail.elevation)) ? Number(detail.elevation) : 0.5),
    fine: Number.isFinite(Number(detail.microNoise))
      ? Number(detail.microNoise)
      : (Number.isFinite(Number(detail.roughness)) ? Number(detail.roughness) : 0.5)
  };
  var band = getPlanetLandformTerrainBand(biome, signals, noise, Number(sample && sample.latitude) || Number(tile.latitude) || 0);
  var strongSurfaceScale = 1;
  var scaleAmount = sampleMeters <= 1 ? 0.68 : (sampleMeters <= 5 ? 0.54 : 0.38);

  if (surface === "whitecap" || surface === "deep water" || surface === "ridge ice" || surface === "snow") {
    strongSurfaceScale = 0.18;
  } else if (surface === "open water" || surface === "rock" || surface === "stone" || surface === "ice") {
    strongSurfaceScale = 0.46;
  } else if (surface === "sand" || surface === "dune") {
    strongSurfaceScale = 0.78;
  }

  return {
    color: band.color,
    amount: clamp(band.amount * scaleAmount * strongSurfaceScale, 0, 0.18),
    relief: band.relief,
    bandNoise: band.bandNoise,
    surfaceScale: strongSurfaceScale
  };
};

PS.render.surfaceColor.getMaterialStrataTint = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var strata = detail.materialStrata || null;
  var surface = detail.surface || "ground";
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var closeScale = sampleMeters <= 1 ? 1 : (sampleMeters <= 5 ? 0.72 : (sampleMeters <= 25 ? 0.34 : 0));
  var strongSurfaceScale = 1;
  var amount;

  if (!strata || closeScale <= 0) {
    return {
      color: "#000000",
      amount: 0
    };
  }

  if (surface === "whitecap" || surface === "deep water" || surface === "snow" || surface === "ice") {
    strongSurfaceScale = 0.38;
  } else if (surface === "open water" || surface === "ridge ice") {
    strongSurfaceScale = 0.58;
  } else if (surface === "rock" || surface === "stone" || surface === "sand" || surface === "dune") {
    strongSurfaceScale = 0.86;
  }

  amount = clamp(
    (
      0.05 +
        (Number(strata.granularity) || 0) * 0.05 +
        (Number(strata.organicCover) || 0) * 0.04 +
        (Number(strata.rockExposure) || 0) * 0.04 +
        (Number(strata.depthMix) || 0) * 0.03
    ) * closeScale * strongSurfaceScale,
    0,
    0.18
  );

  return {
    color: strata.tintColor || "#6c6552",
    amount: amount
  };
};

PS.render.surfaceColor.getSurfaceColor = function (sample) {
  var biome = sample && sample.biome ? sample.biome : "unknown";
  var detail = sample && sample.detail ? sample.detail : null;
  var baseColor = PS.render.terrain.getBiomeColor(biome);

  if (!detail) {
    return baseColor;
  }

  var shade = clamp(
    (Number(detail.shade) || 0.5) * 0.54 +
      (Number(detail.elevation) || 0.5) * 0.12 +
      (Number(detail.roughness) || 0) * 0.08 +
      (Number(detail.hillshade) || 0.5) * 0.26,
    0,
    1
  );
  var heightMeters = Number(detail.heightMeters) || 0;
  var slope = clamp(Number(detail.slope) || 0, 0, 1);
  var highland = clamp((heightMeters - 900) / 2600, 0, 1);
  var materialSignals = detail.materialSignals || {};
  var snowLine = Number.isFinite(Number(materialSignals.snow))
    ? clamp(Number(materialSignals.snow), 0, 1)
    : (biome === "ice" ? 0.35 : clamp((heightMeters - 1800) / 2200, 0, 1));
  var shadow = clamp(1 - (Number(detail.hillshade) || 0.5), 0, 1);
  var river = sample && sample.tile ? clamp(Number(sample.tile.riverStrength) || 0, 0, 1) : 0;
  var coast = sample && sample.tile ? clamp(Number(sample.tile.coastFactor) || 0, 0, 1) : 0;
  var shallowWater = sample && sample.tile ? clamp(Number(sample.tile.shallowWater) || 0, 0, 1) : 0;
  var reliefShade = clamp(shade + highland * 0.08 - shadow * 0.10, 0, 1);
  var color;

  if (detail.surface === "whitecap") {
    color = "#b9e3ef";
  } else if (detail.surface === "open water") {
    color = blendHexColors("#071a34", "#1a3a6a", clamp((heightMeters + 4200) / 4200, 0, 1));
  } else if (detail.surface === "deep water") {
    color = "#061225";
  } else if (detail.surface === "clearing" || detail.surface === "meadow") {
    color = blendHexColors(PS.render.terrain.getBaseBiomeColor("forest"), "#7c8f3e", clamp(Number(detail.roughness) || 0, 0, 1) * 0.22);
  } else if (detail.surface === "dense canopy") {
    color = blendHexColors(PS.render.terrain.getBaseBiomeColor("forest"), "#000000", 0.38);
  } else if (detail.surface === "woodland") {
    color = PS.render.terrain.getBaseBiomeColor("forest");
  } else if (detail.surface === "brush") {
    color = "#346337";
  } else if (detail.surface === "grass") {
    color = PS.render.terrain.getBaseBiomeColor("grassland");
  } else if (detail.surface === "rock" || detail.surface === "stone") {
    color = blendHexColors("#3a3a3a", "#5a564b", slope * 0.55);
  } else if (detail.surface === "dune" || detail.surface === "sand") {
    color = blendHexColors("#8a6a30", "#a17d3c", clamp(1 - slope, 0, 1) * 0.35);
  } else if (detail.surface === "scrub" || detail.surface === "moss") {
    color = "#334739";
  } else if (detail.surface === "ridge ice" || detail.surface === "ice") {
    color = blendHexColors("#9cc8d8", "#eaf6f8", slope * 0.32);
  } else if (detail.surface === "snow") {
    color = "#e5f3f7";
  } else {
    color = baseColor;
  }

  if (biome === "ocean") {
    color = blendHexColors(color, "#7fb7a7", shallowWater * 0.34);
  } else {
    color = blendHexColors(color, "#1d5265", river * 0.46);
    color = blendHexColors(color, "#aaa05e", coast * 0.16);
  }

  color = blendHexColors(color, "#56544c", slope * 0.26);
  color = blendHexColors(color, "#f1f6f4", snowLine * 0.48);
  var moistureColor = PS.render.surfaceColor.getGroundMoistureColor(sample);
  if (moistureColor) {
    color = moistureColor;
  }
  var terrainBandTint = PS.render.surfaceColor.getLocalTerrainBandTint(sample);
  color = blendHexColors(color, terrainBandTint.color, terrainBandTint.amount);
  var strataTint = PS.render.surfaceColor.getMaterialStrataTint(sample);
  color = blendHexColors(color, strataTint.color, strataTint.amount);
  color = PS.render.surfaceColor.blendWithTileBlend(sample, color);
  return PS.render.surfaceColor.protectMaterialIdentityHex(sample, shadeHexColor(color, reliefShade));
};

// ── Packed-color fast path ─────────────────────────────────────────
// All hex constants pre-parsed to uint32. Zero string allocation in the
// entire getSurfaceColorPacked() call chain.

// Pre-parsed surface color constants for the grounded terrain palette.
PS.render.surfaceColor._pc = {
  // Water surfaces
  whitecap:      0xb9e3ef,   // bright sea foam
  deepOcean:     0x1a3a6a,   // deep blue water
  shallowOcean:  0x244f7a,   // shallow blue water
  deepWater:     0x061225,   // very deep ocean shadow
  // Vegetation surfaces
  clearingDark:  0x3f7138,   // cool forest clearing
  clearingLight: 0x3f4f31,   // lighter forest clearing
  denseCanopy:   0x1e3a0a,   // very dark forest interior
  woodland:      0x3f7138,   // woodland canopy
  brush:         0x3b5d1c,   // mid scrub
  grass:         0x2e6010,   // open grassland
  // Rock surfaces
  rockDark:      0x3a3a3a,   // cool basalt shadow
  rockLight:     0x5a564b,   // lighter rock face
  // Sand surfaces
  sandDark:      0x8a6a30,   // dry soil shadow
  sandLight:     0xa17d3c,   // sunlit dry soil
  // Cold surfaces
  scrub:         0x4a5545,   // cold scrub tundra
  iceDark:       0xb8ddea,   // ice shadow
  iceLight:      0xe4f4f7,   // snow peak
  snow:          0xe8edf5,   // bright snow
  // Overlay tints
  slopeGray:     0x505762,   // steep slope gray
  snowWhite:     0xf2f5f8,   // snow blend white
  riverBlue:     0x1d5265,   // river blue-green
  coastYellow:   0x8a6a30,   // shoreline reed tint
  shallowTeal:   0x245f78    // lake blue
};
PS.render.surfaceColor._surfacePaletteVersion = -1;
PS.render.surfaceColor._groundMoistureGradientVersion = -1;
PS.render.surfaceColor._groundMoistureGradientPacked = null;

PS.render.surfaceColor.refreshSurfacePaletteCache = function () {
  var version = PS.assets && typeof PS.assets.getPaletteVersion === "function"
    ? PS.assets.getPaletteVersion("terrain")
    : 0;
  var pc = PS.render.surfaceColor._pc;
  var terrain = PS.render.terrain;

  if (PS.render.surfaceColor._surfacePaletteVersion === version) {
    return;
  }

  pc.woodland = terrain.getBiomePackedColor("forest");
  pc.denseCanopy = terrain.blendPacked(pc.woodland, 0x000000, 0.38);
  pc.clearingDark = pc.woodland;
  pc.grass = terrain.getBiomePackedColor("grassland");
  pc.deepOcean = terrain.getBiomePackedColor("ocean");
  PS.render.surfaceColor._surfacePaletteVersion = version;
};

PS.render.surfaceColor.refreshGroundMoistureGradientPackedCache = function () {
  var version = PS.render.surfaceColor.groundMoistureGradientVersion;
  var palette = PS.render.surfaceColor.getGroundMoisturePalette();
  var packed = {};
  var key;
  var i;

  if (PS.render.surfaceColor._groundMoistureGradientVersion === version &&
      PS.render.surfaceColor._groundMoistureGradientPacked) {
    return;
  }

  if (palette) {
    for (key in palette) {
      if (Object.prototype.hasOwnProperty.call(palette, key) && Array.isArray(palette[key]) && palette[key].length === 16) {
        packed[key] = [];
        for (i = 0; i < 16; i += 1) {
          packed[key][i] = PS.render.terrain.hexToPacked(palette[key][i]);
        }
      }
    }
  }

  PS.render.surfaceColor._groundMoistureGradientPacked = packed;
  PS.render.surfaceColor._groundMoistureGradientVersion = version;
};

PS.render.surfaceColor.getGroundMoisturePackedColor = function (sample) {
  var eraColor = PS.render.surfaceColor.getGroundMoistureColor(sample);
  var key = PS.render.surfaceColor.getGroundGradientKey(sample);
  var moisture = PS.render.surfaceColor.getSampleMoisture(sample);
  var gradient;
  var index;

  if (eraColor) {
    return PS.render.terrain.applyDeepTimePackedTint(PS.render.terrain.hexToPacked(eraColor));
  }

  if (!key || moisture === null || !PS.render.surfaceColor.hasGroundMoistureSignal(sample)) {
    return null;
  }

  PS.render.surfaceColor.refreshGroundMoistureGradientPackedCache();
  gradient = PS.render.surfaceColor._groundMoistureGradientPacked &&
    PS.render.surfaceColor._groundMoistureGradientPacked[key];

  if (!gradient || gradient.length !== 16) {
    return null;
  }

  index = PS.render.surfaceColor.getMoistureGradientIndex(
    moisture,
    PS.render.surfaceColor.getGroundGradientRandomOffset(sample)
  );
  return gradient[index];
};

PS.render.surfaceColor.getSurfaceColorPacked = function (sample) {
  PS.render.surfaceColor.refreshSurfacePaletteCache();

  var pc = PS.render.surfaceColor._pc;
  var blend = PS.render.terrain.blendPacked;
  var shade = PS.render.terrain.shadePacked;
  var hexToPacked = PS.render.terrain.hexToPacked;
  var biome = sample && sample.biome ? sample.biome : "unknown";
  var detail = sample && sample.detail ? sample.detail : null;
  var baseColor = PS.render.terrain.getBiomePackedColorTinted(biome);

  if (!detail) {
    return baseColor;
  }

  var reliefShade = clamp(
    (Number(detail.shade) || 0.5) * 0.54 +
      (Number(detail.elevation) || 0.5) * 0.12 +
      (Number(detail.roughness) || 0) * 0.08 +
      (Number(detail.hillshade) || 0.5) * 0.26,
    0, 1
  );
  var heightMeters = Number(detail.heightMeters) || 0;
  var slope = clamp(Number(detail.slope) || 0, 0, 1);
  var materialSignals = detail.materialSignals || {};
  var snowLine = Number.isFinite(Number(materialSignals.snow))
    ? clamp(Number(materialSignals.snow), 0, 1)
    : (biome === "ice" ? 0.35 : clamp((heightMeters - 1800) / 2200, 0, 1));
  var shadow = clamp(1 - (Number(detail.hillshade) || 0.5), 0, 1);
  var river = sample && sample.tile ? clamp(Number(sample.tile.riverStrength) || 0, 0, 1) : 0;
  var coast = sample && sample.tile ? clamp(Number(sample.tile.coastFactor) || 0, 0, 1) : 0;
  var shallowWater = sample && sample.tile ? clamp(Number(sample.tile.shallowWater) || 0, 0, 1) : 0;
  var highland = clamp((heightMeters - 900) / 2600, 0, 1);
  var finalShade = clamp(reliefShade + highland * 0.08 - shadow * 0.10, 0, 1);
  var color;
  var surface = detail.surface;

  if (surface === "whitecap") {
    color = pc.whitecap;
  } else if (surface === "open water") {
    color = blend(pc.deepOcean, pc.shallowOcean, clamp((heightMeters + 4200) / 4200, 0, 1));
  } else if (surface === "deep water") {
    color = pc.deepWater;
  } else if (surface === "clearing" || surface === "meadow") {
    color = blend(pc.clearingDark, pc.clearingLight, clamp(Number(detail.roughness) || 0, 0, 1) * 0.22);
  } else if (surface === "dense canopy") {
    color = pc.denseCanopy;
  } else if (surface === "woodland") {
    color = pc.woodland;
  } else if (surface === "brush") {
    color = pc.brush;
  } else if (surface === "grass") {
    color = pc.grass;
  } else if (surface === "rock" || surface === "stone") {
    color = blend(pc.rockDark, pc.rockLight, slope * 0.55);
  } else if (surface === "dune" || surface === "sand") {
    color = blend(pc.sandDark, pc.sandLight, clamp(1 - slope, 0, 1) * 0.35);
  } else if (surface === "scrub" || surface === "moss") {
    color = pc.scrub;
  } else if (surface === "ridge ice" || surface === "ice") {
    color = blend(pc.iceDark, pc.iceLight, slope * 0.32);
  } else if (surface === "snow") {
    color = pc.snow;
  } else {
    color = baseColor;
  }

  if (biome === "ocean") {
    color = blend(color, pc.shallowTeal, shallowWater * 0.34);
  } else {
    color = blend(color, pc.riverBlue, river * 0.46);
    color = blend(color, pc.coastYellow, coast * 0.16);
  }

  color = blend(color, pc.slopeGray, slope * 0.26);
  color = blend(color, pc.snowWhite, snowLine * 0.48);

  var moisturePacked = PS.render.surfaceColor.getGroundMoisturePackedColor(sample);
  if (moisturePacked !== null) {
    color = moisturePacked;
  }

  // Terrain band tint (packed path)
  var terrainBand = PS.render.surfaceColor.getLocalTerrainBandTintPacked(sample);
  if (terrainBand.amount > 0.001) {
    color = blend(color, terrainBand.color, terrainBand.amount);
  }

  // Material strata tint (packed path)
  var strata = PS.render.surfaceColor.getMaterialStrataTintPacked(sample);
  if (strata.amount > 0.001) {
    color = blend(color, strata.color, strata.amount);
  }

  // Tile blend transition (packed path)
  color = PS.render.surfaceColor.blendWithTileBlendPacked(sample, color);

  return PS.render.surfaceColor.protectMaterialIdentityPacked(sample, shade(color, finalShade));
};

PS.render.surfaceColor._defaultStrataPacked = { color: 0x6c6552, amount: 0 };

PS.render.surfaceColor.getMaterialStrataTintPacked = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var strata = detail.materialStrata || null;
  var surface = detail.surface || "ground";
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var closeScale = sampleMeters <= 1 ? 1 : (sampleMeters <= 5 ? 0.72 : (sampleMeters <= 25 ? 0.34 : 0));
  var strongSurfaceScale = 1;
  var amount;

  if (!strata || closeScale <= 0) {
    return PS.render.surfaceColor._defaultStrataPacked;
  }

  if (surface === "whitecap" || surface === "deep water" || surface === "snow" || surface === "ice") {
    strongSurfaceScale = 0.38;
  } else if (surface === "open water" || surface === "ridge ice") {
    strongSurfaceScale = 0.58;
  } else if (surface === "rock" || surface === "stone" || surface === "sand" || surface === "dune") {
    strongSurfaceScale = 0.86;
  }

  amount = clamp(
    (0.05 + (Number(strata.granularity) || 0) * 0.05 +
      (Number(strata.organicCover) || 0) * 0.04 +
      (Number(strata.rockExposure) || 0) * 0.04 +
      (Number(strata.depthMix) || 0) * 0.03
    ) * closeScale * strongSurfaceScale, 0, 0.18
  );

  var tintColor = strata._tintPacked;
  if (typeof tintColor !== "number") {
    tintColor = strata.tintColor ? PS.render.terrain.hexToPacked(strata.tintColor) : 0x6c6552;
    strata._tintPacked = tintColor;
  }

  return { color: tintColor, amount: amount };
};

PS.render.surfaceColor.getLocalTerrainBandTintPacked = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var materialSignals = detail.materialSignals || {};
  var tile = sample && sample.tile ? sample.tile : {};
  var biome = sample && sample.biome ? sample.biome : "unknown";
  var surface = detail.surface || "ground";
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var elevationSignal = tile && Number.isFinite(Number(tile.elevation))
    ? Number(tile.elevation)
    : ((Number.isFinite(Number(detail.elevation)) ? Number(detail.elevation) : 0.5) - 0.5) * 2;
  var signals = {
    elevation: elevationSignal,
    moisture: tile && Number.isFinite(Number(tile.moisture))
      ? Number(tile.moisture)
      : clamp(Number.isFinite(Number(materialSignals.moisture)) ? Number(materialSignals.moisture) : 0.35, 0, 1) * 1.8,
    ridgeStrength: Number.isFinite(Number(materialSignals.ridge))
      ? Number(materialSignals.ridge)
      : (tile && Number.isFinite(Number(tile.ridgeStrength)) ? Number(tile.ridgeStrength) : 0),
    roughness: Number.isFinite(Number(materialSignals.surfaceRoughness))
      ? Number(materialSignals.surfaceRoughness)
      : (Number.isFinite(Number(detail.roughness)) ? Number(detail.roughness) : 0),
    terrainSlope: Number.isFinite(Number(detail.slope)) ? Number(detail.slope) : 0,
    terrainHillshade: Number.isFinite(Number(detail.hillshade)) ? Number(detail.hillshade) : 0.55,
    coastFactor: Number.isFinite(Number(materialSignals.coast))
      ? Number(materialSignals.coast)
      : (tile && Number.isFinite(Number(tile.coastFactor)) ? Number(tile.coastFactor) : 0),
    shallowWater: Number.isFinite(Number(materialSignals.shallowWater))
      ? Number(materialSignals.shallowWater)
      : (tile && Number.isFinite(Number(tile.shallowWater)) ? Number(tile.shallowWater) : 0),
    shelfStrength: Number.isFinite(Number(materialSignals.shelfStrength))
      ? Number(materialSignals.shelfStrength)
      : (tile && Number.isFinite(Number(tile.shelfStrength)) ? Number(tile.shelfStrength) : 0),
    riverStrength: Number.isFinite(Number(materialSignals.river))
      ? Number(materialSignals.river)
      : (tile && Number.isFinite(Number(tile.riverStrength)) ? Number(tile.riverStrength) : 0)
  };
  var noise = {
    regional: Number.isFinite(Number(detail.meterNoise))
      ? Number(detail.meterNoise)
      : (Number.isFinite(Number(detail.elevation)) ? Number(detail.elevation) : 0.5),
    fine: Number.isFinite(Number(detail.microNoise))
      ? Number(detail.microNoise)
      : (Number.isFinite(Number(detail.roughness)) ? Number(detail.roughness) : 0.5)
  };
  var band = getPlanetLandformTerrainBand(biome, signals, noise, Number(sample && sample.latitude) || Number(tile.latitude) || 0);
  var strongSurfaceScale = 1;
  var scaleAmount = sampleMeters <= 1 ? 0.68 : (sampleMeters <= 5 ? 0.54 : 0.38);

  if (surface === "whitecap" || surface === "deep water" || surface === "ridge ice" || surface === "snow") {
    strongSurfaceScale = 0.18;
  } else if (surface === "open water" || surface === "rock" || surface === "stone" || surface === "ice") {
    strongSurfaceScale = 0.46;
  } else if (surface === "sand" || surface === "dune") {
    strongSurfaceScale = 0.78;
  }

  var bandColorPacked = band._colorPacked;
  if (typeof bandColorPacked !== "number") {
    bandColorPacked = PS.render.terrain.hexToPacked(band.color);
    band._colorPacked = bandColorPacked;
  }

  return {
    color: bandColorPacked,
    amount: clamp(band.amount * scaleAmount * strongSurfaceScale, 0, 0.18),
    relief: band.relief,
    bandNoise: band.bandNoise,
    surfaceScale: strongSurfaceScale
  };
};

PS.render.surfaceColor.blendWithTileBlendPacked = function (sample, packedColor) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = detail.surface || "";
  var transitionStrength = PS.render.surfaceColor.getBiomeTransitionStrength(sample);
  var strongSurfaceScale = 1;

  if (transitionStrength <= 0.01) {
    return packedColor;
  }

  var targetRgb = PS.render.surfaceColor.getTileBlendRgb(sample.tileBlend);
  if (!targetRgb) {
    return packedColor;
  }

  if (surface === "whitecap" || surface === "deep water" || surface === "ridge ice" || surface === "snow") {
    strongSurfaceScale = 0.18;
  } else if (surface === "open water" || surface === "rock" || surface === "stone") {
    strongSurfaceScale = 0.62;
  }

  var targetPacked = PS.render.terrain.packRgb(
    clamp(Math.round(targetRgb.red), 0, 255),
    clamp(Math.round(targetRgb.green), 0, 255),
    clamp(Math.round(targetRgb.blue), 0, 255)
  );

  return PS.render.surfaceColor.protectMaterialIdentityPacked(sample, PS.render.terrain.blendPacked(
    packedColor, targetPacked,
    clamp(transitionStrength * 0.34 * strongSurfaceScale, 0, 0.25)
  ));
};

PS.render.surfaceColor.protectMaterialIdentityPacked = function (sample, packedColor) {
  var terrain = PS.render.terrain;
  var protectedRgb = PS.render.surfaceColor.protectMaterialIdentityRgb(sample, {
    red: terrain.unpackR(packedColor),
    green: terrain.unpackG(packedColor),
    blue: terrain.unpackB(packedColor)
  });

  return terrain.packRgb(
    clamp(Math.round(protectedRgb.red), 0, 255),
    clamp(Math.round(protectedRgb.green), 0, 255),
    clamp(Math.round(protectedRgb.blue), 0, 255)
  );
};
