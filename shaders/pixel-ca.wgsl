struct PixelCaParams {
  width: u32,
  height: u32,
  tick: u32,
  element_count: u32,
  ice_melt_c: f32,
  steam_condense_c: f32,
  lava_solidify_c: f32,
  rock_melt_c: f32,
};

struct Block4 {
  tl: u32,
  tr: u32,
  bl: u32,
  br: u32,
};

@group(0) @binding(0) var<storage, read> element_in: array<u32>;
@group(0) @binding(1) var<storage, read_write> element_out: array<u32>;
@group(0) @binding(2) var<storage, read> temperature_c: array<f32>;
@group(0) @binding(3) var<storage, read> lbm_velocity: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> heat_source_out: array<f32>;
@group(0) @binding(5) var<uniform> params: PixelCaParams;

// Packed cell layout: Bits 0-7 element, 8-15 temperature, 16-23 salinity, 24-31 flags.
const ELEMENT_EMPTY: u32 = 0u;
const ELEMENT_WATER: u32 = 1u;
const ELEMENT_SEA_WATER: u32 = 2u;
const ELEMENT_ICE: u32 = 3u;
const ELEMENT_SNOW: u32 = 4u;
const ELEMENT_LAVA: u32 = 5u;
const ELEMENT_STEAM: u32 = 6u;
const ELEMENT_GAS: u32 = 7u;
const ELEMENT_SOIL: u32 = 8u;
const ELEMENT_SAND: u32 = 9u;
const ELEMENT_ROCK: u32 = 10u;
const ELEMENT_ORGANIC: u32 = 11u;
const ELEMENT_SALT: u32 = 12u;
const FLAG_MOVED_THIS_TICK: u32 = 1u;
const FLAG_ON_FIRE: u32 = 2u;

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

fn pack_element(element_type: u32, temperature_q: u32, salinity_q: u32, flags: u32) -> u32 {
  return (element_type & 0xffu) | ((temperature_q & 0xffu) << 8u) | ((salinity_q & 0xffu) << 16u) | ((flags & 0xffu) << 24u);
}

fn element_type(cell: u32) -> u32 {
  return cell & 0xffu;
}

fn temperature_quantized(cell: u32) -> u32 {
  return (cell >> 8u) & 0xffu;
}

fn salinity_quantized(cell: u32) -> u32 {
  return (cell >> 16u) & 0xffu;
}

fn flags(cell: u32) -> u32 {
  return (cell >> 24u) & 0xffu;
}

fn with_type(cell: u32, element: u32) -> u32 {
  return pack_element(element, temperature_quantized(cell), salinity_quantized(cell), flags(cell) | FLAG_MOVED_THIS_TICK);
}

fn density_rank(element: u32) -> u32 {
  if (element == ELEMENT_LAVA || element == ELEMENT_ROCK) { return 6u; }
  if (element == ELEMENT_SAND || element == ELEMENT_SOIL || element == ELEMENT_SALT) { return 5u; }
  if (element == ELEMENT_SEA_WATER) { return 4u; }
  if (element == ELEMENT_WATER) { return 3u; }
  if (element == ELEMENT_ICE || element == ELEMENT_SNOW || element == ELEMENT_ORGANIC) { return 2u; }
  if (element == ELEMENT_STEAM || element == ELEMENT_GAS) { return 1u; }
  return 0u;
}

fn can_sink(upper: u32, lower: u32) -> bool {
  let upper_type = element_type(upper);
  let lower_type = element_type(lower);
  return density_rank(upper_type) > density_rank(lower_type) && lower_type != ELEMENT_ROCK && lower_type != ELEMENT_ICE;
}

fn thermal_transition(cell: u32, temp_c: f32) -> u32 {
  let element = element_type(cell);
  if ((element == ELEMENT_ICE || element == ELEMENT_SNOW) && temp_c > params.ice_melt_c) {
    return with_type(cell, ELEMENT_WATER);
  }
  if (element == ELEMENT_STEAM && temp_c < params.steam_condense_c) {
    return with_type(cell, ELEMENT_WATER);
  }
  if (element == ELEMENT_LAVA && temp_c < params.lava_solidify_c) {
    return with_type(cell, ELEMENT_ROCK);
  }
  if (element == ELEMENT_ROCK && temp_c > params.rock_melt_c) {
    return with_type(cell, ELEMENT_LAVA);
  }
  return cell;
}

fn apply_rules(tl_in: u32, tr_in: u32, bl_in: u32, br_in: u32, temp_t: f32, temp_b: f32) -> Block4 {
  var tl = thermal_transition(tl_in, temp_t);
  var tr = thermal_transition(tr_in, temp_t);
  var bl = thermal_transition(bl_in, temp_b);
  var br = thermal_transition(br_in, temp_b);

  if (can_sink(tl, bl)) {
    let swap = tl;
    tl = bl;
    bl = swap;
  }
  if (can_sink(tr, br)) {
    let swap = tr;
    tr = br;
    br = swap;
  }
  if (can_sink(tl, br) && element_type(bl) != ELEMENT_EMPTY) {
    let swap = tl;
    tl = br;
    br = swap;
  }
  if (can_sink(tr, bl) && element_type(br) != ELEMENT_EMPTY) {
    let swap = tr;
    tr = bl;
    bl = swap;
  }

  if (element_type(bl) == ELEMENT_STEAM && density_rank(element_type(tl)) > density_rank(ELEMENT_STEAM)) {
    let swap = bl;
    bl = tl;
    tl = swap;
  }
  if (element_type(br) == ELEMENT_STEAM && density_rank(element_type(tr)) > density_rank(ELEMENT_STEAM)) {
    let swap = br;
    br = tr;
    tr = swap;
  }

  return Block4(tl, tr, bl, br);
}

@compute @workgroup_size(8, 8, 1)
fn ca_step(@builtin(global_invocation_id) id: vec3<u32>) {
  let tick_offset = i32(params.tick % 2u);
  let block_x = i32(id.x * 2u) + tick_offset;
  let block_y = i32(id.y * 2u) + tick_offset;
  let block = vec2<i32>(block_x, block_y);
  if (u32(block_y) >= params.height) {
    return;
  }

  let x0 = wrapped_x(block.x);
  let x1 = wrapped_x(block.x + 1);
  let y0 = clamped_y(block.y);
  let y1 = clamped_y(block.y + 1);
  let tl_i = cell_index(x0, y0);
  let tr_i = cell_index(x1, y0);
  let bl_i = cell_index(x0, y1);
  let br_i = cell_index(x1, y1);
  let result = apply_rules(
    element_in[tl_i],
    element_in[tr_i],
    element_in[bl_i],
    element_in[br_i],
    temperature_c[tl_i],
    temperature_c[bl_i]
  );

  element_out[tl_i] = result.tl;
  element_out[tr_i] = result.tr;
  element_out[bl_i] = result.bl;
  element_out[br_i] = result.br;
  heat_source_out[tl_i] = select(0.0, 1.0, element_type(result.tl) == ELEMENT_LAVA);
  heat_source_out[tr_i] = select(0.0, 1.0, element_type(result.tr) == ELEMENT_LAVA);
  heat_source_out[bl_i] = select(0.0, 1.0, element_type(result.bl) == ELEMENT_LAVA);
  heat_source_out[br_i] = select(0.0, 1.0, element_type(result.br) == ELEMENT_LAVA);
}
