"use strict";
PS.render = PS.render || {};
PS.render.surfaceImagery = PS.render.surfaceImagery || {};

PS.render.surfaceImagery.getVisualBiome = function (biome, signals, latitude) {
  var normalizedBiome = biome || "unknown";
  var elevation = clamp((Math.tanh(Number(signals && signals.elevation) || 0) + 1) / 2, 0, 1);
  var moisture = clamp((Number(signals && signals.moisture) || 0) / 1.8, 0, 1);
  var ridge = clamp(Number(signals && signals.ridgeStrength) || 0, 0, 1);
  var roughness = clamp(Number(signals && signals.roughness) || 0, 0, 1);
  var river = clamp(Number(signals && signals.riverStrength) || 0, 0, 1);
  var coast = clamp(Number(signals && signals.coastFactor) || 0, 0, 1);
  var shallowWater = clamp(Number(signals && signals.shallowWater) || 0, 0, 1);
  var polar = clamp((Math.abs(Number(latitude) || 0) - 54) / 32, 0, 1);
  var wetland = clamp(river * 0.55 + coast * 0.28 + shallowWater * 0.18 + moisture * 0.20, 0, 1);
  var mountain = clamp(ridge * 0.52 + roughness * 0.20 + Math.max(0, elevation - 0.62) * 0.90, 0, 1);
  var barren = clamp((1 - moisture) * 0.54 + roughness * 0.24 + Math.max(0, 0.42 - elevation) * 0.20, 0, 1);

  if (normalizedBiome === "ocean" || normalizedBiome === "ice") {
    return normalizedBiome;
  }

  if (mountain > 0.62 && polar < 0.88) {
    return "mountain";
  }

  if (wetland > 0.58 && normalizedBiome !== "desert") {
    return "wetland";
  }

  if (barren > 0.66 && normalizedBiome !== "forest") {
    return "barren";
  }

  return normalizedBiome;
};

PS.render.surfaceImagery.getRegionalCartographicAccent = function (biome, signals, noise, surfaceMeters, latitude) {
  var visualBiome = PS.render.surfaceImagery.getVisualBiome(biome, signals, latitude);
  var regional = clamp(Number(noise && noise.regional) || 0.5, 0, 1);
  var fine = clamp(Number(noise && noise.fine) || 0.5, 0, 1);
  var eastMeters = Number(surfaceMeters && surfaceMeters.eastMeters) || 0;
  var northMeters = Number(surfaceMeters && surfaceMeters.northMeters) || 0;
  var contour = Math.sin(eastMeters * 0.000033 + northMeters * 0.000019) * 0.5 + 0.5;
  var ridge = clamp(Number(signals && signals.ridgeStrength) || 0, 0, 1);
  var roughness = clamp(Number(signals && signals.roughness) || 0, 0, 1);
  var river = clamp(Number(signals && signals.riverStrength) || 0, 0, 1);
  var coast = clamp(Number(signals && signals.coastFactor) || 0, 0, 1);
  var shallowWater = clamp(Number(signals && signals.shallowWater) || 0, 0, 1);
  var shelf = clamp(Number(signals && signals.shelfStrength) || 0, 0, 1);
  var moisture = clamp((Number(signals && signals.moisture) || 0) / 1.8, 0, 1);
  var snow = clamp(Number(signals && signals.snowSignal) || 0, 0, 1);

  if (visualBiome === "ocean") {
    return {
      type: shallowWater + shelf + coast > 0.72 ? "shelf-current" : "deep-current",
      color: shallowWater + shelf + coast > 0.72 ? "#8ccfc2" : "#0c5b83",
      amount: clamp(0.035 + (shallowWater + shelf + coast) * 0.09 + contour * 0.035, 0.03, 0.18)
    };
  }

  if (ridge > 0.42 || roughness > 0.68 || visualBiome === "mountain") {
    return {
      type: "ridge-comb",
      color: snow > 0.42 ? "#e8f4f3" : "#c8bc86",
      amount: clamp(0.04 + ridge * 0.16 + roughness * 0.07 + contour * 0.04, 0.04, 0.24)
    };
  }

  if (river > 0.28 || coast > 0.48 || visualBiome === "wetland") {
    return {
      type: river > coast ? "river-thread" : "coast-thread",
      color: river > coast ? "#7ec8ff" : "#d7bd78",
      amount: clamp(0.035 + Math.max(river, coast) * 0.14 + regional * 0.035, 0.035, 0.22)
    };
  }

  if (visualBiome === "forest") {
    return {
      type: "canopy-mosaic",
      color: regional > fine ? "#071f12" : "#5d7041",
      amount: clamp(0.035 + moisture * 0.06 + Math.abs(regional - fine) * 0.08, 0.035, 0.14)
    };
  }

  if (visualBiome === "desert" || visualBiome === "barren") {
    return {
      type: "dry-contour",
      color: visualBiome === "desert" ? "#c8a85b" : "#746a4e",
      amount: clamp(0.035 + (1 - moisture) * 0.08 + contour * 0.035, 0.035, 0.16)
    };
  }

  if (visualBiome === "ice" || visualBiome === "tundra") {
    return {
      type: visualBiome === "ice" ? "ice-grain" : "frost-mosaic",
      color: visualBiome === "ice" ? "#d6eef7" : "#dce5df",
      amount: clamp(0.025 + snow * 0.08 + contour * 0.025, 0.025, 0.13)
    };
  }

  return {
    type: "field-mosaic",
    color: "#8fcf71",
    amount: clamp(0.025 + regional * 0.035 + moisture * 0.035, 0.025, 0.12)
  };
};

