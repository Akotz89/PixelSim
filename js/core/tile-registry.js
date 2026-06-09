"use strict";
PS.core = PS.core || {};

PS.core.TileRegistry = PS.core.TileRegistry || {
  types: new Map(),
  biomeIndex: new Map(),

  requiredFields: [
    "id",
    "name",
    "category",
    "biome",
    "spriteSheet",
    "variants",
    "walkable",
    "buildable",
    "growable",
    "waterDepth",
    "elevation",
    "baseFertility",
    "baseColor",
    "minimapColor",
    "transitionPriority"
  ],

  loadFromJSON: function (data) {
    var tiles = Array.isArray(data) ? data : data && data.tiles;
    var i;

    if (!Array.isArray(tiles)) {
      throw new Error("TileRegistry.loadFromJSON expects an array or { tiles: [] }");
    }

    this.clear();

    for (i = 0; i < tiles.length; i += 1) {
      this.register(tiles[i].id, tiles[i]);
    }

    return this.list();
  },

  clear: function () {
    this.types.clear();
    this.biomeIndex.clear();
  },

  register: function (id, definition) {
    var tileId = String(id || "").trim();
    var normalized;
    var biomeTiles;

    if (!tileId) {
      throw new Error("TileRegistry.register requires an id");
    }

    normalized = this.validate(Object.assign({}, definition, { id: tileId }));

    this.types.set(tileId, normalized);

    biomeTiles = this.biomeIndex.get(normalized.biome);
    if (!biomeTiles) {
      biomeTiles = [];
      this.biomeIndex.set(normalized.biome, biomeTiles);
    }
    biomeTiles.push(normalized);

    return normalized;
  },

  get: function (id) {
    return this.types.get(String(id || "")) || null;
  },

  getByBiome: function (biome) {
    var matches = this.biomeIndex.get(String(biome || "")) || [];
    return matches.slice();
  },

  getSpriteId: function (id, variant) {
    var tile = this.get(id);
    var variantIndex = Number(variant) || 0;

    if (!tile) {
      return null;
    }

    if (variantIndex < 0 || variantIndex >= tile.variants) {
      throw new Error("Sprite variant " + variantIndex + " is outside " + tile.id + " variants");
    }

    return tile.spriteSheet.replace(/\//g, ".") + "." + variantIndex;
  },

  list: function () {
    return Array.from(this.types.values());
  },

  validate: function (definition) {
    var i;
    var field;
    var normalized;

    if (!definition || typeof definition !== "object") {
      throw new Error("Tile definition must be an object");
    }

    for (i = 0; i < this.requiredFields.length; i += 1) {
      field = this.requiredFields[i];
      if (definition[field] === undefined || definition[field] === null || definition[field] === "") {
        throw new Error("Tile definition " + (definition.id || "<unknown>") + " missing required field: " + field);
      }
    }

    if (!Number.isInteger(definition.variants) || definition.variants < 1) {
      throw new Error("Tile definition " + definition.id + " variants must be a positive integer");
    }

    ["walkable", "buildable", "growable"].forEach(function (flag) {
      if (typeof definition[flag] !== "boolean") {
        throw new Error("Tile definition " + definition.id + " " + flag + " must be boolean");
      }
    });

    if (typeof definition.waterDepth !== "number" || definition.waterDepth < 0) {
      throw new Error("Tile definition " + definition.id + " waterDepth must be a non-negative number");
    }

    if (!definition.elevation || typeof definition.elevation.min !== "number" || typeof definition.elevation.max !== "number") {
      throw new Error("Tile definition " + definition.id + " elevation must include numeric min and max");
    }

    if (definition.elevation.min > definition.elevation.max) {
      throw new Error("Tile definition " + definition.id + " elevation min cannot exceed max");
    }

    if (typeof definition.baseFertility !== "number" || definition.baseFertility < 0 || definition.baseFertility > 1) {
      throw new Error("Tile definition " + definition.id + " baseFertility must be between 0 and 1");
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(definition.baseColor)) {
      throw new Error("Tile definition " + definition.id + " baseColor must be #rrggbb");
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(definition.minimapColor)) {
      throw new Error("Tile definition " + definition.id + " minimapColor must be #rrggbb");
    }

    if (!Number.isInteger(definition.transitionPriority)) {
      throw new Error("Tile definition " + definition.id + " transitionPriority must be an integer");
    }

    normalized = Object.assign({}, definition);
    normalized.elevation = Object.assign({}, definition.elevation);
    normalized.sounds = Object.assign({}, definition.sounds || {});
    return normalized;
  }
};
