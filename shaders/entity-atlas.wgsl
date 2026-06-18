struct EntityUniforms {
  canvas_size: vec2<f32>,
  _pad: vec2<f32>,
};

struct EntityInstance {
  rect: vec4<f32>,
  uv_rect: vec4<f32>,
  normal_uv_rect: vec4<f32>,
  material_uv_rect: vec4<f32>,
  tint: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) tint: vec4<f32>,
  @location(2) normal_uv: vec2<f32>,
  @location(3) material_uv: vec2<f32>,
};

struct GBufferEntityOut {
  @location(0) albedo: vec4<f32>,
  @location(1) normal_height: vec4<f32>,
};

@group(0) @binding(0) var atlas_texture: texture_2d<f32>;
@group(0) @binding(1) var atlas_sampler: sampler;
@group(0) @binding(2) var<uniform> entity: EntityUniforms;
@group(0) @binding(3) var<storage, read> instances: array<EntityInstance>;

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @builtin(instance_index) instance_index: u32
) -> VertexOut {
  var corners = array<vec2<f32>, 4>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0)
  );

  let inst = instances[instance_index];
  let corner = corners[vertex_index];
  let pixel = inst.rect.xy + corner * inst.rect.zw;
  let clip = vec2<f32>(
    (pixel.x / max(1.0, entity.canvas_size.x)) * 2.0 - 1.0,
    1.0 - (pixel.y / max(1.0, entity.canvas_size.y)) * 2.0
  );

  var out: VertexOut;
  out.position = vec4<f32>(clip, 0.0, 1.0);
  out.uv = mix(inst.uv_rect.xy, inst.uv_rect.zw, corner);
  out.normal_uv = mix(inst.normal_uv_rect.xy, inst.normal_uv_rect.zw, corner);
  out.material_uv = mix(inst.material_uv_rect.xy, inst.material_uv_rect.zw, corner);
  out.tint = inst.tint;
  return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let color = textureSample(atlas_texture, atlas_sampler, input.uv);
  return vec4<f32>(color.rgb * input.tint.rgb, color.a * input.tint.a);
}

@fragment
fn fs_gbuffer(input: VertexOut) -> GBufferEntityOut {
  let color = textureSample(atlas_texture, atlas_sampler, input.uv);
  let alpha = color.a * input.tint.a;
  let normal_sample = textureSample(atlas_texture, atlas_sampler, input.normal_uv);
  let material_sample = textureSample(atlas_texture, atlas_sampler, input.material_uv);
  let packed_height = clamp(material_sample.r, 0.0, 1.0);
  let material_coverage = clamp(material_sample.a, 0.0, 1.0);
  let height_relief = (packed_height - 0.5) * 0.10;
  let slope = clamp((normal_sample.rg - vec2<f32>(0.5, 0.5)) * (0.36 + height_relief), vec2<f32>(-0.38, -0.38), vec2<f32>(0.38, 0.38));
  let normal = normalize(vec3<f32>(slope.x, slope.y, 1.0));
  var out: GBufferEntityOut;
  out.albedo = vec4<f32>(color.rgb * input.tint.rgb, alpha * material_coverage);
  out.normal_height = vec4<f32>(normal.xy * 0.5 + vec2<f32>(0.5, 0.5), normal.z * 0.5 + 0.5, alpha * material_coverage);
  return out;
}
