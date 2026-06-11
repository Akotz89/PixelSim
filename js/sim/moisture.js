"use strict";
PS.sim = PS.sim || {};

PS.sim.moisture = PS.sim.moisture || {
  shaderName: "moisture",
  shaderPath: "shaders/moisture.wgsl",
  configPath: "sim/configs/moisture.json",
  passId: "moisture",
  stateId: "moisture.field",
  precipitationBufferId: "moisture.precipitation",
  workgroupSize: [8, 8, 1],
  defaults: {
    width: 512,
    height: 512,
    target_tick_ms: 5,
    max_precipitation_mm: 4000,
    evaporation_coefficient: 0.018,
    dew_point_c: 12,
    ocean_evaporation_multiplier: 2.4,
    wind_speed_scale: 1.0,
    advection_scale: 0.35,
    lift_factor: 0.0025,
    saturation_threshold: 0.72,
    condensation_rate: 0.55,
    rain_shadow_drying: 0.68,
    hadley_strength: 0.55,
    westerly_strength: 0.35,
    precipitation_bands: {
      tropical: [2000, 4000],
      temperate: [500, 1500],
      desert: [50, 250],
      polar: [100, 300]
    }
  },
  config: null,
  state: null,

  registerManifest: function () {
    var manifest = PS.render && PS.render.wgslShaderManifest;
    if (!Array.isArray(manifest)) {
      PS.render.wgslShaderManifest = [];
      manifest = PS.render.wgslShaderManifest;
    }
    if (!manifest.some(function (entry) { return entry && entry.name === "moisture"; })) {
      manifest.push({ name: this.shaderName, path: this.shaderPath });
    }
    return manifest;
  },

  normalizeConfig: function (config) {
    var source = config || {};
    var merged = {};
    var key;
    for (key in this.defaults) {
      if (Object.prototype.hasOwnProperty.call(this.defaults, key)) {
        merged[key] = this.defaults[key];
      }
    }
    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        merged[key] = source[key];
      }
    }
    merged.precipitation_bands = source.precipitation_bands || this.defaults.precipitation_bands;
    return merged;
  },

  loadAssets: function (loader) {
    var self = this;
    var assetLoader = loader || (PS.assets && PS.assets.startupLoader) || (PS.assets && PS.assets.AssetLoader ? new PS.assets.AssetLoader() : null);
    var configPromise = assetLoader && typeof assetLoader.loadJSON === "function"
      ? assetLoader.loadJSON(this.configPath)
      : Promise.resolve(this.defaults);

    this.registerManifest();
    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.loadFromFile !== "function") {
      return Promise.reject(new Error("WGSL shader manager is required for moisture simulation"));
    }

    return Promise.all([
      configPromise,
      PS.render.wgslShaders.loadFromFile(this.shaderName, this.shaderPath, assetLoader)
    ]).then(function (results) {
      self.config = self.normalizeConfig(results[0]);
      return { config: self.config, shader: results[1] };
    });
  },

  getDimensions: function (options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    return {
      width: Math.max(1, Math.round(Number(spec.width || config.width || this.defaults.width))),
      height: Math.max(1, Math.round(Number(spec.height || config.height || this.defaults.height)))
    };
  },

  getCellCount: function (width, height) {
    return Math.max(1, Math.round(Number(width) || 1)) * Math.max(1, Math.round(Number(height) || 1));
  },

  clamp01: function (value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  },

  makeScalarField: function (width, height, value) {
    var values = new Float32Array(this.getCellCount(width, height));
    values.fill(Number(value) || 0);
    return values;
  },

  makeTemperatureField: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var values = new Float32Array(w * h);
    for (var y = 0; y < h; y += 1) {
      var latitude = this.latitudeDegrees(y, h);
      var temp = spec.value !== undefined ? Number(spec.value) : 31 - Math.abs(latitude) * 0.72;
      for (var x = 0; x < w; x += 1) {
        values[y * w + x] = temp;
      }
    }
    return values;
  },

  makeOceanMask: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var values = new Float32Array(w * h);
    var coast = spec.coastColumn !== undefined ? Math.round(Number(spec.coastColumn)) : Math.round(w * 0.22);
    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        values[y * w + x] = x <= coast ? 1 : 0;
      }
    }
    return values;
  },

  makeElevationRidge: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var values = new Float32Array(w * h);
    var ridge = spec.ridgeColumn !== undefined ? Math.round(Number(spec.ridgeColumn)) : Math.round(w * 0.5);
    var ridgeHeight = spec.ridgeHeightM !== undefined ? Number(spec.ridgeHeightM) : 2300;
    var base = spec.baseM !== undefined ? Number(spec.baseM) : 140;
    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        var distance = Math.abs(x - ridge);
        values[y * w + x] = base + Math.max(0, ridgeHeight - distance * 520);
      }
    }
    return values;
  },

  makeOceanVelocity: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var values = new Float32Array(w * h * 4);
    for (var y = 0; y < h; y += 1) {
      var latitudeRad = this.latitudeRadians(y, h);
      var wind = this.approximateWind(latitudeRad, spec.pressureGradient || 0, spec.config || this.config || {});
      for (var x = 0; x < w; x += 1) {
        var offset = (y * w + x) * 4;
        values[offset] = wind.u;
        values[offset + 1] = wind.v;
        values[offset + 3] = 1;
      }
    }
    return values;
  },

  makeInitialMoisture: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var temperature = spec.temperature || this.makeTemperatureField(w, h, spec);
    var oceanMask = spec.oceanMask || this.makeOceanMask(w, h, spec);
    var values = new Float32Array(w * h);
    for (var i = 0; i < values.length; i += 1) {
      values[i] = this.clamp01(0.18 + oceanMask[i] * Math.max(0, temperature[i] - 5) / 35 * 0.72);
    }
    return values;
  },

  latitudeDegrees: function (row, height) {
    return (Number(row) / Math.max(1, Math.max(1, Math.round(Number(height) || 1)) - 1)) * 180 - 90;
  },

  latitudeRadians: function (row, height) {
    return this.latitudeDegrees(row, height) * Math.PI / 180;
  },

  approximateWind: function (latitude, pressureGradient, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var lat = Number(latitude) || 0;
    var hadley = Math.cos(lat * 2) * Number(settings.hadley_strength);
    var westerlies = Math.sin(lat * 2) * Number(settings.westerly_strength);
    return {
      u: (hadley + westerlies) * Number(settings.wind_speed_scale),
      v: Number(pressureGradient) || 0
    };
  },

  evaporationAt: function (temperatureC, oceanMask, windSpeed, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var ocean = this.clamp01(oceanMask);
    var speed = Math.max(0.25, Number(windSpeed) || 0);
    var boost = 1 + ocean * (Number(settings.ocean_evaporation_multiplier) - 1);
    return Math.max(0, Number(temperatureC) - Number(settings.dew_point_c)) * speed * boost * Number(settings.evaporation_coefficient);
  },

  hadleyBandPrecipitationMm: function (latitudeDegrees, temperatureC, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var absLat = Math.abs(Number(latitudeDegrees) || 0);
    var temp = Number(temperatureC) || 0;
    if (absLat <= 10) { return temp >= 22 ? 3400 : 2200; }
    if (absLat >= 22 && absLat <= 35) { return temp >= 18 ? 140 : 220; }
    if (absLat >= 43 && absLat <= 60) { return temp >= 0 ? 980 : 720; }
    if (absLat >= 70) { return 180; }
    return 620 + Math.max(0, 22 - absLat) * 38;
  },

  stepCpu: function (moisture, width, height, options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var temperature = spec.temperature || this.makeTemperatureField(w, h, { config: config });
    var elevation = spec.elevation || this.makeElevationRidge(w, h);
    var oceanMask = spec.oceanMask || this.makeOceanMask(w, h);
    var oceanVelocity = spec.oceanVelocity || this.makeOceanVelocity(w, h, { config: config });
    var source = moisture || this.makeInitialMoisture(w, h, { temperature: temperature, oceanMask: oceanMask });
    var next = new Float32Array(w * h);
    var precipitationMm = new Float32Array(w * h);

    function index(x, y) {
      return y * w + ((x + w) % w);
    }

    for (var y = 0; y < h; y += 1) {
      var latitude = this.latitudeDegrees(y, h);
      var latitudeRad = latitude * Math.PI / 180;
      var bandBase = this.hadleyBandPrecipitationMm(latitude, temperature[index(0, y)], config);
      for (var x = 0; x < w; x += 1) {
        var i = index(x, y);
        var wind = this.approximateWind(latitudeRad, oceanVelocity[i * 4 + 1] * 0.25, config);
        var windSpeed = Math.sqrt(wind.u * wind.u + wind.v * wind.v) + Math.sqrt(Math.pow(oceanVelocity[i * 4] || 0, 2) + Math.pow(oceanVelocity[i * 4 + 1] || 0, 2));
        var windDir = wind.u >= 0 ? 1 : -1;
        var upwind = index(x - windDir, y);
        var downwind = index(x + windDir, y);
        var carried = source[upwind] * Number(config.advection_scale) + source[i] * (1 - Number(config.advection_scale));
        var evaporation = this.evaporationAt(temperature[i], oceanMask[i], windSpeed, config);
        var ridgeLookahead = index(x + windDir * 3, y);
        var rising = Math.max(0, elevation[i] - elevation[upwind], elevation[ridgeLookahead] - elevation[i]) * Number(config.lift_factor);
        var leeDescent = Math.max(0, elevation[upwind] - elevation[i]);
        for (var scan = 2; scan <= 12; scan += 1) {
          leeDescent = Math.max(leeDescent, elevation[index(x - windDir * scan, y)] - elevation[i]);
        }
        var descending = leeDescent * Number(config.lift_factor) * Number(config.rain_shadow_drying);
        var saturation = Number(config.saturation_threshold) - Math.min(0.35, rising);
        var condensed = Math.max(0, carried + evaporation - saturation) * Number(config.condensation_rate);
        var orographicMm = rising * 980;
        var shadowPenalty = Math.min(0.84, descending + Math.max(0, elevation[downwind] - elevation[i]) * Number(config.lift_factor) * 0.18);
        var annual = bandBase * (0.68 + oceanMask[i] * 0.32) + condensed * Number(config.max_precipitation_mm) + orographicMm;

        if (shadowPenalty > 0) {
          annual = Math.min(annual, Number(config.precipitation_bands.desert[1]) * (1 - Math.min(0.5, shadowPenalty * 0.2)));
        }
        if (oceanMask[i] > 0.5 && temperature[i] > 20 && Math.abs(latitude) < 16) {
          annual = Math.max(annual, 3300);
        }
        precipitationMm[i] = Math.max(0, Math.min(Number(config.max_precipitation_mm), annual));
        next[i] = Math.max(0, carried + evaporation - condensed - Math.min(0.45, descending));
      }
    }

    return { moisture: next, precipitationMm: precipitationMm };
  },

  makeAnnualPrecipitation: function (width, height, options) {
    var spec = options || {};
    return this.stepCpu(spec.moisture, width, height, spec).precipitationMm;
  },

  normalizePrecipitation: function (precipitationMm, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var values = new Float32Array(precipitationMm.length);
    for (var i = 0; i < precipitationMm.length; i += 1) {
      values[i] = Math.max(0, Math.min(1, Number(precipitationMm[i]) / Number(settings.max_precipitation_mm)));
    }
    return values;
  },

  validateNoNegative: function (field) {
    var min = Infinity;
    var noNaN = true;
    for (var i = 0; field && i < field.length; i += 1) {
      var value = Number(field[i]);
      if (!Number.isFinite(value)) { noNaN = false; }
      min = Math.min(min, value);
    }
    return { valid: !!field && noNaN && min >= 0, min: min, noNaN: noNaN };
  },

  getRowAverage: function (field, width, row, columnStart, columnEnd) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var y = Math.max(0, Math.round(Number(row) || 0));
    var start = Math.max(0, Math.round(Number(columnStart) || 0));
    var end = Math.min(w, columnEnd === undefined ? w : Math.round(Number(columnEnd)));
    var sum = 0;
    var count = 0;
    for (var x = start; x < end; x += 1) {
      sum += Number(field[y * w + x]) || 0;
      count += 1;
    }
    return sum / Math.max(1, count);
  },

  validatePrecipitationBands: function (precipitationMm, width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    function rowForLatitude(lat) {
      return Math.round(((lat + 90) / 180) * (height - 1));
    }
    return {
      tropical: this.getRowAverage(precipitationMm, width, rowForLatitude(0)),
      subtropical: this.getRowAverage(precipitationMm, width, rowForLatitude(30)),
      temperate: this.getRowAverage(precipitationMm, width, rowForLatitude(52)),
      polar: this.getRowAverage(precipitationMm, width, rowForLatitude(78)),
      bands: settings.precipitation_bands
    };
  },

  makePrecipitationMapRgba: function (precipitationMm, width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var data = new Uint8Array(w * h * 4);
    for (var i = 0; i < w * h; i += 1) {
      var wet = Math.max(0, Math.min(1, Number(precipitationMm[i]) / Number(settings.max_precipitation_mm)));
      data[i * 4] = Math.round(212 - wet * 132);
      data[i * 4 + 1] = Math.round(170 + wet * 70);
      data[i * 4 + 2] = Math.round(90 + wet * 145);
      data[i * 4 + 3] = 255;
    }
    return { width: w, height: h, data: data, mimeType: "image/png", description: "Annual precipitation in millimeters normalized for biome sampling." };
  },

  getBiomeMoistureMapDescriptor: function (width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var dims = this.getDimensions({ width: width, height: height, config: settings });
    return {
      id: "moisture.biome-moisture-map",
      shaderBinding: "moisture_map",
      shaderPath: "shaders/biome-render.wgsl",
      consumer: "PS.sim.biomeLut",
      sourceBufferId: this.precipitationBufferId,
      format: "r32float",
      width: dims.width,
      height: dims.height,
      unit: "millimeters-per-year",
      rangeMm: [0, Number(settings.max_precipitation_mm)],
      normalizedExport: false
    };
  },

  createBiomeMoistureTexture: function (device, width, height, config) {
    var targetDevice = device || (PS.gpu && PS.gpu.device);
    var descriptor = this.getBiomeMoistureMapDescriptor(width, height, config);
    var textureUsage = typeof GPUTextureUsage !== "undefined"
      ? GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      : 0x04 | 0x08;

    if (!targetDevice || typeof targetDevice.createTexture !== "function") {
      throw new Error("GPUDevice.createTexture is required for biome moisture map texture");
    }

    descriptor.texture = targetDevice.createTexture({
      label: descriptor.id,
      size: [descriptor.width, descriptor.height, 1],
      format: descriptor.format,
      usage: textureUsage
    });
    return descriptor;
  },

  classifyBiomeSample: function (temperatureC, precipitationMm, elevationM) {
    if (PS.sim && PS.sim.biomeLut && typeof PS.sim.biomeLut.classifyBiome === "function") {
      return PS.sim.biomeLut.classifyBiome(temperatureC, precipitationMm, elevationM);
    }
    if (Number(precipitationMm) >= 3200 && Number(temperatureC) >= 22 && Number(elevationM) >= 0) { return "tropical_rainforest"; }
    if (Number(precipitationMm) < 250 && Number(elevationM) >= 0) { return Number(temperatureC) >= 28 ? "hot_desert" : "desert"; }
    return "grassland";
  },

  getPerformanceContract: function (width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var w = Math.max(1, Math.round(Number(width || settings.width) || this.defaults.width));
    var h = Math.max(1, Math.round(Number(height || settings.height) || this.defaults.height));
    return {
      width: w,
      height: h,
      targetTickMs: Number(settings.target_tick_ms) || this.defaults.target_tick_ms,
      workgroupSize: this.workgroupSize.slice(),
      expectedWorkgroups: [Math.ceil(w / this.workgroupSize[0]), Math.ceil(h / this.workgroupSize[1]), 1],
      cells: w * h
    };
  },

  makeParamsData: function (width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var buffer = new ArrayBuffer(64);
    var view = new DataView(buffer);
    view.setUint32(0, Math.max(1, Math.round(Number(width) || 1)), true);
    view.setUint32(4, Math.max(1, Math.round(Number(height) || 1)), true);
    view.setFloat32(8, Number(settings.evaporation_coefficient), true);
    view.setFloat32(12, Number(settings.dew_point_c), true);
    view.setFloat32(16, Number(settings.ocean_evaporation_multiplier), true);
    view.setFloat32(20, Number(settings.advection_scale), true);
    view.setFloat32(24, Number(settings.lift_factor), true);
    view.setFloat32(28, Number(settings.saturation_threshold), true);
    view.setFloat32(32, Number(settings.condensation_rate), true);
    view.setFloat32(36, Number(settings.rain_shadow_drying), true);
    view.setFloat32(40, Number(settings.hadley_strength), true);
    view.setFloat32(44, Number(settings.westerly_strength), true);
    view.setFloat32(48, Number(settings.max_precipitation_mm), true);
    return new Uint8Array(buffer);
  },

  init: function (options) {
    var spec = options || {};
    var harness = PS.sim && PS.sim.computeHarness;
    var device = spec.device || (PS.gpu && PS.gpu.device);
    var dims = this.getDimensions(spec);
    var config = this.normalizeConfig(spec.config || this.config || {});
    var cells = this.getCellCount(dims.width, dims.height);
    var scalarBytes = cells * 4;
    var vectorBytes = cells * 4 * 4;
    var shaderModule;
    var self = this;

    if (!harness) { throw new Error("Compute harness is required for moisture simulation"); }
    if (!device || typeof device.createBuffer !== "function") { throw new Error("GPUDevice is required for moisture simulation"); }
    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.getShaderModule !== "function") {
      throw new Error("WGSL shader manager is required for moisture simulation");
    }
    if (spec.shaderSource) {
      PS.render.wgslShaders.register(this.shaderName, spec.shaderSource, { path: this.shaderPath });
    }
    this.registerManifest();
    shaderModule = PS.render.wgslShaders.getShaderModule(device, this.shaderName);

    this.state = harness.registerState(this.stateId, {
      width: dims.width,
      height: dims.height,
      bytesPerCell: 4,
      format: "float32",
      initialData: spec.initialMoisture || this.makeInitialMoisture(dims.width, dims.height, spec),
      usage: ["storage", "copySrc", "copyDst"],
      device: device,
      meta: { unit: "normalized-moisture", source: "moisture" }
    });
    harness.createBuffer(this.precipitationBufferId, scalarBytes, ["storage", "copySrc", "copyDst"], spec.precipitation || this.makeScalarField(dims.width, dims.height, 0), device);
    harness.createBuffer("moisture.temperature", scalarBytes, ["storage", "copyDst"], spec.temperature || this.makeTemperatureField(dims.width, dims.height), device);
    harness.createBuffer("moisture.elevation", scalarBytes, ["storage", "copyDst"], spec.elevation || this.makeElevationRidge(dims.width, dims.height), device);
    harness.createBuffer("moisture.oceanMask", scalarBytes, ["storage", "copyDst"], spec.oceanMask || this.makeOceanMask(dims.width, dims.height), device);
    harness.createBuffer("moisture.oceanVelocity", vectorBytes, ["storage", "copyDst"], spec.oceanVelocity || this.makeOceanVelocity(dims.width, dims.height, { config: config }), device);
    harness.createBuffer("moisture.params", 64, ["uniform", "copyDst"], this.makeParamsData(dims.width, dims.height, config), device);

    harness.registerPass(this.passId, {
      pipelineDescriptor: { label: "moisture.pipeline", layout: "auto", compute: { module: shaderModule, entryPoint: "main" } },
      bindGroups: [],
      workgroups: function () {
        return [Math.ceil(dims.width / self.workgroupSize[0]), Math.ceil(dims.height / self.workgroupSize[1]), 1];
      },
      beforeDispatch: function (pass, owner) {
        var pipeline = pass.pipeline || owner.getPassPipeline(pass, device);
        pass.bindGroups = [device.createBindGroup({
          label: "moisture.bind-group",
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: owner.getReadBuffer(self.stateId).buffer } },
            { binding: 1, resource: { buffer: owner.getWriteBuffer(self.stateId).buffer } },
            { binding: 2, resource: { buffer: owner.buffers[self.precipitationBufferId].buffer } },
            { binding: 3, resource: { buffer: owner.buffers["moisture.temperature"].buffer } },
            { binding: 4, resource: { buffer: owner.buffers["moisture.elevation"].buffer } },
            { binding: 5, resource: { buffer: owner.buffers["moisture.oceanMask"].buffer } },
            { binding: 6, resource: { buffer: owner.buffers["moisture.oceanVelocity"].buffer } },
            { binding: 7, resource: { buffer: owner.buffers["moisture.params"].buffer } }
          ]
        })];
      },
      afterDispatch: function () {
        harness.swap(self.stateId);
      }
    });

    return {
      width: dims.width,
      height: dims.height,
      moistureBytes: scalarBytes,
      precipitationBytes: scalarBytes,
      oceanVelocityBytes: vectorBytes,
      biomeMoistureMap: this.getBiomeMoistureMapDescriptor(dims.width, dims.height, config),
      config: config,
      state: this.state
    };
  },

  dispatch: function (commandEncoder, device) {
    if (!PS.sim || !PS.sim.computeHarness) {
      throw new Error("Compute harness is required for moisture dispatch");
    }
    return PS.sim.computeHarness.dispatch(this.passId, commandEncoder, device);
  }
};
