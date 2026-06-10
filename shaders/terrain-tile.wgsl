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
  @location(4) water_depth: f32,
  @location(5) water_stencil: f32,
  @location(6) water_wave: f32,
  @location(7) water_growth: f32,
};

struct TileUniforms {
  canvas_size: vec2<f32>,
  _pad: vec2<f32>,
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
  out.water_depth = input.water_depth;
  out.water_stencil = input.water_stencil;
  out.water_wave = input.water_wave;
  out.water_growth = input.water_growth;
  return out;
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
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let color = textureSample(atlas_texture, atlas_sampler, input.uv);
  var rgb = color.rgb * input.shade;

  if (input.water_depth > 0.5) {
    let water = water_depth_color(input) * input.shade;
    let coverage = shore_stencil_coverage(input);
    // renderTextured-compatible edge compositing: keep ground texture visible where stencil coverage is low.
    rgb = mix(rgb, water, coverage);
  }

  return vec4<f32>(rgb, input.alpha);
}
