struct ReactionDiffusionParams {
  width: u32,
  height: u32,
  diffusion_a: f32,
  diffusion_b: f32,
  feed: f32,
  kill: f32,
  time_step: f32,
  layer_kind: u32,
  co2_ppm: f32,
  base_co2_ppm: f32,
  greenhouse_ppm_to_c: f32,
  _pad0: f32,
};

@group(0) @binding(0) var<storage, read> chemical_in: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> chemical_out: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> moisture: array<f32>;
@group(0) @binding(3) var<storage, read> temperature_c: array<f32>;
@group(0) @binding(4) var<uniform> params: ReactionDiffusionParams;

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

fn sample_chemical(x: i32, y: i32) -> vec2<f32> {
  return chemical_in[cell_index(wrapped_x(x), clamped_y(y))].rg;
}

fn laplacian_9(x: i32, y: i32) -> vec2<f32> {
  let center = sample_chemical(x, y) * -1.0;
  let cardinal =
    sample_chemical(x - 1, y) +
    sample_chemical(x + 1, y) +
    sample_chemical(x, y - 1) +
    sample_chemical(x, y + 1);
  let diagonal =
    sample_chemical(x - 1, y - 1) +
    sample_chemical(x + 1, y - 1) +
    sample_chemical(x - 1, y + 1) +
    sample_chemical(x + 1, y + 1);
  return center + cardinal * 0.2 + diagonal * 0.05;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let index = cell_index(gid.x, gid.y);
  let x = i32(gid.x);
  let y = i32(gid.y);
  let chemical = chemical_in[index].rg;
  let a = chemical.x;
  let b = chemical.y;
  let lap = laplacian_9(x, y);
  let temp_norm = clamp((temperature_c[index] + 10.0) / 40.0, 0.0, 1.0);
  let local_f = params.feed * clamp(moisture[index], 0.0, 1.0) * clamp(temp_norm * 2.0, 0.0, 1.0);
  let feed = select(params.feed, local_f, params.layer_kind == 0u);
  let reaction = a * b * b;
  let next_a = a + (params.diffusion_a * lap.x - reaction + feed * (1.0 - a)) * params.time_step;
  let next_b = b + (params.diffusion_b * lap.y + reaction - (params.kill + feed) * b) * params.time_step;
  let greenhouse_c = (params.co2_ppm - params.base_co2_ppm) * params.greenhouse_ppm_to_c;

  chemical_out[index] = vec4<f32>(
    clamp(next_a, 0.0, 1.0),
    clamp(next_b, 0.0, 1.0),
    greenhouse_c,
    1.0
  );
}
