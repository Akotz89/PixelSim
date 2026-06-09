# AZR-804 Visual Parity Gate

Date: 2026-06-09

Result: Pass for the first WebGPU-only Pixeldarium runtime proof scene.

This gate validates the current runtime proof scene against AZR-547 target qualities, the AZR-800 coverage ledger, and AZR-803 proof-scene evidence. It does not claim copied or literal one-to-one Songs-of-Syx parity. The accepted result is original Pixeldarium art rendered through the playable WebGPU runtime with comparable map-camera density, category coverage, and top-down readability.

## Evidence

Runtime proof-scene artifacts:

- `docs/visual-regression/azr-803/settlement-ground-desktop.png`
- `docs/visual-regression/azr-803/settlement-ground-desktop.metrics.json`
- `docs/visual-regression/azr-803/settlement-ground-local-desktop.png`
- `docs/visual-regression/azr-803/settlement-ground-local-desktop.metrics.json`
- `docs/visual-regression/azr-803/settlement-ground-mobile.png`
- `docs/visual-regression/azr-803/settlement-ground-mobile.metrics.json`

The PNG evidence is encoded from WebGPU texture readback because Chromium headless can produce black swapchain screenshots for WebGPU canvases. The readback path is still the runtime WebGPU terrain/proof rendering path, not Agent Studio preview output and not Canvas2D fallback.

## Metrics

Settlement desktop proof scene:

- Zoom band: `settlement`
- Nonblank coverage: `1.0`
- Coarse color count: `34`
- Contrast range: `201.42`
- Accepted runtime families: `10`
- Families: `citizen`, `effect`, `settlement`, `stockpile`, `terrainGround`, `terrainTransition`, `terrainWater`, `vegetation`, `workStatus`, `worldUi`
- Draw coverage: terrain material, terrain transition, settlement, route, shadow, vegetation, citizen, stockpile, work/status, effect, world UI, particles

Local desktop proof scene:

- Zoom band: `local`
- Nonblank coverage: `1.0`
- Coarse color count: `38`
- Contrast range: `201.42`
- Accepted runtime families: `10`
- Terrain transition draws: `67`

Mobile proof scene:

- Zoom band: `settlement`
- Accepted runtime families: `10`
- Draw coverage preserves terrain, transition, settlement, actor, overlay, and particle categories.

## AZR-547 Comparison

- Layered modest sprites: pass. The runtime scene composes terrain, transitions, settlement structures, stockpiles, citizens, vegetation, overlays, particles, and UI/status marks from accepted asset families.
- Water and shore/transition readability: pass. The proof scene asserts accepted terrain-water and terrain-transition draw counts and includes shallow/deep water material cells.
- Deferred lighting direction: partial pass. WebGPU G-buffer/compositor and point-light paths are active; the first proof scene has light/effect overlays and point-light capable terrain, but broader seasonal/day-night lighting remains future polish.
- Shadow readability: pass for settlement-scale proof. Settlement shadows are drawn through WebGPU and included in runtime draw metrics.
- Animated environmental richness: partial pass. Particles are active and visible; tree sway, crown shimmer, falling leaves, and season color cycles remain second-pass production polish rather than blockers for this first runtime parity gate.

## AZR-800 Comparison

AZR-800 reported 19 accepted handoff packs, 15 runtime-integrated categories, and two remaining open gaps: proof-scene rendering and second-pass production polish. AZR-803 burns down the proof-scene rendering gap by exercising the accepted runtime families together in WebGPU. The remaining second-pass polish is tracked by follow-up visual work, especially biome atlas expansion and camera feel.

## No-Copy Boundary

Runtime scan command:

```bash
rg -n "Songs of Syx|Songs-of-Syx|SoS|SettColors|Ground.txt|Water.txt|pixeldarium-agent-studio|candidate-only|extracted reference|copied reference|copied UI|copied pixels" js assets shaders index.html package.json data
```

Result: no matches.

During this gate, the terrain material sheet metadata and runtime palette comments were corrected from reference-provenance wording to Pixeldarium-original runtime wording, and `assets/pixeldarium-equivalence/terrain/terrain_materials_v0.*` was regenerated with a Pixeldarium-original material palette.

## Orientation And Runtime Source

- Top-down-only: pass for the runtime proof scene. The proof scene uses atlas terrain and map-camera entity marks; no side-view, oblique, isometric, or character-sheet perspective is introduced.
- Runtime-only: pass. Evidence is produced by `tests/visual/screenshot.test.js` against `index.html` with the active renderer reported as `webgpu`.
- WebGPU-only: pass. `npm test` includes `webgpu mandate checks passed`, and the visual gate waits for the active renderer name to be `webgpu`.
- No fallback: pass. The proof path uses WebGPU texture readback and Node PNG encoding for evidence; it does not add Canvas2D or WebGL fallback.

## Verification

Commands run serially:

```bash
PIXELDARIUM_WRITE_PROOF_EVIDENCE=1 npm run test:visual
npm run test:visual
npm test
npm run build
```

Results:

- Evidence visual gate passed.
- Normal visual gate passed with average frame time `24.457ms` and peak `32.4ms`.
- Full `npm test` passed.
- `npm run build` passed. Vite still reports the known non-module script bundling warning for `js/core/namespace.js` and `js/core/loader.js`, then exits successfully.

## Open Follow-Ups

- AZR-872: biome tile atlases for forest, desert, water, mountain, and tundra should broaden terrain variety beyond the first accepted terrain material proof sheet.
- AZR-871: camera zoom momentum and pan coasting should improve map-camera feel after visual parity is functionally covered.
- AZR-420: complete art bible remains useful as the Phase 0 durable style contract for future generated assets.

No blocking defect remains for AZR-804.
