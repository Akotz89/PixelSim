struct SpriteUniforms {
  canvas_size: vec2<f32>,
  _pad: vec2<f32>,
};

struct SpriteInstance {
  rect: vec4<f32>,
  uv_rect: vec4<f32>,
  tint: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) tint: vec4<f32>,
};

@group(0) @binding(0) var sprite_texture: texture_2d<f32>;
@group(0) @binding(1) var sprite_sampler: sampler;
@group(0) @binding(2) var<uniform> sprite: SpriteUniforms;
@group(0) @binding(3) var<storage, read> instances: array<SpriteInstance>;

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
    (pixel.x / max(1.0, sprite.canvas_size.x)) * 2.0 - 1.0,
    1.0 - (pixel.y / max(1.0, sprite.canvas_size.y)) * 2.0
  );
  var out: VertexOut;
  out.position = vec4<f32>(clip, 0.0, 1.0);
  out.uv = mix(inst.uv_rect.xy, inst.uv_rect.zw, corner);
  out.tint = inst.tint;
  return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let color = textureSample(sprite_texture, sprite_sampler, input.uv);
  return vec4<f32>(color.rgb * input.tint.rgb, color.a * input.tint.a);
}
