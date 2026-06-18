"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { world } from "../systems/state.js";

PS.render = PS.render || {};
PS.render.surfaceTileBatcher = PS.render.surfaceTileBatcher || {};

PS.render.surfaceTileBatcher.strideFloats = 15;

PS.render.surfaceTileBatcher.state = PS.render.surfaceTileBatcher.state || {
  pageBuffers: {},
  pageBufferToken: 0,
  keyIds: {},
  nextKeyId: 1
};

PS.render.surfaceTileBatcher.getStableKeyId = function (value) {
  var lut = PS.render.tileTypeLut;
  var state;
  var key;
  var id;

  if (lut && typeof lut.getStableKeyId === "function") {
    return lut.getStableKeyId(value);
  }

  state = PS.render.surfaceTileBatcher.state;
  key = String(value || "");
  id = state.keyIds[key];
  if (!id) {
    id = state.nextKeyId++;
    state.keyIds[key] = id;
  }
  return id;
};

PS.render.surfaceTileBatcher.combineKeyIds = function (ids) {
  var lut = PS.render.tileTypeLut;
  var list;
  var hash;

  if (lut && typeof lut.combineKeyIds === "function") {
    return lut.combineKeyIds(ids);
  }

  list = Array.isArray(ids) ? ids : [];
  hash = 2166136261;
  for (var i = 0; i < list.length; i += 1) {
    hash ^= (Number(list[i]) || 0) & 0xffff;
    hash = Math.imul(hash, 16777619);
    hash ^= ((Number(list[i]) || 0) >>> 16) & 0xffff;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

PS.render.surfaceTileBatcher.getTerrainAtlasKeyId = function (
  ecologyKey,
  ecologyMicroKey,
  transitionKey,
  stencilKey,
  featureKey,
  moistureKey,
  eraKey,
  biologyKey,
  resourceKey,
  civilizationKey
) {
  var lut = PS.render.tileTypeLut;

  if (lut && typeof lut.getTerrainAtlasKeyId === "function") {
    return lut.getTerrainAtlasKeyId(
      ecologyKey,
      ecologyMicroKey,
      transitionKey,
      stencilKey,
      featureKey,
      moistureKey,
      eraKey,
      biologyKey,
      resourceKey,
      civilizationKey
    );
  }

  return PS.render.surfaceTileBatcher.combineKeyIds([
    PS.render.surfaceTileBatcher.getStableKeyId(ecologyKey),
    PS.render.surfaceTileBatcher.getStableKeyId(ecologyMicroKey),
    PS.render.surfaceTileBatcher.getStableKeyId(transitionKey),
    PS.render.surfaceTileBatcher.getStableKeyId(stencilKey),
    PS.render.surfaceTileBatcher.getStableKeyId(featureKey),
    PS.render.surfaceTileBatcher.getStableKeyId(moistureKey),
    PS.render.surfaceTileBatcher.getStableKeyId(eraKey),
    PS.render.surfaceTileBatcher.getStableKeyId(biologyKey),
    PS.render.surfaceTileBatcher.getStableKeyId(resourceKey),
    PS.render.surfaceTileBatcher.getStableKeyId(civilizationKey)
  ]);
};

PS.render.surfaceTileBatcher.getAcceptedKeyId = function (atlasKeyId, acceptedCellKey) {
  var lut = PS.render.tileTypeLut;

  if (lut && typeof lut.getAcceptedKeyId === "function") {
    return lut.getAcceptedKeyId(atlasKeyId, acceptedCellKey);
  }

  return PS.render.surfaceTileBatcher.combineKeyIds([
    atlasKeyId,
    PS.render.surfaceTileBatcher.getStableKeyId("equiv"),
    PS.render.surfaceTileBatcher.getStableKeyId(acceptedCellKey)
  ]);
};

PS.render.surfaceTileBatcher.getSettlementParcelKeyId = function (atlasKeyId, parcelCivilizationInfo, density) {
  var lut = PS.render.tileTypeLut;
  var info = parcelCivilizationInfo || {};

  if (lut && typeof lut.getSettlementParcelKeyId === "function") {
    return lut.getSettlementParcelKeyId(atlasKeyId, info, density);
  }

  return PS.render.surfaceTileBatcher.combineKeyIds([
    atlasKeyId,
    PS.render.surfaceTileBatcher.getStableKeyId("settlement-parcel-fill"),
    PS.render.surfaceTileBatcher.getStableKeyId(info.type),
    PS.render.surfaceTileBatcher.getStableKeyId(info.family),
    PS.render.surfaceTileBatcher.getStableKeyId(info.bucket),
    PS.render.surfaceTileBatcher.getStableKeyId(info.lineageId),
    PS.render.surfaceTileBatcher.getStableKeyId(Math.round((Number(info.pressure) || 0) * 1000)),
    PS.render.surfaceTileBatcher.getStableKeyId(Math.round((Number(density) || 0) * 1000))
  ]);
};

PS.render.surfaceTileBatcher.beginBatches = function () {
  var state = PS.render.surfaceTileBatcher.state;

  state.pageBufferToken++;

  return {
    pages: {},
    count: 0,
    culled: 0,
    materialCounts: {},
    civilizationCounts: {},
    districtMaterialDraws: 0,
    equivalenceTerrain: 0,
    equivalenceTransitions: 0,
    tileLights: [],
    pointLights: [],
    displacementRects: [],
    waterDecorationRects: [],
    shadowRects: [],
    pageBufferToken: state.pageBufferToken
  };
};

PS.render.surfaceTileBatcher.getVisualPolicy = function (lodState) {
  if (lodState && lodState.visualPolicy) {
    return lodState.visualPolicy;
  }

  return PS.render.lod && typeof PS.render.lod.getVisualPolicy === "function"
    ? PS.render.lod.getVisualPolicy()
    : {
      level: "SURFACE",
      pointLightScale: 1,
      waterUvScrollScale: 1,
      autotileTransitions: "full",
      transitionAlphaScale: 1,
      normalLightingStrength: 1
    };
};

PS.render.surfaceTileBatcher.recordCivilizationMaterial = function (target, sample) {
  var civilization = PS.atlas && typeof PS.atlas.getTerrainCivilizationInfo === "function"
    ? PS.atlas.getTerrainCivilizationInfo(sample)
    : null;

  if (!target || !civilization) {
    return false;
  }

  target.districtMaterialDraws = (Number(target.districtMaterialDraws) || 0) + 1;
  target.civilizationCounts = target.civilizationCounts || {};
  target.civilizationCounts.total = (target.civilizationCounts.total || 0) + 1;
  target.civilizationCounts[civilization.type] = (target.civilizationCounts[civilization.type] || 0) + 1;
  target.civilizationCounts[civilization.family] = (target.civilizationCounts[civilization.family] || 0) + 1;
  target.civilizationCounts[civilization.type + "." + civilization.family] =
    (target.civilizationCounts[civilization.type + "." + civilization.family] || 0) + 1;
  return true;
};

PS.render.surfaceTileBatcher.appendPointLight = function (target, x, y, radius, color, intensity, kind) {
  if (!target || !target.pointLights) {
    return false;
  }

  target.pointLights.push({
    x: Number(x) || 0,
    y: Number(y) || 0,
    radius: Math.max(1, Number(radius) || 1),
    color: color || [1, 1, 1],
    intensity: Math.max(0, Number(intensity) || 1),
    kind: kind || ""
  });
  return true;
};

PS.render.surfaceTileBatcher.getSampleTileAmbient = function (sample, biome) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = String(detail.surface || "").toLowerCase();
  var feature = String(detail.feature || "").toLowerCase();
  var signals = detail.materialSignals || {};
  var civilization = sample && sample.civilization ? sample.civilization : {};
  var civilizationKey = String(civilization.key || sample && sample.civilizationKey || "").toLowerCase();
  var family = String(civilization.family || civilization.type || "").toLowerCase();
  var settlementPressure = Number(civilization.settlementPressure || civilization.pressure || signals.settlementPressure) || 0;

  if (surface.indexOf("cave") >= 0 || surface.indexOf("cavern") >= 0 || surface.indexOf("underground") >= 0 || feature.indexOf("cave") >= 0) {
    return { intensity: 0.38, kind: "cave" };
  }

  if (
    civilizationKey.indexOf("building") >= 0 ||
    civilizationKey.indexOf("settlement.3.block") >= 0 ||
    family.indexOf("block") >= 0 ||
    family.indexOf("production") >= 0 ||
    family.indexOf("residential") >= 0 ||
    surface.indexOf("building") >= 0 ||
    feature.indexOf("wall") >= 0 ||
    feature.indexOf("roof") >= 0
  ) {
    return { intensity: 0.58, kind: "building" };
  }

  if (settlementPressure > 0.72 || civilizationKey.indexOf("settlement") >= 0) {
    return { intensity: 0.82, kind: "settlement" };
  }

  if (surface.indexOf("dense canopy") >= 0 || surface.indexOf("woodland") >= 0 || String(biome || "").toLowerCase() === "forest") {
    return { intensity: 0.88, kind: "canopy" };
  }

  return { intensity: 1, kind: "outdoor" };
};

PS.render.surfaceTileBatcher.appendSampleTileLight = function (target, sample, biome, screenX, screenY, samplePixelSize, alpha) {
  var ambient = PS.render.surfaceTileBatcher.getSampleTileAmbient(sample, biome);

  if (!target || !target.tileLights || !ambient || ambient.intensity >= 0.999) {
    return false;
  }

  target.tileLights.push({
    x: Number(screenX) || 0,
    y: Number(screenY) || 0,
    width: Math.max(1, Number(samplePixelSize) || 1),
    height: Math.max(1, Number(samplePixelSize) || 1),
    intensity: clamp(1 - (1 - Number(ambient.intensity)) * clamp(Number(alpha) || 1, 0, 1), 0, 1),
    kind: ambient.kind
  });

  return true;
};

PS.render.surfaceTileBatcher.appendSamplePointLights = function (target, sample, biome, screenX, screenY, samplePixelSize, tileX, tileY, lodState) {
  var policy = PS.render.surfaceTileBatcher.getVisualPolicy(lodState);
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = String(detail.surface || "").toLowerCase();
  var feature = String(detail.feature || "").toLowerCase();
  var signals = detail.materialSignals || {};
  var centerX = screenX + samplePixelSize * 0.5;
  var centerY = screenY + samplePixelSize * 0.5;
  var lavaSignal = Math.max(
    surface.indexOf("lava") >= 0 || surface.indexOf("magma") >= 0 ? 1 : 0,
    Number(signals.lava) || 0,
    Number(signals.heat) > 0.75 ? Number(signals.heat) || 0 : 0
  );
  var ventSignal = surface.indexOf("volcano") >= 0 || surface.indexOf("vent") >= 0 ||
    feature.indexOf("volcano") >= 0 || feature.indexOf("vent") >= 0;
  var waterDepth = Number(signals.waterDepth) || Number(sample && sample.waterDepth) || 0;
  var sparseBio = PS.ranmap && PS.ranmap.variant
    ? PS.ranmap.variant(tileX, tileY, 13) === 0
    : Math.abs(Math.round(tileX) * 7 + Math.round(tileY) * 11) % 13 === 0;

  if (Math.max(0, Number(policy.pointLightScale) || 0) <= 0) {
    return false;
  }

  if (ventSignal) {
    return PS.render.surfaceTileBatcher.appendPointLight(target, centerX, centerY, samplePixelSize * 8, [1, 0.2, 0], 1.05 * policy.pointLightScale, "volcano");
  }

  if (lavaSignal > 0.35) {
    return PS.render.surfaceTileBatcher.appendPointLight(
      target,
      centerX,
      centerY,
      samplePixelSize * 4,
      [1, 0.35, 0.05],
      Math.max(0.55, Math.min(1.2, lavaSignal)) * policy.pointLightScale,
      "lava"
    );
  }

  if (String(biome || "") === "ocean" && waterDepth > 0.7 && sparseBio) {
    return PS.render.surfaceTileBatcher.appendPointLight(target, centerX, centerY, samplePixelSize * 2, [0.1, 0.6, 1], 0.42 * policy.pointLightScale, "bioluminescence");
  }

  return false;
};

PS.render.surfaceTileBatcher.getSampleHeatDisplacement = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = String(detail.surface || "").toLowerCase();
  var feature = String(detail.feature || "").toLowerCase();
  var signals = detail.materialSignals || {};
  var lavaSignal = Math.max(
    surface.indexOf("lava") >= 0 || surface.indexOf("magma") >= 0 ? 1 : 0,
    Number(signals.lava) || 0,
    Number(signals.heat) > 0.68 ? Number(signals.heat) || 0 : 0
  );
  var ventSignal = surface.indexOf("volcano") >= 0 || surface.indexOf("vent") >= 0 ||
    feature.indexOf("volcano") >= 0 || feature.indexOf("vent") >= 0;

  if (ventSignal) {
    lavaSignal = Math.max(lavaSignal, 0.92);
  }

  if (lavaSignal <= 0.35) {
    return null;
  }

  return {
    intensity: Math.max(0, Math.min(1.35, lavaSignal)),
    kind: ventSignal ? "volcanic-vent" : "lava"
  };
};

