"use strict";
import { PS } from "../core/namespace.js";

PS.sim = PS.sim || {};

PS.sim.coupling = PS.sim.coupling || {
  width: 512,
  height: 512,
  tickIndex: 0,
  textureRegistry: {},
  elevationBuffer: null,
  lastTick: null,
  passOrder: [
    {
      id: "heat-diffusion",
      label: "Heat Diffusion",
      dispatchIds: ["heat-diffusion"],
      reads: ["elevation", "albedo", "atmosphere"],
      writes: ["temperature"],
      budgetMs: 1
    },
    {
      id: "lbm-ocean",
      label: "LBM Ocean",
      dispatchIds: ["lbm-ocean"],
      reads: ["temperature", "wind", "bathymetry", "density"],
      writes: ["velocity", "pressure"],
      budgetMs: 15
    },
    {
      id: "thermohaline",
      label: "Salinity + Density",
      dispatchIds: ["thermohaline.salinity", "thermohaline.density"],
      reads: ["velocity", "temperature", "moisture"],
      writes: ["salinity", "density"],
      feedback: ["density -> lbm-ocean next tick"],
      budgetMs: 3
    },
    {
      id: "moisture",
      label: "Moisture + Precipitation",
      dispatchIds: ["moisture"],
      reads: ["temperature", "velocity", "elevation"],
      writes: ["moisture"],
      budgetMs: 3
    },
    {
      id: "geochemistry",
      label: "Atmospheric Chemistry",
      dispatchIds: ["geochemistry"],
      reads: ["temperature", "vegetation", "element_grid"],
      writes: ["atmosphere"],
      feedback: ["CO2 -> heat-diffusion next tick"],
      budgetMs: 5
    },
    {
      id: "reaction-diffusion",
      label: "Reaction-Diffusion Vegetation",
      dispatchIds: ["reaction-diffusion"],
      reads: ["moisture", "temperature", "atmosphere"],
      writes: ["vegetation"],
      feedback: ["vegetation -> albedo next tick"],
      budgetMs: 5
    },
    {
      id: "pixel-ca",
      label: "Pixel CA",
      dispatchIds: ["pixel-ca"],
      reads: ["temperature", "velocity", "elevation"],
      writes: ["element_grid"],
      feedback: ["lava -> geochemistry next tick"],
      budgetMs: 5
    },
    {
      id: "lenia",
      label: "Lenia Ecosystems",
      dispatchIds: ["lenia"],
      reads: ["moisture", "temperature", "atmosphere", "vegetation"],
      writes: ["species"],
      budgetMs: 6
    },
    {
      id: "biome-lut",
      label: "Biome LUT Render",
      dispatchIds: [],
      reads: ["temperature", "moisture", "elevation", "species", "biome_lut"],
      writes: ["biome_render"],
      renderOnly: true,
      budgetMs: 0.5
    }
  ],
  textureSpecs: [
    { id: "temperature", format: "rgba32float", writtenBy: "heat-diffusion", readBy: ["lbm-ocean", "thermohaline", "moisture", "geochemistry", "reaction-diffusion", "pixel-ca", "lenia"] },
    { id: "velocity", format: "rgba32float", writtenBy: "lbm-ocean", readBy: ["thermohaline", "moisture", "lenia"] },
    { id: "salinity", format: "rgba32float", writtenBy: "thermohaline", readBy: ["geochemistry"] },
    { id: "density", format: "rgba32float", writtenBy: "thermohaline", readBy: ["lbm-ocean"] },
    { id: "moisture", format: "rgba32float", writtenBy: "moisture", readBy: ["geochemistry", "reaction-diffusion", "lenia", "biome-lut"] },
    { id: "atmosphere", format: "rgba32float", writtenBy: "geochemistry", readBy: ["heat-diffusion", "reaction-diffusion", "lenia"] },
    { id: "vegetation", format: "rgba32float", writtenBy: "reaction-diffusion", readBy: ["geochemistry", "lenia", "biome-lut"] },
    { id: "element_grid", format: "r32uint", writtenBy: "pixel-ca", readBy: ["geochemistry", "biome-lut"] },
    { id: "species", logicalName: "species[0..5]", format: "r32float", writtenBy: "lenia", readBy: ["biome-lut"] },
    { id: "elevation", format: "r32float", writtenBy: "wasm", readBy: ["heat-diffusion", "lbm-ocean", "thermohaline", "moisture", "pixel-ca", "biome-lut"] },
    { id: "biome_lut", format: "rgba8unorm", writtenBy: "cpu-static", readBy: ["biome-lut"] },
    { id: "biome_render", format: "rgba8unorm", writtenBy: "biome-lut", readBy: ["display"] }
  ],

  getDimensions: function (options) {
    var spec = options || {};
    return {
      width: Math.max(1, Math.round(Number(spec.width || this.width) || 512)),
      height: Math.max(1, Math.round(Number(spec.height || this.height) || 512))
    };
  },

  getTextureUsage: function () {
    if (typeof GPUTextureUsage !== "undefined") {
      return GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT;
    }
    return 1 | 2 | 4 | 8 | 16;
  },

  ensureTextureRegistry: function (options) {
    var spec = options || {};
    var dims = this.getDimensions(spec);
    var targets = PS.render && PS.render.webgpuTargets;
    var device = spec.device || (PS.gpu && PS.gpu.device);
    var usage = this.getTextureUsage();
    var registry = {};

    if (!targets || typeof targets.create !== "function") {
      throw new Error("PS.render.webgpuTargets is required for coupling texture registry");
    }

    for (var i = 0; i < this.textureSpecs.length; i += 1) {
      var textureSpec = this.textureSpecs[i];
      var target = targets.create("sim." + textureSpec.id, dims.width, dims.height, textureSpec.format, usage, device);
      registry[textureSpec.id] = {
        id: textureSpec.id,
        targetId: target.id,
        logicalName: textureSpec.logicalName || textureSpec.id,
        width: target.width,
        height: target.height,
        format: target.format,
        writtenBy: textureSpec.writtenBy,
        readBy: textureSpec.readBy.slice(),
        texture: target.texture
      };
    }

    this.width = dims.width;
    this.height = dims.height;
    this.textureRegistry = registry;
    return registry;
  },

  ensureElevationBuffer: function (options) {
    var spec = options || {};
    var dims = this.getDimensions(spec);
    var harness = PS.sim && PS.sim.computeHarness;
    var device = spec.device || (PS.gpu && PS.gpu.device);
    var initial = spec.initialElevation || new Float32Array(dims.width * dims.height);

    if (!harness || typeof harness.createBuffer !== "function") {
      throw new Error("Compute harness is required for coupling elevation buffer");
    }

    this.elevationBuffer = harness.createBuffer("coupling.elevation", initial.byteLength, ["storage", "copySrc", "copyDst"], initial, device);
    if (this.textureRegistry.elevation) {
      this.textureRegistry.elevation.buffer = this.elevationBuffer.buffer;
      this.textureRegistry.elevation.bufferId = this.elevationBuffer.id;
    }
    return this.elevationBuffer;
  },

  init: function (options) {
    var registry = this.ensureTextureRegistry(options);
    this.ensureElevationBuffer(options);
    return {
      width: this.width,
      height: this.height,
      textureRegistry: registry,
      passOrder: this.getPassOrder(),
      readDiscipline: this.getReadDisciplineReport()
    };
  },

  getPassOrder: function () {
    return this.passOrder.map(function (pass) {
      return {
        id: pass.id,
        label: pass.label,
        dispatchIds: pass.dispatchIds.slice(),
        reads: pass.reads.slice(),
        writes: pass.writes.slice(),
        budgetMs: pass.budgetMs,
        renderOnly: pass.renderOnly === true
      };
    });
  },

  getTextureRegistrySummary: function () {
    var ids = Object.keys(this.textureRegistry);
    var summary = [];
    for (var i = 0; i < ids.length; i += 1) {
      var record = this.textureRegistry[ids[i]];
      summary.push({
        id: record.id,
        logicalName: record.logicalName,
        format: record.format,
        writtenBy: record.writtenBy,
        readBy: record.readBy.slice()
      });
    }
    return summary;
  },

  getReadDisciplineReport: function () {
    var tick = Math.max(0, this.tickIndex);
    return this.passOrder.map(function (pass) {
      return {
        id: pass.id,
        reads: pass.reads.slice(),
        writes: pass.writes.slice(),
        readEpoch: tick - 1,
        writeEpoch: tick,
        previousTickOnly: true,
        feedback: pass.feedback ? pass.feedback.slice() : []
      };
    });
  },

  validatePassOrder: function () {
    var expected = [
      "heat-diffusion",
      "lbm-ocean",
      "thermohaline",
      "moisture",
      "geochemistry",
      "reaction-diffusion",
      "pixel-ca",
      "lenia",
      "biome-lut"
    ];
    var actual = this.passOrder.map(function (pass) { return pass.id; });
    var ok = actual.length === expected.length;
    for (var i = 0; i < expected.length; i += 1) {
      ok = ok && actual[i] === expected[i];
    }
    return {
      ok: ok,
      expected: expected,
      actual: actual,
      readDiscipline: this.getReadDisciplineReport()
    };
  },

  setActivePasses: function (activePassIds) {
    this.activePassIds = Array.isArray(activePassIds) ? activePassIds.slice() : null;
    return this.activePassIds;
  },

  setTimescale: function (ticksPerYear) {
    this.ticksPerYear = Math.max(0, Number(ticksPerYear) || 0);
    return this.ticksPerYear;
  },

  now: function () {
    return Date && typeof Date.now === "function" ? Date.now() : new Date().getTime();
  },

  logPassTiming: function (record) {
    if (typeof PS.log === "function") {
      PS.log("sim", "DEBUG", "coupling pass timing", record);
    }
    return record;
  },

  dispatchPassSlot: function (pass, options) {
    var spec = options || {};
    var harness = PS.sim && PS.sim.computeHarness;
    var started = this.now();
    var dispatched = [];
    var activePassIds = Array.isArray(spec.activePassIds) ? spec.activePassIds : this.activePassIds;
    var disabled = false;

    if (Array.isArray(activePassIds)) {
      disabled = activePassIds.indexOf(pass.id) < 0;
    }

    if (disabled) {
      return this.logPassTiming({
        id: pass.id,
        label: pass.label,
        dispatchIds: [],
        disabled: true,
        renderOnly: pass.renderOnly === true,
        elapsedMs: Math.max(0, this.now() - started),
        budgetMs: pass.budgetMs,
        withinBudget: true
      });
    }

    if (pass.renderOnly) {
      return this.logPassTiming({
        id: pass.id,
        label: pass.label,
        dispatchIds: [],
        renderOnly: true,
        elapsedMs: Math.max(0, this.now() - started),
        budgetMs: pass.budgetMs,
        withinBudget: true
      });
    }

    if (!harness || typeof harness.dispatch !== "function") {
      throw new Error("Compute harness dispatch is required for coupling tick");
    }

    for (var i = 0; i < pass.dispatchIds.length; i += 1) {
      var dispatchId = pass.dispatchIds[i];
      if (!harness.passes || !harness.passes[dispatchId]) {
        if (spec.strict === false) {
          continue;
        }
        throw new Error("Coupling pass is not registered: " + dispatchId);
      }
      harness.dispatch(dispatchId, spec.commandEncoder, spec.device);
      dispatched.push(dispatchId);
    }

    return this.logPassTiming({
      id: pass.id,
      label: pass.label,
      dispatchIds: dispatched,
      renderOnly: false,
      elapsedMs: Math.max(0, this.now() - started),
      budgetMs: pass.budgetMs,
      withinBudget: Math.max(0, this.now() - started) <= Number(pass.budgetMs)
    });
  },

  uploadWasmElevation: function (options) {
    var spec = options || {};
    var bridge = PS.sim && PS.sim.wasmBridge;
    var targetBuffer = spec.targetBuffer || (this.elevationBuffer && this.elevationBuffer.buffer);
    var upload;

    if (!bridge || typeof bridge.uploadElevationToGpu !== "function") {
      throw new Error("PS.sim.wasmBridge.uploadElevationToGpu is required for coupling elevation upload");
    }
    if (!targetBuffer) {
      this.ensureElevationBuffer(spec);
      targetBuffer = this.elevationBuffer.buffer;
    }

    upload = bridge.uploadElevationToGpu({
      device: spec.device || (PS.gpu && PS.gpu.device),
      targetBuffer: targetBuffer,
      simBuffer: spec.simBuffer,
      wasmExports: spec.wasmExports,
      width: spec.width || this.width,
      height: spec.height || this.height
    });
    upload.registryId = "elevation";
    upload.targetBufferId = this.elevationBuffer && this.elevationBuffer.id;
    return upload;
  },

  tick: function (options) {
    var spec = options || {};
    var started = this.now();
    var records = [];
    var totalBudget = 0;

    this.tickIndex += 1;
    for (var i = 0; i < this.passOrder.length; i += 1) {
      totalBudget += Number(this.passOrder[i].budgetMs) || 0;
      records.push(this.dispatchPassSlot(this.passOrder[i], spec));
    }

    this.lastTick = {
      tick: this.tickIndex,
      passCount: records.length,
      order: records.map(function (record) { return record.id; }),
      records: records,
      elapsedMs: Math.max(0, this.now() - started),
      budgetMs: totalBudget,
      withinBudget: Math.max(0, this.now() - started) < 50,
      readDiscipline: this.getReadDisciplineReport()
    };

    if (typeof PS.log === "function") {
      PS.log("sim", "INFO", "coupling tick complete", this.lastTick);
    }

    return this.lastTick;
  }
};
