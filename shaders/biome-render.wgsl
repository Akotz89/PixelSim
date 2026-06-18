struct BiomeParams {
  width: u32,
  height: u32,
  debug_mode: u32,
  _pad0: u32,
  sea_level_m: f32,
  min_temp_c: f32,
  max_temp_c: f32,
  max_moisture_mm: f32,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var temperature_map: texture_2d<f32>;
@group(0) @binding(1) var moisture_map: texture_2d<f32>;
@group(0) @binding(2) var elevation_map: texture_2d<f32>;
@group(0) @binding(3) var current_map: texture_2d<f32>;
@group(0) @binding(4) var biome_lut: texture_2d<f32>;
@group(0) @binding(5) var biome_sampler: sampler;
@group(0) @binding(6) var<uniform> params: BiomeParams;

const SEA_LEVEL: f32 = 0.0;
const OCEAN_DEEP: vec3<f32> = vec3<f32>(0.062745, 0.125490, 0.250980);
const OCEAN_SHALLOW: vec3<f32> = vec3<f32>(0.125490, 0.376471, 0.627451);
const PALETTE_SIZE: u32 = 13u;
const PALETTE: array<vec3<f32>, 13> = array<vec3<f32>, 13>(
  vec3<f32>(1.000000, 1.000000, 1.000000),
  vec3<f32>(0.627451, 0.690196, 0.564706),
  vec3<f32>(0.176471, 0.419608, 0.188235),
  vec3<f32>(0.239216, 0.545098, 0.239216),
  vec3<f32>(0.360784, 0.627451, 0.250980),
  vec3<f32>(0.101961, 0.419608, 0.101961),
  vec3<f32>(0.784314, 0.627451, 0.313725),
  vec3<f32>(0.545098, 0.690196, 0.250980),
  vec3<f32>(0.831373, 0.627451, 0.376471),
  vec3<f32>(0.909804, 0.721569, 0.313725),
  OCEAN_SHALLOW,
  OCEAN_DEEP,
  vec3<f32>(0.313725, 0.439216, 0.313725)
);

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOut {
  let positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  let pos = positions[vertex_index];
  var out: VertexOut;
  out.position = vec4<f32>(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + vec2<f32>(0.5, 0.5);
  return out;
}

fn read_sample_coord(uv: vec2<f32>) -> vec2<i32> {
  let max_coord = vec2<f32>(f32(params.width - 1u), f32(params.height - 1u));
  return vec2<i32>(clamp(floor(uv * vec2<f32>(f32(params.width), f32(params.height))), vec2<f32>(0.0, 0.0), max_coord));
}

fn snap_to_palette(color: vec3<f32>) -> vec3<f32> {
  var best = PALETTE[0];
  var best_distance = 9999.0;

  for (var i = 0u; i < PALETTE_SIZE; i = i + 1u) {
    let delta = color - PALETTE[i];
    let distance = dot(delta, delta);
    if (distance < best_distance) {
      best_distance = distance;
      best = PALETTE[i];
    }
  }

  return best;
}

fn temperature_debug(temp_c: f32) -> vec3<f32> {
  let heat = clamp((temp_c - params.min_temp_c) / max(0.001, params.max_temp_c - params.min_temp_c), 0.0, 1.0);
  return vec3<f32>(0.156863 + heat * 0.843137, 0.274510 + heat * 0.313725, 0.941176 - heat * 0.784314);
}

fn moisture_debug(moisture_mm: f32) -> vec3<f32> {
  let wet = clamp(moisture_mm / max(1.0, params.max_moisture_mm), 0.0, 1.0);
  return vec3<f32>(0.588235 - wet * 0.392157, 0.411765 + wet * 0.333333, 0.215686 + wet * 0.705882);
}

fn current_debug(current: vec2<f32>) -> vec3<f32> {
  let speed = clamp(length(current), 0.0, 1.0);
  return vec3<f32>(0.156863 + speed * 0.352941, 0.352941 + speed * 0.470588, 0.588235 + speed * 0.352941);
}

fn elevation_debug(elevation_m: f32) -> vec3<f32> {
  let gray = clamp((elevation_m + 2000.0) / 6000.0, 0.0, 1.0);
  return vec3<f32>(gray, gray, gray);
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let coord = read_sample_coord(input.uv);
  let temp_c = textureLoad(temperature_map, coord, 0).r;
  let moisture_mm = textureLoad(moisture_map, coord, 0).r;
  let elevation_m = textureLoad(elevation_map, coord, 0).r;
  let current = textureLoad(current_map, coord, 0).rg;

  if (params.debug_mode == 1u) {
    return vec4<f32>(temperature_debug(temp_c), 1.0);
  }
  if (params.debug_mode == 2u) {
    return vec4<f32>(moisture_debug(moisture_mm), 1.0);
  }
  if (params.debug_mode == 3u) {
    return vec4<f32>(current_debug(current), 1.0);
  }
  if (params.debug_mode == 4u) {
    return vec4<f32>(elevation_debug(elevation_m), 1.0);
  }

  let temp_u = clamp((temp_c - params.min_temp_c) / max(0.001, params.max_temp_c - params.min_temp_c), 0.0, 1.0);
  let moisture_v = clamp(moisture_mm / max(1.0, params.max_moisture_mm), 0.0, 1.0);
  var color = textureSample(biome_lut, biome_sampler, vec2<f32>(temp_u, moisture_v)).rgb;

  if (elevation_m < params.sea_level_m || elevation_m < SEA_LEVEL) {
    let depth = clamp((-elevation_m) / 1400.0, 0.0, 1.0);
    color = mix(OCEAN_SHALLOW, OCEAN_DEEP, depth);
  }

  return vec4<f32>(snap_to_palette(color), 1.0);
}
