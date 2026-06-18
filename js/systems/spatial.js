import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { getClampedBucketIndexes, getTileManhattanDistance, getWrappedBucketIndexes } from "../render/planet-grid.js";
import { rebuildFoodPositions } from "../sim/food-runtime.js";
import { rebuildOrganismIndexes } from "../sim/organisms-indexes.js";
import { rebuildSettlementIndexes } from "../sim/settlements-state.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./state.js";

PS.systems = PS.systems || {};

export function createSpatialChunk() {
  return {
    ids: {},
    order: []
  };
}

export function getSpatialChunkSize() {
  var configuredSize = PS.config && PS.config.spatial ? PS.config.spatial.chunkSize : 0;
  var fallbackSize = typeof CONFIG !== "undefined" ?
    CONFIG.SPATIAL_CHUNK_SIZE || CONFIG.ORGANISM_SPATIAL_BUCKET_SIZE || 16 :
    16;

  return Math.max(1, Math.round(Number(configuredSize || fallbackSize) || 16));
}

export function getSpatialChunkCountX(chunkSize) {
  return Math.max(1, Math.ceil(Math.max(1, WORLD_WIDTH) / chunkSize));
}

export function getSpatialChunkCountY(chunkSize) {
  return Math.max(1, Math.ceil(Math.max(1, WORLD_HEIGHT) / chunkSize));
}

export function normalizeSpatialEntityId(entityId) {
  return String(entityId == null ? "" : entityId);
}

export function getSpatialWrappedX(x) {
  return PS.worldGrid.getWrappedX(x);
}

export function getSpatialClampedY(y) {
  return PS.worldGrid.getClampedY(y);
}

export function getSpatialDistance(leftX, leftY, rightX, rightY) {
  return PS.worldGrid.getTileManhattanDistance(leftX, leftY, rightX, rightY);
}

export function getSpatialWrappedChunkIndexes(centerX, radius, chunkSize) {
  return PS.worldGrid.getWrappedBucketIndexes(centerX, radius, chunkSize, WORLD_WIDTH);
}

export function getSpatialClampedChunkIndexes(centerY, radius, chunkSize) {
  return PS.worldGrid.getClampedBucketIndexes(centerY, radius, chunkSize, WORLD_HEIGHT);
}

export function getSpatialChunkKey(chunkX, chunkY) {
  return chunkX + ":" + chunkY;
}

export function removeSpatialChunkId(chunk, entityId) {
  if (!chunk || !chunk.ids[entityId]) {
    return;
  }

  delete chunk.ids[entityId];

  for (var i = 0; i < chunk.order.length; i++) {
    if (chunk.order[i] === entityId) {
      var lastIndex = chunk.order.length - 1;
      chunk.order[i] = chunk.order[lastIndex];
      chunk.order.pop();
      return;
    }
  }
}

