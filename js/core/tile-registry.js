"use strict";
PS.core = PS.core || {};

PS.core.TerrainType = PS.core.TerrainType || function (definition) {
  this.definition = Object.assign({}, definition || {});
  this.id = this.definition.id;
  this.name = this.definition.name || this.id;
  this.kind = this.definition.terrainKind || this.inferKind(this.definition);
  this.category = this.definition.category || "terrain";
};

PS.core.TerrainType.BITS = {
  NW: 1,
  N: 2,
  NE: 4,
  E: 8,
  SE: 16,
  S: 32,
  SW: 64,
  W: 128
};

PS.core.TerrainType.prototype.inferKind = function (definition) {
  var id = String(definition.id || "");

  if (definition.waterDepth >= 0.85) {
    return "water-deep";
  }
  if (definition.waterDepth > 0) {
    return "water-shallow";
  }
  if (id.indexOf("cliff") >= 0) {
    return "mountain-wall";
  }
  if (id.indexOf("rock") >= 0 || id.indexOf("volcanic") >= 0) {
    return "mountain";
  }
  if (id.indexOf("forest") >= 0 || id.indexOf("lichen") >= 0 || id.indexOf("wetland") >= 0 || id.indexOf("marsh") >= 0 || id.indexOf("reed") >= 0) {
    return "growable";
  }
  if (id.indexOf("sand") >= 0) {
    return "sand";
  }
  if (id.indexOf("snow") >= 0 || id.indexOf("ice") >= 0) {
    return "cold";
  }
  return "ground";
};

PS.core.TerrainType.prototype.createRenderOp = function (layer, context) {
  var tile = context && context.tile ? context.tile : this.definition;
  return {
    terrainType: this.id,
    kind: this.kind,
    layer: layer,
    spriteSheet: tile.spriteSheet,
    variantCount: tile.variants,
    color: tile.baseColor
  };
};

PS.core.TerrainType.prototype.renderBelow = function (context) {
  if (this.definition.waterDepth > 0) {
    return this.createRenderOp("below", context);
  }
  return null;
};

PS.core.TerrainType.prototype.renderMid = function (context) {
  if (this.kind === "mountain-wall") {
    return null;
  }
  return this.createRenderOp("mid", context);
};

PS.core.TerrainType.prototype.renderAbove = function (context) {
  if (this.kind === "mountain-wall" || this.kind === "mountain" || this.kind === "growable") {
    return this.createRenderOp("above", context);
  }
  return null;
};

PS.core.TerrainType.prototype.getTileId = function (tileX, tileY, grid) {
  var width;
  var tile;
  var index;

  if (!grid) {
    return null;
  }

  if (typeof grid.getTileId === "function") {
    return grid.getTileId(tileX, tileY);
  }

  if (typeof grid.get === "function") {
    tile = grid.get(tileX, tileY);
    return typeof tile === "string" ? tile : tile && (tile.id || tile.tileId || tile.type);
  }

  width = Number(grid.width) || 0;
  if (Array.isArray(grid.tiles) && width > 0 && tileX >= 0 && tileY >= 0 && tileX < width) {
    index = tileY * width + tileX;
    tile = grid.tiles[index];
    return typeof tile === "string" ? tile : tile && (tile.id || tile.tileId || tile.type);
  }

  return null;
};

PS.core.TerrainType.prototype.matchesAutotileNeighbor = function (neighborId, registry) {
  var neighbor;
  var neighborType;

  if (!neighborId) {
    return false;
  }

  if (neighborId === this.id) {
    return true;
  }

  neighbor = registry && typeof registry.get === "function" ? registry.get(neighborId) : null;
  neighborType = registry && typeof registry.getTerrainType === "function" ? registry.getTerrainType(neighborId) : null;

  if (!neighbor || !neighborType) {
    return false;
  }

  if (this.definition.waterDepth > 0 || neighbor.waterDepth > 0) {
    return this.definition.waterDepth > 0 && neighbor.waterDepth > 0;
  }

  if (this.kind === "mountain" || this.kind === "mountain-wall") {
    return neighborType.kind === "mountain" || neighborType.kind === "mountain-wall";
  }

  return neighborType.kind === this.kind && neighbor.biome === this.definition.biome;
};

PS.core.TerrainType.prototype.computeAutotileMask = function (tileX, tileY, grid, registry) {
  var bits = PS.core.TerrainType.BITS;
  var offsets = [
    { dx: -1, dy: -1, bit: bits.NW },
    { dx: 0, dy: -1, bit: bits.N },
    { dx: 1, dy: -1, bit: bits.NE },
    { dx: 1, dy: 0, bit: bits.E },
    { dx: 1, dy: 1, bit: bits.SE },
    { dx: 0, dy: 1, bit: bits.S },
    { dx: -1, dy: 1, bit: bits.SW },
    { dx: -1, dy: 0, bit: bits.W }
  ];
  var mask = 0;
  var i;

  for (i = 0; i < offsets.length; i += 1) {
    if (this.matchesAutotileNeighbor(this.getTileId(tileX + offsets[i].dx, tileY + offsets[i].dy, grid), registry)) {
      mask |= offsets[i].bit;
    }
  }

  return mask;
};

