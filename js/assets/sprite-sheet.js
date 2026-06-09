"use strict";
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
  return {
    name: name,
    x: Number(frame.x) || 0,
    y: Number(frame.y) || 0,
    w: Number(frame.w) || Number(frame.width) || 0,
    h: Number(frame.h) || Number(frame.height) || 0,
    image: image
  };
};

PS.assets.SpriteSheet._fromFrames = function (image, frames, format) {
  var cells = {};
  var order = [];

  Object.keys(frames || {}).forEach(function (name) {
    var entry = frames[name] || {};
    var frame = entry.frame || entry;
    var cell = PS.assets.SpriteSheet._makeCell(image, name, frame);

    cells[name] = cell;
    order.push(name);
  });

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
      image: image
    };
    order.push(name);
  }

  return new PS.assets.SpriteSheet(image, cells, order, {}, "grid");
};

PS.assets.SpriteSheet.fromTexturePacker = function (image, json) {
  return PS.assets.SpriteSheet._fromFrames(image, json && json.frames, "texturepacker");
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
