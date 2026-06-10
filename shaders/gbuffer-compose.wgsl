struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct ComposeUniforms {
  sun_direction: vec4<f32>,
  lighting: vec4<f32>,
};

@group(0) @binding(0) var albedo_texture: texture_2d<f32>;
@group(0) @binding(1) var normal_height_texture: texture_2d<f32>;
@group(0) @binding(2) var gbuffer_sampler: sampler;
@group(0) @binding(3) var<uniform> compose: ComposeUniforms;

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
  let normal_height = textureSample(normal_height_texture, gbuffer_sampler, input.uv);
  let normal = normalize(normal_height.xyz * 2.0 - vec3<f32>(1.0, 1.0, 1.0));
  let light_dir = normalize(compose.sun_direction.xyz);
  let ambient = clamp(compose.lighting.x, 0.0, 1.0);
  let directional = max(dot(normal, light_dir), 0.0);
  let wrap = clamp(dot(normal, light_dir) * 0.5 + 0.5, 0.0, 1.0);
  let lit = ambient + directional * compose.lighting.y + wrap * compose.lighting.z;
  let height_tint = clamp(normal_height.a, 0.0, 1.0) * compose.lighting.w;
  let color = albedo.rgb * clamp(lit, 0.28, 1.22) + vec3<f32>(height_tint);
  return vec4<f32>(color, albedo.a);
}
