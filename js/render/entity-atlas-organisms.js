"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";

PS.render = PS.render || {};
PS.atlas = PS.atlas || {};

PS.atlas.organismBodyLayers = [
  "shadow",
  "bottom",
  "body",
  "legs",
  "arms",
  "appendages",
  "head",
  "face",
  "equipment",
  "overlay"
];

PS.atlas.organismPaletteCategories = ["skin", "hair", "clothing", "faction"];

PS.atlas.getDirectionIndex8 = function (directionX, directionY) {
  var x = Number(directionX) || 0;
  var y = Number(directionY) || 0;

  if (Math.abs(x) + Math.abs(y) <= 0.0001) {
    return 0;
  }

  return (Math.round((Math.atan2(y, x) + Math.PI) / (Math.PI * 2) * 8) + 4) % 8;
};

PS.atlas.getAnimationFrameFromSpeed = function (speed, frameCount) {
  var frames = Math.max(1, Math.round(Number(frameCount) || 4));
  return clamp(Math.floor(Math.abs(Number(speed) || 0) * frames) % frames, 0, frames - 1);
};

PS.atlas.getBitShiftedPaletteIndex = function (seed, shift, colorCount) {
  var normalizedSeed = Math.max(0, Math.floor(Number(seed) || 0));
  var count = Math.max(1, Math.round(Number(colorCount) || 16));
  return ((normalizedSeed >> Math.max(0, Math.round(Number(shift) || 0))) & 15) % count;
};

PS.atlas.getIndividualPalette = function (entity) {
  var seed = Math.max(1, Math.floor(Number(entity && (entity.seed || entity.id || entity.lineageId)) || 1));
  var colors = CONFIG && Array.isArray(CONFIG.LINEAGE_COLORS) && CONFIG.LINEAGE_COLORS.length > 0
    ? CONFIG.LINEAGE_COLORS
    : ["#72d7ff"];
  var categories = {};

  for (var i = 0; i < PS.atlas.organismPaletteCategories.length; i += 1) {
    var category = PS.atlas.organismPaletteCategories[i];
    var index = PS.atlas.getBitShiftedPaletteIndex(seed, i * 4, 16);
    categories[category] = {
      index: index,
      color: colors[(index + i) % colors.length]
    };
  }

  return categories;
};

PS.atlas.getOrganismLayerComposition = function (organism, options) {
  var spec = options || {};
  var speed = spec.speed !== undefined
    ? Number(spec.speed) || 0
    : Math.sqrt(Math.pow(Number(organism && organism.directionX) || 0, 2) + Math.pow(Number(organism && organism.directionY) || 0, 2));
  var direction = PS.atlas.getDirectionIndex8(organism && organism.directionX, organism && organism.directionY);
  var frame = PS.atlas.getAnimationFrameFromSpeed(speed, 4);
  var palette = PS.atlas.getIndividualPalette(organism);

  return PS.atlas.organismBodyLayers.map(function (layer, index) {
    var category = index <= 2 ? "skin" : (index <= 5 ? "clothing" : (index <= 7 ? "hair" : "faction"));
    return {
      layer: layer,
      order: index,
      paletteCategory: category,
      paletteIndex: palette[category].index,
      color: palette[category].color,
      direction: direction,
      frame: frame
    };
  });
};