PS.render.surfaceTileBatcher.appendSampleDisplacement = function (target, sample, biome, screenX, screenY, samplePixelSize, tileX, tileY, lodState) {
  var policy = PS.render.surfaceTileBatcher.getVisualPolicy(lodState);
  var displacementScale = policy.spriteDisplacementScale === undefined
    ? (policy.waterUvScrollScale === undefined ? 1 : Number(policy.waterUvScrollScale))
    : Number(policy.spriteDisplacementScale);
  var heat = PS.render.surfaceTileBatcher.getSampleHeatDisplacement(sample, biome);
  var centerX = screenX + samplePixelSize * 0.5;
  var centerY = screenY + samplePixelSize * 0.5;
  var radius;
  var rectSize;
  var intensity;
  var phase = PS.ranmap && PS.ranmap.normalizedBits
    ? PS.ranmap.normalizedBits(tileX, tileY, 29, 8)
    : (Math.abs(Math.round(tileX) * 17 + Math.round(tileY) * 31) % 255) / 255;

  if (!target || !target.displacementRects || !heat || Math.max(0, displacementScale || 0) <= 0) {
    return false;
  }

  intensity = Math.max(0.2, Math.min(1.35, heat.intensity)) * Math.max(0, displacementScale || 0);
  radius = samplePixelSize * (heat.kind === "volcanic-vent" ? 5.5 : 3.25);
  rectSize = radius * 2;
  target.displacementRects.push(
    centerX - radius,
    centerY - radius,
    rectSize,
    rectSize,
    centerX,
    centerY,
    radius,
    Math.max(1.5, samplePixelSize * 0.58 * intensity),
    0.65,
    1.15,
    heat.kind === "volcanic-vent" ? 7.5 : 5.5,
    0.7 + phase * 0.45,
    1,
    0.44,
    0.16,
    Math.min(0.32, 0.08 + intensity * 0.12)
  );

  return true;
};

