"use strict";
PS.atlas = PS.atlas || {};

PS.atlas.getTerrainDetailColor = function (palette, kind) {
  if (kind === "light") {
    return [
      clamp(Math.round(palette.accent[0] + 28), 0, 255),
      clamp(Math.round(palette.accent[1] + 28), 0, 255),
      clamp(Math.round(palette.accent[2] + 28), 0, 255),
      255
    ];
  }

  if (kind === "warm") {
    return [
      clamp(Math.round(palette.accent[0] + 44), 0, 255),
      clamp(Math.round(palette.accent[1] + 12), 0, 255),
      clamp(Math.round(palette.accent[2] - 22), 0, 255),
      255
    ];
  }

  return [
    clamp(Math.round(palette.dark[0] - 18), 0, 255),
    clamp(Math.round(palette.dark[1] - 18), 0, 255),
    clamp(Math.round(palette.dark[2] - 18), 0, 255),
    255
  ];
};

PS.atlas.writeTerrainDash = function (cell, x, y, length, horizontal, color) {
  for (var i = 0; i < length; i++) {
    PS.atlas.writePixel(cell, x + (horizontal ? i : 0), y + (horizontal ? 0 : i), color);
  }
};

PS.atlas.isTerrainWaterLikeSample = function (sample, biome) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = String(detail.surface || sample && sample.surface || "").toLowerCase();
  var feature = String(detail.feature || sample && sample.feature || "").toLowerCase();
  var biomeKey = String(biome || sample && sample.biome || "").toLowerCase();
  var signals = detail.materialSignals || sample && sample.materialSignals || {};

  if (PS.render && PS.render.waterRendering && typeof PS.render.waterRendering.isWaterSample === "function") {
    return PS.render.waterRendering.isWaterSample(sample, biome);
  }

  return biomeKey === "ocean" ||
    biomeKey === "lake" ||
    surface.indexOf("water") >= 0 ||
    surface.indexOf("shore") >= 0 ||
    feature.indexOf("foam") >= 0 ||
    Number(signals.waterDepth) > 0.05 ||
    Number(signals.shallowWater) > 0.05;
};

PS.atlas.getTerrainOverlayGroundSample = function (sample, neighborBiome) {
  var tileBlend = sample && sample.tileBlend ? sample.tileBlend : null;
  var tiles = tileBlend && Array.isArray(tileBlend.tiles) ? tileBlend.tiles : [];
  var best = null;
  var bestWeight = 0;
  var preferred = String(neighborBiome || "").toLowerCase();
  var i;
  var item;
  var itemBiome;
  var weight;

  for (i = 0; i < tiles.length; i += 1) {
    item = tiles[i];
    itemBiome = String(item && (item.biome || item.tile && item.tile.biome) || "").toLowerCase();
    if (preferred && itemBiome !== preferred) {
      continue;
    }
    if (PS.atlas.isTerrainWaterLikeSample(item, itemBiome)) {
      continue;
    }
    weight = Number(item && item.weight) || 0;
    if (weight > bestWeight) {
      bestWeight = weight;
      best = item;
    }
  }

  if (!best && preferred) {
    return PS.atlas.getTerrainOverlayGroundSample(sample, "");
  }

  return best || sample || null;
};

PS.atlas.getTerrainOverlayGroundColor = function (sample, palette, neighborBiome) {
  var groundSample = PS.atlas.getTerrainOverlayGroundSample(sample, neighborBiome);
  var color = PS.render && PS.render.surfaceColor && typeof PS.render.surfaceColor.getGroundMoistureColor === "function"
    ? PS.render.surfaceColor.getGroundMoistureColor(groundSample)
    : null;

  if (color) {
    return PS.atlas.hexToRgb(color).concat([255]);
  }

  return [
    palette && palette.base ? palette.base[0] : 104,
    palette && palette.base ? palette.base[1] : 128,
    palette && palette.base ? palette.base[2] : 78,
    255
  ];
};

PS.atlas.getTerrainOverlayGroundKey = function (sample, neighborBiome) {
  var groundSample = PS.atlas.getTerrainOverlayGroundSample(sample, neighborBiome);
  var moistureKey = groundSample && PS.render && PS.render.surfaceColor && typeof PS.render.surfaceColor.getGroundMoistureKey === "function"
    ? PS.render.surfaceColor.getGroundMoistureKey(groundSample)
    : "gmoist.none";
  var eraKey = groundSample && PS.render && PS.render.surfaceColor && typeof PS.render.surfaceColor.getEraPaletteKey === "function"
    ? PS.render.surfaceColor.getEraPaletteKey(groundSample)
    : "era.none";

  return moistureKey + "." + eraKey;
};

