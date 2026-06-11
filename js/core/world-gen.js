"use strict";
PS.core = PS.core || {};
PS.core.worldGen = PS.core.worldGen || {};

PS.core.worldGen.stageOrder = [
  "reset",
  "terrain",
  "biomes",
  "hydrology",
  "vegetation",
  "organisms",
  "finalize"
];

PS.core.worldGen.createContext = function(seed, config, options) {
  var normalizedSeed = String(seed || (config && config.DEFAULT_SEED) || "PIXEL-2026");

  return {
    seed: normalizedSeed,
    config: config || CONFIG,
    options: options || {},
    prng: PS.core.createPRNG(normalizedSeed),
    stages: [],
    metrics: {},
    readiness: "requested"
  };
};

PS.core.worldGen.beginStage = function(context, name) {
  var stage = {
    name: name,
    readiness: "pending",
    startedAt: performance.now(),
    completedAt: 0,
    elapsedMs: 0
  };

  context.stages.push(stage);
  world.generationStatus = "pending";
  world.generationStage = name;
  world.generationReadiness = context.stages;

  if (context.prng && name !== "reset" && name !== "finalize") {
    world.prng = context.prng.fork(name);
    if (world.prng && typeof world.prng.getState32 === "function") {
      world.rngState = world.prng.getState32();
    }
  }

  return stage;
};

PS.core.worldGen.completeStage = function(context, stage, metrics) {
  stage.completedAt = performance.now();
  stage.elapsedMs = stage.completedAt - stage.startedAt;
  stage.readiness = "ready";
  stage.metrics = metrics || {};
  context.metrics[stage.name] = stage.metrics;
  return stage;
};

PS.core.worldGen.runStage = function(context, name, fn) {
  var stage = PS.core.worldGen.beginStage(context, name);
  var metrics = fn(context) || {};
  return PS.core.worldGen.completeStage(context, stage, metrics);
};

PS.core.worldGen.resetWorld = function(context) {
  world.seedText = context.seed;
  clearWorld();
  return {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    seed: world.seedText
  };
};

PS.core.worldGen.generateTerrain = function() {
  seedTerrain();
  return {
    tiles: Array.isArray(world.terrain) ? world.terrain.length : 0,
    planetTiles: Array.isArray(world.planetTiles) ? world.planetTiles.length : 0,
    fertileTiles: Number(world.fertileTiles) || 0
  };
};

PS.core.worldGen.assignBiomes = function() {
  return {
    distribution: PS.core.worldGen.getBiomeDistribution(world)
  };
};

PS.core.worldGen.generateHydrology = function() {
  var waterTiles = 0;
  var riverTiles = 0;

  if (Array.isArray(world.planetTiles)) {
    for (var i = 0; i < world.planetTiles.length; i++) {
      var tile = world.planetTiles[i];

      if (tile && tile.biome === "ocean") {
        waterTiles++;
      }

      if (tile && Number(tile.riverStrength) > 0) {
        riverTiles++;
      }
    }
  }

  return {
    waterTiles: waterTiles,
    riverTiles: riverTiles
  };
};

PS.core.worldGen.placeVegetation = function(context) {
  var count = Math.max(0, Math.round(Number(context.config.STARTING_FOOD) || 0));
  var vegetation = null;

  for (var i = 0; i < count; i++) {
    var position = randomFoodPosition();
    addFoodAt(position.x, position.y);
  }

  if (PS.vegetation && typeof PS.vegetation.populateFromTerrain === "function") {
    if (PS.ranmap && typeof PS.ranmap.init === "function") {
      PS.ranmap.init(WORLD_WIDTH, WORLD_HEIGHT, world.rngState || 0x9E3779B9);
    }

    vegetation = PS.vegetation.populateFromTerrain(world.planetTiles, WORLD_WIDTH, WORLD_HEIGHT);
    world.vegetation = PS.vegetation.data;
    world.vegetationGrass = PS.vegetation.grassDensityData;
  }

  return {
    food: Array.isArray(world.food) ? world.food.length : 0,
    vegetation: vegetation
  };
};

PS.core.worldGen.spawnOrganisms = function(context) {
  var count = Math.max(0, Math.round(Number(context.config.STARTING_ORGANISMS) || 0));
  var centerX = Math.floor(WORLD_WIDTH / 2);
  var centerY = Math.floor(WORLD_HEIGHT / 2);

  for (var i = 0; i < count; i++) {
    world.organisms.push(makeOrganism(
      centerX + randomInt(41) - 20,
      centerY + randomInt(41) - 20
    ));
  }

  if (typeof refreshLineageRegistry === "function") {
    refreshLineageRegistry();
  }

  return {
    organisms: Array.isArray(world.organisms) ? world.organisms.length : 0
  };
};

