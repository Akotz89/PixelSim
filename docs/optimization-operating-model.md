# Pixeldarium Optimization Operating Model

Date: 2026-06-04

## Purpose

This document turns the Vercidium optimization analysis into Pixeldarium
engineering rules. It is not a list of tricks. It is a model for deciding what
Pixeldarium should simulate, store, transfer, render, and defer at each scale.

## Core Thesis

Pixeldarium should not simulate or render full truth at full resolution
everywhere. The engine should keep authoritative aggregate state at planetary
scale, then create high-detail representative facades only where the watcher's
attention requires them.

The repeated move is:

1. Identify the real bottleneck.
2. Change the representation or lifecycle that creates it.
3. Align the unit of work with chunks, batches, or aggregate populations.
4. Make readiness explicit before data crosses a thread, worker, GPU, or zoom
   boundary.
5. Preserve player perception, not literal implementation detail.
6. Re-measure and document the new constraint introduced by the optimization.

## Pixeldarium-Specific Principles

### 1. Aggregate State Is Authoritative

For planet-scale systems, authoritative state should be aggregate or field
based. Representative entities exist for inspection, animation, and watcher
attachment, not as the sole source of truth.

Applies to:

- Biology: aggregate populations plus representative organisms.
- Microbes: density/chemistry fields plus notable bloom records.
- Civilization: settlement/nation aggregates plus selected inspectable actors.
- Climate/geology: fields and layer state, not per-pixel mutable objects.
- Food webs: population/territory/pressure summaries before individual agents.

Failure mode: treating every visible dot as the authoritative simulation model
will cap scale, create GC pressure, and make deep time impossible.

### 2. Chunks Are The Universal Boundary

Render chunks, spatial-index chunks, terrain cache entries, worker jobs,
dirty-region invalidation, LOD transitions, and population-density cells should
share boundaries where possible.

This avoids translation overhead between systems and gives every pipeline stage
the same unit of scheduling, caching, eviction, prefetch, and invalidation.

Failure mode: separate render, sim, worker, and query grids produce hidden
conversion work and stale edge behavior.

### 3. WebGPU Owns Pixel Throughput

Planet rendering is a GPU workload. Canvas2D is not a runtime requirement or
fallback target. Production simulation rendering uses WebGPU storage buffers,
WGSL shaders, atlases, instancing, and batched layers.

The target is not "draw the same pixels faster." The target is to stop sending
repeated CPU-side pixel work through the frame loop.

Failure mode: optimizing Canvas2D chunk generation can improve obsolete code
while preserving the wrong long-term boundary.

### 4. Batch By Meaning

Render and simulation should use the largest semantically valid unit:

- Terrain layer batch.
- Overlay layer batch.
- Entity type batch.
- Chunk draw range.
- Population density field.
- Representative set for the active viewport.
- Event markers for history and observation tools.

Failure mode: per-entity or per-tile loops in the hot render path will dominate
once visual richness increases.

### 5. Readiness Is A First-Class State

Workers, image loading, terrain chunk generation, WebGPU buffer/texture upload,
simulation summaries, and zoom transition prefetching must use explicit states:

- requested
- pending
- ready
- promoted
- stale
- evicted
- failed

The renderer should show the newest ready representation rather than blocking
on the newest requested one.

Failure mode: using a just-requested chunk, asset, or buffer as if it is ready
causes stutter, corrupt visuals, or forced waiting.

### 6. LOD Is A Perception Contract

LOD should preserve what the watcher can understand at a given zoom, not what
the underlying simulation literally contains.

Orbit view should show fields, ranges, flows, and event markers. Region view
should show clusters, territories, and selected representatives. Local view
should show trait-derived organism morphology, behavior, targets, and
inspectable histories.

Failure mode: drawing too much detail at high zoom wastes work; drawing too
little detail at local zoom breaks the watcher fantasy.

### 7. Packed Data Needs Explicit Limits

Packed tile, organism, overlay, and event buffers are correct when their limits
are known. Every packed representation needs documented ranges and migration
rules.

Examples:

- Tile/material IDs.
- Biome IDs.
- Overlay density bits.
- Species/population/representative IDs.
- Chunk local coordinates.
- Atlas indices.
- Layer masks.

Failure mode: hidden encoding limits become bugs when a later phase adds more
terrain types, species, overlays, or zoom levels.

## Diagnostic Sequence For Main Development

Before optimizing or implementing a large system, answer these questions:

1. What is the bottleneck: CPU submission, GPU memory bandwidth, shader ALU,
   worker transfer, simulation tick cost, GC, IO, or player-perception overdraw?
2. What representation creates that bottleneck?
3. Can the data be derived, packed, batched, aggregated, cached, or deferred?
4. What is the largest valid unit of work?
5. What readiness state proves the data is safe to consume?
6. Which zoom levels need exact detail, and which only need perceptual or
   aggregate detail?
7. What new constraint does the optimization introduce?
8. Which metric will prove the bottleneck moved?

## Immediate Implications

### Rendering

- Prioritize WebGPU storage-buffer tilemap and batched layer rendering.
- Treat Canvas2D surface caches as obsolete unloaded code until deleted; they
  must not become runtime requirements or acceptance criteria.
- Keep layer ordering formal and batchable.
- Upload compact tile/material/overlay state to the GPU; do not rebuild large
  canvases every frame.

### Simulation

- Keep fixed timestep and render interpolation.
- Use typed arrays and pools for mass entities.
- Keep aggregate populations authoritative.
- Recompute expensive summaries on cadence or dirty changes, not every frame.
- Align spatial index and population summaries with render chunks.

### Streaming And Loading

- Keep loading and chunk generation asynchronous, but promote only ready data.
- Continue rendering stale/placeholder chunks when fresh work is pending.
- Track worker round-trip time, in-flight jobs, fallback count, and promotion
  latency.

### Observation Tools

- Observation overlays should be field summaries, not expensive per-entity
  redraws.
- Event spotlight should slow time and reveal the causal chain behind state
  changes.
- Inspection should show representative detail plus aggregate context.

## Pass/Fail Standard

An implementation follows this model only if it can state:

- the bottleneck it targets,
- the representation it changes,
- the batch/chunk/aggregate boundary it uses,
- the readiness rule for consuming generated data,
- the player-perception contract it preserves,
- the failure modes and encoding limits,
- and the metric that proves success.

If it only "makes the current code faster" without those answers, it is not
enough for Pixeldarium's scale.
