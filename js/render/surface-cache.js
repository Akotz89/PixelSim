import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getClampedWorldY, getPlanetTile, getWrappedWorldX } from "./planet-grid.js";
import { getPlanetSurfaceDetail, getSurfaceMeterCoordinate, smoothSurfaceNoiseAmount } from "./planet-surface.js";
import { getLatLonFromSurfaceMeterCoordinate, getPlanetSurfaceLodZoomIndex, getPlanetSurfaceTileBlend, getPlanetView, getPlanetZoomLevel, getPositiveModulo, getTileFromLatLon, normalizeLongitude, planetSurfaceChunkCache } from "./planet-view.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

PS.render = PS.render || {};
PS.render.surface = PS.render.surface || {};

PS.render.surface.getChunkSampleCount = function () {
  if (typeof world !== "undefined" && world && world.isCameraInteracting) {
    return Math.max(4, Math.round(Number(CONFIG.PLANET_SURFACE_INTERACTIVE_CHUNK_SAMPLES) || 4));
  }

  return Math.max(8, Math.round(Number(CONFIG.PLANET_SURFACE_CHUNK_SAMPLES) || 32));
};

PS.render.surface.getChunkCacheLimit = function () {
  return Math.max(32, Math.round(Number(CONFIG.PLANET_SURFACE_CHUNK_CACHE_LIMIT) || 768));
};

PS.render.surface.getVisibleChunkLimit = function () {
  var configuredLimit = Math.round(Number(CONFIG.PLANET_SURFACE_VISIBLE_CHUNK_LIMIT) || 96);
  var cacheLimited = Math.floor(PS.render.surface.getChunkCacheLimit() * 0.75);
  var effectiveLimit = Math.max(16, configuredLimit);
  var closeLimit = Math.round(Number(CONFIG.PLANET_SURFACE_CLOSE_VISIBLE_CHUNK_LIMIT) || effectiveLimit);
  var view = typeof getPlanetView === "function" ? getPlanetView() : null;
  var architectureZoom = PS.render.lod && typeof PS.render.lod.getArchitectureZoom === "function"
    ? PS.render.lod.getArchitectureZoom(view ? view.zoomLevel : 0)
    : Number(view && view.zoomLevel) || 0;

  if (architectureZoom >= 15) {
    effectiveLimit = Math.min(effectiveLimit, Math.max(16, closeLimit));
  }

  return Math.max(16, Math.min(effectiveLimit, Math.max(16, cacheLimited)));
};

PS.render.surface.resetChunkCache = function () {
  planetSurfaceChunkCache.chunks = {};
  planetSurfaceChunkCache.order = [];
  planetSurfaceChunkCache.stats = {
    hits: 0,
    misses: 0,
    generatedChunks: 0,
    evictions: 0,
    lastChunkKey: "-",
    lastSampleKey: "-"
  };
};

PS.render.surface.getCacheStats = function () {
  var sampleCount = 0;

  for (var i = 0; i < planetSurfaceChunkCache.order.length; i++) {
    var chunk = planetSurfaceChunkCache.chunks[planetSurfaceChunkCache.order[i]];
    sampleCount += chunk && chunk.samples ? Object.keys(chunk.samples).length : 0;
  }

  return {
    chunks: planetSurfaceChunkCache.order.length,
    samples: sampleCount,
    hits: planetSurfaceChunkCache.stats.hits,
    misses: planetSurfaceChunkCache.stats.misses,
    generatedChunks: planetSurfaceChunkCache.stats.generatedChunks,
    evictions: planetSurfaceChunkCache.stats.evictions,
    lastChunkKey: planetSurfaceChunkCache.stats.lastChunkKey,
    lastSampleKey: planetSurfaceChunkCache.stats.lastSampleKey
  };
};

PS.render.surface.getSampleAddress = function (latitude, longitude, zoomLevelIndex) {
  var scale = getPlanetZoomLevel(
    typeof zoomLevelIndex === "number" ? zoomLevelIndex : getPlanetSurfaceLodZoomIndex(getPlanetView().zoomLevel)
  );
  var chunkSamples = PS.render.surface.getChunkSampleCount();
  var meters = getSurfaceMeterCoordinate(latitude, longitude);
  var sampleMeters = Math.max(0.1, scale.metersPerSample);
  var sampleEast = Math.floor(meters.eastMeters / sampleMeters);
  var sampleNorth = Math.floor(meters.northMeters / sampleMeters);
  var chunkX = Math.floor(sampleEast / chunkSamples);
  var chunkY = Math.floor(sampleNorth / chunkSamples);
  var localSampleX = getPositiveModulo(sampleEast, chunkSamples);
  var localSampleY = getPositiveModulo(sampleNorth, chunkSamples);
  var chunkKey = [scale.index, sampleMeters, chunkSamples, chunkX, chunkY].join(":");
  var sampleKey = localSampleX + ":" + localSampleY;

  return {
    zoomLevel: scale.index,
    scaleName: scale.name,
    sampleMeters: sampleMeters,
    chunkSamples: chunkSamples,
    sampleEast: sampleEast,
    sampleNorth: sampleNorth,
    chunkX: chunkX,
    chunkY: chunkY,
    localSampleX: localSampleX,
    localSampleY: localSampleY,
    chunkKey: chunkKey,
    sampleKey: sampleKey
  };
};

