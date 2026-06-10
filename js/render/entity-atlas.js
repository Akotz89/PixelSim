"use strict";
PS.render = PS.render || {};

PS.atlas = PS.atlas || {
  cellSize: 16,
  pageWidth: 256,
  pageHeight: 256,
  pages: [],
  cells: {},
  cursorX: 0,
  cursorY: 0,
  rowHeight: 0,
  initialized: false,
  stats: {
    generatedCells: 0,
    traitCells: 0,
    terrainCells: 0,
    foodCells: 0,
    settlementCells: 0,
    routeCells: 0,
    influenceCells: 0,
    worldUiCells: 0,
    vegetationCells: 0,
    eventMarkerCells: 0,
    intentCells: 0,
    pageBytes: 0,
    lastGenerationMs: 0
  }
};

PS.atlas.reset = function () {
  PS.atlas.pages = [];
  PS.atlas.cells = {};
  PS.atlas.cursorX = 0;
  PS.atlas.cursorY = 0;
  PS.atlas.rowHeight = 0;
  PS.atlas.initialized = false;
  PS.atlas.stats.generatedCells = 0;
  PS.atlas.stats.traitCells = 0;
  PS.atlas.stats.terrainCells = 0;
  PS.atlas.stats.foodCells = 0;
  PS.atlas.stats.settlementCells = 0;
  PS.atlas.stats.routeCells = 0;
  PS.atlas.stats.influenceCells = 0;
  PS.atlas.stats.worldUiCells = 0;
  PS.atlas.stats.vegetationCells = 0;
  PS.atlas.stats.eventMarkerCells = 0;
  PS.atlas.stats.intentCells = 0;
  PS.atlas.stats.pageBytes = 0;
  PS.atlas.stats.lastGenerationMs = 0;
};

PS.atlas.ensurePage = function () {
  if (PS.atlas.pages.length <= 0) {
    return PS.atlas.createPage();
  }

  return PS.atlas.pages[PS.atlas.pages.length - 1];
};

PS.atlas.createPage = function () {
  var page = {
    pageIndex: PS.atlas.pages.length,
    width: PS.atlas.pageWidth,
    height: PS.atlas.pageHeight,
    data: new Uint8Array(PS.atlas.pageWidth * PS.atlas.pageHeight * 4),
    version: 1
  };

  PS.atlas.pages.push(page);
  PS.atlas.cursorX = 0;
  PS.atlas.cursorY = 0;
  PS.atlas.rowHeight = 0;
  PS.atlas.stats.pageBytes += page.data.byteLength;
  return page;
};

PS.atlas.allocateCell = function (name, width, height) {
  var page = PS.atlas.ensurePage();
  var cellWidth = Math.max(1, Math.round(Number(width) || PS.atlas.cellSize));
  var cellHeight = Math.max(1, Math.round(Number(height) || PS.atlas.cellSize));
  var x;
  var y;

  if (PS.atlas.cells[name]) {
    return PS.atlas.cells[name];
  }

  if (cellWidth > page.width || cellHeight > page.height) {
    throw new Error("Entity atlas cell is larger than an atlas page");
  }

  if (PS.atlas.cursorX + cellWidth > page.width) {
    PS.atlas.cursorX = 0;
    PS.atlas.cursorY += PS.atlas.rowHeight;
    PS.atlas.rowHeight = 0;
  }

  if (PS.atlas.cursorY + cellHeight > page.height) {
    page = PS.atlas.createPage();
  }

  x = PS.atlas.cursorX;
  y = PS.atlas.cursorY;
  PS.atlas.cursorX += cellWidth;
  PS.atlas.rowHeight = Math.max(PS.atlas.rowHeight, cellHeight);

  PS.atlas.cells[name] = {
    name: name,
    pageIndex: 0,
    x: x,
    y: y,
    w: cellWidth,
    h: cellHeight,
    u0: x / page.width,
    v0: y / page.height,
    u1: (x + cellWidth) / page.width,
    v1: (y + cellHeight) / page.height
  };
  PS.atlas.stats.generatedCells++;
  return PS.atlas.cells[name];
};

PS.atlas.hexToRgb = function (hexColor) {
  var color = String(hexColor || "#ffffff").replace("#", "");

  if (color.length !== 6) {
    return [255, 255, 255];
  }

  return [
    parseInt(color.slice(0, 2), 16),
    parseInt(color.slice(2, 4), 16),
    parseInt(color.slice(4, 6), 16)
  ];
};

PS.atlas.getPaletteRgb = function (paletteId, key, fallbackRgb) {
  var fallback = fallbackRgb || [255, 255, 255];
  var fallbackHex = PS.render && PS.render.terrain && typeof PS.render.terrain.getHexFromRgb === "function"
    ? PS.render.terrain.getHexFromRgb(fallback[0], fallback[1], fallback[2])
    : "#ffffff";
  var color = PS.assets && typeof PS.assets.getPaletteColor === "function"
    ? PS.assets.getPaletteColor(paletteId, key, fallbackHex)
    : fallbackHex;

  return PS.atlas.hexToRgb(color);
};

PS.atlas.writePixel = function (cell, localX, localY, rgba) {
  var page = PS.atlas.pages[cell.pageIndex];
  var x = cell.x + localX;
  var y = cell.y + localY;
  var index;

  if (!page || x < cell.x || y < cell.y || x >= cell.x + cell.w || y >= cell.y + cell.h) {
    return;
  }

  index = (y * page.width + x) * 4;
  page.data[index] = rgba[0];
  page.data[index + 1] = rgba[1];
  page.data[index + 2] = rgba[2];
  page.data[index + 3] = rgba[3];
};

PS.atlas.writeDot = function (cell, x, y, radius, rgba) {
  var r = Math.max(0, Math.round(Number(radius) || 0));
  var dx;
  var dy;

  for (dy = -r; dy <= r; dy++) {
    for (dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r + 0.5) {
        PS.atlas.writePixel(cell, x + dx, y + dy, rgba);
      }
    }
  }
};

PS.atlas.fillNormalHalf = function (cell) {
  var x;
  var y;

  for (y = 0; y < cell.h; y++) {
    for (x = Math.floor(cell.w / 2); x < cell.w; x++) {
      PS.atlas.writePixel(cell, x, y, [128, 128, 255, 190]);
    }
  }
};

PS.atlas.makeTraitHash = function (organism, frameVariant) {
  var traits = organism && organism.traits ? organism.traits : {};
  var lineageId = Math.max(1, Math.round(Number(organism && organism.lineageId) || 1));
  var bodySize = clamp(Math.round((Number(traits.bodySize) || 1) * 2), 1, 6);
  var bodyShape = clamp(Math.round(Number(traits.bodyShape) || 0), 0, 7);
  var limbCount = clamp(Math.round(Number(traits.limbCount) || 0), 0, 12);
  var appendageType = clamp(Math.round(Number(traits.appendageType) || 0), 0, 7);
  var camouflage = clamp(Math.round((Number(traits.camouflage) || 0) * 4), 0, 4);
  var variant = clamp(Math.round(Number(frameVariant) || 0), 0, 3);

  return [
    "entity.organism.trait",
    lineageId % 16,
    bodySize,
    bodyShape,
    limbCount,
    appendageType,
    camouflage,
    variant
  ].join(".");
};

PS.atlas.getLineageRgb = function (lineageId, camouflage) {
  var colors = CONFIG && CONFIG.LINEAGE_COLORS ? CONFIG.LINEAGE_COLORS : ["#72d7ff"];
  var base = PS.atlas.hexToRgb(colors[(Math.max(1, lineageId) - 1) % colors.length]);
  var camo = clamp(Number(camouflage) || 0, 0, 1);
  var earth = [72, 112, 74];
  var mix = camo * 0.45;

  return [
    Math.round(base[0] * (1 - mix) + earth[0] * mix),
    Math.round(base[1] * (1 - mix) + earth[1] * mix),
    Math.round(base[2] * (1 - mix) + earth[2] * mix)
  ];
};

