import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getPlanetSurfaceTileBlend } from "./planet-view.js";

PS.render = PS.render || {};
PS.render.surfaceMaterial = PS.render.surfaceMaterial || {};

PS.render.surfaceMaterial.getShorelineRefinement = function (latitude, longitude, tile, lod) {
  var biome = tile && tile.biome ? tile.biome : "unknown";
  var coast = clamp(tile && Number.isFinite(Number(tile.coastFactor)) ? Number(tile.coastFactor) : 0, 0, 1);
  var shallowWater = clamp(Math.max(
    tile && Number.isFinite(Number(tile.shallowWater)) ? Number(tile.shallowWater) : 0,
    tile && Number.isFinite(Number(tile.shelfStrength)) ? Number(tile.shelfStrength) : 0
  ), 0, 1);
  var sampleMeters = Math.max(1, Number(lod && lod.sampleMeters) || 1);
  var meters = {
    eastMeters: Number(lod && lod.eastMeters) || 0,
    northMeters: Number(lod && lod.northMeters) || 0
  };
  var tileBlend = Number.isFinite(Number(longitude)) && typeof getPlanetSurfaceTileBlend === "function"
    ? getPlanetSurfaceTileBlend(latitude, longitude)
    : null;
  var biomeWeights = tileBlend && tileBlend.biomeWeights ? tileBlend.biomeWeights : {};
  var oceanWeight = Number.isFinite(Number(biomeWeights.ocean))
    ? clamp(Number(biomeWeights.ocean), 0, 1)
    : (biome === "ocean" ? 1 : 0);
  var landWeight = clamp(1 - oceanWeight, 0, 1);
  var blendedEdge = clamp(Math.min(oceanWeight, landWeight) * 2, 0, 1);
  var closeScale = clamp((30 - sampleMeters) / 29, 0, 1);
  var shorelineStrength = clamp(Math.max(coast, shallowWater, blendedEdge) * closeScale, 0, 1);
  var shorelineNoise = clamp(
    PS.render.surfaceNoise.getLayerNoise(meters, Math.max(12, sampleMeters * 10), 71) * 0.68 +
      PS.render.surfaceNoise.getPixelNoise(meters, Math.max(1, sampleMeters * 3), 73) * 0.32,
    0,
    1
  );
  var beachBand = clamp(1 - Math.abs(shorelineNoise - 0.52) * 2.35, 0, 1);
  var waterPocket = clamp(shorelineStrength * (oceanWeight * 0.58 + shallowWater * 0.36 + coast * 0.18 + Math.max(0, shorelineNoise - 0.52) * 0.72), 0, 1);
  var landPocket = clamp(shorelineStrength * (landWeight * 0.58 + coast * 0.14 + Math.max(0, 0.52 - shorelineNoise) * 0.72), 0, 1);

  if (shorelineStrength <= 0) {
    waterPocket = 0;
    landPocket = 0;
    beachBand = 0;
  }

  return {
    strength: shorelineStrength,
    noise: shorelineNoise,
    oceanWeight: oceanWeight,
    landWeight: landWeight,
    beach: clamp(shorelineStrength * beachBand, 0, 1),
    waterPocket: waterPocket,
    landPocket: landPocket
  };
};

