"use strict";
PS.sim = PS.sim || {};

PS.sim.lbmOcean = PS.sim.lbmOcean || {
  shaderName: "lbm-ocean",
  shaderPath: "shaders/lbm-ocean.wgsl",
  configPath: "sim/configs/ocean.json",
  passId: "lbm-ocean",
  distributionStateId: "ocean.distribution",
  workgroupSize: [8, 8, 1],
  velocities: [
    [0, 0],
    [1, 0],
    [0, -1],
    [-1, 0],
    [0, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
    [1, 1]
  ],
  weights: [
    4 / 9,
    1 / 9,
    1 / 9,
    1 / 9,
    1 / 9,
    1 / 36,
    1 / 36,
    1 / 36,
    1 / 36
  ],
  opposite: [0, 3, 4, 1, 2, 7, 8, 5, 6],
  defaults: {
    width: 512,
    height: 512,
    kinematic_viscosity: 0.1,
    coriolis_omega: 0.00007292115,
    max_surface_velocity_mps: 2,
    mass_tolerance: 0.0001,
    target_tick_ms: 15,
    arrow_stride: 8,
    layers: [
      { name: "surface", depth_m: 200, tau: 0.8, wind_coupling: 0.1 },
      { name: "thermocline", depth_m: 1000, tau: 1.2, wind_coupling: 0 },
      { name: "deep", depth_m: 4000, tau: 2.0, wind_coupling: 0 }
    ],
    layer_exchange: "density_driven"
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
    var configPromise = assetLoader && typeof assetLoader.loadJSON === "function"
      ? assetLoader.loadJSON(this.configPath)
      : Promise.resolve(this.defaults);
    var shaderPromise;

    this.registerManifest();

    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.loadFromFile !== "function") {
      shaderPromise = Promise.reject(new Error("WGSL shader manager is required for LBM ocean"));
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

    merged.layers = Array.isArray(source.layers) && source.layers.length > 0 ? source.layers : this.defaults.layers;
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

  getDistributionLength: function (width, height) {
    return this.getCellCount(width, height) * 9;
  },

  getLayer: function (config, name) {
    var settings = this.normalizeConfig(config || this.config || {});
    var target = String(name || "surface");

    for (var i = 0; i < settings.layers.length; i += 1) {
      if (settings.layers[i].name === target) {
        return settings.layers[i];
      }
    }

    return settings.layers[0];
  },

  equilibrium: function (direction, rho, ux, uy) {
    var i = Math.max(0, Math.min(8, Math.round(Number(direction) || 0)));
    var density = Number.isFinite(Number(rho)) ? Number(rho) : 1;
    var vx = Number(ux) || 0;
    var vy = Number(uy) || 0;
    var e = this.velocities[i];
    var eu = e[0] * vx + e[1] * vy;
    var uu = vx * vx + vy * vy;
    return this.weights[i] * density * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * uu);
  },

  makeInitialDistributions: function (width, height, options) {
    var spec = options || {};
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells * 9);
    var rho = Number.isFinite(Number(spec.rho)) ? Number(spec.rho) : 1;
    var ux = Number(spec.ux) || 0;
    var uy = Number(spec.uy) || 0;

    for (var cell = 0; cell < cells; cell += 1) {
      for (var i = 0; i < 9; i += 1) {
        values[cell * 9 + i] = this.equilibrium(i, rho, ux, uy);
      }
    }

    return values;
  },

  makeOceanMask: function (width, height, options) {
    var spec = options || {};
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells);
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var coastBand = Math.max(0, Math.round(Number(spec.coastBand) || 0));

    values.fill(1);

    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        if (x < coastBand || y < coastBand || x >= w - coastBand || y >= h - coastBand) {
          values[y * w + x] = 0;
        }
      }
    }

    if (spec.landMask) {
      for (var i = 0; i < Math.min(cells, spec.landMask.length); i += 1) {
        values[i] = spec.landMask[i] > 0 ? 0 : values[i];
      }
    }

    return values;
  },

  makeWindField: function (width, height, options) {
    var spec = options || {};
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells * 2);
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var strength = Number.isFinite(Number(spec.strength)) ? Number(spec.strength) : 0.012;

    for (var y = 0; y < h; y += 1) {
      var latitude = (y / Math.max(1, h - 1)) * 180 - 90;
      var trade = Math.abs(latitude) < 30 ? -1 : (Math.abs(latitude) < 60 ? 1 : -0.45);
      for (var x = 0; x < w; x += 1) {
        var offset = (y * w + x) * 2;
        values[offset] = trade * strength;
        values[offset + 1] = Math.sin((x / Math.max(1, w)) * Math.PI * 2) * strength * 0.25;
      }
    }

    return values;
  },

  makeBathymetryField: function (width, height, options) {
    var spec = options || {};
    var cells = this.getCellCount(width, height);
    var values = new Float32Array(cells);
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var shelfDepth = Number.isFinite(Number(spec.shelfDepthM)) ? Number(spec.shelfDepthM) : -200;
    var deepDepth = Number.isFinite(Number(spec.deepDepthM)) ? Number(spec.deepDepthM) : -4000;

    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        var nx = Math.abs((x / Math.max(1, w - 1)) * 2 - 1);
        var ny = Math.abs((y / Math.max(1, h - 1)) * 2 - 1);
        var shelf = Math.max(nx, ny);
        values[y * w + x] = shelf > 0.84 ? 25 : shelfDepth + (1 - shelf) * (deepDepth - shelfDepth);
      }
    }

    if (spec.oceanMask) {
      for (var i = 0; i < Math.min(cells, spec.oceanMask.length); i += 1) {
        if (spec.oceanMask[i] <= 0.5) {
          values[i] = Math.max(1, values[i]);
        }
      }
    }

    return values;
  },

  makeParamsData: function (width, height, config, layerName) {
    var settings = this.normalizeConfig(config || this.config || {});
    var layer = this.getLayer(settings, layerName || "surface");
    var buffer = new ArrayBuffer(32);
    var view = new DataView(buffer);

    view.setUint32(0, Math.max(1, Math.round(Number(width) || 1)), true);
    view.setUint32(4, Math.max(1, Math.round(Number(height) || 1)), true);
    view.setFloat32(8, Number(layer.tau) || 0.8, true);
    view.setFloat32(12, Number(layer.wind_coupling) || 0, true);
    view.setFloat32(16, Number(settings.coriolis_omega) || this.defaults.coriolis_omega, true);
    view.setFloat32(20, Number(settings.max_surface_velocity_mps) || this.defaults.max_surface_velocity_mps, true);
    view.setFloat32(24, Number(layer.depth_m) || 200, true);
    view.setFloat32(28, 0, true);

    return new Uint8Array(buffer);
  },

  sumMass: function (distributions) {
    var sum = 0;
    for (var i = 0; distributions && i < distributions.length; i += 1) {
      sum += Number(distributions[i]) || 0;
    }
    return sum;
  },

  validateNoNaN: function (distributions) {
    for (var i = 0; distributions && i < distributions.length; i += 1) {
      if (!Number.isFinite(Number(distributions[i]))) {
        return false;
      }
    }
    return !!distributions;
  },

  validateMassConservation: function (before, after, tolerance) {
    var start = this.sumMass(before);
    var end = this.sumMass(after);
    var limit = Number.isFinite(Number(tolerance)) ? Number(tolerance) : this.defaults.mass_tolerance;
    var relativeError = Math.abs(end - start) / Math.max(1e-9, Math.abs(start));

    return {
      valid: relativeError <= limit,
      before: start,
      after: end,
      relativeError: relativeError,
      tolerance: limit
    };
  },

  getPerformanceContract: function (width, height, config) {
    var settings = this.normalizeConfig(config || this.config || {});
    var cells = this.getCellCount(width || settings.width, height || settings.height);
    var distributionsPerTick = cells * 9;

    return {
      width: Math.max(1, Math.round(Number(width || settings.width) || this.defaults.width)),
      height: Math.max(1, Math.round(Number(height || settings.height) || this.defaults.height)),
      distributionsPerTick: distributionsPerTick,
      targetTickMs: Number(settings.target_tick_ms) || this.defaults.target_tick_ms,
      workgroupSize: this.workgroupSize.slice(),
      expectedWorkgroups: [
        Math.ceil(Math.max(1, Math.round(Number(width || settings.width) || this.defaults.width)) / this.workgroupSize[0]),
        Math.ceil(Math.max(1, Math.round(Number(height || settings.height) || this.defaults.height)) / this.workgroupSize[1]),
        1
      ]
    };
  },

  computeMacroscopic: function (distributions, width, height, oceanMask) {
    var cells = this.getCellCount(width, height);
    var density = new Float32Array(cells);
    var velocityX = new Float32Array(cells);
    var velocityY = new Float32Array(cells);

    for (var cell = 0; cell < cells; cell += 1) {
      var rho = 0;
      var ux = 0;
      var uy = 0;

      for (var i = 0; i < 9; i += 1) {
        var f = Number(distributions[cell * 9 + i]) || 0;
        rho += f;
        ux += this.velocities[i][0] * f;
        uy += this.velocities[i][1] * f;
      }

      density[cell] = rho;
      if (!oceanMask || oceanMask[cell] > 0.5) {
        velocityX[cell] = rho > 1e-9 ? ux / rho : 0;
        velocityY[cell] = rho > 1e-9 ? uy / rho : 0;
      }
    }

    return {
      density: density,
      velocityX: velocityX,
      velocityY: velocityY
    };
  },

  coriolisDeflection: function (latitudeDegrees, eastMps, northMps, omega) {
    var latitude = Number(latitudeDegrees) * Math.PI / 180;
    var f = 2 * (Number(omega) || this.defaults.coriolis_omega) * Math.sin(latitude);
    var north = Number(northMps) || 0;
    var east = Number(eastMps) || 0;
    return {
      eastMps2: f * north,
      northMps2: -f * east
    };
  },

  stepCpu: function (distributions, width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var cells = this.getCellCount(w, h);
    var next = new Float32Array(cells * 9);
    var mask = spec.oceanMask || this.makeOceanMask(w, h);
    var wind = spec.wind || this.makeWindField(w, h);
    var tau = Math.max(0.501, Number(spec.tau) || 0.8);
    var windCoupling = Number.isFinite(Number(spec.windCoupling)) ? Number(spec.windCoupling) : 0.1;
    var maxVelocity = Number.isFinite(Number(spec.maxVelocity)) ? Number(spec.maxVelocity) : this.defaults.max_surface_velocity_mps;

    function cellIndex(x, y) {
      return y * w + ((x + w) % w);
    }

    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        var cell = y * w + x;

        if (mask[cell] <= 0.5) {
          for (var blocked = 0; blocked < 9; blocked += 1) {
            next[cell * 9 + blocked] = distributions[cell * 9 + this.opposite[blocked]];
          }
          continue;
        }

        var fValues = new Array(9);
        var rho = 0;
        var ux = 0;
        var uy = 0;

        for (var i = 0; i < 9; i += 1) {
          var e = this.velocities[i];
          var sourceY = Math.max(0, Math.min(h - 1, y - e[1]));
          var source = cellIndex(x - e[0], sourceY);
          var value = mask[source] > 0.5
            ? distributions[source * 9 + i]
            : distributions[cell * 9 + this.opposite[i]];

          fValues[i] = value;
          rho += value;
          ux += e[0] * value;
          uy += e[1] * value;
        }

        ux = rho > 1e-9 ? ux / rho : 0;
        uy = rho > 1e-9 ? uy / rho : 0;

        var windOffset = cell * 2;
        var deflection = this.coriolisDeflection((y / Math.max(1, h - 1)) * 180 - 90, ux, -uy);
        ux += wind[windOffset] * windCoupling + deflection.eastMps2;
        uy += wind[windOffset + 1] * windCoupling - deflection.northMps2;

        var speed = Math.sqrt(ux * ux + uy * uy);
        if (speed > maxVelocity) {
          ux = ux / speed * maxVelocity;
          uy = uy / speed * maxVelocity;
        }

        for (var out = 0; out < 9; out += 1) {
          var feq = this.equilibrium(out, rho, ux, uy);
          next[cell * 9 + out] = fValues[out] - (fValues[out] - feq) / tau;
        }
      }
    }

    return next;
  },

  validateCoastlineBounce: function (macroscopic, oceanMask) {
    var blockedVelocity = 0;

    for (var i = 0; oceanMask && i < oceanMask.length; i += 1) {
      if (oceanMask[i] <= 0.5) {
        blockedVelocity = Math.max(
          blockedVelocity,
          Math.abs(Number(macroscopic.velocityX[i]) || 0),
          Math.abs(Number(macroscopic.velocityY[i]) || 0)
        );
      }
    }

    return {
      valid: blockedVelocity <= 1e-9,
      blockedVelocity: blockedVelocity
    };
  },

  makeGyrePreview: function (width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var ticks = Math.max(0, Math.round(Number(spec.ticks) || 10000));
    var velocityX = new Float32Array(w * h);
    var velocityY = new Float32Array(w * h);
    var spin = Math.min(1, ticks / 10000);

    for (var y = 0; y < h; y += 1) {
      var latitudeNorm = y / Math.max(1, h - 1);
      var hemisphere = latitudeNorm < 0.5 ? 1 : -1;
      var centerY = latitudeNorm < 0.5 ? h * 0.25 : h * 0.75;
      for (var x = 0; x < w; x += 1) {
        var dx = (x - w * 0.5) / Math.max(1, w);
        var dy = (y - centerY) / Math.max(1, h);
        var cell = y * w + x;
        velocityX[cell] = hemisphere * -dy * spin;
        velocityY[cell] = hemisphere * dx * spin;
      }
    }

    return {
      width: w,
      height: h,
      ticks: ticks,
      velocityX: velocityX,
      velocityY: velocityY,
      northernHemisphereRotation: "clockwise",
      southernHemisphereRotation: "counter-clockwise"
    };
  },

  makeCurrentOverlayRgba: function (velocityX, velocityY, oceanMask, width, height, options) {
    var spec = options || {};
    var w = Math.max(1, Math.round(Number(width) || 1));
    var h = Math.max(1, Math.round(Number(height) || 1));
    var data = new Uint8Array(w * h * 4);
    var arrows = [];
    var stride = Math.max(1, Math.round(Number(spec.arrowStride) || this.defaults.arrow_stride));

    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) {
        var cell = y * w + x;
        var vx = Number(velocityX && velocityX[cell]) || 0;
        var vy = Number(velocityY && velocityY[cell]) || 0;
        var speed = Math.min(1, Math.sqrt(vx * vx + vy * vy) / this.defaults.max_surface_velocity_mps);
        var angle = Math.atan2(vy, vx);
        var offset = cell * 4;

        if (oceanMask && oceanMask[cell] <= 0.5) {
          data[offset + 3] = 0;
          continue;
        }

        data[offset] = Math.round(80 + (Math.cos(angle) * 0.5 + 0.5) * 135 * speed);
        data[offset + 1] = Math.round(120 + speed * 105);
        data[offset + 2] = Math.round(180 + (Math.sin(angle) * 0.5 + 0.5) * 70 * speed);
        data[offset + 3] = Math.round(80 + speed * 150);

        if (x % stride === 0 && y % stride === 0 && speed > 0.02) {
          arrows.push({
            x: x,
            y: y,
            dx: vx,
            dy: vy,
            color: "#ffffff"
          });
        }
      }
    }

    return {
      width: w,
      height: h,
      data: data,
      arrows: arrows,
      arrowStride: stride,
      mimeType: "image/png",
      description: "Ocean current overlay: hue encodes direction, saturation/alpha encodes magnitude, arrows sample flow at fixed stride."
    };
  },

  ensureShaderModule: function (device) {
    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.getShaderModule !== "function") {
      throw new Error("WGSL shader manager is required for LBM ocean");
    }

    return PS.render.wgslShaders.getShaderModule(device, this.shaderName);
  },

  createBindGroup: function (pass, harness, device) {
    var pipeline = pass.pipeline || harness.getPassPipeline(pass, device);
    var read = harness.getReadBuffer(this.distributionStateId);
    var write = harness.getWriteBuffer(this.distributionStateId);
    var entries = [
      { binding: 0, resource: { buffer: read.buffer } },
      { binding: 1, resource: { buffer: write.buffer } },
      { binding: 2, resource: { buffer: harness.buffers["ocean.mask"].buffer } },
      { binding: 3, resource: { buffer: harness.buffers["ocean.bathymetry"].buffer } },
      { binding: 4, resource: { buffer: harness.buffers["ocean.wind"].buffer } },
      { binding: 5, resource: { buffer: harness.buffers["ocean.velocity"].buffer } },
      { binding: 6, resource: { buffer: harness.buffers["ocean.params"].buffer } }
    ];

    if (device && typeof device.createBindGroup === "function" && pipeline && typeof pipeline.getBindGroupLayout === "function") {
      return device.createBindGroup({
        label: "lbm-ocean.bind-group",
        layout: pipeline.getBindGroupLayout(0),
        entries: entries
      });
    }

    return {
      label: "lbm-ocean.bind-group",
      entries: entries
    };
  },

  init: function (options) {
    var spec = options || {};
    var harness = PS.sim && PS.sim.computeHarness;
    var device = spec.device || (PS.gpu && PS.gpu.device);
    var dims = this.getDimensions(spec);
    var config = this.normalizeConfig(spec.config || this.config || {});
    var distributionBytes = this.getDistributionLength(dims.width, dims.height) * 4;
    var scalarBytes = this.getCellCount(dims.width, dims.height) * 4;
    var windBytes = this.getCellCount(dims.width, dims.height) * 2 * 4;
    var velocityBytes = this.getCellCount(dims.width, dims.height) * 4 * 4;
    var shaderModule;
    var pipelineDescriptor;
    var self = this;

    if (!harness) {
      throw new Error("Compute harness is required for LBM ocean");
    }

    if (!device || typeof device.createBuffer !== "function") {
      throw new Error("GPUDevice is required for LBM ocean");
    }

    if (spec.shaderSource && PS.render && PS.render.wgslShaders) {
      PS.render.wgslShaders.register(this.shaderName, spec.shaderSource, { path: this.shaderPath });
    }

    this.registerManifest();
    shaderModule = this.ensureShaderModule(device);

    this.state = harness.registerState(this.distributionStateId, {
      width: dims.width,
      height: dims.height,
      bytesPerCell: 36,
      format: "d2q9-float32",
      initialData: spec.initialDistributions || this.makeInitialDistributions(dims.width, dims.height),
      usage: ["storage", "copySrc", "copyDst"],
      device: device,
      meta: {
        unit: "distribution",
        source: "lbm-ocean"
      }
    });

    harness.createBuffer("ocean.mask", scalarBytes, ["storage", "copyDst"], spec.oceanMask || this.makeOceanMask(dims.width, dims.height), device);
    harness.createBuffer("ocean.bathymetry", scalarBytes, ["storage", "copyDst"], spec.bathymetry || this.makeBathymetryField(dims.width, dims.height, { oceanMask: spec.oceanMask }), device);
    harness.createBuffer("ocean.wind", windBytes, ["storage", "copyDst"], spec.wind || this.makeWindField(dims.width, dims.height), device);
    harness.createBuffer("ocean.velocity", velocityBytes, ["storage", "copySrc", "copyDst"], spec.velocity || new Float32Array(this.getCellCount(dims.width, dims.height) * 4), device);
    harness.createBuffer("ocean.params", 32, ["uniform", "copyDst"], this.makeParamsData(dims.width, dims.height, config, spec.layerName), device);

    pipelineDescriptor = {
      label: "lbm-ocean.pipeline",
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
        harness.swap(self.distributionStateId);
      }
    });

    return {
      width: dims.width,
      height: dims.height,
      distributionBytes: distributionBytes,
      velocityBytes: velocityBytes,
      config: config,
      state: this.state,
      pass: harness.passes[this.passId]
    };
  },

  dispatch: function (commandEncoder, device) {
    if (!PS.sim || !PS.sim.computeHarness) {
      throw new Error("Compute harness is required for LBM ocean dispatch");
    }

    return PS.sim.computeHarness.dispatch(this.passId, commandEncoder, device);
  }
};
