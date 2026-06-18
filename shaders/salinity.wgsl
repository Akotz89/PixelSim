struct SalinityParams {
  width: u32,
  height: u32,
  haline_diffusivity: f32,
  advection_scale: f32,
  evaporation_psu_per_tick: f32,
  precipitation_psu_per_tick: f32,
  river_freshening_psu_per_tick: f32,
  ice_brine_psu_per_tick: f32,
  ice_melt_psu_per_tick: f32,
  min_salinity_psu: f32,
  max_salinity_psu: f32,
  _pad0: f32,
};

@group(0) @binding(0) var<storage, read> salinity_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> salinity_out: array<f32>;
@group(0) @binding(2) var<storage, read> velocity_xy: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> temperature_c: array<f32>;
@group(0) @binding(4) var<storage, read> moisture: array<f32>;
@group(0) @binding(5) var<storage, read> elevation_m: array<f32>;
@group(0) @binding(6) var<storage, read> river_mask: array<f32>;
@group(0) @binding(7) var<uniform> params: SalinityParams;

fn cell_index(x: u32, y: u32) -> u32 {
  return y * params.width + x;
}

fn wrapped_x(x: i32) -> u32 {
  let width_i = i32(params.width);
  return u32((x + width_i) % width_i);
}

fn clamped_y(y: i32) -> u32 {
  return u32(clamp(y, 0, i32(params.height) - 1));
}

fn sample_salinity(x: i32, y: i32) -> f32 {
  return salinity_in[cell_index(wrapped_x(x), clamped_y(y))];
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let x = i32(gid.x);
  let y = i32(gid.y);
  let index = cell_index(gid.x, gid.y);
  let center = salinity_in[index];
  let north = sample_salinity(x, y - 1);
  let south = sample_salinity(x, y + 1);
  let west = sample_salinity(x - 1, y);
  let east = sample_salinity(x + 1, y);
  let laplacian = north + south + west + east - center * 4.0;
  let velocity = velocity_xy[index].xy;
  let upwind_x = select(east - center, center - west, velocity.x > 0.0);
  let upwind_y = select(south - center, center - north, velocity.y > 0.0);
  let advection = -(velocity.x * upwind_x + velocity.y * upwind_y) * params.advection_scale;
  let latitude = abs((f32(gid.y) + 0.5) / max(1.0, f32(params.height)) * 180.0 - 90.0);
  let tropical_evaporation = select(0.0, params.evaporation_psu_per_tick, latitude < 28.0);
  let polar_precipitation = select(0.0, params.precipitation_psu_per_tick, latitude > 58.0);
  let river_freshening = river_mask[index] * params.river_freshening_psu_per_tick;
  let cold = select(0.0, 1.0, temperature_c[index] < -1.8);
  let ice_brine = cold * params.ice_brine_psu_per_tick;
  let ice_melt = cold * moisture[index] * params.ice_melt_psu_per_tick;
  let source = tropical_evaporation - polar_precipitation - river_freshening + ice_brine - ice_melt;

  salinity_out[index] = clamp(center + params.haline_diffusivity * laplacian + advection + source, params.min_salinity_psu, params.max_salinity_psu);
}
