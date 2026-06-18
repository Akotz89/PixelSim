struct OceanParams {
  width: u32,
  height: u32,
  tau: f32,
  wind_coupling: f32,
  coriolis_omega: f32,
  max_velocity_mps: f32,
  layer_depth_m: f32,
  _pad0: f32,
};

@group(0) @binding(0) var<storage, read> distribution_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> distribution_out: array<f32>;
@group(0) @binding(2) var<storage, read> ocean_mask: array<f32>;
@group(0) @binding(3) var<storage, read> bathymetry_m: array<f32>;
@group(0) @binding(4) var<storage, read> wind_xy: array<vec2<f32>>;
@group(0) @binding(5) var<storage, read_write> velocity_out: array<vec4<f32>>;
@group(0) @binding(6) var<uniform> params: OceanParams;

const D2Q9_WEIGHTS: array<f32, 9> = array<f32, 9>(
  0.4444444444,
  0.1111111111,
  0.1111111111,
  0.1111111111,
  0.1111111111,
  0.0277777778,
  0.0277777778,
  0.0277777778,
  0.0277777778
);

const D2Q9_VELOCITIES: array<vec2<i32>, 9> = array<vec2<i32>, 9>(
  vec2<i32>(0, 0),
  vec2<i32>(1, 0),
  vec2<i32>(0, -1),
  vec2<i32>(-1, 0),
  vec2<i32>(0, 1),
  vec2<i32>(1, -1),
  vec2<i32>(-1, -1),
  vec2<i32>(-1, 1),
  vec2<i32>(1, 1)
);

const D2Q9_OPPOSITE: array<u32, 9> = array<u32, 9>(0u, 3u, 4u, 1u, 2u, 7u, 8u, 5u, 6u);

fn cell_index(x: u32, y: u32) -> u32 {
  return y * params.width + x;
}

fn distribution_index(cell: u32, direction: u32) -> u32 {
  return cell * 9u + direction;
}

fn wrapped_x(x: i32) -> u32 {
  let width_i = i32(params.width);
  return u32((x + width_i) % width_i);
}

fn clamped_y(y: i32) -> u32 {
  return u32(clamp(y, 0, i32(params.height) - 1));
}

fn latitude_radians(y: u32) -> f32 {
  let v = (f32(y) + 0.5) / max(1.0, f32(params.height));
  return v * 3.141592653589793 - 1.5707963267948966;
}

fn equilibrium(i: u32, rho: f32, u: vec2<f32>) -> f32 {
  let e = vec2<f32>(f32(D2Q9_VELOCITIES[i].x), f32(D2Q9_VELOCITIES[i].y));
  let eu = dot(e, u);
  let uu = dot(u, u);
  return D2Q9_WEIGHTS[i] * rho * (1.0 + 3.0 * eu + 4.5 * eu * eu - 1.5 * uu);
}

fn coriolis_force(latitude: f32, u: vec2<f32>) -> vec2<f32> {
  let f_coriolis = 2.0 * params.coriolis_omega * sin(latitude);
  return vec2<f32>(f_coriolis * -u.y, f_coriolis * u.x);
}

fn pull_stream_value(x: u32, y: u32, direction: u32, cell: u32) -> f32 {
  let e = D2Q9_VELOCITIES[direction];
  let source_x = wrapped_x(i32(x) - e.x);
  let source_y = clamped_y(i32(y) - e.y);
  let source_cell = cell_index(source_x, source_y);

  if (ocean_mask[source_cell] < 0.5 || bathymetry_m[source_cell] >= 0.0) {
    return distribution_in[distribution_index(cell, D2Q9_OPPOSITE[direction])];
  }

  return distribution_in[distribution_index(source_cell, direction)];
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let cell = cell_index(gid.x, gid.y);

  if (ocean_mask[cell] < 0.5 || bathymetry_m[cell] >= 0.0) {
    for (var blocked_i = 0u; blocked_i < 9u; blocked_i = blocked_i + 1u) {
      distribution_out[distribution_index(cell, blocked_i)] = distribution_in[distribution_index(cell, D2Q9_OPPOSITE[blocked_i])];
    }
    velocity_out[cell] = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    return;
  }

  var f: array<f32, 9>;
  var rho = 0.0;
  var momentum = vec2<f32>(0.0, 0.0);

  for (var i = 0u; i < 9u; i = i + 1u) {
    f[i] = pull_stream_value(gid.x, gid.y, i, cell);
    rho = rho + f[i];
    let e = vec2<f32>(f32(D2Q9_VELOCITIES[i].x), f32(D2Q9_VELOCITIES[i].y));
    momentum = momentum + e * f[i];
  }

  var velocity = momentum / max(rho, 0.000001);
  let latitude = latitude_radians(gid.y);
  let wind_force = wind_xy[cell] * params.wind_coupling;
  let coriolis = coriolis_force(latitude, velocity);
  velocity = velocity + wind_force + coriolis;

  let speed = length(velocity);
  if (speed > params.max_velocity_mps) {
    velocity = velocity / speed * params.max_velocity_mps;
  }

  let tau = max(0.501, params.tau);
  for (var out_i = 0u; out_i < 9u; out_i = out_i + 1u) {
    let feq = equilibrium(out_i, rho, velocity);
    distribution_out[distribution_index(cell, out_i)] = f[out_i] - (f[out_i] - feq) / tau;
  }

  velocity_out[cell] = vec4<f32>(velocity.x, velocity.y, rho, 1.0);
}