PS.render.surfaceTileBatcher.appendWaterDecoration = function (target, sample, biome, screenX, screenY, samplePixelSize, tileX, tileY, lodState) {
  var decoration = PS.render.waterRendering && typeof PS.render.waterRendering.getDecorationRenderInfo === "function"
    ? PS.render.waterRendering.getDecorationRenderInfo(sample, biome, tileX, tileY, samplePixelSize, undefined, lodState)
    : null;
  var rectX;
  var rectY;
  var shadowX;
  var shadowY;
  var color;

  if (!target || !decoration || !target.waterDecorationRects || !target.shadowRects) {
    return false;
  }

  rectX = screenX + samplePixelSize * 0.5 - decoration.width * 0.5 + decoration.offsetX;
  rectY = screenY + samplePixelSize * 0.5 - decoration.height * 0.5 + decoration.offsetY;
  shadowX = rectX + samplePixelSize * 0.08;
  shadowY = rectY + samplePixelSize * 0.12;
  color = decoration.color || [0.5, 0.7, 0.45, 0.8];

  target.shadowRects.push(
    shadowX,
    shadowY,
    decoration.width * 1.12,
    decoration.height * 0.85,
    0.015,
    0.025,
    0.04,
    0.34
  );
  target.waterDecorationRects.push(
    rectX,
    rectY,
    decoration.width,
    decoration.height,
    color[0],
    color[1],
    color[2],
    color[3]
  );

  return true;
};

/**
 * @description Chooses the terrain-atlas material cell name that best matches a sampled biome, surface signal set, civilization feature, and tile position.
 * @param {string} biome Normalized biome id for the sampled tile.
 * @param {Object|null} sample Surface sample with detail, material, and civilization metadata.
 * @param {number} tileX Wrapped world tile x coordinate.
 * @param {number} tileY Clamped world tile y coordinate.
 * @returns {string} Accepted terrain material cell name for atlas lookup.
 */
PS.render.surfaceTileBatcher.getAcceptedTerrainMaterialCellName = function (biome, sample, tileX, tileY) {
  if (sample && sample.acceptedTerrainCellName) {
    return String(sample.acceptedTerrainCellName);
  }

  var surface = String(sample && sample.detail && sample.detail.surface || "").toLowerCase();
  var signals = sample && sample.detail && sample.detail.materialSignals ? sample.detail.materialSignals : {};
  var civilization = sample && sample.civilization ? sample.civilization : null;
  var civilizationType = String(civilization && civilization.type || "").toLowerCase();
  var civilizationFamily = String(civilization && civilization.family || "").toLowerCase();
  var civilizationPressure = Math.max(
    Number(civilization && civilization.pressure) || 0,
    Number(signals.settlementDensity) || 0,
    Number(signals.workedGround) || 0,
    Number(signals.routeTraffic) || 0
  );
  var variant = PS.ranmap && PS.ranmap.variant ? PS.ranmap.variant(tileX, tileY, 2) : Math.abs((Math.round(tileX) + Math.round(tileY)) % 2);

  if (civilizationPressure > 0.24) {
    if (civilizationType === "route") {
      return civilizationFamily === "canal" || civilizationFamily === "dock"
        ? "water-shallow." + variant
        : "dirt-soil." + variant;
    }

    if (civilizationFamily === "farm") {
      return "dirt-soil." + variant;
    }

    if (civilizationFamily === "yard" || civilizationFamily === "border") {
      return "dirt-soil." + variant;
    }

    if (civilizationFamily === "block" || civilizationFamily === "production") {
      return civilizationPressure > 0.72 && (surface.indexOf("rock") >= 0 || surface.indexOf("stone") >= 0 || String(biome || "") === "mountain")
        ? "rock-mountain." + variant
        : "dirt-soil." + variant;
    }
  }

  if (surface.indexOf("deep water") >= 0 || String(biome || "") === "ocean" && Number(signals.waterDepth) > 0.62) {
    if (PS.render.waterRendering && typeof PS.render.waterRendering.getAnimatedVariant === "function") {
      variant = PS.render.waterRendering.getAnimatedVariant(tileX, tileY, 2);
    }
    return "water-deep." + variant;
  }

  if (surface.indexOf("water") >= 0 || surface.indexOf("whitecap") >= 0) {
    if (PS.render.waterRendering && typeof PS.render.waterRendering.getAnimatedVariant === "function") {
      variant = PS.render.waterRendering.getAnimatedVariant(tileX, tileY, 2);
    }
    return "water-shallow." + variant;
  }

  if (surface.indexOf("rock") >= 0 || surface.indexOf("stone") >= 0 || surface.indexOf("ridge") >= 0 || String(biome || "") === "mountain") {
    return "rock-mountain." + variant;
  }

  if (surface.indexOf("sand") >= 0 || surface.indexOf("dune") >= 0 || String(biome || "") === "desert") {
    return "dirt-soil." + variant;
  }

  return "grass-lush." + variant;
};

PS.render.surfaceTileBatcher.getTerrainMaterialAtlasId = function (biome, sample) {
  var surface = String(sample && sample.detail && sample.detail.surface || "").toLowerCase();
  var biomeKey = String(biome || "").toLowerCase();
  var signals = sample && sample.detail && sample.detail.materialSignals ? sample.detail.materialSignals : {};
  var civilization = sample && sample.civilization ? sample.civilization : null;
  var civilizationFamily = String(civilization && civilization.family || "").toLowerCase();
  var sampleX = Number.isFinite(Number(sample && sample.surfaceSampleX)) ? Number(sample.surfaceSampleX) : Number(sample && sample.x) || 0;
  var sampleY = Number.isFinite(Number(sample && sample.surfaceSampleY)) ? Number(sample.surfaceSampleY) : Number(sample && sample.y) || 0;
  var civilizationPressure = Math.max(
    Number(civilization && civilization.pressure) || 0,
    Number(signals.settlementDensity) || 0,
    Number(signals.workedGround) || 0,
    Number(signals.routeTraffic) || 0
  );

  if (civilizationPressure > 0.24) {
    if (civilizationFamily === "farm") {
      return "dirt";
    }
    if (civilizationFamily === "block" || civilizationFamily === "production") {
      return civilizationPressure > 0.72 && (surface.indexOf("rock") >= 0 || surface.indexOf("stone") >= 0 || biomeKey === "mountain")
        ? "stone"
        : "dirt";
    }
    return "dirt";
  }

  if (surface.indexOf("snow") >= 0) {
    return "snow";
  }

  if (surface.indexOf("ice") >= 0 || biomeKey === "ice") {
    return "ice";
  }

  if (surface.indexOf("water") >= 0 || surface.indexOf("whitecap") >= 0 || biomeKey === "ocean" || biomeKey === "lake") {
    return "water";
  }

  if (surface.indexOf("rock") >= 0 || surface.indexOf("stone") >= 0 || surface.indexOf("ridge") >= 0 || biomeKey === "mountain") {
    return "stone";
  }

  if (surface.indexOf("sand") >= 0 || surface.indexOf("dune") >= 0 || biomeKey === "desert") {
    return "sand";
  }

  if (surface.indexOf("scrub") >= 0 || surface.indexOf("moss") >= 0 || biomeKey === "barren") {
    return "dirt";
  }

  return "grass";
};