PS.atlas.adjustTerrainOverlayColor = function (color, delta) {
  return [
    clamp(Math.round(color[0] + delta), 0, 255),
    clamp(Math.round(color[1] + delta), 0, 255),
    clamp(Math.round(color[2] + delta), 0, 255),
    255
  ];
};

PS.atlas.writeTerrainTexturedMask = function (cell, mask, color, variant) {
  var phase = clamp(Math.round(Number(variant) || 0), 0, 15);
  var base = color || [104, 128, 78, 255];
  var light = PS.atlas.adjustTerrainOverlayColor(base, 18);
  var dark = PS.atlas.adjustTerrainOverlayColor(base, -16);
  var x;
  var y;

  function writeTexturedPixel(px, py, edgeDepth) {
    var pick = (px * 7 + py * 11 + phase) % 5;
    var pixelColor = edgeDepth === 0 ? base : (pick <= 1 ? light : (pick === 2 ? dark : base));
    PS.atlas.writePixel(cell, px, py, pixelColor);
  }

  if (!mask) {
    return;
  }

  if (mask & 8) {
    for (x = 0; x < 16; x += 1) {
      writeTexturedPixel(x, 0, 0);
      if ((x + phase) % 3 !== 1) { writeTexturedPixel(x, 1, 1); }
      if ((x + phase) % 5 === 0) { writeTexturedPixel(x, 2, 1); }
    }
  }

  if (mask & 4) {
    for (x = 0; x < 16; x += 1) {
      writeTexturedPixel(x, 15, 0);
      if ((x + phase) % 3 !== 2) { writeTexturedPixel(x, 14, 1); }
      if ((x + phase) % 5 === 1) { writeTexturedPixel(x, 13, 1); }
    }
  }

  if (mask & 1) {
    for (y = 0; y < 16; y += 1) {
      writeTexturedPixel(15, y, 0);
      if ((y + phase) % 3 !== 1) { writeTexturedPixel(14, y, 1); }
      if ((y + phase) % 5 === 2) { writeTexturedPixel(13, y, 1); }
    }
  }

  if (mask & 2) {
    for (y = 0; y < 16; y += 1) {
      writeTexturedPixel(0, y, 0);
      if ((y + phase) % 3 !== 2) { writeTexturedPixel(1, y, 1); }
      if ((y + phase) % 5 === 3) { writeTexturedPixel(2, y, 1); }
    }
  }
};

PS.atlas.getTerrainWaterStencilMask = function (sample, biome) {
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || sample && sample.materialSignals || {};
  var raw = signals.shoreMask !== undefined ? signals.shoreMask : (
    sample && sample.shoreMask !== undefined ? sample.shoreMask : sample && sample.autotileMask
  );
  var mask = Math.round(Number(raw));

  if (Number.isFinite(mask)) {
    return mask & 15;
  }

  if (PS.render && PS.render.waterRendering && typeof PS.render.waterRendering.computeShoreMask === "function") {
    return PS.render.waterRendering.computeShoreMask(sample, sample && sample.x, sample && sample.y) & 15;
  }

  return PS.atlas.isTerrainWaterLikeSample(sample, biome) ? 15 : 0;
};

PS.atlas.getTerrainTextureOverlayKey = function (sample, biome) {
  var mask = PS.atlas.isTerrainWaterLikeSample(sample, biome)
    ? PS.atlas.getTerrainWaterStencilMask(sample, biome)
    : 0;
  var civilization = typeof PS.atlas.getTerrainCivilizationInfo === "function"
    ? PS.atlas.getTerrainCivilizationInfo(sample)
    : null;
  var groundKey = mask || civilization && civilization.type === "settlement"
    ? PS.atlas.getTerrainOverlayGroundKey(sample)
    : "gmoist.none.era.none";

  if (mask) {
    return "stencil.water." + mask + "." + groundKey;
  }

  if (civilization && civilization.type === "settlement") {
    return "stencil.building." + civilization.bucket + "." + civilization.family + "." + groundKey;
  }

  return "stencil.none";
};

