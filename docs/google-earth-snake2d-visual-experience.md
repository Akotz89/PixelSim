# Google Earth x Snake2D Visual Experience

Date: 2026-06-12

Linear scope: Pixeldarium Phase 1, anchored by AZR-1163 for the first
implementation milestone. Agent Studio work belongs in the Pixeldarium Agent
Studio project and may only hand off reviewed runtime assets/manifests.

## Goal

Deliver a continuous planetary zoom experience that feels like a living
planetary atlas and resolves into dense, top-down simulation readability. The
reference targets are Google Earth-style scale continuity and Snake2D/Songs of
Syx-style structural rendering quality, but Pixeldarium must remain original in
identity, assets, UI, palette, simulation, and runtime architecture.

The playable runtime remains pure HTML/CSS/JS/WebGPU plus committed WASM/WGSL
sidecars. No runtime frameworks, tool dependencies, generation pipelines, or
Agent Studio internals may enter the game runtime.

## Current Runtime Audit

Verified live surface:

- Tailscale HTTPS runtime: `https://homepc.tail437cf6.ts.net/`.
- Local Vite target: `http://127.0.0.1:5173/`.
- Browser screenshot evidence:
  - `output/zoom-audit/00-orbit.png`
  - `output/zoom-audit/01-zoom.png`
  - `output/zoom-audit/02-zoom.png`
  - `output/zoom-audit/03-zoom.png`
  - `output/zoom-audit/04-zoom.png`
  - `output/zoom-audit/05-deep-zoom.png`

Pixeldarium has useful foundation already:

- WebGPU is mandatory and startup fails loudly when no compatible adapter exists.
- `PS.camera.unified` maps screen, surface meters, lat/lon, and world/tile
  coordinates.
- `PS.render.lod.getLayerAlphas()` blends globe, underlay, and tile layers.
- Surface chunks expose address lineage and parent fallback chunks.
- WebGPU terrain atlas batching, G-buffer, compositor, point-light, water,
  entity, and underlay modules exist.
- Runtime docs define zoom-band visual contracts, visual gates, file:// safety,
  and Agent Studio handoff boundaries.

Verified failure causes:

Verified failure causes from the live Tailscale runtime:

- Orbit-to-region zoom still magnifies a blurred globe texture instead of
  resolving a true multi-resolution planet tile pyramid.
- `js/render/webgpu-globe.js` builds one terrain texture from composited world
  tile colors, capped at `2048x1024`, and linearly samples it on the sphere.
  This is why zooming smears continent/shore detail before local tiles appear.
- The local detail layer appears as a square or stepped chunk footprint over a
  flat parent layer. It does not read as a continuous descent into terrain.
- The parent underlay can become a flat brown wash rather than a stable
  scale-appropriate terrain representation.
- Deep zoom can finally show local tiles, but they read as a dark noisy blob
  with hard chunk edges, not as terrain-first simulation content.
- Browser console logs repeatedly emitted
  `[Pixeldarium][WARN][performance] Dropped simulation catch-up backlog` during
  zoom capture, so interaction and streaming are competing with simulation
  catch-up.
- `PS.render.terrain.advanceSurfaceWork()` currently returns `0`, so the
  terrain module does not expose an active per-frame surface work budget at the
  handoff point where the zoom contract needs one.
- The WebGPU renderer still has facade methods for sprites, sprite batches,
  shadows, and particles that increment stats but can fail to prove real
  readable pixels. Dense top-down readability cannot be accepted while any
  presentation path is only statistical.
- Some visual evidence is still regression-oriented rather than
  quality-oriented. A frame can match an older golden while failing the actual
  Google Earth x Snake2D experience bar.

The first implementation issue is therefore not art polish. It is AZR-1163:
the zoom LOD coverage and parent-underlay contract must prevent blank/black
holes, square patch pop-in, and smeared parent magnification before detailed
asset work can be judged.

## Product Experience

Orbit:

