pub fn run_erosion(width: usize, height: usize, elevation: &mut [f32], steps: u32) {
    let cell_count = width.saturating_mul(height);
    if cell_count == 0 || elevation.len() < cell_count {
        return;
    }

    let mut scratch = elevation.to_vec();
    let step_count = steps.min(2048);

    for _ in 0..step_count {
        for y in 0..height {
            for x in 0..width {
                let index = y * width + x;
                let north = elevation[clamp_y(y as i32 - 1, height) * width + x];
                let south = elevation[clamp_y(y as i32 + 1, height) * width + x];
                let west = elevation[y * width + wrap_x(x as i32 - 1, width)];
                let east = elevation[y * width + wrap_x(x as i32 + 1, width)];
                let average = (north + south + west + east) * 0.25;
                let slope = elevation[index] - average;
                let thermal = slope * 0.18;

                scratch[index] = elevation[index] - thermal;
            }
        }

        elevation.copy_from_slice(&scratch[..cell_count]);
    }
}

fn wrap_x(x: i32, width: usize) -> usize {
    let width_i32 = width as i32;
    (((x % width_i32) + width_i32) % width_i32) as usize
}

fn clamp_y(y: i32, height: usize) -> usize {
    y.max(0).min(height as i32 - 1) as usize
}
