"use strict";
PS.render = PS.render || {};
PS.render.surfaceLandform = PS.render.surfaceLandform || {};

PS.render.surfaceLandform.applyMaterialPixelAccents = function (color, latitude, longitude, tile) {
  var biome = tile && tile.biome ? tile.biome : "unknown";
  var coarse = PS.render.terrain.getMaterialPixelNoise(latitude, longitude, 18000, 503);
  var fine = PS.render.terrain.getMaterialPixelNoise(latitude, longitude, 6200, 607);
  var fleck = PS.render.terrain.getMaterialPixelNoise(latitude, longitude, 2200, 709);
  var ridge = clamp(tile && Number.isFinite(Number(tile.ridgeStrength)) ? Number(tile.ridgeStrength) : 0, 0, 1);
  var roughness = clamp(tile && Number.isFinite(Number(tile.roughness)) ? Number(tile.roughness) : 0, 0, 1);
  var coast = clamp(tile && Number.isFinite(Number(tile.coastFactor)) ? Number(tile.coastFactor) : 0, 0, 1);
  var absLatitude = Math.abs(Number(latitude) || 0);
  var elevationValue = tile && Number.isFinite(Number(tile.elevation)) ? Number(tile.elevation) : 0;
  var elevation = clamp((Math.tanh(elevationValue / 2) + 1) / 2, 0, 1);
  var highland = clamp((elevation - 0.58) / 0.34, 0, 1);
  var polar = clamp((absLatitude - 54) / 32, 0, 1);
  var shallowWater = clamp(Math.max(
    tile && Number.isFinite(Number(tile.shallowWater)) ? Number(tile.shallowWater) : 0,
    tile && Number.isFinite(Number(tile.shelfStrength)) ? Number(tile.shelfStrength) : 0
  ), 0, 1);
  var snowSignal = getPlanetSurfaceSnowSignal(tile, latitude);
  var snowVisual = PS.render.surfaceLandform.getCloudlessSnowVisualAmount(biome, snowSignal, polar, highland, ridge);
  var material = color;

  if (biome === "ocean") {
    material = blendRgbWithHex(material, coarse > 0.58 ? "#0d4e70" : "#03152f", clamp(0.035 + fine * 0.045, 0, 0.08));
    material = blendRgbWithHex(material, "#6fb9b1", clamp(shallowWater * 0.10 + coast * 0.05 + fleck * coast * 0.05, 0, 0.16));
  } else if (biome === "forest") {
    material = blendRgbWithHex(material, coarse > 0.50 ? "#143d21" : "#06180e", clamp(0.05 + fine * 0.08, 0, 0.13));
    material = blendRgbWithHex(material, "#2d6b35", clamp(fleck * 0.045, 0, 0.06));
  } else if (biome === "grassland") {
    material = blendRgbWithHex(material, coarse > 0.54 ? "#7c8d42" : "#244d28", clamp(0.045 + fine * 0.065, 0, 0.12));
    material = blendRgbWithHex(material, "#917638", clamp((1 - fine) * 0.04, 0, 0.06));
  } else if (biome === "desert") {
    material = blendRgbWithHex(material, coarse > 0.48 ? "#c2a25a" : "#755e31", clamp(0.055 + fine * 0.070, 0, 0.14));
    material = blendRgbWithHex(material, "#564f43", clamp((ridge + roughness) * 0.035 + fleck * 0.035, 0, 0.09));
  } else if (biome === "tundra") {
    material = blendRgbWithHex(material, coarse > 0.50 ? "#7f8b78" : "#465a50", clamp(0.045 + fine * 0.060, 0, 0.12));
    material = blendRgbWithHex(material, "#cfd9d7", clamp(snowSignal * 0.18, 0, 0.22));
  } else if (biome === "ice") {
    material = blendRgbWithHex(material, coarse > 0.48 ? "#f0f8f9" : "#8fbfd1", clamp(0.08 + fine * 0.08, 0, 0.18));
    material = blendRgbWithHex(material, "#d7eef7", clamp(fleck * 0.08, 0, 0.10));
  }

  material = blendRgbWithHex(material, "#68655a", clamp(ridge * 0.08 + roughness * 0.05, 0, 0.15));

  if (biome !== "ice") {
    material = blendRgbWithHex(material, "#e6f2f3", clamp(snowVisual * 0.72, 0, 0.18));
  }

  return clampRgb(shadeRgb(material, clamp(0.94 + (coarse - 0.5) * 0.10 + (fine - 0.5) * 0.08, 0.84, 1.08)));
};

