struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct GlobeUniforms {
  canvas_size: vec2<f32>,
  center_radius: vec4<f32>,
  view_overlay: vec4<f32>,
  sun_direction: vec4<f32>,
};

@group(0) @binding(0) var terrain_texture: texture_2d<f32>;
@group(0) @binding(1) var overlay_texture: texture_2d<f32>;
@group(0) @binding(2) var terrain_sampler: sampler;
@group(0) @binding(3) var<uniform> globe: GlobeUniforms;

const PI: f32 = 3.141592653589793;
const SPACE_COLOR: vec3<f32> = vec3<f32>(1.0 / 255.0, 3.0 / 255.0, 10.0 / 255.0);
const ATMOSPHERE_BLUE: vec3<f32> = vec3<f32>(0.20, 0.50, 0.92);
const TERMINATOR_WARM: vec3<f32> = vec3<f32>(1.0, 0.52, 0.22);

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

fn to_degrees(radians_value: f32) -> f32 {
  return radians_value * 180.0 / PI;
}

fn ocean_mask(color: vec3<f32>) -> f32 {
  let blue_bias = color.b - max(color.r, color.g) * 0.72;
  return smoothstep(0.04, 0.30, blue_bias);
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let screen = input.uv * globe.canvas_size;
  let radius = max(1.0, globe.center_radius.z);
  let nx = (screen.x - globe.center_radius.x) / radius;
  let ny = (globe.center_radius.y - screen.y) / radius;
  let r2 = nx * nx + ny * ny;

  // Compute UV unconditionally so textureSample stays in uniform control flow.
  // For out-of-globe pixels (r2 > 1.0) we use a clamped z and a safe UV.
  let r2_clamped = min(r2, 1.0);
  let z_safe = sqrt(max(0.0, 1.0 - r2_clamped));
  let view_lat = globe.view_overlay.x;
  let view_lon = globe.view_overlay.y;
  let overlay_mode = globe.view_overlay.z;
  let overlay_alpha = globe.view_overlay.w;
  let render_alpha = clamp(globe.sun_direction.w, 0.0, 1.0);
  let sin_center_lat = sin(view_lat);
  let cos_center_lat = cos(view_lat);
  let lat_safe = asin(clamp(ny * cos_center_lat + z_safe * sin_center_lat, -1.0, 1.0));
  let lon_safe = view_lon + atan2(nx, z_safe * cos_center_lat - ny * sin_center_lat);
  let terrain_u = fract((to_degrees(lon_safe) + 180.0) / 360.0);
  let terrain_v = clamp((90.0 - to_degrees(lat_safe)) / 180.0, 0.0, 1.0);
  let terrain_uv = vec2<f32>(terrain_u, terrain_v);

  // textureSample MUST be in uniform control flow — sample before any branch.
  var color = textureSample(terrain_texture, terrain_sampler, terrain_uv).rgb;
  let overlay = textureSample(overlay_texture, terrain_sampler, terrain_uv);

  if (r2 > 1.0) {
    let halo = smoothstep(1.15, 1.0, sqrt(r2));
    return vec4<f32>(mix(SPACE_COLOR, ATMOSPHERE_BLUE, halo * 0.38 * render_alpha), render_alpha);
  }

  let z = sqrt(max(0.0, 1.0 - r2));
  let normal = normalize(vec3<f32>(nx, ny, z));
  let sun_dir = normalize(globe.sun_direction.xyz);
  let view_dir = vec3<f32>(0.0, 0.0, 1.0);
  let water = ocean_mask(color);

  if (overlay_mode > 0.5 && overlay_mode < 1.5) {
    color = mix(color, 1.0 - (1.0 - color) * (1.0 - overlay.rgb), overlay.a * overlay_alpha);
  } else if (overlay_mode >= 1.5) {
    color = min(vec3<f32>(1.0), color + overlay.rgb * overlay.a * overlay_alpha);
  }

  let diffuse = max(dot(normal, sun_dir), 0.0);
  let half_dir = normalize(sun_dir + view_dir);
  let specular = pow(max(dot(normal, half_dir), 0.0), 72.0) * water * smoothstep(0.04, 0.28, diffuse);
  let terminator = smoothstep(-0.16, 0.10, dot(normal, sun_dir)) * (1.0 - smoothstep(0.10, 0.34, dot(normal, sun_dir)));
  let daylight = clamp(0.18 + diffuse * 0.84 + z * 0.08, 0.16, 1.10);
  let limb = clamp(pow(1.0 - z, 1.7), 0.0, 1.0);
  let rayleigh = pow(limb, 1.25) * (0.34 + diffuse * 0.28);
  color *= daylight;
  color = mix(color, TERMINATOR_WARM, terminator * limb * 0.18);
  color = mix(color, ATMOSPHERE_BLUE, rayleigh * 0.30);
  color += vec3<f32>(1.0, 0.95, 0.78) * specular * 0.42;
  color = mix(SPACE_COLOR, color, render_alpha);
  return vec4<f32>(color, render_alpha);
}
