struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) frag_pos: vec2<f32>,
};

struct TileLightUniforms {
  canvas_size: vec2<f32>,
  grid_size: vec2<f32>,
  tile_size: f32,
  strength: f32,
  ambient_floor: f32,
  _pad0: f32,
};

@group(0) @binding(0) var albedo_texture: texture_2d<f32>;
@group(0) @binding(1) var normal_height_texture: texture_2d<f32>;
@group(0) @binding(2) var tile_sampler: sampler;
@group(0) @binding(3) var<uniform> tile_uniforms: TileLightUniforms;
@group(0) @binding(4) var<storage, read> tile_lights: array<f32>;

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
  out.frag_pos = out.uv * tile_uniforms.canvas_size;
  return out;
}

fn light_index(x: u32, y: u32) -> u32 {
  return y * u32(tile_uniforms.grid_size.x) + x;
}

fn sample_corner(x: u32, y: u32) -> f32 {
  let max_x = max(1u, u32(tile_uniforms.grid_size.x)) - 1u;
  let max_y = max(1u, u32(tile_uniforms.grid_size.y)) - 1u;
  let clamped_x = min(x, max_x);
  let clamped_y = min(y, max_y);
  return clamp(tile_lights[light_index(clamped_x, clamped_y)], 0.0, 1.0);
}

fn sample_tile_light(pixel: vec2<f32>) -> f32 {
  let tile_size = max(1.0, tile_uniforms.tile_size);
  let coord = clamp(pixel / tile_size, vec2<f32>(0.0), max(tile_uniforms.grid_size - vec2<f32>(1.001), vec2<f32>(0.0)));
  let base = floor(coord);
  let f = fract(coord);
  let x0 = u32(base.x);
  let y0 = u32(base.y);
  let x1 = x0 + 1u;
  let y1 = y0 + 1u;
  let a = sample_corner(x0, y0);
  let b = sample_corner(x1, y0);
  let c = sample_corner(x0, y1);
  let d = sample_corner(x1, y1);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let albedo = textureSample(albedo_texture, tile_sampler, input.uv);
  let normal_height = textureSample(normal_height_texture, tile_sampler, input.uv);
  let normal = normalize(normal_height.xyz * 2.0 - vec3<f32>(1.0, 1.0, 1.0));
  let tile_ambient = clamp(sample_tile_light(input.frag_pos), tile_uniforms.ambient_floor, 1.0);
  let deficit = clamp((1.0 - tile_ambient) * tile_uniforms.strength, 0.0, 1.0);
  let side_relief = clamp(0.82 + normal.z * 0.18, 0.72, 1.0);
  let color = albedo.rgb * tile_ambient * side_relief;
  return vec4<f32>(color, deficit);
}
