import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { chance, clamp, clampToWorld, randomInt } from "../core/utils.js";
import { recordFoodConsumed, recordOrganismBirth, recordOrganismDeath } from "../main-ecosystem-summary.js";
import { getClampedWorldY, getDirectionXToTile, getDirectionYToTile, getTileGreatCircleDistanceKm, getTileManhattanDistance, getWrappedWorldX } from "../render/planet-grid.js";
import { assignRandomSurfacePositionInTile, getPlanetLatitudeForTile, getPlanetLongitudeForTile } from "../render/planet-view.js";
import { isFertile } from "../render/terrain-hydrology.js";
import { findNearestFoodInBuckets, removeFoodAtPosition } from "./food-runtime.js";
import { foodWeb } from "./food-web.js";
import { organismAi } from "./organism-ai.js";
import { getLimbMovementMultiplierFromValue, getOrganismTravelKmPerTick } from "./organisms-indexes.js";
import { assignChildLineage, ensureOrganismTraits, inheritOrganismTraits, makeOrganism } from "./organisms-traits.js";
import { terrainPressure } from "./terrain-pressure.js";
import { world } from "../systems/state.js";

export function findNearestFood(organism, searchRadius) {
  return findNearestFoodInBuckets(organism.x, organism.y, searchRadius);
}

export function moveTowardFood(organism, food) {
  organism.directionX = getDirectionXToTile(organism.x, food.x);
  organism.directionY = getDirectionYToTile(organism.y, food.y);
}

export function getTerrainAffinityTargetValue(x, y) {
  if (typeof terrainPressure.getSample === "function") {
    return terrainPressure.getSample(x, y).target.terrainAffinity;
  }

  return isFertile(x, y) ? 1 : 0;
}

export function getTerrainMismatchForTraits(traits, x, y) {
  if (typeof terrainPressure.getMismatchSample === "function") {
    return terrainPressure.getMismatchSample(traits, x, y).mismatch;
  }

  return Math.abs(traits.terrainAffinity - getTerrainAffinityTargetValue(x, y));
}

export function getTerrainEnergyCost(traits, x, y) {
  if (typeof terrainPressure.getEnergyCost === "function") {
    return terrainPressure.getEnergyCost(traits, x, y);
  }

  return getTerrainMismatchForTraits(traits, x, y) * CONFIG.TERRAIN_MISMATCH_MAX_ENERGY_COST;
}

export function applyTerrainEnergyCost(organism, traits) {
  organism.energy -= getTerrainEnergyCost(traits, organism.x, organism.y);
}

export function getBodySizeEnergyMultiplier(traits) {
  var bodySize = Number(traits && traits.bodySize);

  if (!Number.isFinite(bodySize)) {
    bodySize = CONFIG.TRAIT_BODY_SIZE_DEFAULT;
  }

  return 0.5 + bodySize * 0.3;
}

export function getBodySizeMetabolismMultiplier(traits) {
  var bodySize = Number(traits && traits.bodySize);

  if (!Number.isFinite(bodySize)) {
    bodySize = CONFIG.TRAIT_BODY_SIZE_DEFAULT;
  }

  return 0.7 + bodySize * 0.2;
}

export function getTraitAdjustedFoodEnergyValue(traits) {
  return CONFIG.FOOD_ENERGY_VALUE * getBodySizeEnergyMultiplier(traits);
}

export function getTraitAdjustedMetabolismCost(traits) {
  return traits.metabolism * getBodySizeMetabolismMultiplier(traits);
}

export function chooseRoamingDirection(organism, traits) {
  var bestDirections = [];
  var bestMismatch = Infinity;

  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      var nextX = getWrappedWorldX(organism.x + dx);
      var nextY = getClampedWorldY(organism.y + dy);
      var mismatch = getTerrainMismatchForTraits(traits, nextX, nextY);

      if (mismatch < bestMismatch) {
        bestMismatch = mismatch;
        bestDirections = [{ dx: dx, dy: dy }];
      } else if (mismatch === bestMismatch) {
        bestDirections.push({ dx: dx, dy: dy });
      }
    }
  }

  if (bestDirections.length === 0) {
    organism.directionX = randomInt(3) - 1;
    organism.directionY = randomInt(3) - 1;
    return;
  }

  var direction = bestDirections[randomInt(bestDirections.length)];
  organism.directionX = direction.dx;
  organism.directionY = direction.dy;
}

