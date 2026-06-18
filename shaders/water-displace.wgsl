struct WaterUniforms {
  canvas_size: vec2<f32>,
  time_seconds: f32,
  _pad0: f32,
  wind: vec4<f32>,
};

struct WaterPass {
  displacement_scroll: vec2<f32>,
  surface_scroll: vec2<f32>,
  alpha_amount: vec2<f32>,
  frequency: vec2<f32>,
  tint: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) pass_index: u32,
};

@group(0) @binding(0) var<uniform> water: WaterUniforms;
@group(0) @binding(1) var<storage, read> passes: array<WaterPass>;

fn wave_texture(uv: vec2<f32>, frequency: vec2<f32>, salt: f32) -> f32 {
  let a = sin((uv.x * frequency.x + uv.y * 0.37 + salt) * 6.2831853);
  let b = cos((uv.y * frequency.y - uv.x * 0.29 + salt * 0.61) * 6.2831853);
  let c = sin(((uv.x + uv.y) * (frequency.x + frequency.y) * 0.33 + salt * 1.7) * 6.2831853);
  return (a + b + c) / 6.0 + 0.5;
}

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
  out.pass_index = instance_index;
  return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let water_pass = passes[input.pass_index];
  let wind_scroll = water.wind.xy * water.wind.z * water.time_seconds;
  let displacement_uv_a = input.uv * water_pass.frequency.x + wind_scroll * water_pass.displacement_scroll;
  let displacement_uv_b = input.uv * water_pass.frequency.y - wind_scroll.yx * water_pass.displacement_scroll.yx;
  let displacement_a = wave_texture(displacement_uv_a, water_pass.frequency, water_pass.tint.w);
  let displacement_b = wave_texture(displacement_uv_b, water_pass.frequency.yx, water_pass.tint.w + 0.37);
  let displacement = (vec2<f32>(displacement_a, displacement_b) - vec2<f32>(0.5, 0.5)) * water_pass.alpha_amount.y;
  let surface_uv_a = input.uv * water_pass.frequency + displacement + wind_scroll * water_pass.surface_scroll;
  let surface_uv_b = input.uv * water_pass.frequency.yx - displacement + wind_scroll.yx * water_pass.surface_scroll.yx;
  let surface_a = wave_texture(surface_uv_a, water_pass.frequency + vec2<f32>(0.31, 0.17), water_pass.tint.w + 0.71);
  let surface_b = wave_texture(surface_uv_b, water_pass.frequency.yx + vec2<f32>(0.19, 0.43), water_pass.tint.w + 1.13);
  let foam = smoothstep(0.62, 0.92, surface_a * 0.62 + surface_b * 0.38);
  let color = water_pass.tint.rgb + foam * vec3<f32>(0.20, 0.28, 0.32);
  return vec4<f32>(color, water_pass.alpha_amount.x * foam);
}
