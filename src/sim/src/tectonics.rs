pub fn run_tectonics(width: usize, height: usize, elevation: &mut [f32], dt: f32) {
    let cell_count = width.saturating_mul(height);
    if cell_count == 0 || elevation.len() < cell_count {
        return;
    }

    let safe_dt = dt.clamp(0.0, 10.0);
    for y in 0..height {
        let latitude = y as f32 / (height.saturating_sub(1).max(1)) as f32;

        for x in 0..width {
            let longitude = x as f32 / width.max(1) as f32;
            let index = y * width + x;
            let plate_wave = (longitude * std::f32::consts::TAU * 6.0).sin();
            let boundary_wave = ((longitude + latitude * 0.5) * std::f32::consts::TAU * 11.0).cos();
            let ridge = (1.0 - boundary_wave.abs()).max(0.0);
            let polar_sag = (latitude - 0.5).abs() * -300.0;
            let uplift = ridge * 1800.0 + plate_wave * 450.0 + polar_sag;

            elevation[index] = (elevation[index] + uplift * safe_dt).clamp(-10000.0, 8849.0);
        }
    }
}
