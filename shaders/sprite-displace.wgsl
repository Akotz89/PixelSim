struct DisplacementUniforms {
  canvas_size: vec2<f32>,
  time_seconds: f32,
  _pad0: f32,
  texture_params: vec4<f32>,
};

struct DisplacementInstance {
  rect: vec4<f32>,
  source_radius: vec4<f32>,
  amounts: vec4<f32>,
  tint: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) pixel: vec2<f32>,
  @location(2) source_radius: vec4<f32>,
  @location(3) amounts: vec4<f32>,
  @location(4) tint: vec4<f32>,
};

@group(0) @binding(0) var<uniform> displacement: DisplacementUniforms;
@group(0) @binding(1) var<storage, read> instances: array<DisplacementInstance>;

fn displacement_texture(uv: vec2<f32>, frequency: f32, phase: f32) -> vec2<f32> {
  let coarse = sin(vec2<f32>(
    (uv.x * frequency + uv.y * 0.37 + phase) * 6.2831853,
    (uv.y * frequency - uv.x * 0.29 + phase * 0.73) * 6.2831853
  ));
  let fine = cos(vec2<f32>(
    ((uv.x + uv.y) * frequency * 1.91 + phase * 1.37) * 6.2831853,
    ((uv.y - uv.x) * frequency * 1.61 + phase * 1.91) * 6.2831853
  ));
  return coarse * 0.65 + fine * 0.35;
}

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
  let local = corner * 2.0 - vec2<f32>(1.0, 1.0);
  let uv = corner + inst.source_radius.xy * 0.003;
  let phase = displacement.time_seconds * max(0.01, inst.amounts.w);
  let wave = displacement_texture(uv, max(0.01, inst.amounts.z), phase);
  let distance_to_source = distance(pixel, inst.source_radius.xy);
  let falloff = smoothstep(max(1.0, inst.source_radius.z), 0.0, distance_to_source);
  let displacement_amount = max(0.0, inst.source_radius.w) * falloff;
  let displaced_pixel = pixel + wave * displacement_amount * inst.amounts.xy;
  let clip = vec2<f32>(
    (displaced_pixel.x / max(1.0, displacement.canvas_size.x)) * 2.0 - 1.0,
    1.0 - (displaced_pixel.y / max(1.0, displacement.canvas_size.y)) * 2.0
  );

  var out: VertexOut;
  out.position = vec4<f32>(clip, 0.0, 1.0);
  out.local = local;
  out.pixel = pixel;
  out.source_radius = inst.source_radius;
  out.amounts = inst.amounts;
  out.tint = inst.tint;
  return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let distance_to_source = distance(input.pixel, input.source_radius.xy);
  let distance_falloff = smoothstep(max(1.0, input.source_radius.z), 0.0, distance_to_source);
  let soft_edge = smoothstep(1.08, 0.18, length(input.local));
  let phase = displacement.time_seconds * max(0.01, input.amounts.w);
  let shimmer = displacement_texture(input.local * 0.5 + vec2<f32>(0.5, 0.5), max(0.01, input.amounts.z), phase);
  let ribbon = smoothstep(0.08, 0.74, abs(shimmer.x * 0.55 + shimmer.y * 0.45));
  let alpha = input.tint.a * soft_edge * distance_falloff * ribbon * clamp(input.source_radius.w / 12.0, 0.0, 1.0);
  return vec4<f32>(input.tint.rgb, alpha);
}
