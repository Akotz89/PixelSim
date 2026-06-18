import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getPlanetSurfaceSnowSignal } from "./planet-surface.js";
import { blendHexColors, blendRgbWithHex, clampRgb, shadeRgb } from "./terrain.js";

PS.render = PS.render || {};
PS.render.surfaceLandform = PS.render.surfaceLandform || {};

function makeLandformMaterialContext(color, latitude, longitude, tile) {
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

  return {
    biome: biome,
    coarse: coarse,
    fine: fine,
    fleck: fleck,
    ridge: ridge,
    roughness: roughness,
    coast: coast,
    shallowWater: shallowWater,
    snowSignal: snowSignal,
    snowVisual: PS.render.surfaceLandform.getCloudlessSnowVisualAmount(biome, snowSignal, polar, highland, ridge),
    material: color
  };
}

function applyOceanMaterialAccent(context) {
  context.material = blendRgbWithHex(context.material, context.coarse > 0.58 ? "#0d4e70" : "#03152f", clamp(0.035 + context.fine * 0.045, 0, 0.08));
  context.material = blendRgbWithHex(context.material, "#6fb9b1", clamp(context.shallowWater * 0.10 + context.coast * 0.05 + context.fleck * context.coast * 0.05, 0, 0.16));
}

function applyForestMaterialAccent(context) {
  context.material = blendRgbWithHex(context.material, context.coarse > 0.50 ? "#143d21" : "#06180e", clamp(0.05 + context.fine * 0.08, 0, 0.13));
  context.material = blendRgbWithHex(context.material, "#2d6b35", clamp(context.fleck * 0.045, 0, 0.06));
}

function applyGrasslandMaterialAccent(context) {
  context.material = blendRgbWithHex(context.material, context.coarse > 0.54 ? "#7c8d42" : "#244d28", clamp(0.045 + context.fine * 0.065, 0, 0.12));
  context.material = blendRgbWithHex(context.material, "#917638", clamp((1 - context.fine) * 0.04, 0, 0.06));
}

function applyDesertMaterialAccent(context) {
  context.material = blendRgbWithHex(context.material, context.coarse > 0.48 ? "#c2a25a" : "#755e31", clamp(0.055 + context.fine * 0.070, 0, 0.14));
  context.material = blendRgbWithHex(context.material, "#564f43", clamp((context.ridge + context.roughness) * 0.035 + context.fleck * 0.035, 0, 0.09));
}

function applyTundraMaterialAccent(context) {
  context.material = blendRgbWithHex(context.material, context.coarse > 0.50 ? "#7f8b78" : "#465a50", clamp(0.045 + context.fine * 0.060, 0, 0.12));
  context.material = blendRgbWithHex(context.material, "#cfd9d7", clamp(context.snowSignal * 0.18, 0, 0.22));
}

function applyIceMaterialAccent(context) {
  context.material = blendRgbWithHex(context.material, context.coarse > 0.48 ? "#f0f8f9" : "#8fbfd1", clamp(0.08 + context.fine * 0.08, 0, 0.18));
  context.material = blendRgbWithHex(context.material, "#d7eef7", clamp(context.fleck * 0.08, 0, 0.10));
}

var LANDFORM_MATERIAL_ACCENT_HANDLERS = {
  ocean: applyOceanMaterialAccent,
  forest: applyForestMaterialAccent,
  grassland: applyGrasslandMaterialAccent,
  desert: applyDesertMaterialAccent,
  tundra: applyTundraMaterialAccent,
  ice: applyIceMaterialAccent
};

PS.render.surfaceLandform.applyMaterialPixelAccents = function applyLandformMaterialPixelAccents(color, latitude, longitude, tile) {
  var context = makeLandformMaterialContext(color, latitude, longitude, tile);
  var handler = LANDFORM_MATERIAL_ACCENT_HANDLERS[context.biome];

  if (handler) {
    handler(context);
  }

  context.material = blendRgbWithHex(context.material, "#68655a", clamp(context.ridge * 0.08 + context.roughness * 0.05, 0, 0.15));

  if (context.biome !== "ice") {
    context.material = blendRgbWithHex(context.material, "#e6f2f3", clamp(context.snowVisual * 0.72, 0, 0.18));
  }

  return clampRgb(shadeRgb(context.material, clamp(0.94 + (context.coarse - 0.5) * 0.10 + (context.fine - 0.5) * 0.08, 0.84, 1.08)));
};

