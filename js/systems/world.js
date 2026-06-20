import { CONFIG } from "../../config.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "./state.js";

export const worldSystem = {
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