PS.render.surface.getChunkKeyForLatLon = function (latitude, longitude, zoomLevelIndex) {
  return PS.render.surface.getSampleAddress(latitude, longitude, zoomLevelIndex).chunkKey;
};

PS.render.surface.getTileBlend = function (latitude, longitude) {
  var normalizedLongitude = normalizeLongitude(longitude);
  var normalizedLatitude = clamp(Number(latitude) || 0, -90, 90);
  var xFloat = ((normalizedLongitude + 180) / 360) * Math.max(1, WORLD_WIDTH) - 0.5;
  var yFloat = ((90 - normalizedLatitude) / 180) * Math.max(1, WORLD_HEIGHT) - 0.5;
  var x0 = Math.floor(xFloat);
  var y0 = Math.floor(yFloat);
  var xAmount = smoothSurfaceNoiseAmount(xFloat - x0);
  var yAmount = smoothSurfaceNoiseAmount(yFloat - y0);
  var rawTiles = [
    { x: x0, y: y0, weight: (1 - xAmount) * (1 - yAmount) },
    { x: x0 + 1, y: y0, weight: xAmount * (1 - yAmount) },
    { x: x0, y: y0 + 1, weight: (1 - xAmount) * yAmount },
    { x: x0 + 1, y: y0 + 1, weight: xAmount * yAmount }
  ];
  var tiles = [];
  var biomeWeights = {};
  var totalWeight = 0;
  var dominantBiome = "unknown";
  var dominantWeight = 0;

  for (var i = 0; i < rawTiles.length; i++) {
    var raw = rawTiles[i];
    var tileX = getWrappedWorldX(raw.x);
    var tileY = getClampedWorldY(raw.y);
    var tile = getPlanetTile(tileX, tileY);
    var weight = clamp(Number(raw.weight) || 0, 0, 1);
    var biome = tile && tile.biome ? tile.biome : "unknown";

    if (weight <= 0) {
      continue;
    }

    tiles.push({
      x: tileX,
      y: tileY,
      weight: weight,
      biome: biome,
      tile: tile
    });
    biomeWeights[biome] = (biomeWeights[biome] || 0) + weight;
    totalWeight += weight;
  }

  if (totalWeight > 0 && Math.abs(totalWeight - 1) > 0.000001) {
    tiles.forEach(function (item) {
      item.weight = item.weight / totalWeight;
    });

    Object.keys(biomeWeights).forEach(function (biome) {
      biomeWeights[biome] = biomeWeights[biome] / totalWeight;
    });
    totalWeight = 1;
  }

  Object.keys(biomeWeights).forEach(function (biome) {
    if (biomeWeights[biome] > dominantWeight) {
      dominantWeight = biomeWeights[biome];
      dominantBiome = biome;
    }
  });

  return {
    tiles: tiles,
    biomeWeights: biomeWeights,
    dominantBiome: dominantBiome,
    dominantWeight: dominantWeight,
    transitionStrength: clamp(1 - dominantWeight, 0, 1),
    xAmount: xAmount,
    yAmount: yAmount,
    totalWeight: totalWeight
  };
};

PS.render.surface.getAcceptedTransitionCellName = function (resolvedTile, tileBlend) {
  if (resolvedTile && resolvedTile.acceptedTransitionCellName) {
    return String(resolvedTile.acceptedTransitionCellName);
  }

  var tiles = tileBlend && Array.isArray(tileBlend.tiles) ? tileBlend.tiles : [];
  var bestName = "";
  var bestWeight = 0;

  for (var i = 0; i < tiles.length; i += 1) {
    var item = tiles[i];
    var tile = item && item.tile ? item.tile : null;
    var weight = Math.max(0, Number(item && item.weight) || 0);

    if (tile && tile.acceptedTransitionCellName && weight > bestWeight) {
      bestName = String(tile.acceptedTransitionCellName);
      bestWeight = weight;
    }
  }

  return bestName;
};