PS.atlas.getOrganismTraitBuckets = function (organism, frameVariant) {
  var traits = organism && organism.traits ? organism.traits : {};
  var carnivory = Number(traits.carnivory) || 0;
  var mobility = Number(traits.movementTendency) || 0;
  var mobilityMin = Number(CONFIG && CONFIG.TRAIT_MOVEMENT_TENDENCY_MIN);
  var mobilityMax = Number(CONFIG && CONFIG.TRAIT_MOVEMENT_TENDENCY_MAX);
  var mobilityRange = Number.isFinite(mobilityMax - mobilityMin) && mobilityMax > mobilityMin
    ? (mobility - mobilityMin) / (mobilityMax - mobilityMin)
    : mobility;
  var terrain = Number(traits.terrainAffinity) || 0;
  var intelligence = Number(traits.intelligence) || 0;
  var sociality = Number(traits.sociality) || 0;

  return {
    lineage: Math.max(1, Math.round(Number(organism && organism.lineageId) || 1)) % 16,
    bodySize: clamp(Math.round((Number(traits.bodySize) || 1) * 2), 1, 6),
    bodyShape: clamp(Math.round(Number(traits.bodyShape) || 0), 0, 7),
    limbCount: clamp(Math.round(Number(traits.limbCount) || 0), 0, 12),
    appendageType: clamp(Math.round(Number(traits.appendageType) || 0), 0, 7),
    camouflage: clamp(Math.round((Number(traits.camouflage) || 0) * 4), 0, 4),
    thermal: clamp(Math.round((Number(traits.thermalTolerance) || 0) * 4), 0, 4),
    water: clamp(Math.round((Number(traits.waterDependency) || 0) * 4), 0, 4),
    predator: clamp(Math.round(carnivory * 4), 0, 4),
    mobility: clamp(Math.round(mobilityRange * 4), 0, 4),
    terrain: clamp(Math.round(terrain * 4), 0, 4),
    cognition: clamp(Math.round(intelligence * 3), 0, 3),
    social: clamp(Math.round(sociality * 3), 0, 3),
    variant: clamp(Math.round(Number(frameVariant) || 0), 0, 3)
  };
};

PS.atlas.makeMorphologyKey = function (organism, frameVariant) {
  var buckets = PS.atlas.getOrganismTraitBuckets(organism, frameVariant);

  return [
    "entity.organism.trait",
    buckets.lineage,
    buckets.bodySize,
    buckets.bodyShape,
    buckets.limbCount,
    buckets.appendageType,
    buckets.camouflage,
    buckets.thermal,
    buckets.water,
    buckets.predator,
    buckets.mobility,
    buckets.terrain,
    buckets.cognition,
    buckets.social,
    buckets.variant
  ].join(".");
};

PS.atlas.makeTraitHash = PS.atlas.makeMorphologyKey;

PS.atlas.getOrganismMorphologyPreview = function (organism, frameVariant) {
  var buckets = PS.atlas.getOrganismTraitBuckets(organism, frameVariant);
  var scale = buckets.bodySize >= 5 ? "large" : (buckets.bodySize <= 2 ? "tiny" : "mid");
  var habitat = buckets.water >= 3 ? "aquatic" : (buckets.terrain <= 1 ? "coastal" : (buckets.terrain >= 3 ? "upland" : "terrestrial"));
  var climate = buckets.thermal >= 3 ? "heat-adapted" : (buckets.thermal <= 1 ? "cold-adapted" : "temperate");
  var defense = buckets.predator >= 3 ? "predator" : (buckets.appendageType === 2 || buckets.appendageType === 6 ? "armored" : "soft");
  var cover = buckets.camouflage >= 3 ? "camouflaged" : "visible";
  var motion = buckets.mobility >= 3 ? "fast" : (buckets.mobility <= 1 ? "slow" : "mobile");
  var mind = buckets.social >= 2 ? "social" : (buckets.cognition >= 2 ? "alert" : "instinctive");

  return {
    key: PS.atlas.makeMorphologyKey(organism, frameVariant),
    buckets: Object.assign({}, buckets),
    label: [scale, habitat, climate, defense, cover, motion, mind].join(" "),
    tags: {
      scale: scale,
      habitat: habitat,
      climate: climate,
      defense: defense,
      cover: cover,
      motion: motion,
      mind: mind
    }
  };
};

PS.atlas.generateOrganismSprite = function (organism, frameVariant) {
  var key = PS.atlas.makeMorphologyKey(organism, frameVariant);
  var cell = PS.atlas.getTraitOrganismCell(organism, frameVariant);

  return {
    cell: cell,
    morphologyKey: key,
    preview: PS.atlas.getOrganismMorphologyPreview(organism, frameVariant)
  };
};

