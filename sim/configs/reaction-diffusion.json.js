PS.assets.registerJSON("sim/configs/reaction-diffusion.json", {
  "width": 512,
  "height": 512,
  "target_tick_ms": 5,
  "diffusion_a": 1.0,
  "diffusion_b": 0.5,
  "time_step": 1.0,
  "greenhouse_base_co2_ppm": 280,
  "greenhouse_ppm_to_c": 0.01,
  "regimes": {
    "spots": { "feed": 0.055, "kill": 0.062, "feature": "vegetation islands, coral" },
    "labyrinths": { "feed": 0.035, "kill": 0.065, "feature": "river networks, canyons" },
    "stripes": { "feed": 0.06, "kill": 0.055, "feature": "sand dunes, wave patterns" },
    "worms": { "feed": 0.078, "kill": 0.061, "feature": "soil networks, root patterns" },
    "holes": { "feed": 0.025, "kill": 0.06, "feature": "cloud gaps, clearings" }
  },
  "layers": [
    { "name": "vegetation", "regime": "spots", "moisture_modulated": true, "temperature_modulated": true },
    { "name": "atmosphere", "regime": "holes", "co2_feedback": true },
    { "name": "soil", "regime": "worms", "mineral_diffusion": true }
  ]
});
