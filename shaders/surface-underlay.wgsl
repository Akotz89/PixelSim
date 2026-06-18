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

fn hash2(value: vec2<f32>) -> f32 {
  return fract(sin(dot(value, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn value_noise(value: vec2<f32>) -> f32 {
  let cell = floor(value);
  let local = fract(value);
  let smooth_local = local * local * (vec2<f32>(3.0, 3.0) - 2.0 * local);
  let a = hash2(cell);
  let b = hash2(cell + vec2<f32>(1.0, 0.0));
  let c = hash2(cell + vec2<f32>(0.0, 1.0));
  let d = hash2(cell + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, smooth_local.x), mix(c, d, smooth_local.x), smooth_local.y);
}

fn terrain_fbm(value: vec2<f32>) -> f32 {
  let low = value_noise(value);
  let mid = value_noise(value * 2.03 + vec2<f32>(19.7, 7.3));
  let high = value_noise(value * 4.11 + vec2<f32>(5.1, 31.9));
  return low * 0.52 + mid * 0.31 + high * 0.17;
}

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
  let base_color = textureSample(terrain_texture, terrain_sampler, vec2<f32>(terrain_u, terrain_v)).rgb;
  let degrees_span = max(abs(underlay.degrees_per_pixel.x), abs(underlay.degrees_per_pixel.y));
  let continental_detail = 1.0 - smoothstep(0.28, 1.15, degrees_span);
  let regional_detail = 1.0 - smoothstep(0.08, 0.34, degrees_span);
  let local_detail = 1.0 - smoothstep(0.015, 0.09, degrees_span);
  let continental_cell = floor(vec2<f32>(longitude + 180.0, latitude + 90.0) * 196.0);
  let regional_cell = floor(vec2<f32>(longitude + 180.0, latitude + 90.0) * 768.0);
  let material_cell = floor(vec2<f32>(longitude + 180.0, latitude + 90.0) * 4096.0);
  let broad_cell = floor(vec2<f32>(longitude + 180.0, latitude + 90.0) * 512.0);
  let stratum_cell = floor(vec2<f32>(longitude + 180.0, latitude + 90.0) * 1536.0 + vec2<f32>(17.0, 43.0));
  let continental = hash2(continental_cell);
  let regional = hash2(regional_cell);
  let grain = hash2(material_cell);
  let broad = hash2(broad_cell);
  let stratum = hash2(stratum_cell);
  let ridge = hash2(floor(stratum_cell * vec2<f32>(0.25, 1.0)));
  let terrain_coord = vec2<f32>(longitude + 180.0, latitude + 90.0);
  let slope_noise = terrain_fbm(terrain_coord * 18.0 + vec2<f32>(stratum * 11.0, ridge * 7.0));
  let material_noise = terrain_fbm(terrain_coord * 72.0 + vec2<f32>(continental * 23.0, regional * 17.0));
  let micro_noise = terrain_fbm(terrain_coord * 216.0 + vec2<f32>(broad * 41.0, grain * 29.0));
  let diagonal_ridge = smoothstep(
    0.76,
    1.0,
    fract((terrain_coord.x * 7.0 + terrain_coord.y * 11.0) + slope_noise * 1.65)
  );
  let braided_ridge = smoothstep(
    0.82,
    1.0,
    fract((terrain_coord.x * 13.0 - terrain_coord.y * 5.0) + material_noise * 1.40)
  );
  let contour = max(
    smoothstep(0.965, 1.0, fract((longitude + 180.0) * 96.0 + continental * 0.23)),
    smoothstep(0.965, 1.0, fract((latitude + 90.0) * 96.0 + regional * 0.17))
  );
  let line = max(
    smoothstep(0.985, 1.0, fract((longitude + 180.0) * 4096.0)),
    smoothstep(0.985, 1.0, fract((latitude + 90.0) * 4096.0))
  );
  let weave = max(
    smoothstep(0.94, 1.0, fract((longitude + latitude) * 728.0 + ridge * 0.41)),
    smoothstep(0.94, 1.0, fract((longitude - latitude) * 614.0 + stratum * 0.37))
  );
  let water = smoothstep(0.04, 0.24, base_color.b - max(base_color.r, base_color.g) * 0.72);
  let material_tint = mix(
    vec3<f32>(stratum * 0.072, ridge * 0.052, (1.0 - stratum) * 0.046),
    vec3<f32>((1.0 - ridge) * 0.030, stratum * 0.046, ridge * 0.082),
    water
  );
  let world_shade = mix(0.88, 1.13, continental) + (regional - 0.5) * 0.18 - contour * 0.08;
  let material_relief = (slope_noise - 0.5) * 0.26 + (material_noise - 0.5) * 0.20 + (micro_noise - 0.5) * 0.12;
  let ridge_shadow = max(diagonal_ridge * 0.48, braided_ridge * 0.30);
  let shade = mix(0.78, 1.28, grain) + (broad - 0.5) * 0.24 + (stratum - 0.5) * 0.16 +
    material_relief - max(max(line, weave * 0.62), ridge_shadow) * 0.11;
  let world_detail = base_color * world_shade + vec3<f32>(regional * 0.040, continental * 0.032, (1.0 - regional) * 0.036);
  let base_luma = dot(base_color, vec3<f32>(0.299, 0.587, 0.114));
  let dry_palette = vec3<f32>(
    base_luma * mix(0.92, 1.18, slope_noise),
    base_luma * mix(0.86, 1.09, material_noise),
    base_luma * mix(0.78, 0.98, micro_noise)
  );
  let wet_palette = vec3<f32>(
    base_luma * mix(0.58, 0.82, material_noise),
    base_luma * mix(0.76, 1.06, slope_noise),
    base_luma * mix(1.02, 1.34, micro_noise)
  );
  let procedural_palette = mix(dry_palette, wet_palette, water);
  let causal_local_base = mix(base_color, procedural_palette, local_detail * 0.58);
  let local_material_tint = vec3<f32>(
    (slope_noise - 0.5) * 0.120 + diagonal_ridge * 0.042,
    (material_noise - 0.5) * 0.106 + braided_ridge * 0.036,
    (micro_noise - 0.5) * 0.092 - water * diagonal_ridge * 0.028
  );
  let underlay_detail = causal_local_base * shade + vec3<f32>(broad * 0.068, grain * 0.058, (1.0 - broad) * 0.048) +
    material_tint + local_material_tint * local_detail;
  var color = mix(base_color, world_detail, max(continental_detail * 0.30, regional_detail * 0.22));
  color = mix(color, underlay_detail, local_detail * 0.72);
  let latitude_shade = 0.90 + (1.0 - abs(latitude) / 90.0) * 0.12;
  let vignette = 1.0 - smoothstep(0.45, 0.82, length(input.uv - vec2<f32>(0.5, 0.5))) * 0.12;
  return vec4<f32>(color * latitude_shade * vignette, 1.0);
}
