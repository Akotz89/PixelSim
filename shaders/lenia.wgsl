struct LeniaParams {
  width: u32,
  height: u32,
  radius: f32,
  dt: f32,
  carrying_capacity: f32,
  coral_ph_threshold: f32,
  coral_acid_kill_rate: f32,
  species_count: u32,
  mu0: f32,
  mu1: f32,
  mu2: f32,
  mu3: f32,
  sigma0: f32,
  sigma1: f32,
  sigma2: f32,
  sigma3: f32,
};

@group(0) @binding(0) var<storage, read> species_in: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> species_out: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> temperature_c: array<f32>;
@group(0) @binding(3) var<storage, read> moisture: array<f32>;
@group(0) @binding(4) var<storage, read> ocean_mask: array<f32>;
@group(0) @binding(5) var<storage, read> ocean_ph: array<f32>;
@group(0) @binding(6) var<storage, read> volcanic: array<f32>;
@group(0) @binding(7) var<uniform> params: LeniaParams;

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

fn kernel_weight(distance: f32) -> f32 {
  let r = clamp(distance / max(1.0, params.radius), 0.0, 1.0);
  return exp(-pow(r - 0.5, 2.0) / 0.08);
}

fn sample_species(x: i32, y: i32) -> vec4<f32> {
  return species_in[cell_index(wrapped_x(x), clamped_y(y))];
}

fn convolve_species(x: i32, y: i32) -> vec4<f32> {
  var sum = vec4<f32>(0.0);
  var weight_sum = 0.0;
  let r = i32(params.radius);

  for (var dy = -8; dy <= 8; dy = dy + 1) {
    for (var dx = -8; dx <= 8; dx = dx + 1) {
      if (abs(dx) <= r && abs(dy) <= r) {
        let distance = length(vec2<f32>(f32(dx), f32(dy)));
        if (distance <= params.radius) {
          let weight = kernel_weight(distance);
          sum = sum + sample_species(x + dx, y + dy) * weight;
          weight_sum = weight_sum + weight;
        }
      }
    }
  }

  return sum / max(0.0001, weight_sum);
}

fn growth(u: f32, mu: f32, sigma: f32) -> f32 {
  return 2.0 * exp(-pow(u - mu, 2.0) / (2.0 * sigma * sigma)) - 1.0;
}

fn temp_gate(temp: f32, min_temp: f32, max_temp: f32) -> f32 {
  return select(0.0, 1.0, temp >= min_temp && temp <= max_temp);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let index = cell_index(gid.x, gid.y);
  let x = i32(gid.x);
  let y = i32(gid.y);
  let current = clamp(species_in[index], vec4<f32>(0.0), vec4<f32>(1.0));
  let neighborhood = convolve_species(x, y);
  let temp = temperature_c[index];
  let wet = clamp(moisture[index], 0.0, 1.0);
  let ocean = clamp(ocean_mask[index], 0.0, 1.0);
  let ph = ocean_ph[index];
  let lava = clamp(volcanic[index], 0.0, 1.0);

  let micro_habitat = temp_gate(temp, -5.0, 45.0) * max(ocean * 0.85, wet * 0.75) * (1.0 - lava);
  let vegetation_habitat = temp_gate(temp, 2.0, 38.0) * (1.0 - ocean) * smoothstep(0.20, 0.55, wet) * (1.0 - lava);
  let coral_habitat = temp_gate(temp, 18.0, 32.0) * ocean * smoothstep(7.0, params.coral_ph_threshold, ph) * (1.0 - lava);
  let lichen_habitat = temp_gate(temp, -18.0, 12.0) * (1.0 - ocean) * max(0.15, wet) * (1.0 - lava);

  var next = vec4<f32>(
    current.x + params.dt * growth(neighborhood.x, params.mu0, params.sigma0) * micro_habitat * 0.22 + params.dt * micro_habitat * (0.30 + current.x * (1.0 - current.x) * 0.20) - params.dt * (1.0 - micro_habitat) * current.x * 0.45,
    current.y + params.dt * growth(neighborhood.y, params.mu1, params.sigma1) * vegetation_habitat * 0.22 + params.dt * vegetation_habitat * (0.30 + current.y * (1.0 - current.y) * 0.20) - params.dt * (1.0 - vegetation_habitat) * current.y * 0.45,
    current.z + params.dt * growth(neighborhood.z, params.mu2, params.sigma2) * coral_habitat * 0.22 + params.dt * coral_habitat * (0.30 + current.z * (1.0 - current.z) * 0.20) - params.dt * (1.0 - coral_habitat) * current.z * 0.45,
    current.w + params.dt * growth(neighborhood.w, params.mu3, params.sigma3) * lichen_habitat * 0.22 + params.dt * lichen_habitat * (0.30 + current.w * (1.0 - current.w) * 0.20) - params.dt * (1.0 - lichen_habitat) * current.w * 0.45
  );

  if (ph < params.coral_ph_threshold) {
    next.z = next.z - params.dt * params.coral_acid_kill_rate * (params.coral_ph_threshold - ph) * 50.0 * max(0.1, current.z);
  }

  next = clamp(next, vec4<f32>(0.0), vec4<f32>(1.0));
  let total = next.x + next.y + next.z + next.w;
  if (total > params.carrying_capacity) {
    next = next / total * params.carrying_capacity;
  }

  species_out[index] = next;
}
