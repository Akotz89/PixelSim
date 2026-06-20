import { PS } from "../core/namespace.js";
import {
  getRuntimeDimensions,
  loadWgslRuntimeAssets,
  mergeRuntimeConfig,
  registerWgslManifest
} from "./gpu-sim-runtime.js";

PS.sim = PS.sim || {};

export const heatDiffusion = {
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
    return registerWgslManifest(this);
  },

  loadAssets: function (loader) {
    return loadWgslRuntimeAssets(this, loader, "WGSL shader manager is required for heat diffusion");
  },

  normalizeConfig: function (config) {
    var source = config || {};
    var merged = mergeRuntimeConfig(this, source);

    merged.albedo = source.albedo || this.defaults.albedo;
    return merged;
  },

  getDimensions: function (options) {
    return getRuntimeDimensions(this, options);
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

  applyGreenhouseForcing: function (forcing) {
    var value = Number(forcing) || 0;
    var harness = PS.sim && PS.sim.computeHarness;
    var dims = this.state || {};
    var width = Math.max(1, Math.round(Number(dims.width || (this.config && this.config.width) || 1)));
    var height = Math.max(1, Math.round(Number(dims.height || (this.config && this.config.height) || 1)));
    this.greenhouseForcing = value;
    if (harness && harness.buffers && harness.buffers["heat.greenhouse"] && typeof harness.writeBuffer === "function") {
      harness.writeBuffer("heat.greenhouse", this.makeScalarField(width, height, value));
    }
    return value;
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

  getRowAverage: function (field, width, row) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var y = Math.max(0, Math.round(Number(row) || 0));
    var sum = 0;
    var count = 0;

    for (var x = 0; x < w; x += 1) {
      var value = Number(field[y * w + x]);
      if (Number.isFinite(value)) {
        sum += value;
        count += 1;
      }
    }

    return count > 0 ? sum / count : NaN;
  },

  validateTemperatureField: function (field, width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var expectedCells = this.getCellCount(w, h);
    var equatorRow = Math.min(h - 1, Math.floor(h / 2));
    var northPoleRow = 0;
    var southPoleRow = h - 1;
    var tolerance = Number(spec.monotonicTolerance);
    var rowAverages = [];
    var noNaN = true;
    var finiteCount = 0;
    var min = Infinity;
    var max = -Infinity;
    var monotonicFromEquator = true;

    if (!Number.isFinite(tolerance)) {
      tolerance = 0.75;
    }

    if (!field || field.length < expectedCells) {
      return {
        valid: false,
        reason: "temperature field is missing or shorter than grid",
        expectedCells: expectedCells,
        actualCells: field && field.length ? field.length : 0
      };
    }

    for (var i = 0; i < expectedCells; i += 1) {
      var value = Number(field[i]);
      if (!Number.isFinite(value)) {
        noNaN = false;
      } else {
        finiteCount += 1;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }

    for (var y = 0; y < h; y += 1) {
      rowAverages[y] = this.getRowAverage(field, w, y);
    }

    for (var offset = 1; offset <= Math.max(equatorRow, h - 1 - equatorRow); offset += 1) {
      var center = rowAverages[equatorRow];
      var north = rowAverages[equatorRow - offset];
      var south = rowAverages[equatorRow + offset];
      if (Number.isFinite(north) && north > center + tolerance) {
        monotonicFromEquator = false;
      }
      if (Number.isFinite(south) && south > center + tolerance) {
        monotonicFromEquator = false;
      }
    }

    return {
      valid: noNaN && finiteCount === expectedCells && monotonicFromEquator,
      noNaN: noNaN,
      finiteCount: finiteCount,
      expectedCells: expectedCells,
      min: finiteCount > 0 ? min : NaN,
      max: finiteCount > 0 ? max : NaN,
      equatorC: rowAverages[equatorRow],
      northPoleC: rowAverages[northPoleRow],
      southPoleC: rowAverages[southPoleRow],
      polarC: (rowAverages[northPoleRow] + rowAverages[southPoleRow]) / 2,
      monotonicFromEquator: monotonicFromEquator
    };
  },

  makeTemperatureMapRgba: function (field, width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var cells = this.getCellCount(w, h);
    var min = Number.isFinite(Number(spec.min)) ? Number(spec.min) : -40;
    var max = Number.isFinite(Number(spec.max)) ? Number(spec.max) : 45;
    var span = Math.max(1, max - min);
    var data = new Uint8Array(cells * 4);

    for (var i = 0; i < cells; i += 1) {
      var value = Number(field && field[i]);
      var t = Number.isFinite(value) ? Math.max(0, Math.min(1, (value - min) / span)) : 0;
      var cold = Math.max(0, Math.min(1, 1 - t * 2));
      var warm = Math.max(0, Math.min(1, t * 2 - 1));
      var temperate = 1 - Math.abs(t * 2 - 1);
      var offset = i * 4;

      data[offset] = Math.round(36 + warm * 214 + temperate * 70);
      data[offset + 1] = Math.round(74 + temperate * 155 + warm * 42);
      data[offset + 2] = Math.round(116 + cold * 130 + temperate * 70);
      data[offset + 3] = 255;
    }

    return {
      width: w,
      height: h,
      data: data,
      mimeType: "image/png",
      extension: "png",
      description: "Temperature map RGBA export data: cold poles blue, temperate bands light, hot equator red."
    };
  },

  getStableTimeStep: function (config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var requested = Number.isFinite(Number(settings.time_step)) ? Math.max(0, Number(settings.time_step)) : this.defaults.time_step;
    var diffusivity = Number.isFinite(Number(settings.thermal_diffusivity))
      ? Math.max(0, Number(settings.thermal_diffusivity))
      : this.defaults.thermal_diffusivity;
    var spacing = Number.isFinite(Number(settings.grid_spacing)) ? Math.max(1e-9, Number(settings.grid_spacing)) : this.defaults.grid_spacing;
    var cflLimit = diffusivity > 0 ? (spacing * spacing) / (4 * diffusivity) : requested;

    return Math.min(requested, cflLimit);
  },

  runTicks: function (ticks, options) {
    var spec = options || {};
    var count = Math.max(0, Math.round(Number(ticks) || 0));
    var now = Date && typeof Date.now === "function" ? Date.now : function () { return new Date().getTime(); };
    var started = now();

    for (var i = 0; i < count; i += 1) {
      this.dispatch(spec.commandEncoder, spec.device);
    }

    return {
      ticks: count,
      elapsedMs: Math.max(0, now() - started),
      dispatchesPerSecond: count > 0 && now() > started ? count / ((now() - started) / 1000) : 0
    };
  },

  makeParamsData: function (width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var buffer = new ArrayBuffer(48);
    var view = new DataView(buffer);

    view.setUint32(0, Math.max(1, Math.round(Number(width) || 1)), true);
    view.setUint32(4, Math.max(1, Math.round(Number(height) || 1)), true);
    view.setFloat32(8, Number(settings.thermal_diffusivity) || this.defaults.thermal_diffusivity, true);
    view.setFloat32(12, this.getStableTimeStep(settings), true);
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
        var pipeline = pass.pipeline || owner.getPassPipeline(pass, device);
        var descriptor = {
          label: "heat-diffusion.bind-group",
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: owner.getReadBuffer(self.temperatureStateId).buffer } },
            { binding: 1, resource: { buffer: owner.getWriteBuffer(self.temperatureStateId).buffer } },
            { binding: 2, resource: { buffer: owner.buffers["heat.elevation"].buffer } },
            { binding: 3, resource: { buffer: owner.buffers["heat.albedo"].buffer } },
            { binding: 4, resource: { buffer: owner.buffers["heat.greenhouse"].buffer } },
            { binding: 5, resource: { buffer: owner.buffers["heat.params"].buffer } }
          ]
        };
        pass.bindGroups = [owner.createCachedBindGroup(pass, device, 0, descriptor)];
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
