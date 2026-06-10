struct VertexIn {
  @location(0) corner: vec2<f32>,
  @location(1) rect: vec4<f32>,
  @location(2) uv_rect: vec4<f32>,
  @location(3) alpha: f32,
  @location(4) flip_h: f32,
  @location(5) normal_mode: f32,
  @location(6) water_depth: f32,
  @location(7) water_stencil: f32,
  @location(8) water_wave: f32,
  @location(9) water_growth: f32,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) alpha: f32,
  @location(2) shade: f32,
  @location(3) uv_rect: vec4<f32>,
  @location(4) normal_mode: f32,
  @location(5) water_depth: f32,
  @location(6) water_stencil: f32,
  @location(7) water_wave: f32,
  @location(8) water_growth: f32,
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
  out.normal_mode = input.normal_mode;
  out.water_depth = input.water_depth;
  out.water_stencil = input.water_stencil;
  out.water_wave = input.water_wave;
  out.water_growth = input.water_growth;
  return out;
}

fn sample_height(input: VertexOut, offset: vec2<f32>) -> f32 {
  let min_uv = min(input.uv_rect.xy, input.uv_rect.zw);
  let max_uv = max(input.uv_rect.xy, input.uv_rect.zw);
  let uv = clamp(input.uv + offset, min_uv + tile.texel_size * 0.5, max_uv - tile.texel_size * 0.5);
  return textureSampleLevel(atlas_texture, atlas_sampler, uv, 0.0).a;
}

fn sample_split_normal(input: VertexOut) -> vec3<f32> {
  let tile_width = abs(input.uv_rect.z - input.uv_rect.x);
  let normal_offset = tile_width * 8.0;
  let normal_min_x = input.uv_rect.x + normal_offset + tile.texel_size.x * 0.5;
  let normal_max_x = input.uv_rect.z + normal_offset - tile.texel_size.x * 0.5;
  let normal_u = clamp(input.uv.x + normal_offset, min(normal_min_x, normal_max_x), max(normal_min_x, normal_max_x));
  let normal_uv = vec2<f32>(normal_u, input.uv.y);
  let normal_sample = textureSampleLevel(atlas_texture, atlas_sampler, normal_uv, 0.0).rgb;
  return normalize(normal_sample * 2.0 - vec3<f32>(1.0, 1.0, 1.0));
}

fn sample_procedural_normal(input: VertexOut) -> vec3<f32> {
  let h_l = sample_height(input, vec2<f32>(-tile.texel_size.x, 0.0));
  let h_r = sample_height(input, vec2<f32>(tile.texel_size.x, 0.0));
  let h_d = sample_height(input, vec2<f32>(0.0, -tile.texel_size.y));
  let h_u = sample_height(input, vec2<f32>(0.0, tile.texel_size.y));
  let slope_x = clamp((h_l - h_r) * 4.0, -0.5, 0.5);
  let slope_y = clamp((h_d - h_u) * 4.0, -0.5, 0.5);
  return normalize(vec3<f32>(slope_x, slope_y, 1.0));
}

fn local_tile_uv(input: VertexOut) -> vec2<f32> {
  let min_uv = min(input.uv_rect.xy, input.uv_rect.zw);
  let max_uv = max(input.uv_rect.xy, input.uv_rect.zw);
  return clamp((input.uv - min_uv) / max(max_uv - min_uv, vec2<f32>(0.0001, 0.0001)), vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
}

fn shore_stencil_coverage(input: VertexOut) -> f32 {
  let stencil = u32(max(0.0, floor(input.water_stencil + 0.5)));
  let mask = stencil & 15u;
  let variant = (stencil >> 4u) & 3u;
  let uv = local_tile_uv(input);
  let variant_bias = f32(variant) * 0.025;
  let wave = clamp(input.water_wave / 7.0, 0.0, 1.0) * (0.10 + variant_bias);
  let shore_min = 0.07 + variant_bias;
  let shore_max = 0.32 + variant_bias * 1.5;
  var edge = 0.0;

  if ((mask & 1u) != 0u) { edge = max(edge, 1.0 - smoothstep(shore_min + wave, shore_max + wave, uv.y)); }
  if ((mask & 2u) != 0u) { edge = max(edge, smoothstep(1.0 - shore_max - wave, 1.0 - shore_min - wave, uv.x)); }
  if ((mask & 4u) != 0u) { edge = max(edge, smoothstep(1.0 - shore_max - wave, 1.0 - shore_min - wave, uv.y)); }
  if ((mask & 8u) != 0u) { edge = max(edge, 1.0 - smoothstep(shore_min + wave, shore_max + wave, uv.x)); }

  return select(1.0, clamp(edge, 0.18, 0.92), mask != 0u);
}

fn shade_water(color: vec3<f32>, shade: f32) -> vec3<f32> {
  return mix(color, vec3<f32>(0.0, 0.0, 0.0), clamp((0.5 - shade) * 0.6, 0.0, 1.0));
}

fn water_depth_color(input: VertexOut) -> vec3<f32> {
  let normal_color = vec3<f32>(0.22, 0.48, 0.60);
  let winter_color = vec3<f32>(0.62, 0.86, 0.92);
  let shore = mix(normal_color, winter_color, 1.0 - clamp(input.water_growth, 0.0, 1.0));
  let normal = shade_water(shore, 0.38);
  let deep = shade_water(normal, 0.25);

  if (input.water_depth >= 2.5) { return deep; }
  if (input.water_depth >= 1.5) { return normal; }
  return shore;
}

@fragment
fn fs_main(input: VertexOut) -> GBufferTerrainOut {
  let color = textureSample(atlas_texture, atlas_sampler, input.uv);
  var shaded = color.rgb * input.shade;
  let alpha = input.alpha;
  var normal = sample_procedural_normal(input);
  if (input.normal_mode >= 0.5) {
    normal = sample_split_normal(input);
  }
  if (input.water_depth > 0.5) {
    let water = water_depth_color(input) * input.shade;
    let coverage = shore_stencil_coverage(input);
    // renderTextured-compatible edge compositing: keep ground texture visible where stencil coverage is low.
    shaded = mix(shaded, water, coverage);
  }
  var out: GBufferTerrainOut;
  out.albedo = vec4<f32>(shaded, alpha);
  out.normal_height = vec4<f32>(normal.xy * 0.5 + vec2<f32>(0.5, 0.5), normal.z * 0.5 + 0.5, color.a);
  return out;
}
