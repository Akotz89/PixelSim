import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp, getTileIndex } from "../core/utils.js";
import { getClampedWorldY, getPlanetTile, getWrappedWorldX } from "../render/planet-grid.js";
import { getPlanetLatitudeForTile, getPlanetLongitudeForTile } from "../render/planet-view.js";
import { isFertile } from "../render/terrain-hydrology.js";
import { ensureOrganismTraits } from "./organisms-traits.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

PS.sim = PS.sim || {};

export var TERRAIN_PRESSURE_TRAITS = [
  "terrainAffinity",
  "waterDependency",
  "thermalTolerance",
  "camouflage",
  "movementTendency",
  "reproductionEnergy",
  "carnivory"
];
export var TERRAIN_PRESSURE_EVENT_INTERVAL = 240;
export var terrainPressureSampleCache = {
  signature: "",
  samples: {}
};

export function getTerrainPressureCacheSignature() {
  var atmosphere = world && world.atmosphere ? world.atmosphere : {};
  var geology = world && world.geology ? world.geology : {};

  return [
    Math.max(0, Math.round(Number(world && world.tick) || 0)),
    Array.isArray(world && world.planetTiles) ? world.planetTiles.length : 0,
    Math.round(Number(world && world.fertileTiles) || 0),
    Math.round((Number(atmosphere.temperatureC) || 0) * 10),
    Math.round(Number(geology.ageTicks) || 0)
  ].join(":");
}

export function getTerrainPressureTileCacheKey(tileX, tileY, tile) {
  return [
    tileX,
    tileY,
    String(tile && tile.biome || ""),
    Math.round((Number(tile && tile.elevation) || 0) * 1000),
    Math.round((Number(tile && tile.coastFactor) || 0) * 1000),
    Math.round((Number(tile && tile.shallowWater) || 0) * 1000),
    Math.round((Number(tile && tile.shelfStrength) || 0) * 1000),
    Math.round((Number(tile && tile.riverStrength) || 0) * 1000),
    Math.round((Number(tile && tile.waterFlow) || 0) * 1000),
    Math.round((Number(tile && tile.slope) || 0) * 1000),
    Math.round((Number(tile && tile.volcanicActivity) || 0) * 1000),
    Math.round((Number(tile && tile.tectonicStress) || 0) * 1000),
    Math.round((Number(tile && tile.latitude) || 0) * 1000),
    Number(tile && tile.plateId) || -1
  ].join(":");
}

export function getCachedTerrainPressureSample(cacheKey) {
  var signature = getTerrainPressureCacheSignature();

  if (terrainPressureSampleCache.signature !== signature) {
    terrainPressureSampleCache.signature = signature;
    terrainPressureSampleCache.samples = {};
  }

  return terrainPressureSampleCache.samples[cacheKey] || null;
}

export function setCachedTerrainPressureSample(cacheKey, sample) {
  terrainPressureSampleCache.samples[cacheKey] = sample;
  return sample;
}

export function getTerrainPressureTile(x, y) {
  if (typeof getPlanetTile === "function") {
    return getPlanetTile(x, y) || null;
  }

  if (world && Array.isArray(world.planetTiles) && typeof getTileIndex === "function") {
    return world.planetTiles[getTileIndex(x, y)] || null;
  }

  return null;
}

export function getTerrainPressureBiome(tile, x, y) {
  var biome = String(tile && tile.biome || "").toLowerCase();

  if (!biome && typeof isFertile === "function") {
    biome = isFertile(x, y) ? "temperate" : "barren";
  }

  return biome;
}

export function getTerrainPressureElevation(tile) {
  return clamp(Number(tile && tile.elevation) || 0, 0, 1);
}

export function getTerrainPressureLatitude(tile, y) {
  if (tile && Number.isFinite(Number(tile.latitude))) {
    return Number(tile.latitude);
  }

  return typeof getPlanetLatitudeForTile === "function" ? getPlanetLatitudeForTile(y) : 0;
}

