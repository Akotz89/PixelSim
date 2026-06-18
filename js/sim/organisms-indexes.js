import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getClampedBucketIndexes, getClampedWorldY, getTileManhattanDistance, getWrappedBucketIndexes, getWrappedWorldX } from "../render/planet-grid.js";
import { ensureLineageRegistry, ensureOrganismLineage, ensureOrganismTraits, registerLineage } from "./organisms-traits.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";
import { lineageSummaryText } from "../ui/dom-refs.js";

export function getLimbMovementMultiplierFromValue(limbCount) {
  return 0.5 + clamp(
    Number(limbCount) / Math.max(1, Number(CONFIG.TRAIT_LIMB_COUNT_MAX) || 1),
    0,
    1
  ) * 0.5;
}

export function getLimbMovementMultiplier(traits) {
  var limbCount = traits && Number.isFinite(Number(traits.limbCount))
    ? Number(traits.limbCount)
    : CONFIG.TRAIT_LIMB_COUNT_DEFAULT;

  return getLimbMovementMultiplierFromValue(limbCount);
}

export function getOrganismTravelKmPerTick(traits) {
  return Math.max(0, Number(CONFIG.ORGANISM_TRAVEL_KM_PER_DAY) || 0) *
    Math.max(0, Number(CONFIG.SIM_DAYS_PER_TICK) || 0) *
    (traits ? getLimbMovementMultiplier(traits) : 1);
}

export function getOrganismBucketSize() {
  return Math.max(1, Math.round(Number(CONFIG.ORGANISM_SPATIAL_BUCKET_SIZE) || 16));
}

export function getOrganismBucketKey(x, y) {
  var bucketSize = getOrganismBucketSize();
  return Math.floor(getWrappedWorldX(x) / bucketSize) + ":" + Math.floor(getClampedWorldY(y) / bucketSize);
}

export function ensureOrganismIndexState() {
  if (!world.organismBuckets) {
    world.organismBuckets = {};
  }

  if (!world.organismsByLineage) {
    world.organismsByLineage = {};
  }
}

export function registerOrganismInIndexes(organism) {
  ensureOrganismIndexState();

  var lineageId = ensureOrganismLineage(organism);
  var lineageKey = String(lineageId);
  var bucketKey = getOrganismBucketKey(organism.x, organism.y);

  if (!world.organismBuckets[bucketKey]) {
    world.organismBuckets[bucketKey] = [];
  }

  if (!world.organismsByLineage[lineageKey]) {
    world.organismsByLineage[lineageKey] = [];
  }

  world.organismBuckets[bucketKey].push(organism);
  world.organismsByLineage[lineageKey].push(organism);
}

export function rebuildOrganismIndexes() {
  world.organismBuckets = {};
  world.organismsByLineage = {};

  // Rebuild tile grid if available (AZR-491)
  if (PS.tileGrid && typeof PS.tileGrid.rebuildFromOrganisms === "function") {
    PS.tileGrid.rebuildFromOrganisms();
  }

  for (var i = 0; i < world.organisms.length; i++) {
    registerOrganismInIndexes(world.organisms[i]);
  }
}

export function ensureOrganismIndexes() {
  if (!world.organismBuckets || !world.organismsByLineage) {
    rebuildOrganismIndexes();
  }
}

export function getIndexedOrganismsForLineage(lineageId) {
  ensureOrganismIndexes();
  return world.organismsByLineage[String(lineageId)] || [];
}