PS.render.surfaceLandform.makeImagerySignalTile = function makeLandformImagerySignalTile(biome, signals, latitude) {
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

PS.render.surfaceLandform.getCloudlessSnowVisualAmount = function getLandformCloudlessSnowVisualAmount(biome, snowSignal, polar, highland, ridge) {
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

export function getPlanetCloudlessSnowVisualAmount(biome, snowSignal, polar, highland, ridge) {
  return PS.render.surfaceLandform.getCloudlessSnowVisualAmount(biome, snowSignal, polar, highland, ridge);
}

function makeLandformIdentityContext(biome, signals, noise, surfaceMeters, normalizedLatitude) {
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

  return {
    biome: normalizedBiome,
    elevation: elevation,
    moisture: moisture,
    coast: coast,
    shelf: shelf,
    river: river,
    riverMouth: riverMouth,
    snowSignal: snowSignal,
    polar: polar,
    highland: highland,
    dry: dry,
    relief: relief,
    brokenBands: brokenBands,
    broad: broad
  };
}

function makeBaseLandformIdentity(context) {
  return {
    type: "lowland",
    color: "#5f6b45",
    amount: clamp(0.025 + context.relief * 0.09 + Math.abs(context.broad - 0.5) * 0.04, 0, 0.18),
    snowcap: 0,
    relief: context.relief
  };
}

function applyOceanLandformIdentity(identity, context) {
    var basin = clamp((1 - context.elevation) * 0.52 + (1 - context.shelf) * 0.36 + (1 - context.coast) * 0.12, 0, 1);

    identity.type = context.shelf > 0.34 || context.coast > 0.42 || context.riverMouth > 0.18 ? "continental-shelf" : "deep-basin";
    identity.color = identity.type === "continental-shelf" ? "#7bc7ad" : "#001229";
    identity.amount = clamp(0.05 + basin * 0.12 + context.shelf * 0.16 + context.coast * 0.08 + context.brokenBands * 0.035, 0, 0.25);
}

function applyForestLandformIdentity(identity, context) {
    identity.type = context.relief > 0.50 ? "forested-highland" : "canopy";
    identity.color = context.moisture > 0.56 ? "#0b2e19" : "#26452a";
    identity.amount = clamp(0.05 + context.moisture * 0.08 + (1 - context.brokenBands) * 0.04 + context.relief * 0.035, 0, 0.19);
}

function applyGrasslandLandformIdentity(identity, context) {
    identity.type = context.dry > 0.50 ? "dry-plain" : "green-plain";
    identity.color = context.dry > 0.50 ? "#9b853f" : "#3f7137";
    identity.amount = clamp(0.04 + context.moisture * 0.045 + context.dry * 0.075 + context.relief * 0.05, 0, 0.18);
}

function applyDesertLandformIdentity(identity, context) {
    identity.type = context.relief > 0.46 ? "rocky-desert" : "dune-field";
    identity.color = identity.type === "rocky-desert" ? "#6b6250" : "#c0a057";
    identity.amount = clamp(0.07 + context.dry * 0.10 + context.brokenBands * 0.07 + context.relief * 0.06, 0, 0.24);
}

function applyTundraLandformIdentity(identity, context) {
    identity.type = context.polar > 0.40 ? "cold-steppe" : "scrubland";
    identity.color = context.polar > 0.40 ? "#8c9a91" : "#596c60";
    identity.amount = clamp(0.05 + context.polar * 0.07 + context.relief * 0.06 + context.brokenBands * 0.03, 0, 0.20);
}

function applyIceLandformIdentity(identity, context) {
    identity.type = context.relief > 0.36 ? "ice-ridge" : "ice-sheet";
    identity.color = identity.type === "ice-ridge" ? "#83b9ce" : "#eaf6f8";
    identity.amount = clamp(0.08 + context.polar * 0.10 + context.relief * 0.08 + (1 - context.brokenBands) * 0.035, 0, 0.26);
}

function applyHighlandLandformIdentity(identity, context) {
  if (context.biome !== "ice" && context.relief > 0.54) {
    identity.type = context.relief > 0.68 || context.highland > 0.62 ? "mountain-highland" : identity.type;
    identity.color = blendHexColors(identity.color, "#777264", clamp(0.24 + context.relief * 0.28, 0, 0.52));
    identity.amount = clamp(identity.amount + context.relief * 0.08, 0, 0.24);
    identity.snowcap = clamp((context.snowSignal * 0.36 + context.polar * 0.18) * context.relief - 0.06, 0, 0.16);
  }
}

function applyCoastalLandformIdentity(identity, context) {
  if (context.coast > 0.42 || context.shelf > 0.44) {
    identity.type = identity.type === "mountain-highland" ? identity.type : "coastal-" + identity.type;
    identity.color = blendHexColors(identity.color, "#b5ab70", clamp(context.coast * 0.22 + context.shelf * 0.12, 0, 0.30));
    identity.amount = clamp(identity.amount + context.coast * 0.04 + context.shelf * 0.035, 0, 0.25);
  }
}

function applyRiverLandformIdentity(identity, context) {
  if (context.river > 0.40) {
    identity.color = blendHexColors(identity.color, "#245d70", clamp(context.river * 0.38, 0, 0.42));
    identity.amount = clamp(identity.amount + context.river * 0.04, 0, 0.25);
  }
}

var LANDFORM_IDENTITY_HANDLERS = {
  ocean: applyOceanLandformIdentity,
  forest: applyForestLandformIdentity,
  grassland: applyGrasslandLandformIdentity,
  desert: applyDesertLandformIdentity,
  tundra: applyTundraLandformIdentity,
  ice: applyIceLandformIdentity
};

PS.render.surfaceLandform.getGlobeLandformIdentity = function getGlobeLandformIdentity(biome, signals, noise, surfaceMeters, normalizedLatitude) {
  var context = makeLandformIdentityContext(biome, signals, noise, surfaceMeters, normalizedLatitude);
  var identity = makeBaseLandformIdentity(context);
  var handler = LANDFORM_IDENTITY_HANDLERS[context.biome];

  if (handler) {
    handler(identity, context);
  }

  if (context.biome !== "ocean") {
    applyHighlandLandformIdentity(identity, context);
    applyCoastalLandformIdentity(identity, context);
    applyRiverLandformIdentity(identity, context);
  }

  return identity;
};

function makeTerrainBandContext(biome, signals, noise, normalizedLatitude) {
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

  return {
    biome: normalizedBiome,
    elevation: elevation,
    moisture: moisture,
    highland: highland,
    coast: coast,
    shelf: shelf,
    river: river,
    polar: polar,
    bandNoise: bandNoise,
    relief: relief,
    dry: dry
  };
}

function makeBaseTerrainBand(context) {
  return {
    color: "#6b6a5f",
    amount: clamp(0.025 + context.relief * 0.16 + context.bandNoise * 0.045, 0, 0.24),
    relief: context.relief,
    bandNoise: context.bandNoise
  };
}

function applyOceanTerrainBand(band, context) {
  band.amount = clamp(0.04 + context.shelf * 0.14 + context.coast * 0.07 + (1 - context.elevation) * 0.035, 0, 0.20);
  band.color = context.shelf > 0.36 || context.coast > 0.40 ? "#69b7a6" : "#021631";
}

function applyForestTerrainBand(band, context) {
  band.color = context.relief > 0.44 ? "#5f674b" : (context.moisture > 0.58 ? "#0a2516" : "#24442a");
  band.amount = clamp(band.amount + context.moisture * 0.035 - context.dry * 0.025, 0, 0.23);
}

function applyGrasslandTerrainBand(band, context) {
  band.color = context.relief > 0.50 ? "#77735a" : (context.dry > 0.48 ? "#a08a43" : "#47723a");
}

function applyDesertTerrainBand(band, context) {
  band.color = context.relief > 0.42 ? "#786b53" : "#c3a456";
  band.amount = clamp(band.amount + context.dry * 0.05, 0, 0.27);
}

function applyTundraTerrainBand(band, context) {
  band.color = context.relief > 0.36 || context.polar > 0.32 ? "#a3aca1" : "#5f7068";
  band.amount = clamp(band.amount + context.polar * 0.035, 0, 0.25);
}

function applyIceTerrainBand(band, context) {
  band.color = context.relief > 0.38 ? "#88bdd2" : "#f2fbff";
  band.amount = clamp(0.04 + context.relief * 0.10 + context.polar * 0.045, 0, 0.19);
}

function applyRiverTerrainBand(band, context) {
  if (context.river > 0.36 && context.biome !== "ocean" && context.biome !== "ice") {
    band.color = "#245d70";
    band.amount = clamp(band.amount + context.river * 0.08, 0, 0.28);
  }
}

var TERRAIN_BAND_HANDLERS = {
  ocean: applyOceanTerrainBand,
  forest: applyForestTerrainBand,
  grassland: applyGrasslandTerrainBand,
  desert: applyDesertTerrainBand,
  tundra: applyTundraTerrainBand,
  ice: applyIceTerrainBand
};

PS.render.surfaceLandform.getTerrainBand = function getLandformTerrainBand(biome, signals, noise, normalizedLatitude) {
  var context = makeTerrainBandContext(biome, signals, noise, normalizedLatitude);
  var band = makeBaseTerrainBand(context);
  var handler = TERRAIN_BAND_HANDLERS[context.biome];

  if (handler) {
    handler(band, context);
  }

  applyRiverTerrainBand(band, context);

  return band;
};

export function getPlanetLandformTerrainBand(biome, signals, noise, normalizedLatitude) {
  return PS.render.surfaceLandform.getTerrainBand(biome, signals, noise, normalizedLatitude);
}

