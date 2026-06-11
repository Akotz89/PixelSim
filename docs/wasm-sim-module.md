# WASM Simulation Module

AZR-836 adds the serial computation module that feeds WebGPU simulation buffers
without JSON serialization. The Rust crate lives in `src/sim/`; committed
runtime outputs live in `wasm/`.

## Build

```bash
cargo test --manifest-path src/sim/Cargo.toml
npm run build:wasm-sim
```

The build wrapper runs:

```bash
wasm-pack build src/sim --target no-modules --release --out-dir ../../wasm --out-name pixeldarium-sim --no-typescript --no-pack --no-opt
```

If `wasm-opt` is installed, the wrapper additionally runs `wasm-opt -Oz
--enable-simd`. If it is not installed, `wasm/pixeldarium-sim.build.json`
records `wasmOptAvailable: false` and still enforces the 500KB binary size gate.

Runtime outputs:

- `wasm/pixeldarium-sim.js`: classic wasm-bindgen no-modules glue.
- `wasm/pixeldarium-sim_bg.wasm`: compiled binary.
- `wasm/pixeldarium-sim.wasm.js`: base64 sidecar for `file://`.
- `wasm/pixeldarium-sim.build.json`: build metadata and size gate evidence.

## File Protocol Path

The runtime manifest loads:

1. `wasm/pixeldarium-sim.js`
2. `wasm/pixeldarium-sim.wasm.js`
3. `js/sim/wasm-bridge.js`

The bridge calls `wasm_bindgen.initSync(Uint8Array bytes)` with bytes decoded
from `window.PIXELDARIUM_SIM_WASM_B64`. This path does not call `fetch()` and is
compatible with direct `file://` loading.

## Rust API

`SimBuffer` owns:

- `elevation: Vec<f32>`
- `rivers: Vec<f32>`
- `flow_order: Vec<u32>`

Exported methods:

- `get_elevation_ptr()`
- `get_rivers_ptr()`
- `get_flow_order_ptr()`
- `run_d8_rivers()`
- `run_tectonics(dt)`
- `run_erosion(steps)`

`run_d8_rivers()` sorts cells from high to low elevation, routes each cell to
the steepest lower D8 neighbor, and accumulates upstream flow into downstream
cells. `flow_order` stores the upstream-to-downstream processing rank.

## WebGPU Bridge

`PS.sim.wasmBridge.uploadElevationToGpu()` creates a `Float32Array` view over
WASM linear memory and writes it directly into a GPU buffer:

```javascript
var runtime = PS.sim.wasmBridge.instantiateFromBase64();
var simBuffer = PS.sim.wasmBridge.createBuffer(runtime, 512, 512);
simBuffer.run_tectonics(1);
PS.sim.wasmBridge.uploadElevationToGpu({
  device: PS.gpu.device,
  targetBuffer: PS.sim.computeHarness.getBuffer("elevation").buffer,
  simBuffer: simBuffer,
  wasmExports: runtime.exports,
  width: 512,
  height: 512
});
```

The queue upload still copies bytes into GPU memory, as WebGPU requires, but the
CPU side uses a typed-array view over WASM memory instead of serializing through
JSON or intermediate object graphs.
