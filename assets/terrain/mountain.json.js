PS.assets.registerJSON("assets/terrain/mountain.json", {
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
    "terrain.mountain.0",
    "terrain.mountain.1",
    "terrain.mountain.2",
    "terrain.mountain.3",
    "terrain.mountain.4",
    "terrain.mountain.5",
    "terrain.mountain.6",
    "terrain.mountain.7"
  ],
  "authored": true,
  "sourceIssue": "AZR-511",
  "sourceKind": "accepted-runtime-art",
  "fallback": "Regenerate with scripts/build-terrain-biomes.js if an accepted PNG is missing.",
  "variantRoles": [
    {
      "id": "terrain.mountain.0",
      "role": "bare-1"
    },
    {
      "id": "terrain.mountain.1",
      "role": "bare-2"
    },
    {
      "id": "terrain.mountain.2",
      "role": "bare-3"
    },
    {
      "id": "terrain.mountain.3",
      "role": "snow-1"
    },
    {
      "id": "terrain.mountain.4",
      "role": "snow-2"
    },
    {
      "id": "terrain.mountain.5",
      "role": "moss-1"
    },
    {
      "id": "terrain.mountain.6",
      "role": "scree-1"
    },
    {
      "id": "terrain.mountain.7",
      "role": "ledge-1"
    }
  ]
});