export function getTerrainPressureRegionId(driver, x, y, tile) {
  var bandX = Math.floor(getWrappedWorldX(x) / Math.max(1, Math.ceil(WORLD_WIDTH / 12)));
  var bandY = Math.floor(getClampedWorldY(y) / Math.max(1, Math.ceil(WORLD_HEIGHT / 8)));
  var plateId = tile && Number.isFinite(Number(tile.plateId)) ? Number(tile.plateId) : -1;

  return [
    "tp",
    driver,
    plateId >= 0 ? "p" + plateId : "p-",
    "x" + bandX,
    "y" + bandY
  ].join(".");
}

export function hasTerrainPressureBiome(biome, names) {
  for (var i = 0; i < names.length; i++) {
    if (biome.indexOf(names[i]) >= 0) {
      return true;
    }
  }

  return false;
}

/**
 * @description Aggregates terrain, biome, hydrology, settlement, and hazard signals into a cached pressure sample for organism and population decisions.
 * @param {number} x World tile x coordinate to wrap into the planet grid.
 * @param {number} y World tile y coordinate to clamp into the planet grid.
 * @returns {Object} Terrain pressure sample with movement, fertility, hazard, and affinity signals.
 */
export function getTerrainPressureSample(x, y) {
  var tileX = typeof getWrappedWorldX === "function" ? getWrappedWorldX(x) : x;
  var tileY = typeof getClampedWorldY === "function" ? getClampedWorldY(y) : y;
  var tile = getTerrainPressureTile(tileX, tileY);
  var cacheKey = getTerrainPressureTileCacheKey(tileX, tileY, tile);
  var cached = getCachedTerrainPressureSample(cacheKey);

  if (cached) {
    return cached;
  }

  var biome = getTerrainPressureBiome(tile, tileX, tileY);
  var elevation = getTerrainPressureElevation(tile);
  var latitude = getTerrainPressureLatitude(tile, tileY);
  var coast = clamp(Number(tile && tile.coastFactor) || 0, 0, 1);
  var river = clamp(Math.max(Number(tile && tile.riverStrength) || 0, Number(tile && tile.waterFlow) || 0), 0, 1);
  var shallowWater = clamp(Number(tile && tile.shallowWater) || 0, 0, 1);
  var shelf = clamp(Number(tile && tile.shelfStrength) || 0, 0, 1);
  var slope = clamp(Number(tile && tile.slope) || 0, 0, 1);
  var volcanic = clamp(Number(tile && tile.volcanicActivity) || 0, 0, 1);
  var tectonic = clamp(Number(tile && tile.tectonicStress) || 0, 0, 1);
  var polarCold = clamp((Math.abs(latitude) - 52) / 38, 0, 1);
  var aquatic = hasTerrainPressureBiome(biome, ["ocean", "sea", "lake", "reef", "water"]) || shallowWater > 0.62 || shelf > 0.72;
  var desert = hasTerrainPressureBiome(biome, ["desert", "dune", "arid"]);
  var mountain = hasTerrainPressureBiome(biome, ["mountain", "alpine", "highland"]) || elevation > 0.72 || slope > 0.55;
  var forest = hasTerrainPressureBiome(biome, ["forest", "jungle", "rainforest", "wood"]);
  var ice = hasTerrainPressureBiome(biome, ["ice", "tundra", "polar", "glacier"]) || polarCold > 0.65;
  var lush = hasTerrainPressureBiome(biome, ["grass", "forest", "jungle", "wetland", "temperate", "savanna"]) || (coast + river > 0.5 && elevation < 0.68);
  var coastal = !aquatic && (coast > 0.32 || river > 0.42 || shallowWater > 0.18);
  var difficult = clamp(
    (desert ? 0.34 : 0) +
    (mountain ? 0.28 : 0) +
    (ice ? 0.25 : 0) +
    volcanic * 0.24 +
    tectonic * 0.14 +
    slope * 0.12,
    0,
    1
  );
  var driver = "open";
  var driverScore = 0;

  function choose(candidate, score) {
    if (score > driverScore) {
      driver = candidate;
      driverScore = score;
    }
  }

  choose("aquatic", aquatic ? 0.92 + shallowWater * 0.08 : 0);
  choose("coastal", coastal ? 0.62 + Math.max(coast, river, shallowWater) * 0.24 : 0);
  choose("desert", desert ? 0.9 + difficult * 0.08 : 0);
  choose("mountain", mountain ? 0.86 + Math.max(elevation, slope) * 0.1 : 0);
  choose("forest", forest ? 0.8 + (lush ? 0.08 : 0) : 0);
  choose("ice", ice ? 0.72 + polarCold * 0.16 : 0);
  choose("high-difficulty", difficult > 0.55 ? 0.55 + difficult * 0.28 : 0);
  choose("lush", lush ? 0.5 + Math.max(coast, river) * 0.18 : 0);

  if (driver === "open" && biome === "barren") {
    choose("high-difficulty", 0.5);
  }

  var heatTarget = desert ? 0.9 : (ice || mountain ? 0.18 : 0.52);
  var target = {
    terrainAffinity: aquatic ? 0.1 : (coastal ? 0.32 : (mountain ? 0.72 : (lush ? 0.88 : 0.54))),
    waterDependency: aquatic ? 0.9 : (coastal || forest ? 0.65 : (desert ? 0.16 : 0.42)),
    thermalTolerance: heatTarget,
    camouflage: forest ? 0.86 : (desert || mountain ? 0.62 : 0.44),
    movementTendency: difficult > 0.55 ? 0.7 : (lush ? 0.34 : 0.5),
    reproductionEnergy: difficult > 0.55 ? 0.38 : (lush ? -0.18 : 0.08),
    carnivory: difficult > 0.55 ? 0.58 : (lush ? 0.3 : 0.42)
  };
  var affectedTraits = ["terrainAffinity"];

  if (aquatic || coastal || desert || forest) {
    affectedTraits.push("waterDependency");
  }
  if (desert || mountain || ice) {
    affectedTraits.push("thermalTolerance");
  }
  if (forest || desert || mountain) {
    affectedTraits.push("camouflage");
  }
  if (difficult > 0.45) {
    affectedTraits.push("movementTendency", "reproductionEnergy", "carnivory");
  }

  return setCachedTerrainPressureSample(cacheKey, {
    x: tileX,
    y: tileY,
    biome: biome || "unknown",
    terrainDriver: driver,
    regionId: getTerrainPressureRegionId(driver, tileX, tileY, tile),
    pressure: clamp(0.28 + driverScore * 0.52 + difficult * 0.2, 0, 1),
    innovationPressure: clamp(difficult * 0.74 + (lush ? -0.22 : 0.12) + (aquatic || coastal ? 0.18 : 0), 0, 1),
    isolation: clamp((aquatic ? 0.42 : 0) + (coastal ? 0.2 : 0) + (mountain ? 0.28 : 0) + (ice ? 0.18 : 0) + coast * 0.22 + slope * 0.18, 0, 1),
    target: target,
    affectedTraits: affectedTraits,
    effects: {
      survivalCost: clamp(0.15 + difficult * 0.5 + (lush ? -0.1 : 0), 0, 1),
      reproductionMultiplier: clamp(1 - target.reproductionEnergy, 0.65, 1.55),
      migrationPressure: clamp(target.movementTendency * 0.72 + (coastal ? 0.12 : 0), 0, 1)
    },
    location: {
      x: tileX,
      y: tileY,
      latitude: latitude,
      longitude: typeof getPlanetLongitudeForTile === "function" ? getPlanetLongitudeForTile(tileX) : 0
    }
  });
}

