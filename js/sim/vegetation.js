"use strict";
PS.vegetation = PS.vegetation || {
  TYPES: {
    NONE: 0,
    TREE_SMALL: 1,
    TREE_MEDIUM: 2,
    TREE_BIG: 3,
    BUSH: 4,
    FLOWER: 5,
    MUSHROOM: 6,
    ROCK: 7,
    GRASS_TUFT: 8
  },
  width: 0,
  height: 0,
  data: null,

  init: function (width, height) {
    this.width = Math.max(1, Math.round(Number(width) || (typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 1)));
    this.height = Math.max(1, Math.round(Number(height) || (typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 1)));
    this.data = new Uint8Array(this.width * this.height);
    return this;
  },

  ensure: function () {
    if (!this.data) {
      this.init();
    }

    return this;
  },

  wrapX: function (x) {
    this.ensure();
    var ix = Math.round(Number(x) || 0) % this.width;
    return ix < 0 ? ix + this.width : ix;
  },

  clampY: function (y) {
    this.ensure();
    var iy = Math.round(Number(y) || 0);
    return iy < 0 ? 0 : (iy >= this.height ? this.height - 1 : iy);
  },

  tileIndex: function (x, y) {
    this.ensure();
    return this.clampY(y) * this.width + this.wrapX(x);
  },

  pack: function (type, variant) {
    var packedType = Math.max(0, Math.min(15, Math.round(Number(type) || 0)));
    var packedVariant = Math.max(0, Math.min(15, Math.round(Number(variant) || 0)));
    return (packedVariant << 4) | packedType;
  },

  unpack: function (value) {
    var packed = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
    return {
      type: packed & 15,
      variant: (packed >> 4) & 15
    };
  },

  get: function (tx, ty) {
    this.ensure();
    return this.unpack(this.data[this.tileIndex(tx, ty)]);
  },

  getType: function (tx, ty) {
    this.ensure();
    return this.data[this.tileIndex(tx, ty)] & 15;
  },

  set: function (tx, ty, type, variant) {
    this.ensure();
    this.data[this.tileIndex(tx, ty)] = this.pack(type, variant);
    return this.get(tx, ty);
  },

  clear: function (tx, ty) {
    this.ensure();
    this.data[this.tileIndex(tx, ty)] = 0;
    return this.get(tx, ty);
  }
};
