struct ShadowUniforms {
  canvas_size: vec2<f32>,
  _pad: vec2<f32>,
};

struct ShadowInstance {
  rect: vec4<f32>,
  color: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) local: vec2<f32>,
};

@group(0) @binding(0) var<uniform> shadow: ShadowUniforms;
@group(0) @binding(1) var<storage, read> instances: array<ShadowInstance>;

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
    (pixel.x / max(1.0, shadow.canvas_size.x)) * 2.0 - 1.0,
    1.0 - (pixel.y / max(1.0, shadow.canvas_size.y)) * 2.0
  );
  var out: VertexOut;
  out.position = vec4<f32>(clip, 0.0, 1.0);
  out.color = inst.color;
  out.local = corner * 2.0 - vec2<f32>(1.0, 1.0);
  return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let falloff = smoothstep(1.0, 0.15, length(input.local));
  return vec4<f32>(input.color.rgb, input.color.a * falloff);
}