- Show a coherent planet with land, water, atmosphere, epoch tint, climate and
  terrain fields, aggregate biology, broad pressure, and capped event markers.
- The watcher should read what kind of planet this is and what is changing.

Region:

- Show atlas-scale surface intelligence: chunked terrain, biome boundaries,
  watersheds, pressure fields, population clusters, resource gradients, routes,
  and territories.
- Sparse representatives appear only near selected or high-interest areas.

Local:

- Show simulation-ground truth with terrain atlas cells, ecology
  microstructure, water and shore edges, routes, resources, hazards,
  representative organisms, settlement footprints, and intent/status cues.
- Detail must explain state, pressure, movement, scarcity, population,
  settlement growth, or selected intent.

Inspect:

- Show a causal microscope, not a decorative close-up. Inspection must connect
  the visible tile/entity/event to upstream causes such as biome, temperature,
  moisture, salinity, pressure, population context, lineage history, and
  timeline events.
- Molecular or micro-scale views are valid only when initialized from macro
  simulation fields.

## Architecture Direction

Create one frame-level zoom contract so camera, chunks, overlays, entities, and
UI do not infer scale independently.

`PS.camera` should produce a stable zoom frame with:

- architecture zoom and named band,
- meters per pixel and sample meters,
- cursor anchor state and anchor error,
- visible and preload chunk sets,
- parent fallback/underlay policy,
- blend windows,
- interaction state,
- causal LOD tier.

Create a lightweight `PS.render.causalLod` contract that maps each zoom band to
the causal fields required for rendering. Wider zooms are not "less detail";
they are aggregate truth. Local and inspect zooms are representative facades
over the same simulated state.

WebGPU rendering should converge on these passes:

1. Surface field and underlay pass for aggregate causal fields.
2. Terrain atlas/data-texture pass for ready chunk cells.
3. Entity facade pass for organisms, citizens, food, routes, markers, and
   selected state.
4. G-buffer pass for diffuse plus normal/height/material data.
5. Light pass for ambient, sun/epoch, tile lights, and point lights.
6. Shadow/displacement pass for water, smoke, lava, vegetation, buildings, and
   actor shadows.
7. World overlay pass for observation, selection, and debug overlays.
8. Composite pass to the WebGPU canvas, with DOM limited to HUD and panels.

Agent Studio owns generation, reference comparison, renderer-aware validation,
palette snapping, diffuse/normal production, provenance, and work orders. The
runtime consumes only accepted static assets, manifests, sidecars, and scoped
render code.

The durable render-capability gate lives in
`docs/visual-quality-gate.md#snake2d-equivalent-render-capability-matrix` and
is tracked by AZR-1138. The matrix is required for any claim that Pixeldarium has
an equivalent engine capability for materials, textures, shaders, lighting,
effects, animation, particles, displacement, shadows, and final composites.

## Acceptance Criteria

- Wheel zoom preserves cursor anchoring from orbit through inspect scales, with
  bounded anchor error and no hard jump between globe, underlay, tile, entity,
  and inspect layers.
- Pan and zoom use inertia/coasting without blank frames, black chunks, or
  unsupported silent fallback.
- Parent underlay and fallback detail remain visible while finer chunks stream.
- Every accepted visual layer declares the causal state it represents and the
  zoom bands where it is readable.
- WebGPU sprite, shadow, particle, point/tile light, and world UI presentation
  paths draw real pixels and expose renderer stats.
- Visual promotion gates fail black, empty, UI-only, or semantically useless
  frames even when they match an older golden.
- Settlement/ground proof scenes include roads, yards/farms, stockpiles or
  resources, citizens/organisms, vegetation, shadows, particles, route/status
  overlays, and inspectable causal state.
- Runtime boundary checks prove `index.html` and `js/` do not load Agent Studio
  tooling or raw generated artifacts.
- Simulation-first rule is preserved: visuals represent causal simulated state.
  If upstream environmental parameters produce collapse or ugly states, the
  runtime exposes that state and its causes instead of tuning the output to look
  good.