PS.atlas.getTerrainTransitionType = function (biome, neighborBiome, surface) {
  var from = String(biome || "");
  var to = String(neighborBiome || "");
  var sampleSurface = String(surface || "");

  if (from === "ocean" || to === "ocean" || sampleSurface.indexOf("water") >= 0) {
    return "coast";
  }

  if (from === "ice" || to === "ice" || from === "tundra" || to === "tundra" || sampleSurface.indexOf("snow") >= 0) {
    return "frost";
  }

  if (from === "desert" || to === "desert" || sampleSurface.indexOf("sand") >= 0 || sampleSurface.indexOf("dune") >= 0) {
    return "dry";
  }

  if (from === "forest" || to === "forest" || sampleSurface.indexOf("canopy") >= 0 || sampleSurface.indexOf("woodland") >= 0) {
    return "canopy";
  }

  if (from === "mountain" || to === "mountain" || sampleSurface.indexOf("rock") >= 0) {
    return "ridge";
  }

  return "field";
};

PS.atlas.getTerrainTransitionInfo = function (sample, biome) {
  var tileBlend = sample && sample.tileBlend ? sample.tileBlend : null;
  var weights = tileBlend && tileBlend.biomeWeights ? tileBlend.biomeWeights : null;
  var currentBiome = String(biome || sample && sample.biome || "");
  var neighborBiome = "";
  var neighborWeight = 0;
  var mask = 0;
  var xAmount = clamp(Number(tileBlend && tileBlend.xAmount) || 0, 0, 1);
  var yAmount = clamp(Number(tileBlend && tileBlend.yAmount) || 0, 0, 1);
  var strength = clamp(Number(tileBlend && tileBlend.transitionStrength) || 0, 0, 1);

  if (!weights || strength < 0.18) {
    return null;
  }

  Object.keys(weights).forEach(function (candidateBiome) {
    var weight = Number(weights[candidateBiome]) || 0;

    if (candidateBiome !== currentBiome && weight > neighborWeight) {
      neighborBiome = candidateBiome;
      neighborWeight = weight;
    }
  });

  if (!neighborBiome || neighborWeight < 0.12) {
    return null;
  }

  if (xAmount > 0.58) { mask |= 1; }
  if (xAmount < 0.42) { mask |= 2; }
  if (yAmount > 0.58) { mask |= 4; }
  if (yAmount < 0.42) { mask |= 8; }

  if (!mask) {
    mask = neighborWeight >= 0.32 ? 15 : 0;
  }

  if (!mask) {
    return null;
  }

  return {
    type: PS.atlas.getTerrainTransitionType(currentBiome, neighborBiome, sample && sample.detail && sample.detail.surface),
    neighborBiome: neighborBiome,
    weight: neighborWeight,
    strength: strength,
    mask: mask
  };
};

PS.atlas.getTerrainTransitionKey = function (sample, biome) {
  var transition = PS.atlas.getTerrainTransitionInfo(sample, biome);
  var groundKey;

  if (!transition) {
    return "plain";
  }

  groundKey = PS.atlas.getTerrainOverlayGroundKey(sample, transition.neighborBiome);

  return [
    transition.type,
    transition.mask,
    Math.min(3, Math.floor(transition.weight * 4)),
    groundKey
  ].join(".");
};

PS.atlas.getTerrainTransitionColor = function (palette, transition) {
  if (transition && transition.gradientColor) {
    return transition.gradientColor;
  }

  if (transition.type === "coast") {
    return PS.atlas.getTerrainDetailColor(palette, "light");
  }

  if (transition.type === "dry") {
    return PS.atlas.getTerrainDetailColor(palette, "warm");
  }

  if (transition.type === "frost") {
    return [
      clamp(Math.round(palette.accent[0] + 56), 0, 255),
      clamp(Math.round(palette.accent[1] + 56), 0, 255),
      clamp(Math.round(palette.accent[2] + 56), 0, 255),
      255
    ];
  }

  return PS.atlas.getTerrainDetailColor(palette, transition.type === "canopy" ? "shadow" : "warm");
};

