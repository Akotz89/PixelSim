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
