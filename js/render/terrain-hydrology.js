"use strict";
// Pixeldarium - terrain.js
// Terrain generation and fertile land helpers.

function getTerrain(x, y) {
  return world.terrain[getTileIndex(x, y)];
}

function isFertile(x, y) {
  return getTerrain(x, y) === CONFIG.TERRAIN_FERTILE;
}

function getTerrainNeighborTiles(tile) {
  var neighbors = [];

  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      neighbors.push({
        dx: dx,
        dy: dy,
        tile: getPlanetTile(getWrappedWorldX(tile.x + dx), getClampedWorldY(tile.y + dy))
      });
    }
  }

  return neighbors;
}

function annotatePlanetHydrology() {
  if (!Array.isArray(world.planetTiles) || world.planetTiles.length === 0) {
    return;
  }

  var landTiles = [];
  var totalLandAreaKm2 = 0;

  for (var i = 0; i < world.planetTiles.length; i++) {
    var tile = world.planetTiles[i];

    if (!tile) {
      continue;
    }

    tile.coastFactor = 0;
    tile.coastlineNoise = 0;
    tile.shallowWater = 0;
    tile.shelfStrength = 0;
    tile.waterFlow = 0;
    tile.riverStrength = 0;
    tile.riverMouth = 0;
    tile.flowDirectionX = 0;
    tile.flowDirectionY = 0;

    if (tile.biome !== "ocean") {
      landTiles.push(tile);
      totalLandAreaKm2 += Math.max(0, Number(tile.areaKm2) || 0);
    }
  }

  for (var tileIndex = 0; tileIndex < world.planetTiles.length; tileIndex++) {
    var currentTile = world.planetTiles[tileIndex];

    if (!currentTile) {
      continue;
    }

    var neighbors = getTerrainNeighborTiles(currentTile);
    var waterNeighbors = 0;
    var landNeighbors = 0;
    var secondRingWaterNeighbors = 0;
    var secondRingLandNeighbors = 0;
    var shorelineSeedOffset = typeof hashSeedText === "function" ? hashSeedText(world.seedText || "") % 100000 : 0;
    var coastlineNoise = getTerrainFractalNoise(
      currentTile.x + getDeterministicUnitNoise(currentTile.x, currentTile.y, shorelineSeedOffset + 911) * 0.45,
      currentTile.y + getDeterministicUnitNoise(currentTile.x, currentTile.y, shorelineSeedOffset + 919) * 0.45,
      5.5,
      shorelineSeedOffset + 927,
      3,
      0.48
    );

    for (var neighborIndex = 0; neighborIndex < neighbors.length; neighborIndex++) {
      var neighborTile = neighbors[neighborIndex].tile;

      if (!neighborTile) {
        continue;
      }

      if (neighborTile.biome === "ocean") {
        waterNeighbors++;
      } else {
        landNeighbors++;
      }
    }

    for (var ringY = -2; ringY <= 2; ringY++) {
      for (var ringX = -2; ringX <= 2; ringX++) {
        var ringTile;

        if (Math.max(Math.abs(ringX), Math.abs(ringY)) !== 2) {
          continue;
        }

        ringTile = getPlanetTile(getWrappedWorldX(currentTile.x + ringX), getClampedWorldY(currentTile.y + ringY));

        if (!ringTile) {
          continue;
        }

        if (ringTile.biome === "ocean") {
          secondRingWaterNeighbors++;
        } else {
          secondRingLandNeighbors++;
        }
      }
    }

    currentTile.coastlineNoise = coastlineNoise;

    if (currentTile.biome === "ocean") {
      currentTile.shallowWater = clamp(
        landNeighbors / 8 * 0.72 +
          secondRingLandNeighbors / 16 * 0.22 +
          Math.max(0, coastlineNoise - 0.38) * 0.18,
        0,
        1
      );
      currentTile.shelfStrength = clamp(
        currentTile.shallowWater * 0.82 +
          Math.max(0, Number(currentTile.seaLevelDelta) || 0) * 0.16,
        0,
        1
      );
      currentTile.coastFactor = currentTile.shallowWater;
    } else {
      currentTile.coastFactor = clamp(
        waterNeighbors / 8 * 0.72 +
          secondRingWaterNeighbors / 16 * 0.22 +
          Math.max(0, coastlineNoise - 0.42) * 0.16,
        0,
        1
      );
      currentTile.shelfStrength = clamp(currentTile.coastFactor * 0.68 + Math.max(0, 0.12 - (Number(currentTile.seaLevelDelta) || 0)) * 0.25, 0, 1);
    }
  }

  for (var landIndex = 0; landIndex < landTiles.length; landIndex++) {
    var landTile = landTiles[landIndex];
    var rainfall = clamp(Number(landTile.moisture) || 0, 0.08, 2.2);

    landTile.waterFlow = Math.max(0, rainfall * Math.max(1, Number(landTile.areaKm2) || 1));
  }

  landTiles.sort(function(a, b) {
    return (Number(b.elevation) || 0) - (Number(a.elevation) || 0);
  });

  for (var flowIndex = 0; flowIndex < landTiles.length; flowIndex++) {
    var sourceTile = landTiles[flowIndex];
    var sourceNeighbors = getTerrainNeighborTiles(sourceTile);
    var lowestNeighbor = null;
    var lowestOffset = { dx: 0, dy: 0 };
    var sourceElevation = Number(sourceTile.elevation) || 0;

    for (var sourceNeighborIndex = 0; sourceNeighborIndex < sourceNeighbors.length; sourceNeighborIndex++) {
      var candidate = sourceNeighbors[sourceNeighborIndex].tile;

      if (!candidate) {
        continue;
      }

      if (!lowestNeighbor || (Number(candidate.elevation) || 0) < (Number(lowestNeighbor.elevation) || 0)) {
        lowestNeighbor = candidate;
        lowestOffset = {
          dx: sourceNeighbors[sourceNeighborIndex].dx,
          dy: sourceNeighbors[sourceNeighborIndex].dy
        };
      }
    }

    if (lowestNeighbor && (lowestNeighbor.biome === "ocean" || (Number(lowestNeighbor.elevation) || 0) < sourceElevation)) {
      sourceTile.flowDirectionX = lowestOffset.dx;
      sourceTile.flowDirectionY = lowestOffset.dy;

      if (lowestNeighbor.biome === "ocean") {
        sourceTile.riverMouth = 1;
        lowestNeighbor.riverMouth = Math.max(Number(lowestNeighbor.riverMouth) || 0, 0.65);
        lowestNeighbor.shallowWater = Math.max(Number(lowestNeighbor.shallowWater) || 0, 0.72);
      } else {
        lowestNeighbor.waterFlow += sourceTile.waterFlow;
      }
    }
  }

  var riverThreshold = Math.max(1, totalLandAreaKm2 * 0.00008);

  for (var riverIndex = 0; riverIndex < landTiles.length; riverIndex++) {
    var riverTile = landTiles[riverIndex];

    riverTile.riverStrength = clamp((riverTile.waterFlow / riverThreshold - 1) / 6, 0, 1);
    riverTile.riverMouth = Math.max(
      Number(riverTile.riverMouth) || 0,
      riverTile.coastFactor > 0 ? riverTile.riverStrength * riverTile.coastFactor : 0
    );
  }
}