PS.atlas.organismAccentColor = function (base, redLift, greenLift, blueLift) {
  return [
    clamp(Math.round(base[0] + redLift), 0, 255),
    clamp(Math.round(base[1] + greenLift), 0, 255),
    clamp(Math.round(base[2] + blueLift), 0, 255),
    255
  ];
};

PS.atlas.drawOrganismSpines = function (cell, centerX, centerY, radiusX, radiusY, color, bucket) {
  var count = 2 + Math.min(4, bucket);
  var i;
  var x;

  for (i = 0; i < count; i++) {
    x = centerX - Math.floor(count / 2) + i;
    PS.atlas.writePixel(cell, x, centerY - radiusY - 1, color);
    if (bucket >= 3) {
      PS.atlas.writePixel(cell, x, centerY - radiusY - 2, color);
    }
  }
};

PS.atlas.drawOrganismFins = function (cell, centerX, centerY, radiusX, color, bucket) {
  PS.atlas.writePixel(cell, centerX - radiusX - 2, centerY, color);
  PS.atlas.writePixel(cell, centerX + radiusX + 2, centerY, color);

  if (bucket >= 3) {
    PS.atlas.writePixel(cell, centerX - radiusX - 1, centerY + 1, color);
    PS.atlas.writePixel(cell, centerX + radiusX + 1, centerY + 1, color);
    PS.atlas.writePixel(cell, centerX, centerY + 5, color);
  }
};

PS.atlas.drawOrganismAntennae = function (cell, centerX, centerY, radiusY, color, bucket) {
  PS.atlas.writePixel(cell, centerX - 2, centerY - radiusY - 1, color);
  PS.atlas.writePixel(cell, centerX + 2, centerY - radiusY - 1, color);

  if (bucket >= 2) {
    PS.atlas.writePixel(cell, centerX - 3, centerY - radiusY - 2, color);
    PS.atlas.writePixel(cell, centerX + 3, centerY - radiusY - 2, color);
  }
};