PS.render.surfaceImagery.applyRegionalCartographicAccent = function (rgb, biome, signals, noise, surfaceMeters, latitude) {
  var accent = PS.render.surfaceImagery.getRegionalCartographicAccent(biome, signals, noise, surfaceMeters, latitude);
  var grain = PS.render.surfaceNoise.getLayerNoise({
    eastMeters: Number(surfaceMeters && surfaceMeters.eastMeters) || 0,
    northMeters: Number(surfaceMeters && surfaceMeters.northMeters) || 0
  }, 18000, 89);
  var amount = clamp(Number(accent.amount) * (0.62 + grain * 0.62), 0, 0.28);

  return blendRgbWithHex(rgb, accent.color, amount);
};

PS.render.surfaceImagery.getBiomeRgb = function (baseColor, biome, signals, surfaceMeters, noise, texture, normalizedLatitude, normalizedLongitude) {
  var visualBiome = PS.render.surfaceImagery.getVisualBiome(biome, signals, normalizedLatitude);
  var color = clampRgb(baseColor);
  var broad = noise ? clamp(Number(noise.broad) || 0, 0, 1) : 0.5;
  var regional = noise ? clamp(Number(noise.regional) || 0, 0, 1) : 0.5;
  var local = noise ? clamp(Number(noise.local) || 0, 0, 1) : 0.5;
  var fine = noise ? clamp(Number(noise.fine) || 0, 0, 1) : 0.5;
  var micro = noise ? clamp(Number(noise.micro) || 0, 0, 1) : 0.5;
  var elevation = clamp((Math.tanh(signals.elevation / 2) + 1) / 2, 0, 1);
  var moisture = clamp(signals.moisture / 1.8, 0, 1);
  var highland = clamp((elevation - 0.58) / 0.34, 0, 1);
  var dry = clamp(1 - moisture, 0, 1);
  var polar = clamp((Math.abs(normalizedLatitude) - 54) / 32, 0, 1);
  var coast = clamp(signals.coastFactor, 0, 1);
  var shallowWater = clamp(Math.max(signals.shallowWater, signals.shelfStrength), 0, 1);
  var coastlineNoise = clamp(signals.coastlineNoise, 0, 1);
  var river = clamp(signals.riverStrength, 0, 1);
  var riverMouth = clamp(signals.riverMouth, 0, 1);
  var ridge = clamp(signals.ridgeStrength, 0, 1);
  var roughness = clamp(signals.roughness, 0, 1);
  var snowSignal = clamp(signals.snowSignal, 0, 1);
  var signalTile = PS.render.surfaceLandform.makeImagerySignalTile(visualBiome, signals, normalizedLatitude);
  var wetlandStrength = clamp(river * 0.55 + coast * 0.28 + shallowWater * 0.18 + moisture * 0.20, 0, 1);
  var reliefBand = clamp(highland * 0.38 + ridge * 0.34 + roughness * 0.16 + regional * 0.12, 0, 1);
  var weathering = clamp((broad - 0.5) * 0.34 + (local - 0.5) * 0.22 + (fine - 0.5) * 0.14 + 0.5, 0, 1);
  var terrainGrain = clamp((regional - 0.5) * 0.36 + (fine - 0.5) * 0.28 + (micro - 0.5) * 0.18 + 0.5, 0, 1);
  var snowVisual = PS.render.surfaceLandform.getCloudlessSnowVisualAmount(biome, snowSignal, polar, highland, ridge);
  var terrainShade = clamp(
    0.50 +
      texture * 0.68 +
      (signals.terrainHillshade - 0.5) * 0.20 +
      ridge * 0.035 +
      highland * 0.025 -
      reliefBand * 0.018,
    0,
    1
  );
  var terrainBand = PS.render.surfaceLandform.getTerrainBand(biome, signals, noise, normalizedLatitude);
  var landformIdentity = PS.render.surfaceLandform.getGlobeLandformIdentity(biome, signals, noise, surfaceMeters, normalizedLatitude);

  if (visualBiome === "ocean") {
    var current = Math.sin((surfaceMeters.eastMeters * 0.000021) + (surfaceMeters.northMeters * 0.000011)) * 0.5 + 0.5;
    var gyre = Math.sin((surfaceMeters.eastMeters * 0.000006) - (surfaceMeters.northMeters * 0.000017)) * 0.5 + 0.5;
    var depth = clamp((1 - shallowWater) * 0.58 + (1 - elevation) * 0.32 + (1 - coast) * 0.10, 0, 1);
    var shelf = clamp(shallowWater * 0.72 + coast * 0.34 + riverMouth * 0.22 + coastlineNoise * coast * 0.08, 0, 1);

    color = blendRgbWithHex(color, "#001027", clamp(depth * 0.22, 0, 0.24));
    color = blendRgbWithHex(color, "#06405f", clamp((1 - depth) * 0.10 + current * 0.04, 0, 0.14));
    color = blendRgbWithHex(color, "#0d7894", clamp(shelf * 0.26 + gyre * 0.035, 0, 0.30));
    color = blendRgbWithHex(color, "#8ccfc2", clamp(shelf * coast * 0.24, 0, 0.24));
    color = blendRgbWithHex(color, terrainBand.color, terrainBand.amount);
    color = blendRgbWithHex(color, landformIdentity.color, landformIdentity.amount);
    color = blendRgbWithHex(color, "#d9edf4", snowVisual);
    return PS.render.surfaceImagery.applyRegionalCartographicAccent(PS.render.surfaceLandform.applyMaterialPixelAccents(
      clampRgb(shadeRgb(color, clamp(terrainShade - 0.02 + current * 0.035 + shelf * 0.08 - depth * 0.05, 0, 1))),
      normalizedLatitude,
      normalizedLongitude,
      signalTile
    ), biome, signals, noise, surfaceMeters, normalizedLatitude);
  }

  if (visualBiome === "forest") {
    color = blendRgbWithHex(color, "#071f12", clamp(0.06 + moisture * 0.12 + terrainGrain * 0.04, 0, 0.20));
    color = blendRgbWithHex(color, "#2d6532", clamp(regional * moisture * 0.10 + weathering * 0.035, 0, 0.14));
    color = blendRgbWithHex(color, "#5d7041", clamp(reliefBand * 0.07, 0, 0.10));
  } else if (visualBiome === "grassland") {
    color = blendRgbWithHex(color, "#6f8a3f", clamp(0.06 + moisture * 0.09 + regional * 0.04, 0, 0.16));
    color = blendRgbWithHex(color, "#9a843f", clamp((1 - moisture) * 0.12 + weathering * 0.05, 0, 0.18));
    color = blendRgbWithHex(color, "#365c36", clamp(moisture * (1 - reliefBand) * 0.06, 0, 0.08));
  } else if (visualBiome === "desert") {
    var dune = Math.sin((surfaceMeters.eastMeters + surfaceMeters.northMeters * 0.48) / 85000) * 0.5 + 0.5;
    color = blendRgbWithHex(color, "#c8a85b", clamp(0.10 + dune * 0.10 + fine * 0.05, 0, 0.22));
    color = blendRgbWithHex(color, "#7e6734", clamp((1 - dune) * 0.08 + regional * 0.05, 0, 0.16));
    color = blendRgbWithHex(color, "#5f6154", clamp(reliefBand * 0.12 + roughness * 0.04, 0, 0.18));
  } else if (visualBiome === "wetland") {
    color = blendRgbWithHex(color, "#123b35", clamp(0.12 + wetlandStrength * 0.16 + moisture * 0.08, 0, 0.28));
    color = blendRgbWithHex(color, "#2f6a56", clamp(regional * 0.08 + river * 0.14, 0, 0.20));
    color = blendRgbWithHex(color, "#5f7147", clamp((1 - terrainGrain) * 0.06 + coast * 0.05, 0, 0.12));
  } else if (visualBiome === "mountain") {
    color = blendRgbWithHex(color, "#3f403a", clamp(0.12 + ridge * 0.16 + roughness * 0.08, 0, 0.30));
    color = blendRgbWithHex(color, "#8a897c", clamp(highland * 0.18 + terrainShade * 0.05, 0, 0.22));
    color = blendRgbWithHex(color, "#e6eeee", clamp(snowVisual + ridge * polar * 0.08, 0, 0.16));
  } else if (visualBiome === "barren") {
    color = blendRgbWithHex(color, "#484334", clamp(0.14 + dry * 0.14 + roughness * 0.06, 0, 0.28));
    color = blendRgbWithHex(color, "#746a4e", clamp(weathering * 0.08 + highland * 0.06, 0, 0.16));
    color = blendRgbWithHex(color, "#2b312b", clamp(moisture * 0.05, 0, 0.08));
  } else if (visualBiome === "tundra") {
    color = blendRgbWithHex(color, "#788777", clamp(0.06 + polar * 0.09 + terrainGrain * 0.05, 0, 0.18));
    color = blendRgbWithHex(color, "#dce5df", clamp(polar * 0.08 + highland * 0.045 + snowVisual * 0.50, 0, 0.18));
    color = blendRgbWithHex(color, "#555e5b", clamp(reliefBand * 0.08, 0, 0.12));
  } else if (visualBiome === "ice") {
    color = blendRgbWithHex(color, "#f3fbff", clamp(0.14 + polar * 0.15 + broad * 0.06, 0, 0.32));
    color = blendRgbWithHex(color, "#8fc6dc", clamp(local * 0.06 + (1 - fine) * 0.05 + reliefBand * 0.04, 0, 0.14));
    color = blendRgbWithHex(color, "#d6eef7", clamp(terrainGrain * 0.06, 0, 0.08));
  }

  color = blendRgbWithHex(color, landformIdentity.color, landformIdentity.amount);
  color = blendRgbWithHex(color, terrainBand.color, terrainBand.amount);
  color = blendRgbWithHex(color, "#244f63", river * 0.18);
  color = blendRgbWithHex(color, "#c8bd82", coast * 0.08);
  color = blendRgbWithHex(color, "#6f6b5d", clamp(highland * 0.11 + ridge * 0.13 + roughness * 0.05, 0, 0.24));
  color = blendRgbWithHex(color, "#e8f4f3", clamp(snowVisual + landformIdentity.snowcap, 0, visualBiome === "ice" ? 0.34 : 0.18));
  return PS.render.surfaceImagery.applyRegionalCartographicAccent(PS.render.surfaceLandform.applyMaterialPixelAccents(
    clampRgb(shadeRgb(color, clamp(terrainShade - (1 - moisture) * 0.02, 0, 1))),
    normalizedLatitude,
    normalizedLongitude,
    signalTile
  ), biome, signals, noise, surfaceMeters, normalizedLatitude);
};

