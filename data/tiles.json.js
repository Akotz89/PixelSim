PS.assets.registerJSON("data/tiles.json", {
  "version": 1,
  "tiles": [
    {
      "id": "grass_lush",
      "name": "Lush Grass",
      "category": "terrain",
      "biome": "temperate",
      "spriteSheet": "terrain/grass",
      "variants": 4,
      "walkable": true,
      "buildable": true,
      "growable": true,
      "waterDepth": 0,
      "elevation": {
        "min": 0.1,
        "max": 0.8
      },
      "baseFertility": 0.85,
      "baseColor": "#4a8c2a",
      "minimapColor": "#3a7a1a",
      "transitionPriority": 5,
      "sounds": {
        "walk": "step_grass"
      }
    },
    {
      "id": "grass_dry",
      "name": "Dry Grass",
      "category": "terrain",
      "biome": "grassland",
      "spriteSheet": "terrain/grass",
      "variants": 4,
      "walkable": true,
      "buildable": true,
      "growable": true,
      "waterDepth": 0,
      "elevation": {
        "min": 0.05,
        "max": 0.65
      },
      "baseFertility": 0.48,
      "baseColor": "#7ab648",
      "minimapColor": "#6b8f34",
      "transitionPriority": 4,
      "sounds": {
        "walk": "step_grass_dry"
      }
    },
    {
      "id": "grass_dead",
      "name": "Dead Grass",
      "category": "terrain",
      "biome": "barren",
      "spriteSheet": "terrain/grass",
      "variants": 3,
      "walkable": true,
      "buildable": true,
      "growable": false,
      "waterDepth": 0,
      "elevation": {
        "min": 0,
        "max": 0.7
      },
      "baseFertility": 0.16,
      "baseColor": "#8b7355",
      "minimapColor": "#6a6040",
      "transitionPriority": 3,
      "sounds": {
        "walk": "step_dry"
      }
    },
    {
      "id": "dirt",
      "name": "Dirt",
      "category": "terrain",
      "biome": "temperate",
      "spriteSheet": "terrain/desert",
      "variants": 4,
      "walkable": true,
      "buildable": true,
      "growable": true,
      "waterDepth": 0,
      "elevation": {
        "min": -0.05,
        "max": 0.75
      },
      "baseFertility": 0.55,
      "baseColor": "#8b7355",
      "minimapColor": "#7a6549",
      "transitionPriority": 4,
      "sounds": {
        "walk": "step_dirt"
      }
    },
    {
      "id": "mud",
      "name": "Mud",
      "category": "terrain",
      "biome": "wetland",
      "spriteSheet": "terrain/wetland",
      "variants": 4,
      "walkable": true,
      "buildable": false,
      "growable": true,
      "waterDepth": 0.15,
      "elevation": {
        "min": -0.15,
        "max": 0.3
      },
      "baseFertility": 0.72,
      "baseColor": "#5c3a1a",
      "minimapColor": "#4b3825",
      "transitionPriority": 6,
      "sounds": {
        "walk": "step_mud"
      }
    },
    {
      "id": "rock",
      "name": "Rock",
      "category": "terrain",
      "biome": "mountain",
      "spriteSheet": "terrain/mountain",
      "variants": 4,
      "walkable": true,
      "buildable": false,
      "growable": false,
      "waterDepth": 0,
      "elevation": {
        "min": 0.45,
        "max": 1
      },
      "baseFertility": 0.08,
      "baseColor": "#6b6b8a",
      "minimapColor": "#5e6370",
      "transitionPriority": 8,
      "sounds": {
        "walk": "step_stone"
      }
    },
    {
      "id": "rock_cliff",
      "name": "Cliff Rock",
      "category": "terrain",
      "biome": "mountain",
      "spriteSheet": "terrain/mountain",
      "variants": 3,
      "walkable": false,
      "buildable": false,
      "growable": false,
      "waterDepth": 0,
      "elevation": {
        "min": 0.75,
        "max": 1
      },
      "baseFertility": 0.02,
      "baseColor": "#4a4a68",
      "minimapColor": "#454b54",
      "transitionPriority": 9,
      "sounds": {
        "walk": "step_stone"
      }
    },
    {
      "id": "rock_mossy",
      "name": "Mossy Rock",
      "category": "terrain",
      "biome": "forest",
      "spriteSheet": "terrain/forest",
      "variants": 4,
      "walkable": true,
      "buildable": false,
      "growable": true,
      "waterDepth": 0,
      "elevation": {
        "min": 0.35,
        "max": 0.9
      },
      "baseFertility": 0.38,
      "baseColor": "#2d5a1e",
      "minimapColor": "#314f2b",
      "transitionPriority": 7,
      "sounds": {
        "walk": "step_moss"
      }
    },
    {
      "id": "sand",
      "name": "Sand",
      "category": "terrain",
      "biome": "desert",
      "spriteSheet": "terrain/desert",
      "variants": 4,
      "walkable": true,
      "buildable": true,
      "growable": false,
      "waterDepth": 0,
      "elevation": {
        "min": -0.05,
        "max": 0.55
      },
      "baseFertility": 0.04,
      "baseColor": "#b8976a",
      "minimapColor": "#a58757",
      "transitionPriority": 3,
      "sounds": {
        "walk": "step_sand"
      }
    },
    {
      "id": "sand_dune",
      "name": "Sand Dune",
      "category": "terrain",
      "biome": "desert",
      "spriteSheet": "terrain/desert",
      "variants": 4,
      "walkable": true,
      "buildable": false,
      "growable": false,
      "waterDepth": 0,
      "elevation": {
        "min": 0.1,
        "max": 0.7
      },
      "baseFertility": 0.01,
      "baseColor": "#d4be8c",
      "minimapColor": "#c9ad72",
      "transitionPriority": 4,
      "sounds": {
        "walk": "step_sand"
      }
    },
    {
      "id": "snow",
      "name": "Snow",
      "category": "terrain",
      "biome": "tundra",
      "spriteSheet": "terrain/tundra",
      "variants": 4,
      "walkable": true,
      "buildable": false,
      "growable": false,
      "waterDepth": 0,
      "elevation": {
        "min": 0.15,
        "max": 1
      },
      "baseFertility": 0.03,
      "baseColor": "#e8e8e8",
      "minimapColor": "#c8d4d8",
      "transitionPriority": 6,
      "sounds": {
        "walk": "step_snow"
      }
    },
    {
      "id": "ice",
      "name": "Ice",
      "category": "terrain",
      "biome": "ice",
      "spriteSheet": "terrain/tundra",
      "variants": 3,
      "walkable": true,
      "buildable": false,
      "growable": false,
      "waterDepth": 0,
      "elevation": {
        "min": -0.4,
        "max": 0.95
      },
      "baseFertility": 0,
      "baseColor": "#5a9bb8",
      "minimapColor": "#a8d4e8",
      "transitionPriority": 7,
      "sounds": {
        "walk": "step_ice"
      }
    },
    {
      "id": "water_shallow",
      "name": "Shallow Water",
      "category": "terrain",
      "biome": "ocean",
      "spriteSheet": "terrain/water",
      "variants": 4,
      "walkable": false,
      "buildable": false,
      "growable": false,
      "waterDepth": 0.45,
      "elevation": {
        "min": -0.55,
        "max": 0.05
      },
      "baseFertility": 0.22,
      "baseColor": "#3a6b8c",
      "minimapColor": "#1c5f7c",
      "transitionPriority": 10,
      "sounds": {
        "walk": "wade_water"
      }
    },
    {
      "id": "water_deep",
      "name": "Deep Water",
      "category": "terrain",
      "biome": "ocean",
      "spriteSheet": "terrain/ocean",
      "variants": 4,
      "walkable": false,
      "buildable": false,
      "growable": false,
      "waterDepth": 1,
      "elevation": {
        "min": -1,
        "max": -0.25
      },
      "baseFertility": 0.08,
      "baseColor": "#1a3a5c",
      "minimapColor": "#06172b",
      "transitionPriority": 11,
      "sounds": {
        "walk": "deep_water"
      }
    },
    {
      "id": "wetland",
      "name": "Wetland",
      "category": "terrain",
      "biome": "wetland",
      "spriteSheet": "terrain/wetland",
      "variants": 4,
      "walkable": true,
      "buildable": false,
      "growable": true,
      "waterDepth": 0.2,
      "elevation": {
        "min": -0.2,
        "max": 0.25
      },
      "baseFertility": 0.9,
      "baseColor": "#2d5a1e",
      "minimapColor": "#1d4f43",
      "transitionPriority": 7,
      "sounds": {
        "walk": "step_wetland"
      }
    },
    {
      "id": "marsh",
      "name": "Marsh",
      "category": "terrain",
      "biome": "wetland",
      "spriteSheet": "terrain/wetland",
      "variants": 4,
      "walkable": true,
      "buildable": false,
      "growable": true,
      "waterDepth": 0.3,
      "elevation": {
        "min": -0.3,
        "max": 0.15
      },
      "baseFertility": 0.82,
      "baseColor": "#4a8c2a",
      "minimapColor": "#2e6042",
      "transitionPriority": 8,
      "sounds": {
        "walk": "step_marsh"
      }
    },
    {
      "id": "reed_mat",
      "name": "Reed Mat",
      "category": "terrain",
      "biome": "wetland",
      "spriteSheet": "terrain/wetland",
      "variants": 4,
      "walkable": true,
      "buildable": false,
      "growable": true,
      "waterDepth": 0.28,
      "elevation": {
        "min": -0.25,
        "max": 0.2
      },
      "baseFertility": 0.88,
      "baseColor": "#386f45",
      "minimapColor": "#245b3e",
      "transitionPriority": 8,
      "sounds": {
        "walk": "step_reed"
      }
    },
    {
      "id": "forest_floor",
      "name": "Forest Floor",
      "category": "terrain",
      "biome": "forest",
      "spriteSheet": "terrain/forest",
      "variants": 4,
      "walkable": true,
      "buildable": true,
      "growable": true,
      "waterDepth": 0,
      "elevation": {
        "min": 0.05,
        "max": 0.75
      },
      "baseFertility": 0.78,
      "baseColor": "#2d5a1e",
      "minimapColor": "#123f23",
      "transitionPriority": 6,
      "sounds": {
        "walk": "step_forest"
      }
    },
    {
      "id": "river_shallow",
      "name": "Shallow River",
      "category": "terrain",
      "biome": "coastal",
      "spriteSheet": "terrain/water",
      "variants": 4,
      "walkable": false,
      "buildable": false,
      "growable": false,
      "waterDepth": 0.38,
      "elevation": {
        "min": -0.35,
        "max": 0.12
      },
      "baseFertility": 0.36,
      "baseColor": "#2f7892",
      "minimapColor": "#1e6680",
      "transitionPriority": 10,
      "sounds": {
        "walk": "wade_river"
      }
    },
    {
      "id": "tidal_mud",
      "name": "Tidal Mud",
      "category": "terrain",
      "biome": "coastal",
      "spriteSheet": "terrain/wetland",
      "variants": 4,
      "walkable": true,
      "buildable": false,
      "growable": true,
      "waterDepth": 0.18,
      "elevation": {
        "min": -0.22,
        "max": 0.16
      },
      "baseFertility": 0.54,
      "baseColor": "#6f6245",
      "minimapColor": "#5d533a",
      "transitionPriority": 7,
      "sounds": {
        "walk": "step_tidal_mud"
      }
    },
    {
      "id": "lichen_tundra",
      "name": "Lichen Tundra",
      "category": "terrain",
      "biome": "tundra",
      "spriteSheet": "terrain/tundra",
      "variants": 4,
      "walkable": true,
      "buildable": false,
      "growable": true,
      "waterDepth": 0,
      "elevation": {
        "min": 0.05,
        "max": 0.85
      },
      "baseFertility": 0.22,
      "baseColor": "#9fb08e",
      "minimapColor": "#839676",
      "transitionPriority": 5,
      "sounds": {
        "walk": "step_lichen"
      }
    },
    {
      "id": "volcanic",
      "name": "Volcanic Ground",
      "category": "terrain",
      "biome": "volcanic",
      "spriteSheet": "terrain/mountain",
      "variants": 4,
      "walkable": true,
      "buildable": false,
      "growable": false,
      "waterDepth": 0,
      "elevation": {
        "min": 0.25,
        "max": 1
      },
      "baseFertility": 0.01,
      "baseColor": "#2d2d44",
      "minimapColor": "#1a1a2e",
      "transitionPriority": 9,
      "sounds": {
        "walk": "step_ash"
      }
    },
    {
      "id": "lava_flow",
      "name": "Lava Flow",
      "category": "terrain",
      "biome": "volcanic",
      "spriteSheet": "terrain/mountain",
      "variants": 4,
      "walkable": false,
      "buildable": false,
      "growable": false,
      "waterDepth": 0,
      "elevation": {
        "min": 0.2,
        "max": 1
      },
      "baseFertility": 0,
      "baseColor": "#4b2431",
      "minimapColor": "#331726",
      "transitionPriority": 11,
      "sounds": {
        "walk": "step_lava"
      }
    }
  ]
});