PS.render.surfaceMaterial.getSignals = function (latitude, tile, lod, relief, longitude) {
  var biome = tile && tile.biome ? tile.biome : "unknown";
  var regional = lod && lod.regional ? lod.regional : PS.render.surfaceNoise.getRegionalContext(tile);
  var moisture = clamp(tile && Number.isFinite(Number(tile.moisture)) ? Number(tile.moisture) / 2.2 : 0.35, 0, 1);
  var river = clamp(tile && Number.isFinite(Number(tile.riverStrength)) ? Number(tile.riverStrength) : 0, 0, 1);
  var coast = clamp(tile && Number.isFinite(Number(tile.coastFactor)) ? Number(tile.coastFactor) : 0, 0, 1);
  var shallowWater = clamp(Math.max(
    tile && Number.isFinite(Number(tile.shallowWater)) ? Number(tile.shallowWater) : 0,
    tile && Number.isFinite(Number(tile.shelfStrength)) ? Number(tile.shelfStrength) : 0
  ), 0, 1);
  var tileRoughness = clamp(tile && Number.isFinite(Number(tile.roughness)) ? Number(tile.roughness) : 0, 0, 1);
  var ridge = clamp(tile && Number.isFinite(Number(tile.ridgeStrength)) ? Number(tile.ridgeStrength) : 0, 0, 1);
  var snow = PS.render.surfaceNoise.getSnowSignal(tile, latitude);
  var surfaceRoughness = clamp(lod.roughness * 0.46 + relief.slope * 0.32 + tileRoughness * 0.13 + regional.islandArc * 0.06 + regional.highlandLift * 0.05 - regional.shelfStrength * 0.04, 0, 1);
  var shoreline = PS.render.surfaceMaterial.getShorelineRefinement(latitude, longitude, tile, lod);
  var wetness = clamp(moisture * 0.44 + river * 0.34 + coast * 0.16 + (1 - lod.ground) * 0.06 + regional.shelfStrength * 0.06 + shoreline.waterPocket * 0.18 + shoreline.beach * 0.04, 0, 1);
  var canopyDensity = clamp(lod.canopy * 0.50 + moisture * 0.22 + lod.continental * 0.08 + regional.continentShape * 0.06 - relief.slope * 0.18 + (1 - ridge) * 0.08, 0, 1);
  var waterDepth = biome === "ocean"
    ? clamp((-relief.heightMeters - 180) / 4200 - Math.max(shallowWater, shoreline.landPocket, regional.shelfStrength) * 0.38 + (1 - lod.landform) * 0.12, 0, 1)
    : clamp(shoreline.waterPocket * 0.18, 0, 1);
  var chop = biome === "ocean"
    ? clamp(lod.ground * 0.38 + lod.micro * 0.32 + relief.slope * 0.20 + (1 - waterDepth) * 0.10 + shoreline.waterPocket * 0.08, 0, 1)
    : 0;
  var dryness = clamp(1 - moisture + (1 - wetness) * 0.22 + regional.plateInfluence * 0.04 - regional.shelfStrength * 0.05, 0, 1);

  return {
    moisture: moisture,
    wetness: wetness,
    snow: snow,
    canopyDensity: canopyDensity,
    surfaceRoughness: surfaceRoughness,
    waterDepth: waterDepth,
    chop: chop,
    dryness: dryness,
    river: river,
    coast: Math.max(coast, shoreline.strength),
    shallowWater: Math.max(shallowWater, shoreline.waterPocket, shoreline.landPocket * 0.45),
    ridge: ridge,
    continentShape: regional.continentShape,
    plateInfluence: regional.plateInfluence,
    islandArc: regional.islandArc,
    shelfStrength: regional.shelfStrength,
    seaLevelDelta: regional.seaLevelDelta,
    highlandLift: regional.highlandLift,
    coastlineNoise: regional.coastlineNoise,
    shorelineStrength: shoreline.strength,
    shorelineNoise: shoreline.noise,
    shorelineBeach: shoreline.beach,
    shorelineWater: shoreline.waterPocket,
    shorelineLand: shoreline.landPocket
  };
};

/**
 * @description Classifies a surface sample into a render material and feature by combining biome, latitude, LOD noise, relief, shoreline, hydrology, and elevation signals.
 * @param {number} latitude Sample latitude in degrees.
 * @param {string} biome Normalized biome id for the sample.
 * @param {Object} lod Level-of-detail noise and meter-scale signals.
 * @param {Object} relief Relief, slope, and hillshade signals for the sample.
 * @param {Object|null} tile Planet tile data associated with the sample.
 * @param {number} longitude Sample longitude in degrees.
 * @returns {Object} Material classification with surface, feature, and signal metadata.
 */
