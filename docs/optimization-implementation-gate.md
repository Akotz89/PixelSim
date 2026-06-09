# Optimization Implementation Gate

Linear scope: AZR-637.

Use this gate before implementing or marking ready any Pixeldarium rendering,
streaming, performance, mass-simulation, or observation issue.

## Required Gate Statement

Every gated implementation must state these fields in its implementation notes,
test evidence, or Linear handoff:

| Field | Required answer |
| --- | --- |
| Bottleneck | CPU submission, GPU bandwidth, shader ALU, worker transfer, simulation tick cost, GC, IO, or player-perception overdraw. |
| Representation or lifecycle boundary | What data shape, ownership model, promotion lifecycle, or render/simulation path changed. |
| Chunk, batch, or aggregate boundary | The largest valid unit of work: render chunk, dirty region, worker job, tile batch, entity batch, density cell, aggregate population, field, or representative set. |
| Readiness state | The state that proves generated data is safe to consume: requested, pending, ready, promoted, stale, evicted, failed, or a documented equivalent. |
| Player-perception contract | What the watcher must still understand at the affected zoom or interaction level. |
| New constraint or encoding limit | Packed ID range, atlas limit, queue cap, cache budget, representative count, chunk size, precision limit, or why none is introduced. |
| Proof metric | The measured value that proves the bottleneck moved: frame time, draw calls, upload bytes, worker round-trip, promotion latency, cache hit rate, GC allocation, entity count, or another issue-specific metric. |

If one of these fields is not applicable, the implementation must say why.

## Pass/Fail Rule

An implementation passes the AZR-637 gate only when:

1. The active Linear issue or final handoff includes all required gate fields.
2. Runtime changes use WebGPU batches, WGSL shaders, storage buffers, packed
   buffers, fields, chunks, or aggregate state for production pixel throughput.
3. Canvas2D is not a runtime requirement or fallback target. Transitional,
   unloaded Canvas2D files must not be accepted as active runtime paths.
4. Async or generated data is promoted only after a readiness state proves it is
   safe to consume.
5. Aggregate state remains authoritative at planetary scale, with
   representatives used as watcher-facing facades.
6. Packed data ranges and migration risks are documented before they become
   hidden constraints.
7. Verification includes a metric, not only a green test.

## Active Issue Handling

When the active issue is one of the AZR-637 steering issues, read it before
editing and apply the gate in the first implementation update:

- AZR-372: WebGPU Tile Renderer Core.
- AZR-383: Data-texture tilemap shader.
- AZR-368: Surface Render Performance Optimization.
- AZR-607: Deprecate redundant Canvas2D terrain cache path.
- AZR-471: Representative refresh performance.
- AZR-585: Architecture documentation.

For other rendering, streaming, performance, mass-simulation, or observation
issues, still apply the same gate.

## Handoff Template

```text
Optimization gate:
- Bottleneck:
- Representation/lifecycle boundary:
- Chunk/batch/aggregate boundary:
- Readiness state:
- Player-perception contract:
- New constraint or encoding limit:
- Proof metric:
```

## Current Gate Baseline

- `docs/optimization-operating-model.md` is the source of the model.
- `docs/biological-model-decision.md` is the canonical biology example:
  aggregate population state is authoritative and representatives are
  watcher-facing facades.
- `AGENTS.md` makes this gate mandatory for scale-sensitive work.
