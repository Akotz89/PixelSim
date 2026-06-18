PS.assets.registerJSON("data/entities.json", {
  "version": 1,
  "organisms": {
    "herbivore_basic": {
      "name": "Basic Herbivore",
      "spriteSheet": "creatures/herbivore",
      "animations": { "idle": "idle", "walk": "walk", "eat": "eat" },
      "traitDefaults": { "vision": 12, "metabolism": 1, "bodySize": 0.5, "movementTendency": 0.08, "terrainAffinity": 0.8, "carnivory": 0 },
      "traitRanges": { "vision": [4, 24], "metabolism": [0.1, 1.0], "bodySize": [0.3, 1.2] },
      "diet": "herbivore",
      "spawnBiomes": ["temperate", "tropical", "wetland", "forest"],
      "baseEnergy": 180,
      "maxAge": 500
    },
    "predator_basic": {
      "name": "Basic Predator",
      "spriteSheet": "creatures/predator",
      "animations": { "idle": "idle", "walk": "stalk", "eat": "feed" },
      "traitDefaults": { "vision": 18, "metabolism": 2, "bodySize": 0.7, "movementTendency": 0.12, "terrainAffinity": 0.6, "carnivory": 0.9 },
      "traitRanges": { "vision": [8, 30], "metabolism": [0.3, 1.4], "bodySize": [0.5, 1.5] },
      "diet": "carnivore",
      "spawnBiomes": ["temperate", "highland", "forest"],
      "baseEnergy": 220,
      "maxAge": 420
    },
    "fish_basic": {
      "name": "Basic Fish",
      "spriteSheet": "creatures/fish",
      "animations": { "idle": "swim_idle", "walk": "swim", "eat": "feed" },
      "traitDefaults": { "vision": 10, "metabolism": 1, "bodySize": 0.35, "movementTendency": 0.14, "terrainAffinity": 0.1, "waterDependency": 1, "carnivory": 0.3 },
      "traitRanges": { "vision": [3, 18], "metabolism": [0.1, 0.8], "bodySize": [0.2, 0.8] },
      "diet": "omnivore",
      "spawnBiomes": ["ocean", "coastal", "wetland"],
      "baseEnergy": 120,
      "maxAge": 260
    }
  },
  "vegetation": {
    "tree_oak": { "name": "Oak Tree", "spriteSheet": "vegetation/trees", "spawnBiomes": ["temperate", "forest"], "growthRate": 0.01, "maxSize": 3, "foodValue": 15 },
    "tree_pine": { "name": "Pine Tree", "spriteSheet": "vegetation/trees", "spawnBiomes": ["tundra", "highland", "forest"], "growthRate": 0.008, "maxSize": 3, "foodValue": 10 },
    "bush_berry": { "name": "Berry Bush", "spriteSheet": "vegetation/bushes", "spawnBiomes": ["temperate", "tropical", "forest"], "growthRate": 0.05, "maxSize": 1, "foodValue": 5 },
    "reed_marsh": { "name": "Marsh Reed", "spriteSheet": "vegetation/reeds", "spawnBiomes": ["wetland", "coastal"], "growthRate": 0.04, "maxSize": 1, "foodValue": 3 }
  },
  "structures": {
    "settlement_hut": { "name": "Hut", "spriteSheet": "buildings/huts", "spawnBiomes": ["temperate", "coastal", "forest"], "level": 1, "population_cap": 5 },
    "settlement_granary": { "name": "Granary", "spriteSheet": "buildings/granary", "spawnBiomes": ["temperate", "tropical", "coastal"], "level": 2, "storage_cap": 120 }
  }
});
