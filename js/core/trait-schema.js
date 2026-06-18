"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "./namespace.js";
import { clamp } from "./utils.js";

PS.core = PS.core || {};
PS.bio = PS.bio || {};

PS.core.traitSchema = (function() {
  var definitions = [
    { key: "vision", configPrefix: "TRAIT_VISION", constant: "TRAIT_VISION" },
    { key: "metabolism", configPrefix: "TRAIT_METABOLISM", constant: "TRAIT_METABOLISM" },
    { key: "reproductionEnergy", configPrefix: "TRAIT_REPRODUCTION_ENERGY", constant: "TRAIT_REPRODUCTION_ENERGY", aliases: ["reproduction_energy"] },
    { key: "movementTendency", configPrefix: "TRAIT_MOVEMENT_TENDENCY", constant: "TRAIT_MOVEMENT_TENDENCY", aliases: ["movement_tendency"] },
    { key: "terrainAffinity", configPrefix: "TRAIT_TERRAIN_AFFINITY", constant: "TRAIT_TERRAIN_AFFINITY", aliases: ["terrain_affinity"] },
    { key: "intelligence", configPrefix: "TRAIT_INTELLIGENCE", constant: "TRAIT_INTELLIGENCE" },
    { key: "sociality", configPrefix: "TRAIT_SOCIALITY", constant: "TRAIT_SOCIALITY" },
    { key: "carnivory", configPrefix: "TRAIT_CARNIVORY", constant: "TRAIT_CARNIVORY" },
    { key: "bodySize", configPrefix: "TRAIT_BODY_SIZE", constant: "TRAIT_BODY_SIZE", aliases: ["size", "body_size"] },
    { key: "limbCount", configPrefix: "TRAIT_LIMB_COUNT", constant: "TRAIT_LIMB_COUNT", aliases: ["limb_count"], integer: true },
    { key: "bodyShape", configPrefix: "TRAIT_BODY_SHAPE", constant: "TRAIT_BODY_SHAPE", aliases: ["body_shape"], integer: true },
    { key: "appendageType", configPrefix: "TRAIT_APPENDAGE_TYPE", constant: "TRAIT_APPENDAGE_TYPE", aliases: ["appendage_type"], integer: true },
    { key: "camouflage", configPrefix: "TRAIT_CAMOUFLAGE", constant: "TRAIT_CAMOUFLAGE" },
    { key: "thermalTolerance", configPrefix: "TRAIT_THERMAL_TOLERANCE", constant: "TRAIT_THERMAL_TOLERANCE", aliases: ["thermal_tolerance"] },
    { key: "waterDependency", configPrefix: "TRAIT_WATER_DEPENDENCY", constant: "TRAIT_WATER_DEPENDENCY", aliases: ["water_dependency"] }
  ];
  var offsets = {};
  var aliases = {};

  function cloneDefinition(definition) {
    return Object.assign({}, definition);
  }

  function refreshMetadata() {
    offsets = {};
    aliases = {};

    for (var i = 0; i < definitions.length; i++) {
      var definition = definitions[i];
      var offset = i;
      var constantName = definition.constant || ("TRAIT_" + String(definition.key).replace(/[A-Z]/g, function(match) {
        return "_" + match;
      }).toUpperCase());

      offsets[definition.key] = offset;
      aliases[definition.key] = definition.key;
      PS.bio[constantName] = offset;

      if (Array.isArray(definition.aliases)) {
        for (var aliasIndex = 0; aliasIndex < definition.aliases.length; aliasIndex++) {
          aliases[definition.aliases[aliasIndex]] = definition.key;
        }
      }
    }

    PS.bio.TRAIT_STRIDE = definitions.length;
  }

  function getConfigValue(definition, suffix) {
    var key = definition.configPrefix + "_" + suffix;
    return CONFIG[key];
  }

  function getMutationStep(definition) {
    return Number(getConfigValue(definition, "MUTATION_STEP")) || 0;
  }

  function getMutationRates() {
    var rates = {};

    for (var i = 0; i < definitions.length; i++) {
      rates[definitions[i].key] = getMutationStep(definitions[i]);
    }

    return rates;
  }

  function syncEvolutionConfig() {
    if (!PS.config) {
      return;
    }

    PS.config.evolution = PS.config.evolution || {};
    PS.config.evolution.mutationChance = CONFIG.TRAIT_MUTATION_CHANCE;
    PS.config.evolution.mutationRates = getMutationRates();
  }

  function normalizeKey(key) {
    return aliases[String(key || "")] || String(key || "");
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

  function normalizeTraitValue(key, value) {
    var normalizedKey = normalizeKey(key);

    for (var i = 0; i < definitions.length; i++) {
      if (definitions[i].key === normalizedKey) {
        return normalizeValue(definitions[i], value);
      }
    }

    return Number(value) || 0;
  }

  function normalize(traits) {
    var target = traits || {};
    var key;

    for (key in target) {
      if (
        Object.prototype.hasOwnProperty.call(target, key) &&
        aliases[key] &&
        aliases[key] !== key &&
        target[aliases[key]] === undefined
      ) {
        target[aliases[key]] = target[key];
      }
    }

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

  refreshMetadata();
  syncEvolutionConfig();

  return {
    register: function(definition) {
      if (!definition || !definition.key || !definition.configPrefix) {
        throw new Error("Trait schema entries require key and configPrefix");
      }

      definitions.push(cloneDefinition(definition));
      refreshMetadata();
      syncEvolutionConfig();
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

    getOffset: function(key) {
      var normalizedKey = normalizeKey(key);
      return Object.prototype.hasOwnProperty.call(offsets, normalizedKey) ? offsets[normalizedKey] : -1;
    },

    getOffsets: function() {
      return Object.assign({}, offsets);
    },

    getStride: function() {
      return PS.bio.TRAIT_STRIDE;
    },

    getAliases: function() {
      return Object.assign({}, aliases);
    },

    getMutationRates: getMutationRates,
    normalizeTraitValue: normalizeTraitValue,

    normalize: normalize,
    copy: copy,
    restore: copy
  };
})();
