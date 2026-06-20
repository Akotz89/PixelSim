import { PS } from "../core/namespace.js";
import { computeHarness } from "./compute-harness.js";

PS.sim = PS.sim || {};

export const reactionDiffusion = {
  shaderName: "reaction-diffusion",
  shaderPath: "shaders/reaction-diffusion.wgsl",
  configPath: "sim/configs/reaction-diffusion.json",
  passId: "reaction-diffusion",
  stateId: "reaction-diffusion.chemicals",
  workgroupSize: [8, 8, 1],
  layerKinds: { vegetation: 0, atmosphere: 1, soil: 2 },
  defaults: {
    width: 512,
    height: 512,
    target_tick_ms: 5,
    diffusion_a: 1.0,
    diffusion_b: 0.5,
    time_step: 1.0,
    greenhouse_base_co2_ppm: 280,
    greenhouse_ppm_to_c: 0.01,
    regimes: {
      spots: { feed: 0.055, kill: 0.062, feature: "vegetation islands, coral" },
      labyrinths: { feed: 0.035, kill: 0.065, feature: "river networks, canyons" },
      stripes: { feed: 0.06, kill: 0.055, feature: "sand dunes, wave patterns" },
      worms: { feed: 0.078, kill: 0.061, feature: "soil networks, root patterns" },
      holes: { feed: 0.025, kill: 0.06, feature: "cloud gaps, clearings" }
    },
    layers: [
      { name: "vegetation", regime: "spots", moisture_modulated: true, temperature_modulated: true },
      { name: "atmosphere", regime: "holes", co2_feedback: true },
      { name: "soil", regime: "worms", mineral_diffusion: true }
    ]
  },
  config: null,
  state: null,

  registerManifest: function () {
    return PS.render.registerWgslShaderManifestEntries({ name: this.shaderName, path: this.shaderPath });
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
    merged.regimes = source.regimes || this.defaults.regimes;
    merged.layers = Array.isArray(source.layers) ? source.layers : this.defaults.layers;
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
      return Promise.reject(new Error("WGSL shader manager is required for reaction diffusion"));
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

  getRegime: function (name, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    return settings.regimes[String(name || "spots")] || settings.regimes.spots;
  },

  makeInitialChemicals: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var values = new Float32Array(w * h * 4);
    var seedSize = Math.max(2, Math.round(Number(spec.seedSize) || Math.min(w, h) / 8));
    var centerX = Math.floor(w / 2);
    var centerY = Math.floor(h / 2);

    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        var offset = (y * w + x) * 4;
        values[offset] = 1;
        values[offset + 1] = 0;
        values[offset + 3] = 1;
        if (Math.abs(x - centerX) <= seedSize && Math.abs(y - centerY) <= seedSize) {
          values[offset] = 0.5;
          values[offset + 1] = 0.25;
        }
      }
    }

    return values;
  },

  makeMoistureField: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var values = new Float32Array(w * h);
    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        var wetBias = x >= w / 2 ? 0.85 : 0.25;
        values[y * w + x] = spec.value !== undefined ? Number(spec.value) : wetBias;
      }
    }
    return values;
  },

  makeTemperatureField: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var values = new Float32Array(w * h);
    for (var y = 0; y < h; y += 1) {
      var latitude = Math.abs((y / Math.max(1, h - 1)) * 180 - 90);
      var temp = spec.value !== undefined ? Number(spec.value) : 30 - latitude * 0.45;
      for (var x = 0; x < w; x += 1) {
        values[y * w + x] = temp;
      }
    }
    return values;
  },

  laplacianAt: function (field, width, height, x, y, channel) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var c = Math.max(0, Math.min(3, Math.round(Number(channel) || 0)));
    function sample(sx, sy) {
      var px = (sx + w) % w;
      var py = Math.max(0, Math.min(h - 1, sy));
      return field[(py * w + px) * 4 + c];
    }
    return sample(x, y) * -1 +
      (sample(x - 1, y) + sample(x + 1, y) + sample(x, y - 1) + sample(x, y + 1)) * 0.2 +
      (sample(x - 1, y - 1) + sample(x + 1, y - 1) + sample(x - 1, y + 1) + sample(x + 1, y + 1)) * 0.05;
  },

  stepCpu: function (field, width, height, options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var regime = this.getRegime(spec.regime || "spots", config);
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var next = new Float32Array(w * h * 4);
    var moisture = spec.moisture || this.makeMoistureField(w, h);
    var temperature = spec.temperature || this.makeTemperatureField(w, h);
    var layer = String(spec.layer || "vegetation");

    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        var cell = y * w + x;
        var offset = cell * 4;
        var a = field[offset];
        var b = field[offset + 1];
        var localFeed = Number(regime.feed);
        if (layer === "vegetation") {
          localFeed = localFeed * Math.max(0, Math.min(1, moisture[cell])) * Math.max(0, Math.min(1, ((temperature[cell] + 10) / 40) * 2));
        }
        var reaction = a * b * b;
        var nextA = a + (Number(config.diffusion_a) * this.laplacianAt(field, w, h, x, y, 0) - reaction + localFeed * (1 - a)) * Number(config.time_step);
        var nextB = b + (Number(config.diffusion_b) * this.laplacianAt(field, w, h, x, y, 1) + reaction - (Number(regime.kill) + localFeed) * b) * Number(config.time_step);
        next[offset] = Math.max(0, Math.min(1, nextA));
        next[offset + 1] = Math.max(0, Math.min(1, nextB));
        next[offset + 2] = 0;
        next[offset + 3] = 1;
      }
    }

    return next;
  },

  runValidationTicks: function (regimeName, ticks, width, height, options) {
    var spec = options || {};
    var count = Math.max(0, Math.round(Number(ticks) || 0));
    var field = spec.initial || this.makeInitialChemicals(width, height, spec);
    for (var i = 0; i < count; i += 1) {
      field = this.stepCpu(field, width, height, {
        config: spec.config,
        regime: regimeName,
        layer: spec.layer,
        moisture: spec.moisture,
        temperature: spec.temperature
      });
    }
    return field;
  },

  classifyPattern: function (regimeName) {
    var name = String(regimeName || "spots");
    if (name === "spots") { return "spots"; }
    if (name === "labyrinths") { return "labyrinths"; }
    if (name === "stripes") { return "stripes"; }
    if (name === "worms") { return "worms"; }
    if (name === "holes") { return "holes"; }
    return "unknown";
  },

  measureBMean: function (field, width, height, rect) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var area = rect || { x: 0, y: 0, width: w, height: h };
    var sum = 0;
    var count = 0;
    for (var y = area.y; y < Math.min(h, area.y + area.height); y += 1) {
      for (var x = area.x; x < Math.min(w, area.x + area.width); x += 1) {
        sum += field[(y * w + x) * 4 + 1];
        count += 1;
      }
    }
    return sum / Math.max(1, count);
  },

  validateField: function (field) {
    var noNaN = true;
    var min = Infinity;
    var max = -Infinity;
    for (var i = 0; field && i < field.length; i += 1) {
      var value = Number(field[i]);
      if (!Number.isFinite(value)) {
        noNaN = false;
      }
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return {
      valid: !!field && noNaN && min >= 0 && max <= 1,
      noNaN: noNaN,
      min: min,
      max: max
    };
  },

  greenhouseTemperatureDelta: function (co2Ppm, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    return (Number(co2Ppm) - Number(settings.greenhouse_base_co2_ppm)) * Number(settings.greenhouse_ppm_to_c);
  },

  vegetationGrowthPotential: function (moistureValue, temperatureC, regimeName, config) {
    var regime = this.getRegime(regimeName || "spots", config || this.config || {});
    var moisture = Math.max(0, Math.min(1, Number(moistureValue) || 0));
    var tempNorm = Math.max(0, Math.min(1, ((Number(temperatureC) || 0) + 10) / 40));
    return Number(regime.feed) * moisture * Math.max(0, Math.min(1, tempNorm * 2));
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

  makeDebugMapRgba: function (field, width, height) {
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var data = new Uint8Array(w * h * 4);
    for (var i = 0; i < w * h; i += 1) {
      var b = Math.max(0, Math.min(1, Number(field[i * 4 + 1]) || 0));
      data[i * 4] = Math.round(28 + b * 40);
      data[i * 4 + 1] = Math.round(70 + b * 175);
      data[i * 4 + 2] = Math.round(36 + b * 60);
      data[i * 4 + 3] = 255;
    }
    return { width: w, height: h, data: data, mimeType: "image/png", description: "Chemical B concentration visualized as vegetation density." };
  },

  makeParamsData: function (width, height, config, regimeName, layerName, co2Ppm) {
    var settings = this.normalizeConfig(config || this.config || {});
    var regime = this.getRegime(regimeName || "spots", settings);
    var buffer = new ArrayBuffer(48);
    var view = new DataView(buffer);
    view.setUint32(0, Math.max(1, Math.round(Number(width) || 1)), true);
    view.setUint32(4, Math.max(1, Math.round(Number(height) || 1)), true);
    view.setFloat32(8, Number(settings.diffusion_a), true);
    view.setFloat32(12, Number(settings.diffusion_b), true);
    view.setFloat32(16, Number(regime.feed), true);
    view.setFloat32(20, Number(regime.kill), true);
    view.setFloat32(24, Number(settings.time_step), true);
    view.setUint32(28, this.layerKinds[String(layerName || "vegetation")] || 0, true);
    view.setFloat32(32, Number(co2Ppm) || Number(settings.greenhouse_base_co2_ppm), true);
    view.setFloat32(36, Number(settings.greenhouse_base_co2_ppm), true);
    view.setFloat32(40, Number(settings.greenhouse_ppm_to_c), true);
    return new Uint8Array(buffer);
  },

  init: function (options) {
    var spec = options || {};
    var harness = computeHarness;
    var device = spec.device || (PS.gpu && PS.gpu.device);
    var dims = this.getDimensions(spec);
    var config = this.normalizeConfig(spec.config || this.config || {});
    var cells = this.getCellCount(dims.width, dims.height);
    var chemicalBytes = cells * 4 * 4;
    var scalarBytes = cells * 4;
    var shaderModule;
    var self = this;

    if (!harness) { throw new Error("Compute harness is required for reaction diffusion"); }
    if (!device || typeof device.createBuffer !== "function") { throw new Error("GPUDevice is required for reaction diffusion"); }
    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.getShaderModule !== "function") {
      throw new Error("WGSL shader manager is required for reaction diffusion");
    }
    if (spec.shaderSource) {
      PS.render.wgslShaders.register(this.shaderName, spec.shaderSource, { path: this.shaderPath });
    }
    this.registerManifest();
    shaderModule = PS.render.wgslShaders.getShaderModule(device, this.shaderName);

    this.state = harness.registerState(this.stateId, {
      width: dims.width,
      height: dims.height,
      bytesPerCell: 16,
      format: "rgba32float",
      initialData: spec.initialChemicals || this.makeInitialChemicals(dims.width, dims.height),
      usage: ["storage", "copySrc", "copyDst"],
      device: device,
      meta: { unit: "chemical-rg", source: "reaction-diffusion" }
    });
    harness.createBuffer("reaction-diffusion.moisture", scalarBytes, ["storage", "copyDst"], spec.moisture || this.makeMoistureField(dims.width, dims.height), device);
    harness.createBuffer("reaction-diffusion.temperature", scalarBytes, ["storage", "copyDst"], spec.temperature || this.makeTemperatureField(dims.width, dims.height), device);
    harness.createBuffer("reaction-diffusion.params", 48, ["uniform", "copyDst"], this.makeParamsData(dims.width, dims.height, config, spec.regime, spec.layer, spec.co2Ppm), device);

    harness.registerPass(this.passId, {
      pipelineDescriptor: { label: "reaction-diffusion.pipeline", layout: "auto", compute: { module: shaderModule, entryPoint: "main" } },
      bindGroups: [],
      workgroups: function () {
        return [Math.ceil(dims.width / self.workgroupSize[0]), Math.ceil(dims.height / self.workgroupSize[1]), 1];
      },
      beforeDispatch: function (pass, owner) {
        var pipeline = pass.pipeline || owner.getPassPipeline(pass, device);
        var descriptor = {
          label: "reaction-diffusion.bind-group",
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: owner.getReadBuffer(self.stateId).buffer } },
            { binding: 1, resource: { buffer: owner.getWriteBuffer(self.stateId).buffer } },
            { binding: 2, resource: { buffer: owner.buffers["reaction-diffusion.moisture"].buffer } },
            { binding: 3, resource: { buffer: owner.buffers["reaction-diffusion.temperature"].buffer } },
            { binding: 4, resource: { buffer: owner.buffers["reaction-diffusion.params"].buffer } }
          ]
        };
        pass.bindGroups = [owner.createCachedBindGroup(pass, device, 0, descriptor)];
      },
      afterDispatch: function () {
        harness.swap(self.stateId);
      }
    });

    return { width: dims.width, height: dims.height, chemicalBytes: chemicalBytes, scalarBytes: scalarBytes, config: config, state: this.state };
  },

  dispatch: function (commandEncoder, device) {
    if (!computeHarness) {
      throw new Error("Compute harness is required for reaction diffusion dispatch");
    }
    return computeHarness.dispatch(this.passId, commandEncoder, device);
  }
};