PS.atlas.getTerrainTransitionGradientColor = function (sample, transition) {
  var tileBlend = sample && sample.tileBlend ? sample.tileBlend : null;
  var tiles = tileBlend && Array.isArray(tileBlend.tiles) ? tileBlend.tiles : [];
  var best = null;
  var bestWeight = 0;
  var i;
  var item;
  var color;

  if (!transition || !transition.neighborBiome || !PS.render || !PS.render.surfaceColor ||
      typeof PS.render.surfaceColor.getGroundMoistureColor !== "function") {
    return null;
  }

  for (i = 0; i < tiles.length; i += 1) {
    item = tiles[i];
    if ((item.biome || item.tile && item.tile.biome) !== transition.neighborBiome) {
      continue;
    }
    if ((Number(item.weight) || 0) > bestWeight) {
      bestWeight = Number(item.weight) || 0;
      best = item;
    }
  }

  if (!best || bestWeight <= 0) {
    return null;
  }

  color = PS.render.surfaceColor.getGroundMoistureColor({
    biome: best.biome || best.tile && best.tile.biome || transition.neighborBiome,
    detail: best.detail || {
      surface: best.surface || "",
      materialSignals: best.materialSignals || {}
    },
    tile: best.tile || null,
    x: best.x,
    y: best.y,
    ran: best.ran
  });

  return color ? PS.atlas.hexToRgb(color).concat([255]) : null;
};

PS.atlas.drawTerrainTransitionEdge = function (cell, palette, variant, transition) {
  var color = PS.atlas.getTerrainTransitionColor(palette, transition);
  var shadow = PS.atlas.getTerrainDetailColor(palette, "shadow");
  var mask = transition.mask;
  var offset = clamp(Math.round(Number(variant) || 0), 0, 15);
  var i;

  if (transition && transition.gradientColor) {
    PS.atlas.writeTerrainTexturedMask(cell, mask, transition.gradientColor, offset);
  }

  if (mask & 8) {
    for (i = 0; i < 16; i += 2) {
      PS.atlas.writePixel(cell, i, 0, color);
      if ((i + offset) % 4 === 0) {
        PS.atlas.writePixel(cell, i, 1, shadow);
      }
    }
  }

  if (mask & 4) {
    for (i = 1; i < 16; i += 2) {
      PS.atlas.writePixel(cell, i, 15, color);
      if ((i + offset) % 5 === 0) {
        PS.atlas.writePixel(cell, i, 14, shadow);
      }
    }
  }

  if (mask & 1) {
    for (i = 0; i < 16; i += 2) {
      PS.atlas.writePixel(cell, 15, i, color);
      if ((i + offset) % 4 === 0) {
        PS.atlas.writePixel(cell, 14, i, shadow);
      }
    }
  }

  if (mask & 2) {
    for (i = 1; i < 16; i += 2) {
      PS.atlas.writePixel(cell, 0, i, color);
      if ((i + offset) % 5 === 0) {
        PS.atlas.writePixel(cell, 1, i, shadow);
      }
    }
  }
};

PS.atlas.getTerrainEcologyDetailInfo = function (sample) {
  var ecology = sample && sample.ecology ? sample.ecology : null;
  var foodPressure = clamp(Number(ecology && ecology.foodPressure) || 0, 0, 1);
  var organismPressure = clamp(Number(ecology && ecology.organismPressure) || 0, 0, 1);
  var organicMatter = clamp(Number(ecology && ecology.organicMatter) || 0, 0, 1);
  var pressure = Math.max(foodPressure, organismPressure, organicMatter);

  if (!ecology || pressure < 0.18) {
    return null;
  }

  return {
    foodBucket: Math.min(3, Math.floor(foodPressure * 4)),
    organismBucket: Math.min(3, Math.floor(Math.max(organismPressure, organicMatter) * 4)),
    pressure: pressure
  };
};

