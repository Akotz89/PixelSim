struct VertexIn {
  @location(0) corner: vec2<f32>,
  @location(1) rect: vec4<f32>,
  @location(2) uv_rect: vec4<f32>,
  @location(3) alpha: f32,
  @location(4) flip_h: f32,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) alpha: f32,
  @location(2) shade: f32,
  @location(3) uv_rect: vec4<f32>,
};

struct GBufferTerrainOut {
  @location(0) albedo: vec4<f32>,
  @location(1) normal_height: vec4<f32>,
};

struct TileUniforms {
  canvas_size: vec2<f32>,
  texel_size: vec2<f32>,
};

@group(0) @binding(0) var atlas_texture: texture_2d<f32>;
@group(0) @binding(1) var atlas_sampler: sampler;
@group(0) @binding(2) var<uniform> tile: TileUniforms;

@vertex
fn vs_main(input: VertexIn) -> VertexOut {
  var uv_corner = input.corner;
  if (input.flip_h >= 1.0) {
    uv_corner.x = 1.0 - uv_corner.x;
  }

  let pixel = input.rect.xy + input.corner * input.rect.zw;
  let clip = vec2<f32>(
    (pixel.x / max(1.0, tile.canvas_size.x)) * 2.0 - 1.0,
    1.0 - (pixel.y / max(1.0, tile.canvas_size.y)) * 2.0
  );

  var out: VertexOut;
  out.position = vec4<f32>(clip, 0.0, 1.0);
  out.uv = mix(input.uv_rect.xy, input.uv_rect.zw, uv_corner);
  out.alpha = input.alpha;
  out.shade = 0.94 + fract(input.flip_h) * 0.5;
  out.uv_rect = input.uv_rect;
  return out;
}

fn sample_height(input: VertexOut, offset: vec2<f32>) -> f32 {
  let min_uv = min(input.uv_rect.xy, input.uv_rect.zw);
  let max_uv = max(input.uv_rect.xy, input.uv_rect.zw);
  let uv = clamp(input.uv + offset, min_uv + tile.texel_size * 0.5, max_uv - tile.texel_size * 0.5);
  return textureSample(atlas_texture, atlas_sampler, uv).a;
}

@fragment
fn fs_main(input: VertexOut) -> GBufferTerrainOut {
  let color = textureSample(atlas_texture, atlas_sampler, input.uv);
  let shaded = color.rgb * input.shade;
  let alpha = input.alpha;
  let h_l = sample_height(input, vec2<f32>(-tile.texel_size.x, 0.0));
  let h_r = sample_height(input, vec2<f32>(tile.texel_size.x, 0.0));
  let h_d = sample_height(input, vec2<f32>(0.0, -tile.texel_size.y));
  let h_u = sample_height(input, vec2<f32>(0.0, tile.texel_size.y));
  let slope_x = clamp((h_l - h_r) * 4.0, -0.5, 0.5);
  let slope_y = clamp((h_d - h_u) * 4.0, -0.5, 0.5);
  let normal = normalize(vec3<f32>(slope_x, slope_y, 1.0));
  var out: GBufferTerrainOut;
  out.albedo = vec4<f32>(shaded, alpha);
  out.normal_height = vec4<f32>(normal.xy * 0.5 + vec2<f32>(0.5, 0.5), normal.z * 0.5 + 0.5, color.a);
  return out;
}
