PS.assets.registerJSON("assets/terrain/stone.json", {
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
    "terrain.stone.0",
    "terrain.stone.1",
    "terrain.stone.2",
    "terrain.stone.3",
    "terrain.stone.4",
    "terrain.stone.5",
    "terrain.stone.6",
    "terrain.stone.7"
  ],
  "authored": true,
  "sourceIssue": "AZR-511",
  "sourceKind": "accepted-runtime-art",
  "fallback": "Regenerate with scripts/build-terrain-biomes.js if an accepted PNG is missing.",
  "variantRoles": [
    {
      "id": "terrain.stone.0",
      "role": "bare-1"
    },
    {
      "id": "terrain.stone.1",
      "role": "bare-2"
    },
    {
      "id": "terrain.stone.2",
      "role": "bare-3"
    },
    {
      "id": "terrain.stone.3",
      "role": "snow-1"
    },
    {
      "id": "terrain.stone.4",
      "role": "snow-2"
    },
    {
      "id": "terrain.stone.5",
      "role": "moss-1"
    },
    {
      "id": "terrain.stone.6",
      "role": "scree-1"
    },
    {
      "id": "terrain.stone.7",
      "role": "ledge-1"
    }
  ]
});