PS.atlas.drawOrganismTraitPattern = function (cell, organism, frameVariant) {
  var traits = organism && organism.traits ? organism.traits : {};
  var lineageId = Math.max(1, Math.round(Number(organism && organism.lineageId) || 1));
  var buckets = PS.atlas.getOrganismTraitBuckets(organism, frameVariant);
  var bodySize = clamp(Number(traits.bodySize) || 1, 0.5, 3);
  var bodyShape = buckets.bodyShape;
  var centerX = 7 + (buckets.variant % 2);
  var centerY = 7 + Math.floor(buckets.variant / 2);
  var radiusX = clamp(Math.round(3 + bodySize + (bodyShape === 1 ? 2 : 0)), 3, 7);
  var radiusY = clamp(Math.round(3 + bodySize + (bodyShape === 2 ? 2 : 0)), 3, 7);
  var base = PS.atlas.getLineageRgb(lineageId, Number(traits.camouflage) || 0);
  var cold = PS.atlas.organismAccentColor(base, 20, 42, 88);
  var heat = PS.atlas.organismAccentColor(base, 90, -10, -38);
  var water = PS.atlas.organismAccentColor(base, -48, 45, 82);
  var earth = PS.atlas.organismAccentColor(base, -42, 28, -30);
  var limb = PS.atlas.organismAccentColor(base, -62, -42, -34);
  var predator = PS.atlas.organismAccentColor(base, 105, -55, -48);
  var motion = PS.atlas.organismAccentColor(base, 64, 64, -42);
  var mind = PS.atlas.organismAccentColor(base, 82, 28, 96);
  var terrain = PS.atlas.organismAccentColor(base, -28, 36, -18);
  var i;
  var x;
  var y;

  if (buckets.water >= 2) {
    PS.atlas.drawOrganismFins(cell, centerX, centerY, radiusX, water, buckets.water);
  }

  if (buckets.appendageType === 1 || buckets.appendageType === 5) {
    PS.atlas.drawOrganismAntennae(cell, centerX, centerY, radiusY, limb, buckets.appendageType);
  } else if (buckets.appendageType === 2 || buckets.appendageType === 6) {
    PS.atlas.drawOrganismSpines(cell, centerX, centerY, radiusX, radiusY, limb, buckets.appendageType);
  }

  if (buckets.thermal >= 3) {
    PS.atlas.writePixel(cell, centerX - 2, centerY - 1, heat);
    PS.atlas.writePixel(cell, centerX, centerY - 2, heat);
    PS.atlas.writePixel(cell, centerX + 2, centerY - 1, heat);
  } else if (buckets.thermal <= 1) {
    PS.atlas.writePixel(cell, centerX - 2, centerY - 1, cold);
    PS.atlas.writePixel(cell, centerX + 2, centerY - 1, cold);
  }

  for (i = 0; i < buckets.camouflage; i++) {
    x = centerX - radiusX + 1 + ((i * 3 + buckets.variant) % Math.max(1, radiusX * 2 - 1));
    y = centerY - 1 + ((i * 2 + buckets.bodyShape) % 3);
    PS.atlas.writePixel(cell, x, y, earth);
  }

  if (buckets.limbCount >= 8) {
    PS.atlas.writePixel(cell, centerX - radiusX, centerY - 3, limb);
    PS.atlas.writePixel(cell, centerX + radiusX, centerY - 3, limb);
    PS.atlas.writePixel(cell, centerX - radiusX, centerY + 3, limb);
    PS.atlas.writePixel(cell, centerX + radiusX, centerY + 3, limb);
  }

  if (buckets.predator >= 3) {
    PS.atlas.writePixel(cell, centerX - 1, centerY + radiusY, predator);
    PS.atlas.writePixel(cell, centerX + 1, centerY + radiusY, predator);
    if (buckets.predator >= 4) {
      PS.atlas.writePixel(cell, centerX, centerY + radiusY + 1, predator);
    }
  } else if (buckets.predator <= 1 && (buckets.appendageType === 2 || buckets.appendageType === 6)) {
    PS.atlas.writePixel(cell, centerX - 3, centerY, limb);
    PS.atlas.writePixel(cell, centerX + 3, centerY, limb);
  }

  if (buckets.mobility >= 3) {
    PS.atlas.writePixel(cell, centerX - radiusX - 1, centerY + 2, motion);
    PS.atlas.writePixel(cell, centerX + radiusX + 1, centerY + 2, motion);
  } else if (buckets.mobility <= 1) {
    PS.atlas.writePixel(cell, centerX - 1, centerY + radiusY - 1, terrain);
    PS.atlas.writePixel(cell, centerX + 1, centerY + radiusY - 1, terrain);
  }

  if (buckets.terrain <= 1 && buckets.water < 3) {
    PS.atlas.writePixel(cell, centerX - radiusX + 1, centerY + radiusY, water);
    PS.atlas.writePixel(cell, centerX + radiusX - 1, centerY + radiusY, water);
  } else if (buckets.terrain >= 3) {
    PS.atlas.writePixel(cell, centerX - radiusX + 1, centerY - radiusY, terrain);
    PS.atlas.writePixel(cell, centerX + radiusX - 1, centerY - radiusY, terrain);
  }

  if (buckets.cognition >= 2) {
    PS.atlas.writePixel(cell, centerX - 1, centerY - radiusY + 2, mind);
    PS.atlas.writePixel(cell, centerX + 1, centerY - radiusY + 2, mind);
  }

  if (buckets.social >= 2) {
    PS.atlas.writePixel(cell, centerX - radiusX + 2, centerY, mind);
    PS.atlas.writePixel(cell, centerX + radiusX - 2, centerY, mind);
  }
};

PS.atlas.baseDrawOrganismSprite = PS.atlas.baseDrawOrganismSprite || PS.atlas.drawOrganismSprite;

PS.atlas.drawOrganismSprite = function (cell, organism, frameVariant) {
  PS.atlas.baseDrawOrganismSprite(cell, organism, frameVariant);
  PS.atlas.drawOrganismTraitPattern(cell, organism, frameVariant);
};
