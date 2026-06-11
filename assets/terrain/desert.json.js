PS.assets.registerJSON("assets/terrain/desert.json", {
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
    "terrain.desert.0",
    "terrain.desert.1",
    "terrain.desert.2",
    "terrain.desert.3",
    "terrain.desert.4",
    "terrain.desert.5",
    "terrain.desert.6",
    "terrain.desert.7"
  ],
  "authored": true,
  "sourceIssue": "AZR-511",
  "sourceKind": "accepted-runtime-art",
  "fallback": "Regenerate with scripts/build-terrain-biomes.js if an accepted PNG is missing.",
  "variantRoles": [
    {
      "id": "terrain.desert.0",
      "role": "dune-1"
    },
    {
      "id": "terrain.desert.1",
      "role": "dune-2"
    },
    {
      "id": "terrain.desert.2",
      "role": "pebble-1"
    },
    {
      "id": "terrain.desert.3",
      "role": "dry-veg-1"
    },
    {
      "id": "terrain.desert.4",
      "role": "dune-3"
    },
    {
      "id": "terrain.desert.5",
      "role": "dune-4"
    },
    {
      "id": "terrain.desert.6",
      "role": "pebble-2"
    },
    {
      "id": "terrain.desert.7",
      "role": "dry-veg-2"
    }
  ]
});
