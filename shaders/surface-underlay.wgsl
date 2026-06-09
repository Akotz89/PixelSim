struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct UnderlayUniforms {
  view_lat_lon: vec2<f32>,
  degrees_per_pixel: vec2<f32>,
  canvas_size: vec2<f32>,
  _pad: vec2<f32>,
};

@group(0) @binding(0) var terrain_texture: texture_2d<f32>;
@group(0) @binding(1) var terrain_sampler: sampler;
@group(0) @binding(2) var<uniform> underlay: UnderlayUniforms;

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

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let centered = (input.uv - vec2<f32>(0.5, 0.5)) * underlay.canvas_size;
  let latitude = clamp(underlay.view_lat_lon.x - centered.y * underlay.degrees_per_pixel.y, -90.0, 90.0);
  let longitude = underlay.view_lat_lon.y + centered.x * underlay.degrees_per_pixel.x;
  let terrain_u = fract((longitude + 180.0) / 360.0);
  let terrain_v = clamp((90.0 - latitude) / 180.0, 0.0, 1.0);
  let color = textureSample(terrain_texture, terrain_sampler, vec2<f32>(terrain_u, terrain_v)).rgb;
  let latitude_shade = 0.90 + (1.0 - abs(latitude) / 90.0) * 0.12;
  let vignette = 1.0 - smoothstep(0.45, 0.82, length(input.uv - vec2<f32>(0.5, 0.5))) * 0.12;
  return vec4<f32>(color * latitude_shade * vignette, 1.0);
}