PS.atlas.drawOrganismSprite = function (cell, organism, frameVariant) {
  var traits = organism && organism.traits ? organism.traits : {};
  var lineageId = Math.max(1, Math.round(Number(organism && organism.lineageId) || 1));
  var bodySize = clamp(Number(traits.bodySize) || 1, 0.5, 3);
  var bodyShape = clamp(Math.round(Number(traits.bodyShape) || 0), 0, 7);
  var limbCount = clamp(Math.round(Number(traits.limbCount) || 0), 0, 12);
  var appendageType = clamp(Math.round(Number(traits.appendageType) || 0), 0, 7);
  var camouflage = clamp(Number(traits.camouflage) || 0, 0, 1);
  var variant = clamp(Math.round(Number(frameVariant) || 0), 0, 3);
  var color = PS.atlas.getLineageRgb(lineageId, camouflage);
  var shade = [Math.max(0, color[0] - 35), Math.max(0, color[1] - 35), Math.max(0, color[2] - 35), 255];
  var highlight = [Math.min(255, color[0] + 42), Math.min(255, color[1] + 42), Math.min(255, color[2] + 42), 255];
  var body = [color[0], color[1], color[2], 255];
  var centerX = 7 + (variant % 2);
  var centerY = 7 + Math.floor(variant / 2);
  var radiusX = clamp(Math.round(3 + bodySize + (bodyShape === 1 ? 2 : 0)), 3, 7);
  var radiusY = clamp(Math.round(3 + bodySize + (bodyShape === 2 ? 2 : 0)), 3, 7);
  var maxLimbs = Math.min(12, limbCount);
  var i;
  var limbX;
  var limbY;
  var side;
  var offset;
  var appendageRadius = appendageType === 3 ? 2 : 1;

  PS.atlas.fillNormalHalf(cell);

  for (i = 0; i < maxLimbs; i++) {
    side = i % 2 === 0 ? -1 : 1;
    offset = Math.floor(i / 2) - Math.floor(maxLimbs / 4);
    limbX = centerX + side * (radiusX + 1);
    limbY = centerY + offset * 2;
    PS.atlas.writeDot(cell, limbX, limbY, appendageRadius, shade);
  }

  for (limbY = 0; limbY < 16; limbY++) {
    for (limbX = 0; limbX < 16; limbX++) {
      var dx = (limbX - centerX) / radiusX;
      var dy = (limbY - centerY) / radiusY;
      var inside = bodyShape === 3
        ? Math.abs(dx) + Math.abs(dy) <= 1.05
        : dx * dx + dy * dy <= 1.05;

      if (inside) {
        PS.atlas.writePixel(cell, limbX, limbY, body);
      }
    }
  }

  PS.atlas.writePixel(cell, centerX - 1, Math.max(1, centerY - radiusY + 1), highlight);
  PS.atlas.writePixel(cell, centerX + 1, Math.max(1, centerY - radiusY + 1), highlight);
  PS.atlas.writeDot(cell, centerX, centerY + radiusY - 1, 1, shade);
};

PS.atlas.getTraitOrganismCell = function (organism, frameVariant) {
  var name = PS.atlas.makeTraitHash(organism, frameVariant);
  var cell = PS.atlas.cells[name];

  if (!cell) {
    cell = PS.atlas.allocateCell(name, 32, 16);
    PS.atlas.drawOrganismSprite(cell, organism, frameVariant);
    PS.atlas.stats.traitCells++;
    PS.atlas.pages[cell.pageIndex].version++;
  }

  return cell;
};

PS.atlas.getFoodRichnessBucket = function (food) {
  var amount = Math.max(
    Number(food && food.amount) || 0,
    Number(food && food.energy) || 0,
    Number(food && food.biomass) || 0,
    Number(food && food.value) || 0,
    Number(food && food.nutrients) || 0
  );

  if (amount >= 120) { return 3; }
  if (amount >= 60) { return 2; }
  if (amount > 0) { return 1; }
  return 0;
};

PS.atlas.getFoodFamilyBucket = function (food) {
  var explicit = Number(food && food.resourceFamilyBucket);
  var family = [
    food && food.resourceFamily,
    food && food.resourceType,
    food && food.category,
    food && food.drawFamily,
    food && food.type,
    food && food.kind
  ].join(" ").toLowerCase();
  var x = Math.round(Number(food && food.x) || 0);
  var y = Math.round(Number(food && food.y) || 0);
  var richness = PS.atlas.getFoodRichnessBucket(food);
  var fallback;

  if (Number.isFinite(explicit)) {
    return clamp(Math.round(explicit), 0, 3);
  }

  if (
    family.indexOf("stone") >= 0 ||
    family.indexOf("ore") >= 0 ||
    family.indexOf("metal") >= 0 ||
    family.indexOf("mineral") >= 0 ||
    family.indexOf("gem") >= 0 ||
    family.indexOf("clay") >= 0 ||
    family.indexOf("coal") >= 0 ||
    family.indexOf("raw-material") >= 0
  ) {
    return 3;
  }

  if (
    family.indexOf("fruit") >= 0 ||
    family.indexOf("vegetable") >= 0 ||
    family.indexOf("mushroom") >= 0 ||
    family.indexOf("fungus") >= 0 ||
    family.indexOf("meat") >= 0 ||
    family.indexOf("fish") >= 0 ||
    family.indexOf("egg") >= 0
  ) {
    return 2;
  }

  if (
    family.indexOf("grain") >= 0 ||
    family.indexOf("bread") >= 0 ||
    family.indexOf("ration") >= 0 ||
    family.indexOf("sack") >= 0 ||
    family.indexOf("crate") >= 0 ||
    family.indexOf("food") >= 0
  ) {
    return 1;
  }

  if (food && (Number.isFinite(Number(food.x)) || Number.isFinite(Number(food.y)))) {
    fallback = PS.atlas.getTerrainSurfaceNoise(x, y, 61 + richness * 13);
    return clamp(Math.floor(fallback * 3), 0, 2);
  }

  return 0;
};

PS.atlas.drawFoodCell = function (cell, variant, richness, familyBucket) {
  var safeRichness = clamp(Math.round(Number(richness) || 0), 0, 3);
  var family = clamp(Math.round(Number(familyBucket) || 0), 0, 3);
  var palette = [
    [[58, 178, 74, 255], [70, 210, 88, 255], [118, 224, 92, 255], [174, 238, 98, 255]],
    [[130, 94, 52, 255], [164, 124, 68, 255], [202, 166, 88, 255], [232, 204, 118, 255]],
    [[138, 58, 96, 255], [190, 76, 92, 255], [224, 118, 92, 255], [244, 166, 104, 255]],
    [[86, 88, 96, 255], [112, 116, 124, 255], [152, 148, 128, 255], [212, 190, 132, 255]]
  ][family];
  var base = palette[safeRichness];
  var dark = [Math.max(0, base[0] - 36), Math.max(0, base[1] - 58), Math.max(0, base[2] - 36), 255];
  var light = [Math.min(255, base[0] + 52), Math.min(255, base[1] + 34), Math.min(255, base[2] + 58), 255];
  var podCount = 3 + safeRichness * 2;
  var i;
  var x;
  var y;

  PS.atlas.fillNormalHalf(cell);
  PS.atlas.writePixel(cell, 7, 7, base);
  PS.atlas.writePixel(cell, 8, 7, light);
  PS.atlas.writePixel(cell, 7, 8, dark);

  for (i = 0; i < podCount; i++) {
    x = 3 + ((variant * 5 + i * 4) % 11);
    y = 5 + ((variant * 3 + i * 5) % 7);
    PS.atlas.writePixel(cell, x, y + 2, dark);
    if (family === 1) {
      PS.atlas.writePixel(cell, x - 1, y, base);
      PS.atlas.writePixel(cell, x, y, base);
      PS.atlas.writePixel(cell, x + 1, y, base);
      PS.atlas.writePixel(cell, x, y - 1, light);
      PS.atlas.writePixel(cell, x - 1, y + 1, dark);
    } else if (family === 3) {
      PS.atlas.writePixel(cell, x - 1, y, dark);
      PS.atlas.writePixel(cell, x, y - 1, light);
      PS.atlas.writePixel(cell, x + 1, y, base);
      PS.atlas.writePixel(cell, x, y + 1, base);
    } else {
      PS.atlas.writeDot(cell, x, y, i % 3 === 0 && safeRichness > 1 ? 2 : 1, base);
      PS.atlas.writePixel(cell, x - 1, y - 1, light);
      if (family === 2) {
        PS.atlas.writePixel(cell, x + 1, y + 1, dark);
      }
    }
  }

  if (safeRichness >= 2) {
    PS.atlas.writePixel(cell, 4 + variant, 12, dark);
    PS.atlas.writePixel(cell, 9 + (variant % 3), 11, dark);
    PS.atlas.writePixel(cell, 12, 7 + (variant % 2), light);
  }

  if (family === 1) {
    PS.atlas.writePixel(cell, 5, 4, light);
    PS.atlas.writePixel(cell, 6, 4, light);
    PS.atlas.writePixel(cell, 5, 5, dark);
  } else if (family === 2) {
    PS.atlas.writeDot(cell, 11, 4, safeRichness >= 2 ? 2 : 1, light);
    PS.atlas.writePixel(cell, 11, 6, dark);
  } else if (family === 3) {
    PS.atlas.writePixel(cell, 6, 12, dark);
    PS.atlas.writePixel(cell, 7, 11, base);
    PS.atlas.writePixel(cell, 8, 10, light);
    PS.atlas.writePixel(cell, 9, 11, base);
  }
};

PS.atlas.getVegetationPalette = function (type) {
  var types = PS.vegetation && PS.vegetation.TYPES ? PS.vegetation.TYPES : {};

  if (type === types.ROCK) {
    return {
      base: [100, 106, 96, 255],
      dark: [54, 58, 56, 255],
      light: [156, 158, 142, 255]
    };
  }

  if (type === types.FLOWER) {
    return {
      base: [102, 176, 80, 255],
      dark: [40, 96, 46, 255],
      light: [234, 194, 92, 255]
    };
  }

  if (type === types.MUSHROOM) {
    return {
      base: [154, 94, 128, 255],
      dark: [82, 48, 72, 255],
      light: [222, 174, 164, 255]
    };
  }

  if (type === types.GRASS_TUFT) {
    return {
      base: [78, 138, 72, 255],
      dark: [34, 82, 42, 255],
      light: [134, 178, 82, 255]
    };
  }

  if (type === types.BUSH) {
    return {
      base: [54, 126, 58, 255],
      dark: [24, 74, 34, 255],
      light: [108, 174, 82, 255]
    };
  }

  return {
    base: [38, 116, 54, 255],
    dark: [20, 64, 32, 255],
    light: [96, 168, 76, 255],
    trunk: [94, 70, 44, 255]
  };
};