export function eatFoodOnCurrentTile(organism) {
  if (!removeFoodAtPosition(organism.x, organism.y)) {
    return false;
  }

  organism.energy += getTraitAdjustedFoodEnergyValue(ensureOrganismTraits(organism));

  if (typeof recordFoodConsumed === "function") {
    recordFoodConsumed(1);
  }

  return true;
}

export function isCarnivoreTraitSet(traits) {
  return Number(traits && traits.carnivory) > CONFIG.PREDATION_CARNIVORY_THRESHOLD;
}

export function getPredationSearchRadius(traits) {
  return Math.max(
    1,
    Math.min(
      Math.round(Number(CONFIG.PREDATION_SEARCH_RADIUS) || 3),
      Math.round(Number(traits && traits.vision) || CONFIG.PREDATION_SEARCH_RADIUS)
    )
  );
}

export function isPredationPrey(candidate, attacker) {
  if (!candidate || candidate === attacker || candidate.energy <= 0) {
    return false;
  }

  return !isCarnivoreTraitSet(ensureOrganismTraits(candidate));
}

export function findNearestPrey(organism, traits) {
  var radius = getPredationSearchRadius(traits);
  if (foodWeb && typeof foodWeb.findNearestPrey === "function") {
    return foodWeb.findNearestPrey(organism, traits, radius);
  }

  var nearestPrey = null;
  var nearestDistance = Infinity;

  for (var i = 0; i < world.organisms.length; i++) {
    var candidate = world.organisms[i];

    if (!isPredationPrey(candidate, organism)) {
      continue;
    }

    var distance = getTileManhattanDistance(organism.x, organism.y, candidate.x, candidate.y);

    if (distance <= radius && distance < nearestDistance) {
      nearestPrey = candidate;
      nearestDistance = distance;
    }
  }

  return nearestPrey;
}

export function moveTowardPrey(organism, prey) {
  organism.directionX = getDirectionXToTile(organism.x, prey.x);
  organism.directionY = getDirectionYToTile(organism.y, prey.y);
}

export function getPredationAttackAdvantage(attackerTraits, victimTraits) {
  if (foodWeb && typeof foodWeb.getAttackAdvantage === "function") {
    return foodWeb.getAttackAdvantage(attackerTraits, victimTraits);
  }

  var attackerSize = Number(attackerTraits.bodySize) || CONFIG.TRAIT_BODY_SIZE_DEFAULT;
  var victimSize = Number(victimTraits.bodySize) || CONFIG.TRAIT_BODY_SIZE_DEFAULT;
  var attackerLimbs = Number(attackerTraits.limbCount) || CONFIG.TRAIT_LIMB_COUNT_DEFAULT;
  var victimLimbs = Number(victimTraits.limbCount) || CONFIG.TRAIT_LIMB_COUNT_DEFAULT;

  return (
    attackerSize - victimSize +
    (attackerLimbs - victimLimbs) * 0.05 +
    (Number(attackerTraits.carnivory) - Number(victimTraits.carnivory)) * 0.25
  );
}

export function canAttemptPredationThisTick() {
  var interval = Math.max(1, Math.round(Number(CONFIG.PREDATION_ATTACK_INTERVAL) || 1));
  return world.tick % interval === 0;
}

export function tryAttackPrey(attacker, prey, attackerTraits) {
  if (!prey || getTileManhattanDistance(attacker.x, attacker.y, prey.x, prey.y) > 1) {
    return false;
  }

  var victimTraits = ensureOrganismTraits(prey);
  var attackAdvantage = getPredationAttackAdvantage(attackerTraits, victimTraits);

  if (attackAdvantage < CONFIG.PREDATION_MIN_ATTACK_ADVANTAGE) {
    return false;
  }

  var transferredEnergy = Math.max(0, Number(prey.energy) || 0) * CONFIG.PREDATION_ENERGY_TRANSFER_RATIO;
  prey.energy = 0;
  attacker.energy += transferredEnergy;
  syncPooledOrganismEnergy(prey);
  syncPooledOrganismEnergy(attacker);
  attacker.lastPredationTick = world.tick;
  prey.deathCause = "predation";
  if (foodWeb && typeof foodWeb.recordPredation === "function") {
    foodWeb.recordPredation(attacker, prey, transferredEnergy);
  }
  return true;
}