PS.core.worldGen.finalize = function(context) {
  world.prng = context.prng.fork("runtime");
  if (world.prng && typeof world.prng.getState32 === "function") {
    world.rngState = world.prng.getState32();
  }

  world.generationSnapshot = PS.core.worldGen.createGoldenSnapshot(world);
  world.generationStatus = "promoted";
  world.generationStage = "complete";
  context.readiness = "promoted";

  return {
    snapshot: world.generationSnapshot
  };
};

PS.core.worldGen.generateWorld = function(seed, config, options) {
  var context = PS.core.worldGen.createContext(seed, config, options);

  world.generationStatus = "requested";
  PS.core.worldGen.runStage(context, "reset", PS.core.worldGen.resetWorld);
  PS.core.worldGen.runStage(context, "terrain", PS.core.worldGen.generateTerrain);
  PS.core.worldGen.runStage(context, "biomes", PS.core.worldGen.assignBiomes);
  PS.core.worldGen.runStage(context, "hydrology", PS.core.worldGen.generateHydrology);
  PS.core.worldGen.runStage(context, "vegetation", PS.core.worldGen.placeVegetation);
  PS.core.worldGen.runStage(context, "organisms", PS.core.worldGen.spawnOrganisms);
  PS.core.worldGen.runStage(context, "finalize", PS.core.worldGen.finalize);

  world.generationStages = context.stages;
  return world;
};

PS.core.worldGen.getBiomeDistribution = function(sourceWorld) {
  var distribution = {};
  var tiles = sourceWorld && Array.isArray(sourceWorld.planetTiles) ? sourceWorld.planetTiles : [];

  for (var i = 0; i < tiles.length; i++) {
    var biome = tiles[i] && tiles[i].biome ? String(tiles[i].biome) : "unknown";
    distribution[biome] = (distribution[biome] || 0) + 1;
  }

  return distribution;
};

PS.core.worldGen.hashValue = function(hash, value) {
  var text = String(value);

  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash >>> 0;
};

PS.core.worldGen.createGoldenSnapshot = function(sourceWorld) {
  var terrain = sourceWorld && Array.isArray(sourceWorld.terrain) ? sourceWorld.terrain : [];
  var tiles = sourceWorld && Array.isArray(sourceWorld.planetTiles) ? sourceWorld.planetTiles : [];
  var organisms = sourceWorld && Array.isArray(sourceWorld.organisms) ? sourceWorld.organisms : [];
  var food = sourceWorld && Array.isArray(sourceWorld.food) ? sourceWorld.food : [];
  var hash = 2166136261;

  hash = PS.core.worldGen.hashValue(hash, sourceWorld && sourceWorld.seedText);
  hash = PS.core.worldGen.hashValue(hash, WORLD_WIDTH + "x" + WORLD_HEIGHT);

  for (var i = 0; i < terrain.length; i++) {
    hash = PS.core.worldGen.hashValue(hash, terrain[i]);
  }

  for (var tileIndex = 0; tileIndex < tiles.length; tileIndex++) {
    var tile = tiles[tileIndex] || {};
    hash = PS.core.worldGen.hashValue(hash, [
      tile.biome,
      Math.round((Number(tile.elevation) || 0) * 1000),
      Math.round((Number(tile.moisture) || 0) * 1000)
    ].join(":"));
  }

  for (var organismIndex = 0; organismIndex < organisms.length; organismIndex++) {
    var organism = organisms[organismIndex] || {};
    hash = PS.core.worldGen.hashValue(hash, [
      organism.x,
      organism.y,
      organism.lineageId,
      organism.speciesId,
      organism.typeId || organism.entityType || ""
    ].join(":"));
  }

  for (var foodIndex = 0; foodIndex < food.length; foodIndex++) {
    var item = food[foodIndex] || {};
    hash = PS.core.worldGen.hashValue(hash, item.x + ":" + item.y);
  }

  return {
    seed: sourceWorld && sourceWorld.seedText ? sourceWorld.seedText : "",
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    terrainDigest: ("00000000" + (hash >>> 0).toString(16)).slice(-8),
    organismCount: organisms.length,
    foodCount: food.length,
    biomeDistribution: PS.core.worldGen.getBiomeDistribution(sourceWorld)
  };
};
