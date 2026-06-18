# Visual Quality Gate

Linear scope: AZR-364.

Pixeldarium's visual bar is Google-Earth-style navigation plus dense,
simulation-readable pixel detail. This gate applies to every change that touches
rendering, overlays, entities, UI, camera, zoom, terrain materials, particles,
or asset integration.

This is not permission to copy Songs of Syx. Runtime assets, layouts, UI,
sprites, code, and proprietary art must remain original.

## Required Checklist

Every visual or camera issue must state:

- Which zoom bands are affected.
- What the watcher must understand at each affected band.
- Whether the change alters WebGPU draw calls, buffer/texture uploads, worker
  promotion, entity batches, overlay batches, or UI occlusion.
- The stale or placeholder representation shown while newer data is pending.
- The screenshot, browser smoke, or pixel-sample evidence used for review.
- The performance metric used for continuous zoom or overlay rendering.
- The originality check used to avoid copied external assets or layouts.
- The proof scene required by `docs/proof-scene-acceptance.md` when the change
  alters user-visible gameplay, simulation, entity, VFX, camera, overlay, or
  interaction behavior.

Rendering, streaming, performance, mass-simulation, and observation work must
also pass `docs/optimization-operating-model.md` and
`docs/optimization-implementation-gate.md`.

## Zoom Band Contracts

| Band | Architecture zoom | Visual contract |
| --- | --- | --- |
| Orbit | `< 3` | Show the whole planet, climate/terrain fields, broad water/land forms, and event markers. Local representatives are not required. |
| Planet | `3-5.999` | Preserve stable Google-Earth zoom anchors and coarse biome, coast, atmosphere, and range readability. |
| Continent | `6-9.999` | Show chunked terrain families, large material regions, coastlines, water forms, and aggregate pressure without local clutter. |
| Region | `10-14.999` | Show local surface chunks, territory/pressure overlays, selected representative clusters, and readable material transitions. |
| Local | `15-18.999` | Show rich terrain material pixels, organisms/food/settlement facades, behavior cues, target cues, and inspectable context. |
| Settlement/Ground | `>= 19` | Show building-scale, route, citizen, vegetation, shadow, particle, and UI-world detail without z-fighting or UI occlusion. |
| Space | Future space view | Show planetary bodies, orbital assets, probes, star systems, and influence fields as aggregate-readable maps before local facade detail. |

Architecture zoom is derived from the configured camera anchor stops, so a
small number of runtime stops can still cover the full perception contract.

LOD must preserve player perception, not literal detail everywhere. Wider zooms
show fields, flows, and markers. Closer zooms add representatives and material
detail only where the watcher can inspect them.

## Camera Contract

Camera and zoom work must preserve:

- Smooth wheel zoom with stable screen anchor.
- Drag/pan without disorienting jumps.
- No visible black-frame gap during generation, shader loading, or LOD changes.
- No obvious pop-in when a higher-detail representation is pending.
- Direct `file://` playability from `index.html`.

Required checks after camera or zoom changes:

```bash
node tests/planet-zoom-anchor.test.js
node tests/globe-interaction.test.js
```

Browser evidence must include direct `file://` smoke with wheel and drag state
changes.

## Simulation Readability Contract

Visuals must communicate simulation state at a glance:

- Terrain: biome, elevation, water, coast, roughness, and material family.
- Resources: food/resource availability, scarcity, and recovery pressure.
- Biology: aggregate population density plus selected representatives.
- Routes and settlements: movement, territory, outposts, and colony growth.
- Overlays: climate, population, resources, atmosphere, and future pressure
  fields as batched summaries.
- UI: panels and dashboards must not hide the primary simulation view during
  normal play.

Decorative noise is not enough. Detail should explain state, history, pressure,
or action.

## Snake2D-Equivalent Render Capability Matrix

This matrix is the minimum engine capability bar for claims that Pixeldarium
can render a Songs-of-Syx/Snake2D-quality top-down simulation frame. It is a
capability target only. Do not copy Songs of Syx source, assets, UI, factions,
palettes, silhouettes, or identity.

Hard rule: do not copy Songs of Syx source or assets into Pixeldarium.

Reference study inputs:

- `_reference/songs-of-syx-source/CATALOG.md`
- `_reference/songs-of-syx-source/ENGINE_INVENTORY.md`
- `docs/songs_of_syx_sprite_study.md`

