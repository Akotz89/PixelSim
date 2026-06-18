"use strict";
import { PS } from "../core/namespace.js";

PS.assets = PS.assets || {};

PS.assets.SpriteSheet = function (image, cells, order, animations, format) {
  this.image = image;
  this.cells = cells || {};
  this.order = order || [];
  this.animations = animations || {};
  this.format = format || "unknown";
};

PS.assets.SpriteSheet.prototype.getCell = function (name) {
  return this.cells[String(name || "")] || null;
};

PS.assets.SpriteSheet.prototype.getCells = function () {
  var self = this;

  return this.order.map(function (name) {
    return self.cells[name];
  });
};

PS.assets.SpriteSheet.prototype.getAnimation = function (tag) {
  return this.animations[String(tag || "")] || null;
};

PS.assets.SpriteSheet._makeCell = function (image, name, frame) {
  var normalFrame = frame.normalFrame || frame.normal || null;
  var materialFrame = frame.materialFrame || frame.material || null;
  var cell = {
    name: name,
    x: Number(frame.x) || 0,
    y: Number(frame.y) || 0,
    w: Number(frame.w) || Number(frame.width) || 0,
    h: Number(frame.h) || Number(frame.height) || 0,
    image: image
  };

  if (normalFrame) {
    cell.normalX = Number(normalFrame.x) || 0;
    cell.normalY = Number(normalFrame.y) || 0;
    cell.normalW = Number(normalFrame.w) || Number(normalFrame.width) || cell.w;
    cell.normalH = Number(normalFrame.h) || Number(normalFrame.height) || cell.h;
    cell.splitAtlas = true;
  }
  if (Array.isArray(frame.normalOffset)) {
    cell.normalOffsetX = Number(frame.normalOffset[0]) || 0;
    cell.normalOffsetY = Number(frame.normalOffset[1]) || 0;
    cell.splitAtlas = true;
  }
  if (materialFrame) {
    cell.materialX = Number(materialFrame.x) || 0;
    cell.materialY = Number(materialFrame.y) || 0;
    cell.materialW = Number(materialFrame.w) || Number(materialFrame.width) || cell.w;
    cell.materialH = Number(materialFrame.h) || Number(materialFrame.height) || cell.h;
    cell.materialChannels = true;
  }
  if (Array.isArray(frame.materialOffset)) {
    cell.materialOffsetX = Number(frame.materialOffset[0]) || 0;
    cell.materialOffsetY = Number(frame.materialOffset[1]) || 0;
    cell.materialChannels = true;
  }

  return cell;
};

PS.assets.SpriteSheet._addFrameCell = function (cells, order, image, name, entry, frame) {
  cells[name] = PS.assets.SpriteSheet._makeCell(image, name, Object.assign({}, entry || {}, frame || {}));
  order.push(name);
};

PS.assets.SpriteSheet._fromFrames = function (image, frames, format) {
  var cells = {};
  var order = [];

  if (Array.isArray(frames)) {
    frames.forEach(function (entry, index) {
      var name = entry && entry.filename ? String(entry.filename) : String(index);
      var frame = entry && (entry.frame || entry) || {};

      PS.assets.SpriteSheet._addFrameCell(cells, order, image, name, entry, frame);
    });
  } else {
    Object.keys(frames || {}).forEach(function (name) {
      var entry = frames[name] || {};
      var frame = entry.frame || entry;

      PS.assets.SpriteSheet._addFrameCell(cells, order, image, name, entry, frame);
    });
  }

  return new PS.assets.SpriteSheet(image, cells, order, {}, format);
};

PS.assets.SpriteSheet.fromGrid = function (image, meta) {
  var cells = {};
  var order = [];
  var tileWidth = Number(meta && meta.tileWidth) || 0;
  var tileHeight = Number(meta && meta.tileHeight) || 0;
  var columns = Number(meta && meta.columns) || 0;
  var rows = Number(meta && meta.rows) || 0;
  var names = meta && Array.isArray(meta.names) ? meta.names : [];
  var total = columns * rows;
  var index;

  for (index = 0; index < total; index += 1) {
    var name = names[index] || String(index);
    var column = index % columns;
    var row = Math.floor(index / columns);

    cells[name] = {
      name: name,
      x: column * tileWidth,
      y: row * tileHeight,
      w: tileWidth,
      h: tileHeight,
      image: image,
      splitAtlas: Boolean(meta && meta.splitAtlas),
      normalOffsetX: Number(meta && meta.normalOffsetX) || 0
    };
    order.push(name);
  }

  return new PS.assets.SpriteSheet(image, cells, order, {}, "grid");
};

