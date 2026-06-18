struct MoistureParams {
  width: u32,
  height: u32,
  evaporation_coefficient: f32,
  dew_point_c: f32,
  ocean_evaporation_multiplier: f32,
  advection_scale: f32,
  lift_factor: f32,
  saturation_threshold: f32,
  condensation_rate: f32,
  rain_shadow_drying: f32,
  hadley_strength: f32,
  westerly_strength: f32,
  max_precipitation_mm: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<storage, read> moisture_in: array<f32>;
@group(0) @binding(1) var<storage, read_write> moisture_out: array<f32>;
@group(0) @binding(2) var<storage, read_write> precipitation_out: array<f32>;
@group(0) @binding(3) var<storage, read> temperature_c: array<f32>;
@group(0) @binding(4) var<storage, read> elevation_m: array<f32>;
@group(0) @binding(5) var<storage, read> ocean_mask: array<f32>;
@group(0) @binding(6) var<storage, read> ocean_velocity: array<vec4<f32>>;
@group(0) @binding(7) var<uniform> params: MoistureParams;

fn cell_index(x: u32, y: u32) -> u32 {
  return y * params.width + x;
}

fn wrapped_x(x: i32) -> u32 {
  let width_i = i32(params.width);
  return u32((x + width_i) % width_i);
}

fn clamped_y(y: i32) -> u32 {
  return u32(clamp(y, 0, i32(params.height) - 1));
}

fn latitude_radians(y: u32) -> f32 {
  let normalized = f32(y) / max(1.0, f32(params.height - 1u));
  return (normalized - 0.5) * 3.14159265;
}

fn approximate_wind(latitude: f32, pressure_gradient: f32) -> vec2<f32> {
  let hadley = cos(latitude * 2.0) * params.hadley_strength;
  let westerlies = sin(latitude * 2.0) * params.westerly_strength;
  return vec2<f32>(hadley + westerlies, pressure_gradient);
}

fn hadley_band_precipitation_mm(latitude: f32, temperature_c_value: f32) -> f32 {
  let abs_lat = abs(latitude) * 57.2957795;
  if (abs_lat <= 10.0) {
    return select(2200.0, 3400.0, temperature_c_value >= 22.0);
  }
  if (abs_lat >= 22.0 && abs_lat <= 35.0) {
    return select(220.0, 140.0, temperature_c_value >= 18.0);
  }
  if (abs_lat >= 43.0 && abs_lat <= 60.0) {
    return select(720.0, 980.0, temperature_c_value >= 0.0);
  }
  if (abs_lat >= 70.0) {
    return 180.0;
  }
  return 620.0 + max(0.0, 22.0 - abs_lat) * 38.0;
}

fn sample_moisture(x: i32, y: i32) -> f32 {
  return moisture_in[cell_index(wrapped_x(x), clamped_y(y))];
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let index = cell_index(gid.x, gid.y);
  let x = i32(gid.x);
  let y = i32(gid.y);
  let latitude = latitude_radians(gid.y);
  let center = max(0.0, moisture_in[index]);
  let pressure_gradient = ocean_velocity[index].y * 0.25;
  let wind = approximate_wind(latitude, pressure_gradient);
  let upwind_x = select(x + 1, x - 1, wind.x >= 0.0);
  let upwind_y = select(y + 1, y - 1, wind.y >= 0.0);
  let advected = mix(center, (sample_moisture(upwind_x, y) + sample_moisture(x, upwind_y)) * 0.5, params.advection_scale);
  let speed = max(0.25, length(wind) + length(ocean_velocity[index].xy));
  let ocean_boost = mix(1.0, params.ocean_evaporation_multiplier, clamp(ocean_mask[index], 0.0, 1.0));
  let evaporation = max(0.0, temperature_c[index] - params.dew_point_c) * speed * ocean_boost * params.evaporation_coefficient;
  let wind_sign = select(-1.0, 1.0, wind.x >= 0.0);
  let windward_elevation = elevation_m[cell_index(wrapped_x(x + i32(wind_sign)), gid.y)];
  let leeward_elevation = elevation_m[cell_index(wrapped_x(x - i32(wind_sign)), gid.y)];
  let orographic_lift = max(0.0, windward_elevation - leeward_elevation) * params.lift_factor;
  let saturation = params.saturation_threshold - clamp(orographic_lift, 0.0, 0.35);
  let condensed = max(0.0, advected + evaporation - saturation) * params.condensation_rate;
  let descending_air = max(0.0, leeward_elevation - windward_elevation) * params.lift_factor * params.rain_shadow_drying;
  let rain_shadow = clamp(descending_air, 0.0, 0.45);
  let remaining = max(0.0, advected + evaporation - condensed - rain_shadow);
  let band_base = hadley_band_precipitation_mm(latitude, temperature_c[index]);
  let band_mm = band_base * mix(0.68, 1.0, clamp(ocean_mask[index], 0.0, 1.0));
  var annual_mm = band_mm + condensed * params.max_precipitation_mm + orographic_lift * 900.0;
  if (rain_shadow > 0.0) {
    annual_mm = min(annual_mm, 250.0 * (1.0 - min(0.5, rain_shadow * 0.2)));
  }
  if (ocean_mask[index] > 0.5 && temperature_c[index] > 20.0 && abs(latitude) < 0.27925268) {
    annual_mm = max(annual_mm, 3300.0);
  }
  annual_mm = clamp(annual_mm, 0.0, params.max_precipitation_mm);

  moisture_out[index] = remaining;
  precipitation_out[index] = annual_mm;
}
