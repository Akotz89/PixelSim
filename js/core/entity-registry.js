import { PS } from "./namespace.js";

PS.core = PS.core || {};

PS.core.EntityRegistry = PS.core.EntityRegistry || {
  types: new Map(),
  categoryIndex: new Map(),

  loadFromJSON: function (data) {
    var categories = data || {};
    var categoryNames = Object.keys(categories).filter(function (key) {
      return key !== "version";
    });
    var i;
    var category;
    var definitions;
    var ids;
    var id;

    this.clear();

    for (i = 0; i < categoryNames.length; i += 1) {
      category = categoryNames[i];
      definitions = categories[category];
      ids = definitions && typeof definitions === "object" ? Object.keys(definitions) : [];

      for (var j = 0; j < ids.length; j += 1) {
        id = ids[j];
        this.register(id, Object.assign({}, definitions[id], { category: category }));
      }
    }

    return this.list();
  },

  clear: function () {
    this.types.clear();
    this.categoryIndex.clear();
  },

  register: function (id, definition) {
    var entityId = String(id || "").trim();
    var normalized;
    var categoryList;

    if (!entityId) {
      throw new Error("EntityRegistry.register requires an id");
    }

    normalized = this.validate(Object.assign({}, definition, { id: entityId }));
    this.types.set(entityId, normalized);

    categoryList = this.categoryIndex.get(normalized.category);
    if (!categoryList) {
      categoryList = [];
      this.categoryIndex.set(normalized.category, categoryList);
    }
    categoryList.push(normalized);

    return normalized;
  },

  get: function (id) {
    return this.types.get(String(id || "")) || null;
  },

  getByCategory: function (category) {
    var matches = this.categoryIndex.get(String(category || "")) || [];
    return matches.slice();
  },

  getSpriteSheet: function (id) {
    var entity = this.get(id);
    return entity ? entity.spriteSheet : null;
  },

  getTraitDefaults: function (id) {
    var entity = this.get(id);
    return entity ? Object.assign({}, entity.traitDefaults || {}) : {};
  },

  list: function () {
    return Array.from(this.types.values());
  },

  validate: function (definition) {
    var normalized;

    if (!definition || typeof definition !== "object") {
      throw new Error("Entity definition must be an object");
    }

    ["id", "name", "category", "spriteSheet"].forEach(function (field) {
      if (definition[field] === undefined || definition[field] === null || definition[field] === "") {
        throw new Error("Entity definition " + (definition.id || "<unknown>") + " missing required field: " + field);
      }
    });

    if (definition.spawnBiomes !== undefined && !Array.isArray(definition.spawnBiomes)) {
      throw new Error("Entity definition " + definition.id + " spawnBiomes must be an array");
    }

    if (definition.traitDefaults !== undefined && (typeof definition.traitDefaults !== "object" || Array.isArray(definition.traitDefaults))) {
      throw new Error("Entity definition " + definition.id + " traitDefaults must be an object");
    }

    if (definition.traitRanges !== undefined && (typeof definition.traitRanges !== "object" || Array.isArray(definition.traitRanges))) {
      throw new Error("Entity definition " + definition.id + " traitRanges must be an object");
    }

    normalized = Object.assign({}, definition);
    normalized.animations = Object.assign({}, definition.animations || {});
    normalized.traitDefaults = Object.assign({}, definition.traitDefaults || {});
    normalized.traitRanges = Object.assign({}, definition.traitRanges || {});
    normalized.spawnBiomes = Array.isArray(definition.spawnBiomes) ? definition.spawnBiomes.slice() : [];
    return normalized;
  }
};
