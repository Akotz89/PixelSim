struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct ComposeUniforms {
  sun_direction: vec4<f32>,
  lighting: vec4<f32>,
  ambient_color: vec4<f32>,
  lod: vec4<f32>,
  cloud: vec4<f32>,
};

@group(0) @binding(0) var albedo_texture: texture_2d<f32>;
@group(0) @binding(1) var normal_height_texture: texture_2d<f32>;
@group(0) @binding(2) var gbuffer_sampler: sampler;
@group(0) @binding(3) var<uniform> compose: ComposeUniforms;
@group(0) @binding(4) var cloud_shadow_texture: texture_2d<f32>;

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
  let albedo = textureSample(albedo_texture, gbuffer_sampler, input.uv);
  let light_dir = normalize(compose.sun_direction.xyz);
  let ambient = clamp(compose.lighting.x, 0.0, 1.0);
  let normal_strength = clamp(compose.lod.x, 0.0, 1.0);
  var directional = 0.0;
  var wrap = 0.0;
  var height_tint = 0.0;
  if (normal_strength > 0.0) {
    let normal_height = textureSample(normal_height_texture, gbuffer_sampler, input.uv);
    let normal = normalize(normal_height.xyz * 2.0 - vec3<f32>(1.0, 1.0, 1.0));
    directional = max(dot(normal, light_dir), 0.0);
    wrap = clamp(dot(normal, light_dir) * 0.5 + 0.5, 0.0, 1.0);
    height_tint = clamp(normal_height.a, 0.0, 1.0) * compose.lighting.w * normal_strength;
  }
  let lit = ambient + directional * compose.lighting.y * normal_strength + wrap * compose.lighting.z * normal_strength;
  let ambient_tint_luma = max(dot(compose.ambient_color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.01);
  let ambient_hue_tint = clamp(compose.ambient_color.rgb / ambient_tint_luma, vec3<f32>(0.72), vec3<f32>(1.24));
  let raw_exposure = clamp(lit, 0.20, 1.22);
  let surface_exposure = max(raw_exposure, 0.68);
  let albedo_luma = max(dot(albedo.rgb, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.01);
  let low_light_relief_visibility = clamp((0.68 - raw_exposure) / 0.19, 0.0, 1.0);
  let relief_visibility_exposure = min(max(surface_exposure, 0.26 / albedo_luma), 1.22);
  let final_exposure = mix(surface_exposure, relief_visibility_exposure, low_light_relief_visibility);
  let cloud_uv = fract(input.uv * vec2<f32>(compose.cloud.x) + compose.cloud.zw);
  let cloud_value = textureSample(cloud_shadow_texture, gbuffer_sampler, cloud_uv).r;
  let cloud_alpha = clamp(0.10 + max(cloud_value - 0.48, 0.0) / 0.52 * 0.10, 0.0, clamp(compose.cloud.y, 0.0, 0.20));
  let cloud_shadow = 1.0 - cloud_alpha;
  var color = (albedo.rgb * ambient_hue_tint * final_exposure + vec3<f32>(height_tint)) * cloud_shadow;
  let muted_teal_relief = smoothstep(0.24, 0.46, color.g) *
    smoothstep(0.24, 0.46, color.b) *
    smoothstep(0.02, 0.14, color.g - color.r) *
    smoothstep(0.02, 0.14, color.b - color.r) *
    (1.0 - smoothstep(0.54, 0.72, max(color.g, color.b)));
  let packed_ground = vec3<f32>(
    max(color.r, max(color.g * 0.92, color.b * 0.88)),
    color.g * 0.86,
    color.b * 0.72
  );
  color = mix(color, packed_ground, muted_teal_relief * 0.82);
  return vec4<f32>(color, albedo.a);
}
