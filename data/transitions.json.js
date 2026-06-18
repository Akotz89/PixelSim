PS.assets.registerJSON("data/transitions.json", {
  "version": 1,
  "layout": {
    "columns": 4,
    "rows": 4,
    "canonicalJoinPatternCount": 46,
    "sprites": [
      "edge_n", "edge_e", "edge_s", "edge_w",
      "corner_ne", "corner_se", "corner_sw", "corner_nw",
      "inner_ne", "inner_se", "inner_sw", "inner_nw",
      "thin_n", "thin_e", "thin_s", "thin_w"
    ]
  },
  "pairs": [
    { "from": "grass_lush", "to": "sand", "sheet": "transitions/grass_sand", "priority": [5, 3] },
    { "from": "grass_lush", "to": "water_shallow", "sheet": "transitions/grass_water", "priority": [5, 10] },
    { "from": "grass_lush", "to": "rock", "sheet": "transitions/grass_rock", "priority": [5, 8] },
    { "from": "sand", "to": "water_shallow", "sheet": "transitions/sand_water", "priority": [3, 10] },
    { "from": "snow", "to": "rock", "sheet": "transitions/snow_rock", "priority": [6, 8] },
    { "from": "forest_floor", "to": "grass_lush", "sheet": "transitions/forest_grass", "priority": [6, 5] },
    { "from": "mud", "to": "water_shallow", "sheet": "transitions/mud_water", "priority": [6, 10] },
    { "from": "volcanic", "to": "rock", "sheet": "transitions/volcanic_rock", "priority": [9, 8] }
  ]
});