function annotatePlanetTerrainRelief() {
  if (!Array.isArray(world.planetTiles) || world.planetTiles.length === 0) {
    return;
  }

  var lightX = -0.46;
  var lightY = 0.54;
  var lightZ = 0.70;
  var lightLength = Math.sqrt(lightX * lightX + lightY * lightY + lightZ * lightZ) || 1;

  for (var i = 0; i < world.planetTiles.length; i++) {
    var tile = world.planetTiles[i];

    if (!tile) {
      continue;
    }

    var west = getPlanetTile(getWrappedWorldX(tile.x - 1), tile.y);
    var east = getPlanetTile(getWrappedWorldX(tile.x + 1), tile.y);
    var north = getPlanetTile(tile.x, getClampedWorldY(tile.y - 1));
    var south = getPlanetTile(tile.x, getClampedWorldY(tile.y + 1));
    var dzdx = ((east ? Number(east.elevation) || 0 : 0) - (west ? Number(west.elevation) || 0 : 0)) / 2;
    var dzdy = ((north ? Number(north.elevation) || 0 : 0) - (south ? Number(south.elevation) || 0 : 0)) / 2;
    var slopeMagnitude = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
    var normalX = -dzdx;
    var normalY = -dzdy;
    var normalZ = 1.2;
    var normalLength = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ) || 1;
    var dot =
      (normalX / normalLength) * (lightX / lightLength) +
      (normalY / normalLength) * (lightY / lightLength) +
      (normalZ / normalLength) * (lightZ / lightLength);

    tile.terrainSlope = clamp(slopeMagnitude / 1.8, 0, 1);
    tile.terrainAspect = normalizeLongitude(Math.atan2(dzdy, dzdx) * 180 / Math.PI);
    tile.terrainHillshade = clamp(0.26 + Math.max(0, dot) * 0.74, 0, 1);
  }
}