PS.render.surfaceTileBatcher.selectTerrainMaterialCell = function (biome, sample, tileX, tileY, fallbackCell) {
  var material = PS.render.surfaceTileBatcher.getTerrainMaterialAtlasId(biome, sample);
  var variant = PS.ranmap && PS.ranmap.variant
    ? PS.ranmap.variant(tileX, tileY, 8)
    : Math.abs(Math.round(Number(tileX) || 0) * 3 + Math.round(Number(tileY) || 0) * 5) % 8;
  var selected;

  if (material === "water" && PS.render.waterRendering && typeof PS.render.waterRendering.getAnimatedVariant === "function") {
    variant = PS.render.waterRendering.getAnimatedVariant(tileX, tileY, 4);
  }

  if (!PS.assets || !PS.assets.terrainMaterials || typeof PS.assets.terrainMaterials.selectCell !== "function") {
    return null;
  }

  selected = PS.assets.terrainMaterials.selectCell(material, variant, "terrainMaterial", fallbackCell && fallbackCell.name ? fallbackCell.name : "");

  return selected && selected.renderCell ? selected.renderCell : null;
};

PS.render.surfaceTileBatcher.getAcceptedTransitionPair = function (transition) {
  if (!transition) {
    return "";
  }

  if (transition.type === "coast") {
    return "grass-water";
  }

  if (transition.type === "dry") {
    return "grass-sand";
  }

  if (transition.type === "canopy") {
    return "grass-forest-floor";
  }

  if (transition.type === "ridge") {
    return "grass-rock";
  }

  if (transition.type === "frost") {
    return "rock-snow";
  }

  return "";
};

PS.render.surfaceTileBatcher.getAcceptedTransitionShape = function (mask) {
  var key = Math.max(0, Math.round(Number(mask) || 0));

  if (key === 1) { return "edge.e"; }
  if (key === 2) { return "edge.w"; }
  if (key === 4) { return "edge.s"; }
  if (key === 8) { return "edge.n"; }
  if (key === 5) { return "corner.se"; }
  if (key === 6) { return "corner.sw"; }
  if (key === 9) { return "corner.ne"; }
  if (key === 10) { return "corner.nw"; }
  if (key === 3) { return "edge.e"; }
  if (key === 12) { return "edge.s"; }
  if (key === 7) { return "inner-corner.se"; }
  if (key === 11) { return "inner-corner.ne"; }
  if (key === 13) { return "inner-corner.se"; }
  if (key === 14) { return "inner-corner.sw"; }
  if (key === 15) { return "inner-corner.ne"; }

  return "";
};

PS.render.surfaceTileBatcher.getAcceptedTransitionCellName = function (sample, biome) {
  if (sample && sample.acceptedTransitionCellName) {
    return String(sample.acceptedTransitionCellName);
  }

  var transition = PS.atlas && typeof PS.atlas.getTerrainTransitionInfo === "function"
    ? PS.atlas.getTerrainTransitionInfo(sample, biome)
    : null;
  var pair = PS.render.surfaceTileBatcher.getAcceptedTransitionPair(transition);
  var shape = PS.render.surfaceTileBatcher.getAcceptedTransitionShape(transition && transition.mask);

  return pair && shape ? pair + "." + shape : "";
};

PS.render.surfaceTileBatcher.getAcceptedWaterTransitionCellName = function (sample, tileX, tileY) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = String(detail.surface || "").toLowerCase();
  var feature = String(detail.feature || "").toLowerCase();
  var signals = detail.materialSignals || {};
  var coastal = surface.indexOf("open water") >= 0 ||
    surface.indexOf("whitecap") >= 0 ||
    feature.indexOf("foam") >= 0 ||
    feature.indexOf("shoal") >= 0 ||
    Number(signals.coast) > 0.18 ||
    Number(signals.shallowWater) > 0.18;
  var direction;

  if (!coastal || surface.indexOf("deep water") >= 0) {
    return "";
  }

  direction = Math.abs(Math.round(Number(tileX) || 0) + Math.round(Number(tileY) || 0)) % 4;
  if (direction === 0) { return "grass-water.edge.n"; }
  if (direction === 1) { return "grass-water.edge.e"; }
  if (direction === 2) { return "grass-water.edge.s"; }
  return "grass-water.edge.w";
};

PS.render.surfaceTileBatcher.getTransitionGrid = function (address, sample) {
  return address && (address.transitionGrid || address.tileGrid || address.grid) ||
    sample && (sample.transitionGrid || sample.tileGrid || sample.grid) ||
    null;
};

