"use strict";
PS.render = PS.render || {};
PS.render.environmentOverlays = PS.render.environmentOverlays || {
  width: 0,
  height: 0,
  snowBaseMap: null,
  snowBaseData: null,
  stats: {
    snowOverlayCount: 0,
    iceOverlayCount: 0
  },

  initSnowBase: function (width, height) {
    this.width = Math.max(1, Math.round(Number(width) || (typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 1)));
    this.height = Math.max(1, Math.round(Number(height) || (typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 1)));
    this.snowBaseMap = new PS.core.Bitsmap(2, this.width * this.height);
    this.snowBaseData = this.snowBaseMap.data;
    return this;
  },

  ensureSnowBase: function () {
    var expectedWidth = Math.max(1, Number(typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : this.width) || this.width || 1);
    var expectedHeight = Math.max(1, Number(typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : this.height) || this.height || 1);

    if (!this.snowBaseData || !this.snowBaseMap || this.width !== expectedWidth || this.height !== expectedHeight || this.snowBaseMap.data !== this.snowBaseData) {
      this.initSnowBase(expectedWidth, expectedHeight);
    }

    return this;
  },

  wrapX: function (x) {
    this.ensureSnowBase();
    var ix = Math.round(Number(x) || 0) % this.width;
    return ix < 0 ? ix + this.width : ix;
  },

  clampY: function (y) {
    this.ensureSnowBase();
    var iy = Math.round(Number(y) || 0);
    return iy < 0 ? 0 : (iy >= this.height ? this.height - 1 : iy);
  },

  tileIndex: function (x, y) {
    this.ensureSnowBase();
    return this.clampY(y) * this.width + this.wrapX(x);
  },

  getSnowBase: function (x, y) {
    return this.snowBaseMap.get(this.tileIndex(x, y));
  },

  setSnowBase: function (x, y, value) {
    return this.snowBaseMap.set(this.tileIndex(x, y), value);
  },

  hash: function (x, y, salt) {
    var mixed = (Math.round(Number(x) || 0) * 374761393) ^
      (Math.round(Number(y) || 0) * 668265263) ^
      (Math.round(Number(salt) || 0) * 2246822519);

    mixed = Math.imul(mixed ^ (mixed >>> 13), 1274126177);
    return (mixed ^ (mixed >>> 16)) >>> 0;
  },

  variant: function (x, y, salt, count) {
    var max = Math.max(1, Math.round(Number(count) || 1));

    if (PS.ranmap && PS.ranmap.data && typeof PS.ranmap.variant === "function") {
      return PS.ranmap.variant(x + salt * 19, y - salt * 13, max);
    }

    return this.hash(x, y, salt) % max;
  },

  roll: function (x, y, salt) {
    if (PS.ranmap && PS.ranmap.data && typeof PS.ranmap.normalizedBits === "function") {
      return PS.ranmap.normalizedBits(x + salt * 7, y - salt * 11, 0, 16);
    }

    return this.hash(x, y, salt) / 4294967295;
  },

  getSnowBaseNoise: function (x, y) {
    var cellX = Math.floor((Number(x) || 0) / 8);
    var cellY = Math.floor((Number(y) || 0) / 8);
    return this.roll(cellX, cellY, 89);
  },

  populateSnowBase: function (width, height) {
    this.initSnowBase(width, height);
    for (var y = 0; y < this.height; y += 1) {
      for (var x = 0; x < this.width; x += 1) {
        this.setSnowBase(x, y, Math.floor(this.getSnowBaseNoise(x, y) * 4));
      }
    }
    return this.snowBaseData;
  },

  getGlobalSnow: function () {
    if (typeof world !== "undefined" && world) {
      if (Number.isFinite(Number(world.globalSnow))) { return Math.max(0, Math.min(1, Number(world.globalSnow))); }
      if (Number.isFinite(Number(world.snow))) { return Math.max(0, Math.min(1, Number(world.snow))); }
      if (world.weather && Number.isFinite(Number(world.weather.snow))) {
        return Math.max(0, Math.min(1, Number(world.weather.snow)));
      }
    }
    return 0;
  },

  getSuppression: function (sample) {
    var detail = sample && sample.detail ? sample.detail : {};
    var signals = detail.materialSignals || sample && sample.materialSignals || {};
    var feature = String(detail.feature || sample && sample.feature || "").toLowerCase();
    var surface = String(detail.surface || sample && sample.surface || "").toLowerCase();
    var roof = Boolean(sample && (sample.roof || sample.hasRoof)) || Boolean(signals.roof);
    var wall = Boolean(sample && (sample.wall || sample.massiveWall)) || Boolean(signals.wall || signals.massiveWall) ||
      surface.indexOf("wall") >= 0 || feature.indexOf("wall") >= 0;
    var traffic = Math.max(
      Number(signals.traffic) || 0,
      Number(signals.pathTraffic) || 0,
      Number(sample && sample.pathHeuristic) || 0,
      Number(sample && sample.traffic) || 0
    );

    return {
      roof: roof,
      wall: wall,
      traffic: Math.max(0, Math.min(1, traffic))
    };
  },

  computeSnowLevel: function (sample, tileX, tileY, globalSnow) {
    var suppression = this.getSuppression(sample);
    var snow = globalSnow === undefined ? this.getGlobalSnow() : Math.max(0, Math.min(1, Number(globalSnow) || 0));
    var detail = sample && sample.detail ? sample.detail : {};
    var signals = detail.materialSignals || sample && sample.materialSignals || {};
    var light = Math.max(0, Math.min(1, Number(signals.light !== undefined ? signals.light : sample && sample.light) || 0));
    var base = this.getSnowBase(tileX, tileY);
    var random = this.variant(tileX, tileY, 91, 16) / 15;
    var score;

    if (suppression.roof || suppression.wall || suppression.traffic >= 0.72) {
      return 0;
    }

    score = snow - light * 0.11 - base * 0.08 - random * 0.09 - suppression.traffic * 0.28;
    if (score >= 0.68) { return 3; }
    if (score >= 0.46) { return 2; }
    if (score >= 0.24) { return 1; }
    return 0;
  },

  getSnowTileInfo: function (sample, tileX, tileY, globalSnow) {
    var level = this.computeSnowLevel(sample, tileX, tileY, globalSnow);
    var ran = this.hash(tileX, tileY, 97);

    if (level <= 0) {
      return null;
    }

    return {
      level: level,
      variant: (ran & 15) + level * 16,
      offsetX: (ran & 7) - 7,
      offsetY: ((ran >>> 3) & 7) - 7
    };
  },

  getGlobalIce: function () {
    if (typeof world !== "undefined" && world) {
      if (Number.isFinite(Number(world.globalIce))) { return Math.max(0, Math.min(1, Number(world.globalIce))); }
      if (Number.isFinite(Number(world.ice))) { return Math.max(0, Math.min(1, Number(world.ice))); }
      if (world.weather && Number.isFinite(Number(world.weather.ice))) {
        return Math.max(0, Math.min(1, Number(world.weather.ice)));
      }
    }
    return 0;
  },

  isWaterSample: function (sample) {
    if (PS.render.waterRendering && typeof PS.render.waterRendering.isWaterSample === "function") {
      return PS.render.waterRendering.isWaterSample(sample, sample && sample.biome);
    }

    var detail = sample && sample.detail ? sample.detail : {};
    var surface = String(detail.surface || sample && sample.surface || "").toLowerCase();
    var biome = String(sample && sample.biome || "").toLowerCase();
    var signals = detail.materialSignals || sample && sample.materialSignals || {};

    return biome === "ocean" || biome === "lake" || surface.indexOf("water") >= 0 || Number(signals.waterDepth) > 0.05;
  },

  getIceThreshold: function (tileX, tileY) {
    return this.hash(tileX, tileY, 113) & 65535;
  },

  shouldRenderIce: function (sample, tileX, tileY, iceValue) {
    var ice = iceValue === undefined ? this.getGlobalIce() : Math.max(0, Math.min(1, Number(iceValue) || 0));
    var threshold = this.getIceThreshold(tileX, tileY);

    return this.isWaterSample(sample) && ice * 65535 > threshold;
  },

  computeIceMask: function (tileX, tileY, iceValue) {
    var mask = 0;

    if (this.shouldRenderIce(this.getSample(tileX + 1, tileY), tileX + 1, tileY, iceValue)) { mask |= 1; }
    if (this.shouldRenderIce(this.getSample(tileX - 1, tileY), tileX - 1, tileY, iceValue)) { mask |= 2; }
    if (this.shouldRenderIce(this.getSample(tileX, tileY + 1), tileX, tileY + 1, iceValue)) { mask |= 4; }
    if (this.shouldRenderIce(this.getSample(tileX, tileY - 1), tileX, tileY - 1, iceValue)) { mask |= 8; }
    return mask;
  },

  getIceTileInfo: function (sample, tileX, tileY, iceValue) {
    var ice = iceValue === undefined ? this.getGlobalIce() : Math.max(0, Math.min(1, Number(iceValue) || 0));
    var ran;
    var mask;

    if (!this.shouldRenderIce(sample, tileX, tileY, ice)) {
      return null;
    }

    ran = this.hash(tileX, tileY, 127);
    mask = this.computeIceMask(tileX, tileY, ice);
    return {
      mask: mask,
      variant: (ran & 15) + mask * 16,
      alpha: Math.max(0.28, Math.min(0.82, 0.24 + ice * 0.58))
    };
  },

  getVisibleTileRect: function () {
    if (PS.camera && PS.camera.unified && typeof PS.camera.unified.getVisibleTileRect === "function") {
      return PS.camera.unified.getVisibleTileRect();
    }

    return {
      minX: 0,
      minY: 0,
      maxX: Math.max(0, (typeof WORLD_WIDTH !== "undefined" ? WORLD_WIDTH : 1) - 1),
      maxY: Math.max(0, (typeof WORLD_HEIGHT !== "undefined" ? WORLD_HEIGHT : 1) - 1)
    };
  },

  getSample: function (tileX, tileY) {
    if (typeof world !== "undefined" && world && Array.isArray(world.planetTiles)) {
      return world.planetTiles[this.clampY(tileY) * this.width + this.wrapX(tileX)] || null;
    }

    return null;
  },

  buildSnowOverlayRects: function () {
    var rect = this.getVisibleTileRect();
    var tileSize = Math.max(1, Number(typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) || 8);
    var values = [];
    var count = 0;

    this.ensureSnowBase();

    for (var y = Math.max(0, Math.floor(Number(rect.minY) || 0)); y <= Math.min(this.height - 1, Math.ceil(Number(rect.maxY) || 0)); y += 1) {
      for (var x = Math.max(0, Math.floor(Number(rect.minX) || 0)); x <= Math.min(this.width - 1, Math.ceil(Number(rect.maxX) || 0)); x += 1) {
        var info = this.getSnowTileInfo(this.getSample(x, y), x, y);
        var alpha;

        if (!info) {
          continue;
        }

        alpha = Math.min(0.82, 0.18 + info.level * 0.18);
        values.push(
          x * tileSize + info.offsetX,
          y * tileSize + info.offsetY,
          tileSize,
          tileSize,
          0.86 + info.level * 0.035,
          0.92 + info.level * 0.02,
          0.95 + info.level * 0.012,
          alpha
        );
        count += 1;
      }
    }

    this.stats.snowOverlayCount = count;
    return values;
  },

  buildIceOverlayRects: function () {
    var rect = this.getVisibleTileRect();
    var tileSize = Math.max(1, Number(typeof CONFIG !== "undefined" && CONFIG ? CONFIG.TILE_SIZE : 8) || 8);
    var values = [];
    var count = 0;

    this.ensureSnowBase();

    for (var y = Math.max(0, Math.floor(Number(rect.minY) || 0)); y <= Math.min(this.height - 1, Math.ceil(Number(rect.maxY) || 0)); y += 1) {
      for (var x = Math.max(0, Math.floor(Number(rect.minX) || 0)); x <= Math.min(this.width - 1, Math.ceil(Number(rect.maxX) || 0)); x += 1) {
        var info = this.getIceTileInfo(this.getSample(x, y), x, y);

        if (!info) {
          continue;
        }

        values.push(
          x * tileSize,
          y * tileSize,
          tileSize,
          tileSize,
          0.62 + (info.mask & 1) * 0.015,
          0.82 + (info.mask & 2) * 0.012,
          0.90 + (info.mask & 4) * 0.01,
          info.alpha
        );
        count += 1;
      }
    }

    this.stats.iceOverlayCount = count;
    return values;
  },

  drawSnowOverlay: function () {
    var values = this.buildSnowOverlayRects();

    if (!values || values.length <= 0 || !PS.render.webgpuEntity || typeof PS.render.webgpuEntity.drawParticleRects !== "function") {
      return false;
    }

    return PS.render.webgpuEntity.drawParticleRects(new Float32Array(values));
  },

  drawIceOverlay: function () {
    var values = this.buildIceOverlayRects();

    if (!values || values.length <= 0 || !PS.render.webgpuEntity || typeof PS.render.webgpuEntity.drawParticleRects !== "function") {
      return false;
    }

    return PS.render.webgpuEntity.drawParticleRects(new Float32Array(values));
  },

  getStats: function () {
    return Object.assign({}, this.stats);
  }
};
