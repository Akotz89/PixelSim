"use strict";
PS.render = PS.render || {};
PS.render.surfaceTileBatcher = PS.render.surfaceTileBatcher || {};

PS.render.surfaceTileBatcher.strideFloats = 10;

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
    pageBufferToken: state.pageBufferToken
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

PS.render.surfaceTileBatcher.appendSamplePointLights = function (target, sample, biome, screenX, screenY, samplePixelSize, tileX, tileY) {
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

  if (ventSignal) {
    return PS.render.surfaceTileBatcher.appendPointLight(target, centerX, centerY, samplePixelSize * 8, [1, 0.2, 0], 1.05, "volcano");
  }

  if (lavaSignal > 0.35) {
    return PS.render.surfaceTileBatcher.appendPointLight(
      target,
      centerX,
      centerY,
      samplePixelSize * 4,
      [1, 0.35, 0.05],
      Math.max(0.55, Math.min(1.2, lavaSignal)),
      "lava"
    );
  }

  if (String(biome || "") === "ocean" && waterDepth > 0.7 && sparseBio) {
    return PS.render.surfaceTileBatcher.appendPointLight(target, centerX, centerY, samplePixelSize * 2, [0.1, 0.6, 1], 0.42, "bioluminescence");
  }

  return false;
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

  if (transition.type === "ridge" || transition.type === "canopy") {
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

PS.render.surfaceTileBatcher.makeBatches = function (address, cellCache, alpha) {
  return PS.render.surfaceTileBatcher.appendBatches(PS.render.surfaceTileBatcher.beginBatches(), address, cellCache, alpha);
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
  flipH
) {
  var offset = page.length;

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
  page.length += PS.render.surfaceTileBatcher.strideFloats;
};

PS.render.surfaceTileBatcher.appendBatches = function (batches, address, cellCache, alpha) {
  var target = batches || PS.render.surfaceTileBatcher.beginBatches();
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
    var atlasKey = ecologyKey + "|" + (sample && sample.civilization ? sample.civilization.key : "civ0");
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

    if (target.materialCounts) {
      target.materialCounts[cell.name] = (target.materialCounts[cell.name] || 0) + 1;
    }

    var shadeBucket = PS.ranmap && PS.ranmap.data && PS.ranmap.normalizedBits ? PS.ranmap.normalizedBits(tileX, tileY, 20, 2) * 0.24 : 0;
    var flipH = (PS.ranmap && PS.ranmap.data && PS.ranmap.flipH(tileX, tileY) ? 1 : 0) + shadeBucket;
    var page = PS.render.surfaceTileBatcher.getPageBuffer(target, cell.pageIndex);
    var screenX = screenOffsetX + cellData.screenX * (samplePixelSize / CONFIG.TILE_SIZE);
    var screenY = screenOffsetY + cellData.screenY * (samplePixelSize / CONFIG.TILE_SIZE);
    var featherAlpha = PS.render.surfaceReadyFeather && typeof PS.render.surfaceReadyFeather.getAlpha === "function" ? PS.render.surfaceReadyFeather.getAlpha(address, screenX, screenY, samplePixelSize) : 1;

    PS.render.surfaceTileBatcher.appendSamplePointLights(target, sample, biome, screenX, screenY, samplePixelSize, tileX, tileY);
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
      flipH
    );
    target.count++;
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
