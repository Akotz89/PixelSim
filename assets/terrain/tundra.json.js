PS.assets.registerJSON("assets/terrain/tundra.json", {
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
    "terrain.tundra.0",
    "terrain.tundra.1",
    "terrain.tundra.2",
    "terrain.tundra.3",
    "terrain.tundra.4",
    "terrain.tundra.5",
    "terrain.tundra.6",
    "terrain.tundra.7"
  ],
  "authored": true,
  "sourceIssue": "AZR-511",
  "sourceKind": "accepted-runtime-art",
  "fallback": "Regenerate with scripts/build-terrain-biomes.js if an accepted PNG is missing.",
  "variantRoles": [
    {
      "id": "terrain.tundra.0",
      "role": "snow-1"
    },
    {
      "id": "terrain.tundra.1",
      "role": "frozen-soil-1"
    },
    {
      "id": "terrain.tundra.2",
      "role": "cracked-ice-1"
    },
    {
      "id": "terrain.tundra.3",
      "role": "winter-1"
    },
    {
      "id": "terrain.tundra.4",
      "role": "snow-2"
    },
    {
      "id": "terrain.tundra.5",
      "role": "frozen-soil-2"
    },
    {
      "id": "terrain.tundra.6",
      "role": "cracked-ice-2"
    },
    {
      "id": "terrain.tundra.7",
      "role": "winter-2"
    }
  ]
});
