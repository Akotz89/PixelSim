import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getDeterministicUnitNoise, getSurfaceMeterCoordinate, normalizePlanetLineAngleRadians } from "./planet-surface.js";
import { createDeterministicSwatches, getStringSeed } from "./surface-base.js";
import { blendHexColors, getPlanetVisualSeedOffset } from "./terrain.js";

PS.render = PS.render || {};
PS.render.surfaceStrata = PS.render.surfaceStrata || {};

var STRATA_ACCENT_TARGETS = {
  water: {
    defaultPair: ["#5f8fb0", "#05162d"],
    secondary: {
      "shelf-sediment": ["#87b8a8", "#18394d"]
    }
  },
  sand: {
    defaultPair: ["#d4bd79", "#77602d"],
    secondary: {
      gravel: ["#c8ad71", "#675129"]
    }
  },
  bedrock: {
    defaultPair: ["#8f8e82", "#272923"],
    secondary: {
      "mineral-vein": ["#bbb6a2", "#373933"]
    }
  },
  ice: {
    defaultPair: ["#f5fdff", "#83b8cc"]
  },
  organic: {
    defaultPair: ["#566339", "#1b2115"]
  },
  topsoil: {
    defaultPair: ["#756b4d", "#2f2b20"],
    secondary: {
      "root-mat": ["#718046", "#26321e"]
    }
  },
  default: {
    defaultPair: ["#8b8062", "#302a22"]
  }
};

function getStrataMaterialGroup(primary) {
  if (primary === "water") {
    return "water";
  }
  if (primary === "sand" || primary === "sandy-soil") {
    return "sand";
  }
  if (primary === "bedrock" || primary === "scree") {
    return "bedrock";
  }
  if (primary === "ice" || primary === "frost") {
    return "ice";
  }
  if (primary === "humus" || primary === "peat") {
    return "organic";
  }
  if (primary === "topsoil" || primary === "loam") {
    return "topsoil";
  }
  return "default";
}

function getStrataAccentTarget(strata, normalizedNoise) {
  var primary = strata && strata.primary ? strata.primary : "soil";
  var secondary = strata && strata.secondary ? strata.secondary : "";
  var spec = STRATA_ACCENT_TARGETS[getStrataMaterialGroup(primary)] || STRATA_ACCENT_TARGETS.default;
  var pair = spec.secondary && spec.secondary[secondary] ? spec.secondary[secondary] : spec.defaultPair;

  return normalizedNoise > 0.52 ? pair[0] : pair[1];
}

function makeStrataMaterialContext(latitude, longitude, biome, material, lod, relief) {
  var sampleMeters = Math.max(1, Number(lod && lod.sampleMeters) || 1);
  var surface = material && material.surface ? material.surface : "ground";
  var signals = material && material.signals ? material.signals : {};
  var meters = getSurfaceMeterCoordinate(latitude, longitude);
  var layerNoise = PS.render.surfaceNoise.getLayerNoise(meters, Math.max(1, sampleMeters * 7), 109);
  var grainNoise = PS.render.surfaceNoise.getPixelNoise(meters, Math.max(1, sampleMeters * 2), 127);
  var wetness = clamp(Number(signals.wetness) || 0, 0, 1);
  var dryness = clamp(Number(signals.dryness) || 0, 0, 1);
  var roughness = clamp(Number(signals.surfaceRoughness) || Number(lod && lod.roughness) || 0, 0, 1);
  var slope = clamp(Number(relief && relief.slope) || 0, 0, 1);
  var canopy = clamp(Number(signals.canopyDensity) || 0, 0, 1);

  return {
    biome: biome,
    surface: surface,
    signals: signals,
    layerNoise: layerNoise,
    grainNoise: grainNoise,
    wetness: wetness,
    dryness: dryness,
    roughness: roughness,
    canopy: canopy,
    snow: clamp(Number(signals.snow) || 0, 0, 1),
    shallowWater: clamp(Number(signals.shallowWater) || 0, 0, 1),
    coast: clamp(Number(signals.coast) || 0, 0, 1),
    primary: "loam",
    secondary: layerNoise > 0.56 ? "clay" : "silt",
    organicCover: clamp(canopy * 0.46 + wetness * 0.18 + (biome === "forest" ? 0.28 : 0) + (surface === "moss" ? 0.18 : 0), 0, 1),
    rockExposure: clamp(roughness * 0.44 + slope * 0.36 + (Number(signals.ridge) || 0) * 0.24, 0, 1),
    granularity: clamp(0.22 + roughness * 0.34 + dryness * 0.18 + grainNoise * 0.22, 0, 1),
    depthMix: clamp(layerNoise * 0.64 + grainNoise * 0.36, 0, 1)
  };
}

