"use strict";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getPlanetTile } from "./planet-grid.js";
import { getPlanetTileCompositedColor } from "./surface-imagery.js";
import { getRgbFromHex } from "./terrain.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";
import { canvas } from "../ui/dom-refs.js";

PS.render = PS.render || {};

PS.render.webgpuGlobe = PS.render.webgpuGlobe || {
  shaderName: "globe-sphere",
  shaderPath: "shaders/globe-sphere.wgsl",
  state: {
    pipeline: null,
    sampler: null,
    uniformBuffer: null,
    bindGroup: null,
    terrainTexture: null,
    terrainPyramid: {
      signature: null,
      textures: {},
      metrics: {}
    },
    terrainSourceRgb: null,
    terrainSourceSignature: null,
    overlayTexture: null,
    textureSignature: null,
    overlaySignature: null,
    drawCount: 0,
    textureUploadCount: 0,
    underlayPyramidUploadCount: 0,
    overlayUploadCount: 0,
    lastTextureUploadMs: 0,
    lastUnderlayPyramidUploadMs: 0,
    lastUnderlayRequestedLevel: 0,
    lastUnderlaySourceLevel: 0,
    lastUnderlayRequestedName: "orbit",
    lastUnderlaySourceName: "orbit",
    lastUnderlayTextureWidth: 0,
    lastUnderlayTextureHeight: 0,
    lastReadyChildCoverage: 1,
    lastFallbackStaleCoverage: 0,
    lastSmearEvidence: 0,
    lastFlatParentEvidence: 0,
    lastOverlayUploadMs: 0,
    lastUsedObservationOverlay: "none",
    lastFrameMs: 0,
    lastError: ""
  },

  getTerrainTextureSize: function () {
    var worldWidth = Math.max(1, typeof WORLD_WIDTH !== "undefined" ? Math.round(Number(WORLD_WIDTH) || 1) : 1);
    var worldHeight = Math.max(1, typeof WORLD_HEIGHT !== "undefined" ? Math.round(Number(WORLD_HEIGHT) || 1) : 1);
    var width = 1;
    var height = 1;

    while (width < Math.max(512, worldWidth * 16)) {
      width *= 2;
    }
    while (height < Math.max(256, worldHeight * 16)) {
      height *= 2;
    }

    return {
      width: Math.min(2048, width),
      height: Math.min(1024, height),
      sourceWidth: worldWidth,
      sourceHeight: worldHeight
    };
  },

  getUnderlayPyramidLevels: function () {
    var sourceWidth = Math.max(1, typeof WORLD_WIDTH !== "undefined" ? Math.round(Number(WORLD_WIDTH) || 1) : 1);
    var sourceHeight = Math.max(1, typeof WORLD_HEIGHT !== "undefined" ? Math.round(Number(WORLD_HEIGHT) || 1) : 1);

    return [
      { level: 0, name: "orbit", band: "orbit", width: 512, height: 256, sourceWidth: sourceWidth, sourceHeight: sourceHeight, detailStrength: 0.10 },
      { level: 1, name: "continent", band: "continent", width: 1024, height: 512, sourceWidth: sourceWidth, sourceHeight: sourceHeight, detailStrength: 0.22 },
      { level: 2, name: "region", band: "region", width: 1536, height: 768, sourceWidth: sourceWidth, sourceHeight: sourceHeight, detailStrength: 0.34 },
      { level: 3, name: "local", band: "local", width: 2048, height: 1024, sourceWidth: sourceWidth, sourceHeight: sourceHeight, detailStrength: 0.46 }
    ];
  },

  getUnderlayPyramidLevel: function (level) {
    var levels = this.getUnderlayPyramidLevels();
    var requested = Math.max(0, Math.min(levels.length - 1, Math.round(Number(level) || 0)));

    return levels[requested] || levels[0];
  },

  getRequestedUnderlayLevel: function (options) {
    var spec = options || {};
    var explicitLevel = Number(spec.underlayLevel);
    var zoomLevel = Number(spec.zoomLevel);
    var band = String(spec.zoomBand || "").toLowerCase();

    if (Number.isFinite(explicitLevel)) {
      return this.getUnderlayPyramidLevel(explicitLevel).level;
    }

    if (band === "settlement" || band === "local") {
      return 3;
    }
    if (band === "region") {
      return 2;
    }
    if (band === "continent") {
      return 1;
    }
    if (band === "orbit" || band === "planet" || band === "globe") {
      return 0;
    }

    if (Number.isFinite(zoomLevel)) {
      if (zoomLevel >= 4.2) {
        return 3;
      }
      if (zoomLevel >= 2.4) {
        return 2;
      }
      if (zoomLevel >= 1.35) {
        return 1;
      }
    }

    return 0;
  },

  buildTerrainSourceRgb: function () {
    var width = Math.max(1, typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 1);
    var height = Math.max(1, typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 1);
    var data = new Uint8Array(width * height * 3);
    var cellCount = width * height;
    var elevation = new Float32Array(cellCount);
    var moisture = new Float32Array(cellCount);
    var coast = new Float32Array(cellCount);
    var river = new Float32Array(cellCount);
    var ridge = new Float32Array(cellCount);
    var hillshade = new Float32Array(cellCount);
    var x;
    var y;
    var index;
    var cellIndex;
    var tile;
    var rgb;

    for (y = 0; y < height; y += 1) {
      for (x = 0; x < width; x += 1) {
        cellIndex = y * width + x;
        index = cellIndex * 3;
        tile = typeof getPlanetTile === "function" ? getPlanetTile(x, y) : null;
        rgb = PS.render.terrain.getRgbFromHex(
          getPlanetTileCompositedColor(tile)
        );
        data[index] = Math.max(0, Math.min(255, Math.round(rgb.red)));
        data[index + 1] = Math.max(0, Math.min(255, Math.round(rgb.green)));
        data[index + 2] = Math.max(0, Math.min(255, Math.round(rgb.blue)));
        elevation[cellIndex] = this.getTileSignal(tile, "elevation", 0);
        moisture[cellIndex] = this.getTileSignal(tile, "moisture", 0.65);
        coast[cellIndex] = Math.max(
          this.getTileSignal(tile, "coastFactor", 0),
          this.getTileSignal(tile, "shallowWater", 0)
        );
        river[cellIndex] = Math.max(
          this.getTileSignal(tile, "riverStrength", 0),
          this.getTileSignal(tile, "riverMouth", 0)
        );
        ridge[cellIndex] = Math.max(
          this.getTileSignal(tile, "ridgeStrength", 0),
          this.getTileSignal(tile, "roughness", 0),
          Math.abs(this.getTileSignal(tile, "terrainSlope", 0))
        );
        hillshade[cellIndex] = this.getTileSignal(tile, "terrainHillshade", 0.55);
      }
    }

    return {
      width: width,
      height: height,
      data: data,
      elevation: elevation,
      moisture: moisture,
      coast: coast,
      river: river,
      ridge: ridge,
      hillshade: hillshade
    };
  },

  getTerrainSourceRgb: function () {
    var state = this.state;
    var signature = this.getTextureSignature();

    if (state.terrainSourceRgb && state.terrainSourceSignature === signature) {
      return state.terrainSourceRgb;
    }

    state.terrainSourceRgb = this.buildTerrainSourceRgb();
    state.terrainSourceSignature = signature;
    return state.terrainSourceRgb;
  },

  getTileRgb: function (x, y, sourceRgb) {
    var source = sourceRgb || null;
    var width = source ? source.width : Math.max(1, typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 1);
    var height = source ? source.height : Math.max(1, typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 1);
    var tileX = ((Math.round(Number(x) || 0) % width) + width) % width;
    var tileY = Math.max(0, Math.min(height - 1, Math.round(Number(y) || 0)));
    var index;

    if (source && source.data) {
      index = (tileY * width + tileX) * 3;
      return {
        red: source.data[index],
        green: source.data[index + 1],
        blue: source.data[index + 2]
      };
    }

    return PS.render.terrain.getRgbFromHex(
      getPlanetTileCompositedColor(getPlanetTile(tileX, tileY))
    );
  },

  mixRgb: function (a, b, amount) {
    var t = Math.max(0, Math.min(1, Number(amount) || 0));

    return {
      red: a.red + (b.red - a.red) * t,
      green: a.green + (b.green - a.green) * t,
      blue: a.blue + (b.blue - a.blue) * t
    };
  },

  sampleTerrainRgb: function (u, v, sourceRgb) {
    var source = sourceRgb || null;
    var width = source ? source.width : Math.max(1, typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 1);
    var height = source ? source.height : Math.max(1, typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 1);
    var sourceX = (Number(u) || 0) * width - 0.5;
    var sourceY = Math.max(0, Math.min(1, Number(v) || 0)) * height - 0.5;
    var x0 = Math.floor(sourceX);
    var y0 = Math.floor(sourceY);
    var x1 = x0 + 1;
    var y1 = y0 + 1;
    var tx = sourceX - x0;
    var ty = sourceY - y0;
    var northWest = this.getTileRgb(x0, y0, source);
    var northEast = this.getTileRgb(x1, y0, source);
    var southWest = this.getTileRgb(x0, y1, source);
    var southEast = this.getTileRgb(x1, y1, source);
    var north = this.mixRgb(northWest, northEast, tx);
    var south = this.mixRgb(southWest, southEast, tx);

    return this.mixRgb(north, south, ty);
  },

  hashTerrainValue: function (a, b, seed) {
    var value = Math.sin((Number(a) || 0) * 127.1 + (Number(b) || 0) * 311.7 + (Number(seed) || 0) * 74.7) * 43758.5453123;

    return value - Math.floor(value);
  },

  hashTerrainCell: function (a, b, seed) {
    var value = Math.imul(Math.trunc(Number(a) || 0), 374761393) ^
      Math.imul(Math.trunc(Number(b) || 0), 668265263) ^
      Math.imul(Math.trunc(Number(seed) || 0), 2246822519);

    value = Math.imul(value ^ (value >>> 13), 1274126177);
    value = (value ^ (value >>> 16)) >>> 0;
    return value / 4294967295;
  },

  getTileSignal: function (tile, key, fallback) {
    var value = tile && Number(tile[key]);

    return Number.isFinite(value) ? value : fallback;
  },

  getUnderlayTerrainRgb: function (u, v, sourceRgb, levelSpec) {
    var base = this.sampleTerrainRgb(u, v, sourceRgb);
    var level = levelSpec || this.getUnderlayPyramidLevel(0);
    var sourceWidth = sourceRgb ? sourceRgb.width : Math.max(1, typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 1);
    var sourceHeight = sourceRgb ? sourceRgb.height : Math.max(1, typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 1);
    var tileX = ((Math.floor(Math.max(0, Math.min(0.999999, Number(u) || 0)) * sourceWidth) % sourceWidth) + sourceWidth) % sourceWidth;
    var tileY = Math.max(0, Math.min(sourceHeight - 1, Math.floor(Math.max(0, Math.min(0.999999, Number(v) || 0)) * sourceHeight)));
    var tile = typeof getPlanetTile === "function" ? getPlanetTile(tileX, tileY) : null;
    var detail = Math.max(0, Math.min(1, Number(level.detailStrength) || 0));
    var longitude = (Number(u) || 0) * 360 - 180;
    var latitude = 90 - (Number(v) || 0) * 180;
    var elevation = this.getTileSignal(tile, "elevation", 0);
    var moisture = this.getTileSignal(tile, "moisture", 0.65);
    var coast = Math.max(
      this.getTileSignal(tile, "coastFactor", 0),
      this.getTileSignal(tile, "shallowWater", 0)
    );
    var river = Math.max(
      this.getTileSignal(tile, "riverStrength", 0),
      this.getTileSignal(tile, "riverMouth", 0)
    );
    var ridge = Math.max(
      this.getTileSignal(tile, "ridgeStrength", 0),
      this.getTileSignal(tile, "roughness", 0),
      Math.abs(this.getTileSignal(tile, "terrainSlope", 0))
    );
    var hillshade = this.getTileSignal(tile, "terrainHillshade", 0.55);
    var broad = this.hashTerrainValue(Math.floor(longitude * 7), Math.floor(latitude * 7), level.level + 11) - 0.5;
    var regional = this.hashTerrainValue(Math.floor(longitude * 23), Math.floor(latitude * 23), level.level + 29) - 0.5;
    var material = this.hashTerrainValue(Math.floor(longitude * 97), Math.floor(latitude * 97), level.level + 47) - 0.5;
    var water = base.blue > Math.max(base.red, base.green) * 1.12 ? 1 : 0;
    var relief = (elevation * 0.28 + ridge * 0.22 + (hillshade - 0.5) * 0.42 + broad * 0.18 + regional * 0.12 + material * 0.07) * detail;
    var wetness = (moisture - 0.5) * detail;
    var coastLine = coast * detail;
    var riverLine = river * detail;
    var reliefLight = (broad * 42 + regional * 28 + material * 20) * detail;
    var red = base.red * (1 + relief - water * 0.05) +
      reliefLight + (broad * 18 + regional * 10) * detail +
      coastLine * 10 - wetness * 6 + ridge * detail * 8;
    var green = base.green * (1 + relief * 0.82 + wetness * 0.12) +
      reliefLight * 0.88 + (regional * 16 + material * 8 - broad * 6) * detail +
      coastLine * 8 + riverLine * 8;
    var blue = base.blue * (1 + relief * 0.56 + water * wetness * 0.08) +
      reliefLight * 0.62 + (material * 18 - regional * 8 + broad * 5) * detail +
      riverLine * 16 - ridge * detail * 4;

    return {
      red: Math.max(0, Math.min(255, red)),
      green: Math.max(0, Math.min(255, green)),
      blue: Math.max(0, Math.min(255, blue))
    };
  },

  buildUnderlaySourceCellRgbaData: function (levelSpec, sourceRgb) {
    var level = levelSpec || this.getUnderlayPyramidLevel(0);
    var source = sourceRgb || this.getTerrainSourceRgb();
    var sourceWidth = Math.max(1, Math.round(Number(source && source.width) || 1));
    var sourceHeight = Math.max(1, Math.round(Number(source && source.height) || 1));
    var sourceData = source && source.data ? source.data : null;
    var data = new Uint8Array(sourceWidth * sourceHeight * 4);
    var detail = Math.max(0, Math.min(1, Number(level.detailStrength) || 0));
    var sourceIndex;
    var tileIndex;
    var baseRed;
    var baseGreen;
    var baseBlue;
    var elevation;
    var moisture;
    var coast;
    var river;
    var ridge;
    var hillshade;
    var longitude;
    var latitude;
    var latitude7;
    var latitude23;
    var latitude97;
    var broad;
    var regional;
    var material;
    var water;
    var relief;
    var wetness;
    var coastLine;
    var riverLine;
    var reliefLight;
    var red;
    var green;
    var blue;
    var outputIndex;
    var x;
    var y;

    for (y = 0; y < sourceHeight; y += 1) {
      latitude = 90 - ((y + 0.5) / sourceHeight) * 180;
      latitude7 = Math.floor(latitude * 7);
      latitude23 = Math.floor(latitude * 23);
      latitude97 = Math.floor(latitude * 97);

      for (x = 0; x < sourceWidth; x += 1) {
        longitude = ((x + 0.5) / sourceWidth) * 360 - 180;
        tileIndex = y * sourceWidth + x;
        sourceIndex = tileIndex * 3;
        baseRed = sourceData[sourceIndex];
        baseGreen = sourceData[sourceIndex + 1];
        baseBlue = sourceData[sourceIndex + 2];

        elevation = source.elevation ? source.elevation[tileIndex] : 0;
        moisture = source.moisture ? source.moisture[tileIndex] : 0.65;
        coast = source.coast ? source.coast[tileIndex] : 0;
        river = source.river ? source.river[tileIndex] : 0;
        ridge = source.ridge ? source.ridge[tileIndex] : 0;
        hillshade = source.hillshade ? source.hillshade[tileIndex] : 0.55;
        broad = this.hashTerrainCell(Math.floor(longitude * 7), latitude7, level.level + 11) - 0.5;
        regional = this.hashTerrainCell(Math.floor(longitude * 23), latitude23, level.level + 29) - 0.5;
        material = this.hashTerrainCell(Math.floor(longitude * 97), latitude97, level.level + 47) - 0.5;
        water = baseBlue > Math.max(baseRed, baseGreen) * 1.12 ? 1 : 0;
        relief = (elevation * 0.28 + ridge * 0.22 + (hillshade - 0.5) * 0.42 + broad * 0.18 + regional * 0.12 + material * 0.07) * detail;
        wetness = (moisture - 0.5) * detail;
        coastLine = coast * detail;
        riverLine = river * detail;
        reliefLight = (broad * 42 + regional * 28 + material * 20) * detail;
        red = baseRed * (1 + relief - water * 0.05) +
          reliefLight + (broad * 18 + regional * 10) * detail +
          coastLine * 10 - wetness * 6 + ridge * detail * 8;
        green = baseGreen * (1 + relief * 0.82 + wetness * 0.12) +
          reliefLight * 0.88 + (regional * 16 + material * 8 - broad * 6) * detail +
          coastLine * 8 + riverLine * 8;
        blue = baseBlue * (1 + relief * 0.56 + water * wetness * 0.08) +
          reliefLight * 0.62 + (material * 18 - regional * 8 + broad * 5) * detail +
          riverLine * 16 - ridge * detail * 4;

        outputIndex = tileIndex * 4;
        data[outputIndex] = Math.max(0, Math.min(255, Math.round(red)));
        data[outputIndex + 1] = Math.max(0, Math.min(255, Math.round(green)));
        data[outputIndex + 2] = Math.max(0, Math.min(255, Math.round(blue)));
        data[outputIndex + 3] = 255;
      }
    }

    return {
      width: sourceWidth,
      height: sourceHeight,
      data: data
    };
  },

  buildUnderlayPyramidRgbaData: function (levelSpec, sourceRgb) {
    var level = levelSpec || this.getUnderlayPyramidLevel(0);
    var source = sourceRgb || this.getTerrainSourceRgb();
    var width = Math.max(1, Math.round(Number(level.width) || 1));
    var height = Math.max(1, Math.round(Number(level.height) || 1));
    var sourceWidth = Math.max(1, Math.round(Number(source && source.width) || 1));
    var sourceHeight = Math.max(1, Math.round(Number(source && source.height) || 1));
    var cellRgba = this.buildUnderlaySourceCellRgbaData(level, source);
    var data = new Uint8Array(width * height * 4);
    var buckets = new Uint8Array(512);
    var bucketCount = 0;
    var minLuma = 255;
    var maxLuma = 0;
    var xToSource = [];
    var yToSource;
    var sourceIndex;
    var outputIndex;
    var outputRed;
    var outputGreen;
    var outputBlue;
    var luma;
    var bucket;
    var x;
    var y;

    for (x = 0; x < width; x += 1) {
      xToSource[x] = ((Math.floor(Math.max(0, Math.min(0.999999, (x + 0.5) / width)) * sourceWidth) % sourceWidth) + sourceWidth) % sourceWidth;
    }

    for (y = 0; y < height; y += 1) {
      yToSource = Math.max(0, Math.min(sourceHeight - 1, Math.floor(Math.max(0, Math.min(0.999999, (y + 0.5) / height)) * sourceHeight)));

      for (x = 0; x < width; x += 1) {
        sourceIndex = (yToSource * sourceWidth + xToSource[x]) * 4;
        outputIndex = (y * width + x) * 4;
        outputRed = cellRgba.data[sourceIndex];
        outputGreen = cellRgba.data[sourceIndex + 1];
        outputBlue = cellRgba.data[sourceIndex + 2];
        data[outputIndex] = outputRed;
        data[outputIndex + 1] = outputGreen;
        data[outputIndex + 2] = outputBlue;
        data[outputIndex + 3] = 255;

        if ((x & 3) === 0 && (y & 3) === 0) {
          luma = outputRed * 0.299 + outputGreen * 0.587 + outputBlue * 0.114;
          minLuma = Math.min(minLuma, luma);
          maxLuma = Math.max(maxLuma, luma);
          bucket = (Math.floor(outputRed / 32) * 64) + (Math.floor(outputGreen / 32) * 8) + Math.floor(outputBlue / 32);
          if (!buckets[bucket]) {
            buckets[bucket] = 1;
            bucketCount += 1;
          }
        }
      }
    }

    return {
      data: data,
      metrics: {
        contrastRange: maxLuma - minLuma,
        coarseColorCount: bucketCount,
        flatParentEvidence: maxLuma - minLuma < 12 && bucketCount < 4 ? 1 : 0
      }
    };
  },

  resetTerrainPyramidTextures: function () {
    var state = this.state;
    var pyramid = state.terrainPyramid || { textures: {}, metrics: {} };
    var textures = pyramid.textures || {};
    var key;

    for (key in textures) {
      if (Object.prototype.hasOwnProperty.call(textures, key) && textures[key] && typeof textures[key].destroy === "function") {
        textures[key].destroy();
      }
    }

    state.terrainPyramid = {
      signature: this.getTextureSignature(),
      textures: {},
      metrics: {}
    };
  },

  registerManifest: function () {
    var manifest = PS.render.wgslShaderManifest = PS.render.wgslShaderManifest || [];
    var found = false;

    for (var i = 0; i < manifest.length; i += 1) {
      if (manifest[i] && manifest[i].name === this.shaderName) {
        found = true;
        break;
      }
    }

    if (!found) {
      manifest.push({ name: this.shaderName, path: this.shaderPath });
    }

    return manifest;
  },

  loadAssets: function (loader) {
    this.registerManifest();
    return PS.render.wgslShaders.loadFromFile(this.shaderName, this.shaderPath, loader);
  },

  getDevice: function (device) {
    return device || (PS.gpu && PS.gpu.device);
  },

  getFormat: function () {
    return (PS.gpu && PS.gpu.format) || "bgra8unorm";
  },

  getTextureSignature: function () {
    var currentWorld = typeof world !== "undefined" ? world : null;
    var snapshot = currentWorld && currentWorld.generationSnapshot ? currentWorld.generationSnapshot : null;
    var terrainDigest = snapshot && snapshot.terrainDigest ? snapshot.terrainDigest : "";
    return [
      currentWorld && currentWorld.seedText ? currentWorld.seedText : "",
      typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 0,
      typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 0,
      this.getTerrainTextureSize().width,
      this.getTerrainTextureSize().height,
      currentWorld && currentWorld.planetTiles ? currentWorld.planetTiles.length : 0,
      currentWorld && currentWorld.terrain ? currentWorld.terrain.length : 0,
      terrainDigest
    ].join(":");
  },

  getObservationOverlaySignature: function () {
    var activeId = typeof world !== "undefined" && world && world.activeObservationOverlay
      ? world.activeObservationOverlay
      : "none";

    return [
      activeId,
      typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 0,
      typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 0,
      typeof world !== "undefined" && world && world.tick ? world.tick : 0,
      typeof world !== "undefined" && world && world.organisms ? world.organisms.length : 0,
      typeof world !== "undefined" && world && world.food ? world.food.length : 0,
      typeof world !== "undefined" && world && world.atmosphere ? JSON.stringify(world.atmosphere.gases || {}) : "",
      typeof world !== "undefined" && world && world.microbial ? String(world.microbial.ageTicks || 0) + ":" + String(world.microbial.totalDensity || 0) : ""
    ].join(":");
  },

  createRgbaTexture: function (device, label, width, height, data) {
    var texture = device.createTexture({
      label: label,
      size: { width: width, height: height },
      format: "rgba8unorm",
      usage: 4 | 2
    });

    if (device.queue && typeof device.queue.writeTexture === "function") {
      device.queue.writeTexture(
        { texture: texture },
        data,
        { bytesPerRow: width * 4, rowsPerImage: height },
        { width: width, height: height }
      );
    }

    return texture;
  },

  uploadTerrainTexture: function (device) {
    var state = this.state;
    var targetDevice = this.getDevice(device);
    var signature = this.getTextureSignature();
    var dimensions = this.getTerrainTextureSize();
    var width = dimensions.width;
    var height = dimensions.height;
    var startedAt;
    var data;
    var x;
    var y;
    var index;
    var rgb;
    var sourceRgb;

    if (state.terrainTexture && state.textureSignature === signature) {
      return state.terrainTexture;
    }

    if (!targetDevice || !width || !height) {
      throw new Error("WebGPU globe terrain upload requires world dimensions");
    }

    startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    data = new Uint8Array(width * height * 4);
    sourceRgb = this.getTerrainSourceRgb();

    for (y = 0; y < height; y += 1) {
      for (x = 0; x < width; x += 1) {
        index = (y * width + x) * 4;
        rgb = this.sampleTerrainRgb((x + 0.5) / width, (y + 0.5) / height, sourceRgb);

        data[index] = Math.max(0, Math.min(255, Math.round(rgb.red)));
        data[index + 1] = Math.max(0, Math.min(255, Math.round(rgb.green)));
        data[index + 2] = Math.max(0, Math.min(255, Math.round(rgb.blue)));
        data[index + 3] = 255;
      }
    }

    if (state.terrainTexture && typeof state.terrainTexture.destroy === "function") {
      state.terrainTexture.destroy();
    }

    state.terrainTexture = this.createRgbaTexture(targetDevice, "globe-sphere.terrain", width, height, data);
    state.textureSignature = signature;
    state.textureUploadCount += 1;
    state.lastTextureUploadMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    return state.terrainTexture;
  },

  getOrCreateTerrainPyramidTexture: function (device, levelSpec) {
    var state = this.state;
    var targetDevice = this.getDevice(device);
    var activeLevel = levelSpec || this.getUnderlayPyramidLevel(0);
    var signature = this.getTextureSignature();
    var pyramid = state.terrainPyramid || { signature: null, textures: {}, metrics: {} };
    var textureKey = String(activeLevel.level);
    var startedAt;
    var sourceRgb;
    var built;

    if (pyramid.signature !== signature) {
      this.resetTerrainPyramidTextures();
      pyramid = state.terrainPyramid;
    }

    if (pyramid.textures && pyramid.textures[textureKey]) {
      return pyramid.textures[textureKey];
    }

    if (!targetDevice || !activeLevel.width || !activeLevel.height) {
      throw new Error("WebGPU globe underlay pyramid upload requires world dimensions");
    }

    startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    sourceRgb = this.getTerrainSourceRgb();
    built = this.buildUnderlayPyramidRgbaData(activeLevel, sourceRgb);

    pyramid.textures[textureKey] = this.createRgbaTexture(
      targetDevice,
      "globe-underlay-pyramid." + activeLevel.name,
      activeLevel.width,
      activeLevel.height,
      built.data
    );
    pyramid.metrics[textureKey] = built.metrics;
    state.underlayPyramidUploadCount += 1;
    state.lastUnderlayPyramidUploadMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    return pyramid.textures[textureKey];
  },

  prewarmTerrainPyramidTexture: function (device, options) {
    var spec = options || {};
    var requestedLevel = this.getRequestedUnderlayLevel(spec);
    var levelSpec = this.getUnderlayPyramidLevel(requestedLevel);

    return this.getOrCreateTerrainPyramidTexture(device, levelSpec);
  },

  uploadTerrainPyramidTexture: function (device, options) {
    var spec = options || {};
    var requestedLevel = this.getRequestedUnderlayLevel(spec);
    var levelSpec = this.getUnderlayPyramidLevel(requestedLevel);
    var texture = this.getOrCreateTerrainPyramidTexture(device, levelSpec);
    var pyramid = this.state.terrainPyramid || { metrics: {} };
    var textureKey = String(levelSpec.level);

    this.publishUnderlayPyramidSelection(levelSpec, levelSpec, spec, pyramid.metrics[textureKey]);
    return texture;
  },

  publishUnderlayPyramidSelection: function (requestedLevelSpec, activeLevelSpec, options, metrics) {
    var spec = options || {};
    var readyChildCoverage = Math.max(0, Math.min(1, Number(spec.readyChildCoverage)));
    var readyCoverage = Number.isFinite(readyChildCoverage) ? readyChildCoverage : 1;
    var requested = requestedLevelSpec || this.getUnderlayPyramidLevel(0);
    var active = activeLevelSpec || requested;

    this.state.lastUnderlayRequestedLevel = requested.level;
    this.state.lastUnderlaySourceLevel = active.level;
    this.state.lastUnderlayRequestedName = requested.name;
    this.state.lastUnderlaySourceName = active.name;
    this.state.lastUnderlayTextureWidth = active.width;
    this.state.lastUnderlayTextureHeight = active.height;
    this.state.lastReadyChildCoverage = readyCoverage;
    this.state.lastFallbackStaleCoverage = Math.max(0, Math.min(1, Number(spec.fallbackStaleCoverage) || (1 - readyCoverage)));
    this.state.lastSmearEvidence = active.level < requested.level ? 1 : 0;
    this.state.lastFlatParentEvidence = metrics ? Number(metrics.flatParentEvidence) || 0 : 0;
  },

  uploadObservationOverlayTexture: function (device) {
    var state = this.state;
    var targetDevice = this.getDevice(device);
    var activeId = PS.render.observationOverlays ? PS.render.observationOverlays.getActiveId() : "none";
    var overlay = PS.render.overlays && typeof PS.render.overlays.get === "function"
      ? PS.render.overlays.get(activeId)
      : null;
    var signature = this.getObservationOverlaySignature();
    var width = typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 0;
    var height = typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 0;
    var startedAt;
    var data;
    var sample;
    var x;
    var y;
    var index;

    if (state.overlayTexture && state.overlaySignature === signature) {
      return state.overlayTexture;
    }

    if (!targetDevice || !width || !height) {
      throw new Error("WebGPU globe overlay upload requires world dimensions");
    }

    startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    data = new Uint8Array(width * height * 4);

    if (overlay && activeId !== "none" && PS.render.observationOverlays) {
      for (y = 0; y < height; y += 1) {
        for (x = 0; x < width; x += 1) {
          index = (y * width + x) * 4;
          sample = PS.render.observationOverlays.getOverlaySample(activeId, x, y, getPlanetTile(x, y));
          data[index] = sample.red;
          data[index + 1] = sample.green;
          data[index + 2] = sample.blue;
          data[index + 3] = sample.alpha;
        }
      }
    }

    if (state.overlayTexture && typeof state.overlayTexture.destroy === "function") {
      state.overlayTexture.destroy();
    }

    state.overlayTexture = this.createRgbaTexture(targetDevice, "globe-sphere.overlay", width, height, data);
    state.overlaySignature = signature;
    state.overlayUploadCount += 1;
    state.lastOverlayUploadMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    state.lastUsedObservationOverlay = activeId;
    return state.overlayTexture;
  },

  ensureSampler: function (device) {
    if (!this.state.sampler) {
      this.state.sampler = device.createSampler({
        label: "globe-sphere.sampler",
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "clamp-to-edge"
      });
    }

    return this.state.sampler;
  },

  ensureUniformBuffer: function (device) {
    if (!this.state.uniformBuffer) {
      this.state.uniformBuffer = device.createBuffer({
        label: "globe-sphere.uniforms",
        size: 96,
        usage: 64 | 8
      });
    }

    return this.state.uniformBuffer;
  },

  ensurePipeline: function (device) {
    // Source contract: globe alpha blending uses srcFactor: "src-alpha" and dstFactor: "one-minus-src-alpha".
    return PS.render.ensureAlphaBlendPipeline(this, device, {
      label: "globe-sphere.pipeline"
    });
  },

  getOverlayMode: function (overlay) {
    var blendMode = overlay ? String(overlay.blendMode || "") : "";

    if (blendMode === "screen") {
      return 1;
    }

    if (blendMode === "lighter" || blendMode === "plus-lighter") {
      return 2;
    }

    return 0;
  },

  getSunDirection: function (projection, options) {
    var spec = options || {};
    var currentWorld = typeof world !== "undefined" ? world : null;
    var cycle = spec.lightingCycleState || (PS.render.lightingCycle && typeof PS.render.lightingCycle.getState === "function"
      ? PS.render.lightingCycle.getState(spec)
      : null);
    var value = spec.sunDirection || (currentWorld && currentWorld.sunDirection ? currentWorld.sunDirection : null) || (cycle ? cycle.sunDirection : null);
    var tick = currentWorld && Number.isFinite(Number(currentWorld.tick)) ? Number(currentWorld.tick) : 0;
    var angle = tick * 0.00024;
    var x;
    var y;
    var z;
    var length;

    if (value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) && Number.isFinite(Number(value.z))) {
      x = Number(value.x);
      y = Number(value.y);
      z = Number(value.z);
    } else if (Array.isArray(value) && value.length >= 3) {
      x = Number(value[0]);
      y = Number(value[1]);
      z = Number(value[2]);
    } else {
      x = Math.cos(angle) * -0.58;
      y = 0.42;
      z = Math.sin(angle) * 0.36 + 0.66;
    }

    length = Math.sqrt(x * x + y * y + z * z) || 1;
    return {
      x: x / length,
      y: y / length,
      z: z / length
    };
  },

  /**
   * @description Packs globe projection, overlay, lighting, camera, atmosphere, and debug toggles into the uniform buffer consumed by the WebGPU globe shader.
   * @param {Object|null} projection Current globe projection state.
   * @param {Object|null} overlay Active observation overlay descriptor.
   * @param {Object|null} options Render options and optional lighting overrides.
   * @returns {Float32Array} Uniform data laid out for the globe shader.
   */
  makeUniformData: function (projection, overlay, options) {
    var spec = options || {};
    var cycle = spec.lightingCycleState || (PS.render.lightingCycle && typeof PS.render.lightingCycle.getState === "function"
      ? PS.render.lightingCycle.getState(spec)
      : null);
    var previousCycle = spec.lightingCycleState;
    var ambientColor = Array.isArray(spec.ambientColor) && spec.ambientColor.length >= 3
      ? spec.ambientColor
      : (cycle ? cycle.ambientColor : [1, 1, 1]);
    var data = new Float32Array(24);
    var viewLatDeg = Number(projection && projection.viewLatitudeDeg) || 0;
    var viewLonDeg = Number(projection && projection.viewLongitudeDeg) || 0;
    var sun;

    spec.lightingCycleState = cycle;
    sun = this.getSunDirection(projection, spec);
    spec.lightingCycleState = previousCycle;

    data[0] = Number((PS.gpu && PS.gpu.canvas && PS.gpu.canvas.width) || (typeof canvas !== "undefined" && canvas ? canvas.width : 1)) || 1;
    data[1] = Number((PS.gpu && PS.gpu.canvas && PS.gpu.canvas.height) || (typeof canvas !== "undefined" && canvas ? canvas.height : 1)) || 1;
    data[4] = Number(projection && projection.centerX) || data[0] * 0.5;
    data[5] = Number(projection && projection.centerY) || data[1] * 0.5;
    data[6] = Number(projection && projection.radius) || Math.min(data[0], data[1]) * 0.45;
    data[8] = viewLatDeg * Math.PI / 180;
    data[9] = viewLonDeg * Math.PI / 180;
    data[10] = this.getOverlayMode(overlay);
    data[11] = overlay ? Math.max(0, Math.min(1, Number(overlay.alpha) || 1)) : 0;
    data[12] = sun.x;
    data[13] = sun.y;
    data[14] = sun.z;
    data[15] = Math.max(0, Math.min(1, spec.alpha !== undefined ? Number(spec.alpha) || 0 : 1));
    data[16] = spec.ambient !== undefined ? Math.max(0, Math.min(1, Number(spec.ambient) || 0)) : (cycle ? cycle.ambient : 0.32);
    data[17] = spec.directionalStrength !== undefined ? Math.max(0, Number(spec.directionalStrength) || 0) : (cycle ? cycle.directionalStrength : 0.52);
    data[18] = spec.wrapStrength !== undefined ? Math.max(0, Number(spec.wrapStrength) || 0) : (cycle ? cycle.wrapStrength : 0.16);
    data[19] = spec.heightTintStrength !== undefined ? Math.max(0, Number(spec.heightTintStrength) || 0) : (cycle ? cycle.heightTintStrength : 0.08);
    data[20] = Math.max(0, Math.min(1, Number(ambientColor[0]) || 0));
    data[21] = Math.max(0, Math.min(1, Number(ambientColor[1]) || 0));
    data[22] = Math.max(0, Math.min(1, Number(ambientColor[2]) || 0));
    data[23] = 0;
    return data;
  },

  createBindGroup: function (device, pipeline, terrainTexture, overlayTexture) {
    var terrainView = terrainTexture && typeof terrainTexture.createView === "function" ? terrainTexture.createView() : terrainTexture;
    var overlayView = overlayTexture && typeof overlayTexture.createView === "function" ? overlayTexture.createView() : overlayTexture;

    return device.createBindGroup({
      label: "globe-sphere.bind-group",
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: terrainView },
        { binding: 1, resource: overlayView },
        { binding: 2, resource: this.ensureSampler(device) },
        { binding: 3, resource: { buffer: this.ensureUniformBuffer(device) } }
      ]
    });
  },

  drawGlobe: function (projection, options) {
    return this.draw(projection, options);
  },

  draw: function (projection, options) {
    var startedAt = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    var spec = options || {};
    var device = this.getDevice(spec.device);
    var context = spec.context || (PS.gpu && PS.gpu.context);
    var textureView = spec.textureView || (context && typeof context.getCurrentTexture === "function" ? context.getCurrentTexture().createView() : null);
    var terrainTexture = spec.terrainTexture || this.uploadTerrainTexture(device);
    var overlayTexture = spec.overlayTexture || this.uploadObservationOverlayTexture(device) || terrainTexture;
    var overlay = spec.overlay || null;
    var pipeline;
    var encoder;
    var pass;
    var commandBuffer;

    if (!projection) {
      throw new Error("WebGPU globe draw requires a projection");
    }

    if (!device || typeof device.createCommandEncoder !== "function") {
      throw new Error("WebGPU globe draw requires GPUDevice");
    }

    if (!textureView) {
      throw new Error("WebGPU globe draw requires a render target view");
    }

    if (!terrainTexture || !overlayTexture) {
      throw new Error("WebGPU globe draw requires terrain and overlay textures");
    }

    pipeline = this.ensurePipeline(device);
    device.queue.writeBuffer(this.ensureUniformBuffer(device), 0, this.makeUniformData(projection, overlay, spec));
    this.state.bindGroup = this.createBindGroup(device, pipeline, terrainTexture, overlayTexture);
    encoder = spec.commandEncoder || device.createCommandEncoder({ label: "globe-sphere.encoder" });
    pass = encoder.beginRenderPass({
      label: "globe-sphere.render-pass",
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 1 / 255, g: 3 / 255, b: 10 / 255, a: 1 },
          loadOp: spec.loadOp || "clear",
        storeOp: "store"
      }]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.state.bindGroup);
    pass.draw(4, 1, 0, 0);
    pass.end();

    if (!spec.commandEncoder) {
      commandBuffer = encoder.finish();
      device.queue.submit([commandBuffer]);
    }

    this.state.drawCount += 1;
    this.state.lastFrameMs = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - startedAt;
    this.state.lastError = "";
    return true;
  },

  getStats: function () {
    return {
      drawCount: this.state.drawCount,
      textureUploadCount: this.state.textureUploadCount,
      underlayPyramidUploadCount: this.state.underlayPyramidUploadCount,
      overlayUploadCount: this.state.overlayUploadCount,
      lastTextureUploadMs: this.state.lastTextureUploadMs,
      lastUnderlayPyramidUploadMs: this.state.lastUnderlayPyramidUploadMs,
      underlayRequestedLevel: this.state.lastUnderlayRequestedLevel,
      underlaySourceLevel: this.state.lastUnderlaySourceLevel,
      underlayRequestedName: this.state.lastUnderlayRequestedName,
      underlaySourceName: this.state.lastUnderlaySourceName,
      underlayTextureWidth: this.state.lastUnderlayTextureWidth,
      underlayTextureHeight: this.state.lastUnderlayTextureHeight,
      readyChildCoverage: this.state.lastReadyChildCoverage,
      fallbackStaleCoverage: this.state.lastFallbackStaleCoverage,
      smearEvidence: this.state.lastSmearEvidence,
      flatParentEvidence: this.state.lastFlatParentEvidence,
      lastOverlayUploadMs: this.state.lastOverlayUploadMs,
      lastUsedObservationOverlay: this.state.lastUsedObservationOverlay,
      lastFrameMs: this.state.lastFrameMs,
      lastError: this.state.lastError
    };
  },

  rebuildShaders: function () {
    this.state.pipeline = null;
    this.state.bindGroup = null;
  }
};
