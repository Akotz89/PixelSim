PS.assets.registerJSON("sim/configs/ocean.json", {
  "width": 512,
  "height": 512,
  "kinematic_viscosity": 0.1,
  "coriolis_omega": 0.00007292115,
  "max_surface_velocity_mps": 2,
  "mass_tolerance": 0.0001,
  "target_tick_ms": 15,
  "arrow_stride": 8,
  "layers": [
    { "name": "surface", "depth_m": 200, "tau": 0.8, "wind_coupling": 0.1 },
    { "name": "thermocline", "depth_m": 1000, "tau": 1.2, "wind_coupling": 0 },
    { "name": "deep", "depth_m": 4000, "tau": 2.0, "wind_coupling": 0 }
  ],
  "layer_exchange": "density_driven"
});