PS.atlas.drawVegetationCell = function (cell, type, variant, part) {
  var palette = PS.atlas.getVegetationPalette(type);
  var types = PS.vegetation && PS.vegetation.TYPES ? PS.vegetation.TYPES : {};
  var safeVariant = clamp(Math.round(Number(variant) || 0), 0, 15);
  var isTree = type === types.TREE_SMALL || type === types.TREE_MEDIUM || type === types.TREE_BIG;
  var isCanopy = part === "canopy";
  var centerX = 8 + (safeVariant % 3) - 1;
  var centerY = isCanopy ? 6 : 9;
  var radius = type === types.TREE_BIG ? 5 : (type === types.TREE_MEDIUM ? 4 : 3);
  var i;

  PS.atlas.fillNormalHalf(cell);

  if (isTree && !isCanopy) {
    PS.atlas.writePixel(cell, centerX, 7, palette.trunk);
    PS.atlas.writePixel(cell, centerX, 8, palette.trunk);
    PS.atlas.writePixel(cell, centerX - 1, 9, palette.dark);
    PS.atlas.writePixel(cell, centerX, 9, palette.trunk);
    PS.atlas.writePixel(cell, centerX + 1, 9, palette.dark);
    PS.atlas.writePixel(cell, centerX - 1, 10, palette.dark);
    PS.atlas.writePixel(cell, centerX, 10, palette.trunk);
    PS.atlas.writePixel(cell, centerX + 1, 10, palette.dark);
    return;
  }

  if (isTree) {
    PS.atlas.writeDot(cell, centerX, centerY, radius, palette.base);
    PS.atlas.writeDot(cell, centerX - 3, centerY + 2, Math.max(2, radius - 2), palette.dark);
    PS.atlas.writeDot(cell, centerX + 3, centerY + 1, Math.max(2, radius - 2), palette.base);
    PS.atlas.writeDot(cell, centerX - 1, centerY - 2, Math.max(1, radius - 3), palette.light);
    return;
  }

  if (type === types.ROCK) {
    PS.atlas.writeDot(cell, 8, 10, 4, palette.base);
    PS.atlas.writePixel(cell, 5, 9, palette.light);
    PS.atlas.writePixel(cell, 9, 8, palette.light);
    PS.atlas.writePixel(cell, 11, 11, palette.dark);
    PS.atlas.writePixel(cell, 7, 12, palette.dark);
    return;
  }

  if (type === types.GRASS_TUFT) {
    for (i = 0; i < 7; i += 1) {
      PS.atlas.writePixel(cell, 5 + i, 12 - (i % 3), i % 2 === 0 ? palette.light : palette.base);
      PS.atlas.writePixel(cell, 5 + i, 13, palette.dark);
    }
    return;
  }

  if (type === types.FLOWER || type === types.MUSHROOM) {
    for (i = 0; i < 4; i += 1) {
      var x = 5 + ((safeVariant + i * 3) % 7);
      var y = 7 + ((safeVariant * 2 + i * 2) % 5);
      PS.atlas.writePixel(cell, x, y + 3, palette.dark);
      PS.atlas.writeDot(cell, x, y, 1, i % 2 ? palette.light : palette.base);
    }
    return;
  }

  PS.atlas.writeDot(cell, 7, 9, 3, palette.base);
  PS.atlas.writeDot(cell, 10, 10, 3, palette.dark);
  PS.atlas.writeDot(cell, 8, 7, 2, palette.light);
};

PS.atlas.getSettlementArchetype = function (settlement) {
  if (settlement && settlement.isColony) { return "colony"; }
  if (settlement && settlement.isOutpost) { return "outpost"; }
  return "camp";
};

PS.atlas.getSettlementLevelBucket = function (settlement) {
  return clamp(Math.floor((Math.max(1, Math.round(Number(settlement && settlement.level) || 1)) - 1) / 2), 0, 5);
};

PS.atlas.drawSettlementCell = function (cell, archetype, levelBucket, lineageId) {
  var colors = CONFIG && CONFIG.LINEAGE_COLORS ? CONFIG.LINEAGE_COLORS : ["#72d7ff"];
  var baseRgb = PS.atlas.hexToRgb(colors[(Math.max(1, lineageId) - 1) % colors.length]);
  var wall = archetype === "outpost" ? [126, 104, 78, 255] : [144, 128, 96, 255];
  var roof = archetype === "colony" ? [190, 92, 76, 255] : [164, 118, 72, 255];
  var shadow = [54, 44, 42, 255];
  var banner = [baseRgb[0], baseRgb[1], baseRgb[2], 255];
  var light = [218, 202, 144, 255];
  var x;
  var y;
  var buildingCount = archetype === "outpost" ? 2 : 3 + Math.min(3, levelBucket);

  PS.atlas.fillNormalHalf(cell);

  for (x = 2; x <= 13; x++) {
    PS.atlas.writePixel(cell, x, 12, shadow);
    if (archetype !== "camp" || x % 2 === 0) {
      PS.atlas.writePixel(cell, x, 11, wall);
    }
  }

  for (y = 0; y < buildingCount; y++) {
    var bx = 3 + ((y * 4 + levelBucket) % 10);
    var by = 8 - Math.min(3, Math.floor(y / 2));
    PS.atlas.writePixel(cell, bx, by + 2, shadow);
    PS.atlas.writePixel(cell, bx + 1, by + 2, shadow);
    PS.atlas.writePixel(cell, bx, by + 1, wall);
    PS.atlas.writePixel(cell, bx + 1, by + 1, wall);
    PS.atlas.writePixel(cell, bx - 1, by, roof);
    PS.atlas.writePixel(cell, bx, by - 1, roof);
    PS.atlas.writePixel(cell, bx + 1, by, roof);
    PS.atlas.writePixel(cell, bx + 1, by + 1, light);
  }

  if (archetype === "outpost") {
    PS.atlas.writePixel(cell, 7, 4, wall);
    PS.atlas.writePixel(cell, 7, 5, wall);
    PS.atlas.writePixel(cell, 8, 4, banner);
  } else {
    PS.atlas.writePixel(cell, 8, 3, wall);
    PS.atlas.writePixel(cell, 8, 4, wall);
    PS.atlas.writePixel(cell, 9, 3, banner);
    PS.atlas.writePixel(cell, 10, 3, banner);
  }

  if (levelBucket >= 2) {
    PS.atlas.writePixel(cell, 5, 5, banner);
    PS.atlas.writePixel(cell, 11, 6, banner);
  }
};

PS.atlas.drawRouteCell = function (cell, shape, activityBucket, lineageId) {
  var colors = CONFIG && CONFIG.LINEAGE_COLORS ? CONFIG.LINEAGE_COLORS : ["#72d7ff"];
  var baseRgb = PS.atlas.hexToRgb(colors[(Math.max(1, lineageId) - 1) % colors.length]);
  var base = [baseRgb[0], baseRgb[1], baseRgb[2], 255];
  var shadow = [18, 24, 28, 210];
  var highlight = [
    Math.min(255, baseRgb[0] + 72),
    Math.min(255, baseRgb[1] + 72),
    Math.min(255, baseRgb[2] + 72),
    255
  ];
  var alpha = activityBucket <= 0 ? 120 : (activityBucket === 1 ? 185 : 235);
  var x;
  var y;

  PS.atlas.fillNormalHalf(cell);

  if (shape === "vertical") {
    for (y = 1; y < 15; y++) {
      PS.atlas.writePixel(cell, 7, y, shadow);
      PS.atlas.writePixel(cell, 8, y, [base[0], base[1], base[2], alpha]);
      if (activityBucket >= 1 && y % 4 === 0) {
        PS.atlas.writePixel(cell, 9, y, highlight);
      }
    }
    return;
  }

  if (shape === "diag") {
    for (x = 2; x < 14; x++) {
      y = 13 - x;
      PS.atlas.writePixel(cell, x, y + 1, shadow);
      PS.atlas.writePixel(cell, x, y, [base[0], base[1], base[2], alpha]);
      if (activityBucket >= 1 && x % 4 === 0) {
        PS.atlas.writePixel(cell, x + 1, y, highlight);
      }
    }
    return;
  }

  for (x = 1; x < 15; x++) {
    PS.atlas.writePixel(cell, x, 8, shadow);
    PS.atlas.writePixel(cell, x, 7, [base[0], base[1], base[2], alpha]);
    if (activityBucket >= 1 && x % 4 === 0) {
      PS.atlas.writePixel(cell, x, 6, highlight);
    }
  }
};

PS.atlas.drawInfluenceCell = function (cell, strengthBucket, lineageId) {
  var colors = CONFIG && CONFIG.LINEAGE_COLORS ? CONFIG.LINEAGE_COLORS : ["#72d7ff"];
  var baseRgb = PS.atlas.hexToRgb(colors[(Math.max(1, lineageId) - 1) % colors.length]);
  var base = [baseRgb[0], baseRgb[1], baseRgb[2], strengthBucket <= 0 ? 125 : (strengthBucket === 1 ? 178 : 225)];
  var glow = [
    Math.min(255, baseRgb[0] + 62),
    Math.min(255, baseRgb[1] + 62),
    Math.min(255, baseRgb[2] + 62),
    210
  ];
  var shadow = [8, 14, 22, 145];
  var x;

  PS.atlas.fillNormalHalf(cell);

  for (x = 3; x <= 12; x++) {
    if ((x + strengthBucket) % 3 !== 0) {
      PS.atlas.writePixel(cell, x, 8, shadow);
      PS.atlas.writePixel(cell, x, 7, base);
    }
  }

  if (strengthBucket >= 1) {
    PS.atlas.writePixel(cell, 5, 6, glow);
    PS.atlas.writePixel(cell, 10, 6, glow);
  }

  if (strengthBucket >= 2) {
    PS.atlas.writePixel(cell, 7, 5, glow);
    PS.atlas.writePixel(cell, 8, 5, glow);
  }
};

