"use strict";
function makeFood(x, y) {
  var tileX = getWrappedWorldX(x);
  var tileY = getClampedWorldY(y);
  var surfacePosition = getRandomLatLonInTile(tileX, tileY);
  var food = PS.pools && PS.pools.ensure && PS.pools.ensure() && PS.poolManager
    ? PS.poolManager.acquire("food")
    : {};

  food.x = tileX;
  food.y = tileY;
  food.latitude = surfacePosition.latitude;
  food.longitude = surfacePosition.longitude;
  food.active = true;

  return food;
}

function releaseFoodParticle(food) {
  if (PS.pools && PS.pools.food && PS.poolManager) {
    PS.poolManager.release("food", food);
  }
}

function getFoodPositionKey(x, y) {
  return getWrappedWorldX(x) + ":" + getClampedWorldY(y);
}

function getFoodBucketSize() {
  return Math.max(1, Math.round(Number(CONFIG.FOOD_SPATIAL_BUCKET_SIZE) || 16));
}

function getFoodBucketKey(x, y) {
  var bucketSize = getFoodBucketSize();
  return Math.floor(getWrappedWorldX(x) / bucketSize) + ":" + Math.floor(getClampedWorldY(y) / bucketSize);
}

function rebuildFoodPositions() {
  world.foodPositions = {};
  world.foodBuckets = {};

  for (var i = 0; i < world.food.length; i++) {
    world.food[i].foodIndex = i;
    registerFood(world.food[i]);
  }

  return world.foodPositions;
}

function ensureFoodPositions() {
  if (!world.foodPositions) {
    return rebuildFoodPositions();
  }

  return world.foodPositions;
}

function ensureFoodBuckets() {
  if (!world.foodBuckets) {
    rebuildFoodPositions();
  }

  return world.foodBuckets;
}

function registerFoodPosition(food) {
  var positions = ensureFoodPositions();
  var key = getFoodPositionKey(food.x, food.y);
  positions[key] = (positions[key] || 0) + 1;
}

function unregisterFoodPosition(food) {
  var positions = ensureFoodPositions();
  var key = getFoodPositionKey(food.x, food.y);
  var count = Math.max(0, Math.round(Number(positions[key]) || 0));

  if (count <= 1) {
    delete positions[key];
  } else {
    positions[key] = count - 1;
  }
}

function registerFoodBucket(food) {
  var buckets = ensureFoodBuckets();
  var key = getFoodBucketKey(food.x, food.y);

  if (!buckets[key]) {
    buckets[key] = [];
  }

  buckets[key].push(food);
}

function unregisterFoodBucket(food) {
  var buckets = ensureFoodBuckets();
  var key = getFoodBucketKey(food.x, food.y);
  var bucket = buckets[key];

  if (!bucket) {
    return;
  }

  for (var i = bucket.length - 1; i >= 0; i--) {
    if (bucket[i] === food) {
      bucket.splice(i, 1);
      break;
    }
  }

  if (bucket.length === 0) {
    delete buckets[key];
  }
}

function registerFood(food) {
  registerFoodPosition(food);
  registerFoodBucket(food);
}

function unregisterFood(food) {
  unregisterFoodPosition(food);
  unregisterFoodBucket(food);
}

function addFoodAt(x, y) {
  var food = makeFood(x, y);
  food.foodIndex = world.food.length;
  world.food.push(food);
  registerFood(food);
  return food;
}

function removeFoodAtIndex(index) {
  var rawIndex = Number(index);

  if (!Number.isFinite(rawIndex)) {
    return null;
  }

  var normalizedIndex = Math.round(rawIndex);
  var food = world.food[normalizedIndex];

  if (!food) {
    return null;
  }

  unregisterFood(food);

  var lastIndex = world.food.length - 1;
  var lastFood = world.food[lastIndex];

  if (normalizedIndex !== lastIndex) {
    world.food[normalizedIndex] = lastFood;

    if (lastFood) {
      lastFood.foodIndex = normalizedIndex;
    }
  }

  world.food.pop();
  delete food.foodIndex;
  releaseFoodParticle(food);
  return food;
}

function removeFood(food) {
  if (!food) {
    return null;
  }

  var indexedPosition = Math.round(Number(food.foodIndex));
  var index = Number.isFinite(indexedPosition) && world.food[indexedPosition] === food
    ? indexedPosition
    : world.food.indexOf(food);

  return index >= 0 ? removeFoodAtIndex(index) : null;
}

