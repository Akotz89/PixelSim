struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) frag_pos: vec2<f32>,
  @location(2) light_index: u32,
};

struct PointLightUniforms {
  canvas_size: vec2<f32>,
  _pad: vec2<f32>,
};

struct PointLight {
  position_radius: vec4<f32>,
  color_intensity: vec4<f32>,
};

@group(0) @binding(0) var albedo_texture: texture_2d<f32>;
@group(0) @binding(1) var normal_height_texture: texture_2d<f32>;
@group(0) @binding(2) var point_sampler: sampler;
@group(0) @binding(3) var<uniform> point_uniforms: PointLightUniforms;
@group(0) @binding(4) var<storage, read> point_lights: array<PointLight>;

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32
) -> VertexOut {
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
  out.frag_pos = out.uv * point_uniforms.canvas_size;
  out.light_index = instance_index;
  return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let light = point_lights[input.light_index];
  let light_pos = light.position_radius.xy;
  let radius = max(1.0, light.position_radius.z);
  let to_frag = input.frag_pos - light_pos;
  let dist = length(to_frag);

  if (dist > radius) {
    discard;
  }

  let albedo = textureSample(albedo_texture, point_sampler, input.uv).rgb;
  let normal_height = textureSample(normal_height_texture, point_sampler, input.uv);
  let normal = normalize(normal_height.xyz * 2.0 - vec3<f32>(1.0, 1.0, 1.0));
  let light_dir = normalize(vec3<f32>(-to_frag / radius, 0.58));
  let n_dot_l = max(dot(normal, light_dir), 0.0);
  let radial = clamp(1.0 - dist / radius, 0.0, 1.0);
  let attenuation = radial * radial;
  let color = light.color_intensity.rgb * light.color_intensity.a * albedo * n_dot_l * attenuation;

  return vec4<f32>(color, 0.0);
}