export function getTerrainPressureMismatchForTraits(traits, x, y) {
  var baseSample = getTerrainPressureSample(x, y);
  var sample = Object.assign({}, baseSample, {
    target: baseSample.target,
    affectedTraits: baseSample.affectedTraits,
    effects: baseSample.effects,
    location: baseSample.location
  });
  var traitCount = 0;
  var mismatch = 0;

  for (var i = 0; i < TERRAIN_PRESSURE_TRAITS.length; i++) {
    var key = TERRAIN_PRESSURE_TRAITS[i];
    var target = Number(sample.target[key]);

    if (!Number.isFinite(target)) {
      continue;
    }

    if (key === "reproductionEnergy") {
      continue;
    }

    var value = Number(traits && traits[key]);

    if (!Number.isFinite(value)) {
      continue;
    }

    mismatch += Math.abs(value - target);
    traitCount++;
  }

  sample.mismatch = traitCount > 0 ? clamp(mismatch / traitCount, 0, 1) : 0;
  return sample;
}

export function getTerrainPressureEnergyCost(traits, x, y) {
  var sample = getTerrainPressureMismatchForTraits(traits, x, y);

  return sample.mismatch * sample.pressure * CONFIG.TERRAIN_MISMATCH_MAX_ENERGY_COST;
}