PS.atlas.drawSettlementWorldUiCell = function (cell, metricType, bucket, lineageId) {
  var colors = CONFIG && CONFIG.LINEAGE_COLORS ? CONFIG.LINEAGE_COLORS : ["#72d7ff"];
  var baseRgb = PS.atlas.hexToRgb(colors[(Math.max(1, lineageId) - 1) % colors.length]);
  var safeBucket = clamp(Math.round(Number(bucket) || 0), 0, 3);
  var metric = String(metricType || "population");
  var bg = [16, 24, 30, 220];
  var border = [Math.min(255, baseRgb[0] + 42), Math.min(255, baseRgb[1] + 42), Math.min(255, baseRgb[2] + 42), 245];
  var fill = metric === "food"
    ? [118, 224, 92, 245]
    : (metric === "development" ? [238, 188, 86, 245] : [132, 206, 244, 245]);
  var shadow = [4, 8, 14, 175];
  var x;
  var y;
  var segmentCount = 1 + safeBucket;

  PS.atlas.fillNormalHalf(cell);

  for (x = 3; x <= 13; x++) {
    PS.atlas.writePixel(cell, x, 12, shadow);
  }

  for (x = 2; x <= 13; x++) {
    PS.atlas.writePixel(cell, x, 4, border);
    PS.atlas.writePixel(cell, x, 11, border);
  }

  for (y = 5; y <= 10; y++) {
    PS.atlas.writePixel(cell, 2, y, border);
    PS.atlas.writePixel(cell, 13, y, border);
    for (x = 3; x <= 12; x++) {
      PS.atlas.writePixel(cell, x, y, bg);
    }
  }

  if (metric === "food") {
    PS.atlas.writeDot(cell, 5, 8, 1, fill);
    PS.atlas.writePixel(cell, 6, 7, [Math.min(255, fill[0] + 34), Math.min(255, fill[1] + 24), Math.min(255, fill[2] + 28), 255]);
  } else if (metric === "development") {
    PS.atlas.writePixel(cell, 5, 9, fill);
    PS.atlas.writePixel(cell, 6, 8, fill);
    PS.atlas.writePixel(cell, 7, 7, fill);
    PS.atlas.writePixel(cell, 8, 6, fill);
  } else {
    PS.atlas.writePixel(cell, 5, 7, fill);
    PS.atlas.writePixel(cell, 4, 8, fill);
    PS.atlas.writePixel(cell, 5, 8, fill);
    PS.atlas.writePixel(cell, 6, 8, fill);
    PS.atlas.writePixel(cell, 5, 9, fill);
  }

  for (x = 0; x < segmentCount; x++) {
    PS.atlas.writePixel(cell, 8 + x, 9, fill);
    PS.atlas.writePixel(cell, 8 + x, 10, fill);
  }
};

PS.atlas.terrainPalettes = {
  ocean: { base: [28, 82, 123], accent: [70, 145, 178], dark: [8, 32, 68], pattern: "wave" },
  coastal: { base: [84, 139, 144], accent: [194, 174, 114], dark: [27, 78, 99], pattern: "shore" },
  temperate: { base: [70, 136, 58], accent: [124, 176, 72], dark: [42, 92, 43], pattern: "grass" },
  grassland: { base: [126, 173, 76], accent: [176, 196, 92], dark: [86, 126, 52], pattern: "grass" },
  tropical: { base: [42, 132, 72], accent: [84, 190, 94], dark: [20, 86, 57], pattern: "canopy" },
  forest: { base: [34, 91, 43], accent: [74, 132, 59], dark: [18, 55, 34], pattern: "canopy" },
  wetland: { base: [45, 92, 70], accent: [90, 150, 91], dark: [25, 62, 75], pattern: "reed" },
  tundra: { base: [168, 183, 179], accent: [226, 232, 224], dark: [102, 122, 128], pattern: "frost" },
  ice: { base: [104, 164, 188], accent: [216, 242, 248], dark: [67, 118, 153], pattern: "crack" },
  desert: { base: [184, 150, 98], accent: [222, 200, 140], dark: [128, 93, 64], pattern: "dune" },
  mountain: { base: [98, 100, 128], accent: [158, 162, 174], dark: [59, 62, 80], pattern: "ridge" },
  highland: { base: [90, 106, 116], accent: [152, 158, 142], dark: [57, 72, 76], pattern: "ridge" },
  volcanic: { base: [45, 43, 64], accent: [238, 86, 43], dark: [20, 20, 34], pattern: "lava" },
  barren: { base: [130, 111, 78], accent: [170, 143, 94], dark: [86, 75, 57], pattern: "grit" },
  unknown: { base: [82, 112, 88], accent: [130, 152, 105], dark: [48, 70, 58], pattern: "grit" }
};

PS.atlas.getTerrainPalette = function (biome) {
  var key = String(biome || "unknown").toLowerCase();
  var template = PS.atlas.terrainPalettes[key] || PS.atlas.terrainPalettes.unknown;
  var paletteKey = key === "unknown" ? "grassland" : key;

  return {
    base: PS.atlas.getPaletteRgb("terrain", paletteKey, template.base),
    accent: template.accent,
    dark: template.dark,
    pattern: template.pattern
  };
};

PS.atlas.getTerrainTilePalette = function (biome, tileDefinition) {
  var fallback = PS.atlas.getTerrainPalette(biome);
  var base = tileDefinition && tileDefinition.baseColor ? PS.atlas.hexToRgb(tileDefinition.baseColor) : fallback.base;
  var priority = clamp(Number(tileDefinition && tileDefinition.transitionPriority) || 4, 1, 12);
  var waterDepth = clamp(Number(tileDefinition && tileDefinition.waterDepth) || 0, 0, 1);
  var fertility = clamp(Number(tileDefinition && tileDefinition.baseFertility) || 0, 0, 1);
  var accentLift = 30 + priority * 3 + fertility * 18 + waterDepth * 24;
  var darkDrop = 24 + priority * 2 + waterDepth * 26;

  return {
    base: base,
    accent: [
      clamp(Math.round(base[0] + accentLift), 0, 255),
      clamp(Math.round(base[1] + accentLift), 0, 255),
      clamp(Math.round(base[2] + accentLift), 0, 255)
    ],
    dark: [
      clamp(Math.round(base[0] - darkDrop), 0, 255),
      clamp(Math.round(base[1] - darkDrop), 0, 255),
      clamp(Math.round(base[2] - darkDrop), 0, 255)
    ],
    pattern: PS.atlas.getTerrainPatternForTile(tileDefinition, fallback.pattern)
  };
};

PS.atlas.applyTerrainMoisturePalette = function (palette, sample) {
  var moistureColor = PS.render && PS.render.surfaceColor && typeof PS.render.surfaceColor.getGroundMoistureColor === "function"
    ? PS.render.surfaceColor.getGroundMoistureColor(sample)
    : null;
  var base;
  var lift;
  var drop;

  if (!moistureColor) {
    return palette;
  }

  base = PS.atlas.hexToRgb(moistureColor);
  lift = 34;
  drop = 26;
  return {
    base: base,
    accent: [
      clamp(Math.round(base[0] + lift), 0, 255),
      clamp(Math.round(base[1] + lift), 0, 255),
      clamp(Math.round(base[2] + lift), 0, 255)
    ],
    dark: [
      clamp(Math.round(base[0] - drop), 0, 255),
      clamp(Math.round(base[1] - drop), 0, 255),
      clamp(Math.round(base[2] - drop), 0, 255)
    ],
    pattern: palette.pattern
  };
};

PS.atlas.getTerrainPatternForTile = function (tileDefinition, fallbackPattern) {
  var id = String(tileDefinition && tileDefinition.id || "");
  var sheet = String(tileDefinition && tileDefinition.spriteSheet || "");

  if (id.indexOf("river") >= 0) { return "stream"; }
  if (id.indexOf("tidal") >= 0) { return "shore"; }
  if (id.indexOf("water") >= 0) { return "wave"; }
  if (id.indexOf("marsh") >= 0 || id.indexOf("wetland") >= 0 || id.indexOf("mud") >= 0 || id.indexOf("reed") >= 0) { return "reed"; }
  if (id.indexOf("forest") >= 0 || id.indexOf("moss") >= 0 || sheet.indexOf("forest") >= 0) { return "canopy"; }
  if (id.indexOf("dune") >= 0 || id.indexOf("sand") >= 0) { return "dune"; }
  if (id.indexOf("cliff") >= 0 || id.indexOf("rock") >= 0) { return "ridge"; }
  if (id.indexOf("lichen") >= 0) { return "lichen"; }
  if (id.indexOf("snow") >= 0) { return "frost"; }
  if (id.indexOf("ice") >= 0) { return "crack"; }
  if (id.indexOf("volcanic") >= 0 || id.indexOf("lava") >= 0) { return "lava"; }
  if (id.indexOf("grass") >= 0) { return "grass"; }

  return fallbackPattern || "grit";
};

