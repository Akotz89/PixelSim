pub fn run_d8_rivers(
    width: usize,
    height: usize,
    elevation: &[f32],
    rivers: &mut [f32],
    flow_order: &mut [u32],
) {
    let cell_count = width.saturating_mul(height);
    if cell_count == 0 || elevation.len() < cell_count || rivers.len() < cell_count || flow_order.len() < cell_count {
        return;
    }

    rivers.fill(1.0);
    flow_order.fill(0);

    let mut order: Vec<usize> = (0..cell_count).collect();
    order.sort_by(|a, b| {
        elevation[*b]
            .partial_cmp(&elevation[*a])
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    for (rank, index) in order.iter().enumerate() {
        flow_order[*index] = rank as u32;
    }

    for index in order {
        if let Some(receiver) = steepest_receiver(index, width, height, elevation) {
            rivers[receiver] += rivers[index];
        }
    }
}

fn steepest_receiver(index: usize, width: usize, height: usize, elevation: &[f32]) -> Option<usize> {
    let x = index % width;
    let y = index / width;
    let source = elevation[index];
    let mut best_index = None;
    let mut best_drop = 0.0;

    for dy in -1_i32..=1 {
        for dx in -1_i32..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }

            let nx = wrap_x(x as i32 + dx, width);
            let ny = clamp_y(y as i32 + dy, height);
            let neighbor = ny * width + nx;
            let distance = if dx != 0 && dy != 0 { std::f32::consts::SQRT_2 } else { 1.0 };
            let drop = (source - elevation[neighbor]) / distance;

            if drop > best_drop {
                best_drop = drop;
                best_index = Some(neighbor);
            }
        }
    }

    best_index
}

fn wrap_x(x: i32, width: usize) -> usize {
    let width_i32 = width as i32;
    (((x % width_i32) + width_i32) % width_i32) as usize
}

fn clamp_y(y: i32, height: usize) -> usize {
    y.max(0).min(height as i32 - 1) as usize
}