export function collectOrganismsInRadius(x, y, radius, lineageId, limit) {
  // Use tile grid fast path when available (AZR-491)
  if (PS.tileGrid && PS.tileGrid.grid && typeof PS.tileGrid.collectInRadius === "function") {
    return PS.tileGrid.collectInRadius(x, y, radius, lineageId, limit);
  }

  // Fallback to bucket-based lookup
  ensureOrganismIndexes();

  var bucketSize = getOrganismBucketSize();
  var normalizedRadius = Math.max(0, Math.round(Number(radius) || 0));
  var normalizedLineageId = Math.max(0, Math.round(Number(lineageId) || 0));
  var normalizedLimit = Number.isFinite(Number(limit)) ? Math.max(0, Math.round(Number(limit))) : Infinity;
  var bucketXs = getWrappedBucketIndexes(x, normalizedRadius, bucketSize, WORLD_WIDTH);
  var bucketYs = getClampedBucketIndexes(y, normalizedRadius, bucketSize, WORLD_HEIGHT);
  var organisms = [];

  if (normalizedLimit <= 0) {
    return organisms;
  }

  for (var bucketYIndex = 0; bucketYIndex < bucketYs.length; bucketYIndex++) {
    for (var bucketXIndex = 0; bucketXIndex < bucketXs.length; bucketXIndex++) {
      var bucketY = bucketYs[bucketYIndex];
      var bucketX = bucketXs[bucketXIndex];
      var bucket = world.organismBuckets[bucketX + ":" + bucketY];

      if (!bucket) {
        continue;
      }

      for (var i = 0; i < bucket.length; i++) {
        var organism = bucket[i];

        if (
          (normalizedLineageId <= 0 || ensureOrganismLineage(organism) === normalizedLineageId) &&
          getTileManhattanDistance(x, y, organism.x, organism.y) <= normalizedRadius
        ) {
          organisms.push(organism);

          if (organisms.length >= normalizedLimit) {
            return organisms;
          }
        }
      }
    }
  }

  return organisms;
}

export function countOrganismsInRadiusForLineage(x, y, radius, lineageId) {
  // Use tile grid fast path when available (AZR-491)
  if (PS.tileGrid && PS.tileGrid.grid && typeof PS.tileGrid.countInRadius === "function") {
    return PS.tileGrid.countInRadius(x, y, radius, lineageId);
  }

  // Fallback to bucket-based lookup
  ensureOrganismIndexes();

  var bucketSize = getOrganismBucketSize();
  var normalizedRadius = Math.max(0, Math.round(Number(radius) || 0));
  var normalizedLineageId = Math.max(0, Math.round(Number(lineageId) || 0));
  var bucketXs = getWrappedBucketIndexes(x, normalizedRadius, bucketSize, WORLD_WIDTH);
  var bucketYs = getClampedBucketIndexes(y, normalizedRadius, bucketSize, WORLD_HEIGHT);
  var count = 0;

  for (var bucketYIndex = 0; bucketYIndex < bucketYs.length; bucketYIndex++) {
    for (var bucketXIndex = 0; bucketXIndex < bucketXs.length; bucketXIndex++) {
      var bucketY = bucketYs[bucketYIndex];
      var bucketX = bucketXs[bucketXIndex];
      var bucket = world.organismBuckets[bucketX + ":" + bucketY];

      if (!bucket) {
        continue;
      }

      for (var i = 0; i < bucket.length; i++) {
        var organism = bucket[i];

        if (
          (normalizedLineageId <= 0 || ensureOrganismLineage(organism) === normalizedLineageId) &&
          getTileManhattanDistance(x, y, organism.x, organism.y) <= normalizedRadius
        ) {
          count++;
        }
      }
    }
  }

  return count;
}

export function getNearestOrganismInRadius(x, y, radius) {
  // Use tile grid fast path when available (AZR-491)
  if (PS.tileGrid && PS.tileGrid.grid && typeof PS.tileGrid.nearestInRadius === "function") {
    return PS.tileGrid.nearestInRadius(x, y, radius);
  }

  // Fallback to bucket-based lookup
  ensureOrganismIndexes();

  var bucketSize = getOrganismBucketSize();
  var normalizedRadius = Math.max(0, Math.round(Number(radius) || 0));
  var bucketXs = getWrappedBucketIndexes(x, normalizedRadius, bucketSize, WORLD_WIDTH);
  var bucketYs = getClampedBucketIndexes(y, normalizedRadius, bucketSize, WORLD_HEIGHT);
  var nearestOrganism = null;
  var nearestDistance = Infinity;

  for (var bucketYIndex = 0; bucketYIndex < bucketYs.length; bucketYIndex++) {
    for (var bucketXIndex = 0; bucketXIndex < bucketXs.length; bucketXIndex++) {
      var bucketY = bucketYs[bucketYIndex];
      var bucketX = bucketXs[bucketXIndex];
      var bucket = world.organismBuckets[bucketX + ":" + bucketY];

      if (!bucket) {
        continue;
      }

      for (var i = 0; i < bucket.length; i++) {
        var organism = bucket[i];
        var distance = getTileManhattanDistance(x, y, organism.x, organism.y);

        if (distance < nearestDistance && distance <= normalizedRadius) {
          nearestOrganism = organism;
          nearestDistance = distance;
        }
      }
    }
  }

  return nearestOrganism;
}