PS.render.surfaceTileBatcher.getAcceptedResolverTransitionPair = function (sheet) {
  var key = String(sheet || "").replace(/^transitions\//, "").replace(/_/g, "-");

  if (key === "snow-rock") {
    return "rock-snow";
  }
  if (key === "forest-grass") {
    return "grass-forest-floor";
  }

  return key;
};

PS.render.surfaceTileBatcher.getAcceptedResolverTransitionShape = function (spriteIndex) {
  var index = Math.round(Number(spriteIndex) || 0);

  if (index === 0) { return "edge.n"; }
  if (index === 1) { return "edge.e"; }
  if (index === 2) { return "edge.s"; }
  if (index === 3) { return "edge.w"; }
  if (index === 4) { return "corner.ne"; }
  if (index === 5) { return "corner.se"; }
  if (index === 6) { return "corner.sw"; }
  if (index === 7) { return "corner.nw"; }
  if (index === 8) { return "inner-corner.ne"; }
  if (index === 9) { return "inner-corner.se"; }
  if (index === 10) { return "inner-corner.sw"; }
  if (index === 11) { return "inner-corner.nw"; }

  return "";
};

PS.render.surfaceTileBatcher.getAcceptedResolverTransitionPattern = function (overlay) {
  var index = Math.round(Number(overlay && overlay.joinPatternIndex));

  if (!Number.isFinite(index) || index < 0) {
    return "";
  }

  return "pattern-" + (index < 10 ? "0" : "") + index;
};

PS.render.surfaceTileBatcher.getResolverTransitionCellNames = function (tileX, tileY, grid, lodState) {
  var policy = PS.render.surfaceTileBatcher.getVisualPolicy(lodState);
  var resolver = PS.render && PS.render.terrainTransitions &&
    typeof PS.render.terrainTransitions.resolve === "function"
    ? PS.render.terrainTransitions
    : null;
  var resolved;
  var overlays;
  var names = [];

  if (!resolver || !grid || policy.autotileTransitions === "disabled") {
    return names;
  }

  resolved = resolver.resolve(tileX, tileY, grid);
  overlays = resolved && Array.isArray(resolved.overlays) ? resolved.overlays : [];

  for (var i = 0; i < overlays.length; i += 1) {
    var pair = PS.render.surfaceTileBatcher.getAcceptedResolverTransitionPair(overlays[i].sheet);
    var pattern = PS.render.surfaceTileBatcher.getAcceptedResolverTransitionPattern(overlays[i]);
    var shape = PS.render.surfaceTileBatcher.getAcceptedResolverTransitionShape(overlays[i].spriteIndex);

    if (pair && pattern) {
      names.push(pair + "." + pattern);
    } else if (pair && shape) {
      names.push(pair + "." + shape);
    }

    if (policy.autotileTransitions === "simplified") {
      break;
    }
  }

  return names;
};

PS.render.surfaceTileBatcher.getAcceptedTransitionCellNames = function (address, sample, biome, tileX, tileY, lodState) {
  var gridNames = PS.render.surfaceTileBatcher.getResolverTransitionCellNames(
    tileX,
    tileY,
    PS.render.surfaceTileBatcher.getTransitionGrid(address, sample),
    lodState
  );
  var fallbackName;

  if (gridNames.length > 0) {
    return gridNames;
  }

  fallbackName = PS.render.surfaceTileBatcher.getAcceptedTransitionCellName(sample, biome) ||
    PS.render.surfaceTileBatcher.getAcceptedWaterTransitionCellName(sample, tileX, tileY);

  return fallbackName ? [fallbackName] : [];
};

PS.render.surfaceTileBatcher.shouldAppendAcceptedTransitions = function (address, sample, tileX, tileY, lodState) {
  var policy = PS.render.surfaceTileBatcher.getVisualPolicy(lodState);
  if (PS.render.surfaceTileBatcher.hasCivilizationMaterialSignal(sample)) {
    return false;
  }

  return Boolean(PS.render.surfaceTileBatcher.getTransitionGrid(address, sample)) && policy.autotileTransitions !== "disabled";
};

PS.render.surfaceTileBatcher.hasCivilizationMaterialSignal = function (sample) {
  var signals = sample && sample.detail && sample.detail.materialSignals ? sample.detail.materialSignals : {};
  var signal = Math.max(
    Number(signals.settlementDensity) || 0,
    Number(signals.routeTraffic) || 0,
    Number(signals.borderInfluence) || 0,
    Number(sample && sample.civilization && sample.civilization.pressure) || 0
  );
  var nearest;

  if (signal > 0.06) {
    return true;
  }

  if (
    PS.render &&
    PS.render.surface &&
    typeof PS.render.surface.getNearestMetricSettlement === "function" &&
    Array.isArray(world && world.settlements) &&
    world.settlements.length > 0
  ) {
    nearest = PS.render.surface.getNearestMetricSettlement(sample, Number(sample && sample.x) || 0, Number(sample && sample.y) || 0);
    if (
      nearest &&
      nearest.context &&
      Number(nearest.context.distanceMeters) <= Number(nearest.context.influenceRadiusMeters) * 1.05
    ) {
      return true;
    }
  }

  return false;
};

PS.render.surfaceTileBatcher.isNearSettlementVisualFootprint = function (sample, multiplier) {
  var radiusMultiplier = Math.max(1, Number(multiplier) || 1);
  var nearest;

  if (
    !PS.render ||
    !PS.render.surface ||
    typeof PS.render.surface.getNearestMetricSettlement !== "function" ||
    !Array.isArray(world && world.settlements) ||
    world.settlements.length <= 0
  ) {
    return false;
  }

  nearest = PS.render.surface.getNearestMetricSettlement(sample, Number(sample && sample.x) || 0, Number(sample && sample.y) || 0);
  return !!(
    nearest &&
    nearest.context &&
    Number(nearest.context.distanceMeters) <= Number(nearest.context.influenceRadiusMeters) * radiusMultiplier
  );
};

PS.render.surfaceTileBatcher.isSettlementScale = function (lodState) {
  var zoomBand = lodState && lodState.zoomBand ? String(lodState.zoomBand) : "";
  var cameraInfo;

  if (zoomBand === "settlement") {
    return true;
  }

  cameraInfo = PS.camera && typeof PS.camera.getInfo === "function"
    ? PS.camera.getInfo()
    : null;

  return Number(cameraInfo && cameraInfo.zoomValue) >= 6;
};

PS.render.surfaceTileBatcher.canSelectAcceptedTerrainMaterial = function (sample) {
  var ecologyKey = sample && sample.ecology && sample.ecology.key ? String(sample.ecology.key) : String(sample && sample.ecologyKey || "");
  var civilizationKey = sample && sample.civilization && sample.civilization.key ? String(sample.civilization.key) : String(sample && sample.civilizationKey || "");

  return (!ecologyKey || ecologyKey === "eco.0.0") && (!civilizationKey || civilizationKey === "civ0");
};

PS.render.surfaceTileBatcher.selectAcceptedTerrainCell = function (biome, sample, tileX, tileY, fallbackCell) {
  if (
    typeof world !== "undefined" &&
    world &&
    (world.isCameraInteracting || world.isPaused === false) &&
    !(sample && sample.acceptedTransitionCellName)
  ) {
    return {
      cell: fallbackCell,
      kind: ""
    };
  }

  var transitionCellName = PS.render.surfaceTileBatcher.getAcceptedTransitionCellName(sample, biome) ||
    PS.render.surfaceTileBatcher.getAcceptedWaterTransitionCellName(sample, tileX, tileY);
  var selected;
  var transitionPhase = Math.abs(Math.round(Number(tileX) || 0) + Math.round(Number(tileY) || 0)) % 256;
  var terrainPhase = Math.abs(Math.round(Number(tileX) || 0) * 3 + Math.round(Number(tileY) || 0) * 5) % 256;
  var hasAcceptedTerrainCell = Boolean(sample && sample.acceptedTerrainCellName);

  if (
    transitionCellName &&
    (sample && sample.acceptedTransitionCellName || transitionPhase === 0) &&
    PS.assets &&
    PS.assets.equivalence &&
    typeof PS.assets.equivalence.selectCell === "function"
  ) {
    selected = PS.assets.equivalence.selectCell("transitions", transitionCellName, "terrainTransition", fallbackCell && fallbackCell.name ? fallbackCell.name : "");
    if (selected && selected.renderCell) {
      return {
        cell: selected.renderCell,
        kind: "transition"
      };
    }
  }

  if (
    (hasAcceptedTerrainCell || PS.render.surfaceTileBatcher.canSelectAcceptedTerrainMaterial(sample)) &&
    PS.assets &&
    PS.assets.equivalence &&
    typeof PS.assets.equivalence.selectCell === "function" &&
    (hasAcceptedTerrainCell || terrainPhase === 0)
  ) {
    var terrainCellName = PS.render.surfaceTileBatcher.getAcceptedTerrainMaterialCellName(biome, sample, tileX, tileY);
    var use = terrainCellName.indexOf("water-") === 0 ? "terrainWater" : "terrainGround";
    selected = PS.assets.equivalence.selectCell("terrain", terrainCellName, use, fallbackCell && fallbackCell.name ? fallbackCell.name : "");
    if (selected && selected.renderCell) {
      return {
        cell: selected.renderCell,
        kind: "terrain"
      };
    }
  }

  return {
    cell: fallbackCell,
    kind: ""
  };
};

PS.render.surfaceTileBatcher.getPageBuffer = function (batches, pageIndex) {
  var state = PS.render.surfaceTileBatcher.state;
  var stride = PS.render.surfaceTileBatcher.strideFloats;
  var key = String(pageIndex);
  var page = state.pageBuffers[key];

  if (!page) {
    page = {
      data: new Float32Array(Math.max(stride * 64, stride)),
      length: 0,
      token: 0
    };
    state.pageBuffers[key] = page;
  }

  if (page.token !== batches.pageBufferToken) {
    page.length = 0;
    page.token = batches.pageBufferToken;
  }

  if (page.length + stride > page.data.length) {
    var nextLength = page.data.length;

    while (page.length + stride > nextLength) {
      nextLength *= 2;
    }

    var nextData = new Float32Array(nextLength);
    nextData.set(page.data.subarray(0, page.length), 0);
    page.data = nextData;
  }

  batches.pages[key] = page;
  return page;
};

PS.render.surfaceTileBatcher.appendInstance = function (
  page,
  x,
  y,
  width,
  height,
  u0,
  v0,
  u1,
  v1,
  alpha,
  flipH,
  splitNormal,
  waterInfo
) {
  var offset = page.length;
  var water = waterInfo || null;

  page.data[offset] = x;
  page.data[offset + 1] = y;
  page.data[offset + 2] = width;
  page.data[offset + 3] = height;
  page.data[offset + 4] = u0;
  page.data[offset + 5] = v0;
  page.data[offset + 6] = u1;
  page.data[offset + 7] = v1;
  page.data[offset + 8] = alpha;
  page.data[offset + 9] = flipH;
  page.data[offset + 10] = splitNormal ? 1 : 0;
  page.data[offset + 11] = water ? water.depthCode : 0;
  page.data[offset + 12] = water ? water.stencilIndex : 0;
  page.data[offset + 13] = water ? water.waveOffset : 0;
  page.data[offset + 14] = water ? water.growth : 1;
  page.length += PS.render.surfaceTileBatcher.strideFloats;
};

PS.render.surfaceTileBatcher.appendAcceptedTransitionOverlays = function (
  target,
  transitionCellNames,
  fallbackCell,
  screenX,
  screenY,
  samplePixelSize,
  alpha
) {
  if (
    !target ||
    !transitionCellNames ||
    transitionCellNames.length <= 0 ||
    !PS.assets ||
    !PS.assets.equivalence ||
    typeof PS.assets.equivalence.selectCell !== "function"
  ) {
    return 0;
  }

  var appended = 0;

  for (var i = 0; i < transitionCellNames.length; i += 1) {
    var cellName = transitionCellNames[i];
    var selected = PS.assets.equivalence.selectCell(
      "transitions",
      cellName,
      "terrainTransition",
      fallbackCell && fallbackCell.name ? fallbackCell.name : ""
    );
    var cell = selected && selected.renderCell ? selected.renderCell : null;

    if (!cell) {
      continue;
    }

    var page = PS.render.surfaceTileBatcher.getPageBuffer(target, cell.pageIndex);
    PS.render.surfaceTileBatcher.appendInstance(
      page,
      screenX,
      screenY,
      samplePixelSize,
      samplePixelSize,
      cell.u0,
      cell.v0,
      cell.u1,
      cell.v1,
      alpha,
      0,
      cell.splitAtlas,
      null
    );
    target.count++;
    target.equivalenceTransitions++;
    if (target.materialCounts) {
      target.materialCounts[cell.name] = (target.materialCounts[cell.name] || 0) + 1;
    }
    appended++;
  }

  return appended;
};

PS.render.surfaceTileBatcher.appendSettlementParcelRects = function (target, parcels, chunkSamples) {
  if (!target || !Array.isArray(parcels) || parcels.length <= 0) {
    return 0;
  }

  var width = Math.max(1, Math.round(Number(chunkSamples) || 1));
  var grid = new Array(width * width);
  var used = new Array(width * width);
  var appended = 0;

  for (var i = 0; i < parcels.length; i += 1) {
    var parcel = parcels[i];
    var index = parcel.ay * width + parcel.ax;

    if (index >= 0 && index < grid.length) {
      grid[index] = parcel;
    }
  }

  function canMerge(base, candidate) {
    return !!(
      base &&
      candidate &&
      !used[candidate.ay * width + candidate.ax] &&
      candidate.family === base.family &&
      candidate.pageIndex === base.pageIndex &&
      candidate.splitAtlas === base.splitAtlas
    );
  }

  for (var y = 0; y < width; y += 1) {
    for (var x = 0; x < width; x += 1) {
      var startIndex = y * width + x;
      var base = grid[startIndex];

      if (!base || used[startIndex]) {
        continue;
      }

      var rectW = 1;
      while (x + rectW < width && canMerge(base, grid[y * width + x + rectW])) {
        rectW += 1;
      }

      var rectH = 1;
      var canGrow = true;
      while (y + rectH < width && canGrow) {
        for (var gx = 0; gx < rectW; gx += 1) {
          if (!canMerge(base, grid[(y + rectH) * width + x + gx])) {
            canGrow = false;
            break;
          }
        }

        if (canGrow) {
          rectH += 1;
        }
      }

      for (var markY = 0; markY < rectH; markY += 1) {
        for (var markX = 0; markX < rectW; markX += 1) {
          used[(y + markY) * width + x + markX] = true;
        }
      }

      var page = PS.render.surfaceTileBatcher.getPageBuffer(target, base.pageIndex);
      PS.render.surfaceTileBatcher.appendInstance(
        page,
        base.screenX,
        base.screenY,
        base.samplePixelSize * rectW,
        base.samplePixelSize * rectH,
        base.u0,
        base.v0,
        base.u1,
        base.v1,
        base.alpha,
        base.flipH,
        base.splitAtlas,
        null
      );
      target.count++;
      if (target.materialCounts && base.name) {
        target.materialCounts[base.name] = (target.materialCounts[base.name] || 0) + 1;
      }
      appended++;
    }
  }

  return appended;
};

/**
 * @description Builds render batches for one streamed surface address, combining cached cell samples, terrain material decisions, vegetation, civilization overlays, and LOD policy into draw-ready tile payloads.
 * @param {Object|null} batches Existing batch accumulator, or null to create a fresh accumulator.
 * @param {Object} address Surface address describing world coordinates, screen offsets, and sample size.
 * @param {Object} cellCache Cached surface cells keyed by local sample coordinates.
 * @param {number} alpha Tile alpha applied to every accepted batch item.
 * @param {Object|null} lodState Current level-of-detail state used to choose visual policy.
 * @returns {Object} The batch accumulator populated with terrain, ecology, and overlay draw items.
 */
PS.render.surfaceTileBatcher.appendBatches = function (batches, address, cellCache, alpha, lodState) {
  var target = batches || PS.render.surfaceTileBatcher.beginBatches();
  var policy = PS.render.surfaceTileBatcher.getVisualPolicy(lodState);
  var baseWorldX = address.sampleEast || 0;
  var baseWorldY = address.sampleNorth || 0;
  var screenOffsetX = Number(address.renderScreenX) || 0;
  var screenOffsetY = Number(address.renderScreenY) || 0;
  var samplePixelSize = Math.max(1, Number(address.renderSamplePixelSize) || CONFIG.TILE_SIZE);
  var tileAlpha = clamp(Number(alpha) || 1, 0, 1);
  var settlementParcels = [];
  var settlementScale = PS.render.surfaceTileBatcher.isSettlementScale(lodState);

  if (target.pageBufferToken === undefined) {
    target.pageBufferToken = ++PS.render.surfaceTileBatcher.state.pageBufferToken;
  }

  for (var i = 0; i < cellCache.length; i++) {
    var cellData = cellCache[i];
    var rawSample = cellData && cellData.sample ? cellData.sample : null;
    var sample = PS.render.surface && typeof PS.render.surface.withEcology === "function"
      ? PS.render.surface.withEcology(rawSample)
      : rawSample;
    var biome = sample ? sample.biome : null;

    if (!biome) {
      target.culled++;
      continue;
    }

    var ax = i % address.chunkSamples;
    var ay = Math.floor(i / address.chunkSamples);
    var tileX = baseWorldX + ax;
    var tileY = baseWorldY + ay;
    if (PS.render.surface && typeof PS.render.surface.withCivilization === "function") {
      sample = PS.render.surface.withCivilization(sample);
    }
    var ecologyKey = sample && sample.ecology ? sample.ecology.key : "eco.0.0";
    var ecologyMicroKey = "";
    if (sample && PS.atlas && typeof PS.atlas.getTerrainEcologyMicroKey === "function") {
      ecologyMicroKey = PS.atlas.getTerrainEcologyMicroKey(sample, tileX, tileY);
    }
    var drawSample = Object.assign({ x: tileX, y: tileY }, sample || {});
    var moistureKey = PS.render && PS.render.surfaceColor && typeof PS.render.surfaceColor.getGroundMoistureKey === "function"
      ? PS.render.surfaceColor.getGroundMoistureKey(drawSample)
      : "gmoist.none";
    var eraKey = PS.render && PS.render.surfaceColor && typeof PS.render.surfaceColor.getEraPaletteKey === "function"
      ? PS.render.surfaceColor.getEraPaletteKey(drawSample)
      : "era.none";
    var nearSettlementGround = settlementScale &&
      PS.render.surfaceTileBatcher.isNearSettlementVisualFootprint(drawSample, 2.75);
    var tileDefinitionForKey = PS.atlas && typeof PS.atlas.getTerrainMaterialTile === "function"
      ? PS.atlas.getTerrainMaterialTile(biome, tileX, tileY, drawSample)
      : null;
    var transitionKey = PS.atlas && typeof PS.atlas.getTerrainTransitionKey === "function"
      ? PS.atlas.getTerrainTransitionKey(drawSample, biome)
      : "plain";
    var stencilKey = PS.atlas && typeof PS.atlas.getTerrainTextureOverlayKey === "function"
      ? PS.atlas.getTerrainTextureOverlayKey(drawSample, biome)
      : "stencil.none";
    var featureKey = PS.atlas && typeof PS.atlas.getTerrainFeatureKey === "function"
      ? PS.atlas.getTerrainFeatureKey(drawSample, biome, tileDefinitionForKey)
      : "feature0";
    var biologyKey = PS.atlas && typeof PS.atlas.getTerrainBiologyKey === "function"
      ? PS.atlas.getTerrainBiologyKey(drawSample)
      : "bio0";
    var resourceKey = PS.atlas && typeof PS.atlas.getTerrainResourceKey === "function"
      ? PS.atlas.getTerrainResourceKey(drawSample)
      : "";
    var civilizationKey = PS.atlas && typeof PS.atlas.getTerrainCivilizationKey === "function"
      ? PS.atlas.getTerrainCivilizationKey(drawSample)
      : (sample && sample.civilization ? sample.civilization.key : "civ0");
    var hasCivilizationMaterial = civilizationKey !== "civ0";
    var atlasKeyId = PS.render.surfaceTileBatcher.getTerrainAtlasKeyId(
      ecologyKey,
      ecologyMicroKey,
      transitionKey,
      stencilKey,
      featureKey,
      moistureKey,
      eraKey,
      biologyKey,
      resourceKey,
      civilizationKey
    );
    var cell = cellData.terrainAtlasKeyId === atlasKeyId ? cellData.terrainAtlasCell || null : null;
    if (!cell) {
      cell = PS.atlas.getTerrainCell(biome, tileX, tileY, sample);
      cellData.terrainAtlasCell = cell;
      cellData.terrainAtlasKeyId = atlasKeyId;
    }

    if (!cell) {
      target.culled++;
      continue;
    }

    var canAttemptAccepted = !nearSettlementGround && !PS.render.surfaceTileBatcher.hasCivilizationMaterialSignal(sample) && !(
      typeof world !== "undefined" &&
      world &&
      (world.isCameraInteracting || world.isPaused === false) &&
      !(sample && sample.acceptedTransitionCellName)
    );
    if (canAttemptAccepted && !hasCivilizationMaterial) {
      var acceptedCellKey = (
        PS.render.surfaceTileBatcher.getAcceptedTransitionCellName(sample, biome) ||
        PS.render.surfaceTileBatcher.getAcceptedWaterTransitionCellName(sample, tileX, tileY) ||
        PS.render.surfaceTileBatcher.getAcceptedTerrainMaterialCellName(biome, sample, tileX, tileY) ||
        "terrain"
      );
      var acceptedKeyId = PS.render.surfaceTileBatcher.getAcceptedKeyId(atlasKeyId, acceptedCellKey);
      var acceptedSelection = cellData.terrainEquivalenceKeyId === acceptedKeyId ? cellData.terrainEquivalenceSelection || null : null;
      if (!acceptedSelection) {
        acceptedSelection = PS.render.surfaceTileBatcher.selectAcceptedTerrainCell(biome, sample, tileX, tileY, cell);
        cellData.terrainEquivalenceSelection = acceptedSelection;
        cellData.terrainEquivalenceKeyId = acceptedKeyId;
      }
      if (acceptedSelection && acceptedSelection.cell) {
        cell = acceptedSelection.cell;
        if (acceptedSelection.kind === "transition") {
          target.equivalenceTransitions++;
        } else if (acceptedSelection.kind === "terrain") {
          target.equivalenceTerrain++;
        }
      }
    }

    if (!(cell && cell.splitAtlas) && !(sample && sample.acceptedTransitionCellName) && !hasCivilizationMaterial) {
      var materialCell = PS.render.surfaceTileBatcher.selectTerrainMaterialCell(biome, sample, tileX, tileY, cell);
      if (materialCell) {
        cell = materialCell;
        target.equivalenceTerrain++;
      }
    }

    PS.render.surfaceTileBatcher.recordCivilizationMaterial(target, drawSample);
    var civilizationInfo = PS.atlas && typeof PS.atlas.getTerrainCivilizationInfo === "function"
      ? PS.atlas.getTerrainCivilizationInfo(drawSample)
      : null;

    var shadeBucket = PS.ranmap && PS.ranmap.data && PS.ranmap.normalizedBits ? PS.ranmap.normalizedBits(tileX, tileY, 20, 2) * 0.24 : 0;
    if (hasCivilizationMaterial) {
      shadeBucket *= 0.18;
    }
    var flipH = (PS.ranmap && PS.ranmap.data && PS.ranmap.flipH(tileX, tileY) ? 1 : 0) + shadeBucket;
    var page = PS.render.surfaceTileBatcher.getPageBuffer(target, cell.pageIndex);
    var screenX = screenOffsetX + cellData.screenX * (samplePixelSize / CONFIG.TILE_SIZE);
    var screenY = screenOffsetY + cellData.screenY * (samplePixelSize / CONFIG.TILE_SIZE);
    var featherAlpha = PS.render.surfaceReadyFeather && typeof PS.render.surfaceReadyFeather.getAlpha === "function" ? PS.render.surfaceReadyFeather.getAlpha(address, screenX, screenY, samplePixelSize) : 1;
    var waterInfo = !hasCivilizationMaterial && PS.render.waterRendering && typeof PS.render.waterRendering.getRenderInfo === "function"
      ? PS.render.waterRendering.getRenderInfo(sample, biome, tileX, tileY, lodState)
      : null;

    PS.render.surfaceTileBatcher.appendSamplePointLights(target, sample, biome, screenX, screenY, samplePixelSize, tileX, tileY, lodState);
    PS.render.surfaceTileBatcher.appendSampleTileLight(target, sample, biome, screenX, screenY, samplePixelSize, tileAlpha * featherAlpha);
    PS.render.surfaceTileBatcher.appendSampleDisplacement(target, sample, biome, screenX, screenY, samplePixelSize, tileX, tileY, lodState);
    PS.render.surfaceTileBatcher.appendWaterDecoration(target, sample, biome, screenX, screenY, samplePixelSize, tileX, tileY, lodState);

    var embeddedCivilizationSettlementDensity = civilizationInfo ? Math.max(
      Number(drawSample && drawSample.detail && drawSample.detail.materialSignals && drawSample.detail.materialSignals.settlementDensity) || 0,
      Number(drawSample && drawSample.civilization && drawSample.civilization.settlementPressure) || 0
    ) : 0;
    if (
      civilizationInfo &&
      (
        civilizationInfo.type === "settlement" ||
        ((civilizationInfo.type === "route" || civilizationInfo.type === "border") &&
          embeddedCivilizationSettlementDensity >= 0.24)
      ) ||
      (!civilizationInfo && nearSettlementGround)
    ) {
      var parcelCivilizationInfo = civilizationInfo || {
        type: "settlement",
        family: "yard",
        pressure: 0.32,
        bucket: 1,
        lineageId: 1
      };
      var mergeSample = Object.assign({}, drawSample, {
        biome: "grass",
        renderSettlementParcelFillOnly: true,
        civilization: civilizationInfo && civilizationInfo.type === "settlement"
          ? drawSample.civilization
          : Object.assign({}, drawSample.civilization || {}, {
            type: "settlement",
            family: "yard",
            pressure: Math.max(0.32, embeddedCivilizationSettlementDensity),
            settlementPressure: Math.max(0.32, embeddedCivilizationSettlementDensity)
          })
      });
      var parcelKeyId = PS.render.surfaceTileBatcher.getSettlementParcelKeyId(
        atlasKeyId,
        parcelCivilizationInfo,
        embeddedCivilizationSettlementDensity
      );
      var mergeCell = cellData.settlementParcelKeyId === parcelKeyId
        ? cellData.settlementParcelCell || null
        : null;
      if (!mergeCell && PS.atlas && typeof PS.atlas.getTerrainCell === "function") {
        mergeCell = PS.atlas.getTerrainCell("grass", tileX, tileY, mergeSample);
        cellData.settlementParcelCell = mergeCell;
        cellData.settlementParcelKeyId = parcelKeyId;
      }
      var parcelCell = mergeCell || cell;
      settlementParcels.push({
        ax: ax,
        ay: ay,
        family: String(parcelCivilizationInfo.family || "yard"),
        name: parcelCell.name,
        pageIndex: parcelCell.pageIndex,
        screenX: screenX,
        screenY: screenY,
        samplePixelSize: samplePixelSize,
        u0: parcelCell.u0,
        v0: parcelCell.v0,
        u1: parcelCell.u1,
        v1: parcelCell.v1,
        alpha: tileAlpha * featherAlpha,
        flipH: flipH,
        splitAtlas: parcelCell.splitAtlas
      });
      continue;
    }

    if (target.materialCounts) {
      target.materialCounts[cell.name] = (target.materialCounts[cell.name] || 0) + 1;
    }
    PS.render.surfaceTileBatcher.appendInstance(
      page,
      screenX,
      screenY,
      samplePixelSize,
      samplePixelSize,
      cell.u0,
      cell.v0,
      cell.u1,
      cell.v1,
      tileAlpha * featherAlpha,
      flipH,
      cell.splitAtlas,
      waterInfo
    );
    target.count++;
    if (PS.render.mountains && typeof PS.render.mountains.appendMountain === "function") {
      var mountainCivilizationPressure = Math.max(
        Number(sample && sample.civilization && sample.civilization.pressure) || 0,
        Number(sample && sample.detail && sample.detail.materialSignals && sample.detail.materialSignals.settlementDensity) || 0,
        Number(sample && sample.detail && sample.detail.materialSignals && sample.detail.materialSignals.workedGround) || 0,
        Number(sample && sample.detail && sample.detail.materialSignals && sample.detail.materialSignals.routeTraffic) || 0
      );

      if (
        !hasCivilizationMaterial &&
        mountainCivilizationPressure <= 0.06 &&
        !PS.render.surfaceTileBatcher.hasCivilizationMaterialSignal(sample) &&
        !PS.render.surfaceTileBatcher.isNearSettlementVisualFootprint(sample, 2.75) &&
        !(
          settlementScale &&
          Array.isArray(world && world.settlements) &&
          world.settlements.length > 0
        )
      ) {
        PS.render.mountains.appendMountain(target, sample, biome, tileX, tileY, screenX, screenY, samplePixelSize, tileAlpha * featherAlpha, lodState, cell);
      }
    }
    if (
      canAttemptAccepted &&
      (!hasCivilizationMaterial || sample && sample.acceptedTransitionCellName) &&
      PS.render.surfaceTileBatcher.shouldAppendAcceptedTransitions(address, sample, tileX, tileY, lodState)
    ) {
      PS.render.surfaceTileBatcher.appendAcceptedTransitionOverlays(
        target,
        PS.render.surfaceTileBatcher.getAcceptedTransitionCellNames(address, sample, biome, tileX, tileY, lodState),
        cell,
        screenX,
        screenY,
        samplePixelSize,
        tileAlpha * featherAlpha * Math.max(0, Number(policy.transitionAlphaScale) || 0)
      );
    }
  }

  PS.render.surfaceTileBatcher.appendSettlementParcelRects(target, settlementParcels, address.chunkSamples);

  return target;
};

PS.render.surfaceTileBatcher.finalizeBatchPages = function (batches) {
  if (!batches || !batches.pages) {
    return batches;
  }

  Object.keys(batches.pages).forEach(function (pageIndex) {
    var page = batches.pages[pageIndex];

    if (page && page.data && typeof page.length === "number") {
      batches.pages[pageIndex] = page.data.subarray(0, page.length);
    } else if (page && !(page instanceof Float32Array)) {
      batches.pages[pageIndex] = new Float32Array(page);
    }
  });

  return batches;
};