function applyWaterStrataMaterial(context) {
  context.primary = "water";
  context.secondary = context.shallowWater > 0.36 || context.coast > 0.34 ? "shelf-sediment" : "basalt-silt";
  context.organicCover = 0;
  context.rockExposure = clamp(context.shallowWater * 0.22 + context.roughness * 0.18, 0, 0.42);
  context.granularity = clamp(0.10 + context.shallowWater * 0.30 + context.grainNoise * 0.18, 0, 0.48);
  context.wetness = 1;
}

function applySandStrataMaterial(context) {
  context.primary = "sand";
  context.secondary = context.rockExposure > 0.46 || context.layerNoise > 0.68 ? "gravel" : "silt";
  context.organicCover = clamp(context.organicCover * 0.22, 0, 0.24);
  context.granularity = clamp(0.54 + context.dryness * 0.22 + context.grainNoise * 0.20 + context.rockExposure * 0.10, 0, 1);
}

function applyRockStrataMaterial(context) {
  context.primary = context.surface === "ridge ice" ? "ice" : (context.rockExposure > 0.62 ? "bedrock" : "scree");
  context.secondary = context.surface === "ridge ice" ? "frost" : (context.layerNoise > 0.54 ? "mineral-vein" : "weathered-soil");
  context.organicCover = clamp(context.organicCover * 0.18, 0, 0.20);
  context.rockExposure = clamp(0.50 + context.rockExposure * 0.48, 0, 1);
  context.granularity = clamp(0.38 + context.roughness * 0.28 + context.grainNoise * 0.22, 0, 1);
}

function applyFrozenStrataMaterial(context) {
  context.primary = context.surface === "snow" ? "frost" : "ice";
  context.secondary = context.snow > 0.66 ? "snowpack" : "permafrost";
  context.organicCover = 0;
  context.rockExposure = clamp(context.rockExposure * (context.surface === "snow" ? 0.18 : 0.36), 0, 0.42);
  context.granularity = clamp(0.12 + context.roughness * 0.16 + context.grainNoise * 0.18, 0, 0.48);
}

function applyCanopyStrataMaterial(context) {
  context.primary = "humus";
  context.secondary = context.canopy > 0.62 ? "leaf-litter" : "topsoil";
  context.organicCover = clamp(0.46 + context.canopy * 0.42 + context.wetness * 0.08, 0, 1);
  context.rockExposure = clamp(context.rockExposure * 0.38, 0, 0.46);
  context.granularity = clamp(0.18 + context.roughness * 0.18 + context.grainNoise * 0.18, 0, 0.62);
}

function applyMossStrataMaterial(context) {
  context.primary = context.biome === "tundra" ? "peat" : "topsoil";
  context.secondary = context.biome === "tundra" || context.snow > 0.28 ? "permafrost" : "root-mat";
  context.organicCover = clamp(0.30 + context.wetness * 0.26 + context.canopy * 0.18, 0, 0.82);
  context.rockExposure = clamp(context.rockExposure * 0.62, 0, 0.72);
}

function applyGrassStrataMaterial(context) {
  context.primary = context.wetness > 0.62 ? "loam" : (context.dryness > 0.58 ? "sandy-soil" : "topsoil");
  context.secondary = context.wetness > 0.62 ? "clay" : (context.rockExposure > 0.42 ? "gravel" : "root-mat");
  context.organicCover = clamp(0.24 + context.wetness * 0.24 + context.canopy * 0.16 + (context.surface === "meadow" ? 0.18 : 0), 0, 0.86);
  context.rockExposure = clamp(context.rockExposure * (context.surface === "brush" ? 0.82 : 0.56), 0, 0.76);
}

