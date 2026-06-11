"use strict";
PS.assets = PS.assets || {};
if (PS.assets.registerJSON) { PS.assets.registerJSON("sim/configs/environment-drivers.json", {
  "drivers": [
    {
      "id": "volcanism",
      "cadence": "event_tick",
      "outputs": [
        "volcanic_emission",
        "greenhouse_forcing",
        "mineral_distribution"
      ]
    },
    {
      "id": "orbital_solar",
      "cadence": "orbital_tick",
      "outputs": [
        "solar_forcing",
        "albedo"
      ]
    },
    {
      "id": "asteroid_dust",
      "cadence": "event_tick",
      "outputs": [
        "dust_opacity",
        "albedo",
        "solar_forcing"
      ]
    },
    {
      "id": "agent_intervention",
      "cadence": "event_tick",
      "outputs": [
        "greenhouse_forcing",
        "albedo",
        "vegetation_density",
        "species_density"
      ]
    },
    {
      "id": "runaway_biology",
      "cadence": "driver_tick",
      "outputs": [
        "vegetation_density",
        "species_density",
        "greenhouse_forcing",
        "ocean_ph"
      ]
    }
  ],
  "fieldConsumers": {
    "volcanic_emission": [
      "geochemistry",
      "pixel-ca"
    ],
    "greenhouse_forcing": [
      "heat-diffusion",
      "geochemistry"
    ],
    "mineral_distribution": [
      "geochemistry",
      "pixel-ca"
    ],
    "ocean_ph": [
      "geochemistry",
      "lenia"
    ],
    "albedo": [
      "heat-diffusion",
      "biome-lut"
    ],
    "vegetation_density": [
      "geochemistry",
      "reaction-diffusion",
      "lenia"
    ],
    "species_density": [
      "lenia",
      "biome-lut"
    ],
    "solar_forcing": [
      "heat-diffusion"
    ],
    "dust_opacity": [
      "heat-diffusion",
      "moisture"
    ]
  }
}); }