## Non-Goals

- No copied Google Earth UI, satellite imagery language, or camera chrome.
- No copied Songs of Syx pixels, palettes, silhouettes, factions, UI layouts,
  sheets, or asset identity.
- No Three.js, PixiJS, Canvas2D runtime renderer, WebGL fallback, or runtime
  npm/tool dependency.
- No close illustrated village scenes, hero buildings, isometric projection,
  portraits, decorative bloom, or painterly detail that does not represent
  simulation state.
- No full-fidelity simulation of every organism at every zoom band.
- No Agent Studio scripts, reports, raw provider output, credentials, or
  production-lane tooling in the playable runtime.

## Implementation Sequence

1. Update Linear and this spec with live Tailscale zoom evidence.
2. Complete AZR-1163: zoom LOD coverage and parent-underlay contract.
3. Add the frame-level zoom/causal LOD contract and tests.
4. Replace smeared globe magnification with a multi-resolution planet tile
   pyramid: orbit, continent, region, local, and inspect/z-level sources.
5. Fix cursor anchoring across broad zoom bands and add continuous zoom checks.
6. Tighten visual promotion gates so empty/black/UI-only/square-patch frames
   fail.
7. Implement real WebGPU entity, shadow, particle, and light presentation where
   placeholder renderer methods remain.
8. Implement AZR-1074 as the dense simulation readability proof-scene suite:
   globe/continent context, dense local/settlement readability, and actor/effect
   readability capture targets.
9. Extend Agent Studio handoff manifests only where runtime assets need causal
   field metadata, keeping tooling in the private Studio repo.
10. Run targeted runtime/unit checks first, then GPU-capable Browser/Tailscale
   and file:// visual evidence before marking each issue done.

## AZR-1163 First Milestone Proof Scene

- Affected zoom band: Orbit through local/settlement.
- Initial state: Seed `PIXEL-2026` loaded at `https://homepc.tail437cf6.ts.net/`.
- Trigger: Continuous wheel or pinch zoom from orbit toward a local terrain
  target.
- Visible tell: Parent terrain remains visible at every frame while child
  chunks resolve; child detail feather/blends into the parent instead of
  appearing as an isolated square.
- Behavior: Camera stays cursor/finger anchored and zooms continuously without
  black holes, UI-only frames, or smeared low-resolution parent magnification.
- Consequence: The watcher reads a continuous descent through planet,
  continent/region, local, and inspect scale.
- Termination condition: Local/settlement tile detail covers the viewport or the
  stable parent underlay is still explicitly visible behind incomplete child
  coverage.
- Pass/fail observation: Fail if any frame shows black/unrendered holes, a
  square local patch over a flat parent, smeared globe magnification at local
  scale, or simulation catch-up warnings dominating during the capture.
- Evidence artifact: Browser/Tailscale screenshot or video sequence under
  `output/zoom-audit/` plus visual test metrics.
- Verification command: `node tests/lod-layer-alpha.test.js`,
  `node tests/surface-render-fallback.test.js`,
  `node tests/render-layer-order.test.js`,
  `node tests/planet-zoom-anchor.test.js`,
  `node tests/zoom-input-feel.test.js`, and `npm run test:visual`.

## Verification Gates

Narrow checks for planning and first implementation:

```bash
node tests/camera-unified.test.js
node tests/planet-zoom-anchor.test.js
node tests/lod-layer-alpha.test.js
node tests/webgpu-mandate.test.js
node tests/webgpu-gbuffer-compositor.test.js
node tests/webgpu-entity.test.js
node tests/visual-quality-gate.test.js
node tests/no-canvas2d-source.test.js
node tests/studio-integration.js
```

GPU-capable visual promotion:

```bash
npm run test:visual
npm run test:visual-regression
```

Boundary check:

```bash
rg -n "agent-studio|tools/agent-studio" index.html js
```

That boundary check must return no matches for runtime changes.
