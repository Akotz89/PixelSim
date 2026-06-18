struct DensityParams {
  width: u32,
  height: u32,
  density_base: f32,
  density_salinity_coeff: f32,
  density_temperature_coeff: f32,
  reference_salinity: f32,
  reference_temperature_c: f32,
  downwelling_density_threshold: f32,
};

@group(0) @binding(0) var<storage, read> temperature_c: array<f32>;
@group(0) @binding(1) var<storage, read> salinity_psu: array<f32>;
@group(0) @binding(2) var<storage, read_write> density_out: array<f32>;
@group(0) @binding(3) var<storage, read_write> buoyancy_out: array<vec4<f32>>;
@group(0) @binding(4) var<uniform> params: DensityParams;

const DENSITY_MIN: f32 = 1025.0;
const DENSITY_MAX: f32 = 1028.5;

fn cell_index(x: u32, y: u32) -> u32 {
  return y * params.width + x;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let index = cell_index(gid.x, gid.y);
  let salinity = salinity_psu[index];
  let temperature = temperature_c[index];
  let density_raw = params.density_base +
    params.density_salinity_coeff * (salinity - params.reference_salinity) +
    params.density_temperature_coeff * (temperature - params.reference_temperature_c);
  let density = clamp(density_raw, DENSITY_MIN, DENSITY_MAX);
  let sinking = max(0.0, density - params.downwelling_density_threshold);
  let upwelling = max(0.0, params.downwelling_density_threshold - density);

  density_out[index] = density;
  buoyancy_out[index] = vec4<f32>(0.0, upwelling - sinking, density, 1.0);
}
