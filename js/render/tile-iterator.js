import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

// Zero-allocation visible-tile cursor for render passes. begin()/onScreenTiles()
// configure bounds once; next() only mutates scalar fields on the same object.

PS.render = PS.render || {};

PS.render.RenderIterator = function RenderIterator() {
  this.tx = 0;
  this.ty = 0;
  this.screenX = 0;
  this.screenY = 0;
  this.tileIndex = 0;
  this.ranValue = 0;
  this.tx1 = 0;
  this.ty1 = 0;
  this.tx2 = 0;
  this.ty2 = 0;
  this._cameraX = 0;
  this._cameraY = 0;
  this._zoom = 1;
  this._tileSize = 32;
  this._worldW = 1;
  this._worldH = 1;
  this._started = false;
};

PS.render.RenderIterator.prototype.configure = function (tx1, ty1, tx2, ty2, cameraX, cameraY, zoom) {
  var tileSize = Math.max(1, Number(typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 32) || 32);
  var worldW = Math.max(1, Math.round(Number(typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 1) || 1));
  var worldH = Math.max(1, Math.round(Number(typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 1) || 1));

  this._cameraX = Number(cameraX) || 0;
  this._cameraY = Number(cameraY) || 0;
  this._zoom = Math.max(0.01, Number(zoom) || 1);
  this._tileSize = tileSize;
  this._worldW = worldW;
  this._worldH = worldH;
  this.tx1 = Math.floor(Number(tx1) || 0);
  this.ty1 = Math.max(0, Math.floor(Number(ty1) || 0));
  this.tx2 = Math.ceil(Number(tx2) || 0);
  this.ty2 = Math.min(worldH - 1, Math.ceil(Number(ty2) || 0));

  if (this.ty1 > this.ty2) {
    this.tx1 = 0;
    this.tx2 = -1;
  }

  this.tx = this.tx1 - 1;
  this.ty = this.ty1;
  this.screenX = 0;
  this.screenY = 0;
  this.tileIndex = 0;
  this.ranValue = 0;
  this._started = this.tx1 <= this.tx2 && this.ty1 <= this.ty2;
  return this;
};

PS.render.RenderIterator.prototype.begin = function (cameraX, cameraY, zoom, canvasW, canvasH, padLeft, padRight, padTop, padBottom) {
  var tileSize = Math.max(1, Number(typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 32) || 32);
  var z = Math.max(0.01, Number(zoom) || 1);
  var scaledTile = tileSize * z;
  var tilesVisibleX = Math.ceil((Number(canvasW) || 800) / scaledTile) + 2;
  var tilesVisibleY = Math.ceil((Number(canvasH) || 600) / scaledTile) + 2;
  var centerTileX = Math.floor((Number(cameraX) || 0) / tileSize);
  var centerTileY = Math.floor((Number(cameraY) || 0) / tileSize);

  return this.configure(
    centerTileX - Math.floor(tilesVisibleX / 2) - Math.max(0, Math.round(Number(padLeft) || 0)),
    centerTileY - Math.floor(tilesVisibleY / 2) - Math.max(0, Math.round(Number(padTop) || 0)),
    centerTileX + Math.ceil(tilesVisibleX / 2) + Math.max(0, Math.round(Number(padRight) || 0)),
    centerTileY + Math.ceil(tilesVisibleY / 2) + Math.max(0, Math.round(Number(padBottom) || 0)),
    cameraX,
    cameraY,
    z
  );
};

PS.render.RenderIterator.prototype.onScreenTiles = function (padLeft, padRight, padTop, padBottom) {
  var rect = PS.camera && PS.camera.unified && typeof PS.camera.unified.getVisibleTileRect === "function"
    ? PS.camera.unified.getVisibleTileRect()
    : null;
  var state = PS.camera && PS.camera.unified && typeof PS.camera.unified.getState === "function"
    ? PS.camera.unified.getState()
    : {};
  var left = Math.max(0, Math.round(Number(padLeft) || 0));
  var right = Math.max(0, Math.round(Number(padRight) || 0));
  var top = Math.max(0, Math.round(Number(padTop) || 0));
  var bottom = Math.max(0, Math.round(Number(padBottom) || 0));

  if (!rect) {
    return this.begin(state.x || 0, state.y || 0, state.zoom || 1, state.viewportW || 800, state.viewportH || 600, left, right, top, bottom);
  }

  return this.configure(
    Number(rect.minX) - left,
    Number(rect.minY) - top,
    Number(rect.maxX) + right,
    Number(rect.maxY) + bottom,
    state.x || 0,
    state.y || 0,
    state.zoom || 1
  );
};

PS.render.RenderIterator.prototype.next = function () {
  var wrappedX;

  if (!this._started) { return false; }

  this.tx += 1;
  if (this.tx > this.tx2) {
    this.tx = this.tx1;
    this.ty += 1;
    if (this.ty > this.ty2) {
      this._started = false;
      return false;
    }
  }

  wrappedX = this.wrappedTx();
  this.tileIndex = this.ty * this._worldW + wrappedX;
  this.ranValue = PS.ranmap && PS.ranmap.data ? PS.ranmap.get(wrappedX, this.ty) : 0;
  this.screenX = (this.tx * this._tileSize - this._cameraX) * this._zoom;
  this.screenY = (this.ty * this._tileSize - this._cameraY) * this._zoom;

  return true;
};

PS.render.RenderIterator.prototype.has = function () {
  return this._started;
};

PS.render.RenderIterator.prototype.wrappedTx = function () {
  var x = this.tx % this._worldW;
  return x < 0 ? x + this._worldW : x;
};

PS.render.RenderIterator.prototype.getTileCount = function () {
  var w = this.tx2 - this.tx1 + 1;
  var h = this.ty2 - this.ty1 + 1;
  return Math.max(0, w * h);
};

PS.render.RenderIterator.prototype.ran = function () {
  return this.ranValue;
};

PS.render.RenderIterator.prototype.tile = function () {
  return this.tileIndex;
};

PS.render.RenderIterator.prototype.x = function () {
  return this.screenX;
};

PS.render.RenderIterator.prototype.y = function () {
  return this.screenY;
};

PS.render.RenderIterator.prototype.getStats = function () {
  return {
    viewportTiles: this.getTileCount(),
    range: {
      x: [this.tx1, this.tx2],
      y: [this.ty1, this.ty2]
    }
  };
};

PS.tileIterator = PS.tileIterator instanceof PS.render.RenderIterator
  ? PS.tileIterator
  : new PS.render.RenderIterator();

PS.render.tileIterator = PS.tileIterator;
PS.render.onScreenTiles = function (padLeft, padRight, padTop, padBottom) {
  return PS.tileIterator.onScreenTiles(padLeft, padRight, padTop, padBottom);
};