PS.spatial = {
  index: {
    chunks: {},
    entities: {}
  },
  getChunkSize: getSpatialChunkSize,
  getChunkX: function(x) {
    return Math.floor(getSpatialWrappedX(x) / getSpatialChunkSize());
  },
  getChunkY: function(y) {
    return Math.floor(getSpatialClampedY(y) / getSpatialChunkSize());
  },
  getChunkKey: getSpatialChunkKey,
  bucketKey: function(x, y, bucketSize) {
    var size = Math.max(1, Math.round(Number(bucketSize) || 1));
    return Math.floor(getSpatialWrappedX(x) / size) + ":" + Math.floor(getSpatialClampedY(y) / size);
  },
  wrappedBucketIndexes: function(x, radius, bucketSize, width) {
    return PS.worldGrid.getWrappedBucketIndexes(x, radius, bucketSize, width || WORLD_WIDTH);
  },
  clampedBucketIndexes: function(y, radius, bucketSize, height) {
    return PS.worldGrid.getClampedBucketIndexes(y, radius, bucketSize, height || WORLD_HEIGHT);
  },
  tileDistance: function(leftX, leftY, rightX, rightY) {
    return getSpatialDistance(leftX, leftY, rightX, rightY);
  },
  clear: function() {
    PS.spatial.index = {
      chunks: {},
      entities: {}
    };

    return PS.spatial.index;
  },
  insert: function(entityId, x, y, metadata) {
    var id = normalizeSpatialEntityId(entityId);

    if (!id) {
      return null;
    }

    if (PS.spatial.index.entities[id]) {
      PS.spatial.remove(id);
    }

    var chunkSize = getSpatialChunkSize();
    var normalizedX = getSpatialWrappedX(x);
    var normalizedY = getSpatialClampedY(y);
    var chunkX = Math.floor(normalizedX / chunkSize);
    var chunkY = Math.floor(normalizedY / chunkSize);
    var chunkKey = getSpatialChunkKey(chunkX, chunkY);
    var chunk = PS.spatial.index.chunks[chunkKey] || createSpatialChunk();
    var record = {
      id: id,
      x: normalizedX,
      y: normalizedY,
      chunkX: chunkX,
      chunkY: chunkY,
      chunkKey: chunkKey,
      metadata: metadata || null
    };

    chunk.ids[id] = true;
    chunk.order.push(id);
    PS.spatial.index.chunks[chunkKey] = chunk;
    PS.spatial.index.entities[id] = record;

    return record;
  },
  remove: function(entityId) {
    var id = normalizeSpatialEntityId(entityId);
    var record = PS.spatial.index.entities[id];

    if (!record) {
      return false;
    }

    removeSpatialChunkId(PS.spatial.index.chunks[record.chunkKey], id);
    delete PS.spatial.index.entities[id];

    return true;
  },
  move: function(entityId, newX, newY) {
    var id = normalizeSpatialEntityId(entityId);
    var record = PS.spatial.index.entities[id];

    if (!record) {
      return PS.spatial.insert(id, newX, newY);
    }

    var chunkSize = getSpatialChunkSize();
    var normalizedX = getSpatialWrappedX(newX);
    var normalizedY = getSpatialClampedY(newY);
    var chunkX = Math.floor(normalizedX / chunkSize);
    var chunkY = Math.floor(normalizedY / chunkSize);
    var chunkKey = getSpatialChunkKey(chunkX, chunkY);

    if (chunkKey !== record.chunkKey) {
      removeSpatialChunkId(PS.spatial.index.chunks[record.chunkKey], id);

      var chunk = PS.spatial.index.chunks[chunkKey] || createSpatialChunk();
      chunk.ids[id] = true;
      chunk.order.push(id);
      PS.spatial.index.chunks[chunkKey] = chunk;
    }

    record.x = normalizedX;
    record.y = normalizedY;
    record.chunkX = chunkX;
    record.chunkY = chunkY;
    record.chunkKey = chunkKey;

    return record;
  },
  queryChunk: function(chunkX, chunkY) {
    var size = getSpatialChunkSize();
    var normalizedChunkX = Math.round(Number(chunkX) || 0);
    var normalizedChunkY = Math.round(Number(chunkY) || 0);
    var chunkCountX = getSpatialChunkCountX(size);
    var chunkCountY = getSpatialChunkCountY(size);

    normalizedChunkX %= chunkCountX;
    if (normalizedChunkX < 0) {
      normalizedChunkX += chunkCountX;
    }

    normalizedChunkY = Math.max(0, Math.min(chunkCountY - 1, normalizedChunkY));

    var chunk = PS.spatial.index.chunks[getSpatialChunkKey(normalizedChunkX, normalizedChunkY)];
    return chunk ? chunk.order.slice() : [];
  },
  queryRadius: function(x, y, radius) {
    var size = getSpatialChunkSize();
    var normalizedRadius = Math.max(0, Math.round(Number(radius) || 0));
    var chunkXs = getSpatialWrappedChunkIndexes(x, normalizedRadius, size);
    var chunkYs = getSpatialClampedChunkIndexes(y, normalizedRadius, size);
    var ids = [];

    for (var yIndex = 0; yIndex < chunkYs.length; yIndex++) {
      for (var xIndex = 0; xIndex < chunkXs.length; xIndex++) {
        var chunk = PS.spatial.index.chunks[getSpatialChunkKey(chunkXs[xIndex], chunkYs[yIndex])];

        if (!chunk) {
          continue;
        }

        for (var idIndex = 0; idIndex < chunk.order.length; idIndex++) {
          var id = chunk.order[idIndex];
          var record = PS.spatial.index.entities[id];

          if (record && getSpatialDistance(x, y, record.x, record.y) <= normalizedRadius) {
            ids.push(id);
          }
        }
      }
    }

    return ids;
  },
  getStats: function() {
    return {
      chunkSize: getSpatialChunkSize(),
      chunks: Object.keys(PS.spatial.index.chunks).length,
      entities: Object.keys(PS.spatial.index.entities).length
    };
  },
  rebuildFood: function() {
    return typeof rebuildFoodPositions === "function" ? rebuildFoodPositions() : null;
  },
  rebuildOrganisms: function() {
    return typeof rebuildOrganismIndexes === "function" ? rebuildOrganismIndexes() : null;
  },
  rebuildSettlements: function() {
    return typeof rebuildSettlementIndexes === "function" ? rebuildSettlementIndexes() : null;
  }
};

PS.systems.spatial = PS.spatial;