export function getTerrainPressureReproductionMultiplier(traits, x, y) {
  var sample = getTerrainPressureMismatchForTraits(traits, x, y);
  var mismatchPenalty = sample.mismatch * sample.pressure * 0.9;
  var terrainMultiplier = sample.effects.reproductionMultiplier;

  return clamp(terrainMultiplier + mismatchPenalty, 0.65, 1.9);
}

export function summarizeTerrainPressureForPopulation(organisms, traitsList) {
  var driverCounts = {};
  var traitCounts = {};
  var totalPressure = 0;
  var totalMismatch = 0;
  var totalIsolation = 0;
  var topDriver = "none";
  var topDriverCount = 0;
  var sample = null;

  for (var i = 0; i < organisms.length; i++) {
    var traits = traitsList && traitsList[i] ? traitsList[i] : ensureOrganismTraits(organisms[i]);
    var organismSample = getTerrainPressureMismatchForTraits(traits, organisms[i].x, organisms[i].y);
    var driver = organismSample.terrainDriver;

    driverCounts[driver] = (driverCounts[driver] || 0) + 1;
    if (driverCounts[driver] > topDriverCount) {
      topDriver = driver;
      topDriverCount = driverCounts[driver];
      sample = organismSample;
    }

    for (var traitIndex = 0; traitIndex < organismSample.affectedTraits.length; traitIndex++) {
      var trait = organismSample.affectedTraits[traitIndex];
      traitCounts[trait] = (traitCounts[trait] || 0) + 1;
    }

    totalPressure += organismSample.pressure;
    totalMismatch += organismSample.mismatch;
    totalIsolation += organismSample.isolation;
  }

  var dominantTrait = "terrainAffinity";
  var dominantTraitCount = 0;
  var traitKeys = Object.keys(traitCounts);

  for (var keyIndex = 0; keyIndex < traitKeys.length; keyIndex++) {
    var key = traitKeys[keyIndex];
    if (traitCounts[key] > dominantTraitCount) {
      dominantTrait = key;
      dominantTraitCount = traitCounts[key];
    }
  }

  return {
    terrainDriver: topDriver,
    regionId: sample ? sample.regionId : "none",
    dominantTrait: dominantTrait,
    affectedTraits: traitKeys,
    pressure: organisms.length > 0 ? totalPressure / organisms.length : 0,
    mismatch: organisms.length > 0 ? totalMismatch / organisms.length : 0,
    isolation: organisms.length > 0 ? totalIsolation / organisms.length : 0,
    innovationPressure: sample ? sample.innovationPressure : 0,
    location: sample ? sample.location : null,
    driverCounts: driverCounts
  };
}