PS.assets.SpriteSheet.fromTexturePacker = function (image, json) {
  var sheet = PS.assets.SpriteSheet._fromFrames(image, json && json.frames, "texturepacker");
  var meta = json && json.meta ? json.meta : {};

  if (meta.splitAtlas) {
    sheet.getCells().forEach(function (cell) {
      cell.splitAtlas = true;
      cell.normalOffsetX = Number(meta.normalOffsetX) || Number(meta.normalOffset && meta.normalOffset[0]) || cell.normalOffsetX || 0;
      cell.normalOffsetY = Number(meta.normalOffset && meta.normalOffset[1]) || cell.normalOffsetY || 0;
      if (!cell.normalW) {
        cell.normalX = cell.x + cell.normalOffsetX;
        cell.normalY = cell.y + cell.normalOffsetY;
        cell.normalW = cell.w;
        cell.normalH = cell.h;
      }
      if (meta.materialChannels) {
        cell.materialChannels = meta.materialChannels;
        cell.materialOffsetX = Number(meta.materialOffsetX) || Number(meta.materialOffset && meta.materialOffset[0]) || cell.materialOffsetX || 0;
        cell.materialOffsetY = Number(meta.materialOffset && meta.materialOffset[1]) || cell.materialOffsetY || 0;
        if (!cell.materialW) {
          cell.materialX = cell.x + cell.materialOffsetX;
          cell.materialY = cell.y + cell.materialOffsetY;
          cell.materialW = cell.w;
          cell.materialH = cell.h;
        }
      }
    });
  }

  return sheet;
};

PS.assets.SpriteSheet.fromAseprite = function (image, json) {
  var sheet = PS.assets.SpriteSheet._fromFrames(image, json && json.frames, "aseprite");
  var frameNames = sheet.order;
  var frameTags = json && json.meta && Array.isArray(json.meta.frameTags)
    ? json.meta.frameTags
    : [];

  frameTags.forEach(function (tag) {
    var from = Math.max(0, Number(tag.from) || 0);
    var to = Math.min(frameNames.length - 1, Number(tag.to) || 0);
    var frames = [];
    var index;

    if (to < from) {
      to = from;
    }

    for (index = from; index <= to; index += 1) {
      var name = frameNames[index];
      var source = json.frames[name] || {};

      frames.push({
        cell: sheet.cells[name],
        duration: Number(source.duration) || 0
      });
    }

    sheet.animations[tag.name] = {
      name: tag.name,
      frames: frames,
      loop: tag.loop !== false,
      direction: tag.direction || "forward"
    };
  });

  return sheet;
};

PS.assets.SpriteSheet.detect = function (image, json) {
  if (json && json.type === "grid") {
    return PS.assets.SpriteSheet.fromGrid(image, json);
  }

  if (json && json.frames && json.meta && Array.isArray(json.meta.frameTags)) {
    return PS.assets.SpriteSheet.fromAseprite(image, json);
  }

  if (json && json.frames) {
    return PS.assets.SpriteSheet.fromTexturePacker(image, json);
  }

  throw new Error("Unknown sprite sheet format");
};

PS.assets.TileSheetPacker = PS.assets.TileSheetPacker || {};

PS.assets.TileSheetPacker.decodePixelData = function (pixelData) {
  var source = pixelData || {};
  var raw = source.data;
  var bytes;

  if (raw instanceof Uint8Array) {
    bytes = raw;
  } else if (Array.isArray(raw)) {
    bytes = new Uint8Array(raw);
  } else if (typeof raw === "string") {
    if (typeof Buffer !== "undefined") {
      bytes = new Uint8Array(Buffer.from(raw, "base64"));
    } else if (typeof atob === "function") {
      var binary = atob(raw);
      bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
    }
  }

  if (!bytes) {
    return null;
  }

  return {
    width: Math.max(1, Math.round(Number(source.width) || 1)),
    height: Math.max(1, Math.round(Number(source.height) || 1)),
    data: bytes
  };
};

