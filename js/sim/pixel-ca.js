import { PS } from "../core/namespace.js";
import { computeHarness } from "./compute-harness.js";

PS.sim = PS.sim || {};

export const pixelCa = {
  shaderName: "pixel-ca",
  shaderPath: "shaders/pixel-ca.wgsl",
  configPath: "sim/configs/pixel-ca.json",
  passId: "pixel-ca",
  stateId: "pixel-ca.elements",
  workgroupSize: [8, 8, 1],
  elements: {
    empty: 0,
    water: 1,
    seaWater: 2,
    ice: 3,
    snow: 4,
    lava: 5,
    steam: 6,
    gas: 7,
    soil: 8,
    sand: 9,
    rock: 10,
    organic: 11,
    salt: 12
  },
  flags: {
    movedThisTick: 1,
    onFire: 2
  },
  defaults: {
    width: 512,
    height: 512,
    target_tick_ms: 5,
    element_count: 13,
    mass_tolerance: 0.001,
    surface_depth_m: 100,
    lbm_boundary: "coast-shallow-water",
    temperature_thresholds_c: {
      ice_melt: 0,
      steam_condense: 100,
      lava_solidify: 700,
      rock_melt: 1200
    }
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
    merged.temperature_thresholds_c = source.temperature_thresholds_c || this.defaults.temperature_thresholds_c;
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
      return Promise.reject(new Error("WGSL shader manager is required for pixel CA"));
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
      width: Math.max(2, Math.round(Number(spec.width || config.width || this.defaults.width))),
      height: Math.max(2, Math.round(Number(spec.height || config.height || this.defaults.height)))
    };
  },

  getCellCount: function (width, height) {
    return Math.max(1, Math.round(Number(width) || 1)) * Math.max(1, Math.round(Number(height) || 1));
  },

  getElementName: function (id) {
    var target = Math.max(0, Math.round(Number(id) || 0));
    var names = Object.keys(this.elements);
    for (var i = 0; i < names.length; i += 1) {
      if (this.elements[names[i]] === target) {
        return names[i];
      }
    }
    return "unknown";
  },

  packCell: function (elementType, temperatureQ, salinityQ, flags) {
    return ((Math.max(0, Math.round(Number(elementType) || 0)) & 255) |
      ((Math.max(0, Math.round(Number(temperatureQ) || 0)) & 255) << 8) |
      ((Math.max(0, Math.round(Number(salinityQ) || 0)) & 255) << 16) |
      ((Math.max(0, Math.round(Number(flags) || 0)) & 255) << 24)) >>> 0;
  },

  unpackCell: function (cell) {
    var value = (Number(cell) || 0) >>> 0;
    return {
      element: value & 255,
      temperatureQ: (value >>> 8) & 255,
      salinityQ: (value >>> 16) & 255,
      flags: (value >>> 24) & 255
    };
  },

  quantizeTemperature: function (temperatureC) {
    return Math.max(0, Math.min(255, Math.round(((Number(temperatureC) || 0) + 100) / 1400 * 255)));
  },

  densityRank: function (element) {
    var e = Math.max(0, Math.round(Number(element) || 0));
    if (e === this.elements.lava || e === this.elements.rock) { return 6; }
    if (e === this.elements.sand || e === this.elements.soil || e === this.elements.salt) { return 5; }
    if (e === this.elements.seaWater) { return 4; }
    if (e === this.elements.water) { return 3; }
    if (e === this.elements.ice || e === this.elements.snow || e === this.elements.organic) { return 2; }
    if (e === this.elements.steam || e === this.elements.gas) { return 1; }
    return 0;
  },

  canSink: function (upper, lower) {
    var upperType = this.unpackCell(upper).element;
    var lowerType = this.unpackCell(lower).element;
    return lowerType !== this.elements.rock &&
      lowerType !== this.elements.ice &&
      this.densityRank(upperType) > this.densityRank(lowerType);
  },

  withElement: function (cell, element) {
    var parts = this.unpackCell(cell);
    return this.packCell(element, parts.temperatureQ, parts.salinityQ, parts.flags | this.flags.movedThisTick);
  },

  applyThermalTransition: function (cell, temperatureC, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var thresholds = settings.temperature_thresholds_c;
    var element = this.unpackCell(cell).element;
    if ((element === this.elements.ice || element === this.elements.snow) && temperatureC > Number(thresholds.ice_melt)) {
      return this.withElement(cell, this.elements.water);
    }
    if (element === this.elements.steam && temperatureC < Number(thresholds.steam_condense)) {
      return this.withElement(cell, this.elements.water);
    }
    if (element === this.elements.lava && temperatureC < Number(thresholds.lava_solidify)) {
      return this.withElement(cell, this.elements.rock);
    }
    if (element === this.elements.rock && temperatureC > Number(thresholds.rock_melt)) {
      return this.withElement(cell, this.elements.lava);
    }
    return cell;
  },

  applyBlockRules: function (tl, tr, bl, br, tempTop, tempBottom, config) {
    var block = {
      tl: this.applyThermalTransition(tl, tempTop, config),
      tr: this.applyThermalTransition(tr, tempTop, config),
      bl: this.applyThermalTransition(bl, tempBottom, config),
      br: this.applyThermalTransition(br, tempBottom, config)
    };
    var swap;

    if (this.canSink(block.tl, block.bl)) {
      swap = block.tl; block.tl = block.bl; block.bl = swap;
    }
    if (this.canSink(block.tr, block.br)) {
      swap = block.tr; block.tr = block.br; block.br = swap;
    }
    if (this.canSink(block.tl, block.br) && this.unpackCell(block.bl).element !== this.elements.empty) {
      swap = block.tl; block.tl = block.br; block.br = swap;
    }
    if (this.canSink(block.tr, block.bl) && this.unpackCell(block.br).element !== this.elements.empty) {
      swap = block.tr; block.tr = block.bl; block.bl = swap;
    }
    if (this.unpackCell(block.bl).element === this.elements.steam && this.densityRank(this.unpackCell(block.tl).element) > this.densityRank(this.elements.steam)) {
      swap = block.bl; block.bl = block.tl; block.tl = swap;
    }
    if (this.unpackCell(block.br).element === this.elements.steam && this.densityRank(this.unpackCell(block.tr).element) > this.densityRank(this.elements.steam)) {
      swap = block.br; block.br = block.tr; block.tr = swap;
    }
    return block;
  },

  makeInitialElements: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(2, Math.round(Number(width) || 2));
    var h = Math.max(2, Math.round(Number(height) || 2));
    var values = new Uint32Array(w * h);
    values.fill(this.packCell(this.elements.empty, this.quantizeTemperature(20), 0, 0));
    if (spec.layers !== false) {
      for (var y = Math.floor(h / 2); y < h; y += 1) {
        for (var x = 0; x < w; x += 1) {
          values[y * w + x] = this.packCell(this.elements.soil, this.quantizeTemperature(15), 0, 0);
        }
      }
      for (var wx = Math.floor(w * 0.25); wx < Math.floor(w * 0.75); wx += 1) {
        values[(Math.floor(h / 2) - 1) * w + wx] = this.packCell(this.elements.water, this.quantizeTemperature(15), 0, 0);
      }
    }
    return values;
  },

  makeTemperatureField: function (width, height, value) {
    var values = new Float32Array(this.getCellCount(width, height));
    values.fill(Number(value) || 20);
    return values;
  },

  makeVectorField: function (width, height) {
    return new Float32Array(this.getCellCount(width, height) * 4);
  },

  stepCpu: function (field, width, height, options) {
    var spec = options || {};
    var config = this.normalizeConfig(spec.config || this.config || {});
    var w = Math.max(2, Math.round(Number(width) || 2));
    var h = Math.max(2, Math.round(Number(height) || 2));
    var tick = Math.max(0, Math.round(Number(spec.tick) || 0));
    var offset = tick % 2;
    var source = field || this.makeInitialElements(w, h);
    var next = new Uint32Array(source);
    var temperature = spec.temperature || this.makeTemperatureField(w, h, 20);

    function index(x, y) {
      var px = ((x % w) + w) % w;
      var py = Math.max(0, Math.min(h - 1, y));
      return py * w + px;
    }

    for (var y = offset; y < h; y += 2) {
      for (var x = offset; x < w; x += 2) {
        var tl = index(x, y);
        var tr = index(x + 1, y);
        var bl = index(x, y + 1);
        var br = index(x + 1, y + 1);
        var result = this.applyBlockRules(source[tl], source[tr], source[bl], source[br], temperature[tl], temperature[bl], config);
        next[tl] = result.tl;
        next[tr] = result.tr;
        next[bl] = result.bl;
        next[br] = result.br;
      }
    }

    return next;
  },

  countElements: function (field) {
    var counts = {};
    for (var i = 0; field && i < field.length; i += 1) {
      var id = this.unpackCell(field[i]).element;
      counts[id] = (counts[id] || 0) + 1;
    }
    return counts;
  },

  countWaterMass: function (field) {
    var total = 0;
    for (var i = 0; field && i < field.length; i += 1) {
      var element = this.unpackCell(field[i]).element;
      if (element === this.elements.water || element === this.elements.seaWater || element === this.elements.ice || element === this.elements.snow || element === this.elements.steam) {
        total += 1;
      }
    }
    return total;
  },

  validateMassConservation: function (before, after, tolerance) {
    var start = this.countWaterMass(before);
    var end = this.countWaterMass(after);
    var relative = Math.abs(end - start) / Math.max(1, start);
    return { valid: relative <= (Number(tolerance) || this.defaults.mass_tolerance), before: start, after: end, relativeError: relative };
  },

  validateNoCheckerboard: function (field, width, height) {
    var w = Math.max(2, Math.round(Number(width) || 2));
    var h = Math.max(2, Math.round(Number(height) || 2));
    var even = 0;
    var odd = 0;
    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        if (this.unpackCell(field[y * w + x]).element !== this.elements.empty) {
          if ((x + y) % 2 === 0) { even += 1; } else { odd += 1; }
        }
      }
    }
    return { valid: Math.abs(even - odd) / Math.max(1, even + odd) < 0.35, even: even, odd: odd };
  },

  getLbmHandoffDescriptor: function (width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var dims = this.getDimensions({ width: width, height: height, config: settings });
    return {
      id: "pixel-ca.lbm-boundary",
      boundary: settings.lbm_boundary,
      surfaceDepthM: Number(settings.surface_depth_m),
      reads: ["ocean.velocity", "ocean.mask"],
      writes: ["pixel-ca.elements"],
      width: dims.width,
      height: dims.height
    };
  },

  makeParamsData: function (width, height, config, tick) {
    var settings = this.normalizeConfig(config || this.config || {});
    var thresholds = settings.temperature_thresholds_c;
    var buffer = new ArrayBuffer(32);
    var view = new DataView(buffer);
    view.setUint32(0, Math.max(2, Math.round(Number(width) || 2)), true);
    view.setUint32(4, Math.max(2, Math.round(Number(height) || 2)), true);
    view.setUint32(8, Math.max(0, Math.round(Number(tick) || 0)), true);
    view.setUint32(12, Number(settings.element_count) || 13, true);
    view.setFloat32(16, Number(thresholds.ice_melt), true);
    view.setFloat32(20, Number(thresholds.steam_condense), true);
    view.setFloat32(24, Number(thresholds.lava_solidify), true);
    view.setFloat32(28, Number(thresholds.rock_melt), true);
    return new Uint8Array(buffer);
  },

  getPerformanceContract: function (width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var dims = this.getDimensions({ width: width || settings.width, height: height || settings.height, config: settings });
    return {
      width: dims.width,
      height: dims.height,
      targetTickMs: Number(settings.target_tick_ms) || this.defaults.target_tick_ms,
      workgroupSize: this.workgroupSize.slice(),
      expectedWorkgroups: [Math.ceil(dims.width / 2 / this.workgroupSize[0]), Math.ceil(dims.height / 2 / this.workgroupSize[1]), 1],
      cells: dims.width * dims.height
    };
  },

  init: function (options) {
    var spec = options || {};
    var harness = computeHarness;
    var device = spec.device || (PS.gpu && PS.gpu.device);
    var dims = this.getDimensions(spec);
    var config = this.normalizeConfig(spec.config || this.config || {});
    var cells = this.getCellCount(dims.width, dims.height);
    var elementBytes = cells * 4;
    var scalarBytes = cells * 4;
    var vectorBytes = cells * 4 * 4;
    var shaderModule;
    var self = this;

    if (!harness) { throw new Error("Compute harness is required for pixel CA"); }
    if (!device || typeof device.createBuffer !== "function") { throw new Error("GPUDevice is required for pixel CA"); }
    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.getShaderModule !== "function") {
      throw new Error("WGSL shader manager is required for pixel CA");
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
      format: "uint32",
      initialData: spec.initialElements || this.makeInitialElements(dims.width, dims.height),
      usage: ["storage", "copySrc", "copyDst"],
      device: device,
      meta: { unit: "packed-u32-element", source: "pixel-ca" }
    });
    harness.createBuffer("pixel-ca.temperature", scalarBytes, ["storage", "copyDst"], spec.temperature || this.makeTemperatureField(dims.width, dims.height, 20), device);
    harness.createBuffer("pixel-ca.lbmVelocity", vectorBytes, ["storage", "copyDst"], spec.lbmVelocity || this.makeVectorField(dims.width, dims.height), device);
    harness.createBuffer("pixel-ca.heatSource", scalarBytes, ["storage", "copySrc", "copyDst"], spec.heatSource || new Float32Array(cells), device);
    harness.createBuffer("pixel-ca.params", 32, ["uniform", "copyDst"], this.makeParamsData(dims.width, dims.height, config, spec.tick), device);

    harness.registerPass(this.passId, {
      pipelineDescriptor: { label: "pixel-ca.pipeline", layout: "auto", compute: { module: shaderModule, entryPoint: "ca_step" } },
      bindGroups: [],
      workgroups: function () {
        return [Math.ceil(dims.width / 2 / self.workgroupSize[0]), Math.ceil(dims.height / 2 / self.workgroupSize[1]), 1];
      },
      beforeDispatch: function (pass, owner) {
        var pipeline = pass.pipeline || owner.getPassPipeline(pass, device);
        var descriptor = {
          label: "pixel-ca.bind-group",
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: owner.getReadBuffer(self.stateId).buffer } },
            { binding: 1, resource: { buffer: owner.getWriteBuffer(self.stateId).buffer } },
            { binding: 2, resource: { buffer: owner.buffers["pixel-ca.temperature"].buffer } },
            { binding: 3, resource: { buffer: owner.buffers["pixel-ca.lbmVelocity"].buffer } },
            { binding: 4, resource: { buffer: owner.buffers["pixel-ca.heatSource"].buffer } },
            { binding: 5, resource: { buffer: owner.buffers["pixel-ca.params"].buffer } }
          ]
        };
        pass.bindGroups = [owner.createCachedBindGroup(pass, device, 0, descriptor)];
      },
      afterDispatch: function () {
        harness.swap(self.stateId);
      }
    });

    return {
      width: dims.width,
      height: dims.height,
      elementBytes: elementBytes,
      scalarBytes: scalarBytes,
      vectorBytes: vectorBytes,
      lbmHandoff: this.getLbmHandoffDescriptor(dims.width, dims.height, config),
      config: config,
      state: this.state
    };
  },

  dispatch: function (commandEncoder, device) {
    if (!computeHarness) {
      throw new Error("Compute harness is required for pixel CA dispatch");
    }
    return computeHarness.dispatch(this.passId, commandEncoder, device);
  }
};
