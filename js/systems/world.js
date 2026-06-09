"use strict";
PS.world = world;

PS.systems = PS.systems || {};
PS.systems.world = {
  state: world,
  dimensions: function() {
    return {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      tileSize: CONFIG.TILE_SIZE
    };
  },
  markDirty: function() {
    world.needsRender = true;
  },
  resetIndexes: function() {
    world.organismBuckets = {};
    world.organismsByLineage = {};
    world.foodPositions = {};
    world.foodBuckets = {};
    world.settlementBuckets = {};
  }
};
