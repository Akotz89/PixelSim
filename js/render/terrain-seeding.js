import { CONFIG } from "../../config.js";
import { clamp, hashSeedText, randomInt } from "../core/utils.js";
import { getPlanetTileAreaKm2, makePlanetTile, refreshPlanetSummary } from "./planet-grid.js";
import { getDeterministicUnitNoise, resetPlanetGroundFeatureBlockCache } from "./planet-surface.js";
import { getPlanetLatitudeForTile, resetPlanetSurfaceChunkCache } from "./planet-view.js";
import { annotatePlanetHydrology, annotatePlanetTerrainRelief, getTerrainFractalNoise, isFertile } from "./terrain-hydrology.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

export function getTerrainRidgedNoise(x, y, scale, seedOffset) {
  var base = getTerrainFractalNoise(x, y, scale, seedOffset, 4, 0.54);
  var ridge = 1 - Math.abs(base * 2 - 1);

  return clamp(ridge * ridge * 1.35, 0, 1);
}

export function getTerrainWrappedTileDeltaX(x, centerX) {
  var width = Math.max(1, WORLD_WIDTH);
  var delta = Math.abs((Number(x) || 0) - (Number(centerX) || 0));

  return Math.min(delta, width - delta);
}

export function getTerrainContinentPlateInfluence(x, y, seedOffset) {
  var influence = 0;
  var plateCount = 8;
  var normalizedX = Number(x) || 0;
  var normalizedY = Number(y) || 0;

  for (var plateIndex = 0; plateIndex < plateCount; plateIndex++) {
    var centerX = getDeterministicUnitNoise(plateIndex, 11, seedOffset + 701) * WORLD_WIDTH;
    var centerY = (0.14 + getDeterministicUnitNoise(plateIndex, 23, seedOffset + 709) * 0.72) * WORLD_HEIGHT;
    var radiusX = (0.09 + getDeterministicUnitNoise(plateIndex, 37, seedOffset + 719) * 0.14) * WORLD_WIDTH;
    var radiusY = (0.11 + getDeterministicUnitNoise(plateIndex, 41, seedOffset + 727) * 0.18) * WORLD_HEIGHT;
    var weight = 0.70 + getDeterministicUnitNoise(plateIndex, 53, seedOffset + 733) * 0.42;
    var dx = getTerrainWrappedTileDeltaX(normalizedX, centerX) / Math.max(1, radiusX);
    var dy = (normalizedY - centerY) / Math.max(1, radiusY);
    var distance = Math.sqrt(dx * dx + dy * dy);
    var plate = clamp(1 - Math.pow(distance, 1.55), 0, 1) * weight;

    influence = Math.max(influence, plate);
  }

  return clamp(influence, 0, 1);
}

