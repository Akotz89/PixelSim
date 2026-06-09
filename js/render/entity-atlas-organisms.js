"use strict";
PS.render = PS.render || {};
PS.atlas = PS.atlas || {};

PS.atlas.getOrganismTraitBuckets = function (organism, frameVariant) {
  var traits = organism && organism.traits ? organism.traits : {};

  return {
    lineage: Math.max(1, Math.round(Number(organism && organism.lineageId) || 1)) % 16,
    bodySize: clamp(Math.round((Number(traits.bodySize) || 1) * 2), 1, 6),
    bodyShape: clamp(Math.round(Number(traits.bodyShape) || 0), 0, 7),
    limbCount: clamp(Math.round(Number(traits.limbCount) || 0), 0, 12),
    appendageType: clamp(Math.round(Number(traits.appendageType) || 0), 0, 7),
    camouflage: clamp(Math.round((Number(traits.camouflage) || 0) * 4), 0, 4),
    thermal: clamp(Math.round((Number(traits.thermalTolerance) || 0) * 4), 0, 4),
    water: clamp(Math.round((Number(traits.waterDependency) || 0) * 4), 0, 4),
    variant: clamp(Math.round(Number(frameVariant) || 0), 0, 3)
  };
};

PS.atlas.makeTraitHash = function (organism, frameVariant) {
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
    buckets.variant
  ].join(".");
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
};

PS.atlas.baseDrawOrganismSprite = PS.atlas.baseDrawOrganismSprite || PS.atlas.drawOrganismSprite;

PS.atlas.drawOrganismSprite = function (cell, organism, frameVariant) {
  PS.atlas.baseDrawOrganismSprite(cell, organism, frameVariant);
  PS.atlas.drawOrganismTraitPattern(cell, organism, frameVariant);
};
