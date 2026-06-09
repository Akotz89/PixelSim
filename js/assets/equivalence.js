"use strict";
PS.assets = PS.assets || {};
PS.assets.equivalence = PS.assets.equivalence || {};

PS.assets.equivalence.sheetByFamily = {
  terrain: "equivalence_terrain_materials_v0",
  transitions: "equivalence_terrain_transitions_v0",
  vegetation: "equivalence_vegetation_scatter_v0",
  creatures: "equivalence_creature_npc_refined_v1",
  settlement: "equivalence_settlement_structures_v0",
  resources: "equivalence_resource_stockpiles_v0",
  world: "equivalence_world_weather_v0",
  overlays: "equivalence_work_status_overlays_v0",
  ui: "equivalence_ui_status_icons_v0",
  effects: "equivalence_material_effect_overlays_v0"
};

PS.assets.equivalence.defaultCellByUse = {
  terrainGround: ["terrain", "grass-lush.0"],
  terrainWater: ["terrain", "water-shallow.0"],
  terrainTransition: ["transitions", "grass-water.edge.n"],
  vegetation: ["vegetation", "oak.0"],
  creature: ["creatures", "rabbit.n"],
  citizen: ["creatures", "rabbit.s"],
  settlement: ["settlement", "housing-room"],
  room: ["settlement", "workshop-room"],
  stockpile: ["resources", "grain"],
  worldWeather: ["world", "weather-rain"],
  workStatus: ["overlays", "work-hammer"],
  worldUi: ["ui", "stat-population"],
  effect: ["effects", "fire-effect"]
};

PS.assets.equivalence.stats = {
  selected: 0,
  rendered: 0,
  missing: 0,
  byUse: {},
  bySheet: {},
  byCell: {},
  missingKeys: {}
};

PS.assets.equivalence.resetFrameStats = function () {
  var stats = PS.assets.equivalence.stats;
  stats.selected = 0;
  stats.rendered = 0;
  stats.missing = 0;
  stats.byUse = {};
  stats.bySheet = {};
  stats.byCell = {};
  stats.missingKeys = {};
};

PS.assets.equivalence.getStats = function () {
  var stats = PS.assets.equivalence.stats;

  return {
    selected: stats.selected,
    rendered: stats.rendered,
    missing: stats.missing,
    byUse: Object.assign({}, stats.byUse),
    bySheet: Object.assign({}, stats.bySheet),
    byCell: Object.assign({}, stats.byCell),
    missingKeys: Object.assign({}, stats.missingKeys)
  };
};

PS.assets.equivalence.getLoadedSheet = function (family) {
  var sheetId = PS.assets.equivalence.sheetByFamily[String(family || "")];
  var loaded = PS.assets.loadedSheets || {};

  return sheetId && loaded[sheetId] ? {
    id: sheetId,
    entry: loaded[sheetId],
    sheet: loaded[sheetId].sheet || null
  } : null;
};

PS.assets.equivalence.recordMissing = function (key) {
  var stats = PS.assets.equivalence.stats;
  var missingKey = String(key || "unknown");

  stats.missing++;
  stats.missingKeys[missingKey] = (stats.missingKeys[missingKey] || 0) + 1;
};

PS.assets.equivalence.recordSelection = function (use, loadedSheet, cell, renderableCell) {
  var stats = PS.assets.equivalence.stats;
  var useKey = String(use || "unknown");
  var sheetKey = String(loadedSheet && loadedSheet.id ? loadedSheet.id : "unknown");
  var cellKey = String(cell && cell.name ? cell.name : "unknown");

  stats.selected++;
  if (renderableCell) {
    stats.rendered++;
  }
  stats.byUse[useKey] = (stats.byUse[useKey] || 0) + 1;
  stats.bySheet[sheetKey] = (stats.bySheet[sheetKey] || 0) + 1;
  stats.byCell[cellKey] = (stats.byCell[cellKey] || 0) + 1;
};

PS.assets.equivalence.getImageDimension = function (image, key) {
  if (!image) {
    return 0;
  }

  return Math.max(0, Math.round(Number(image[key]) || Number(image["natural" + key.charAt(0).toUpperCase() + key.slice(1)]) || 0));
};

PS.assets.equivalence.decodeBase64 = function (data) {
  var raw = String(data || "");
  var length;
  var output;
  var index;

  if (!raw) {
    return null;
  }

  if (typeof atob === "function") {
    raw = atob(raw);
    length = raw.length;
    output = new Uint8Array(length);

    for (index = 0; index < length; index += 1) {
      output[index] = raw.charCodeAt(index) & 255;
    }

    return output;
  }

  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(raw, "base64"));
  }

  return null;
};