PS.core.TerrainType.prototype.getMinimapColor = function () {
  return this.definition.minimapColor;
};

PS.core.TerrainType.prototype.isPathable = function (actor) {
  if (!this.definition.walkable) {
    return false;
  }
  if (this.definition.waterDepth > 0 && !(actor && actor.canTraverseWater)) {
    return false;
  }
  return true;
};

PS.core.TerrainType.prototype.canPlace = function (placement) {
  if (placement && placement.requiresGrowable) {
    return !!this.definition.growable;
  }
  return !!this.definition.buildable;
};

PS.core.TerrainType.prototype.getClearingCost = function () {
  if (this.definition.clearingCost !== undefined) {
    return this.definition.clearingCost;
  }
  if (!this.definition.walkable && !this.definition.buildable) {
    return Infinity;
  }
  if (this.kind === "mountain" || this.kind === "mountain-wall") {
    return 8;
  }
  if (this.kind === "growable") {
    return 5;
  }
  if (this.definition.waterDepth > 0) {
    return 6;
  }
  if (!this.definition.buildable) {
    return 3;
  }
  return 1;
};

PS.core.TerrainType.subtypeConstructors = PS.core.TerrainType.subtypeConstructors || new Map();

PS.core.TerrainType.createSubtypeConstructor = function (definition) {
  var subtypeId = String(definition.id || "");
  var existing = PS.core.TerrainType.subtypeConstructors.get(subtypeId);
  var Subtype;

  if (existing) {
    return existing;
  }

  Subtype = function (tileDefinition) {
    PS.core.TerrainType.call(this, tileDefinition);
    this.subtypeId = subtypeId;
  };

  Subtype.prototype = Object.create(PS.core.TerrainType.prototype);
  Subtype.prototype.constructor = Subtype;
  Subtype.prototype.subtypeId = subtypeId;
  Subtype.prototype.renderBelow = function (context) {
    return PS.core.TerrainType.prototype.renderBelow.call(this, context);
  };
  Subtype.prototype.renderMid = function (context) {
    return PS.core.TerrainType.prototype.renderMid.call(this, context);
  };
  Subtype.prototype.renderAbove = function (context) {
    return PS.core.TerrainType.prototype.renderAbove.call(this, context);
  };
  Subtype.prototype.computeAutotileMask = function (tileX, tileY, grid, registry) {
    return PS.core.TerrainType.prototype.computeAutotileMask.call(this, tileX, tileY, grid, registry);
  };
  Subtype.prototype.getMinimapColor = function (context) {
    return PS.core.TerrainType.prototype.getMinimapColor.call(this, context);
  };
  Subtype.prototype.isPathable = function (actor, context) {
    return PS.core.TerrainType.prototype.isPathable.call(this, actor, context);
  };
  Subtype.prototype.canPlace = function (placement, context) {
    return PS.core.TerrainType.prototype.canPlace.call(this, placement, context);
  };
  Subtype.prototype.getClearingCost = function (context) {
    return PS.core.TerrainType.prototype.getClearingCost.call(this, context);
  };

  PS.core.TerrainType.subtypeConstructors.set(subtypeId, Subtype);
  return Subtype;
};

PS.core.TerrainType.create = function (definition) {
  var Subtype = PS.core.TerrainType.createSubtypeConstructor(definition);
  return new Subtype(definition);
};

PS.core.TileRegistry = PS.core.TileRegistry || {
  types: new Map(),
  biomeIndex: new Map(),
  terrainTypes: new Map(),

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
    this.terrainTypes.clear();
  },

  register: function (id, definition) {
    var tileId = String(id || "").trim();
    var normalized;
    var biomeTiles;
    var terrainType;

    if (!tileId) {
      throw new Error("TileRegistry.register requires an id");
    }

    normalized = this.validate(Object.assign({}, definition, { id: tileId }));

    this.types.set(tileId, normalized);
    terrainType = PS.core.TerrainType.create(normalized);
    this.terrainTypes.set(tileId, terrainType);
    normalized.terrainType = terrainType;

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

  getTerrainType: function (id) {
    return this.terrainTypes.get(String(id || "")) || null;
  },

  listTerrainTypes: function () {
    return Array.from(this.terrainTypes.values());
  },

  getAutotileMask: function (id, tileX, tileY, grid) {
    var terrainType = this.getTerrainType(id);
    return terrainType ? terrainType.computeAutotileMask(tileX, tileY, grid, this) : 0;
  },

  getMinimapColor: function (id, context) {
    var terrainType = this.getTerrainType(id);
    return terrainType ? terrainType.getMinimapColor(context) : null;
  },

  isPathable: function (id, actor, context) {
    var terrainType = this.getTerrainType(id);
    return terrainType ? terrainType.isPathable(actor, context) : false;
  },

  canPlace: function (id, placement, context) {
    var terrainType = this.getTerrainType(id);
    return terrainType ? terrainType.canPlace(placement, context) : false;
  },

  getClearingCost: function (id, context) {
    var terrainType = this.getTerrainType(id);
    return terrainType ? terrainType.getClearingCost(context) : Infinity;
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