PS.render.surfaceMaterial.classify = function (latitude, biome, lod, relief, tile, longitude) {
  var signals = PS.render.surfaceMaterial.getSignals(latitude, tile, lod, relief, longitude);
  var surface = "ground";
  var feature = "plain";

  if (biome === "ocean") {
    if (signals.shorelineBeach > 0.42 && signals.shorelineLand > signals.shorelineWater * 0.75) {
      surface = "sand";
      feature = "tidal flat";
    } else if (signals.chop > 0.78 && signals.waterDepth < 0.78) {
      surface = "whitecap";
      feature = "surface chop";
    } else if (signals.waterDepth > 0.66) {
      surface = "deep water";
      feature = "deep channel";
    } else {
      surface = "open water";
      feature = signals.shallowWater > 0.44 || signals.coast > 0.44 ? "shoal water" : "swell";
    }
  } else if (biome === "forest") {
    if (signals.shorelineWater > 0.60) {
      surface = "open water";
      feature = "shore pool";
    } else if (signals.shorelineBeach > 0.44 && signals.snow < 0.34) {
      surface = "sand";
      feature = "shoreline";
    } else if (signals.canopyDensity < 0.30 && signals.wetness > 0.35) {
      surface = "clearing";
      feature = "shadow gap";
    } else if (signals.canopyDensity > 0.66 && signals.surfaceRoughness < 0.62) {
      surface = "dense canopy";
      feature = "tree crown";
    } else {
      surface = "woodland";
      feature = "understory";
    }
  } else if (biome === "grassland") {
    if (signals.shorelineWater > 0.60) {
      surface = "open water";
      feature = "shore pool";
    } else if (signals.shorelineBeach > 0.44 && signals.snow < 0.34) {
      surface = "sand";
      feature = "beach";
    } else if (signals.snow > 0.58) {
      surface = "snow";
      feature = "snow grass";
    } else if (signals.wetness > 0.58 && signals.surfaceRoughness < 0.52) {
      surface = "meadow";
      feature = "swale";
    } else if (signals.surfaceRoughness > 0.52 || signals.dryness > 0.62) {
      surface = "brush";
      feature = "tuft";
    } else {
      surface = "grass";
      feature = "field";
    }
  } else if (biome === "desert") {
    if (signals.shorelineWater > 0.62) {
      surface = "open water";
      feature = "shore pool";
    } else if (signals.shorelineBeach > 0.36) {
      surface = "sand";
      feature = "beach";
    } else if (signals.surfaceRoughness > 0.56 || relief.slope > 0.22 || signals.ridge > 0.58) {
      surface = "rock";
      feature = "ridge";
    } else if (lod.landform > 0.58 && signals.dryness > 0.45) {
      surface = "dune";
      feature = "wind streak";
    } else {
      surface = "sand";
      feature = "grit";
    }
  } else if (biome === "tundra") {
    if (signals.shorelineWater > 0.58) {
      surface = "open water";
      feature = "shore pool";
    } else if (signals.snow > 0.52) {
      surface = "snow";
      feature = "snow crust";
    } else if (signals.surfaceRoughness > 0.50 || relief.slope > 0.20) {
      surface = "stone";
      feature = "frost stone";
    } else if (signals.wetness > 0.48) {
      surface = "moss";
      feature = "moss pocket";
    } else {
      surface = "scrub";
      feature = "low scrub";
    }
  } else if (biome === "ice") {
    if (signals.surfaceRoughness > 0.48 || relief.slope > 0.18) {
      surface = "ridge ice";
      feature = "pressure ridge";
    } else if (signals.snow > 0.84 && lod.micro < 0.52) {
      surface = "snow";
      feature = "powder";
    } else {
      surface = "ice";
      feature = "crust";
    }
  }

  return {
    surface: surface,
    feature: feature,
    signals: signals
  };
};

/**
 * @description Applies a detected ground feature to a base material classification, blending feature strength and preserving material signals for downstream color and atlas selection.
 * @param {Object} material Base material classification returned by classify.
 * @param {Object|null} groundFeature Ground feature descriptor with type and influence.
 * @param {string} biome Normalized biome id for biome-specific feature handling.
 * @returns {Object} Adjusted material classification with copied and feature-weighted signals.
 */
