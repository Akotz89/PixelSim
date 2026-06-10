"use strict";
PS.systems = PS.systems || {};

function definePooledNumber(target, name, arrays, key, index) {
  Object.defineProperty(target, name, {
    enumerable: true,
    configurable: false,
    get: function() {
      return arrays[key][index];
    },
    set: function(value) {
      arrays[key][index] = Number(value) || 0;
    }
  });
}

function definePooledTrait(target, name, arrays, key, index) {
  Object.defineProperty(target, name, {
    enumerable: true,
    configurable: false,
    get: function() {
      return arrays[key][index];
    },
    set: function(value) {
      arrays[key][index] = Number(value) || 0;
    }
  });
}

function makeOrganismArrays(capacity) {
  return {
    active: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    prevX: new Float32Array(capacity),
    prevY: new Float32Array(capacity),
    latitude: new Float32Array(capacity),
    longitude: new Float32Array(capacity),
    prevLatitude: new Float32Array(capacity),
    prevLongitude: new Float32Array(capacity),
    energy: new Float32Array(capacity),
    age: new Float32Array(capacity),
    directionX: new Float32Array(capacity),
    directionY: new Float32Array(capacity),
    velocityX: new Float32Array(capacity),
    velocityY: new Float32Array(capacity),
    travelKm: new Float32Array(capacity),
    vision: new Float32Array(capacity),
    metabolism: new Float32Array(capacity),
    reproductionEnergy: new Float32Array(capacity),
    movementTendency: new Float32Array(capacity),
    terrainAffinity: new Float32Array(capacity),
    intelligence: new Float32Array(capacity),
    sociality: new Float32Array(capacity),
    carnivory: new Float32Array(capacity),
    bodySize: new Float32Array(capacity),
    limbCount: new Uint8Array(capacity),
    bodyShape: new Uint8Array(capacity),
    appendageType: new Uint8Array(capacity),
    camouflage: new Float32Array(capacity),
    thermalTolerance: new Float32Array(capacity),
    waterDependency: new Float32Array(capacity),
    lineageId: new Uint32Array(capacity),
    lineageParentId: new Uint32Array(capacity),
    generation: new Uint32Array(capacity),
    speciesId: new Uint32Array(capacity),
    populationId: new Uint32Array(capacity),
    representativeId: new Uint32Array(capacity),
    // Intrusive linked-list pointers for spatial tile grid (AZR-491)
    nextInTile: new Int32Array(capacity),
    prevInTile: new Int32Array(capacity)
  };

  // Initialize tile pointers to -1 (no link)
  arrays.nextInTile.fill(-1);
  arrays.prevInTile.fill(-1);

  return arrays;
}

function createOrganismFacade(index, arrays) {
  var traits = {};
  var organism = {
    poolIndex: index,
    traits: traits
  };
  var fields = [
    "x", "y", "prevX", "prevY", "latitude", "longitude", "prevLatitude", "prevLongitude",
    "energy", "age", "directionX", "directionY", "velocityX", "velocityY", "travelKm",
    "lineageId", "lineageParentId", "generation", "speciesId", "populationId", "representativeId"
  ];
  var traitFields = [
    "vision", "metabolism", "reproductionEnergy", "movementTendency", "terrainAffinity",
    "intelligence", "sociality", "carnivory",
    "bodySize", "limbCount", "bodyShape", "appendageType", "camouflage", "thermalTolerance", "waterDependency"
  ];

  for (var fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
    definePooledNumber(organism, fields[fieldIndex], arrays, fields[fieldIndex], index);
  }

  for (var traitIndex = 0; traitIndex < traitFields.length; traitIndex++) {
    definePooledTrait(traits, traitFields[traitIndex], arrays, traitFields[traitIndex], index);
  }

  Object.defineProperty(organism, "traits", {
    enumerable: true,
    configurable: false,
    get: function() {
      return traits;
    },
    set: function(values) {
      values = values || {};
      for (var traitIndex = 0; traitIndex < traitFields.length; traitIndex++) {
        var trait = traitFields[traitIndex];
        if (typeof values[trait] === "number") {
          arrays[trait][index] = values[trait];
        }
      }
    }
  });

  return organism;
}

function createFoodParticle(index) {
  return {
    poolIndex: index,
    active: false,
    x: 0,
    y: 0,
    latitude: 0,
    longitude: 0
  };
}

function createFreeList(capacity) {
  var freeList = new Int32Array(capacity);

  for (var i = 0; i < capacity; i++) {
    freeList[i] = capacity - i - 1;
  }

  return freeList;
}