export function refreshTerrainPressureSummary(populations) {
  var active = Array.isArray(populations) ? populations : [];
  var summary = {
    populationCount: 0,
    pressure: 0,
    mismatch: 0,
    isolation: 0,
    topDriver: "none",
    topTrait: "terrainAffinity",
    topRegionId: "none",
    topLineageId: 0,
    topSpeciesId: 0,
    topPopulationId: 0,
    highPressurePopulations: 0,
    drivers: {}
  };
  var pressureSum = 0;
  var mismatchSum = 0;
  var isolationSum = 0;
  var topPressure = -1;
  var traitCounts = {};

  for (var i = 0; i < active.length; i++) {
    var population = active[i];
    var terrain = population && population.terrainPressure;

    if (!terrain || !population.isActive) {
      continue;
    }

    summary.populationCount++;
    pressureSum += terrain.pressure;
    mismatchSum += terrain.mismatch;
    isolationSum += terrain.isolation;
    summary.drivers[terrain.terrainDriver] = (summary.drivers[terrain.terrainDriver] || 0) + 1;

    if (terrain.pressure >= 0.6 || terrain.mismatch >= 0.35) {
      summary.highPressurePopulations++;
    }

    for (var traitIndex = 0; traitIndex < terrain.affectedTraits.length; traitIndex++) {
      var trait = terrain.affectedTraits[traitIndex];
      traitCounts[trait] = (traitCounts[trait] || 0) + 1;
    }

    if (terrain.pressure > topPressure) {
      topPressure = terrain.pressure;
      summary.topDriver = terrain.terrainDriver;
      summary.topTrait = terrain.dominantTrait;
      summary.topRegionId = terrain.regionId;
      summary.topLineageId = Math.max(0, Math.round(Number(population.lineageId) || 0));
      summary.topSpeciesId = Math.max(0, Math.round(Number(population.speciesId) || 0));
      summary.topPopulationId = Math.max(0, Math.round(Number(population.id) || 0));
      summary.location = terrain.location;
    }
  }

  var traits = Object.keys(traitCounts);
  for (var keyIndex = 0; keyIndex < traits.length; keyIndex++) {
    if (traitCounts[traits[keyIndex]] > (traitCounts[summary.topTrait] || 0)) {
      summary.topTrait = traits[keyIndex];
    }
  }

  summary.pressure = summary.populationCount > 0 ? pressureSum / summary.populationCount : 0;
  summary.mismatch = summary.populationCount > 0 ? mismatchSum / summary.populationCount : 0;
  summary.isolation = summary.populationCount > 0 ? isolationSum / summary.populationCount : 0;
  world.terrainPressureSummary = summary;
  return summary;
}

export function emitTerrainPressureMilestones(summary) {
  if (!summary || !PS.events || typeof PS.events.emitMilestone !== "function") {
    return null;
  }

  var tick = Math.max(0, Math.round(Number(world.tick) || 0));
  var interval = Math.max(1, Math.round(Number(TERRAIN_PRESSURE_EVENT_INTERVAL) || 1));

  if (summary.populationCount <= 0 || summary.pressure < 0.55 || tick % interval !== 0) {
    return null;
  }

  world.terrainPressureMilestones = world.terrainPressureMilestones || {};
  var key = [summary.topDriver, summary.topTrait, Math.floor(tick / interval)].join(":");

  if (world.terrainPressureMilestones[key]) {
    return null;
  }

  world.terrainPressureMilestones[key] = tick;
  return PS.events.emitMilestone({
    type: "biology.terrain-pressure",
    label: "Terrain pressure",
    detail: summary.topDriver + " pressure favors " + summary.topTrait,
    source: "biology",
    category: "biology",
    severity: summary.pressure >= 0.72 ? "major" : "info",
    location: summary.location,
    terrainDriver: summary.topDriver,
    trait: summary.topTrait,
    lineageId: summary.topLineageId,
    speciesId: summary.topSpeciesId,
    populationId: summary.topPopulationId,
    pressure: summary.pressure,
    effect: summary.mismatch >= 0.35 ? "survival-cost" : "adaptation-pressure",
    watcher: {
      eventLog: true,
      timeline: true,
      notification: false,
      spotlight: false,
      overlays: ["observation.selection"]
    }
  });
}

export const terrainPressure = {
  getSample: getTerrainPressureSample,
  getMismatchSample: getTerrainPressureMismatchForTraits,
  getEnergyCost: getTerrainPressureEnergyCost,
  getReproductionMultiplier: getTerrainPressureReproductionMultiplier,
  summarizePopulation: summarizeTerrainPressureForPopulation,
  refreshSummary: refreshTerrainPressureSummary,
  emitMilestones: emitTerrainPressureMilestones
};