PS.assets.TileSheetPacker.createPage = function (pages, pageWidth, pageHeight) {
  var page = {
    pageIndex: pages.length,
    width: pageWidth,
    height: pageHeight,
    data: new Uint8Array(pageWidth * pageHeight * 4),
    filter: "nearest",
    version: 1
  };

  pages.push(page);
  return page;
};

PS.assets.TileSheetPacker.copyCellPixels = function (page, dstX, dstY, cell, pixelData) {
  var row;
  var col;
  var srcOffset;
  var dstOffset;

  if (!pixelData || !pixelData.data) {
    return;
  }

  for (row = 0; row < cell.h; row += 1) {
    for (col = 0; col < cell.w; col += 1) {
      srcOffset = ((cell.y + row) * pixelData.width + cell.x + col) * 4;
      dstOffset = ((dstY + row) * page.width + dstX + col) * 4;
      page.data[dstOffset] = pixelData.data[srcOffset] || 0;
      page.data[dstOffset + 1] = pixelData.data[srcOffset + 1] || 0;
      page.data[dstOffset + 2] = pixelData.data[srcOffset + 2] || 0;
      page.data[dstOffset + 3] = pixelData.data[srcOffset + 3] || 0;
    }
  }
};

PS.assets.TileSheetPacker.pack = function (sources, options) {
  var settings = options || {};
  var pageWidth = Math.max(1, Math.round(Number(settings.pageWidth) || 1024));
  var pageHeight = Math.max(1, Math.round(Number(settings.pageHeight) || 1024));
  var pages = [];
  var cells = {};
  var order = [];
  var page = PS.assets.TileSheetPacker.createPage(pages, pageWidth, pageHeight);
  var cursorX = 0;
  var cursorY = 0;
  var rowHeight = 0;
  var entries = [];

  (sources || []).forEach(function (source) {
    var sheet = source && source.sheet;
    var pixelData = PS.assets.TileSheetPacker.decodePixelData(source && source.pixelData);

    if (!sheet || typeof sheet.getCells !== "function") {
      return;
    }

    sheet.getCells().forEach(function (cell) {
      if (cell && cell.w > 0 && cell.h > 0) {
        entries.push({
          id: String(source.id || "sheet") + "." + cell.name,
          cell: cell,
          pixelData: pixelData
        });
      }
    });
  });

  entries.sort(function (a, b) {
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });

  entries.forEach(function (entry) {
    var cell = entry.cell;

    if (cell.w > pageWidth || cell.h > pageHeight) {
      throw new Error("Tile sheet cell is larger than an atlas page: " + entry.id);
    }

    if (cursorX + cell.w > pageWidth) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }

    if (cursorY + cell.h > pageHeight) {
      page = PS.assets.TileSheetPacker.createPage(pages, pageWidth, pageHeight);
      cursorX = 0;
      cursorY = 0;
      rowHeight = 0;
    }

    PS.assets.TileSheetPacker.copyCellPixels(page, cursorX, cursorY, cell, entry.pixelData);
    cells[entry.id] = {
      id: entry.id,
      tileId: entry.id,
      pageIndex: page.pageIndex,
      x: cursorX,
      y: cursorY,
      w: cell.w,
      h: cell.h,
      sourceX: cell.x,
      sourceY: cell.y,
      filter: "nearest"
    };
    order.push(entry.id);
    cursorX += cell.w;
    rowHeight = Math.max(rowHeight, cell.h);
  });

  return {
    type: "tile-sheet-atlas",
    version: 1,
    pageWidth: pageWidth,
    pageHeight: pageHeight,
    filter: "nearest",
    pages: pages,
    cells: cells,
    order: order,
    stats: {
      pageCount: pages.length,
      cellCount: order.length,
      byteLength: pages.reduce(function (sum, atlasPage) {
        return sum + atlasPage.data.byteLength;
      }, 0)
    }
  };
};