function findFoodAt(x, y) {
  var tileX = getWrappedWorldX(x);
  var tileY = getClampedWorldY(y);
  var bucket = ensureFoodBuckets()[getFoodBucketKey(tileX, tileY)];

  if (!bucket) {
    return null;
  }

  for (var i = 0; i < bucket.length; i++) {
    if (bucket[i].x === tileX && bucket[i].y === tileY) {
      return bucket[i];
    }
  }

  return null;
}

function removeFoodAtPosition(x, y) {
  return removeFood(findFoodAt(x, y));
}

function findNearestFoodInBuckets(x, y, searchRadius) {
  var currentTileFood = findFoodAt(x, y);

  if (currentTileFood) {
    return currentTileFood;
  }

  var buckets = ensureFoodBuckets();
  var bucketSize = getFoodBucketSize();
  var normalizedRadius = Math.max(0, Math.round(Number(searchRadius) || 0));
  var bucketXs = getWrappedBucketIndexes(x, normalizedRadius, bucketSize, WORLD_WIDTH);
  var bucketYs = getClampedBucketIndexes(y, normalizedRadius, bucketSize, WORLD_HEIGHT);
  var nearest = null;
  var nearestDistance = Infinity;

  for (var bucketYIndex = 0; bucketYIndex < bucketYs.length; bucketYIndex++) {
    for (var bucketXIndex = 0; bucketXIndex < bucketXs.length; bucketXIndex++) {
      var bucketY = bucketYs[bucketYIndex];
      var bucketX = bucketXs[bucketXIndex];
      var bucket = buckets[bucketX + ":" + bucketY];

      if (!bucket) {
        continue;
      }

      for (var i = 0; i < bucket.length; i++) {
        var food = bucket[i];
        var distance = getTileManhattanDistance(x, y, food.x, food.y);

        if (distance < nearestDistance && distance <= normalizedRadius) {
          nearest = food;
          nearestDistance = distance;
        }
      }
    }
  }

  return nearest;
}

function collectFoodInRadius(x, y, radius, limit) {
  var buckets = ensureFoodBuckets();
  var bucketSize = getFoodBucketSize();
  var normalizedRadius = Math.max(0, Math.round(Number(radius) || 0));
  var normalizedLimit = Number.isFinite(Number(limit)) ? Math.max(0, Math.round(Number(limit))) : Infinity;
  var bucketXs = getWrappedBucketIndexes(x, normalizedRadius, bucketSize, WORLD_WIDTH);
  var bucketYs = getClampedBucketIndexes(y, normalizedRadius, bucketSize, WORLD_HEIGHT);
  var foods = [];

  if (normalizedLimit <= 0) {
    return foods;
  }

  for (var bucketYIndex = 0; bucketYIndex < bucketYs.length; bucketYIndex++) {
    for (var bucketXIndex = 0; bucketXIndex < bucketXs.length; bucketXIndex++) {
      var bucketY = bucketYs[bucketYIndex];
      var bucketX = bucketXs[bucketXIndex];
      var bucket = buckets[bucketX + ":" + bucketY];

      if (!bucket) {
        continue;
      }

      for (var i = 0; i < bucket.length; i++) {
        var food = bucket[i];
        var distance = getTileManhattanDistance(x, y, food.x, food.y);

        if (distance <= normalizedRadius) {
          foods.push(food);

          if (foods.length >= normalizedLimit) {
            return foods;
          }
        }
      }
    }
  }

  return foods;
}

function countFoodInRadius(x, y, radius) {
  var buckets = ensureFoodBuckets();
  var bucketSize = getFoodBucketSize();
  var normalizedRadius = Math.max(0, Math.round(Number(radius) || 0));
  var bucketXs = getWrappedBucketIndexes(x, normalizedRadius, bucketSize, WORLD_WIDTH);
  var bucketYs = getClampedBucketIndexes(y, normalizedRadius, bucketSize, WORLD_HEIGHT);
  var count = 0;

  for (var bucketYIndex = 0; bucketYIndex < bucketYs.length; bucketYIndex++) {
    for (var bucketXIndex = 0; bucketXIndex < bucketXs.length; bucketXIndex++) {
      var bucketY = bucketYs[bucketYIndex];
      var bucketX = bucketXs[bucketXIndex];
      var bucket = buckets[bucketX + ":" + bucketY];

      if (!bucket) {
        continue;
      }

      for (var i = 0; i < bucket.length; i++) {
        var food = bucket[i];

        if (getTileManhattanDistance(x, y, food.x, food.y) <= normalizedRadius) {
          count++;
        }
      }
    }
  }

  return count;
}
