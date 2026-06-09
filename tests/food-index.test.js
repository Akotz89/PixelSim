const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function makeElement() {
  return {
    width: 1600,
    height: 850,
    classList: {
      add() {},
      remove() {},
      toggle() {}
    },
    addEventListener() {},
    getContext() {
      return {};
    },
    querySelector() {
      return makeElement();
    }
  };
}

const context = {
  assert,
  console,
  window: {
    addEventListener() {}
  },
  document: {
    getElementById() {
      return makeElement();
    }
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/ui/dom-refs.js",
  "js/systems/state.js",
  "js/core/utils.js",
  "js/core/math.js",
  "js/core/world-grid.js",
  "js/core/planet-metrics.js",
  "js/render/planet-view.js",
  "js/render/planet-surface.js",
  "js/render/planet-grid.js",
  "js/render/camera.js",
  "js/render/globe.js",
  "js/render/surface-address.js",
  "js/render/surface-cache.js",
  "js/render/terrain-hydrology.js",
  "js/render/terrain-seeding.js",
  "js/sim/food-runtime.js",
  "js/sim/food-growth.js"
].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");

vm.runInNewContext(`${source}

setWorldSeed("FOOD-INDEX-TEST");
world.food = [];
world.foodPositions = {};
world.foodBuckets = {};

var firstFood = addFoodAt(1, 1);
var middleFood = addFoodAt(2, 2);
var lastFood = addFoodAt(3, 3);

assert.strictEqual(firstFood.foodIndex, 0, "first food should track its index");
assert.strictEqual(middleFood.foodIndex, 1, "middle food should track its index");
assert.strictEqual(lastFood.foodIndex, 2, "last food should track its index");
assert.strictEqual(foodExistsAt(2, 2), true, "middle food should be indexed before removal");

assert.strictEqual(removeFood(middleFood), middleFood, "removeFood should remove by tracked index");
assert.strictEqual(world.food.length, 2, "food removal should shrink the array");
assert.strictEqual(world.food[1], lastFood, "last food should swap into the removed slot");
assert.strictEqual(lastFood.foodIndex, 1, "swapped food should receive the removed slot index");
assert.strictEqual(foodExistsAt(2, 2), false, "removed food position should be unindexed");
assert.strictEqual(foodExistsAt(3, 3), true, "swapped food position should remain indexed");

assert.strictEqual(removeFoodAtIndex(0), firstFood, "removeFoodAtIndex should remove directly");
assert.strictEqual(world.food.length, 1, "direct removal should shrink the array");
assert.strictEqual(world.food[0], lastFood, "remaining food should swap into index 0");
assert.strictEqual(lastFood.foodIndex, 0, "remaining food should have index 0");

world.food = [makeFood(4, 4), makeFood(5, 5)];
rebuildFoodPositions();

assert.strictEqual(world.food[0].foodIndex, 0, "rebuild should restore first index");
assert.strictEqual(world.food[1].foodIndex, 1, "rebuild should restore second index");
assert.strictEqual(findNearestFoodInBuckets(5, 5, 10), world.food[1], "nearest food should early-return current tile food");

console.log("food index checks passed");
`, context);
