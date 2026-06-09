struct HeatParams {
  width: u32,
  height: u32,
  thermal_diffusivity: f32,
  time_step: f32,
  grid_spacing: f32,
  solar_constant: f32,
  lapse_rate: f32,
  source_relaxation: f32,
  min_temperature: f32,
  max_temperature: f32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<storage, read> temperature_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> temperature_out: array<f32>;
@group(0) @binding(2) var<storage, read> elevation_m: array<f32>;
@group(0) @binding(3) var<storage, read> albedo: array<f32>;
@group(0) @binding(4) var<storage, read> greenhouse_c: array<f32>;
@group(0) @binding(5) var<uniform> params: HeatParams;

const PI: f32 = 3.141592653589793;
const INITIAL_EQUATOR_C: f32 = 30.0;
const INITIAL_POLAR_OFFSET_C: f32 = -20.0;
const ABSOLUTE_SOLAR_TO_C: f32 = 0.035;

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

fn sample_temperature(x: i32, y: i32) -> f32 {
  return temperature_in[cell_index(wrapped_x(x), clamped_y(y))];
}

fn latitude_radians(y: u32) -> f32 {
  let v = (f32(y) + 0.5) / max(1.0, f32(params.height));
  return v * PI - PI * 0.5;
}

fn initial_latitude_temperature(latitude: f32) -> f32 {
  return INITIAL_EQUATOR_C * cos(latitude) + INITIAL_POLAR_OFFSET_C;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let x = i32(gid.x);
  let y = i32(gid.y);
  let index = cell_index(gid.x, gid.y);
  let center = temperature_in[index];
  let north = sample_temperature(x, y - 1);
  let south = sample_temperature(x, y + 1);
  let west = sample_temperature(x - 1, y);
  let east = sample_temperature(x + 1, y);
  let laplacian = north + south + west + east - center * 4.0;
  let diffusion = params.thermal_diffusivity * params.time_step * laplacian / (params.grid_spacing * params.grid_spacing);

  let latitude = latitude_radians(gid.y);
  let solar_incidence = max(0.0, cos(latitude));
  let reflected = clamp(albedo[index], 0.0, 0.95);
  let solar_forcing_c = params.solar_constant * solar_incidence * (1.0 - reflected) * ABSOLUTE_SOLAR_TO_C;
  let elevation_lapse_c = elevation_m[index] * params.lapse_rate;
  let target = initial_latitude_temperature(latitude) + solar_forcing_c - elevation_lapse_c + greenhouse_c[index];
  let source = (target - center) * params.source_relaxation * params.time_step;

  temperature_out[index] = clamp(center + diffusion + source, params.min_temperature, params.max_temperature);
}
