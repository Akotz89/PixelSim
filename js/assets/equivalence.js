import { PS } from "../core/namespace.js";
import { world } from "../systems/state.js";

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

PS.assets.getImageDimension = PS.assets.getImageDimension || function (image, key) {
  if (!image) {
    return 0;
  }

  return Math.max(0, Math.round(Number(image[key]) || Number(image["natural" + key.charAt(0).toUpperCase() + key.slice(1)]) || 0));
};

PS.assets.equivalence.getLoadedSheetFromMap = function (sheetMap, key) {
  var sheetId = sheetMap[String(key || "")];
  var loaded = PS.assets.loadedSheets || {};

  return sheetId && loaded[sheetId] ? {
    id: sheetId,
    entry: loaded[sheetId],
    sheet: loaded[sheetId].sheet || null
  } : null;
};

PS.assets.equivalence.getLoadedSheet = function (family) {
  return PS.assets.equivalence.getLoadedSheetFromMap(PS.assets.equivalence.sheetByFamily, family);
};

PS.assets.equivalence.getTransitionLoadedSheetForCell = function (cellName) {
  var loaded = PS.assets.loadedSheets || {};
  var preferred = PS.assets.equivalence.getLoadedSheet("transitions");
  var key = String(cellName || "");
  var ids;
  var i;
  var entry;

  if (preferred && preferred.sheet && typeof preferred.sheet.getCell === "function" && preferred.sheet.getCell(key)) {
    return preferred;
  }

  ids = Object.keys(loaded).sort();
  for (i = 0; i < ids.length; i += 1) {
    if (ids[i] === PS.assets.equivalence.sheetByFamily.transitions || ids[i].indexOf("transition") < 0) {
      continue;
    }

    entry = loaded[ids[i]];
    if (entry && entry.sheet && typeof entry.sheet.getCell === "function" && entry.sheet.getCell(key)) {
      return {
        id: ids[i],
        entry: entry,
        sheet: entry.sheet
      };
    }
  }

  return preferred;
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

PS.assets.equivalence.getImageDimension = PS.assets.getImageDimension;

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
  var renderable;

  if (!loadedSheet || !cell) {
    return null;
  }

  renderable = PS.assets.equivalence.makeRenderableCellBase(
    loadedSheet,
    cell,
    "equivalence." + loadedSheet.id + "." + cell.name
  );

  if (!renderable) {
    return null;
  }

  PS.assets.equivalence.assignNormalFields(renderable, cell);
  PS.assets.equivalence.assignMaterialFields(renderable, loadedSheet, cell);
  renderable.equivalenceSheetId = loadedSheet.id;
  return renderable;
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

  loadedSheet = familyKey === "transitions"
    ? PS.assets.equivalence.getTransitionLoadedSheetForCell(cellKey)
    : PS.assets.equivalence.getLoadedSheet(familyKey);

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

PS.assets.terrainMaterials = PS.assets.terrainMaterials || {};

PS.assets.terrainMaterials.sheetByMaterial = {
  grass: "terrain_grass",
  stone: "terrain_stone",
  dirt: "terrain_dirt",
  sand: "terrain_sand",
  water: "terrain_water",
  ice: "terrain_ice",
  rock: "terrain_rock",
  snow: "terrain_snow",
  forest: "terrain_forest",
  desert: "terrain_desert",
  ocean: "terrain_ocean",
  mountain: "terrain_mountain",
  tundra: "terrain_tundra",
  wetland: "terrain_wetland"
};

PS.assets.terrainMaterials.getLoadedSheet = function (material) {
  return PS.assets.equivalence.getLoadedSheetFromMap(PS.assets.terrainMaterials.sheetByMaterial, material);
};

PS.assets.equivalence.makeRenderableCellBase = function (loadedSheet, cell, name) {
  var page = PS.assets.equivalence.ensureAtlasPage(loadedSheet);
  var width;
  var height;

  if (!page || !cell) {
    return null;
  }

  width = Math.max(1, Number(page.width) || 1);
  height = Math.max(1, Number(page.height) || 1);

  return {
    name: name,
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
    splitAtlas: Boolean(cell.splitAtlas || loadedSheet.entry && loadedSheet.entry.splitAtlas)
  };
};

PS.assets.equivalence.assignNormalFields = function (target, cell) {
  target.normalOffsetX = Number(cell.normalOffsetX) || 0;
  target.normalOffsetY = Number(cell.normalOffsetY) || 0;
  target.normalX = Number.isFinite(Number(cell.normalX)) ? Number(cell.normalX) : undefined;
  target.normalY = Number.isFinite(Number(cell.normalY)) ? Number(cell.normalY) : undefined;
  target.normalW = Number.isFinite(Number(cell.normalW)) ? Number(cell.normalW) : undefined;
  target.normalH = Number.isFinite(Number(cell.normalH)) ? Number(cell.normalH) : undefined;
};

PS.assets.equivalence.assignMaterialFields = function (target, loadedSheet, cell) {
  target.materialChannels = cell.materialChannels || loadedSheet.entry && loadedSheet.entry.materialChannels || null;
  target.materialOffsetX = Number(cell.materialOffsetX) || 0;
  target.materialOffsetY = Number(cell.materialOffsetY) || 0;
  target.materialX = Number.isFinite(Number(cell.materialX)) ? Number(cell.materialX) : undefined;
  target.materialY = Number.isFinite(Number(cell.materialY)) ? Number(cell.materialY) : undefined;
  target.materialW = Number.isFinite(Number(cell.materialW)) ? Number(cell.materialW) : undefined;
  target.materialH = Number.isFinite(Number(cell.materialH)) ? Number(cell.materialH) : undefined;
};

PS.assets.terrainMaterials.makeRenderableCell = function (loadedSheet, cell) {
  var renderable;

  if (!loadedSheet || !cell) {
    return null;
  }

  renderable = PS.assets.equivalence.makeRenderableCellBase(loadedSheet, cell, cell.name);

  if (!renderable) {
    return null;
  }

  renderable.normalOffsetX = Number(cell.normalOffsetX) || 0;
  renderable.terrainMaterialSheetId = loadedSheet.id;
  return renderable;
};

PS.assets.terrainMaterials.selectCell = function (material, variant, use, fallbackCellId) {
  var materialKey = String(material || "");
  var loadedSheet = PS.assets.terrainMaterials.getLoadedSheet(materialKey);
  var variantIndex = Math.max(0, Math.round(Number(variant) || 0)) % 8;
  var cellName = "terrain." + materialKey + "." + variantIndex;
  var cell;
  var renderableCell;

  if (!loadedSheet || !loadedSheet.sheet || typeof loadedSheet.sheet.getCell !== "function") {
    PS.assets.equivalence.recordMissing("terrain-material-sheet:" + materialKey);
    return null;
  }

  cell = loadedSheet.sheet.getCell(cellName);
  if (!cell) {
    PS.assets.equivalence.recordMissing("terrain-material-cell:" + cellName);
    return null;
  }

  renderableCell = PS.assets.terrainMaterials.makeRenderableCell(loadedSheet, cell);
  PS.assets.equivalence.recordSelection(use || "terrainMaterial", loadedSheet, cell, renderableCell);

  return {
    family: "terrainMaterial",
    cell: cell,
    renderCell: renderableCell,
    fallbackCellId: fallbackCellId || ""
  };
};
