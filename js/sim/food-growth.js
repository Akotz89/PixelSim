"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { chance, clamp, randomInt } from "../core/utils.js";
import { recordFoodSpawned } from "../main-ecosystem-summary.js";
import { isFertile } from "../render/terrain-hydrology.js";
import { randomFertilePosition } from "../render/terrain-seeding.js";
import { addFoodAt, collectFoodInRadius, ensureFoodPositions, getFoodPositionKey, removeFood } from "./food-runtime.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

export function removeFoodInRadius(x, y, radius, limit) {
  var foods = collectFoodInRadius(x, y, radius, limit);

  for (var i = 0; i < foods.length; i++) {
    removeFood(foods[i]);
  }

  return foods.length;
}

export function randomFoodPosition() {
  if (chance(CONFIG.INITIAL_FOOD_FERTILE_CHANCE)) {
    return randomFertilePosition();
  }

  return {
    x: randomInt(WORLD_WIDTH),
    y: randomInt(WORLD_HEIGHT)
  };
}

export function foodExistsAt(x, y) {
  return Math.max(0, Math.round(Number(ensureFoodPositions()[getFoodPositionKey(x, y)]) || 0)) > 0;
}

export function spawnFoodAtPosition(position) {
  if (!position || world.food.length >= CONFIG.MAX_FOOD) {
    return false;
  }

  if (foodExistsAt(position.x, position.y)) {
    return false;
  }

  addFoodAt(position.x, position.y);

  if (typeof recordFoodSpawned === "function") {
    recordFoodSpawned(1);
  }

  return true;
}

export function tryGrowFoodAtPosition(position, growthChance) {
  if (world.food.length >= CONFIG.MAX_FOOD || !chance(growthChance)) {
    return false;
  }

  return spawnFoodAtPosition(position);
}

export function getFoodRecoveryPressure() {
  var population = Array.isArray(world.organisms) ? world.organisms.length : 0;

  if (
    population < CONFIG.FOOD_RECOVERY_MIN_POPULATION ||
    world.food.length >= CONFIG.MAX_FOOD
  ) {
    return 0;
  }

  var targetFood = Math.max(
    CONFIG.STARTING_FOOD * 0.12,
    population * CONFIG.FOOD_RECOVERY_TARGET_PER_ORGANISM
  );
  var deficit = targetFood - world.food.length;

  if (deficit <= 0) {
    return 0;
  }

  return clamp(deficit / Math.max(1, targetFood), 0, 1);
}

export function getFoodRecoveryAttemptCount(pressure) {
  if (pressure <= 0) {
    return 0;
  }

  return clamp(
    Math.ceil(pressure * CONFIG.FOOD_RECOVERY_MAX_EXTRA_ATTEMPTS),
    1,
    CONFIG.FOOD_RECOVERY_MAX_EXTRA_ATTEMPTS
  );
}

// ── Tile-worker food growth (AZR-492) ──
// Instead of random position sampling every tick, use a tile worker
// to sweep all tiles over N frames. Each visited tile gets a growth check.

export var foodGrowthWorker = null;

export function ensureFoodGrowthWorker() {
  if (foodGrowthWorker) { return foodGrowthWorker; }

  var cycleFrames = Math.max(1, Math.round(
    Number(CONFIG.FOOD_GROWTH_CYCLE_FRAMES) || 20
  ));

  foodGrowthWorker = PS.tileWorker.create("foodGrowth", {
    cycleFrames: cycleFrames,
    seed: world && world.rngState ? world.rngState : 0x5DEECE66D,
    callback: function (tileX, tileY, tileIndex) {
      if (world.food.length >= CONFIG.MAX_FOOD) { return; }

      // Fertile tiles grow food at a higher rate
      var growthChance = isFertile(tileX, tileY)
        ? CONFIG.FERTILE_FOOD_GROWTH_CHANCE
        : CONFIG.BARREN_FOOD_GROWTH_CHANCE;

      // Scale chance by cycle length so total growth rate is preserved
      // (original code ran 2 attempts per tick; now spread across cycleFrames)
      var scaledChance = growthChance * (foodGrowthWorker ? foodGrowthWorker.cycleFrames : 1);

      if (chance(scaledChance) && !foodExistsAt(tileX, tileY)) {
        addFoodAt(tileX, tileY);

        if (typeof recordFoodSpawned === "function") {
          recordFoodSpawned(1);
        }
      }
    }
  });

  return foodGrowthWorker;
}

export function resetFoodGrowthWorker() {
  foodGrowthWorker = null;
}

export function growFood() {
  world.foodRecoveryPressure = 0;
  world.foodRecoveryAttemptsThisTick = 0;

  if (world.food.length >= CONFIG.MAX_FOOD) {
    return;
  }

  // Tile-worker distributed growth (AZR-492)
  if (PS.tileWorker) {
    ensureFoodGrowthWorker().advance();
  } else {
    // Fallback: original random sampling
    tryGrowFoodAtPosition(randomFertilePosition(), CONFIG.FERTILE_FOOD_GROWTH_CHANCE);
    tryGrowFoodAtPosition({
      x: randomInt(WORLD_WIDTH),
      y: randomInt(WORLD_HEIGHT)
    }, CONFIG.BARREN_FOOD_GROWTH_CHANCE);
  }

  // Recovery pressure system (demand-driven, runs every tick)
  var recoveryPressure = getFoodRecoveryPressure();
  var recoveryAttempts = getFoodRecoveryAttemptCount(recoveryPressure);
  var recoveryChance = CONFIG.FERTILE_FOOD_GROWTH_CHANCE * (
    CONFIG.FOOD_RECOVERY_CHANCE_FLOOR +
    (1 - CONFIG.FOOD_RECOVERY_CHANCE_FLOOR) * recoveryPressure
  );

  world.foodRecoveryPressure = recoveryPressure;
  world.foodRecoveryAttemptsThisTick = recoveryAttempts;

  for (var i = 0; i < recoveryAttempts; i++) {
    tryGrowFoodAtPosition(randomFertilePosition(), recoveryChance);
  }
}