PS.render.surfaceMaterial.applyGroundFeatureInfluence = function (material, groundFeature, biome) {
  var result = { surface: material.surface, feature: material.feature, signals: {} };
  var type = groundFeature && groundFeature.type ? groundFeature.type : "";
  var influence = groundFeature ? clamp(Number(groundFeature.influence) || 0, 0, 1) : 0;

  Object.keys(material.signals || {}).forEach(function(key) {
    result.signals[key] = material.signals[key];
  });

  if (!groundFeature || influence <= 0) {
    return result;
  }

  result.groundFeature = groundFeature;

  if (type === "stream") {
    result.signals.wetness = Math.max(result.signals.wetness || 0, clamp(0.58 + influence * 0.38, 0, 1));
    result.signals.chop = Math.max(result.signals.chop || 0, influence * 0.42);
    result.surface = influence > 0.58 ? "open water" : (biome === "tundra" ? "moss" : "meadow");
    result.feature = "stream channel";
  } else if (type === "wetland") {
    result.signals.wetness = Math.max(result.signals.wetness || 0, clamp(0.62 + influence * 0.32, 0, 1));
    result.surface = biome === "tundra" ? "moss" : "meadow";
    result.feature = "wetland";
  } else if (type === "meadow" || type === "clearing") {
    result.signals.wetness = Math.max(result.signals.wetness || 0, clamp(0.36 + influence * 0.24, 0, 1));
    result.signals.canopyDensity = Math.min(result.signals.canopyDensity || 0, clamp(0.38 - influence * 0.18, 0, 1));
    result.surface = type === "clearing" ? "clearing" : "meadow";
    result.feature = type;
  } else if (type === "ridge") {
    result.signals.surfaceRoughness = Math.max(result.signals.surfaceRoughness || 0, clamp(0.55 + influence * 0.34, 0, 1));
    result.surface = biome === "ice" ? "ridge ice" : (biome === "tundra" ? "stone" : "rock");
    result.feature = "ridge";
  } else if (type === "swale") {
    result.signals.wetness = Math.max(result.signals.wetness || 0, clamp(0.44 + influence * 0.26, 0, 1));
    result.surface = biome === "forest" ? "clearing" : (biome === "tundra" ? "moss" : "meadow");
    result.feature = "swale";
  } else if (type === "rockfield") {
    result.signals.surfaceRoughness = Math.max(result.signals.surfaceRoughness || 0, clamp(0.60 + influence * 0.30, 0, 1));
    result.surface = biome === "tundra" ? "stone" : "rock";
    result.feature = "rockfield";
  } else if (type === "reef" || type === "shoal") {
    result.signals.waterDepth = Math.min(result.signals.waterDepth || 0.45, clamp(0.34 - influence * 0.24, 0, 1));
    result.signals.shallowWater = Math.max(result.signals.shallowWater || 0, clamp(0.58 + influence * 0.34, 0, 1));
    result.surface = "open water";
    result.feature = type === "reef" ? "reef shelf" : "shoal water";
  }

  return result;
};

PS.render.surfaceMaterial.getDetail = function (latitude, longitude, tile, sampleMetersOverride) {
  var biome = tile ? tile.biome : "unknown";
  var lod = PS.render.surfaceGeometry.getGroundLod(latitude, longitude, sampleMetersOverride, tile);
  var relief = PS.render.surfaceGeometry.getRelief(latitude, longitude, tile, lod.sampleMeters);
  var marker = PS.render.surfaceGeometry.getFeatureMarker(biome, lod, relief);
  var mixedNoise = clamp(lod.elevation * 0.64 + lod.ground * 0.22 + lod.micro * 0.14, 0, 1);
  var groundFeature = PS.render.surfaceFeatureQuery.getSurfaceFeatureInfluence(latitude, longitude, lod.sampleMeters);
  var material = PS.render.surfaceMaterial.applyGroundFeatureInfluence(
    PS.render.surfaceMaterial.classify(latitude, biome, lod, relief, tile, longitude),
    groundFeature,
    biome
  );
  var naturalElement = PS.render.surfaceNatural.getElement(latitude, longitude, biome, material, lod, relief);
  var materialStrata = PS.render.surfaceStrata.getMaterial(latitude, longitude, biome, material, lod, relief);
  var shade = clamp(0.12 + mixedNoise * 0.46 + lod.roughness * 0.16 + relief.hillshade * 0.26, 0, 1);

  return {
    surface: material.surface,
    feature: material.feature,
    shade: shade,
    elevation: lod.elevation,
    roughness: lod.roughness,
    materialSignals: material.signals,
    groundFeature: material.groundFeature || null,
    heightMeters: relief.heightMeters,
    slope: relief.slope,
    aspect: relief.aspect,
    hillshade: relief.hillshade,
    featureRelief: relief.featureRelief,
    regionalContext: lod.regional,
    materialStrata: materialStrata,
    continentShape: lod.continentShape,
    plateInfluence: lod.plateInfluence,
    islandArc: lod.islandArc,
    shelfStrength: lod.shelfStrength,
    seaLevelDelta: lod.seaLevelDelta,
    highlandLift: lod.highlandLift,
    marker: marker,
    naturalElement: naturalElement,
    meterNoise: lod.meter,
    microNoise: lod.micro,
    sampleMeters: lod.sampleMeters
  };
};