PS.atlas.drawTerrainEcologyMicrostructure = function (cell, palette, variant, sample) {
  var ecology = PS.atlas.getTerrainEcologyDetailInfo(sample);
  var light = ecology ? PS.atlas.getTerrainDetailColor(palette, "light") : null;
  var warm = ecology ? PS.atlas.getTerrainDetailColor(palette, "warm") : null;
  var shadow = ecology ? PS.atlas.getTerrainDetailColor(palette, "shadow") : null;
  var sprout = light ? [
    clamp(Math.round(light[0] + 10), 0, 255),
    clamp(Math.round(light[1] + 28), 0, 255),
    clamp(Math.round(light[2] - 18), 0, 255),
    255
  ] : null;
  var track = warm ? [
    clamp(Math.round(warm[0] + 18), 0, 255),
    clamp(Math.round(warm[1] + 18), 0, 255),
    clamp(Math.round(warm[2] - 30), 0, 255),
    255
  ] : null;
  var microPhase = Number.isFinite(Number(sample && sample.terrainEcologyMicroPhase))
    ? Number(sample.terrainEcologyMicroPhase)
    : 0;
  var phase = clamp(Math.round((Number(variant) || 0) + microPhase * 3), 0, 15);
  var foodMarks;
  var organismMarks;
  var i;
  var x;
  var y;

  if (!ecology) {
    return;
  }

  foodMarks = 2 + ecology.foodBucket * 2;
  organismMarks = 1 + ecology.organismBucket * 2;

  for (i = 0; i < foodMarks; i++) {
    x = 2 + ((phase * 3 + i * 5) % 12);
    y = 2 + ((phase * 7 + i * 3) % 12);
    PS.atlas.writePixel(cell, x, y, shadow);
    PS.atlas.writeDot(cell, x, Math.max(1, y - 1), ecology.foodBucket >= 2 && i % 3 === 0 ? 1 : 0, sprout);
  }

  for (i = 0; i < organismMarks; i++) {
    x = 1 + ((phase * 5 + i * 4) % 14);
    y = 3 + ((phase * 2 + i * 5) % 10);
    PS.atlas.writePixel(cell, x, y, track);
    if (ecology.organismBucket >= 2) {
      PS.atlas.writePixel(cell, Math.min(15, x + 1), y, track);
    }
    if (ecology.organismBucket >= 3 && i % 2 === 0) {
      PS.atlas.writePixel(cell, x, Math.min(15, y + 1), shadow);
    }
  }
};

PS.atlas.getTerrainFeatureInfo = function (sample, biome, tileDefinition) {
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || {};
  var surface = String(detail.surface || "").toLowerCase();
  var pattern = PS.atlas.getTerrainPatternForTile
    ? PS.atlas.getTerrainPatternForTile(tileDefinition, PS.atlas.getTerrainPalette(biome).pattern)
    : String(PS.atlas.getTerrainPalette(biome).pattern || "grit");
  var pressure = Math.max(
    Number(signals.surfaceRoughness) || 0,
    Number(signals.wetness) || 0,
    Number(signals.waterDepth) || 0,
    Number(signals.snow) || 0,
    Number(signals.organicMatter) || 0,
    Number(detail.roughness) || 0,
    Number(detail.elevation) || 0,
    Number(tileDefinition && tileDefinition.baseFertility) || 0
  );
  var type = "field";

  if (pattern === "wave" || pattern === "shore" || pattern === "stream" || surface.indexOf("water") >= 0 || surface.indexOf("river") >= 0) {
    type = "foam";
    pressure = Math.max(pressure, Number(signals.waterDepth) || Number(tileDefinition && tileDefinition.waterDepth) || 0.4);
  } else if (pattern === "canopy" || surface.indexOf("wood") >= 0 || surface.indexOf("canopy") >= 0) {
    type = "canopy";
    pressure = Math.max(pressure, Number(tileDefinition && tileDefinition.baseFertility) || 0.55);
  } else if (pattern === "ridge" || surface.indexOf("rock") >= 0 || surface.indexOf("stone") >= 0) {
    type = "ridge";
    pressure = Math.max(pressure, Number(detail.roughness) || 0.62);
  } else if (pattern === "dune" || surface.indexOf("sand") >= 0 || surface.indexOf("dune") >= 0) {
    type = "scrub";
    pressure = Math.max(pressure, 0.46);
  } else if (pattern === "frost" || pattern === "crack" || pattern === "lichen" || surface.indexOf("snow") >= 0 || surface.indexOf("ice") >= 0 || surface.indexOf("lichen") >= 0) {
    type = "frost";
    pressure = Math.max(pressure, Number(signals.snow) || Number(signals.lichen) || 0.52);
  } else if (pattern === "lava") {
    type = "ember";
    pressure = 1;
  } else if (pattern === "reed") {
    type = "reed";
    pressure = Math.max(pressure, Number(signals.wetness) || 0.58);
  }

  pressure = clamp(pressure, 0, 1);

  if (pressure < 0.22) {
    return null;
  }

  return {
    type: type,
    bucket: clamp(Math.floor(pressure * 4), 1, 3),
    pressure: pressure
  };
};

