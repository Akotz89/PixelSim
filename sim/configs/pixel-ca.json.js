PS.assets.registerJSON("sim/configs/pixel-ca.json", {
  "width": 512,
  "height": 512,
  "target_tick_ms": 5,
  "element_count": 13,
  "mass_tolerance": 0.001,
  "surface_depth_m": 100,
  "lbm_boundary": "coast-shallow-water",
  "element_ids": {
    "empty": 0,
    "water": 1,
    "sea_water": 2,
    "ice": 3,
    "snow": 4,
    "lava": 5,
    "steam": 6,
    "gas": 7,
    "soil": 8,
    "sand": 9,
    "rock": 10,
    "organic": 11,
    "salt": 12
  },
  "temperature_thresholds_c": {
    "ice_melt": 0,
    "steam_condense": 100,
    "lava_solidify": 700,
    "rock_melt": 1200
  }
});
