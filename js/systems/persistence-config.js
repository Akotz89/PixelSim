"use strict";
PS.systems = PS.systems || {};

PS.systems.persistenceConfig = (function() {
  var schemaVersion = 1;
  var sanitizers = {
    DEFAULT_SEED: function(value) {
      return normalizeSeedText(value);
    },
    SIM_UPDATE_INTERVAL_MS: function(value) {
      return Math.max(1, Number(value));
    },
    MAX_SIM_UPDATES_PER_FRAME: function(value) {
      return Math.max(1, Math.round(Number(value)));
    },
    HUD_UPDATE_INTERVAL_MS: function(value) {
      return Math.max(50, Number(value));
    },
    ECOSYSTEM_HISTORY_SAMPLE_INTERVAL: function(value) {
      return Math.max(1, Math.round(Number(value)));
    },
    ECOSYSTEM_HISTORY_MAX_SAMPLES: function(value) {
      return Math.max(1, Math.round(Number(value)));
    },
    EVENT_LOG_MAX_ENTRIES: function(value) {
      return Math.max(1, Math.round(Number(value)));
    },
    EVENT_LOG_VISIBLE_ENTRIES: function(value) {
      return Math.max(1, Math.round(Number(value)));
    }
  };

  function cloneConfigValue(value) {
    if (value == null || typeof value !== "object") {
      return value;
    }

    return clonePersistencePlainValue(value);
  }

  function valuesMatch(left, right) {
    if (left === right) {
      return true;
    }

    return JSON.stringify(left) === JSON.stringify(right);
  }

  function constantToLegacySaveKey(configKey) {
    return String(configKey).toLowerCase().replace(/_([a-z0-9])/g, function(match, letter) {
      return letter.toUpperCase();
    });
  }

  function normalizeConfigValue(configKey, value) {
    var currentValue = CONFIG[configKey];
    var sanitizer = sanitizers[configKey];
    var normalizedValue = sanitizer ? sanitizer(value) : value;

    if (typeof currentValue === "number") {
      normalizedValue = Number(normalizedValue);
      return Number.isFinite(normalizedValue) ? normalizedValue : currentValue;
    }

    if (typeof currentValue === "boolean") {
      return Boolean(normalizedValue);
    }

    if (typeof currentValue === "string") {
      return String(normalizedValue);
    }

    if (Array.isArray(currentValue)) {
      return Array.isArray(normalizedValue) ? cloneConfigValue(normalizedValue) : cloneConfigValue(currentValue);
    }

    return cloneConfigValue(normalizedValue);
  }

  function getDefaultConstants() {
    return PS.config && typeof PS.config.captureDefaults === "function"
      ? PS.config.captureDefaults()
      : {};
  }

  function getConfigKeys() {
    return Object.keys(CONFIG).filter(function(configKey) {
      return Object.prototype.hasOwnProperty.call(CONFIG, configKey);
    });
  }

  function createDelta() {
    var defaults = getDefaultConstants();
    var constants = {};
    var configKeys = getConfigKeys();

    for (var i = 0; i < configKeys.length; i++) {
      var configKey = configKeys[i];
      var currentValue = CONFIG[configKey];
      var defaultValue = defaults[configKey];

      if (!valuesMatch(currentValue, defaultValue)) {
        constants[configKey] = cloneConfigValue(currentValue);
      }
    }

    return {
      schemaVersion: schemaVersion,
      constants: constants
    };
  }

  function collectConstants(saveConfig) {
    var constants = {};
    var configKeys = getConfigKeys();

    if (saveConfig && saveConfig.constants && typeof saveConfig.constants === "object") {
      for (var constantKey in saveConfig.constants) {
        if (Object.prototype.hasOwnProperty.call(saveConfig.constants, constantKey) && Object.prototype.hasOwnProperty.call(CONFIG, constantKey)) {
          constants[constantKey] = saveConfig.constants[constantKey];
        }
      }
    }

    for (var i = 0; i < configKeys.length; i++) {
      var configKey = configKeys[i];
      var legacySaveKey = constantToLegacySaveKey(configKey);

      if (Object.prototype.hasOwnProperty.call(saveConfig, legacySaveKey)) {
        constants[configKey] = saveConfig[legacySaveKey];
      }
    }

    return constants;
  }

  function apply(saveConfig) {
    if (!saveConfig || typeof saveConfig !== "object") {
      return {};
    }

    var constants = collectConstants(saveConfig);
    var patch = {};

    for (var configKey in constants) {
      if (Object.prototype.hasOwnProperty.call(constants, configKey)) {
        patch[configKey] = normalizeConfigValue(configKey, constants[configKey]);
      }
    }

    if (PS.config && typeof PS.config.applyConstants === "function") {
      return PS.config.applyConstants(patch);
    }

    for (var patchKey in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, patchKey)) {
        CONFIG[patchKey] = patch[patchKey];
      }
    }

    return patch;
  }

  return {
    schemaVersion: schemaVersion,
    createDelta: createDelta,
    apply: apply,
    constantToLegacySaveKey: constantToLegacySaveKey
  };
})();
