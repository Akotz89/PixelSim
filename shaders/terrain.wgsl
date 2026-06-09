struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct TerrainUniforms {
  canvas_size: vec2<f32>,
  center_radius: vec4<f32>,
  view: vec4<f32>,
};

@group(0) @binding(0) var terrain_texture: texture_2d<f32>;
@group(0) @binding(1) var terrain_sampler: sampler;
@group(0) @binding(2) var<uniform> terrain: TerrainUniforms;

const PI: f32 = 3.141592653589793;
const SPACE_COLOR: vec3<f32> = vec3<f32>(1.0 / 255.0, 3.0 / 255.0, 10.0 / 255.0);

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOut {
  var positions = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, 1.0)
  );
  var uvs = array<vec2<f32>, 4>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0)
  );
  var out: VertexOut;
  out.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
  out.uv = uvs[vertex_index];
  return out;
}

fn to_degrees(radians_value: f32) -> f32 {
  return radians_value * 180.0 / PI;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let screen = input.uv * terrain.canvas_size;
  let radius = max(1.0, terrain.center_radius.z);
  let nx = (screen.x - terrain.center_radius.x) / radius;
  let ny = (terrain.center_radius.y - screen.y) / radius;
  let r2 = nx * nx + ny * ny;

  if (r2 > 1.0) {
    return vec4<f32>(SPACE_COLOR, 1.0);
  }

  let z = sqrt(max(0.0, 1.0 - r2));
  let sin_center_lat = sin(terrain.view.x);
  let cos_center_lat = cos(terrain.view.x);
  let lat = asin(clamp(ny * cos_center_lat + z * sin_center_lat, -1.0, 1.0));
  let lon = terrain.view.y + atan2(nx, z * cos_center_lat - ny * sin_center_lat);
  let terrain_u = fract((to_degrees(lon) + 180.0) / 360.0);
  let terrain_v = clamp((90.0 - to_degrees(lat)) / 180.0, 0.0, 1.0);
  var color = textureSample(terrain_texture, terrain_sampler, vec2<f32>(terrain_u, terrain_v)).rgb;
  let daylight = clamp(0.50 + z * 0.54 - nx * 0.07 + ny * 0.035, 0.20, 1.05);
  let limb = clamp(pow(1.0 - z, 1.7), 0.0, 1.0);
  color *= daylight;
  color = mix(color, vec3<f32>(42.0 / 255.0, 112.0 / 255.0, 176.0 / 255.0), limb * 0.14);
  return vec4<f32>(color, 1.0);
}