PS.atlas.getTerrainMaterialScore = function (tileDefinition, sample, biome, tileX, tileY) {
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || {};
  var surface = String(detail.surface || "").toLowerCase();
  var id = String(tileDefinition && tileDefinition.id || "");
  var score = 0;
  var elevationMin = Number(tileDefinition && tileDefinition.elevation && tileDefinition.elevation.min);
  var elevationMax = Number(tileDefinition && tileDefinition.elevation && tileDefinition.elevation.max);
  var normalizedHeight = Number.isFinite(Number(detail.elevation)) ? Number(detail.elevation) : 0.5;
  var waterDepth = clamp(Number(signals.waterDepth) || Number(tileDefinition && tileDefinition.waterDepth) || 0, 0, 1);
  var wetness = clamp(Number(signals.wetness) || 0, 0, 1);
  var roughness = clamp(Number(signals.surfaceRoughness) || Number(detail.roughness) || 0, 0, 1);
  var snow = clamp(Number(signals.snow) || 0, 0, 1);
  var noise = PS.atlas.getTerrainSurfaceNoise(
    tileX + Number(tileDefinition && tileDefinition.transitionPriority || 0),
    tileY - Number(tileDefinition && tileDefinition.transitionPriority || 0),
    17
  );

  if (tileDefinition.biome === biome) { score += 20; }
  if ((surface.indexOf("river") >= 0 || surface.indexOf("stream") >= 0 || surface.indexOf("channel") >= 0 || Number(signals.flow) > 0.35) && id.indexOf("river") >= 0) { score += 48 + waterDepth * 8; }
  if ((surface.indexOf("shore") >= 0 || surface.indexOf("tidal") >= 0 || surface.indexOf("estuary") >= 0 || surface.indexOf("coast") >= 0) && id.indexOf("tidal") >= 0) { score += 44 + wetness * 8; }
  if ((surface.indexOf("lava") >= 0 || surface.indexOf("magma") >= 0 || Number(signals.lava) > 0.35 || Number(signals.heat) > 0.75) && id.indexOf("lava") >= 0) { score += 52; }
  if ((surface.indexOf("ash") >= 0 || Number(signals.ash) > 0.45) && id.indexOf("volcanic") >= 0) { score += 30; }
  if ((surface.indexOf("lichen") >= 0 || Number(signals.lichen) > 0.35) && id.indexOf("lichen") >= 0) { score += 46; }
  if ((surface.indexOf("reed") >= 0 || surface.indexOf("mat") >= 0 || Number(signals.reedDensity) > 0.35) && id.indexOf("reed") >= 0) { score += 42 + wetness * 8; }
  if (surface.indexOf("water") >= 0 && id.indexOf("water") >= 0) { score += 28 + waterDepth * 12; }
  if (surface === "deep water" && id.indexOf("deep") >= 0) { score += 30; }
  if ((surface === "open water" || surface === "whitecap") && id.indexOf("shallow") >= 0 && waterDepth < 0.70) { score += 22; }
  if ((surface === "sand" || surface === "dune") && (id.indexOf("sand") >= 0 || id.indexOf("dune") >= 0)) { score += 25; }
  if (surface === "dune" && id.indexOf("dune") >= 0) { score += 18; }
  if ((surface === "rock" || surface === "stone" || surface === "ridge ice") && (id.indexOf("rock") >= 0 || id.indexOf("cliff") >= 0)) { score += 25; }
  if (id.indexOf("cliff") >= 0 && roughness > 0.52) { score += 16; }
  if ((surface === "dense canopy" || surface === "woodland") && (id.indexOf("forest") >= 0 || id.indexOf("moss") >= 0)) { score += 24; }
  if ((surface === "clearing" || surface === "meadow" || surface === "grass") && (id.indexOf("grass") >= 0 || id === "dirt")) { score += 18; }
  if ((surface === "moss" || surface === "scrub") && (id.indexOf("moss") >= 0 || id.indexOf("wetland") >= 0)) { score += 15; }
  if (wetness > 0.52 && (id.indexOf("mud") >= 0 || id.indexOf("marsh") >= 0 || id.indexOf("wetland") >= 0)) { score += 16 + wetness * 12; }
  if ((surface === "snow" || snow > 0.55) && id.indexOf("snow") >= 0) { score += 28; }
  if ((surface === "ice" || surface === "ridge ice") && id.indexOf("ice") >= 0) { score += 24; }
  if (biome === "volcanic" && id.indexOf("volcanic") >= 0) { score += 30; }

  if (Number.isFinite(elevationMin) && Number.isFinite(elevationMax)) {
    if (normalizedHeight >= elevationMin && normalizedHeight <= elevationMax) {
      score += 6;
    } else {
      score -= 4;
    }
  }

  return score + noise;
};

