"use strict";
import { PS } from "./namespace.js";

PS.log = function (category, level, message, details) {
  var normalizedCategory = String(category || "core");
  var normalizedLevel = String(level || "INFO").toUpperCase();
  var entry = {
    category: normalizedCategory,
    level: normalizedLevel,
    message: String(message || ""),
    details: details,
    time: new Date().toISOString()
  };

  PS.log.history.push(entry);

  if (PS.log.history.length > PS.log.historyLimit) {
    PS.log.history.shift();
  }

  if (!PS.log.shouldWrite(normalizedCategory, normalizedLevel)) {
    return entry;
  }

  var writer = normalizedLevel === "ERROR"
    ? console.error
    : normalizedLevel === "WARN"
      ? console.warn
      : console.log;

  writer.call(console, "[Pixeldarium][" + normalizedLevel + "][" + normalizedCategory + "] " + entry.message, details || "");

  return entry;
};

PS.log.levels = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

PS.log.history = PS.log.history || [];
PS.log.historyLimit = PS.log.historyLimit || 200;

PS.log.shouldWrite = function (category, level) {
  var config = PS.config && PS.config.log ? PS.config.log : {};
  var configuredLevel = String(config.level || "WARN").toUpperCase();
  var configuredCategories = config.categories || {};
  var targetLevel = PS.log.levels[configuredLevel];
  var eventLevel = PS.log.levels[level];

  if (typeof eventLevel !== "number") {
    eventLevel = PS.log.levels.INFO;
  }

  if (typeof targetLevel !== "number") {
    targetLevel = PS.log.levels.WARN;
  }

  if (configuredCategories[category] === false) {
    return false;
  }

  return eventLevel <= targetLevel;
};

PS.log.setLevel = function (level) {
  PS.assert(PS.log.levels[String(level).toUpperCase()] !== undefined, "Unknown log level: " + level);
  PS.config.log.level = String(level).toUpperCase();
};

PS.log.setCategory = function (category, enabled) {
  PS.config.log.categories[String(category || "core")] = Boolean(enabled);
};
