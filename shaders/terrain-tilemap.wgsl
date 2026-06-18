struct TilemapUniforms {
  canvas_size: vec2<f32>,
  camera: vec2<f32>,
  tile_size_zoom: vec2<f32>,
  map_size: vec2<f32>,
  atlas_size: vec2<f32>,
  atlas_tile_size: f32,
  _pad0: f32,
  _pad1: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var tile_data: texture_2d<u32>;
@group(0) @binding(1) var atlas_texture: texture_2d<f32>;
@group(0) @binding(2) var atlas_sampler: sampler;
@group(0) @binding(3) var<uniform> tilemap: TilemapUniforms;

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

fn atlas_uv(tile_id: u32, mask: u32, variation: u32, local: vec2<f32>) -> vec2<f32> {
  let columns = max(1u, u32(floor(tilemap.atlas_size.x / max(1.0, tilemap.atlas_tile_size))));
  let atlas_index = tile_id + (variation & 3u) * 16u + (mask & 15u);
  let tile_x = atlas_index % columns;
  let tile_y = atlas_index / columns;
  let base = vec2<f32>(f32(tile_x), f32(tile_y)) * tilemap.atlas_tile_size;
  let pixel = base + floor(local * tilemap.atlas_tile_size) + vec2<f32>(0.5, 0.5);
  return pixel / max(tilemap.atlas_size, vec2<f32>(1.0, 1.0));
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  let pixel = input.uv * tilemap.canvas_size;
  let world_pixel = tilemap.camera + pixel / max(tilemap.tile_size_zoom.y, 0.001);
  let tile_coord = floor(world_pixel / max(tilemap.tile_size_zoom.x, 1.0));
  let wrapped_x = ((i32(tile_coord.x) % i32(tilemap.map_size.x)) + i32(tilemap.map_size.x)) % i32(tilemap.map_size.x);
  let clamped_y = clamp(i32(tile_coord.y), 0, i32(tilemap.map_size.y) - 1);
  let data = textureLoad(tile_data, vec2<i32>(wrapped_x, clamped_y), 0);
  let local = fract(world_pixel / max(tilemap.tile_size_zoom.x, 1.0));
  let uv = atlas_uv(data.r, data.g, data.b, local);
  let color = textureSampleLevel(atlas_texture, atlas_sampler, uv, 0.0);
  let visible = select(1.0, 0.0, (data.a & 1u) != 0u);
  return vec4<f32>(color.rgb, color.a * visible);
}