| Capability | Pixeldarium owner | Required proof |
| --- | --- | --- |
| Albedo/normal/material atlas contract | AZR-1137, AZR-549 | Agent Studio emits accepted albedo, normal, and material-channel metadata; runtime loader preserves static rects without loading Studio tooling. |
| G-buffer attachments | AZR-539, AZR-864 | WebGPU frame writes albedo plus normal/height/material data and compositor consumes those attachments. |
| Sprite/entity batching | AZR-1075, AZR-847 | Entity, citizen, vegetation, structure, resource, overlay, and effect batches submit real WebGPU pixels and expose truthful draw stats. |
| Ambient lighting | AZR-539, AZR-1084 | Ambient/sun lighting reads G-buffer normals and varies by time, epoch, and causal tile state. |
| Point lighting | AZR-550, AZR-1093 | Local lights render from simulated or proof-scene light sources without overbright additive mismatch. |
| Tile lighting | AZR-1084 | Per-tile indoor, cave, canopy, settlement, and outdoor ambient fields affect final frame with parent/fallback stability. |
| Shadows/stencil equivalent | AZR-550, AZR-1075 | Actor, vegetation, structure, and terrain shadows render in coherent composite order and are gated by zoom/LOD. |
| Displacement/distortion | AZR-1085, AZR-391 | Water, smoke, heat, lava, atmospheric, and similar effects can displace or distort sprites/terrain through WebGPU-only passes. |
| Particles/VFX | AZR-596, AZR-544, AZR-1075 | Particles render as simulation-readable weather/effects in dense proof scenes and are LOD/performance gated. |
| Animation frames | AZR-595, AZR-515 | Animated actors, vegetation, water, work/status, and effect sprites advance deterministically and remain readable at gameplay zoom. |
| Deterministic variation | AZR-499, AZR-553 | Variant, flip, offset, material, and density choices are deterministic from causal state and LOD budget. |
| Final composite order | AZR-1075, AZR-1138 | One WebGPU frame proves terrain, material normals, entities, shadows, particles/effects, tile lights, point lights, overlays, and HUD compose without fake stats or missing pixels. |
| Zoom/LOD integration | AZR-1073, AZR-553 | Orbit-to-ground zoom preserves cursor anchoring, parent underlay, chunk readiness, and scale-specific readability without blank chunks. |

Every row must have:

- A current owning Linear issue.
- Runtime source files or Agent Studio handoff files named in that issue.
- Acceptance criteria and non-goals.
- A targeted test command.
- Visual evidence when it changes player-visible rendering.

Rows may be marked incomplete, but they may not be claimed complete without
evidence from the runtime, tests, and relevant Linear issue comments.

## Actor-Scale Readability Gate

Actor-facing work must state the actor type, primary verb, visible tell,
simulation consequence, mitigation/adaptation/counterplay, affected zoom bands,
proof scene, and verification command. This applies to organisms, hazards,
factions, resources, settlements, citizens, and other entities.

VFX-facing work must state the simulation state being communicated, effect
layer, actor-scale readability test, dense-prop or overlap stress case,
hazard/resource/traversable-edge readability, and pass/fail observation.

Water, fog/weather, glow/light, fire, poison, decay, particles, and future magic
or technology fields must prove state communication when they claim to convey
state. Decorative polish must be labeled as decorative and must not be accepted
as simulation readability proof.

See `docs/proof-scene-acceptance.md` for the proof-scene fields and examples.

## Screenshot And Performance Evidence

Major visual changes must capture or explicitly refresh evidence for these
representative views:

- Orbit view.
- Continent view.
- Region view.
- Local view.
- Entity-visible local view when organisms, food, settlements, citizens, or
  space facades are touched.
- HUD-visible view when UI, dashboard, or panel layout changes.

Performance evidence must include the metric that proves the bottleneck moved.
Acceptable metrics include frame time, draw call count, terrain upload time,
worker round-trip time, promotion latency, visible chunk count, entity batch
count, or sampled WebGPU pixel coverage.

## Required Verification Commands

Use the narrowest relevant set, then broaden when the render path changed:

```bash
node tests/visual-quality-gate.test.js
node tests/planet-zoom-anchor.test.js
node tests/globe-interaction.test.js
node tests/observation-overlays.test.js
node tests/no-canvas2d-source.test.js
npm test
```

For direct runtime evidence, open:

```text
file:///C:/Users/Aaron/Azyrra/projects/pixeldarium/index.html
```

and record loader/generation readiness, WebGPU pixel samples, runtime errors,
and wheel/drag camera movement.
