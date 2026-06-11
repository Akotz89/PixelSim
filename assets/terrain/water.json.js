PS.assets.registerJSON("assets/terrain/water.json", {
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
    "terrain.water.0",
    "terrain.water.1",
    "terrain.water.2",
    "terrain.water.3",
    "terrain.water.4",
    "terrain.water.5",
    "terrain.water.6",
    "terrain.water.7"
  ],
  "authored": true,
  "sourceIssue": "AZR-511",
  "sourceKind": "accepted-runtime-art",
  "fallback": "Regenerate with scripts/build-terrain-biomes.js if an accepted PNG is missing.",
  "variantRoles": [
    {
      "id": "terrain.water.0",
      "role": "deep-1"
    },
    {
      "id": "terrain.water.1",
      "role": "deep-2"
    },
    {
      "id": "terrain.water.2",
      "role": "shallow-1"
    },
    {
      "id": "terrain.water.3",
      "role": "shore-1"
    },
    {
      "id": "terrain.water.4",
      "role": "deep-3"
    },
    {
      "id": "terrain.water.5",
      "role": "deep-4"
    },
    {
      "id": "terrain.water.6",
      "role": "shallow-2"
    },
    {
      "id": "terrain.water.7",
      "role": "shore-2"
    }
  ]
});
