"use strict";
PS.sim = PS.sim || {};

PS.sim.food = {
  make: function(x, y) {
    return makeFood(x, y);
  },
  addAt: function(x, y) {
    return addFoodAt(x, y);
  },
  removeAtIndex: function(index) {
    return removeFoodAtIndex(index);
  },
  remove: function(food) {
    return removeFood(food);
  },
  findAt: function(x, y) {
    return findFoodAt(x, y);
  },
  removeAtPosition: function(x, y) {
    return removeFoodAtPosition(x, y);
  },
  nearestInRadius: function(x, y, radius) {
    return findNearestFoodInBuckets(x, y, radius);
  },
  collectInRadius: function(x, y, radius, limit) {
    return collectFoodInRadius(x, y, radius, limit);
  },
  countInRadius: function(x, y, radius) {
    return countFoodInRadius(x, y, radius);
  },
  removeInRadius: function(x, y, radius, limit) {
    return removeFoodInRadius(x, y, radius, limit);
  },
  existsAt: function(x, y) {
    return foodExistsAt(x, y);
  },
  grow: function() {
    return growFood();
  },
  rebuildIndexes: function() {
    return rebuildFoodPositions();
  }
};
