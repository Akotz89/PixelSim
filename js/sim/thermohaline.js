"use strict";
PS.sim = PS.sim || {};

PS.sim.thermohaline = PS.sim.thermohaline || {
  salinityShaderName: "salinity",
  densityShaderName: "density",
  salinityShaderPath: "shaders/salinity.wgsl",
  densityShaderPath: "shaders/density.wgsl",
  configPath: "sim/configs/thermohaline.json",
  salinityPassId: "thermohaline.salinity",
  densityPassId: "thermohaline.density",
  salinityStateId: "thermohaline.salinity",
  densityStateId: "thermohaline.density",
  workgroupSize: [8, 8, 1],
  defaults: {
    width: 512,
    height: 512,
    initial_salinity_psu: 35,
    river_salinity_psu: 0,
    haline_diffusivity: 0.02,
    advection_scale: 0.25,
    evaporation_psu_per_tick: 0.007,
    precipitation_psu_per_tick: 0.01,
    river_freshening_psu_per_tick: 0.08,
    ice_brine_psu_per_tick: 0.006,
    ice_melt_psu_per_tick: 0.005,
    density_base: 1025,
    density_salinity_coeff: 0.8,
    density_temperature_coeff: -0.2,
    density_reference_salinity: 35,
    density_reference_temperature_c: 10,
    density_min: 1025,
    density_max: 1028.5,
    downwelling_density_threshold: 1027.5
  },
  config: null,
  state: null,

  registerManifest: function () {
    var manifest = PS.render && PS.render.wgslShaderManifest;
    var entries = [
      { name: this.salinityShaderName, path: this.salinityShaderPath },
      { name: this.densityShaderName, path: this.densityShaderPath }
    ];

    if (!Array.isArray(manifest)) {
      PS.render.wgslShaderManifest = [];
      manifest = PS.render.wgslShaderManifest;
    }

    entries.forEach(function (entry) {
      var found = manifest.some(function (candidate) {
        return candidate && candidate.name === entry.name;
      });
      if (!found) {
        manifest.push(entry);
      }
    });

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
      return Promise.reject(new Error("WGSL shader manager is required for thermohaline simulation"));
    }

    return Promise.all([
      configPromise,
      PS.render.wgslShaders.loadFromFile(this.salinityShaderName, this.salinityShaderPath, assetLoader),
      PS.render.wgslShaders.loadFromFile(this.densityShaderName, this.densityShaderPath, assetLoader)
    ]).then(function (results) {
      self.config = self.normalizeConfig(results[0]);
      return {
        config: self.config,
        salinityShader: results[1],
        densityShader: results[2]
      };
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

  makeInitialSalinity: function (width, height, options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells);
    var initial = Number(config.initial_salinity_psu) || 35;
    var river = Number(config.river_salinity_psu) || 0;

    values.fill(initial);
    if (spec.riverMask) {
      for (var i = 0; i < Math.min(cells, spec.riverMask.length); i += 1) {
        if (spec.riverMask[i] > 0.5) {
          values[i] = river;
        }
      }
    }

    return values;
  },

  makeLatitudeTemperature: function (width, height) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var values = new Float32Array(w * h);

    for (var y = 0; y < h; y += 1) {
      var latitude = Math.abs((y / Math.max(1, h - 1)) * 180 - 90);
      var temp = 24 - latitude * 0.38;
      for (var x = 0; x < w; x += 1) {
        values[y * w + x] = temp;
      }
    }

    return values;
  },

  makeScalarField: function (width, height, value) {
    var values = new Float32Array(this.getCellCount(width, height));
    values.fill(Number(value) || 0);
    return values;
  },

  computeDensityValue: function (temperatureC, salinityPsu, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var density = Number(settings.density_base) +
      Number(settings.density_salinity_coeff) * (Number(salinityPsu) - Number(settings.density_reference_salinity)) +
      Number(settings.density_temperature_coeff) * (Number(temperatureC) - Number(settings.density_reference_temperature_c));

    return Math.max(Number(settings.density_min), Math.min(Number(settings.density_max), density));
  },

  computeDensityField: function (temperature, salinity, width, height, config) {
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells);

    for (var i = 0; i < cells; i += 1) {
      values[i] = this.computeDensityValue(temperature[i], salinity[i], config);
    }

    return values;
  },

  stepCpu: function (salinity, width, height, options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var next = new Float32Array(w * h);
    var temperature = spec.temperature || this.makeLatitudeTemperature(w, h);
    var moisture = spec.moisture || this.makeScalarField(w, h, 0.35);
    var riverMask = spec.riverMask || null;
    var velocity = spec.velocity || null;

    function index(x, y) {
      return y * w + ((x + w) % w);
    }

    for (var y = 0; y < h; y += 1) {
      var latitude = Math.abs((y / Math.max(1, h - 1)) * 180 - 90);
      for (var x = 0; x < w; x += 1) {
        var i = index(x, y);
        var center = Number(salinity[i]) || 0;
        var laplacian = salinity[index(x, Math.max(0, y - 1))] + salinity[index(x, Math.min(h - 1, y + 1))] + salinity[index(x - 1, y)] + salinity[index(x + 1, y)] - center * 4;
        var vx = velocity ? Number(velocity[i * 4]) || 0 : 0;
        var vy = velocity ? Number(velocity[i * 4 + 1]) || 0 : 0;
        var advection = -(vx * (center - salinity[index(x - 1, y)]) + vy * (center - salinity[index(x, Math.max(0, y - 1))])) * Number(config.advection_scale);
        var source = 0;

        if (latitude < 28) { source += Number(config.evaporation_psu_per_tick); }
        if (latitude > 58) { source -= Number(config.precipitation_psu_per_tick); }
        if (riverMask && riverMask[i] > 0.5) {
          next[i] = Number(config.river_salinity_psu) || 0;
          continue;
        }
        if (temperature[i] < -1.8) {
          source += Number(config.ice_brine_psu_per_tick);
          source -= Number(moisture[i]) * Number(config.ice_melt_psu_per_tick);
        }

        next[i] = Math.max(0, Math.min(42, center + Number(config.haline_diffusivity) * laplacian + advection + source));
      }
    }

    return next;
  },

  runValidationTicks: function (width, height, options) {
    var spec = options || {};
    var ticks = Math.max(0, Math.round(Number(spec.ticks) || 1000));
    var salinity = this.makeInitialSalinity(width, height, spec);

    for (var i = 0; i < ticks; i += 1) {
      salinity = this.stepCpu(salinity, width, height, spec);
    }

    return salinity;
  },

  getRowAverage: function (field, width, row) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var y = Math.max(0, Math.round(Number(row) || 0));
    var sum = 0;
    for (var x = 0; x < w; x += 1) {
      sum += Number(field[y * w + x]) || 0;
    }
    return sum / w;
  },

  validateFields: function (salinity, density, width, height, options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var cells = this.getCellCount(width, height);
    var noNaN = true;
    var salinityMin = Infinity;
    var salinityMax = -Infinity;
    var densityMin = Infinity;
    var densityMax = -Infinity;
    var deepWaterCells = 0;

    for (var i = 0; i < cells; i += 1) {
      var s = Number(salinity && salinity[i]);
      var d = Number(density && density[i]);
      if (!Number.isFinite(s) || !Number.isFinite(d)) {
        noNaN = false;
      }
      salinityMin = Math.min(salinityMin, s);
      salinityMax = Math.max(salinityMax, s);
      densityMin = Math.min(densityMin, d);
      densityMax = Math.max(densityMax, d);
      if (d > Number(config.downwelling_density_threshold)) {
        deepWaterCells += 1;
      }
    }

    return {
      valid: noNaN && densityMin >= Number(config.density_min) - 0.5 && densityMax <= Number(config.density_max) + 0.5,
      noNaN: noNaN,
      salinityMin: salinityMin,
      salinityMax: salinityMax,
      densityMin: densityMin,
      densityMax: densityMax,
      deepWaterCells: deepWaterCells
    };
  },

  makeSalinityMapRgba: function (salinity, width, height) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var data = new Uint8Array(w * h * 4);

    for (var i = 0; i < w * h; i += 1) {
      var value = Math.max(0, Math.min(42, Number(salinity && salinity[i]) || 0));
      var t = value / 42;
      var offset = i * 4;
      data[offset] = Math.round(30 + t * 220);
      data[offset + 1] = Math.round(85 + t * 95);
      data[offset + 2] = Math.round(220 - t * 165);
      data[offset + 3] = 255;
    }

    return {
      width: w,
      height: h,
      data: data,
      mimeType: "image/png",
      description: "Salinity map RGBA export: river freshwater blue, evaporation-dominated high salinity orange."
    };
  },

  makeBuoyancyForcing: function (density, width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells * 4);
    var threshold = Number(settings.downwelling_density_threshold);

    for (var i = 0; i < cells; i += 1) {
      var d = Number(density && density[i]) || Number(settings.density_base);
      values[i * 4 + 1] = threshold - d;
      values[i * 4 + 2] = d;
      values[i * 4 + 3] = 1;
    }

    return values;
  },

  makeSalinityParamsData: function (width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var buffer = new ArrayBuffer(48);
    var view = new DataView(buffer);
    view.setUint32(0, Math.max(1, Math.round(Number(width) || 1)), true);
    view.setUint32(4, Math.max(1, Math.round(Number(height) || 1)), true);
    view.setFloat32(8, Number(settings.haline_diffusivity), true);
    view.setFloat32(12, Number(settings.advection_scale), true);
    view.setFloat32(16, Number(settings.evaporation_psu_per_tick), true);
    view.setFloat32(20, Number(settings.precipitation_psu_per_tick), true);
    view.setFloat32(24, Number(settings.river_freshening_psu_per_tick), true);
    view.setFloat32(28, Number(settings.ice_brine_psu_per_tick), true);
    view.setFloat32(32, Number(settings.ice_melt_psu_per_tick), true);
    view.setFloat32(36, 0, true);
    view.setFloat32(40, 42, true);
    return new Uint8Array(buffer);
  },

  makeDensityParamsData: function (width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var buffer = new ArrayBuffer(32);
    var view = new DataView(buffer);
    view.setUint32(0, Math.max(1, Math.round(Number(width) || 1)), true);
    view.setUint32(4, Math.max(1, Math.round(Number(height) || 1)), true);
    view.setFloat32(8, Number(settings.density_base), true);
    view.setFloat32(12, Number(settings.density_salinity_coeff), true);
    view.setFloat32(16, Number(settings.density_temperature_coeff), true);
    view.setFloat32(20, Number(settings.density_reference_salinity), true);
    view.setFloat32(24, Number(settings.density_reference_temperature_c), true);
    view.setFloat32(28, Number(settings.downwelling_density_threshold), true);
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
    var salinityModule;
    var densityModule;
    var self = this;

    if (!harness) {
      throw new Error("Compute harness is required for thermohaline simulation");
    }
    if (!device || typeof device.createBuffer !== "function") {
      throw new Error("GPUDevice is required for thermohaline simulation");
    }
    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.getShaderModule !== "function") {
      throw new Error("WGSL shader manager is required for thermohaline simulation");
    }
    if (spec.salinityShaderSource) {
      PS.render.wgslShaders.register(this.salinityShaderName, spec.salinityShaderSource, { path: this.salinityShaderPath });
    }
    if (spec.densityShaderSource) {
      PS.render.wgslShaders.register(this.densityShaderName, spec.densityShaderSource, { path: this.densityShaderPath });
    }

    this.registerManifest();
    salinityModule = PS.render.wgslShaders.getShaderModule(device, this.salinityShaderName);
    densityModule = PS.render.wgslShaders.getShaderModule(device, this.densityShaderName);

    this.state = harness.registerState(this.salinityStateId, {
      width: dims.width,
      height: dims.height,
      bytesPerCell: 4,
      format: "float32-psu",
      initialData: spec.initialSalinity || this.makeInitialSalinity(dims.width, dims.height, spec),
      usage: ["storage", "copySrc", "copyDst"],
      device: device,
      meta: { unit: "psu", source: "thermohaline" }
    });

    harness.createBuffer("thermohaline.temperature", scalarBytes, ["storage", "copyDst"], spec.temperature || this.makeLatitudeTemperature(dims.width, dims.height), device);
    harness.createBuffer("thermohaline.moisture", scalarBytes, ["storage", "copyDst"], spec.moisture || this.makeScalarField(dims.width, dims.height, 0.35), device);
    harness.createBuffer("thermohaline.elevation", scalarBytes, ["storage", "copyDst"], spec.elevation || this.makeScalarField(dims.width, dims.height, -1000), device);
    harness.createBuffer("thermohaline.river", scalarBytes, ["storage", "copyDst"], spec.riverMask || this.makeScalarField(dims.width, dims.height, 0), device);
    harness.createBuffer("thermohaline.velocity", vectorBytes, ["storage", "copyDst"], spec.velocity || new Float32Array(cells * 4), device);
    harness.createBuffer("thermohaline.density", scalarBytes, ["storage", "copySrc", "copyDst"], spec.density || new Float32Array(cells), device);
    harness.createBuffer("thermohaline.buoyancy", vectorBytes, ["storage", "copySrc", "copyDst"], spec.buoyancy || new Float32Array(cells * 4), device);
    harness.createBuffer("thermohaline.salinity.params", 48, ["uniform", "copyDst"], this.makeSalinityParamsData(dims.width, dims.height, config), device);
    harness.createBuffer("thermohaline.density.params", 32, ["uniform", "copyDst"], this.makeDensityParamsData(dims.width, dims.height, config), device);

    harness.registerPass(this.salinityPassId, {
      pipelineDescriptor: { label: "thermohaline.salinity.pipeline", layout: "auto", compute: { module: salinityModule, entryPoint: "main" } },
      bindGroups: [],
      workgroups: function () {
        return [Math.ceil(dims.width / self.workgroupSize[0]), Math.ceil(dims.height / self.workgroupSize[1]), 1];
      },
      beforeDispatch: function (pass, owner) {
        var pipeline = pass.pipeline || owner.getPassPipeline(pass, device);
        pass.bindGroups = [device.createBindGroup({
          label: "thermohaline.salinity.bind-group",
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: owner.getReadBuffer(self.salinityStateId).buffer } },
            { binding: 1, resource: { buffer: owner.getWriteBuffer(self.salinityStateId).buffer } },
            { binding: 2, resource: { buffer: owner.buffers["thermohaline.velocity"].buffer } },
            { binding: 3, resource: { buffer: owner.buffers["thermohaline.temperature"].buffer } },
            { binding: 4, resource: { buffer: owner.buffers["thermohaline.moisture"].buffer } },
            { binding: 5, resource: { buffer: owner.buffers["thermohaline.elevation"].buffer } },
            { binding: 6, resource: { buffer: owner.buffers["thermohaline.river"].buffer } },
            { binding: 7, resource: { buffer: owner.buffers["thermohaline.salinity.params"].buffer } }
          ]
        })];
      },
      afterDispatch: function () {
        harness.swap(self.salinityStateId);
      }
    });

    harness.registerPass(this.densityPassId, {
      pipelineDescriptor: { label: "thermohaline.density.pipeline", layout: "auto", compute: { module: densityModule, entryPoint: "main" } },
      bindGroups: [],
      workgroups: function () {
        return [Math.ceil(dims.width / self.workgroupSize[0]), Math.ceil(dims.height / self.workgroupSize[1]), 1];
      },
      beforeDispatch: function (pass, owner) {
        var pipeline = pass.pipeline || owner.getPassPipeline(pass, device);
        pass.bindGroups = [device.createBindGroup({
          label: "thermohaline.density.bind-group",
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: owner.buffers["thermohaline.temperature"].buffer } },
            { binding: 1, resource: { buffer: owner.getReadBuffer(self.salinityStateId).buffer } },
            { binding: 2, resource: { buffer: owner.buffers["thermohaline.density"].buffer } },
            { binding: 3, resource: { buffer: owner.buffers["thermohaline.buoyancy"].buffer } },
            { binding: 4, resource: { buffer: owner.buffers["thermohaline.density.params"].buffer } }
          ]
        })];
      }
    });

    return {
      width: dims.width,
      height: dims.height,
      config: config,
      scalarBytes: scalarBytes,
      vectorBytes: vectorBytes,
      state: this.state
    };
  },

  dispatch: function (commandEncoder, device) {
    if (!PS.sim || !PS.sim.computeHarness) {
      throw new Error("Compute harness is required for thermohaline dispatch");
    }
    PS.sim.computeHarness.dispatch(this.salinityPassId, commandEncoder, device);
    return PS.sim.computeHarness.dispatch(this.densityPassId, commandEncoder, device);
  }
};
