PS.assets.registerJSON("assets/terrain/dirt.json", {
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
    "terrain.dirt.0",
    "terrain.dirt.1",
    "terrain.dirt.2",
    "terrain.dirt.3",
    "terrain.dirt.4",
    "terrain.dirt.5",
    "terrain.dirt.6",
    "terrain.dirt.7"
  ],
  "authored": true,
  "sourceIssue": "AZR-511",
  "sourceKind": "accepted-runtime-art",
  "fallback": "Regenerate with scripts/build-terrain-biomes.js if an accepted PNG is missing.",
  "variantRoles": [
    {
      "id": "terrain.dirt.0",
      "role": "dark-soil-1"
    },
    {
      "id": "terrain.dirt.1",
      "role": "dark-soil-2"
    },
    {
      "id": "terrain.dirt.2",
      "role": "roots-1"
    },
    {
      "id": "terrain.dirt.3",
      "role": "roots-2"
    },
    {
      "id": "terrain.dirt.4",
      "role": "leaf-litter-1"
    },
    {
      "id": "terrain.dirt.5",
      "role": "leaf-litter-2"
    },
    {
      "id": "terrain.dirt.6",
      "role": "dry-soil-1"
    },
    {
      "id": "terrain.dirt.7",
      "role": "dry-soil-2"
    }
  ]
});