PS.render.surfaceImagery.getRgbAtLatLon = function (latitude, longitude, tileRgbCache) {
  var normalizedLatitude = clamp(Number(latitude) || 0, -90, 90);
  var normalizedLongitude = normalizeLongitude(longitude);
  var warped = PS.render.terrain.getImageryWarpedLatLon(normalizedLatitude, normalizedLongitude);
  var surfaceMeters = getSurfaceMeterCoordinate(warped.latitude, warped.longitude);
  var broad = PS.render.surfaceNoise.getLayerNoise(surfaceMeters, 260000, 17);
  var regional = PS.render.surfaceNoise.getLayerNoise(surfaceMeters, 82000, 31);
  var local = PS.render.surfaceNoise.getLayerNoise(surfaceMeters, 26000, 47);
  var fine = PS.render.surfaceNoise.getLayerNoise(surfaceMeters, 8200, 59);
  var micro = PS.render.surfaceNoise.getLayerNoise(surfaceMeters, 2600, 67);
  var baseColor = clampRgb(PS.render.terrain.getSurfaceRgbAtLatLon(warped.latitude, warped.longitude, tileRgbCache));
  var signals = PS.render.terrain.getImageryBlendSignals(warped.latitude, warped.longitude);
  var biomeWeights = signals.biomeWeights || {};
  var biomeNames = Object.keys(biomeWeights);
  var noise = {
    broad: broad,
    regional: regional,
    local: local,
    fine: fine,
    micro: micro
  };
  var texture = (broad - 0.5) * 0.10 + (regional - 0.5) * 0.08 + (local - 0.5) * 0.06 + (fine - 0.5) * 0.04 + (micro - 0.5) * 0.035;
  var mixed = { red: 0, green: 0, blue: 0 };
  var totalWeight = 0;

  if (biomeNames.length === 0) {
    biomeNames = [signals.dominantBiome || "unknown"];
    biomeWeights[biomeNames[0]] = 1;
  }

  biomeNames.forEach(function(biome) {
    var weight = clamp(Number(biomeWeights[biome]) || 0, 0, 1);
    var candidate;

    if (weight <= 0) {
      return;
    }

    candidate = PS.render.surfaceImagery.getBiomeRgb(
      baseColor,
      biome,
      signals,
      surfaceMeters,
      noise,
      texture,
      warped.latitude,
      warped.longitude
    );
    mixed.red += candidate.red * weight;
    mixed.green += candidate.green * weight;
    mixed.blue += candidate.blue * weight;
    totalWeight += weight;
  });

  if (totalWeight <= 0) {
    return PS.render.terrain.getPixelArtQuantizedRgb(
      PS.render.surfaceImagery.getBiomeRgb(
        baseColor,
        signals.dominantBiome || "unknown",
        signals,
        surfaceMeters,
        noise,
        texture,
        warped.latitude,
        warped.longitude
      ),
      warped.latitude,
      warped.longitude
    );
  }

  return PS.render.terrain.getPixelArtQuantizedRgb({
    red: mixed.red / totalWeight,
    green: mixed.green / totalWeight,
    blue: mixed.blue / totalWeight
  }, warped.latitude, warped.longitude);
};