export function syncPooledOrganismEnergy(organism) {
  var arrays = PS.pools && PS.pools.organism ? PS.pools.organism.arrays : null;
  var poolIndex = organism && Number.isFinite(Number(organism.poolIndex)) ? Math.round(organism.poolIndex) : -1;

  if (arrays && poolIndex >= 0 && arrays.active[poolIndex]) {
    arrays.energy[poolIndex] = Math.max(0, Number(organism.energy) || 0);
  }
}

export function updatePredationForOrganism(organism, traits) {
  if (!isCarnivoreTraitSet(traits)) {
    return false;
  }

  var prey = findNearestPrey(organism, traits);

  if (!prey) {
    return false;
  }

  moveTowardPrey(organism, prey);

  if (!canAttemptPredationThisTick()) {
    return false;
  }

  return tryAttackPrey(organism, prey, traits);
}

export function shouldForageOrganism(organism, updateIndex, traits) {
  if (!organism || isCarnivoreTraitSet(traits) || !Array.isArray(world.food) || world.food.length <= 0) {
    return false;
  }

  if (!traits || Number(traits.vision) <= 0) {
    return false;
  }

  if (!Number.isFinite(Number(updateIndex))) {
    return true;
  }

  var foragingInterval = Math.max(1, Math.round(Number(CONFIG.ORGANISM_FORAGING_INTERVAL) || 1));
  var stableIndex = Number.isFinite(Number(organism.poolIndex)) ? organism.poolIndex : updateIndex;

  return (world.tick + Math.max(0, Math.round(stableIndex))) % foragingInterval === 0;
}

export function getReproductionScarcityPressure() {
  var population = Array.isArray(world.organisms) ? world.organisms.length : 0;

  if (population < CONFIG.FOOD_RECOVERY_MIN_POPULATION) {
    return 0;
  }

  var targetFood = Math.max(
    CONFIG.STARTING_FOOD * 0.08,
    population * CONFIG.REPRODUCTION_RESOURCE_TARGET_PER_ORGANISM
  );
  var deficit = targetFood - world.food.length;

  if (deficit <= 0) {
    return 0;
  }

  return clamp(deficit / Math.max(1, targetFood), 0, 1);
}

export function getResourceAdjustedReproductionEnergy(traits, scarcityPressure, organism) {
  var multiplier = 1 + clamp(scarcityPressure, 0, 1) * (
    CONFIG.REPRODUCTION_SCARCITY_MAX_ENERGY_MULTIPLIER - 1
  );

  if (
    organism &&
    typeof terrainPressure.getReproductionMultiplier === "function"
  ) {
    multiplier *= terrainPressure.getReproductionMultiplier(traits, organism.x, organism.y);
  }

  if (
    organism &&
    PS.sim &&
    PS.sim.massExtinction &&
    typeof PS.sim.massExtinction.getRecoveryReproductionMultiplier === "function"
  ) {
    multiplier *= PS.sim.massExtinction.getRecoveryReproductionMultiplier(organism);
  }

  return traits.reproductionEnergy * multiplier;
}