PS.render.surfaceLandform.makeImagerySignalTile = function (biome, signals, latitude) {
  return {
    biome: biome,
    latitude: latitude,
    moisture: signals.moisture,
    elevation: signals.elevation,
    highlandLift: signals.highlandLift,
    coastFactor: signals.coastFactor,
    coastlineNoise: signals.coastlineNoise,
    shallowWater: signals.shallowWater,
    shelfStrength: signals.shelfStrength,
    riverStrength: signals.riverStrength,
    riverMouth: signals.riverMouth,
    ridgeStrength: signals.ridgeStrength,
    roughness: signals.roughness,
    terrainSlope: signals.terrainSlope,
    terrainHillshade: signals.terrainHillshade
  };
};

PS.render.surfaceLandform.getCloudlessSnowVisualAmount = function (biome, snowSignal, polar, highland, ridge) {
  var normalizedSnow = clamp(Number(snowSignal) || 0, 0, 1);
  var normalizedPolar = clamp(Number(polar) || 0, 0, 1);
  var normalizedHighland = clamp(Number(highland) || 0, 0, 1);
  var normalizedRidge = clamp(Number(ridge) || 0, 0, 1);
  var mountainGate = clamp(normalizedHighland * 0.52 + normalizedRidge * 0.28 + normalizedPolar * 0.48, 0, 1);

  if (biome === "ice") {
    return clamp(0.12 + normalizedSnow * 0.16 + normalizedPolar * 0.06, 0, 0.32);
  }

  if (biome === "ocean") {
    return clamp(normalizedSnow * normalizedPolar * 0.026, 0, 0.035);
  }

  if (biome === "tundra") {
    return clamp(normalizedSnow * mountainGate * 0.14 + normalizedPolar * 0.026, 0, 0.15);
  }

  return clamp(normalizedSnow * mountainGate * 0.075, 0, 0.09);
};

function getPlanetCloudlessSnowVisualAmount(biome, snowSignal, polar, highland, ridge) {
  return PS.render.surfaceLandform.getCloudlessSnowVisualAmount(biome, snowSignal, polar, highland, ridge);
}

