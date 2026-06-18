# WebWorker Evaluation

## Context

AZR-281 evaluates whether Pixeldarium should move simulation ticks from the main thread into a WebWorker during Phase 1 Foundation.

The production constraints remain unchanged:

- zero dependencies
- no build step
- vanilla browser APIs
- `file://` support
- no server headers

## Prototype

The spike worker lives at `js/workers/sim-worker.js`. It is a classic worker script with no imports. The worker accepts transferred `Float32Array` buffers for organism-style state, runs a deterministic synthetic tick, and transfers the buffers back to the main thread.

The validation harness is `tests/webworker-spike.test.js`. It opens `index.html` through a `file://` URL in Chromium, creates `new Worker("js/workers/sim-worker.js")`, measures a main-thread synthetic tick, measures worker round-trip latency, and checks whether `SharedArrayBuffer` is available.

## Findings

Direct `new Worker("js/workers/sim-worker.js")` does not launch under `file://` in the tested Chromium environment. It fails because the page origin is `null` and the worker file cannot be accessed.

A blob URL fallback can launch under `file://`, but that fallback requires injecting or constructing worker source on the main thread.

`SharedArrayBuffer` is not a reliable Phase 1 option because it requires cross-origin isolation through COOP/COEP headers. Those headers are not available when the game is opened directly from `file://`.

Transferable `ArrayBuffer` communication works, but the production simulation state is not yet worker-shaped. Adopting the worker now would require a larger data contract for terrain, food, settlements, events, persistence, and render interpolation.

Measured in Chromium against `file://` with 10,000 synthetic entities:

| Path | Average |
| --- | ---: |
| Main-thread synthetic tick | 0.26ms |
| Worker compute time | 0.40ms |
| Worker round trip | 0.72ms |
| Transfer overhead | 0.32ms |

The synthetic worker compute time is similar to the main-thread compute time, while transfer overhead dominates the total worker round trip.

## Decision

Stay single-threaded for Phase 1.

Rationale:

- AZR-280 already brought the measured 10,000-organism average tick under the Linear target.
- Direct worker files are blocked in the tested Chromium `file://` path; blob fallback works but adds bootstrapping complexity.
- The worker spike proves transferable typed arrays are viable, but transfer overhead is larger than the synthetic compute work while `SharedArrayBuffer` is unavailable for the required `file://` path.
- Moving the current simulation into a worker would create a second state owner before the render, persistence, and event systems are fully typed-array backed.

## Follow-Up Contract If Revisited

If a later phase adopts workers, the main-thread to worker contract should use transferred typed-array snapshots:

- organism state buffers
- food state buffers
- terrain read-only numeric buffers
- command/event queue buffers
- summary result buffers for HUD and render interpolation

The worker should own fixed-step simulation state. The main thread should own rendering, input, IndexedDB persistence, and UI.

---

## WASM Worker Update — 2026-06-07

> **The decision above applies only to plain JS workers. It does NOT block
> WASM workers.** WASM workers use a different initialization pattern.

### Why the original decision does not apply to WASM

The evaluation above tested `new Worker('js/workers/sim-worker.js')` — a
direct file path — which fails under `file://` because the browser assigns a
null origin to the page and blocks file-path worker loading.

**WASM workers use a blob URL**, not a file path. The worker source is
inlined as a JS string, wrapped in a `Blob`, and initialized via
`URL.createObjectURL(blob)`. This pattern works under `file://` in Chrome,
Edge, and Safari without any server or headers.

The WASM binary itself is not fetched at runtime either — it is
base64-encoded into a `.wasm.js` sidecar (set `window.WASM_*_B64`) and
loaded via a plain `<script src>` tag. The worker decodes and initializes
it synchronously using `Uint8Array.fromBase64(window.WASM_X_B64)` and the
wasm-bindgen init function.

### SharedArrayBuffer status

`SharedArrayBuffer` was unavailable in the original evaluation because
`file://` cannot set `Cross-Origin-Isolation` headers. This remains true.

For the WASM worker integration (AZR-855), the bridge uses **Transferable
`ArrayBuffer`** (not SharedArrayBuffer): the worker transfers ownership of
the result buffer to the main thread, which zero-copy uploads it to the GPU
via `device.queue.writeBuffer()`. No SharedArrayBuffer required.

### AZR-855 implementation

`js/workers/sim-worker.js` now keeps the existing synthetic `tick` spike and
adds `wasmInit` / `wasmTick` messages for the Rust WASM sidecar. The worker can
be launched as a blob worker under `file://`, evaluates the wasm-bindgen glue,
base64 sidecar, and `PS.sim.wasmBridge` as one inline no-fetch program, then
runs tectonics, D8 rivers, and erosion on a worker-owned `SimBuffer`.

`js/sim/sim-worker-client.js` owns the main-thread client contract:

- create a blob worker from caller-provided source
- request/response correlation by message id
- `wasmInit` and `wasmTick` message builders
- `uploadElevationResultToGpu()` for `device.queue.writeBuffer()`

The worker returns elevation as a transferred `ArrayBuffer` snapshot. The main
thread wraps that buffer in a `Float32Array` view and uploads that view directly
to WebGPU. This avoids JSON/object serialization and avoids an additional
main-thread CPU copy, but it is not `SharedArrayBuffer`; the worker still copies
from WASM linear memory into the transferable result buffer before posting.