PS.atlas.getTerrainSurfaceNoise = function (sampleX, sampleY, salt) {
  if (PS.math && typeof PS.math.deterministicUnitNoise === "function") {
    return PS.math.deterministicUnitNoise(sampleX, sampleY, salt);
  }

  var value = Math.sin((Number(sampleX) || 0) * 12.9898 + (Number(sampleY) || 0) * 78.233 + (Number(salt) || 0) * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

PS.atlas.getTerrainVariant = function (tileX, tileY, variantCount, salt) {
  var count = Math.max(1, Math.round(Number(variantCount) || 1));
  var noise = PS.atlas.getTerrainSurfaceNoise(tileX, tileY, salt || count);

  return clamp(Math.floor(noise * count), 0, count - 1);
};

PS.atlas.getTerrainMaterialTile = function (biome, tileX, tileY, sample) {
  var registry = PS.core && PS.core.TileRegistry && typeof PS.core.TileRegistry.getByBiome === "function"
    ? PS.core.TileRegistry
    : null;
  var candidates = registry ? registry.getByBiome(biome) : [];
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || {};
  var surface = String(detail.surface || "").toLowerCase();
  var best = null;
  var bestScore = -Infinity;
  var i;

  if (registry && biome === "forest") {
    candidates = candidates.concat(registry.getByBiome("temperate"));
  } else if (registry && biome === "grassland" && surface === "meadow") {
    candidates = candidates.concat(registry.getByBiome("temperate"));
  } else if (registry && (surface === "open water" || surface === "deep water" || surface === "whitecap")) {
    candidates = candidates.concat(registry.getByBiome("ocean"));
  }

  if (registry && (surface.indexOf("river") >= 0 || surface.indexOf("stream") >= 0 || surface.indexOf("channel") >= 0 || Number(signals.flow) > 0.35)) {
    candidates = candidates.concat(registry.getByBiome("coastal"), registry.getByBiome("wetland"), registry.getByBiome("ocean"));
  }
  if (registry && (surface.indexOf("shore") >= 0 || surface.indexOf("tidal") >= 0 || surface.indexOf("estuary") >= 0 || surface.indexOf("coast") >= 0)) {
    candidates = candidates.concat(registry.getByBiome("coastal"));
  }
  if (registry && (surface.indexOf("lava") >= 0 || surface.indexOf("magma") >= 0 || surface.indexOf("ash") >= 0 || Number(signals.lava) > 0.35 || Number(signals.heat) > 0.75 || Number(signals.ash) > 0.45)) {
    candidates = candidates.concat(registry.getByBiome("volcanic"));
  }
  if (registry && (surface.indexOf("lichen") >= 0 || Number(signals.lichen) > 0.35)) {
    candidates = candidates.concat(registry.getByBiome("tundra"));
  }
  if (registry && (surface.indexOf("reed") >= 0 || surface.indexOf("mat") >= 0 || Number(signals.reedDensity) > 0.35)) {
    candidates = candidates.concat(registry.getByBiome("wetland"));
  }

  for (i = 0; i < candidates.length; i++) {
    var score = PS.atlas.getTerrainMaterialScore(candidates[i], sample, biome, tileX, tileY);

    if (score > bestScore) {
      bestScore = score;
      best = candidates[i];
    }
  }

  return best;
};

PS.atlas.mixTerrainColor = function (palette, amount, alphaOverride) {
  var shade = clamp(Number(amount) || 0, -1, 1);
  var other = shade >= 0 ? palette.accent : palette.dark;
  var mix = Math.abs(shade);
  var alpha = alphaOverride !== undefined ? Math.max(0, Math.min(255, Math.round(Number(alphaOverride) || 0))) : 255;

  return [
    Math.round(palette.base[0] * (1 - mix) + other[0] * mix),
    Math.round(palette.base[1] * (1 - mix) + other[1] * mix),
    Math.round(palette.base[2] * (1 - mix) + other[2] * mix),
    alpha
  ];
};

PS.atlas.getTerrainHeightAlpha = function (sample, amount) {
  var detail = sample && sample.detail ? sample.detail : {};
  var tile = sample && sample.tile ? sample.tile : {};
  var normalizedHeight = Number.isFinite(Number(detail.elevation))
    ? Number(detail.elevation)
    : ((Math.tanh(Number(tile.elevation) || 0) + 1) * 0.5);
  var relief = Number.isFinite(Number(amount)) ? Number(amount) * 0.12 : 0;

  return Math.round(clamp(normalizedHeight + relief, 0, 1) * 255);
};

PS.atlas.getTerrainPatternAmount = function (pattern, x, y, variant) {
  var hash = (x * 17 + y * 31 + variant * 43) & 15;

  if (pattern === "wave") {
    return ((x + variant * 3 + Math.floor(y / 2)) % 7 === 0) ? 0.45 : (hash < 2 ? -0.22 : 0);
  }
  if (pattern === "stream") {
    return Math.abs(x - 7 + Math.floor((y + variant) / 3)) <= 1 ? 0.50 : (hash < 3 ? -0.24 : 0);
  }
  if (pattern === "shore") {
    return ((x + y + variant) % 6 < 2) ? 0.42 : (hash < 3 ? -0.18 : 0);
  }
  if (pattern === "canopy") {
    return hash < 4 ? 0.34 : (hash > 12 ? -0.28 : 0);
  }
  if (pattern === "reed") {
    return x % 5 === variant % 5 ? 0.36 : (y % 7 === 0 ? -0.24 : 0);
  }
  if (pattern === "frost") {
    return (x + y + variant) % 5 === 0 ? 0.45 : (hash < 3 ? -0.18 : 0);
  }
  if (pattern === "lichen") {
    return hash < 6 || (x + y + variant) % 7 === 0 ? 0.34 : (hash > 12 ? -0.20 : 0);
  }
  if (pattern === "crack") {
    return Math.abs(x - y + variant * 2) % 9 === 0 ? -0.42 : (hash < 2 ? 0.34 : 0);
  }
  if (pattern === "dune") {
    return (x + Math.floor(y / 2) + variant * 2) % 8 < 2 ? 0.34 : (hash < 2 ? -0.16 : 0);
  }
  if (pattern === "ridge") {
    return Math.abs(x - 8) + Math.floor(y / 3) + variant < 8 ? 0.36 : (hash < 4 ? -0.24 : 0);
  }
  if (pattern === "lava") {
    return (hash === 0 || (x + y + variant) % 13 === 0) ? 0.85 : (hash < 6 ? -0.34 : 0);
  }
  if (pattern === "microbial") {
    return (hash < 5 || (x * 3 + y + variant) % 11 === 0) ? 0.46 : (hash > 12 ? -0.30 : 0);
  }
  if (pattern === "mineral") {
    return (hash === 1 || hash === 9 || Math.abs(x - y + variant) % 7 === 0) ? 0.62 : (hash < 4 ? -0.30 : 0);
  }
  if (pattern === "nutrient") {
    return (hash < 4 || (x + y * 2 + variant) % 9 === 0) ? 0.42 : (hash > 12 ? -0.18 : 0);
  }
  if (pattern === "grass") {
    return hash < 4 ? 0.28 : (hash > 12 ? -0.18 : 0);
  }

  return hash < 3 ? 0.22 : (hash > 13 ? -0.22 : 0);
};

PS.atlas.getTerrainBiologyInfo = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || {};
  var biology = sample && sample.biology ? sample.biology : {};
  var microbial = sample && sample.microbial ? sample.microbial : {};
  var bloom = Math.max(
    Number(signals.microbialBloom) || 0,
    Number(signals.biofilm) || 0,
    Number(detail.microbialBloom) || 0,
    Number(detail.biofilm) || 0,
    Number(biology.microbialBloom) || 0,
    Number(biology.density) || 0,
    Number(microbial.bloomIntensity) || 0,
    Number(microbial.density) || 0,
    Number(sample && sample.microbialBloom) || 0
  );
  var organic = Math.max(
    Number(signals.organicMatter) || 0,
    Number(signals.ecology) || 0,
    Number(detail.organicMatter) || 0,
    Number(biology.organicMatter) || 0,
    Number(sample && sample.ecology && sample.ecology.organismPressure) || 0,
    Number(sample && sample.ecology && sample.ecology.organicMatter) || 0,
    Number(sample && sample.ecology) || 0
  );
  var pressure = clamp(Math.max(bloom, organic * 0.72), 0, 1);

  if (pressure < 0.18) {
    return null;
  }

  return {
    type: bloom >= organic * 0.65 ? "microbial" : "organic",
    bucket: Math.min(3, Math.floor(pressure * 4)),
    pressure: pressure
  };
};

PS.atlas.getTerrainBiologyKey = function (sample) {
  var biology = PS.atlas.getTerrainBiologyInfo(sample);

  if (!biology) {
    return "bio0";
  }

  return biology.type + "." + biology.bucket;
};

PS.atlas.applyTerrainBiologyPalette = function (palette, biology) {
  if (!biology) {
    return palette;
  }

  var microbialAccent = biology.type === "microbial" ? [84, 204, 139] : [116, 176, 72];
  var microbialBase = biology.type === "microbial" ? [38, 114, 86] : [68, 126, 58];
  var pressure = clamp(0.22 + biology.pressure * 0.38, 0, 0.62);

  return {
    base: [
      Math.round(palette.base[0] * (1 - pressure) + microbialBase[0] * pressure),
      Math.round(palette.base[1] * (1 - pressure) + microbialBase[1] * pressure),
      Math.round(palette.base[2] * (1 - pressure) + microbialBase[2] * pressure)
    ],
    accent: [
      Math.round(palette.accent[0] * (1 - pressure) + microbialAccent[0] * pressure),
      Math.round(palette.accent[1] * (1 - pressure) + microbialAccent[1] * pressure),
      Math.round(palette.accent[2] * (1 - pressure) + microbialAccent[2] * pressure)
    ],
    dark: palette.dark,
    pattern: biology.type === "microbial" ? "microbial" : palette.pattern
  };
};

PS.atlas.getTerrainResourceInfo = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || {};
  var strata = detail.materialStrata || {};
  var mineral = Math.max(
    Number(signals.mineralDensity) || 0,
    Number(signals.oreDensity) || 0,
    Number(signals.resourceDensity) || 0,
    Number(detail.mineralDensity) || 0,
    Number(detail.resourceDensity) || 0,
    strata.secondary === "mineral-vein" ? 0.72 : 0,
    Number(sample && sample.mineralDensity) || 0
  );
  var nutrient = Math.max(
    Number(signals.nutrientRichness) || 0,
    Number(signals.foodPotential) || 0,
    Number(signals.resourceFertility) || 0,
    Number(detail.nutrientRichness) || 0,
    Number(detail.resourceFertility) || 0,
    Number(sample && sample.ecology && sample.ecology.foodPressure) || 0,
    Number(sample && sample.resourceRichness) || 0
  );
  var pressure = clamp(Math.max(mineral, nutrient), 0, 1);

  if (pressure < 0.18) {
    return null;
  }

  return {
    type: mineral >= nutrient ? "mineral" : "nutrient",
    bucket: Math.min(3, Math.floor(pressure * 4)),
    pressure: pressure
  };
};

PS.atlas.getTerrainResourceKey = function (sample) {
  var resource = PS.atlas.getTerrainResourceInfo(sample);

  if (!resource) {
    return "";
  }

  return "." + resource.type + "." + resource.bucket;
};

PS.atlas.getTerrainEcologyMicroPhase = function (sample, tileX, tileY) {
  var ecology = sample && sample.ecology ? sample.ecology : null;
  var pressure = Math.max(
    Number(ecology && ecology.foodPressure) || 0,
    Number(ecology && ecology.organismPressure) || 0,
    Number(ecology && ecology.organicMatter) || 0
  );
  var sampleX = Number.isFinite(Number(tileX)) ? Number(tileX) : Number(sample && sample.x) || 0;
  var sampleY = Number.isFinite(Number(tileY)) ? Number(tileY) : Number(sample && sample.y) || 0;
  var noise;

  if (!ecology || pressure < 0.18) {
    return -1;
  }

  noise = PS.atlas.getTerrainSurfaceNoise(sampleX, sampleY, 91);
  return clamp(Math.floor(noise * 4), 0, 3);
};

PS.atlas.getTerrainEcologyMicroKey = function (sample, tileX, tileY) {
  var phase = PS.atlas.getTerrainEcologyMicroPhase(sample, tileX, tileY);

  return phase >= 0 ? ".ecoform." + phase : "";
};

PS.atlas.applyTerrainResourcePalette = function (palette, resource, biology) {
  if (!resource) {
    return palette;
  }

  var resourceBase = resource.type === "mineral" ? [96, 104, 112] : [108, 132, 58];
  var resourceAccent = resource.type === "mineral" ? [214, 202, 164] : [206, 190, 82];
  var pressure = clamp(0.16 + resource.pressure * 0.30, 0, 0.50);

  return {
    base: [
      Math.round(palette.base[0] * (1 - pressure) + resourceBase[0] * pressure),
      Math.round(palette.base[1] * (1 - pressure) + resourceBase[1] * pressure),
      Math.round(palette.base[2] * (1 - pressure) + resourceBase[2] * pressure)
    ],
    accent: [
      Math.round(palette.accent[0] * (1 - pressure) + resourceAccent[0] * pressure),
      Math.round(palette.accent[1] * (1 - pressure) + resourceAccent[1] * pressure),
      Math.round(palette.accent[2] * (1 - pressure) + resourceAccent[2] * pressure)
    ],
    dark: palette.dark,
    pattern: biology && biology.type === "microbial" ? palette.pattern : resource.type
  };
};

