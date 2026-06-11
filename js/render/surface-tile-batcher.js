"use strict";
PS.render = PS.render || {};
PS.render.surfaceTileBatcher = PS.render.surfaceTileBatcher || {};

PS.render.surfaceTileBatcher.strideFloats = 15;

PS.render.surfaceTileBatcher.state = PS.render.surfaceTileBatcher.state || {
  pageBuffers: {},
  pageBufferToken: 0
};

PS.render.surfaceTileBatcher.beginBatches = function () {
  var state = PS.render.surfaceTileBatcher.state;

  state.pageBufferToken++;

  return {
    pages: {},
    count: 0,
    culled: 0,
    materialCounts: {},
    equivalenceTerrain: 0,
    equivalenceTransitions: 0,
    pointLights: [],
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

PS.render.surfaceTileBatcher.getAcceptedTerrainMaterialCellName = function (biome, sample, tileX, tileY) {
  if (sample && sample.acceptedTerrainCellName) {
    return String(sample.acceptedTerrainCellName);
  }

  var surface = String(sample && sample.detail && sample.detail.surface || "").toLowerCase();
  var signals = sample && sample.detail && sample.detail.materialSignals ? sample.detail.materialSignals : {};
  var variant = PS.ranmap && PS.ranmap.variant ? PS.ranmap.variant(tileX, tileY, 2) : Math.abs((Math.round(tileX) + Math.round(tileY)) % 2);

  if (surface.indexOf("deep water") >= 0 || String(biome || "") === "ocean" && Number(signals.waterDepth) > 0.62) {
    return "water-deep." + variant;
  }

  if (surface.indexOf("water") >= 0 || surface.indexOf("whitecap") >= 0) {
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
    var shape = PS.render.surfaceTileBatcher.getAcceptedResolverTransitionShape(overlays[i].spriteIndex);

    if (pair && shape) {
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
  return Boolean(PS.render.surfaceTileBatcher.getTransitionGrid(address, sample)) && policy.autotileTransitions !== "disabled";
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

  if (transitionCellName && transitionPhase === 0 && PS.assets && PS.assets.equivalence && typeof PS.assets.equivalence.selectCell === "function") {
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

PS.render.surfaceTileBatcher.makeBatches = function (address, cellCache, alpha, lodState) {
  return PS.render.surfaceTileBatcher.appendBatches(PS.render.surfaceTileBatcher.beginBatches(), address, cellCache, alpha, lodState);
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

PS.render.surfaceTileBatcher.appendBatches = function (batches, address, cellCache, alpha, lodState) {
  var target = batches || PS.render.surfaceTileBatcher.beginBatches();
  var policy = PS.render.surfaceTileBatcher.getVisualPolicy(lodState);
  var baseWorldX = address.sampleEast || 0;
  var baseWorldY = address.sampleNorth || 0;
  var screenOffsetX = Number(address.renderScreenX) || 0;
  var screenOffsetY = Number(address.renderScreenY) || 0;
  var samplePixelSize = Math.max(1, Number(address.renderSamplePixelSize) || CONFIG.TILE_SIZE);
  var tileAlpha = clamp(Number(alpha) || 1, 0, 1);

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
    if (sample && PS.atlas && typeof PS.atlas.getTerrainEcologyMicroKey === "function") {
      ecologyKey += PS.atlas.getTerrainEcologyMicroKey(sample, tileX, tileY);
    }
    var moistureKey = PS.render && PS.render.surfaceColor && typeof PS.render.surfaceColor.getGroundMoistureKey === "function"
      ? PS.render.surfaceColor.getGroundMoistureKey(Object.assign({ x: tileX, y: tileY }, sample || {}))
      : "gmoist.none";
    var eraKey = PS.render && PS.render.surfaceColor && typeof PS.render.surfaceColor.getEraPaletteKey === "function"
      ? PS.render.surfaceColor.getEraPaletteKey(Object.assign({ x: tileX, y: tileY }, sample || {}))
      : "era.none";
    var drawSample = Object.assign({ x: tileX, y: tileY }, sample || {});
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
    var atlasKey = ecologyKey + "|" + transitionKey + "|" + stencilKey + "|" + featureKey + "|" + moistureKey + "|" + eraKey + "|" + biologyKey + resourceKey + "|" + civilizationKey;
    var cell = cellData.terrainAtlasEcologyKey === atlasKey ? cellData.terrainAtlasCell || null : null;
    if (!cell) {
      cell = PS.atlas.getTerrainCell(biome, tileX, tileY, sample);
      cellData.terrainAtlasCell = cell;
      cellData.terrainAtlasEcologyKey = atlasKey;
    }

    if (!cell) {
      target.culled++;
      continue;
    }

    var canAttemptAccepted = !(
      typeof world !== "undefined" &&
      world &&
      (world.isCameraInteracting || world.isPaused === false) &&
      !(sample && sample.acceptedTransitionCellName)
    );
    if (canAttemptAccepted) {
      var acceptedKey = atlasKey + "|equiv|" + (
        PS.render.surfaceTileBatcher.getAcceptedTransitionCellName(sample, biome) ||
        PS.render.surfaceTileBatcher.getAcceptedWaterTransitionCellName(sample, tileX, tileY) ||
        PS.render.surfaceTileBatcher.getAcceptedTerrainMaterialCellName(biome, sample, tileX, tileY) ||
        "terrain"
      );
      var acceptedSelection = cellData.terrainEquivalenceKey === acceptedKey ? cellData.terrainEquivalenceSelection || null : null;
      if (!acceptedSelection) {
        acceptedSelection = PS.render.surfaceTileBatcher.selectAcceptedTerrainCell(biome, sample, tileX, tileY, cell);
        cellData.terrainEquivalenceSelection = acceptedSelection;
        cellData.terrainEquivalenceKey = acceptedKey;
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

    if (!(cell && cell.splitAtlas) && !(sample && sample.acceptedTransitionCellName)) {
      var materialCell = PS.render.surfaceTileBatcher.selectTerrainMaterialCell(biome, sample, tileX, tileY, cell);
      if (materialCell) {
        cell = materialCell;
        target.equivalenceTerrain++;
      }
    }

    if (target.materialCounts) {
      target.materialCounts[cell.name] = (target.materialCounts[cell.name] || 0) + 1;
    }

    var shadeBucket = PS.ranmap && PS.ranmap.data && PS.ranmap.normalizedBits ? PS.ranmap.normalizedBits(tileX, tileY, 20, 2) * 0.24 : 0;
    var flipH = (PS.ranmap && PS.ranmap.data && PS.ranmap.flipH(tileX, tileY) ? 1 : 0) + shadeBucket;
    var page = PS.render.surfaceTileBatcher.getPageBuffer(target, cell.pageIndex);
    var screenX = screenOffsetX + cellData.screenX * (samplePixelSize / CONFIG.TILE_SIZE);
    var screenY = screenOffsetY + cellData.screenY * (samplePixelSize / CONFIG.TILE_SIZE);
    var featherAlpha = PS.render.surfaceReadyFeather && typeof PS.render.surfaceReadyFeather.getAlpha === "function" ? PS.render.surfaceReadyFeather.getAlpha(address, screenX, screenY, samplePixelSize) : 1;
    var waterInfo = PS.render.waterRendering && typeof PS.render.waterRendering.getRenderInfo === "function"
      ? PS.render.waterRendering.getRenderInfo(sample, biome, tileX, tileY, lodState)
      : null;

    PS.render.surfaceTileBatcher.appendSamplePointLights(target, sample, biome, screenX, screenY, samplePixelSize, tileX, tileY, lodState);
    PS.render.surfaceTileBatcher.appendWaterDecoration(target, sample, biome, screenX, screenY, samplePixelSize, tileX, tileY, lodState);
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
      PS.render.mountains.appendMountain(target, sample, biome, tileX, tileY, screenX, screenY, samplePixelSize, tileAlpha * featherAlpha, lodState, cell);
    }
    if (canAttemptAccepted && PS.render.surfaceTileBatcher.shouldAppendAcceptedTransitions(address, sample, tileX, tileY, lodState)) {
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
