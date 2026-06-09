struct ParticleUniforms {
  canvas_size: vec2<f32>,
  _pad: vec2<f32>,
};

struct ParticleInstance {
  rect: vec4<f32>,
  color: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> particle: ParticleUniforms;
@group(0) @binding(1) var<storage, read> instances: array<ParticleInstance>;

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
  let pixel = inst.rect.xy + corners[vertex_index] * inst.rect.zw;
  let clip = vec2<f32>(
    (pixel.x / max(1.0, particle.canvas_size.x)) * 2.0 - 1.0,
    1.0 - (pixel.y / max(1.0, particle.canvas_size.y)) * 2.0
  );
  var out: VertexOut;
  out.position = vec4<f32>(clip, 0.0, 1.0);
  out.color = inst.color;
  return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  return input.color;
}