PS.assets.TileSheetPacker.toManifest = function (atlas) {
  var source = atlas || {};
  var cells = {};

  Object.keys(source.cells || {}).forEach(function (tileId) {
    var cell = source.cells[tileId];

    cells[tileId] = {
      id: cell.id,
      tileId: cell.tileId,
      pageIndex: cell.pageIndex,
      rect: [cell.x, cell.y, cell.w, cell.h],
      sourceRect: [cell.sourceX || 0, cell.sourceY || 0, cell.w, cell.h],
      filter: cell.filter || "nearest"
    };
  });

  return {
    type: "tile-sheet-atlas",
    version: source.version || 1,
    pageWidth: source.pageWidth || 0,
    pageHeight: source.pageHeight || 0,
    filter: source.filter || "nearest",
    pages: (source.pages || []).map(function (page) {
      return {
        pageIndex: page.pageIndex,
        width: page.width,
        height: page.height,
        path: page.path || "",
        pixelData: page.pixelData || "",
        filter: page.filter || "nearest",
        version: page.version || 1
      };
    }),
    cells: cells,
    order: (source.order || []).slice(),
    stats: {
      pageCount: source.stats ? source.stats.pageCount : (source.pages || []).length,
      cellCount: source.stats ? source.stats.cellCount : Object.keys(cells).length,
      byteLength: source.stats ? source.stats.byteLength : 0
    }
  };
};

PS.assets.TileSheetPacker.fromManifest = function (manifest, pages) {
  var source = manifest || {};
  var runtimePages = pages || source.pages || [];
  var cells = {};

  Object.keys(source.cells || {}).forEach(function (tileId) {
    var cell = source.cells[tileId];
    var rect = cell.rect || [cell.x, cell.y, cell.w, cell.h];
    var sourceRect = cell.sourceRect || rect;

    cells[tileId] = {
      id: cell.id || tileId,
      tileId: cell.tileId || tileId,
      pageIndex: Number(cell.pageIndex) || 0,
      x: Number(rect[0]) || 0,
      y: Number(rect[1]) || 0,
      w: Number(rect[2]) || 0,
      h: Number(rect[3]) || 0,
      sourceX: Number(sourceRect[0]) || 0,
      sourceY: Number(sourceRect[1]) || 0,
      filter: cell.filter || source.filter || "nearest"
    };
  });

  return {
    type: "tile-sheet-atlas",
    version: source.version || 1,
    pageWidth: source.pageWidth || 0,
    pageHeight: source.pageHeight || 0,
    filter: source.filter || "nearest",
    pages: runtimePages,
    cells: cells,
    order: (source.order || Object.keys(cells)).slice(),
    stats: source.stats || {
      pageCount: runtimePages.length,
      cellCount: Object.keys(cells).length,
      byteLength: 0
    }
  };
};

PS.assets.TileSheet = function TileSheet(atlas) {
  this.reload(atlas || {});
  this._command = {
    tileId: "",
    pageIndex: 0,
    sourceX: 0,
    sourceY: 0,
    sourceW: 0,
    sourceH: 0,
    screenX: 0,
    screenY: 0,
    width: 0,
    height: 0,
    filter: "nearest"
  };
};

PS.assets.TileSheet.prototype.reload = function (atlas) {
  this.atlas = atlas || {};
  this.pages = this.atlas.pages || [];
  this.cells = this.atlas.cells || {};
  this.version = (Number(this.version) || 0) + 1;

  if (PS.events && PS.events.types && PS.events.types.ATLAS_REBUILT && typeof PS.events.emit === "function") {
    PS.events.emit(PS.events.types.ATLAS_REBUILT, {
      atlasId: this.atlas.id || "tile-sheet",
      textureWidth: this.atlas.pageWidth || (this.pages[0] && this.pages[0].width) || 0,
      textureHeight: this.atlas.pageHeight || (this.pages[0] && this.pages[0].height) || 0,
      entryCount: Object.keys(this.cells).length,
      version: this.version
    });
  }

  return this;
};

PS.assets.TileSheet.prototype.getCell = function (tileId) {
  return this.cells[String(tileId || "")] || null;
};

PS.assets.TileSheet.prototype.render = function (renderer, tileId, screenX, screenY, scale) {
  var cell = this.getCell(tileId);
  var command = this._command;
  var pixelScale = Math.max(1, Math.round(Number(scale) || 1));

  if (!cell) {
    return null;
  }

  command.tileId = cell.tileId;
  command.pageIndex = cell.pageIndex;
  command.sourceX = cell.x;
  command.sourceY = cell.y;
  command.sourceW = cell.w;
  command.sourceH = cell.h;
  command.screenX = Math.round(Number(screenX) || 0);
  command.screenY = Math.round(Number(screenY) || 0);
  command.width = cell.w * pixelScale;
  command.height = cell.h * pixelScale;
  command.filter = "nearest";

  if (renderer && typeof renderer.drawTileSheetCell === "function") {
    renderer.drawTileSheetCell(this, command);
  }

  return command;
};