PS.render.surface.getLocalSample = function (gridX, gridY) {
  var localAddress = PS.render.surface.getLocalAddress(gridX, gridY);
  var tilePosition = getTileFromLatLon(localAddress.latitude, localAddress.longitude);
  var tile = getPlanetTile(tilePosition.x, tilePosition.y);
  var cachedSample = PS.render.surface.getChunkSample(localAddress.latitude, localAddress.longitude, tile);

  return {
    x: cachedSample.x,
    y: cachedSample.y,
    latitude: cachedSample.latitude,
    longitude: cachedSample.longitude,
    tile: cachedSample.tile,
    biome: cachedSample.biome,
    detail: cachedSample.detail,
    surfaceChunkKey: cachedSample.surfaceChunkKey,
    surfaceSampleKey: cachedSample.surfaceSampleKey,
    surfaceChunkX: cachedSample.surfaceChunkX,
    surfaceChunkY: cachedSample.surfaceChunkY,
    surfaceParentLineage: cachedSample.surfaceParentLineage,
    surfaceSampleX: cachedSample.surfaceSampleX,
    surfaceSampleY: cachedSample.surfaceSampleY,
    surfaceChunkLocalX: cachedSample.surfaceChunkLocalX,
    surfaceChunkLocalY: cachedSample.surfaceChunkLocalY,
    surfaceSampleMeters: cachedSample.surfaceSampleMeters,
    eastKm: localAddress.eastKm,
    northKm: localAddress.northKm
  };
};

PS.render.surface.getLatLonFromChunkAddress = function (address, localSampleX, localSampleY) {
  var sampleEast = address.chunkX * address.chunkSamples + Math.round(Number(localSampleX) || 0);
  var sampleNorth = address.chunkY * address.chunkSamples + Math.round(Number(localSampleY) || 0);
  var eastMeters = (sampleEast + 0.5) * address.sampleMeters;
  var northMeters = (sampleNorth + 0.5) * address.sampleMeters;

  return getLatLonFromSurfaceMeterCoordinate(eastMeters, northMeters);
};

PS.render.surface.getChunkSampleAtAddress = function (address, localSampleX, localSampleY) {
  var latLon = PS.render.surface.getLatLonFromChunkAddress(address, localSampleX, localSampleY);

  return PS.render.surface.getChunkSample(latLon.latitude, latLon.longitude, null, address.zoomLevel);
};

PS.render.surface.getChunk = function (address) {
  var chunk = planetSurfaceChunkCache.chunks[address.chunkKey];

  if (chunk) {
    return chunk;
  }

  chunk = {
    key: address.chunkKey,
    zoomLevel: address.zoomLevel,
    sampleMeters: address.sampleMeters,
    chunkSamples: address.chunkSamples,
    chunkX: address.chunkX,
    chunkY: address.chunkY,
    parentLineage: PS.render.surface.getChunkLineage(address),
    samples: {}
  };

  planetSurfaceChunkCache.chunks[address.chunkKey] = chunk;
  planetSurfaceChunkCache.order.push(address.chunkKey);
  planetSurfaceChunkCache.stats.generatedChunks++;

  while (planetSurfaceChunkCache.order.length > PS.render.surface.getChunkCacheLimit()) {
    var evictedKey = planetSurfaceChunkCache.order.shift();
    delete planetSurfaceChunkCache.chunks[evictedKey];
    planetSurfaceChunkCache.stats.evictions++;
  }

  return chunk;
};

PS.render.surface.getChunkSample = function (latitude, longitude, tile, zoomLevelIndex) {
  var address = PS.render.surface.getSampleAddress(latitude, longitude, zoomLevelIndex);
  var chunk = PS.render.surface.getChunk(address);
  var cachedSample = chunk.samples[address.sampleKey];

  planetSurfaceChunkCache.stats.lastChunkKey = address.chunkKey;
  planetSurfaceChunkCache.stats.lastSampleKey = address.sampleKey;

  if (cachedSample) {
    planetSurfaceChunkCache.stats.hits++;
    return cachedSample;
  }

  var tilePosition = tile ? { x: tile.x, y: tile.y } : getTileFromLatLon(latitude, longitude);
  var resolvedTile = tile || getPlanetTile(tilePosition.x, tilePosition.y);
  var tileBlend = getPlanetSurfaceTileBlend(latitude, longitude);

  planetSurfaceChunkCache.stats.misses++;
  cachedSample = {
    x: tilePosition.x,
    y: tilePosition.y,
    latitude: latitude,
    longitude: longitude,
    tile: resolvedTile,
    biome: resolvedTile ? resolvedTile.biome : "unknown",
    tileBlend: tileBlend,
    acceptedTransitionCellName: PS.render.surface.getAcceptedTransitionCellName(resolvedTile, tileBlend),
    detail: getPlanetSurfaceDetail(latitude, longitude, resolvedTile, address.sampleMeters),
    surfaceChunkKey: address.chunkKey,
    surfaceSampleKey: address.sampleKey,
    surfaceChunkX: address.chunkX,
    surfaceChunkY: address.chunkY,
    surfaceParentLineage: chunk.parentLineage,
    surfaceSampleX: address.sampleEast,
    surfaceSampleY: address.sampleNorth,
    surfaceChunkLocalX: address.localSampleX,
    surfaceChunkLocalY: address.localSampleY,
    surfaceSampleMeters: address.sampleMeters
  };
  chunk.samples[address.sampleKey] = cachedSample;

  return cachedSample;
};
