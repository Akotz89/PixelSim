PS.assets.registerJSON("sim/configs/heat-diffusion.json", {
  "thermal_diffusivity": 2.1e-7,
  "solar_constant": 1361,
  "lapse_rate": 0.0065,
  "time_step": 3600,
  "grid_spacing": 50000,
  "albedo": {
    "ocean": 0.06,
    "ice": 0.8,
    "land": 0.3,
    "desert": 0.35
  }
});