function createOrganismPool(capacity) {
  var arrays = makeOrganismArrays(capacity);
  var facades = [];

  for (var i = 0; i < capacity; i++) {
    facades.push(createOrganismFacade(i, arrays));
  }

  return {
    capacity: capacity,
    arrays: arrays,
    facades: facades,
    freeList: createFreeList(capacity),
    freeTop: capacity,
    activeCount: 0,
    acquire: function() {
      if (this.freeTop <= 0) {
        return null;
      }

      var index = this.freeList[--this.freeTop];
      this.arrays.active[index] = 1;
      this.activeCount++;
      return this.facades[index];
    },
    release: function(organism) {
      var index = organism && Number.isFinite(Number(organism.poolIndex)) ? Math.round(organism.poolIndex) : -1;

      if (index < 0 || index >= this.capacity || !this.arrays.active[index]) {
        return false;
      }

      this.arrays.active[index] = 0;
      this.freeList[this.freeTop++] = index;
      this.activeCount--;
      return true;
    },
    reset: function() {
      this.arrays.active.fill(0);
      this.arrays.nextInTile.fill(-1);
      this.arrays.prevInTile.fill(-1);
      this.freeList = createFreeList(this.capacity);
      this.freeTop = this.capacity;
      this.activeCount = 0;
    }
  };
}

function estimateOrganismPoolBytes(pool) {
  var arrays = pool && pool.arrays ? pool.arrays : {};
  var keys = Object.keys(arrays);
  var bytes = 0;

  for (var i = 0; i < keys.length; i++) {
    bytes += Math.max(0, Number(arrays[keys[i]].byteLength) || 0);
  }

  bytes += Math.max(0, Number(pool && pool.freeList && pool.freeList.byteLength) || 0);
  bytes += Math.max(0, Number(pool && pool.facades && pool.facades.length) || 0) * 96;
  return bytes;
}

function createFoodPool(capacity) {
  var particles = [];
  var freeList = createFreeList(capacity);

  for (var i = 0; i < capacity; i++) {
    particles.push(createFoodParticle(i));
  }

  return {
    capacity: capacity,
    particles: particles,
    freeList: freeList,
    freeTop: capacity,
    activeCount: 0,
    acquire: function() {
      if (this.freeTop <= 0) {
        return null;
      }

      var particle = this.particles[this.freeList[--this.freeTop]];
      particle.active = true;
      this.activeCount++;
      return particle;
    },
    release: function(food) {
      var index = food && Number.isFinite(Number(food.poolIndex)) ? Math.round(food.poolIndex) : -1;

      if (index < 0 || index >= this.capacity || !this.particles[index].active) {
        return false;
      }

      this.particles[index].active = false;
      this.freeList[this.freeTop++] = index;
      this.activeCount--;
      return true;
    },
    reset: function() {
      for (var i = 0; i < this.particles.length; i++) {
        this.particles[i].active = false;
      }

      this.freeList = createFreeList(this.capacity);
      this.freeTop = this.capacity;
      this.activeCount = 0;
    }
  };
}

PS.pools = {
  organism: null,
  food: null,
  ensure: function() {
    var poolConfig = PS.config && PS.config.pools ? PS.config.pools : {};
    var organismCapacity = Math.max(1, Math.round(Number(poolConfig.maxOrganisms) || 20000));
    var foodCapacity = Math.max(1, Math.round(Number(poolConfig.maxFoodParticles) || CONFIG.MAX_FOOD || 1));

    if (!this.organism || this.organism.capacity !== organismCapacity) {
      this.organism = PS.poolManager.register("organisms", createOrganismPool(organismCapacity), {
        estimateMemoryBytes: estimateOrganismPoolBytes
      });
    }

    if (!this.food || this.food.capacity !== foodCapacity) {
      this.food = PS.poolManager.register("food", createFoodPool(foodCapacity), {
        bytesPerItem: 40
      });
    }

    return this;
  },
  reset: function() {
    this.ensure();
    this.organism.reset();
    this.food.reset();
  },
  getStats: function() {
    this.ensure();
    var managerStats = PS.poolManager.getStats();

    return {
      organismCapacity: this.organism.capacity,
      activeOrganisms: this.organism.activeCount,
      freeOrganisms: this.organism.freeTop,
      organismArrayCount: Object.keys(this.organism.arrays).length,
      foodCapacity: this.food.capacity,
      activeFood: this.food.activeCount,
      freeFood: this.food.freeTop,
      memoryBudgetMb: PS.config.pools.memoryBudgetMb,
      pools: managerStats,
      memory: managerStats.memory
    };
  }
};

PS.systems.pools = PS.pools;
