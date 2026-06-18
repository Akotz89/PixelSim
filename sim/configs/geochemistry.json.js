"use strict";
PS.assets = PS.assets || {};
if (PS.assets.registerJSON) { PS.assets.registerJSON("sim/configs/geochemistry.json", {
  "width": 512,
  "height": 512,
  "target_tick_ms": 5,
  "species": ["CO2", "O2", "CH4", "H2O_vapor", "SO2", "N2"],
  "atmosphere_stride": 8,
  "ocean_stride": 8,
  "soil_stride": 8,
  "photosynthesis_rate_ppm": 0.42,
  "respiration_rate_ppm": 0.08,
  "silicate_weathering_base_ppm": 0.035,
  "silicate_weathering_temp_coeff": 0.055,
  "silicate_weathering_moisture_coeff": 0.8,
  "volcanic_co2_ppm": 7.5,
  "volcanic_so2_ppm": 1.2,
  "methane_oxidation_rate": 0.00000001,
  "air_sea_exchange_rate": 0.018,
  "ocean_ph_base": 8.1,
  "ocean_ph_co2_coeff": 0.3,
  "epoch_presets": {
    "hadean": {
      "co2_ppm": 100000,
      "o2_ppm": 0,
      "ch4_ppm": 1800,
      "h2o_ppm": 24000,
      "so2_ppm": 90,
      "n2_ppm": 874110
    },
    "archean": {
      "co2_ppm": 10000,
      "o2_ppm": 1000,
      "ch4_ppm": 800,
      "h2o_ppm": 12000,
      "so2_ppm": 18,
      "n2_ppm": 976182
    },
    "proterozoic": {
      "co2_ppm": 1000,
      "o2_ppm": 20000,
      "ch4_ppm": 80,
      "h2o_ppm": 8000,
      "so2_ppm": 5,
      "n2_ppm": 970915
    },
    "phanerozoic": {
      "co2_ppm": 1200,
      "o2_ppm": 210000,
      "ch4_ppm": 2,
      "h2o_ppm": 7000,
      "so2_ppm": 1,
      "n2_ppm": 781797
    },
    "civilization": {
      "co2_ppm": 420,
      "o2_ppm": 209500,
      "ch4_ppm": 2,
      "h2o_ppm": 9000,
      "so2_ppm": 1,
      "n2_ppm": 781077
    }
  }
}); }
