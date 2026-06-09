"use strict";
PS.systems = PS.systems || {};

function assertPoolManager(condition, message) {
  if (PS.assert && typeof PS.assert === "function") {
    PS.assert(condition, message);
    return;
  }

  if (!condition) {
    throw new Error(message);
  }
}

PS.poolManager = PS.poolManager || {
  pools: {},
  memoryBudgetMb: 96,
  warningThreshold: 0.85,
  hasWarnedBudget: false,

  configure: function(config) {
    config = config || {};
    this.memoryBudgetMb = Math.max(1, Number(config.memoryBudgetMb) || Number(CONFIG.MEMORY_BUDGET_MB) || 96);
    return this;
  },

  create: function(name, maxSize, factory, options) {
    var poolName = String(name || "").trim();
    var capacity = Math.max(1, Math.round(Number(maxSize) || 1));
    var items = [];
    var freeList = [];
    var active = [];

    assertPoolManager(poolName.length > 0, "Pool name is required");
    assertPoolManager(typeof factory === "function", "Pool factory is required for " + poolName);

    for (var i = 0; i < capacity; i++) {
      items.push(factory(i));
      freeList.push(capacity - i - 1);
      active.push(false);
    }

    return this.register(poolName, {
      capacity: capacity,
      items: items,
      freeList: freeList,
      freeTop: capacity,
      activeCount: 0,
      acquire: function() {
        if (this.freeTop <= 0) {
          return null;
        }

        var index = this.freeList[--this.freeTop];
        active[index] = true;
        this.activeCount++;
        return this.items[index];
      },
      release: function(item) {
        var index = this.items.indexOf(item);

        if (index < 0 || !active[index]) {
          return false;
        }

        active[index] = false;
        this.freeList[this.freeTop++] = index;
        this.activeCount--;
        return true;
      },
      reset: function() {
        for (var i = 0; i < active.length; i++) {
          active[i] = false;
          this.freeList[i] = capacity - i - 1;
        }

        this.freeTop = capacity;
        this.activeCount = 0;
      }
    }, options || {});
  },

  register: function(name, pool, options) {
    var poolName = String(name || "").trim();
    var manager = this;
    var rawAcquire;
    var rawRelease;
    var rawReset;

    assertPoolManager(poolName.length > 0, "Pool name is required");
    assertPoolManager(pool && typeof pool.acquire === "function", "Pool acquire is required for " + poolName);
    assertPoolManager(typeof pool.release === "function", "Pool release is required for " + poolName);

    options = options || {};
    rawAcquire = pool._poolManagerAcquireRaw || pool.acquire.bind(pool);
    rawRelease = pool._poolManagerReleaseRaw || pool.release.bind(pool);
    rawReset = pool._poolManagerResetRaw || (typeof pool.reset === "function" ? pool.reset.bind(pool) : null);

    pool._poolManagerName = poolName;
    pool._poolManagerAcquireRaw = rawAcquire;
    pool._poolManagerReleaseRaw = rawRelease;
    pool._poolManagerResetRaw = rawReset;
    pool.acquire = function() {
      return manager.acquire(poolName);
    };
    pool.release = function(item) {
      return manager.release(poolName, item);
    };
    pool.reset = function() {
      return manager.reset(poolName);
    };

    this.pools[poolName] = {
      name: poolName,
      pool: pool,
      bytesPerItem: Math.max(0, Math.round(Number(options.bytesPerItem) || 0)),
      estimateMemoryBytes: typeof options.estimateMemoryBytes === "function" ? options.estimateMemoryBytes : null
    };

    this.checkMemoryBudget();
    return pool;
  },

  acquire: function(name) {
    var record = this.getRecord(name);
    var stats = this.getPoolStats(record);
    var item;

    if (stats.used >= stats.total) {
      this.throwOverflow(record, stats);
    }

    item = record.pool._poolManagerAcquireRaw();

    if (!item) {
      this.throwOverflow(record, this.getPoolStats(record));
    }

    return item;
  },

  release: function(name, item) {
    var record = this.getRecord(name);
    return record.pool._poolManagerReleaseRaw(item);
  },

  reset: function(name) {
    var record = this.getRecord(name);

    if (record.pool._poolManagerResetRaw) {
      record.pool._poolManagerResetRaw();
    }

    this.checkMemoryBudget();
    return record.pool;
  },

  getRecord: function(name) {
    var poolName = String(name || "").trim();
    var record = this.pools[poolName];

    assertPoolManager(record, "Pool is not registered: " + poolName);
    return record;
  },

  getPoolStats: function(record) {
    var pool = record.pool;
    var total = Math.max(0, Math.round(Number(pool.capacity || pool.total || 0)));
    var used = Math.max(0, Math.round(Number(pool.activeCount || pool.used || 0)));
    var free = Math.max(0, Number.isFinite(Number(pool.freeTop)) ? Math.round(Number(pool.freeTop)) : total - used);
    var memoryBytes = record.estimateMemoryBytes
      ? Math.max(0, Math.round(Number(record.estimateMemoryBytes(pool)) || 0))
      : total * record.bytesPerItem;

    return {
      total: total,
      used: used,
      free: free,
      utilization: total > 0 ? used / total : 0,
      memoryBytes: memoryBytes,
      memoryMb: memoryBytes / 1048576
    };
  },

  getStats: function() {
    var names = Object.keys(this.pools);
    var stats = {};
    var totalBytes = 0;

    for (var i = 0; i < names.length; i++) {
      var poolStats = this.getPoolStats(this.pools[names[i]]);
      stats[names[i]] = poolStats;
      totalBytes += poolStats.memoryBytes;
    }

    stats.memory = {
      totalBytes: totalBytes,
      totalMb: totalBytes / 1048576,
      budgetMb: this.memoryBudgetMb,
      utilization: this.memoryBudgetMb > 0 ? (totalBytes / 1048576) / this.memoryBudgetMb : 0,
      warning: this.memoryBudgetMb > 0 && (totalBytes / 1048576) >= this.memoryBudgetMb * this.warningThreshold
    };

    return stats;
  },

  checkMemoryBudget: function() {
    var memory = this.getStats().memory;

    if (memory.warning && !this.hasWarnedBudget) {
      this.hasWarnedBudget = true;

      if (PS.log && typeof PS.log.warn === "function") {
        PS.log.warn("pool.memory.warning", {
          estimatedMb: Number(memory.totalMb.toFixed(2)),
          budgetMb: memory.budgetMb
        });
      }
    }

    return memory;
  },

  throwOverflow: function(record, stats) {
    assertPoolManager(false, "Pool overflow: " + record.name + " used " + stats.used + "/" + stats.total);
  }
};

PS.systems.poolManager = PS.poolManager;
