PS.assets.registerJSON("assets/terrain/rock.json", {
  "type": "grid",
  "tileWidth": 32,
  "tileHeight": 32,
  "columns": 8,
  "splitAtlas": true,
  "albedoColumns": 8,
  "normalColumns": 8,
  "normalOffsetX": 256,
  "rows": 1,
  "names": [
    "terrain.rock.0",
    "terrain.rock.1",
    "terrain.rock.2",
    "terrain.rock.3",
    "terrain.rock.4",
    "terrain.rock.5",
    "terrain.rock.6",
    "terrain.rock.7"
  ],
  "authored": true,
  "sourceIssue": "AZR-511",
  "sourceKind": "accepted-runtime-art",
  "fallback": "Regenerate with scripts/build-terrain-biomes.js if an accepted PNG is missing.",
  "variantRoles": [
    {
      "id": "terrain.rock.0",
      "role": "bare-1"
    },
    {
      "id": "terrain.rock.1",
      "role": "bare-2"
    },
    {
      "id": "terrain.rock.2",
      "role": "bare-3"
    },
    {
      "id": "terrain.rock.3",
      "role": "snow-1"
    },
    {
      "id": "terrain.rock.4",
      "role": "snow-2"
    },
    {
      "id": "terrain.rock.5",
      "role": "moss-1"
    },
    {
      "id": "terrain.rock.6",
      "role": "scree-1"
    },
    {
      "id": "terrain.rock.7",
      "role": "ledge-1"
    }
  ]
});