var STRATA_SURFACE_HANDLERS = {
  "open water": applyWaterStrataMaterial,
  "deep water": applyWaterStrataMaterial,
  whitecap: applyWaterStrataMaterial,
  sand: applySandStrataMaterial,
  dune: applySandStrataMaterial,
  rock: applyRockStrataMaterial,
  stone: applyRockStrataMaterial,
  "ridge ice": applyRockStrataMaterial,
  snow: applyFrozenStrataMaterial,
  ice: applyFrozenStrataMaterial,
  "dense canopy": applyCanopyStrataMaterial,
  woodland: applyCanopyStrataMaterial,
  moss: applyMossStrataMaterial,
  scrub: applyMossStrataMaterial,
  grass: applyGrassStrataMaterial,
  brush: applyGrassStrataMaterial,
  meadow: applyGrassStrataMaterial,
  clearing: applyGrassStrataMaterial
};

PS.render.surfaceStrata.getSwatchAccent = function getStrataSwatchAccent(sample, baseColor, noise) {
  var detail = sample && sample.detail ? sample.detail : {};
  var strata = detail.materialStrata || {};
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var target = getStrataAccentTarget(strata, normalizedNoise);

  return blendHexColors(baseColor, target, clamp(0.16 + normalizedNoise * 0.18, 0.16, 0.38));
};

PS.render.surfaceStrata.getSwatchShape = function getStrataSwatchShape(strata, noise, index) {
  var primary = strata && strata.primary ? strata.primary : "soil";
  var secondary = strata && strata.secondary ? strata.secondary : "";
  var normalizedNoise = clamp(Number(noise) || 0, 0, 1);
  var maxSize = Math.max(1, CONFIG.TILE_SIZE - 1);
  var shortSize = 1;
  var midSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.18 + normalizedNoise * 0.18)), 1, maxSize);
  var longSize = clamp(Math.round(CONFIG.TILE_SIZE * (0.44 + normalizedNoise * 0.28)), 1, maxSize);

  if (primary === "water" || primary === "sand" || primary === "sandy-soil") {
    return {
      width: longSize,
      height: shortSize
    };
  }

  if (primary === "bedrock" || primary === "scree" || secondary === "mineral-vein") {
    return index % 2 === 0
      ? { width: shortSize, height: longSize }
      : { width: longSize, height: shortSize };
  }

  if (primary === "humus" || primary === "peat" || secondary === "root-mat" || secondary === "leaf-litter") {
    return {
      width: midSize,
      height: clamp(midSize + (index % 2), 1, maxSize)
    };
  }

  if (primary === "ice" || primary === "frost") {
    return {
      width: clamp(midSize + 1, 1, maxSize),
      height: shortSize
    };
  }

  return {
    width: midSize,
    height: midSize
  };
};

PS.render.surfaceStrata.getSwatchRotation = function getStrataSwatchRotation(sample, strata, noise, index) {
  var detail = sample && sample.detail ? sample.detail : {};
  var primary = strata && strata.primary ? strata.primary : "soil";
  var base = Number.isFinite(Number(detail.aspect))
    ? (Number(detail.aspect) * Math.PI / 180)
    : 0;
  var jitter = (clamp(Number(noise) || 0, 0, 1) - 0.5) * Math.PI * 0.12;

  if (primary === "water" || primary === "sand" || primary === "sandy-soil" || primary === "ice" || primary === "frost") {
    return normalizePlanetLineAngleRadians(base + Math.PI * 0.5 + jitter);
  }

  if (primary === "bedrock" || primary === "scree") {
    return normalizePlanetLineAngleRadians(base + jitter + (index % 2) * Math.PI * 0.5);
  }

  return 0;
};