PS.render.surfaceLandform.getGlobeLandformIdentity = function (biome, signals, noise, surfaceMeters, normalizedLatitude) {
  var normalizedBiome = biome || "unknown";
  var elevation = clamp((Math.tanh((Number(signals && signals.elevation) || 0) / 2) + 1) / 2, 0, 1);
  var moisture = clamp((Number(signals && signals.moisture) || 0.8) / 1.8, 0, 1);
  var coast = clamp(Number(signals && signals.coastFactor) || 0, 0, 1);
  var shelf = clamp(Math.max(Number(signals && signals.shallowWater) || 0, Number(signals && signals.shelfStrength) || 0), 0, 1);
  var river = clamp(Number(signals && signals.riverStrength) || 0, 0, 1);
  var riverMouth = clamp(Number(signals && signals.riverMouth) || 0, 0, 1);
  var ridge = clamp(Number(signals && signals.ridgeStrength) || 0, 0, 1);
  var roughness = clamp(Number(signals && signals.roughness) || 0, 0, 1);
  var slope = clamp(Number(signals && signals.terrainSlope) || 0, 0, 1);
  var snowSignal = clamp(Number(signals && signals.snowSignal) || 0, 0, 1);
  var broad = clamp(Number(noise && noise.broad) || 0.5, 0, 1);
  var regional = clamp(Number(noise && noise.regional) || 0.5, 0, 1);
  var local = clamp(Number(noise && noise.local) || 0.5, 0, 1);
  var fine = clamp(Number(noise && noise.fine) || 0.5, 0, 1);
  var eastMeters = Number(surfaceMeters && surfaceMeters.eastMeters) || 0;
  var northMeters = Number(surfaceMeters && surfaceMeters.northMeters) || 0;
  var polar = clamp((Math.abs(Number(normalizedLatitude) || 0) - 54) / 32, 0, 1);
  var highland = clamp((elevation - 0.58) / 0.34, 0, 1);
  var dry = clamp(1 - moisture, 0, 1);
  var relief = clamp(highland * 0.34 + ridge * 0.34 + roughness * 0.17 + slope * 0.15, 0, 1);
  var directionalBands = Math.sin(eastMeters * 0.000018 + northMeters * 0.000010 + regional * Math.PI * 2) * 0.5 + 0.5;
  var brokenBands = clamp(directionalBands * 0.62 + local * 0.24 + fine * 0.14, 0, 1);
  var identity = {
    type: "lowland",
    color: "#5f6b45",
    amount: clamp(0.025 + relief * 0.09 + Math.abs(broad - 0.5) * 0.04, 0, 0.18),
    snowcap: 0,
    relief: relief
  };

  if (normalizedBiome === "ocean") {
    var basin = clamp((1 - elevation) * 0.52 + (1 - shelf) * 0.36 + (1 - coast) * 0.12, 0, 1);

    identity.type = shelf > 0.34 || coast > 0.42 || riverMouth > 0.18 ? "continental-shelf" : "deep-basin";
    identity.color = identity.type === "continental-shelf" ? "#7bc7ad" : "#001229";
    identity.amount = clamp(0.05 + basin * 0.12 + shelf * 0.16 + coast * 0.08 + brokenBands * 0.035, 0, 0.25);
    return identity;
  }

  if (normalizedBiome === "forest") {
    identity.type = relief > 0.50 ? "forested-highland" : "canopy";
    identity.color = moisture > 0.56 ? "#0b2e19" : "#26452a";
    identity.amount = clamp(0.05 + moisture * 0.08 + (1 - brokenBands) * 0.04 + relief * 0.035, 0, 0.19);
  } else if (normalizedBiome === "grassland") {
    identity.type = dry > 0.50 ? "dry-plain" : "green-plain";
    identity.color = dry > 0.50 ? "#9b853f" : "#3f7137";
    identity.amount = clamp(0.04 + moisture * 0.045 + dry * 0.075 + relief * 0.05, 0, 0.18);
  } else if (normalizedBiome === "desert") {
    identity.type = relief > 0.46 ? "rocky-desert" : "dune-field";
    identity.color = identity.type === "rocky-desert" ? "#6b6250" : "#c0a057";
    identity.amount = clamp(0.07 + dry * 0.10 + brokenBands * 0.07 + relief * 0.06, 0, 0.24);
  } else if (normalizedBiome === "tundra") {
    identity.type = polar > 0.40 ? "cold-steppe" : "scrubland";
    identity.color = polar > 0.40 ? "#8c9a91" : "#596c60";
    identity.amount = clamp(0.05 + polar * 0.07 + relief * 0.06 + brokenBands * 0.03, 0, 0.20);
  } else if (normalizedBiome === "ice") {
    identity.type = relief > 0.36 ? "ice-ridge" : "ice-sheet";
    identity.color = identity.type === "ice-ridge" ? "#83b9ce" : "#eaf6f8";
    identity.amount = clamp(0.08 + polar * 0.10 + relief * 0.08 + (1 - brokenBands) * 0.035, 0, 0.26);
  }

  if (normalizedBiome !== "ice" && relief > 0.54) {
    identity.type = relief > 0.68 || highland > 0.62 ? "mountain-highland" : identity.type;
    identity.color = blendHexColors(identity.color, "#777264", clamp(0.24 + relief * 0.28, 0, 0.52));
    identity.amount = clamp(identity.amount + relief * 0.08, 0, 0.24);
    identity.snowcap = clamp((snowSignal * 0.36 + polar * 0.18) * relief - 0.06, 0, 0.16);
  }

  if (coast > 0.42 || shelf > 0.44) {
    identity.type = identity.type === "mountain-highland" ? identity.type : "coastal-" + identity.type;
    identity.color = blendHexColors(identity.color, "#b5ab70", clamp(coast * 0.22 + shelf * 0.12, 0, 0.30));
    identity.amount = clamp(identity.amount + coast * 0.04 + shelf * 0.035, 0, 0.25);
  }

  if (river > 0.40) {
    identity.color = blendHexColors(identity.color, "#245d70", clamp(river * 0.38, 0, 0.42));
    identity.amount = clamp(identity.amount + river * 0.04, 0, 0.25);
  }

  return identity;
};

