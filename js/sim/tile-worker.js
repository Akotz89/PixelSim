"use strict";
// ── Staggered Tile Worker (AZR-492) ────────────────────────────────
// Distributes tile-based work evenly across frames using a persistent
// cursor and pre-shuffled visitation order.
//
// Usage:
//   var worker = PS.tileWorker.create("foodGrowth", {
//     cycleFrames: 20,
//     callback: function (tileX, tileY, tileIndex) { ... }
//   });
//
//   // Each tick:
//   worker.advance();  // processes this frame's tile budget
//
// The entire map is processed once every `cycleFrames` frames.

PS.sim = PS.sim || {};

PS.tileWorker = {
  workers: {},

  // ── Create a tile worker ──

  create: function (id, options) {
    var opts = options || {};
    var width = Math.max(1, Math.round(Number(opts.width) || WORLD_WIDTH));
    var height = Math.max(1, Math.round(Number(opts.height) || WORLD_HEIGHT));
    var totalTiles = width * height;
    var cycleFrames = Math.max(1, Math.round(Number(opts.cycleFrames) || 20));
    var tilesPerFrame = Math.max(1, Math.ceil(totalTiles / cycleFrames));

    // Pre-shuffle tile visitation order using a Knuth multiplicative hash
    var visitOrder = PS.tileWorker.buildShuffledOrder(totalTiles, opts.seed || 0x5DEECE66D);

    var worker = {
      id: String(id),
      width: width,
      height: height,
      totalTiles: totalTiles,
      cycleFrames: cycleFrames,
      tilesPerFrame: tilesPerFrame,
      visitOrder: visitOrder,
      cursor: 0,
      cycleCount: 0,
      lastAdvanceTick: -1,
      callback: typeof opts.callback === "function" ? opts.callback : null,
      tilesProcessedThisFrame: 0,
      totalTilesProcessed: 0,

      advance: function () {
        if (!this.callback) { return 0; }

        // Prevent double-advance in same tick
        if (world && this.lastAdvanceTick === world.tick) { return 0; }
        if (world) { this.lastAdvanceTick = world.tick; }

        var processed = 0;
        var budget = this.tilesPerFrame;

        for (var i = 0; i < budget && this.cursor < this.totalTiles; i++) {
          var tileIndex = this.visitOrder[this.cursor];
          var tileX = tileIndex % this.width;
          var tileY = Math.floor(tileIndex / this.width);
          this.callback(tileX, tileY, tileIndex);
          this.cursor++;
          processed++;
        }

        this.tilesProcessedThisFrame = processed;
        this.totalTilesProcessed += processed;

        // Wrap around when full cycle is complete
        if (this.cursor >= this.totalTiles) {
          this.cursor = 0;
          this.cycleCount++;
        }

        return processed;
      },

      reset: function () {
        this.cursor = 0;
        this.cycleCount = 0;
        this.lastAdvanceTick = -1;
        this.tilesProcessedThisFrame = 0;
        this.totalTilesProcessed = 0;
      },

      getStats: function () {
        return {
          id: this.id,
          totalTiles: this.totalTiles,
          tilesPerFrame: this.tilesPerFrame,
          cycleFrames: this.cycleFrames,
          cursor: this.cursor,
          cycleCount: this.cycleCount,
          progress: this.totalTiles > 0
            ? (this.cursor / this.totalTiles * 100).toFixed(1) + "%"
            : "0%"
        };
      }
    };

    PS.tileWorker.workers[id] = worker;
    return worker;
  },

  // ── Build a shuffled visitation order ──
  // Uses a Knuth multiplicative hash permutation so tiles are visited
  // in pseudo-random order. This prevents spatial clustering of updates.

  buildShuffledOrder: function (totalTiles, seed) {
    var order = new Int32Array(totalTiles);

    // Initialize with sequential indices
    for (var i = 0; i < totalTiles; i++) {
      order[i] = i;
    }

    // Fisher-Yates shuffle with deterministic hash-based RNG
    var state = Math.abs(Math.round(Number(seed) || 1)) | 1;

    for (var j = totalTiles - 1; j > 0; j--) {
      // Simple xorshift32
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      var k = ((state >>> 0) % (j + 1));
      var tmp = order[j];
      order[j] = order[k];
      order[k] = tmp;
    }

    return order;
  },

  // ── Get a worker by id ──

  get: function (id) {
    return PS.tileWorker.workers[id] || null;
  },

  // ── Reset all workers ──

  resetAll: function () {
    for (var id in PS.tileWorker.workers) {
      if (Object.prototype.hasOwnProperty.call(PS.tileWorker.workers, id)) {
        PS.tileWorker.workers[id].reset();
      }
    }
  },

  // ── Get stats for all workers ──

  getStats: function () {
    var stats = {};

    for (var id in PS.tileWorker.workers) {
      if (Object.prototype.hasOwnProperty.call(PS.tileWorker.workers, id)) {
        stats[id] = PS.tileWorker.workers[id].getStats();
      }
    }

    return stats;
  }
};

PS.sim.tileWorker = PS.tileWorker;
