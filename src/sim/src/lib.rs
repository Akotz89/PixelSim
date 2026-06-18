use wasm_bindgen::prelude::*;

pub mod erosion;
pub mod rivers;
pub mod tectonics;

#[wasm_bindgen]
pub struct SimBuffer {
    width: usize,
    height: usize,
    elevation: Vec<f32>,
    rivers: Vec<f32>,
    flow_order: Vec<u32>,
}

#[wasm_bindgen]
impl SimBuffer {
    #[wasm_bindgen(constructor)]
    pub fn new(width: usize, height: usize) -> SimBuffer {
        let size = width.saturating_mul(height);

        SimBuffer {
            width,
            height,
            elevation: vec![0.0; size],
            rivers: vec![0.0; size],
            flow_order: vec![0; size],
        }
    }

    pub fn len(&self) -> usize {
        self.elevation.len()
    }

    pub fn width(&self) -> usize {
        self.width
    }

    pub fn height(&self) -> usize {
        self.height
    }

    pub fn get_elevation_ptr(&self) -> *const f32 {
        self.elevation.as_ptr()
    }

    pub fn get_elevation_mut_ptr(&mut self) -> *mut f32 {
        self.elevation.as_mut_ptr()
    }

    pub fn get_rivers_ptr(&self) -> *const f32 {
        self.rivers.as_ptr()
    }

    pub fn get_flow_order_ptr(&self) -> *const u32 {
        self.flow_order.as_ptr()
    }

    pub fn set_elevation(&mut self, index: usize, value: f32) {
        if let Some(cell) = self.elevation.get_mut(index) {
            *cell = value;
        }
    }

    pub fn get_elevation(&self, index: usize) -> f32 {
        self.elevation.get(index).copied().unwrap_or(0.0)
    }

    pub fn get_river(&self, index: usize) -> f32 {
        self.rivers.get(index).copied().unwrap_or(0.0)
    }

    pub fn get_flow_order(&self, index: usize) -> u32 {
        self.flow_order.get(index).copied().unwrap_or(0)
    }

    pub fn run_d8_rivers(&mut self) {
        rivers::run_d8_rivers(
            self.width,
            self.height,
            &self.elevation,
            &mut self.rivers,
            &mut self.flow_order,
        );
    }

    pub fn run_tectonics(&mut self, dt: f32) {
        tectonics::run_tectonics(self.width, self.height, &mut self.elevation, dt);
    }

    pub fn run_erosion(&mut self, steps: u32) {
        erosion::run_erosion(self.width, self.height, &mut self.elevation, steps);
    }
}

#[wasm_bindgen]
pub fn sim_version() -> String {
    "pixeldarium-sim/0.1.0".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn d8_orders_upstream_before_downstream() {
        let mut buffer = SimBuffer::new(3, 3);
        let heights = [
            9.0, 8.0, 7.0,
            8.0, 4.0, 6.0,
            7.0, 6.0, 0.0,
        ];

        for (index, value) in heights.iter().enumerate() {
            buffer.set_elevation(index, *value);
        }

        buffer.run_d8_rivers();

        assert!(buffer.get_river(8) > buffer.get_river(0));
        assert!(buffer.get_flow_order(0) < buffer.get_flow_order(8));
        assert_eq!(buffer.get_flow_order(8), 8);
    }

    #[test]
    fn erosion_reduces_peak_without_nan() {
        let mut buffer = SimBuffer::new(5, 5);
        buffer.set_elevation(12, 100.0);
        buffer.run_erosion(4);

        assert!(buffer.get_elevation(12) < 100.0);
        for index in 0..buffer.len() {
            assert!(buffer.get_elevation(index).is_finite());
        }
    }

    #[test]
    fn tectonics_adds_finite_relief() {
        let mut buffer = SimBuffer::new(16, 16);
        buffer.run_tectonics(1.0);

        let mut min = f32::INFINITY;
        let mut max = f32::NEG_INFINITY;

        for index in 0..buffer.len() {
            let value = buffer.get_elevation(index);
            min = min.min(value);
            max = max.max(value);
            assert!(value.is_finite());
        }

        assert!(max - min > 100.0);
    }
}