export function reproduceIfReady(organism) {
  var traits = ensureOrganismTraits(organism);

  if (organism.energy < traits.reproductionEnergy) {
    return;
  }

  var scarcityPressure = getReproductionScarcityPressure();
  var reproductionEnergy = getResourceAdjustedReproductionEnergy(traits, scarcityPressure, organism);

  world.reproductionScarcityPressure = Math.max(
    Number(world.reproductionScarcityPressure) || 0,
    scarcityPressure
  );

  if (organism.energy < reproductionEnergy) {
    return;
  }

  organism.energy = CONFIG.PARENT_ENERGY_AFTER_REPRODUCTION;

  var child = makeOrganism(
    organism.x + randomInt(3) - 1,
    organism.y + randomInt(3) - 1,
    organism.lineageId
  );

  if (!child) {
    return;
  }

  child.energy = CONFIG.CHILD_ORGANISM_ENERGY;
  child.traits = inheritOrganismTraits(traits);
  child.traitsNormalized = true;
  assignChildLineage(child, organism, traits);
  clampToWorld(child);
  child.prevX = child.x;
  child.prevY = child.y;
  world.organisms.push(child);

  // Register child in tile grid (AZR-491)
  if (PS.tileGrid && PS.tileGrid.grid) {
    PS.tileGrid.insert(child);
  }

  if (typeof recordOrganismBirth === "function") {
    recordOrganismBirth(1);
  }

  if (PS.render && PS.render.particles && typeof PS.render.particles.emitBirthSparkle === "function") {
    PS.render.particles.emitBirthSparkle(child);
  }
}

export function updateOrganism(organism, updateIndex) {
  var traits = ensureOrganismTraits(organism);

  if (organism.energy <= 0) {
    return;
  }

  organism.prevX = organism.x;
  organism.prevY = organism.y;
  organism.prevLatitude = Number.isFinite(Number(organism.latitude))
    ? organism.latitude
    : getPlanetLatitudeForTile(organism.y);
  organism.prevLongitude = Number.isFinite(Number(organism.longitude))
    ? organism.longitude
    : getPlanetLongitudeForTile(organism.x);
  organism.age++;
  organism.travelKm = Math.max(0, Number(organism.travelKm) || 0) + getOrganismTravelKmPerTick(traits);

  if (world.tick % 3 === 0) {
    organism.energy -= getTraitAdjustedMetabolismCost(traits);
    applyTerrainEnergyCost(organism, traits);
  }

  var isCarnivore = isCarnivoreTraitSet(traits);
  var nearestFood = shouldForageOrganism(organism, updateIndex, traits)
    ? findNearestFood(organism, traits.vision)
    : null;
  var shouldWander = !nearestFood && chance(traits.movementTendency);
  var ai = typeof organismAi.tick === "function"
    ? organismAi.tick(organism, {
      traits: traits,
      isCarnivore: isCarnivore,
      nearestFood: nearestFood,
      shouldWander: shouldWander
    })
    : null;

  if (isCarnivore) {
    updatePredationForOrganism(organism, traits);
  } else if (ai && ai.moduleKey === "eat" && nearestFood) {
    moveTowardFood(organism, nearestFood);
  } else if (ai && ai.moduleKey === "wander" && shouldWander) {
    chooseRoamingDirection(organism, traits);
  }

  moveOrganismByTravelBudget(organism);

  if (isCarnivore) {
    updatePredationForOrganism(organism, traits);
  } else {
    if (eatFoodOnCurrentTile(organism) && typeof organismAi.advanceStep === "function") {
      organismAi.advanceStep(organism, "consume");
    }
  }

  reproduceIfReady(organism);
}

/**
 * @description Advances pooled organisms for one simulation tick, applying movement, terrain pressure, feeding, predation, energy costs, reproduction, and AI step tracking.
 * @param {number} organismsAtStartOfTick Number of organisms present when the tick began, used to cap pooled iteration.
 * @returns {boolean} True when the pooled organism update path ran.
 */
