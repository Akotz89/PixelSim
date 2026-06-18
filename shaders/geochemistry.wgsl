struct GeochemistryParams {
  width: u32,
  height: u32,
  atmosphere_stride: u32,
  ocean_stride: u32,
  dt: f32,
  photosynthesis_rate_ppm: f32,
  respiration_rate_ppm: f32,
  silicate_weathering_base_ppm: f32,
  silicate_weathering_temp_coeff: f32,
  volcanic_co2_ppm: f32,
  volcanic_so2_ppm: f32,
  methane_oxidation_rate: f32,
  air_sea_exchange_rate: f32,
  ocean_ph_base: f32,
  ocean_ph_co2_coeff: f32,
  pad0: f32,
};

@group(0) @binding(0) var<storage, read> atmosphere_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> atmosphere_out: array<f32>;
@group(0) @binding(2) var<storage, read_write> ocean_chemistry: array<f32>;
@group(0) @binding(3) var<storage, read_write> soil_chemistry: array<f32>;
@group(0) @binding(4) var<storage, read> temperature_c: array<f32>;
@group(0) @binding(5) var<storage, read> vegetation_density: array<f32>;
@group(0) @binding(6) var<storage, read> ocean_mask: array<f32>;
@group(0) @binding(7) var<storage, read> volcanic_emission: array<f32>;
@group(0) @binding(8) var<uniform> params: GeochemistryParams;

const CO2: u32 = 0u;
const O2: u32 = 1u;
const CH4: u32 = 2u;
const H2O_VAPOR: u32 = 3u;
const SO2: u32 = 4u;
const N2: u32 = 5u;
const OCEAN_PH: u32 = 0u;
const OCEAN_CO2_DISSOLVED: u32 = 1u;
const OCEAN_O2_DISSOLVED: u32 = 2u;
const SOIL_WEATHERING_RATE: u32 = 4u;

fn cell_index(pos: vec2<u32>) -> u32 {
  return pos.y * params.width + pos.x;
}

fn atmo_index(cell: u32, channel: u32) -> u32 {
  return cell * params.atmosphere_stride + channel;
}

fn ocean_index(cell: u32, channel: u32) -> u32 {
  return cell * params.ocean_stride + channel;
}

@compute @workgroup_size(8, 8, 1)
fn update_geochemistry(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.width || id.y >= params.height) {
    return;
  }

  let pos = id.xy;
  let cell = cell_index(pos);
  let temp = temperature_c[cell];
  let veg = clamp(vegetation_density[cell], 0.0, 1.0);
  let is_ocean = clamp(ocean_mask[cell], 0.0, 1.0);
  let land = 1.0 - is_ocean;
  let volcanic = max(0.0, volcanic_emission[cell]);

  var co2 = atmosphere_in[atmo_index(cell, CO2)];
  var o2 = atmosphere_in[atmo_index(cell, O2)];
  var ch4 = atmosphere_in[atmo_index(cell, CH4)];
  var h2o = atmosphere_in[atmo_index(cell, H2O_VAPOR)];
  var so2 = atmosphere_in[atmo_index(cell, SO2)];
  let n2 = atmosphere_in[atmo_index(cell, N2)];

  // Photosynthesis: vegetation cells raise O2 and draw down CO2.
  let temp_suitability = clamp((temp + 5.0) / 35.0, 0.0, 1.0);
  let photosynthesis = veg * temp_suitability * params.photosynthesis_rate_ppm * params.dt;
  let respiration = veg * params.respiration_rate_ppm * params.dt;
  // silicate_weathering is the slow CO2 thermostat on warm, exposed land.
  let weather_temp = exp((temp - 15.0) * params.silicate_weathering_temp_coeff);
  let weathering = land * weather_temp * params.silicate_weathering_base_ppm * params.dt;
  let oxidation = min(ch4, ch4 * max(o2, 0.0) * params.methane_oxidation_rate * params.dt);

  co2 = co2 - photosynthesis + respiration - weathering + oxidation + volcanic * params.volcanic_co2_ppm * params.dt;
  o2 = o2 + photosynthesis - respiration - oxidation * 2.0;
  ch4 = ch4 - oxidation;
  h2o = h2o + respiration * 0.4 + oxidation * 0.3;
  so2 = max(0.0, so2 * (1.0 - 0.01 * params.dt) + volcanic * params.volcanic_so2_ppm * params.dt);

  var ocean_co2 = ocean_chemistry[ocean_index(cell, OCEAN_CO2_DISSOLVED)];
  var ocean_o2 = ocean_chemistry[ocean_index(cell, OCEAN_O2_DISSOLVED)];
  let exchange = is_ocean * (co2 - ocean_co2) * params.air_sea_exchange_rate * params.dt;
  ocean_co2 = max(0.0, ocean_co2 + exchange);
  ocean_o2 = max(0.0, ocean_o2 + is_ocean * (o2 * 0.00003 - ocean_o2 * 0.001) * params.dt);
  let ph = clamp(params.ocean_ph_base - params.ocean_ph_co2_coeff * ((ocean_co2 / 280.0) - 1.0), 5.0, 8.6);

  atmosphere_out[atmo_index(cell, CO2)] = max(0.0, co2);
  atmosphere_out[atmo_index(cell, O2)] = max(0.0, o2);
  atmosphere_out[atmo_index(cell, CH4)] = max(0.0, ch4);
  atmosphere_out[atmo_index(cell, H2O_VAPOR)] = max(0.0, h2o);
  atmosphere_out[atmo_index(cell, SO2)] = max(0.0, so2);
  atmosphere_out[atmo_index(cell, N2)] = max(0.0, n2);

  ocean_chemistry[ocean_index(cell, OCEAN_PH)] = ph;
  ocean_chemistry[ocean_index(cell, OCEAN_CO2_DISSOLVED)] = ocean_co2;
  ocean_chemistry[ocean_index(cell, OCEAN_O2_DISSOLVED)] = ocean_o2;
  soil_chemistry[cell * 8u + SOIL_WEATHERING_RATE] = weathering;
}
