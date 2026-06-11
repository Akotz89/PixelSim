"use strict";
PS.sim = PS.sim || {};

PS.sim.biomeLut = PS.sim.biomeLut || {
  shaderName: "biome-render",
  shaderPath: "shaders/biome-render.wgsl",
  assetPath: "assets/biome-lut.png",
  width: 256,
  height: 256,
  temperatureRangeC: [-40, 40],
  precipitationRangeMm: [0, 4000],
  seaLevelM: 0,
  state: {
    lutSampler: null,
    outputSampler: null,
    lastDebugMode: 0,
    lastValidation: null
  },
  biomes: [
    { id: "polar_ice", label: "Polar Ice", color: "#ffffff" },
    { id: "tundra", label: "Tundra", color: "#a0b090" },
    { id: "boreal_forest", label: "Boreal Forest", color: "#2d6b30" },
    { id: "temperate_rainforest", label: "Temperate Rainforest", color: "#3d8b3d" },
    { id: "temperate_deciduous", label: "Temperate Deciduous", color: "#5ca040" },
    { id: "tropical_rainforest", label: "Tropical Rainforest", color: "#1a6b1a" },
    { id: "savanna", label: "Savanna", color: "#c8a050" },
    { id: "grassland", label: "Grassland", color: "#8bb040" },
    { id: "desert", label: "Desert", color: "#d4a060" },
    { id: "hot_desert", label: "Hot Desert", color: "#e8b850" },
    { id: "ocean_shallow", label: "Ocean (shallow)", color: "#2060a0" },
    { id: "ocean_deep", label: "Ocean (deep)", color: "#102040" },
    { id: "wetlands", label: "Wetlands", color: "#507050" }
  ],
  debugModes: [
    { id: 0, label: "biome" },
    { id: 1, label: "temperature" },
    { id: 2, label: "moisture" },
    { id: 3, label: "ocean-current" },
    { id: 4, label: "elevation" }
  ],

  registerManifest: function () {
    var manifest = PS.render && (PS.render.wgslShaderManifest = PS.render.wgslShaderManifest || []);

    if (!manifest) {
      return [];
    }

    for (var i = 0; i < manifest.length; i += 1) {
      if (manifest[i] && manifest[i].name === this.shaderName) {
        return manifest;
      }
    }

    manifest.push({
      name: this.shaderName,
      path: this.shaderPath
    });
    return manifest;
  },

  loadAssets: function (loader) {
    var assetLoader = loader || (PS.assets && PS.assets.startupLoader) || null;
    this.registerManifest();

    if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.loadFromFile !== "function") {
      return Promise.reject(new Error("WGSL shader manager is required for biome LUT rendering"));
    }

    return PS.render.wgslShaders.loadFromFile(this.shaderName, this.shaderPath, assetLoader);
  },

  getDevice: function (device) {
    return device || (PS.gpu && PS.gpu.device);
  },

  ensureSamplers: function (device) {
    var targetDevice = this.getDevice(device);

    if (!targetDevice || typeof targetDevice.createSampler !== "function") {
      throw new Error("GPUDevice.createSampler is required for biome LUT samplers");
    }

    if (!this.state.lutSampler) {
      this.state.lutSampler = targetDevice.createSampler({
        label: "biome-lut.linear-sampler",
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge"
      });
    }

    if (!this.state.outputSampler) {
      this.state.outputSampler = targetDevice.createSampler({
        label: "biome-lut.output-nearest-sampler",
        magFilter: "nearest",
        minFilter: "nearest",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge"
      });
    }

    return {
      lut: this.state.lutSampler,
      output: this.state.outputSampler
    };
  },

  hexToRgb: function (hex) {
    var value = String(hex || "#000000").replace("#", "");
    var intValue = parseInt(value.length === 3 ? value.replace(/(.)/g, "$1$1") : value, 16);

    if (!Number.isFinite(intValue)) {
      intValue = 0;
    }

    return {
      red: (intValue >> 16) & 255,
      green: (intValue >> 8) & 255,
      blue: intValue & 255
    };
  },

  rgbToHex: function (rgb) {
    function channel(value) {
      return Math.max(0, Math.min(255, Math.round(Number(value) || 0))).toString(16).padStart(2, "0");
    }

    return "#" + channel(rgb.red) + channel(rgb.green) + channel(rgb.blue);
  },

  getBiome: function (id) {
    var targetId = String(id || "");
    for (var i = 0; i < this.biomes.length; i += 1) {
      if (this.biomes[i].id === targetId) {
        return this.biomes[i];
      }
    }
    return null;
  },

  getPalette: function () {
    return this.biomes.map(function (biome) {
      return biome.color;
    });
  },

  getActivePalette: function () {
    return Array.isArray(this.state.epochPalette) && this.state.epochPalette.length > 0
      ? this.state.epochPalette
      : this.getPalette();
  },

  setEpochPalette: function (paletteId, palette) {
    this.state.epochPaletteId = String(paletteId || "default");
    this.state.epochPalette = Array.isArray(palette) ? palette.slice() : [];
    this.state.currentLut = this.makeLutRgba(this.width, this.height, this.state.epochPalette);
    this.state.lastValidation = this.validateLut(this.state.currentLut);
    return this.state.currentLut;
  },

  snapToPalette: function (hex, palette) {
    var source = this.hexToRgb(hex);
    var colors = Array.isArray(palette) && palette.length > 0 ? palette : this.getActivePalette();
    var best = colors[0] || "#000000";
    var bestDistance = Infinity;

    for (var i = 0; i < colors.length; i += 1) {
      var candidate = this.hexToRgb(colors[i]);
      var red = source.red - candidate.red;
      var green = source.green - candidate.green;
      var blue = source.blue - candidate.blue;
      var distance = red * red + green * green + blue * blue;

      if (distance < bestDistance) {
        bestDistance = distance;
        best = colors[i];
      }
    }

    return String(best).toLowerCase();
  },

  classifyBiome: function (temperatureC, precipitationMm, elevationM) {
    var temp = Number(temperatureC);
    var precipitation = Number(precipitationMm);
    var elevation = Number(elevationM);

    if (!Number.isFinite(temp)) { temp = 0; }
    if (!Number.isFinite(precipitation)) { precipitation = 0; }
    if (!Number.isFinite(elevation)) { elevation = 100; }

    if (elevation < this.seaLevelM) {
      return elevation < -1400 ? "ocean_deep" : "ocean_shallow";
    }

    if (temp <= -12) { return "polar_ice"; }
    if (temp <= 2) { return precipitation > 600 ? "tundra" : "polar_ice"; }
    if (temp <= 8) { return precipitation > 900 ? "boreal_forest" : "tundra"; }
    if (precipitation >= 3500 && temp >= 4 && temp < 22) { return "wetlands"; }
    if (precipitation >= 3200 && temp >= 22) { return "tropical_rainforest"; }
    if (precipitation >= 2600 && temp >= 8) { return "temperate_rainforest"; }
    if (precipitation >= 1700 && temp >= 12) { return temp >= 24 ? "tropical_rainforest" : "temperate_deciduous"; }
    if (precipitation >= 1100) { return temp >= 20 ? "savanna" : "temperate_deciduous"; }
    if (precipitation >= 650) { return temp >= 24 ? "savanna" : "grassland"; }
    if (precipitation >= 250) { return temp >= 30 ? "hot_desert" : "grassland"; }
    if (precipitation >= 120 && temp < 14) { return "grassland"; }
    return temp >= 28 ? "hot_desert" : "desert";
  },

  getBiomeColor: function (id, palette) {
    var biome = this.getBiome(id) || this.getBiome("grassland");
    return this.snapToPalette(biome ? biome.color : "#8bb040", palette);
  },

  getColorForSample: function (temperatureC, precipitationMm, elevationM, palette) {
    return this.getBiomeColor(this.classifyBiome(temperatureC, precipitationMm, elevationM), palette);
  },

  makeLutRgba: function (width, height, palette) {
    var w = Math.max(1, Math.round(Number(width) || this.width));
    var h = Math.max(1, Math.round(Number(height) || this.height));
    var data = new Uint8Array(w * h * 4);
    var included = {};

    for (var y = 0; y < h; y += 1) {
      var precipitation = (y / Math.max(1, h - 1)) * this.precipitationRangeMm[1];
      for (var x = 0; x < w; x += 1) {
        var temperature = this.temperatureRangeC[0] + (x / Math.max(1, w - 1)) * (this.temperatureRangeC[1] - this.temperatureRangeC[0]);
        var elevation = 100;

        if (y === 0) {
          elevation = -2000;
        } else if (y === 1) {
          elevation = -200;
        }

        var id = this.classifyBiome(temperature, precipitation, elevation);
        var rgb = this.hexToRgb(this.getBiomeColor(id, palette));
        var offset = (y * w + x) * 4;
        included[id] = true;
        data[offset] = rgb.red;
        data[offset + 1] = rgb.green;
        data[offset + 2] = rgb.blue;
        data[offset + 3] = 255;
      }
    }

    return {
      width: w,
      height: h,
      data: data,
      includedBiomes: Object.keys(included).sort(),
      mimeType: "image/png",
      path: this.assetPath
    };
  },

  getDebugSample: function (mode, sample) {
    var debugMode = Math.max(0, Math.min(4, Math.round(Number(mode) || 0)));
    var source = sample || {};
    var temp = Number(source.temperatureC);
    var moisture = Number(source.moisture);
    var elevation = Number(source.elevationM);
    var velocity = source.currentVelocity || { x: 0, y: 0 };

    this.state.lastDebugMode = debugMode;

    if (!Number.isFinite(temp)) { temp = 0; }
    if (!Number.isFinite(moisture)) { moisture = 0; }
    if (!Number.isFinite(elevation)) { elevation = 100; }

    if (debugMode === 1) {
      var heat = Math.max(0, Math.min(1, (temp + 40) / 80));
      return this.rgbToHex({ red: 40 + heat * 215, green: 70 + heat * 80, blue: 240 - heat * 200 });
    }

    if (debugMode === 2) {
      var wet = Math.max(0, Math.min(1, moisture));
      return this.rgbToHex({ red: 150 - wet * 100, green: 105 + wet * 85, blue: 55 + wet * 180 });
    }

    if (debugMode === 3) {
      var speed = Math.max(0, Math.min(1, Math.sqrt((Number(velocity.x) || 0) * (Number(velocity.x) || 0) + (Number(velocity.y) || 0) * (Number(velocity.y) || 0))));
      return this.rgbToHex({ red: 40 + speed * 90, green: 90 + speed * 120, blue: 150 + speed * 95 });
    }

    if (debugMode === 4) {
      var gray = Math.max(0, Math.min(255, Math.round((elevation + 2000) / 6000 * 255)));
      return this.rgbToHex({ red: gray, green: gray, blue: gray });
    }

    return this.getColorForSample(temp, (Number(source.precipitationMm) || moisture * 4000), elevation);
  },

  validateLut: function (lut) {
    var target = lut || this.makeLutRgba(this.width, this.height, this.getActivePalette());
    var required = this.biomes.map(function (biome) { return biome.id; });
    var included = {};
    var missing = [];

    target.includedBiomes.forEach(function (id) {
      included[id] = true;
    });

    required.forEach(function (id) {
      if (!included[id]) {
        missing.push(id);
      }
    });

    this.state.lastValidation = {
      ok: missing.length === 0,
      missing: missing,
      includedBiomes: target.includedBiomes.slice(),
      width: target.width,
      height: target.height
    };

    return this.state.lastValidation;
  }
};