PS.render.surfaceImagery.getTileCompositedColor = function (tile) {
  var biome = tile && tile.biome ? tile.biome : "unknown";
  var latitude = tile && Number.isFinite(Number(tile.latitude)) ? Number(tile.latitude) : 0;
  var absLatitude = Math.abs(latitude);
  var elevationValue = tile && Number.isFinite(Number(tile.elevation)) ? Number(tile.elevation) : 0;
  var elevation = clamp((Math.tanh(elevationValue / 2) + 1) / 2, 0, 1);
  var moisture = clamp(tile && Number.isFinite(Number(tile.moisture)) ? Number(tile.moisture) / 1.8 : 0.45, 0, 1);
  var polar = clamp((absLatitude - 54) / 32, 0, 1);
  var highland = clamp((elevation - 0.58) / 0.34, 0, 1);
  var dry = clamp(1 - moisture, 0, 1);
  var coast = clamp(tile && Number.isFinite(Number(tile.coastFactor)) ? Number(tile.coastFactor) : 0, 0, 1);
  var shallowWater = clamp(Math.max(
    tile && Number.isFinite(Number(tile.shallowWater)) ? Number(tile.shallowWater) : 0,
    tile && Number.isFinite(Number(tile.shelfStrength)) ? Number(tile.shelfStrength) : 0
  ), 0, 1);
  var river = clamp(tile && Number.isFinite(Number(tile.riverStrength)) ? Number(tile.riverStrength) : 0, 0, 1);
  var riverMouth = clamp(tile && Number.isFinite(Number(tile.riverMouth)) ? Number(tile.riverMouth) : 0, 0, 1);
  var terrainSlope = clamp(tile && Number.isFinite(Number(tile.terrainSlope)) ? Number(tile.terrainSlope) : 0, 0, 1);
  var terrainHillshade = clamp(tile && Number.isFinite(Number(tile.terrainHillshade)) ? Number(tile.terrainHillshade) : 0.55, 0, 1);
  var ridge = clamp(tile && Number.isFinite(Number(tile.ridgeStrength)) ? Number(tile.ridgeStrength) : 0, 0, 1);
  var roughness = clamp(tile && Number.isFinite(Number(tile.roughness)) ? Number(tile.roughness) : 0, 0, 1);
  var snowSignal = getPlanetSurfaceSnowSignal(tile, latitude);
  var snowVisual = PS.render.surfaceLandform.getCloudlessSnowVisualAmount(biome, snowSignal, polar, highland, ridge);
  var visualBiome = PS.render.surfaceImagery.getVisualBiome(biome, {
    elevation: elevationValue,
    moisture: tile && Number.isFinite(Number(tile.moisture)) ? Number(tile.moisture) : 0,
    coastFactor: coast,
    shallowWater: shallowWater,
    riverStrength: river,
    ridgeStrength: ridge,
    roughness: roughness
  }, latitude);
  var color;

  if (visualBiome === "ocean") {
    var shallow = Math.max(clamp((elevation - 0.18) / 0.34, 0, 1), shallowWater);

    color = blendHexColors("#031026", "#0a4f76", shallow);
    color = blendHexColors(color, "#2b6f87", shallow * 0.24);
    color = blendHexColors(color, "#7fb7a7", shallowWater * 0.35);
    color = blendHexColors(color, "#a3d7ca", riverMouth * 0.38);
    color = blendHexColors(color, "#d9edf4", polar * 0.22);
    return PS.render.terrain.applyDeepTimeHexTint(shadeHexColor(color, 0.48 + shallow * 0.22 + (1 - polar) * 0.05));
  }

  if (visualBiome === "forest") {
    color = blendHexColors("#0b2718", "#2d6432", moisture);
    color = blendHexColors(color, "#1f3d25", highland * 0.42);
  } else if (visualBiome === "grassland") {
    color = blendHexColors("#597737", "#2f6a35", moisture);
    color = blendHexColors(color, "#8b7a3b", dry * 0.32);
  } else if (visualBiome === "desert") {
    color = blendHexColors("#8c6f35", "#c2a45a", clamp(0.35 + dry * 0.58, 0, 1));
    color = blendHexColors(color, "#6c624d", highland * 0.30);
  } else if (visualBiome === "wetland") {
    color = blendHexColors("#173e34", "#2f7158", clamp(0.30 + moisture * 0.42 + river * 0.18, 0, 1));
    color = blendHexColors(color, "#6c7450", clamp(coast * 0.20 + shallowWater * 0.12, 0, 0.26));
  } else if (visualBiome === "mountain") {
    color = blendHexColors("#3b3c36", "#858476", clamp(0.26 + terrainHillshade * 0.38 + highland * 0.24, 0, 1));
    color = blendHexColors(color, "#eef4f2", clamp(snowVisual + polar * ridge * 0.08, 0, 0.20));
  } else if (visualBiome === "barren") {
    color = blendHexColors("#383529", "#756a4b", clamp(0.28 + dry * 0.42 + roughness * 0.16, 0, 1));
    color = blendHexColors(color, "#29302a", clamp(moisture * 0.08, 0, 0.12));
  } else if (visualBiome === "tundra") {
    color = blendHexColors("#4f6356", "#8c9380", clamp(0.25 + polar * 0.45, 0, 1));
    color = blendHexColors(color, "#5e5f58", highland * 0.38);
  } else if (visualBiome === "ice") {
    color = blendHexColors("#a9d1df", "#f0f7f8", clamp(0.40 + polar * 0.55, 0, 1));
  } else {
    color = getPlanetBiomeColor(biome);
  }

  color = blendHexColors(color, "#224f63", river * 0.45);
  color = blendHexColors(color, "#b6b06a", coast * 0.18);
  if (PS.epochs && PS.epochs.primordial && typeof PS.epochs.primordial.getSoupIntensityForTile === "function") {
    var soupIntensity = PS.epochs.primordial.getSoupIntensityForTile(tile);
    color = blendHexColors(color, "#7fbf82", soupIntensity * 0.38);
    color = blendHexColors(color, "#d9b85f", soupIntensity * shallowWater * 0.20);
  }
  color = blendHexColors(color, "#6d6a60", clamp(terrainSlope * 0.22 + roughness * 0.08, 0, 0.30));
  color = blendHexColors(color, "#6f6a5c", clamp(highland * 0.20 + ridge * 0.18, 0, 0.32));
  color = blendHexColors(
    color,
    "#eef6f5",
    visualBiome === "ice" ? clamp(snowSignal * 0.42, 0, 0.52) : clamp(snowVisual * 0.85, 0, 0.22)
  );
  return PS.render.terrain.applyDeepTimeHexTint(shadeHexColor(
    color,
    clamp(0.28 + terrainHillshade * 0.40 + elevation * 0.12 + moisture * 0.05 + ridge * 0.035 - dry * 0.05, 0, 1)
  ));
};

function getPlanetTileCompositedColor(tile) {
  return PS.render.surfaceImagery.getTileCompositedColor(tile);
}