PS.atlas.getTerrainFeatureKey = function (sample, biome, tileDefinition) {
  var feature = PS.atlas.getTerrainFeatureInfo(sample, biome, tileDefinition);

  if (!feature) {
    return "feature0";
  }

  return "feature." + feature.type + "." + feature.bucket;
};

PS.atlas.drawTerrainFeatureMarks = function (cell, palette, variant, sample, biome, tileDefinition) {
  var feature = PS.atlas.getTerrainFeatureInfo(sample, biome, tileDefinition);
  var light = feature ? PS.atlas.getTerrainDetailColor(palette, "light") : null;
  var warm = feature ? PS.atlas.getTerrainDetailColor(palette, "warm") : null;
  var shadow = feature ? PS.atlas.getTerrainDetailColor(palette, "shadow") : null;
  var phase = clamp(Math.round(Number(variant) || 0), 0, 15);
  var i;
  var x;
  var y;

  if (!feature) {
    return;
  }

  for (i = 0; i < 2 + feature.bucket; i++) {
    x = 2 + ((phase * 5 + i * 4) % 12);
    y = 2 + ((phase * 7 + i * 3) % 12);

    if (feature.type === "foam") {
      PS.atlas.writeTerrainDash(cell, Math.max(0, x - 1), y, 3, true, light);
      PS.atlas.writePixel(cell, x, Math.min(15, y + 1), shadow);
    } else if (feature.type === "canopy") {
      PS.atlas.writeDot(cell, x, y, feature.bucket >= 2 ? 2 : 1, shadow);
      PS.atlas.writePixel(cell, x, Math.max(0, y - 1), light);
    } else if (feature.type === "ridge") {
      PS.atlas.writeTerrainDash(cell, x, Math.max(0, y - 1), 3 + feature.bucket, false, shadow);
      PS.atlas.writePixel(cell, Math.min(15, x + 1), y, light);
    } else if (feature.type === "scrub") {
      PS.atlas.writePixel(cell, x, y, warm);
      PS.atlas.writePixel(cell, Math.min(15, x + 1), Math.max(0, y - 1), light);
      PS.atlas.writePixel(cell, Math.max(0, x - 1), Math.min(15, y + 1), shadow);
    } else if (feature.type === "frost") {
      PS.atlas.writePixel(cell, x, y, light);
      PS.atlas.writePixel(cell, Math.min(15, x + 1), y, light);
      PS.atlas.writePixel(cell, x, Math.min(15, y + 1), shadow);
    } else if (feature.type === "ember") {
      PS.atlas.writeDot(cell, x, y, feature.bucket >= 3 ? 1 : 0, warm);
      PS.atlas.writePixel(cell, Math.min(15, x + 1), y, light);
    } else if (feature.type === "reed") {
      PS.atlas.writeTerrainDash(cell, x, y, 3 + feature.bucket, false, light);
      PS.atlas.writePixel(cell, Math.max(0, x - 1), Math.min(15, y + 2), shadow);
    } else {
      PS.atlas.writePixel(cell, x, y, light);
      PS.atlas.writePixel(cell, Math.min(15, x + 1), Math.min(15, y + 1), shadow);
    }
  }
};