export function seedTerrain() {
  if (typeof resetPlanetSurfaceChunkCache === "function") {
    resetPlanetSurfaceChunkCache();
  }

  if (typeof resetLocalSurfaceRenderChunkCache === "function") {
    resetLocalSurfaceRenderChunkCache();
  }

  if (typeof resetPlanetGroundFeatureBlockCache === "function") {
    resetPlanetGroundFeatureBlockCache();
  }

  world.terrain = [];
  world.planetTiles = [];
  world.fertileTiles = 0;

  const tileSeeds = [];
  const targetWaterRatio = clamp((Number(CONFIG.PLANET_TARGET_WATER_PERCENT) || 71) / 100, 0.05, 0.95);
  const targetFertileLandRatio = clamp((Number(CONFIG.PLANET_TARGET_FERTILE_LAND_PERCENT) || 42) / 100, 0.05, 0.95);
  const seedOffset = typeof hashSeedText === "function" ? hashSeedText(world.seedText || "") % 100000 : 0;
  let totalPlanetAreaKm2 = 0;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const latitude = getPlanetLatitudeForTile(y);
      const areaKm2 = getPlanetTileAreaKm2(latitude);
      const absLatitude = Math.abs(latitude);
      const tropicalBand = Math.max(0, 1 - absLatitude / 58);
      const stormBand = Math.max(0, 1 - Math.abs(absLatitude - 52) / 26);
      const subtropicalDryBand = Math.max(0, 1 - Math.abs(absLatitude - 28) / 18);
      const polarBand = clamp((absLatitude - 62) / 28, 0, 1);
      const continental = getTerrainFractalNoise(x, y, 74, seedOffset + 1201, 5, 0.58);
      const plateInfluence = getTerrainContinentPlateInfluence(x, y, seedOffset + 7301);
      const shelf = getTerrainFractalNoise(x, y, 38, seedOffset + 2203, 4, 0.55);
      const basin = getTerrainFractalNoise(x, y, 17, seedOffset + 3209, 3, 0.50);
      const ridge = getTerrainRidgedNoise(x, y, 33, seedOffset + 4211);
      const roughness = getTerrainFractalNoise(x, y, 8, seedOffset + 5227, 3, 0.48);
      const islandArc = Math.pow(getTerrainRidgedNoise(x, y, 18, seedOffset + 7247), 1.8) *
        getTerrainFractalNoise(x, y, 26, seedOffset + 7253, 3, 0.52) *
        clamp(1 - plateInfluence * 0.72, 0, 1);
      const continentShape = clamp(
        plateInfluence * 0.72 +
          continental * 0.24 +
          islandArc * 0.22 +
          (shelf - 0.5) * 0.10,
        0,
        1.15
      );
      const highlandLift = Math.pow(ridge, 2.25) * clamp(0.34 + continentShape * 0.86, 0, 1.15);
      const elevation =
        (continentShape - 0.5) * 2.72 +
        (shelf - 0.5) * 0.78 +
        (basin - 0.5) * 0.32 +
        (roughness - 0.5) * 0.16 +
        highlandLift * 1.18 -
        polarBand * 0.10;
      const moistureNoise = getTerrainFractalNoise(x, y, 46, seedOffset + 6233, 4, 0.56);
      const rainShadow = clamp(ridge * 0.42 + highlandLift * 0.30, 0, 0.58);
      const moisture = clamp(
        tropicalBand * 0.88 +
          stormBand * 0.46 +
          moistureNoise * 0.70 -
          subtropicalDryBand * 0.44 -
          rainShadow +
          0.12,
        0,
        2.2
      );
      const fertilityScore = moisture + elevation * 0.23 - polarBand * 1.55 - highlandLift * 0.18;
      const tileSeed = {
        x,
        y,
        latitude,
        absLatitude,
        polarBand,
        moisture,
        fertilityScore,
        elevation,
        continentShape,
        plateInfluence,
        islandArc,
        ridge,
        roughness,
        highlandLift,
        areaKm2
      };

      tileSeeds.push(tileSeed);
      totalPlanetAreaKm2 += areaKm2;
    }
  }

  const sortedTileSeeds = tileSeeds.slice().sort(function(a, b) {
    return a.elevation - b.elevation;
  });
  const targetWaterAreaKm2 = totalPlanetAreaKm2 * targetWaterRatio;
  let cumulativeWaterAreaKm2 = 0;
  let waterThreshold = sortedTileSeeds.length > 0 ? sortedTileSeeds[0].elevation : 0;

  for (let i = 0; i < sortedTileSeeds.length; i++) {
    cumulativeWaterAreaKm2 += sortedTileSeeds[i].areaKm2;
    waterThreshold = sortedTileSeeds[i].elevation;

    if (cumulativeWaterAreaKm2 >= targetWaterAreaKm2) {
      break;
    }
  }

  const candidateLandSeeds = [];
  let totalLandAreaKm2 = 0;

  for (let i = 0; i < tileSeeds.length; i++) {
    const tileSeed = tileSeeds[i];

    if (tileSeed.elevation > waterThreshold) {
      totalLandAreaKm2 += tileSeed.areaKm2;

      if (tileSeed.polarBand <= 0.55) {
        candidateLandSeeds.push(tileSeed);
      }
    }
  }

  const sortedFertileSeeds = candidateLandSeeds.slice().sort(function(a, b) {
    return b.fertilityScore - a.fertilityScore;
  });
  const targetFertileAreaKm2 = totalLandAreaKm2 * targetFertileLandRatio;
  let cumulativeFertileAreaKm2 = 0;
  let fertileThreshold = sortedFertileSeeds.length > 0
    ? sortedFertileSeeds[sortedFertileSeeds.length - 1].fertilityScore
    : CONFIG.TERRAIN_FERTILITY_CUTOFF;

  for (let i = 0; i < sortedFertileSeeds.length; i++) {
    cumulativeFertileAreaKm2 += sortedFertileSeeds[i].areaKm2;
    fertileThreshold = sortedFertileSeeds[i].fertilityScore;

    if (cumulativeFertileAreaKm2 >= targetFertileAreaKm2) {
      break;
    }
  }

  for (let i = 0; i < tileSeeds.length; i++) {
    const tileSeed = tileSeeds[i];
    const isWater = tileSeed.elevation <= waterThreshold;
    const isFrozen = !isWater && tileSeed.polarBand > 0.55;
    const isFertileLand = !isWater && !isFrozen && tileSeed.fertilityScore >= fertileThreshold;
    let biome = "ocean";

    if (isFrozen) {
      biome = "ice";
    } else if (isFertileLand && tileSeed.fertilityScore > fertileThreshold + 0.25) {
      biome = "forest";
    } else if (isFertileLand) {
      biome = "grassland";
    } else if (!isWater && tileSeed.absLatitude < 34 && tileSeed.moisture < 0.55) {
      biome = "desert";
    } else if (!isWater) {
      biome = "tundra";
    }

    const terrain = biome === "forest" || biome === "grassland"
      ? CONFIG.TERRAIN_FERTILE
      : CONFIG.TERRAIN_BARREN;

    world.terrain.push(terrain);

    const planetTile = makePlanetTile(
      tileSeed.x,
      tileSeed.y,
      biome,
      tileSeed.fertilityScore,
      tileSeed.moisture,
      tileSeed.elevation
    );

    planetTile.ridgeStrength = tileSeed.ridge;
    planetTile.roughness = tileSeed.roughness;
    planetTile.highlandLift = tileSeed.highlandLift;
    planetTile.continentShape = tileSeed.continentShape;
    planetTile.plateInfluence = tileSeed.plateInfluence;
    planetTile.islandArc = tileSeed.islandArc;
    planetTile.seaLevelDelta = tileSeed.elevation - waterThreshold;
    world.planetTiles.push(planetTile);

    if (terrain === CONFIG.TERRAIN_FERTILE) {
      world.fertileTiles++;
    }
  }

  annotatePlanetHydrology();
  annotatePlanetTerrainRelief();
  refreshPlanetSummary();
}

export function randomFertilePosition() {
  for (let i = 0; i < 200; i++) {
    const x = randomInt(WORLD_WIDTH);
    const y = randomInt(WORLD_HEIGHT);

    if (isFertile(x, y)) {
      return { x, y };
    }
  }

  return {
    x: randomInt(WORLD_WIDTH),
    y: randomInt(WORLD_HEIGHT)
  };
}