PS.assets.equivalence.getPixelDataBuffer = function (entry) {
  var pixelData = entry ? entry.pixelData : null;
  var decoded;

  if (!pixelData || pixelData.type !== "rgba-base64") {
    return null;
  }

  if (pixelData.buffer && pixelData.buffer.length === pixelData.byteLength) {
    return pixelData.buffer;
  }

  decoded = PS.assets.equivalence.decodeBase64(pixelData.data);

  if (!decoded || decoded.length !== Number(pixelData.byteLength)) {
    PS.assets.equivalence.recordMissing("pixel-data:" + (entry.id || "unknown"));
    return null;
  }

  pixelData.buffer = decoded;
  return decoded;
};

PS.assets.equivalence.ensureAtlasPage = function (loadedSheet) {
  var entry = loadedSheet && loadedSheet.entry ? loadedSheet.entry : null;
  var pixelBuffer = PS.assets.equivalence.getPixelDataBuffer(entry);
  var pixelData = entry ? entry.pixelData : null;
  var image = entry ? entry.image : null;
  var width = pixelData ? Math.max(0, Math.round(Number(pixelData.width) || 0)) : PS.assets.equivalence.getImageDimension(image, "width");
  var height = pixelData ? Math.max(0, Math.round(Number(pixelData.height) || 0)) : PS.assets.equivalence.getImageDimension(image, "height");
  var pageIndex;

  if (!entry || !PS.atlas || !Array.isArray(PS.atlas.pages) || width <= 0 || height <= 0 || (pixelData && !pixelBuffer) || (!pixelBuffer && !image)) {
    return null;
  }

  pageIndex = Number(entry.equivalenceAtlasPageIndex);

  if (
    Number.isFinite(pageIndex) &&
    PS.atlas.pages[pageIndex] &&
    PS.atlas.pages[pageIndex].equivalenceSheetId === loadedSheet.id
  ) {
    return PS.atlas.pages[pageIndex];
  }

  pageIndex = PS.atlas.pages.length;
  PS.atlas.pages.push({
    pageIndex: pageIndex,
    width: width,
    height: height,
    data: pixelBuffer || null,
    image: image,
    version: 1,
    externalImage: !pixelBuffer,
    equivalencePixelData: Boolean(pixelBuffer),
    equivalenceSheetId: loadedSheet.id
  });
  entry.equivalenceAtlasPageIndex = pageIndex;

  return PS.atlas.pages[pageIndex];
};

PS.assets.equivalence.makeRenderableCell = function (loadedSheet, cell) {
  var page = PS.assets.equivalence.ensureAtlasPage(loadedSheet);
  var width;
  var height;

  if (!page || !cell) {
    return null;
  }

  width = Math.max(1, Number(page.width) || 1);
  height = Math.max(1, Number(page.height) || 1);

  return {
    name: "equivalence." + loadedSheet.id + "." + cell.name,
    sourceCellName: cell.name,
    pageIndex: page.pageIndex,
    x: cell.x,
    y: cell.y,
    w: cell.w,
    h: cell.h,
    u0: cell.x / width,
    v0: cell.y / height,
    u1: (cell.x + cell.w) / width,
    v1: (cell.y + cell.h) / height,
    equivalenceSheetId: loadedSheet.id
  };
};

PS.assets.equivalence.select = function (use, fallbackCellId) {
  var key = String(use || "");
  var mapping = PS.assets.equivalence.defaultCellByUse[key];

  if (!mapping) {
    PS.assets.equivalence.recordMissing("use:" + key);
    return null;
  }

  return PS.assets.equivalence.selectCell(mapping[0], mapping[1], key, fallbackCellId);
};

PS.assets.equivalence.selectCell = function (family, cellName, use, fallbackCellId) {
  var key = String(use || family || "");
  var familyKey = String(family || "");
  var cellKey = String(cellName || "");
  var loadedSheet;
  var cell;
  var renderableCell;

  if (!familyKey || !cellKey) {
    PS.assets.equivalence.recordMissing("cell:" + familyKey + ":" + cellKey);
    return null;
  }

  loadedSheet = PS.assets.equivalence.getLoadedSheet(familyKey);

  if (!loadedSheet || !loadedSheet.sheet || typeof loadedSheet.sheet.getCell !== "function") {
    PS.assets.equivalence.recordMissing("sheet:" + familyKey);
    return null;
  }

  cell = loadedSheet.sheet.getCell(cellKey);

  if (!cell) {
    PS.assets.equivalence.recordMissing("cell:" + cellKey);
    return null;
  }

  renderableCell = PS.assets.equivalence.makeRenderableCell(loadedSheet, cell);
  PS.assets.equivalence.recordSelection(key, loadedSheet, cell, renderableCell);

  return {
    use: key,
    family: familyKey,
    sheetId: loadedSheet.id,
    cellId: cellKey,
    cell: cell,
    renderCell: renderableCell,
    fallbackCellId: fallbackCellId || ""
  };
};
