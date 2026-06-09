PS.core = PS.core || {};

PS.core.traitSchema = (function() {
  var definitions = [
    { key: "vision", configPrefix: "TRAIT_VISION" },
    { key: "metabolism", configPrefix: "TRAIT_METABOLISM" },
    { key: "reproductionEnergy", configPrefix: "TRAIT_REPRODUCTION_ENERGY" },
    { key: "movementTendency", configPrefix: "TRAIT_MOVEMENT_TENDENCY" },
    { key: "terrainAffinity", configPrefix: "TRAIT_TERRAIN_AFFINITY" },
    { key: "intelligence", configPrefix: "TRAIT_INTELLIGENCE" },
    { key: "sociality", configPrefix: "TRAIT_SOCIALITY" },
    { key: "bodySize", configPrefix: "TRAIT_BODY_SIZE" },
    { key: "limbCount", configPrefix: "TRAIT_LIMB_COUNT", integer: true },
    { key: "bodyShape", configPrefix: "TRAIT_BODY_SHAPE", integer: true },
    { key: "appendageType", configPrefix: "TRAIT_APPENDAGE_TYPE", integer: true },
    { key: "camouflage", configPrefix: "TRAIT_CAMOUFLAGE" },
    { key: "thermalTolerance", configPrefix: "TRAIT_THERMAL_TOLERANCE" },
    { key: "waterDependency", configPrefix: "TRAIT_WATER_DEPENDENCY" }
  ];

  function cloneDefinition(definition) {
    return Object.assign({}, definition);
  }

  function getConfigValue(definition, suffix) {
    var key = definition.configPrefix + "_" + suffix;
    return CONFIG[key];
  }

  function normalizeValue(definition, value) {
    var numberValue = Number(value);
    var fallback = getConfigValue(definition, "DEFAULT");
    var minValue = getConfigValue(definition, "MIN");
    var maxValue = getConfigValue(definition, "MAX");

    if (!Number.isFinite(numberValue)) {
      numberValue = fallback;
    }

    if (definition.integer) {
      numberValue = Math.round(numberValue);
    }

    return clamp(numberValue, minValue, maxValue);
  }

  function normalize(traits) {
    var target = traits || {};

    for (var i = 0; i < definitions.length; i++) {
      target[definitions[i].key] = normalizeValue(definitions[i], target[definitions[i].key]);
    }

    return target;
  }

  function copy(traits) {
    var normalized = normalize(Object.assign({}, traits || {}));
    var copied = {};

    for (var i = 0; i < definitions.length; i++) {
      copied[definitions[i].key] = normalized[definitions[i].key];
    }

    return copied;
  }

  return {
    register: function(definition) {
      if (!definition || !definition.key || !definition.configPrefix) {
        throw new Error("Trait schema entries require key and configPrefix");
      }

      definitions.push(cloneDefinition(definition));
      return cloneDefinition(definition);
    },

    getDefinitions: function() {
      return definitions.map(cloneDefinition);
    },

    getKeys: function() {
      return definitions.map(function(definition) {
        return definition.key;
      });
    },

    normalize: normalize,
    copy: copy,
    restore: copy
  };
})();