export function updatePooledOrganismsForTick(organismsAtStartOfTick) {
  if (!PS.pools || !PS.pools.organism) {
    return false;
  }

  var arrays = PS.pools.organism.arrays;
  var baseTravelKmPerTick = getOrganismTravelKmPerTick();
  var applyEnergyCostThisTick = world.tick % 3 === 0;
  var foodPositions = world.foodPositions || {};

  for (var i = 0; i < organismsAtStartOfTick; i++) {
    var organism = world.organisms[i];
    var poolIndex = organism && Number.isFinite(Number(organism.poolIndex)) ? Math.round(organism.poolIndex) : -1;

    if (poolIndex < 0 || !arrays.active[poolIndex]) {
      return false;
    }
  }

  for (var index = 0; index < organismsAtStartOfTick; index++) {
    var pooledOrganism = world.organisms[index];
    var pooledIndex = pooledOrganism.poolIndex;
    var x = getWrappedWorldX(arrays.x[pooledIndex]);
    var y = getClampedWorldY(arrays.y[pooledIndex]);
    var energy = arrays.energy[pooledIndex];
    var limbCount = arrays.limbCount[pooledIndex];
    var travelKm = Math.max(0, Number(arrays.travelKm[pooledIndex]) || 0) +
      baseTravelKmPerTick * getLimbMovementMultiplierFromValue(limbCount);
    var traits = pooledOrganism.traits;

    if (energy <= 0) {
      continue;
    }

    arrays.prevX[pooledIndex] = x;
    arrays.prevY[pooledIndex] = y;
    arrays.prevLatitude[pooledIndex] = Number.isFinite(Number(arrays.latitude[pooledIndex]))
      ? arrays.latitude[pooledIndex]
      : getPlanetLatitudeForTile(y);
    arrays.prevLongitude[pooledIndex] = Number.isFinite(Number(arrays.longitude[pooledIndex]))
      ? arrays.longitude[pooledIndex]
      : getPlanetLongitudeForTile(x);
    arrays.age[pooledIndex]++;

    if (applyEnergyCostThisTick) {
      energy -= arrays.metabolism[pooledIndex] * getBodySizeMetabolismMultiplier({
        bodySize: arrays.bodySize[pooledIndex]
      });
      energy -= getTerrainEnergyCost(traits, x, y);
    }

    var isPooledCarnivore = isCarnivoreTraitSet(traits);
    var nearestFood = shouldForageOrganism(pooledOrganism, index, traits)
      ? findNearestFoodInBuckets(x, y, arrays.vision[pooledIndex])
      : null;
    var shouldWander = !nearestFood && arrays.movementTendency[pooledIndex] > 0 && chance(arrays.movementTendency[pooledIndex]);
    var ai = typeof organismAi.tick === "function"
      ? organismAi.tick(pooledOrganism, {
        traits: traits,
        isCarnivore: isPooledCarnivore,
        nearestFood: nearestFood,
        shouldWander: shouldWander
      })
      : null;

    if (isPooledCarnivore) {
      pooledOrganism.x = x;
      pooledOrganism.y = y;
      pooledOrganism.energy = energy;
      updatePredationForOrganism(pooledOrganism, traits);
      energy = arrays.energy[pooledIndex];
    } else if (ai && ai.moduleKey === "eat" && nearestFood) {
      arrays.directionX[pooledIndex] = getDirectionXToTile(x, nearestFood.x);
      arrays.directionY[pooledIndex] = getDirectionYToTile(y, nearestFood.y);
    } else if (ai && ai.moduleKey === "wander" && shouldWander) {
      chooseRoamingDirection(pooledOrganism, traits);
    }

    var directionX = arrays.directionX[pooledIndex];
    var directionY = arrays.directionY[pooledIndex];
    var nextX = x;
    var nextY = y;

    if (directionX !== 0 || directionY !== 0) {
      nextX = getWrappedWorldX(x + directionX);
      nextY = getClampedWorldY(y + directionY);
    }

    if (nextX !== x || nextY !== y) {
      var requiredTravelKm = getTileGreatCircleDistanceKm(x, y, nextX, nextY);

      if (travelKm >= requiredTravelKm) {
        travelKm -= requiredTravelKm;
        arrays.x[pooledIndex] = nextX;
        arrays.y[pooledIndex] = nextY;
        assignRandomSurfacePositionInTile(pooledOrganism);

        // Update tile grid after position change (AZR-491)
        if (PS.tileGrid && PS.tileGrid.grid) {
          PS.tileGrid.move(pooledOrganism, x, y);
        }

        x = nextX;
        y = nextY;
        pooledOrganism.facing = directionY < 0 ? 3 : (directionY > 0 ? 0 : (directionX < 0 ? 1 : 2));
        pooledOrganism.animFrame = Math.floor((typeof performance !== "undefined" && performance && typeof performance.now === "function" ? performance.now() : Date.now()) / 250) & 1;
      }
    }

    arrays.travelKm[pooledIndex] = travelKm;

    var foodKey = x + ":" + y;

    if (!isPooledCarnivore && foodPositions[foodKey] && removeFoodAtPosition(x, y)) {
      energy += getTraitAdjustedFoodEnergyValue({
        bodySize: arrays.bodySize[pooledIndex]
      });

      if (typeof recordFoodConsumed === "function") {
        recordFoodConsumed(1);
      }

      if (typeof organismAi.advanceStep === "function") {
        organismAi.advanceStep(pooledOrganism, "consume");
      }
    }

    if (isPooledCarnivore) {
      pooledOrganism.x = x;
      pooledOrganism.y = y;
      pooledOrganism.energy = energy;
      updatePredationForOrganism(pooledOrganism, traits);
      energy = arrays.energy[pooledIndex];
    }

    arrays.energy[pooledIndex] = energy;

    if (energy >= arrays.reproductionEnergy[pooledIndex]) {
      reproduceIfReady(pooledOrganism);
    }
  }

  return true;
}