PS.atlas.drawTerrainCell = function (cell, biome, variant, tileDefinition, sample) {
  var biology = PS.atlas.getTerrainBiologyInfo(sample);
  var resource = PS.atlas.getTerrainResourceInfo(sample);
  var civilization = typeof PS.atlas.getTerrainCivilizationInfo === "function"
    ? PS.atlas.getTerrainCivilizationInfo(sample)
    : null;
  var palette = tileDefinition
    ? PS.atlas.getTerrainTilePalette(biome, tileDefinition)
    : PS.atlas.getTerrainPalette(biome);
  var x;
  var y;

  palette = PS.atlas.applyTerrainMoisturePalette(palette, sample);
  palette = PS.atlas.applyTerrainBiologyPalette(palette, biology);
  palette = PS.atlas.applyTerrainResourcePalette(palette, resource, biology);
  if (typeof PS.atlas.applyTerrainCivilizationPalette === "function") {
    palette = PS.atlas.applyTerrainCivilizationPalette(palette, civilization);
  }

  for (y = 0; y < cell.h; y++) {
    for (x = 0; x < cell.w; x++) {
      var patternAmount = PS.atlas.getTerrainPatternAmount(palette.pattern, x, y, variant);
      PS.atlas.writePixel(cell, x, y, PS.atlas.mixTerrainColor(
        palette,
        patternAmount,
        PS.atlas.getTerrainHeightAlpha(sample, patternAmount)
      ));
    }
  }

  if (typeof PS.atlas.drawTerrainDetailOverlay === "function") {
    PS.atlas.drawTerrainDetailOverlay(cell, palette, variant, tileDefinition, biome, sample);
  }
};

PS.atlas.getImageDimension = function (image, key) {
  if (!image) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(
      Number(image[key]) ||
      Number(image["natural" + key.charAt(0).toUpperCase() + key.slice(1)]) ||
      0
    )
  );
};

PS.atlas.addExternalPage = function (image, sourceId) {
  var width = PS.atlas.getImageDimension(image, "width");
  var height = PS.atlas.getImageDimension(image, "height");
  var page;

  if (width <= 0 || height <= 0) {
    throw new Error("External atlas image must expose width and height");
  }

  page = {
    pageIndex: PS.atlas.pages.length,
    width: width,
    height: height,
    image: image,
    externalImage: true,
    sourceId: sourceId || "",
    version: 1
  };

  PS.atlas.pages.push(page);
  return page;
};

PS.atlas.addExternalCell = function (page, sourceCell, overrideExisting) {
  var name = String(sourceCell && sourceCell.name || "");
  var x = Math.max(0, Math.round(Number(sourceCell && sourceCell.x) || 0));
  var y = Math.max(0, Math.round(Number(sourceCell && sourceCell.y) || 0));
  var width = Math.max(1, Math.round(Number(sourceCell && sourceCell.w) || Number(sourceCell && sourceCell.width) || 0));
  var height = Math.max(1, Math.round(Number(sourceCell && sourceCell.h) || Number(sourceCell && sourceCell.height) || 0));
  var cell;

  if (!name) {
    return null;
  }

  if (PS.atlas.cells[name] && !overrideExisting) {
    return PS.atlas.cells[name];
  }

  cell = {
    name: name,
    pageIndex: page.pageIndex,
    x: x,
    y: y,
    w: width,
    h: height,
    u0: x / page.width,
    v0: y / page.height,
    u1: (x + width) / page.width,
    v1: (y + height) / page.height,
    externalImage: true,
    sourceId: page.sourceId || ""
  };

  PS.atlas.cells[name] = cell;
  PS.atlas.stats.generatedCells++;
  return cell;
};

PS.atlas.getSheetCells = function (sheet) {
  if (!sheet) {
    return [];
  }

  if (typeof sheet.getCells === "function") {
    return sheet.getCells();
  }

  if (sheet.sheet && typeof sheet.sheet.getCells === "function") {
    return sheet.sheet.getCells();
  }

  if (Array.isArray(sheet.cells)) {
    return sheet.cells;
  }

  if (sheet.cells) {
    return Object.keys(sheet.cells).map(function (name) {
      return sheet.cells[name];
    });
  }

  return [];
};

PS.atlas.getSheetImage = function (sheet) {
  if (!sheet) {
    return null;
  }

  return sheet.image || (sheet.sheet && sheet.sheet.image) || null;
};

PS.atlas.buildFromSheets = function (sheets, options) {
  var settings = options || {};
  var overrideExisting = settings.overrideExisting !== false;
  var built = [];

  if (!settings.append) {
    PS.atlas.reset();
  }

  (sheets || []).forEach(function (sheet, index) {
    var image = PS.atlas.getSheetImage(sheet);
    var sourceId = String(sheet && sheet.id || sheet && sheet.path || "sheet." + index);
    var page;

    if (!image) {
      return;
    }

    page = PS.atlas.addExternalPage(image, sourceId);
    PS.atlas.getSheetCells(sheet).forEach(function (sourceCell) {
      var cell = PS.atlas.addExternalCell(page, sourceCell, overrideExisting);

      if (cell) {
        built.push(cell);
      }
    });
  });

  PS.atlas.initialized = PS.atlas.pages.length > 0;
  return {
    pages: PS.atlas.pages,
    cells: PS.atlas.cells,
    builtCells: built
  };
};

PS.atlas.build = function (generated) {
  var entries = generated && (generated.cells || generated.sprites || generated);

  PS.atlas.reset();

  if (Array.isArray(entries)) {
    entries.forEach(function (entry) {
      PS.atlas.allocateCell(entry.name, entry.w || entry.width, entry.h || entry.height);
    });
  } else {
    Object.keys(entries || {}).forEach(function (name) {
      var entry = entries[name] || {};
      PS.atlas.allocateCell(entry.name || name, entry.w || entry.width, entry.h || entry.height);
    });
  }

  PS.atlas.initialized = PS.atlas.pages.length > 0;
  return {
    pages: PS.atlas.pages,
    cells: PS.atlas.cells
  };
};

PS.atlas.buildHybrid = function (generated, sheets) {
  PS.atlas.build(generated || {});
  return PS.atlas.buildFromSheets(sheets || [], {
    append: true,
    overrideExisting: true
  });
};

PS.atlas.uploadToGL = function (gl) {
  if (!gl || typeof gl.createTexture !== "function") {
    throw new Error("GPU context is required for atlas upload");
  }

  return PS.atlas.pages.map(function (page) {
    var texture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, texture);

    if (typeof gl.texParameteri === "function") {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    if (page.externalImage && page.image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, page.image);
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        page.width,
        page.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        page.data
      );
    }

    page.texture = texture;
    return texture;
  });
};

PS.atlas.getCell = function (name) {
  return PS.atlas.cells[String(name || "")] || null;
};

PS.atlas.getOrganismCell = function (bodyType, variant) {
  var name = "entity.organism_" + clamp(Math.round(Number(bodyType) || 0), 0, 3) + "." + clamp(Math.round(Number(variant) || 0), 0, 3);
  var cell = PS.atlas.cells[name];

  if (!cell) {
    cell = PS.atlas.allocateCell(name, 32, 16);
    PS.atlas.drawOrganismSprite(cell, {
      lineageId: 1,
      traits: {
        bodySize: 0.75 + clamp(Number(bodyType) || 0, 0, 3) * 0.35,
        bodyShape: bodyType,
        limbCount: 4,
        appendageType: 0,
        camouflage: 0.2
      }
    }, variant);
  }

  return cell;
};

PS.atlas.getFoodCell = function (variant, food) {
  var safeVariant = clamp(Math.round(Number(variant) || 0), 0, 3);
  var richness = PS.atlas.getFoodRichnessBucket(food);
  var familyBucket = PS.atlas.getFoodFamilyBucket(food);
  var name = "entity.food." + safeVariant + "." + richness + "." + familyBucket;
  var cell = PS.atlas.cells[name];

  if (!cell) {
    cell = PS.atlas.allocateCell(name, 32, 16);
    PS.atlas.drawFoodCell(cell, safeVariant, richness, familyBucket);
    PS.atlas.stats.foodCells++;
    PS.atlas.pages[cell.pageIndex].version++;
  }

  return cell;
};

PS.atlas.getVegetationCell = function (type, variant, part) {
  var safeType = clamp(Math.round(Number(type) || 0), 0, 15);
  var safeVariant = clamp(Math.round(Number(variant) || 0), 0, 15);
  var safePart = part === "canopy" ? "canopy" : "below";
  var name = "entity.vegetation." + safeType + "." + safeVariant + "." + safePart;
  var cell = PS.atlas.cells[name];

  if (!cell) {
    cell = PS.atlas.allocateCell(name, 32, 16);
    PS.atlas.drawVegetationCell(cell, safeType, safeVariant, safePart);
    PS.atlas.stats.vegetationCells++;
    PS.atlas.pages[cell.pageIndex].version++;
  }

  return cell;
};

PS.atlas.getSettlementCell = function (settlement) {
  var archetype = PS.atlas.getSettlementArchetype(settlement);
  var levelBucket = PS.atlas.getSettlementLevelBucket(settlement);
  var lineageBucket = ((Math.max(1, Math.round(Number(settlement && settlement.lineageId) || 1)) - 1) % 16) + 1;
  var name = "entity.settlement." + archetype + "." + levelBucket + "." + lineageBucket;
  var cell = PS.atlas.cells[name];

  if (!cell) {
    cell = PS.atlas.allocateCell(name, 32, 16);
    PS.atlas.drawSettlementCell(cell, archetype, levelBucket, lineageBucket);
    PS.atlas.stats.settlementCells++;
    PS.atlas.pages[cell.pageIndex].version++;
  }

  return cell;
};

