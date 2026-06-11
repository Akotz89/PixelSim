PS.assets.registerJSON("assets/terrain/wetland.json", {
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
    "terrain.wetland.0",
    "terrain.wetland.1",
    "terrain.wetland.2",
    "terrain.wetland.3",
    "terrain.wetland.4",
    "terrain.wetland.5",
    "terrain.wetland.6",
    "terrain.wetland.7"
  ],
  "authored": true,
  "sourceIssue": "AZR-511",
  "sourceKind": "accepted-runtime-art",
  "fallback": "Regenerate with scripts/build-terrain-biomes.js if an accepted PNG is missing.",
  "variantRoles": [
    {
      "id": "terrain.wetland.0",
      "role": "pool-1"
    },
    {
      "id": "terrain.wetland.1",
      "role": "reed-1"
    },
    {
      "id": "terrain.wetland.2",
      "role": "mud-1"
    },
    {
      "id": "terrain.wetland.3",
      "role": "marsh-1"
    },
    {
      "id": "terrain.wetland.4",
      "role": "pool-2"
    },
    {
      "id": "terrain.wetland.5",
      "role": "reed-2"
    },
    {
      "id": "terrain.wetland.6",
      "role": "mud-2"
    },
    {
      "id": "terrain.wetland.7",
      "role": "marsh-2"
    }
  ]
});