PS.render.surfaceLandform.getTerrainBand = function (biome, signals, noise, normalizedLatitude) {
  var normalizedBiome = biome || "unknown";
  var elevationValue = signals && Number.isFinite(Number(signals.elevation)) ? Number(signals.elevation) : 0;
  var moistureValue = signals && Number.isFinite(Number(signals.moisture)) ? Number(signals.moisture) : 0.8;
  var elevation = clamp((Math.tanh(elevationValue) + 1) / 2, 0, 1);
  var moisture = clamp(moistureValue / 1.8, 0, 1);
  var highland = clamp((elevation - 0.58) / 0.34, 0, 1);
  var ridge = clamp(signals && Number.isFinite(Number(signals.ridgeStrength)) ? Number(signals.ridgeStrength) : 0, 0, 1);
  var roughness = clamp(signals && Number.isFinite(Number(signals.roughness)) ? Number(signals.roughness) : 0, 0, 1);
  var slope = clamp(signals && Number.isFinite(Number(signals.terrainSlope)) ? Number(signals.terrainSlope) : 0, 0, 1);
  var hillshade = clamp(signals && Number.isFinite(Number(signals.terrainHillshade)) ? Number(signals.terrainHillshade) : 0.55, 0, 1);
  var coast = clamp(signals && Number.isFinite(Number(signals.coastFactor)) ? Number(signals.coastFactor) : 0, 0, 1);
  var shelf = clamp(Math.max(
    signals && Number.isFinite(Number(signals.shallowWater)) ? Number(signals.shallowWater) : 0,
    signals && Number.isFinite(Number(signals.shelfStrength)) ? Number(signals.shelfStrength) : 0
  ), 0, 1);
  var river = clamp(signals && Number.isFinite(Number(signals.riverStrength)) ? Number(signals.riverStrength) : 0, 0, 1);
  var polar = clamp((Math.abs(Number(normalizedLatitude) || 0) - 54) / 32, 0, 1);
  var regional = noise ? clamp(Number(noise.regional) || 0, 0, 1) : 0.5;
  var fine = noise ? clamp(Number(noise.fine) || 0, 0, 1) : 0.5;
  var bandNoise = Math.round(clamp(regional * 0.55 + fine * 0.45, 0, 1) * 6) / 6;
  var relief = clamp(highland * 0.34 + ridge * 0.28 + roughness * 0.13 + slope * 0.17 + Math.abs(hillshade - 0.5) * 0.12, 0, 1);
  var dry = clamp(1 - moisture, 0, 1);
  var amount = clamp(0.025 + relief * 0.16 + bandNoise * 0.045, 0, 0.24);
  var color = "#6b6a5f";

  if (normalizedBiome === "ocean") {
    amount = clamp(0.04 + shelf * 0.14 + coast * 0.07 + (1 - elevation) * 0.035, 0, 0.20);
    color = shelf > 0.36 || coast > 0.40 ? "#69b7a6" : "#021631";
  } else if (normalizedBiome === "forest") {
    color = relief > 0.44 ? "#5f674b" : (moisture > 0.58 ? "#0a2516" : "#24442a");
    amount = clamp(amount + moisture * 0.035 - dry * 0.025, 0, 0.23);
  } else if (normalizedBiome === "grassland") {
    color = relief > 0.50 ? "#77735a" : (dry > 0.48 ? "#a08a43" : "#47723a");
  } else if (normalizedBiome === "desert") {
    color = relief > 0.42 ? "#786b53" : "#c3a456";
    amount = clamp(amount + dry * 0.05, 0, 0.27);
  } else if (normalizedBiome === "tundra") {
    color = relief > 0.36 || polar > 0.32 ? "#a3aca1" : "#5f7068";
    amount = clamp(amount + polar * 0.035, 0, 0.25);
  } else if (normalizedBiome === "ice") {
    color = relief > 0.38 ? "#88bdd2" : "#f2fbff";
    amount = clamp(0.04 + relief * 0.10 + polar * 0.045, 0, 0.19);
  }

  if (river > 0.36 && normalizedBiome !== "ocean" && normalizedBiome !== "ice") {
    color = "#245d70";
    amount = clamp(amount + river * 0.08, 0, 0.28);
  }

  return {
    color: color,
    amount: amount,
    relief: relief,
    bandNoise: bandNoise
  };
};

function getPlanetLandformTerrainBand(biome, signals, noise, normalizedLatitude) {
  return PS.render.surfaceLandform.getTerrainBand(biome, signals, noise, normalizedLatitude);
}