PS.render.surfaceStrata.getTintColor = function getStrataTintColor(primary, secondary, surface) {
  var normalizedPrimary = primary || "soil";
  var normalizedSecondary = secondary || "";

  if (normalizedPrimary === "water") {
    return normalizedSecondary === "shelf-sediment" ? "#5d8f86" : "#244a62";
  }

  if (normalizedPrimary === "sand" || normalizedPrimary === "sandy-soil") {
    return normalizedSecondary === "gravel" ? "#a88d57" : "#c2a763";
  }

  if (normalizedPrimary === "bedrock" || normalizedPrimary === "scree") {
    return normalizedSecondary === "mineral-vein" ? "#8e8a7b" : "#66675e";
  }

  if (normalizedPrimary === "ice" || normalizedPrimary === "frost") {
    return surface === "snow" ? "#edf8fb" : "#a9d4e1";
  }

  if (normalizedPrimary === "peat" || normalizedPrimary === "humus") {
    return "#3a4a2c";
  }

  if (normalizedPrimary === "topsoil" || normalizedPrimary === "loam") {
    return normalizedSecondary === "clay" ? "#706447" : "#4f5636";
  }

  return "#6c6552";
};

PS.render.surfaceStrata.getMaterial = function getStrataMaterial(latitude, longitude, biome, material, lod, relief) {
  var context = makeStrataMaterialContext(latitude, longitude, biome, material, lod, relief);
  var handler = STRATA_SURFACE_HANDLERS[context.surface];

  if (handler) {
    handler(context);
  }

  return {
    primary: context.primary,
    secondary: context.secondary,
    wetness: context.wetness,
    granularity: context.granularity,
    organicCover: context.organicCover,
    rockExposure: context.rockExposure,
    depthMix: context.depthMix,
    tintColor: PS.render.surfaceStrata.getTintColor(context.primary, context.secondary, context.surface)
  };
};

PS.render.surfaceStrata.getSwatches = function getStrataSwatches(sample, baseColor) {
  var detail = sample && sample.detail ? sample.detail : {};
  var strata = detail.materialStrata || null;
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var strength;
  var count;
  var typeSeed;

  if (!strata || sampleMeters > 5 || CONFIG.TILE_SIZE < 4) {
    return [];
  }

  strength = clamp(
    0.12 +
      (Number(strata.granularity) || 0) * 0.24 +
      (Number(strata.organicCover) || 0) * 0.18 +
      (Number(strata.rockExposure) || 0) * 0.22 +
      (Number(strata.wetness) || 0) * 0.06,
    0,
    0.78
  );
  count = strength <= 0.14 ? 0 : clamp(Math.round(1 + strength * (sampleMeters <= 1 ? 6 : 4)), 1, sampleMeters <= 1 ? 7 : 5);

  if (count <= 0) {
    return [];
  }

  typeSeed = getStringSeed(strata.primary) + getStringSeed(strata.secondary);

  return createDeterministicSwatches({
    sample: sample,
    count: count,
    seedExtra: typeSeed,
    noiseBase: 6101,
    noiseEastStep: 41,
    noiseNorthStep: -43,
    noiseSeedStep: 29,
    xBase: 6221,
    xEastStep: -17,
    xNorthStep: 19,
    yBase: 6359,
    yEastStep: 23,
    yNorthStep: -29,
    shouldSkip: function(noise) {
      return noise > strength + 0.46;
    },
    getShape: function(noise, index) {
      return PS.render.surfaceStrata.getSwatchShape(strata, noise, index);
    },
    getColor: function(noise) {
      return PS.render.surfaceStrata.getSwatchAccent(sample, baseColor, noise);
    },
    getAlpha: function(noise) {
      return clamp(0.08 + strength * 0.20 + noise * 0.10, 0.10, 0.42);
    },
    getRotationRadians: function(noise, index) {
      return PS.render.surfaceStrata.getSwatchRotation(sample, strata, noise, index);
    },
    getExtraProperties: function() {
      return {
        strataPrimary: strata.primary,
        strataSecondary: strata.secondary
      };
    }
  });
};
