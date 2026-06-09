PS.core = PS.core || {};
PS.config = PS.config || {};

PS.core.DataLoader = PS.core.DataLoader || {
  schemas: {
    config: {
      requiredRootFields: ["version", "values"],
      requiredValues: [
        "CANVAS_WIDTH",
        "CANVAS_HEIGHT",
        "TILE_SIZE",
        "MAX_FOOD",
        "MAX_ORGANISMS",
        "SIM_UPDATE_INTERVAL_MS",
        "MAX_SIM_UPDATES_PER_FRAME",
        "FRAME_BUDGET_MS"
      ],
      numericRanges: {
        CANVAS_WIDTH: { min: 1 },
        CANVAS_HEIGHT: { min: 1 },
        TILE_SIZE: { min: 1 },
        MAX_FOOD: { min: 1 },
        MAX_ORGANISMS: { min: 1 },
        SIM_UPDATE_INTERVAL_MS: { min: 1 },
        MAX_SIM_UPDATES_PER_FRAME: { min: 1 },
        FRAME_BUDGET_MS: { min: 1 }
      }
    }
  },

  loaded: {},

  validateConfig: function (data) {
    var schema = this.schemas.config;
    var values;
    var i;
    var field;
    var range;
    var value;

    if (!data || typeof data !== "object") {
      throw new Error("config.json: root must be an object");
    }

    for (i = 0; i < schema.requiredRootFields.length; i += 1) {
      field = schema.requiredRootFields[i];
      if (data[field] === undefined || data[field] === null) {
        throw new Error("config.json: missing required field " + field);
      }
    }

    values = data.values;
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      throw new Error("config.json: values must be an object");
    }

    for (i = 0; i < schema.requiredValues.length; i += 1) {
      field = schema.requiredValues[i];
      if (!Object.prototype.hasOwnProperty.call(values, field)) {
        throw new Error("config.json: values." + field + " is required");
      }
    }

    for (field in schema.numericRanges) {
      if (Object.prototype.hasOwnProperty.call(schema.numericRanges, field)) {
        range = schema.numericRanges[field];
        value = values[field];
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new Error("config.json: " + field + " must be number, got " + typeof value);
        }
        if (range.min !== undefined && value < range.min) {
          throw new Error("config.json: " + field + " must be >= " + range.min);
        }
        if (range.max !== undefined && value > range.max) {
          throw new Error("config.json: " + field + " must be <= " + range.max);
        }
      }
    }

    return values;
  },

  applyConfig: function (data) {
    var values = this.validateConfig(data);

    if (!PS.config || typeof PS.config.applyConstants !== "function") {
      throw new Error("config.json: PS.config.applyConstants is unavailable");
    }

    PS.config.applyConstants(values);
    PS.config.source = {
      url: "data/config.json",
      version: data.version,
      loaded: true,
      valueCount: Object.keys(values).length
    };
    this.loaded.config = data;
    return PS.config.source;
  },

  loadConfig: function (loader) {
    if (!loader || typeof loader.loadJSON !== "function") {
      throw new Error("DataLoader.loadConfig requires an AssetLoader");
    }

    return loader.loadJSON("data/config.json").then(function (data) {
      return PS.core.DataLoader.applyConfig(data);
    });
  }
};