export function updateLineageSummaryCache() {
  var lineages = [];
  var activeCount = 0;
  var extinctCount = 0;
  var newestLineage = null;
  var topLineages = [];
  var lineageRecords = world.lineages || {};

  for (var lineageKey in lineageRecords) {
    if (Object.prototype.hasOwnProperty.call(lineageRecords, lineageKey)) {
      lineages.push(lineageRecords[lineageKey]);
    }
  }

  if (lineages.length === 0) {
    world.lineageSummary = null;
    world.lineageSummaryText = "LINEAGES: -";
    return world.lineageSummaryText;
  }

  for (var i = 0; i < lineages.length; i++) {
    var lineage = lineages[i];

    if (lineage.activeCount > 0) {
      activeCount++;
      topLineages.push(lineage);
      topLineages.sort(function(a, b) {
        if (b.activeCount !== a.activeCount) {
          return b.activeCount - a.activeCount;
        }

        return a.id - b.id;
      });

      if (topLineages.length > 5) {
        topLineages.length = 5;
      }
    } else {
      extinctCount++;
    }

    if (
      !newestLineage ||
      lineage.createdTick > newestLineage.createdTick ||
      (lineage.createdTick === newestLineage.createdTick && lineage.id > newestLineage.id)
    ) {
      newestLineage = lineage;
    }
  }

  var visibleLineages = [];
  var visibleLineageSummaries = [];

  for (var topIndex = 0; topIndex < Math.min(5, topLineages.length); topIndex++) {
    visibleLineages.push(
      "L" + topLineages[topIndex].id +
      " " + topLineages[topIndex].activeCount +
      " peak " + topLineages[topIndex].peakPopulation
    );
    visibleLineageSummaries.push({
      id: topLineages[topIndex].id,
      activeCount: topLineages[topIndex].activeCount,
      peakPopulation: topLineages[topIndex].peakPopulation
    });
  }

  var newestText = "newest L" + newestLineage.id + " founder";

  if (newestLineage.parentId > 0) {
    newestText = "newest L" + newestLineage.id + " parent L" + newestLineage.parentId;
  }

  world.lineageSummaryText =
    "LINEAGES: " + activeCount +
    " active / " + extinctCount + " extinct   " +
    newestText +
    "   top " + (visibleLineages.length > 0 ? visibleLineages.join(" | ") : "-");
  world.lineageSummary = {
    activeCount: activeCount,
    extinctCount: extinctCount,
    newestId: newestLineage.id,
    newestParentId: newestLineage.parentId,
    newestCreatedTick: newestLineage.createdTick,
    topLineages: visibleLineageSummaries
  };

  return world.lineageSummaryText;
}