PS.atlas.getRouteActivityBucket = function (route) {
  if (!route || route.isActive === false) { return 0; }
  if (Math.max(0, Number(route.foodTransferred) || 0) >= 80) { return 2; }
  return 1;
};

PS.atlas.getRouteCell = function (route, shape) {
  var safeShape = String(shape || "horizontal");
  var activityBucket = PS.atlas.getRouteActivityBucket(route);
  var lineageBucket = ((Math.max(1, Math.round(Number(route && route.lineageId) || 1)) - 1) % 16) + 1;
  var name = "entity.route." + safeShape + "." + activityBucket + "." + lineageBucket;
  var cell = PS.atlas.cells[name];

  if (!cell) {
    cell = PS.atlas.allocateCell(name, 32, 16);
    PS.atlas.drawRouteCell(cell, safeShape, activityBucket, lineageBucket);
    PS.atlas.stats.routeCells++;
    PS.atlas.pages[cell.pageIndex].version++;
  }

  return cell;
};

PS.atlas.getInfluenceStrengthBucket = function (settlement) {
  var level = Math.max(1, Math.round(Number(settlement && settlement.level) || 1));
  var claimed = Math.max(0, Math.round(Number(settlement && settlement.claimedTiles) || 0));

  if (level >= 5 || claimed >= 220) { return 2; }
  if (level >= 2 || claimed >= 60) { return 1; }
  return 0;
};

PS.atlas.getSettlementInfluenceCell = function (settlement) {
  var strengthBucket = PS.atlas.getInfluenceStrengthBucket(settlement);
  var lineageBucket = ((Math.max(1, Math.round(Number(settlement && settlement.lineageId) || 1)) - 1) % 16) + 1;
  var name = "entity.influence." + strengthBucket + "." + lineageBucket;
  var cell = PS.atlas.cells[name];

  if (!cell) {
    cell = PS.atlas.allocateCell(name, 32, 16);
    PS.atlas.drawInfluenceCell(cell, strengthBucket, lineageBucket);
    PS.atlas.stats.influenceCells++;
    PS.atlas.pages[cell.pageIndex].version++;
  }

  return cell;
};

PS.atlas.getSettlementWorldUiBucket = function (settlement, metricType) {
  var metric = String(metricType || "population");

  if (metric === "food") {
    var food = Math.max(
      Number(settlement && settlement.foodStock) || 0,
      Number(settlement && settlement.storedFood) || 0,
      Number(settlement && settlement.claimedFood) || 0
    );

    if (food >= 160) { return 3; }
    if (food >= 80) { return 2; }
    if (food > 0) { return 1; }
    return 0;
  }

  if (metric === "development") {
    var development = clamp(Number(settlement && settlement.development) || 0, 0, 1);

    if (development >= 0.75) { return 3; }
    if (development >= 0.45) { return 2; }
    if (development > 0) { return 1; }
    return 0;
  }

  var population = Math.max(0, Number(settlement && settlement.population) || 0);

  if (population >= 160) { return 3; }
  if (population >= 80) { return 2; }
  if (population > 0) { return 1; }
  return 0;
};

PS.atlas.getSettlementWorldUiCell = function (settlement, metricType) {
  var metric = String(metricType || "population");
  var bucket = PS.atlas.getSettlementWorldUiBucket(settlement, metric);
  var lineageBucket = ((Math.max(1, Math.round(Number(settlement && settlement.lineageId) || 1)) - 1) % 16) + 1;
  var name = "entity.settlement_world_ui." + metric + "." + bucket + "." + lineageBucket;
  var cell = PS.atlas.cells[name];

  if (!cell) {
    cell = PS.atlas.allocateCell(name, 32, 16);
    PS.atlas.drawSettlementWorldUiCell(cell, metric, bucket, lineageBucket);
    PS.atlas.stats.worldUiCells++;
    PS.atlas.pages[cell.pageIndex].version++;
  }

  return cell;
};

PS.atlas.getTerrainCell = function (biome, tileX, tileY, sample) {
  var tileDefinition = PS.atlas.getTerrainMaterialTile(biome, tileX, tileY, sample);
  var variantCount = Math.max(1, Number(tileDefinition && tileDefinition.variants) || 4);
  var variant = PS.atlas.getTerrainVariant(tileX, tileY, variantCount, 29);
  var materialId = tileDefinition ? tileDefinition.id : String(biome || "grass");
  var biologyKey = PS.atlas.getTerrainBiologyKey(sample);
  var resourceKey = PS.atlas.getTerrainResourceKey(sample);
  var civilizationKey = typeof PS.atlas.getTerrainCivilizationKey === "function"
    ? PS.atlas.getTerrainCivilizationKey(sample)
    : "civ0";
  var ecologyMicroPhase = PS.atlas.getTerrainEcologyMicroPhase(sample, tileX, tileY);
  var ecologyMicroKey = ecologyMicroPhase >= 0 ? ".ecoform." + ecologyMicroPhase : "";
  var moistureKey = PS.render && PS.render.surfaceColor && typeof PS.render.surfaceColor.getGroundMoistureKey === "function"
    ? PS.render.surfaceColor.getGroundMoistureKey(Object.assign({ x: tileX, y: tileY }, sample || {}))
    : "gmoist.none";
  var eraKey = PS.render && PS.render.surfaceColor && typeof PS.render.surfaceColor.getEraPaletteKey === "function"
    ? PS.render.surfaceColor.getEraPaletteKey(Object.assign({ x: tileX, y: tileY }, sample || {}))
    : "era.none";
  var transitionKey = typeof PS.atlas.getTerrainTransitionKey === "function"
    ? PS.atlas.getTerrainTransitionKey(sample, biome)
    : "plain";
  var drawSample = Object.assign({}, sample || {}, {
    x: tileX,
    y: tileY
  });
  var stencilKey = typeof PS.atlas.getTerrainTextureOverlayKey === "function"
    ? PS.atlas.getTerrainTextureOverlayKey(drawSample, biome)
    : "stencil.none";
  var featureKey = typeof PS.atlas.getTerrainFeatureKey === "function"
    ? PS.atlas.getTerrainFeatureKey(sample, biome, tileDefinition)
    : "feature0";
  var name = "terrain." + materialId + "." + variant + "." + transitionKey + "." + stencilKey + "." + featureKey + "." + moistureKey + "." + eraKey + "." + biologyKey + resourceKey + "." + civilizationKey + ecologyMicroKey;
  var cell = PS.atlas.cells[name];

  if (!cell) {
    cell = PS.atlas.allocateCell(name, 16, 16);
    if (ecologyMicroPhase >= 0) {
      drawSample.terrainEcologyMicroPhase = ecologyMicroPhase;
    }
    PS.atlas.drawTerrainCell(cell, biome, variant, tileDefinition, drawSample);
    PS.atlas.stats.terrainCells++;
    PS.atlas.pages[cell.pageIndex].version++;
  }

  return cell;
};

PS.atlas.init = function () {
  var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

  if (PS.atlas.initialized) {
    return true;
  }

  PS.atlas.ensurePage();
  for (var i = 0; i < 4; i++) {
    PS.atlas.getFoodCell(i);
    PS.atlas.getOrganismCell(i, 0);
    PS.atlas.getOrganismCell(i, 1);
  }
  PS.atlas.getSettlementCell({ lineageId: 1, level: 1 });
  PS.atlas.getRouteCell({ lineageId: 1, isActive: true, foodTransferred: 0 }, "horizontal");
  PS.atlas.getSettlementInfluenceCell({ lineageId: 1, level: 1, claimedTiles: 0 });
  PS.atlas.getSettlementWorldUiCell({ lineageId: 1, population: 1, foodStock: 1, development: 0.25 }, "population");
  if (typeof PS.atlas.getOrbitEventMarkerCell === "function") {
    PS.atlas.getOrbitEventMarkerCell({ category: "biology", severity: "info" });
  }
  PS.atlas.getRepresentativeIntentCell({ lineageId: 1, behavior: "watching", target: null, selected: true });
  PS.atlas.initialized = true;
  PS.atlas.stats.lastGenerationMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
  return true;
};

PS.atlas.getStats = function () {
  return {
    initialized: PS.atlas.initialized,
    pageCount: PS.atlas.pages.length,
    cellCount: Object.keys(PS.atlas.cells).length,
    traitCells: PS.atlas.stats.traitCells,
    terrainCells: PS.atlas.stats.terrainCells,
    foodCells: PS.atlas.stats.foodCells,
    settlementCells: PS.atlas.stats.settlementCells,
    routeCells: PS.atlas.stats.routeCells,
    influenceCells: PS.atlas.stats.influenceCells,
    eventMarkerCells: PS.atlas.stats.eventMarkerCells,
    intentCells: PS.atlas.stats.intentCells,
    generatedCells: PS.atlas.stats.generatedCells,
    pageBytes: PS.atlas.stats.pageBytes,
    lastGenerationMs: PS.atlas.stats.lastGenerationMs
  };
};