export function moveOrganismByTravelBudget(organism) {
  var nextX = getWrappedWorldX(organism.x + organism.directionX);
  var nextY = getClampedWorldY(organism.y + organism.directionY);

  if (nextX === organism.x && nextY === organism.y) {
    return false;
  }

  var requiredTravelKm = getTileGreatCircleDistanceKm(organism.x, organism.y, nextX, nextY);

  if (organism.travelKm < requiredTravelKm) {
    return false;
  }

  organism.travelKm -= requiredTravelKm;

  var oldX = organism.x;
  var oldY = organism.y;
  organism.x = nextX;
  organism.y = nextY;
  if (organism.directionY < 0) {
    organism.facing = 3;
  } else if (organism.directionY > 0) {
    organism.facing = 0;
  } else if (organism.directionX < 0) {
    organism.facing = 1;
  } else if (organism.directionX > 0) {
    organism.facing = 2;
  }
  organism.animFrame = Math.floor((typeof performance !== "undefined" && performance && typeof performance.now === "function" ? performance.now() : Date.now()) / 250) & 1;
  clampToWorld(organism);
  assignRandomSurfacePositionInTile(organism);

  // Update tile grid after position change (AZR-491)
  if (PS.tileGrid && PS.tileGrid.grid) {
    PS.tileGrid.move(organism, oldX, oldY);
  }

  return true;
}

export function removeDeadOrganisms() {
  var writeIndex = 0;
  var removedCount = 0;

  for (var readIndex = 0; readIndex < world.organisms.length; readIndex++) {
    var organism = world.organisms[readIndex];

    if (organism.energy > 0 && organism.age < CONFIG.ORGANISM_MAX_AGE) {
      world.organisms[writeIndex] = organism;
      writeIndex++;
    } else {
      if (PS.pools && PS.pools.organism && PS.poolManager) {
        PS.poolManager.release("organisms", organism);
      }

      // Remove from tile grid (AZR-491)
      if (PS.tileGrid && PS.tileGrid.grid) {
        PS.tileGrid.remove(organism);
      }

      removedCount++;
    }
  }

  world.organisms.length = writeIndex;

  if (typeof recordOrganismDeath === "function") {
    recordOrganismDeath(removedCount);
  }
}

export function trimOrganismPopulation() {
  if (world.organisms.length > CONFIG.MAX_ORGANISMS) {
    var trimmedCount = world.organisms.length - CONFIG.MAX_ORGANISMS;

    for (var i = CONFIG.MAX_ORGANISMS; i < world.organisms.length; i++) {
      if (PS.pools && PS.pools.organism && PS.poolManager) {
        PS.poolManager.release("organisms", world.organisms[i]);
      }

      // Remove from tile grid (AZR-491)
      if (PS.tileGrid && PS.tileGrid.grid) {
        PS.tileGrid.remove(world.organisms[i]);
      }
    }

    world.organisms.length = CONFIG.MAX_ORGANISMS;

    if (typeof recordOrganismDeath === "function") {
      recordOrganismDeath(trimmedCount);
    }
  }
}