export function refreshLineageRegistry() {
  var lineages = ensureLineageRegistry();
  var lineageKey;
  var traitTotals = {
    vision: 0,
    metabolism: 0,
    reproductionEnergy: 0,
    movementTendency: 0,
    terrainAffinity: 0,
    intelligence: 0,
    sociality: 0,
    carnivory: 0
  };

  world.organismBuckets = {};
  world.organismsByLineage = {};
  var pooledArrays = PS.pools && PS.pools.organism ? PS.pools.organism.arrays : null;
  var bucketSize = getOrganismBucketSize();

  for (lineageKey in lineages) {
    if (Object.prototype.hasOwnProperty.call(lineages, lineageKey)) {
      lineages[lineageKey].activeCount = 0;
    }
  }

  for (var i = 0; i < world.organisms.length; i++) {
    var organism = world.organisms[i];
    var poolIndex = pooledArrays && Number.isFinite(Number(organism.poolIndex)) ? Math.round(organism.poolIndex) : -1;
    var traits = organism.traits || ensureOrganismTraits(organism);
    var lineageId = poolIndex >= 0
      ? Math.max(1, Math.round(Number(pooledArrays.lineageId[poolIndex]) || 1))
      : Math.max(1, Math.round(Number(organism.lineageId) || 1));
    var lineageKeyForOrganism = String(lineageId);
    var record = lineages[lineageKeyForOrganism] || registerLineage(
      lineageId,
      organism.lineageParentId,
      organism.generation,
      traits,
      world.tick
    );
    var tileX = poolIndex >= 0 ? getWrappedWorldX(pooledArrays.x[poolIndex]) : getWrappedWorldX(organism.x);
    var tileY = poolIndex >= 0 ? getClampedWorldY(pooledArrays.y[poolIndex]) : getClampedWorldY(organism.y);
    var bucketKey = Math.floor(tileX / bucketSize) + ":" + Math.floor(tileY / bucketSize);
    var vision = poolIndex >= 0 ? pooledArrays.vision[poolIndex] : traits.vision;
    var metabolism = poolIndex >= 0 ? pooledArrays.metabolism[poolIndex] : traits.metabolism;
    var reproductionEnergy = poolIndex >= 0 ? pooledArrays.reproductionEnergy[poolIndex] : traits.reproductionEnergy;
    var movementTendency = poolIndex >= 0 ? pooledArrays.movementTendency[poolIndex] : traits.movementTendency;
    var terrainAffinity = poolIndex >= 0 ? pooledArrays.terrainAffinity[poolIndex] : traits.terrainAffinity;
    var intelligence = poolIndex >= 0 ? pooledArrays.intelligence[poolIndex] : traits.intelligence;
    var sociality = poolIndex >= 0 ? pooledArrays.sociality[poolIndex] : traits.sociality;
    var carnivory = poolIndex >= 0 ? pooledArrays.carnivory[poolIndex] : traits.carnivory;

    traitTotals.vision += vision;
    traitTotals.metabolism += metabolism;
    traitTotals.reproductionEnergy += reproductionEnergy;
    traitTotals.movementTendency += movementTendency;
    traitTotals.terrainAffinity += terrainAffinity;
    traitTotals.intelligence += intelligence;
    traitTotals.sociality += sociality;
    traitTotals.carnivory += carnivory;

    record.activeCount++;
    record.lastSeenTick = world.tick;

    if (record.activeCount > record.peakPopulation) {
      record.peakPopulation = record.activeCount;
    }

    if (!world.organismBuckets[bucketKey]) {
      world.organismBuckets[bucketKey] = [];
    }

    if (!world.organismsByLineage[lineageKeyForOrganism]) {
      world.organismsByLineage[lineageKeyForOrganism] = [];
    }

    world.organismBuckets[bucketKey].push(organism);
    world.organismsByLineage[lineageKeyForOrganism].push(organism);
  }

  for (lineageKey in lineages) {
    if (Object.prototype.hasOwnProperty.call(lineages, lineageKey)) {
      var lineage = lineages[lineageKey];
      lineage.isExtinct = lineage.activeCount === 0;
    }
  }

  if (world.organisms.length === 0) {
    world.populationTraitSummary = null;
  } else {
    world.populationTraitSummary = {
      population: world.organisms.length,
      vision: traitTotals.vision / world.organisms.length,
      metabolism: traitTotals.metabolism / world.organisms.length,
      reproductionEnergy: traitTotals.reproductionEnergy / world.organisms.length,
      movementTendency: traitTotals.movementTendency / world.organisms.length,
      terrainAffinity: traitTotals.terrainAffinity / world.organisms.length,
      intelligence: traitTotals.intelligence / world.organisms.length,
      sociality: traitTotals.sociality / world.organisms.length,
      carnivory: traitTotals.carnivory / world.organisms.length
    };
  }

  updateLineageSummaryCache();
}
