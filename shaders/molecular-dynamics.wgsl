struct MdParams {
  particle_count: u32,
  box_size: f32,
  dt: f32,
  cutoff: f32,
  hydration_strength: f32,
  cooling_lattice_strength: f32,
  workgroup_size: u32,
  species_count: u32,
};

struct Particle {
  position: vec2<f32>,
  velocity: vec2<f32>,
  force: vec2<f32>,
  species: u32,
  flags: u32,
};

// Lennard-Jones molecular dynamics compute pass for pixel zoom particles.
@group(0) @binding(0) var<storage, read> particles_in: array<Particle>;
@group(0) @binding(1) var<storage, read_write> particles_out: array<Particle>;
@group(0) @binding(2) var<uniform> params: MdParams;

fn wrap_delta(a: f32, b: f32) -> f32 {
  var d = b - a;
  if (d > params.box_size * 0.5) {
    d = d - params.box_size;
  }
  if (d < -params.box_size * 0.5) {
    d = d + params.box_size;
  }
  return d;
}

fn species_epsilon(id: u32) -> f32 {
  if (id == 0u) { return 0.65; }
  if (id == 1u) { return 0.20; }
  if (id == 2u) { return 0.35; }
  if (id == 5u) { return 2.00; }
  if (id == 7u) { return 0.40; }
  return 0.18;
}

fn species_sigma(id: u32) -> f32 {
  if (id == 0u) { return 3.1; }
  if (id == 1u) { return 2.4; }
  if (id == 2u) { return 3.8; }
  if (id == 5u) { return 4.2; }
  return 3.2;
}

fn species_mass(id: u32) -> f32 {
  if (id == 0u) { return 18.0; }
  if (id == 1u) { return 23.0; }
  if (id == 2u) { return 35.5; }
  if (id == 3u) { return 44.0; }
  if (id == 4u) { return 32.0; }
  if (id == 5u) { return 92.0; }
  if (id == 6u) { return 16.0; }
  return 40.0;
}

fn pair_force_scalar(r2: f32, species_a: u32, species_b: u32) -> f32 {
  let epsilon = sqrt(species_epsilon(species_a) * species_epsilon(species_b));
  let sigma = (species_sigma(species_a) + species_sigma(species_b)) * 0.5;
  let inv_r2 = 1.0 / max(0.36, r2);
  let sr2 = sigma * sigma * inv_r2;
  let sr6 = sr2 * sr2 * sr2;
  var scalar = 24.0 * epsilon * inv_r2 * (2.0 * sr6 * sr6 - sr6);
  if ((species_a == 1u && species_b == 2u) || (species_a == 2u && species_b == 1u)) {
    scalar = scalar + params.hydration_strength * inv_r2;
  }
  return scalar;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.particle_count) {
    return;
  }

  let particle = particles_in[i];
  var total_force = vec2<f32>(0.0);
  let cutoff_sq = params.cutoff * params.cutoff;

  for (var j = 0u; j < params.particle_count; j = j + 1u) {
    if (i == j) {
      continue;
    }
    let other = particles_in[j];
    let delta = vec2<f32>(
      wrap_delta(particle.position.x, other.position.x),
      wrap_delta(particle.position.y, other.position.y)
    );
    let r2 = dot(delta, delta);
    if (r2 <= cutoff_sq) {
      total_force = total_force - pair_force_scalar(r2, particle.species, other.species) * delta;
    }
  }

  let mass = species_mass(particle.species);
  var next_velocity = particle.velocity + (total_force / mass) * params.dt;
  var next_position = particle.position + next_velocity * params.dt;
  next_position = vec2<f32>(
    next_position.x - floor(next_position.x / params.box_size) * params.box_size,
    next_position.y - floor(next_position.y / params.box_size) * params.box_size
  );

  particles_out[i] = Particle(next_position, next_velocity, total_force, particle.species, particle.flags);
}
