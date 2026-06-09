"use strict";
PS.sim = PS.sim || {};

PS.sim.heatDiffusion = PS.sim.heatDiffusion || {
  shaderName: "heat-diffusion",
  shaderPath: "shaders/heat-diffusion.wgsl",
  configPath: "sim/configs/heat-diffusion.json",
  passId: "heat-diffusion",
  temperatureStateId: "temperature",
  workgroupSize: [8, 8, 1],
  defaults: {
    width: 512,
    height: 512,
    thermal_diffusivity: 2.1e-7,
    solar_constant: 1361,
    lapse_rate: 0.0065,
    time_step: 3600,
    grid_spacing: 50000,
    source_relaxation: 2.5e-4,
    min_temperature: -90,
    max_temperature: 80,
    albedo: {
      ocean: 0.06,
      ice: 0.8,
      land: 0.3,
      desert: 0.35
    }
  },
  config: null,
  state: null,

  registerManifest: function () {
    var manifest = PS.render && PS.render.wgslShaderManifest;
    var found = false;

    if (!Array.isArray(manifest)) {
      PS.render.wgslShaderManifest = [];
      manifest = PS.render.wgslShaderManifest;
    }

    for (var i = 0; i < manifest.length; i += 1) {
      if (manifest[i] && manifest[i].name === this.shaderName) {
        found = true;
        break;
      }
    }

    if (!found) {
      manifest.push({
        name: this.shaderName,
        path: this.shaderPath
      });
    }

    return manifest;
  },

  loadAssets: function (loader) {
    var self = this;
    var assetLoader = loader || (PS.assets && PS.assets.startupLoader) || (PS.assets && PS.assets.AssetLoader ? new PS.assets.AssetLoader() : null);
    var configPromise;
    var shaderPromise;

    this.registerManifest();

    configPromise = assetLoader && typeof assetLoader.loadJSON === "function"
      ? assetLoader.loadJSON(this.configPath)
      : Promise.resolve(this.defaults);

    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.loadFromFile !== "function") {
      shaderPromise = Promise.reject(new Error("WGSL shader manager is required for heat diffusion"));
    } else {
      shaderPromise = PS.render.wgslShaders.loadFromFile(this.shaderName, this.shaderPath, assetLoader);
    }

    return Promise.all([configPromise, shaderPromise]).then(function (results) {
      self.config = self.normalizeConfig(results[0]);
      return {
        config: self.config,
        shader: results[1]
      };
    });
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

    merged.albedo = source.albedo || this.defaults.albedo;
    return merged;
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

  makeInitialTemperature: function (width, height) {
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells);
    var h = Math.max(1, Math.round(Number(height) || 1));
    var w = Math.max(1, Math.round(Number(width) || 1));

    for (var y = 0; y < h; y += 1) {
      var latitude = (y / h) * Math.PI - Math.PI / 2;
      var temp = 30 * Math.cos(latitude) - 20;
      for (var x = 0; x < w; x += 1) {
        values[y * w + x] = temp;
      }
    }

    return values;
  },

  makeScalarField: function (width, height, value) {
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells);
    values.fill(Number(value) || 0);
    return values;
  },

  makeAlbedoField: function (width, height, options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells);
    var land = Number(config.albedo && config.albedo.land) || 0.3;
    var ocean = Number(config.albedo && config.albedo.ocean) || 0.06;
    var ice = Number(config.albedo && config.albedo.ice) || 0.8;
    var h = Math.max(1, Math.round(Number(height) || 1));
    var w = Math.max(1, Math.round(Number(width) || 1));

    for (var y = 0; y < h; y += 1) {
      var latitude = Math.abs((y / h) * 180 - 90);
      var defaultValue = latitude > 72 ? ice : land;

      for (var x = 0; x < w; x += 1) {
        values[y * w + x] = spec.oceanMask && spec.oceanMask[y * w + x] > 0 ? ocean : defaultValue;
      }
    }

    return values;
  },

  makeParamsData: function (width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var buffer = new ArrayBuffer(48);
    var view = new DataView(buffer);

    view.setUint32(0, Math.max(1, Math.round(Number(width) || 1)), true);
    view.setUint32(4, Math.max(1, Math.round(Number(height) || 1)), true);
    view.setFloat32(8, Number(settings.thermal_diffusivity) || this.defaults.thermal_diffusivity, true);
    view.setFloat32(12, Number(settings.time_step) || this.defaults.time_step, true);
    view.setFloat32(16, Number(settings.grid_spacing) || this.defaults.grid_spacing, true);
    view.setFloat32(20, Number(settings.solar_constant) || this.defaults.solar_constant, true);
    view.setFloat32(24, Number(settings.lapse_rate) || this.defaults.lapse_rate, true);
    view.setFloat32(28, Number(settings.source_relaxation) || this.defaults.source_relaxation, true);
    view.setFloat32(32, Number(settings.min_temperature) || this.defaults.min_temperature, true);
    view.setFloat32(36, Number(settings.max_temperature) || this.defaults.max_temperature, true);

    return new Uint8Array(buffer);
  },

  ensureShaderModule: function (device) {
    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.getShaderModule !== "function") {
      throw new Error("WGSL shader manager is required for heat diffusion");
    }

    return PS.render.wgslShaders.getShaderModule(device, this.shaderName);
  },

  createBindGroup: function (pass, harness, device) {
    var pipeline = pass.pipeline || harness.getPassPipeline(pass, device);
    var read = harness.getReadBuffer(this.temperatureStateId);
    var write = harness.getWriteBuffer(this.temperatureStateId);
    var entries = [
      { binding: 0, resource: { buffer: read.buffer } },
      { binding: 1, resource: { buffer: write.buffer } },
      { binding: 2, resource: { buffer: harness.buffers["heat.elevation"].buffer } },
      { binding: 3, resource: { buffer: harness.buffers["heat.albedo"].buffer } },
      { binding: 4, resource: { buffer: harness.buffers["heat.greenhouse"].buffer } },
      { binding: 5, resource: { buffer: harness.buffers["heat.params"].buffer } }
    ];

    if (device && typeof device.createBindGroup === "function" && pipeline && typeof pipeline.getBindGroupLayout === "function") {
      return device.createBindGroup({
        label: "heat-diffusion.bind-group",
        layout: pipeline.getBindGroupLayout(0),
        entries: entries
      });
    }

    return {
      label: "heat-diffusion.bind-group",
      entries: entries
    };
  },

  init: function (options) {
    var spec = options || {};
    var harness = PS.sim && PS.sim.computeHarness;
    var device = spec.device || (PS.gpu && PS.gpu.device);
    var dims = this.getDimensions(spec);
    var config = this.normalizeConfig(spec.config || this.config || {});
    var byteLength = this.getCellCount(dims.width, dims.height) * 4;
    var shaderModule;
    var pipelineDescriptor;
    var self = this;

    if (!harness) {
      throw new Error("Compute harness is required for heat diffusion");
    }

    if (!device || typeof device.createBuffer !== "function") {
      throw new Error("GPUDevice is required for heat diffusion");
    }

    if (spec.shaderSource && PS.render && PS.render.wgslShaders) {
      PS.render.wgslShaders.register(this.shaderName, spec.shaderSource, { path: this.shaderPath });
    }

    this.registerManifest();
    shaderModule = this.ensureShaderModule(device);

    this.state = harness.registerState(this.temperatureStateId, {
      width: dims.width,
      height: dims.height,
      bytesPerCell: 4,
      format: "float32",
      initialData: spec.initialTemperature || this.makeInitialTemperature(dims.width, dims.height),
      usage: ["storage", "copySrc", "copyDst"],
      device: device,
      meta: {
        unit: "celsius",
        source: "heat-diffusion"
      }
    });

    harness.createBuffer("heat.elevation", byteLength, ["storage", "copyDst"], spec.elevation || this.makeScalarField(dims.width, dims.height, 0), device);
    harness.createBuffer("heat.albedo", byteLength, ["storage", "copyDst"], spec.albedo || this.makeAlbedoField(dims.width, dims.height, { config: config }), device);
    harness.createBuffer("heat.greenhouse", byteLength, ["storage", "copyDst"], spec.greenhouse || this.makeScalarField(dims.width, dims.height, 0), device);
    harness.createBuffer("heat.params", 48, ["uniform", "copyDst"], this.makeParamsData(dims.width, dims.height, config), device);

    pipelineDescriptor = {
      label: "heat-diffusion.pipeline",
      layout: "auto",
      compute: {
        module: shaderModule,
        entryPoint: "main"
      }
    };

    harness.registerPass(this.passId, {
      pipelineDescriptor: pipelineDescriptor,
      bindGroups: [],
      workgroups: function () {
        return [
          Math.ceil(dims.width / self.workgroupSize[0]),
          Math.ceil(dims.height / self.workgroupSize[1]),
          1
        ];
      },
      beforeDispatch: function (pass, owner) {
        pass.bindGroups = [self.createBindGroup(pass, owner, device)];
      },
      afterDispatch: function () {
        harness.swap(self.temperatureStateId);
      }
    });

    return {
      width: dims.width,
      height: dims.height,
      byteLength: byteLength,
      config: config,
      state: this.state,
      pass: harness.getState ? harness.passes[this.passId] : null
    };
  },

  dispatch: function (commandEncoder, device) {
    if (!PS.sim || !PS.sim.computeHarness) {
      throw new Error("Compute harness is required for heat diffusion dispatch");
    }

    return PS.sim.computeHarness.dispatch(this.passId, commandEncoder, device);
  }
};