PS.atlas.drawTerrainDetailOverlay = function (cell, palette, variant, tileDefinition, biome, sample) {
  var pattern = String(palette && palette.pattern || "grit");
  var light = PS.atlas.getTerrainDetailColor(palette, "light");
  var warm = PS.atlas.getTerrainDetailColor(palette, "warm");
  var shadow = PS.atlas.getTerrainDetailColor(palette, "shadow");
  var offset = clamp(Math.round(Number(variant) || 0), 0, 15);
  var transition = PS.atlas.getTerrainTransitionInfo(sample, biome);

  if (transition) {
    transition.gradientColor = PS.atlas.getTerrainTransitionGradientColor(sample, transition);
  }

  function finish() {
    PS.atlas.drawTerrainFeatureMarks(cell, palette, variant, sample, biome, tileDefinition);
    if (typeof PS.atlas.drawTerrainCivilizationMarks === "function") {
      PS.atlas.drawTerrainCivilizationMarks(cell, palette, variant, sample);
    }
    PS.atlas.drawTerrainEcologyMicrostructure(cell, palette, variant, sample);
    if (transition) {
      PS.atlas.drawTerrainTransitionEdge(cell, palette, variant, transition);
    }
  }

  if (pattern === "wave") {
    PS.atlas.writeTerrainTexturedMask(
      cell,
      PS.atlas.getTerrainWaterStencilMask(sample, biome),
      PS.atlas.getTerrainOverlayGroundColor(sample, palette),
      offset
    );
    PS.atlas.writeTerrainDash(cell, 1 + offset % 3, 4, 7, true, light);
    PS.atlas.writeTerrainDash(cell, 8 - offset % 2, 10, 6, true, light);
    PS.atlas.writeTerrainDash(cell, 3, 13, 4, true, shadow);
    finish();
    return;
  }

  if (pattern === "stream") {
    PS.atlas.writeTerrainDash(cell, 5, 0, 16, false, shadow);
    PS.atlas.writeTerrainDash(cell, 6 + offset % 3, 0, 16, false, light);
    PS.atlas.writeTerrainDash(cell, 9, 2, 12, false, warm);
    finish();
    return;
  }

  if (pattern === "shore") {
    PS.atlas.writeTerrainDash(cell, 0, 5 + offset % 4, 6, true, light);
    PS.atlas.writeTerrainDash(cell, 7, 7, 7, true, warm);
    PS.atlas.writeTerrainDash(cell, 2, 11, 10, true, shadow);
    finish();
    return;
  }

  if (pattern === "canopy") {
    PS.atlas.writeDot(cell, 4, 4, 2, shadow);
    PS.atlas.writeDot(cell, 10, 7, 2, light);
    PS.atlas.writeDot(cell, 6 + offset % 4, 12, 1, warm);
    finish();
    return;
  }

  if (pattern === "grass") {
    PS.atlas.writeTerrainDash(cell, 3, 3, 4, false, light);
    PS.atlas.writeTerrainDash(cell, 9, 7, 5, false, warm);
    PS.atlas.writeTerrainDash(cell, 13, 4, 3, false, shadow);
    finish();
    return;
  }

  if (pattern === "reed") {
    PS.atlas.writeTerrainDash(cell, 3, 3, 9, false, light);
    PS.atlas.writeTerrainDash(cell, 7, 5, 8, false, warm);
    PS.atlas.writeTerrainDash(cell, 12, 2, 10, false, shadow);
    finish();
    return;
  }

  if (pattern === "dune") {
    PS.atlas.writeTerrainDash(cell, 1, 5, 9, true, light);
    PS.atlas.writeTerrainDash(cell, 5, 9, 9, true, warm);
    PS.atlas.writeTerrainDash(cell, 2, 12, 6, true, shadow);
    finish();
    return;
  }

  if (pattern === "ridge") {
    PS.atlas.writeTerrainDash(cell, 4, 2, 11, false, shadow);
    PS.atlas.writeTerrainDash(cell, 5, 3, 10, false, light);
    PS.atlas.writeTerrainDash(cell, 10, 7, 5, false, warm);
    finish();
    return;
  }

  if (pattern === "frost" || pattern === "crack") {
    PS.atlas.writeTerrainDash(cell, 2, 3, 11, true, light);
    PS.atlas.writeTerrainDash(cell, 5, 8, 8, true, shadow);
    PS.atlas.writeTerrainDash(cell, 10, 1, 8, false, light);
    finish();
    return;
  }

  if (pattern === "lichen") {
    PS.atlas.writeDot(cell, 4, 4, 2, light);
    PS.atlas.writeDot(cell, 11, 6, 1, warm);
    PS.atlas.writeDot(cell, 7 + offset % 4, 12, 2, shadow);
    finish();
    return;
  }

  if (pattern === "lava") {
    PS.atlas.writeTerrainDash(cell, 2, 6, 10, true, warm);
    PS.atlas.writeTerrainDash(cell, 7, 2, 12, false, warm);
    PS.atlas.writeDot(cell, 12, 12, 2, light);
    finish();
    return;
  }

  PS.atlas.writeDot(cell, 4, 5, 1, light);
  PS.atlas.writeDot(cell, 10, 9, 1, warm);
  PS.atlas.writeDot(cell, 13, 3, 1, shadow);
  finish();
};