function smoothTerrainNoiseAmount(amount) {
  var t = clamp(Number(amount) || 0, 0, 1);

  return t * t * (3 - 2 * t);
}

function getWrappedTerrainNoiseCellX(cellX, columnCount) {
  var normalizedColumnCount = Math.max(1, Math.round(Number(columnCount) || 1));

  return ((Math.round(Number(cellX) || 0) % normalizedColumnCount) + normalizedColumnCount) % normalizedColumnCount;
}

var terrainNoiseCache = {};

function getTerrainNoise2D(seedOffset) {
  var key = String(Math.round(Number(seedOffset) || 0));

  if (!terrainNoiseCache[key]) {
    terrainNoiseCache[key] = PS.core.createNoise2D("terrain:" + key);
  }

  return terrainNoiseCache[key];
}

function getTerrainValueNoise(x, y, scale, seedOffset) {
  var normalizedScale = Math.max(1, Number(scale) || 1);
  var columnCount = Math.max(1, Math.ceil(WORLD_WIDTH / normalizedScale));
  var rowCount = Math.max(1, Math.ceil(WORLD_HEIGHT / normalizedScale));
  var xCell = (Number(x) || 0) / normalizedScale;
  var yCell = (Number(y) || 0) / normalizedScale;
  var x0 = Math.floor(xCell);
  var y0 = Math.floor(yCell);
  var x1 = x0 + 1;
  var y1 = y0 + 1;
  var xAmount = smoothTerrainNoiseAmount(xCell - x0);
  var yAmount = smoothTerrainNoiseAmount(yCell - y0);
  var seed = Math.round(Number(seedOffset) || 0);
  var noise = getTerrainNoise2D(seed);
  var topLeft = noise.unitHash(getWrappedTerrainNoiseCellX(x0, columnCount), clamp(y0, 0, rowCount - 1), seed);
  var topRight = noise.unitHash(getWrappedTerrainNoiseCellX(x1, columnCount), clamp(y0, 0, rowCount - 1), seed);
  var bottomLeft = noise.unitHash(getWrappedTerrainNoiseCellX(x0, columnCount), clamp(y1, 0, rowCount - 1), seed);
  var bottomRight = noise.unitHash(getWrappedTerrainNoiseCellX(x1, columnCount), clamp(y1, 0, rowCount - 1), seed);
  var top = topLeft + (topRight - topLeft) * xAmount;
  var bottom = bottomLeft + (bottomRight - bottomLeft) * xAmount;

  return top + (bottom - top) * yAmount;
}

function getTerrainFractalNoise(x, y, scale, seedOffset, octaves, persistence) {
  var normalizedOctaves = Math.max(1, Math.round(Number(octaves) || 1));
  var normalizedPersistence = clamp(Number(persistence) || 0.5, 0.1, 0.9);
  var value = 0;
  var amplitude = 1;
  var amplitudeTotal = 0;
  var currentScale = Math.max(1, Number(scale) || 1);

  for (var octave = 0; octave < normalizedOctaves; octave++) {
    value += getTerrainValueNoise(x, y, currentScale, seedOffset + octave * 101) * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= normalizedPersistence;
    currentScale = Math.max(1, currentScale * 0.52);
  }

  return amplitudeTotal > 0 ? value / amplitudeTotal : 0.5;
}
