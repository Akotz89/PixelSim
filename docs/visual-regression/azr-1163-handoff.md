# AZR-1163 Handoff

## Scope

AZR-1163 is the coverage-continuity milestone for zoom transitions. The patch
keeps stable parent/stale-ready terrain visible while child chunks stream, avoids
presenting black or uncovered local chunks, and adds WebGPU readback evidence for
the no-blank visual gates.

This handoff intentionally excludes later art and material polish.

## Patch Slice

- `js/render/lod.js` exposes the frame-level zoom contract through
  `getFrameContract()`.
- `js/render/pipeline.js` consumes `zoomFrame` before layer drawing and publishes
  readiness coverage in frame stats.
- `js/render/terrain.js` draws stable underlay before detail tiles and hides
  partial child coverage when local or settlement chunks are incomplete.
- `js/render/surface-render-cache.js` tracks stable-underlay and fallback
  coverage stats.
- `js/render/surface-tile-batcher.js` keeps settlement parcel fill cells in the
  same numeric-key cache path as base terrain cells.
- `tests/visual/screenshot.test.js` and
  `tests/helpers/screenshot-browser.js` provide WebGPU readback gates and current
  evidence images under `docs/visual-regression/current/`.
- `scripts/capture-zoom-video.js` writes zoom-through video evidence under
  `output/playwright/azr1163-local-current/`.

The surrounding worktree contains older Codex/session WIP and should not be
cleaned as part of this handoff.

## Evidence

Current targeted checks:

```text
node tests/lod-layer-alpha.test.js
node tests/surface-render-fallback.test.js
node tests/planet-zoom-anchor.test.js
node tests/zoom-input-feel.test.js
node tests/render-layer-order.test.js
node tests/webgpu-surface-tile.test.js
node tests/webgpu-tile-lights.test.js
node tests/dense-proof-scenes.test.js
node tests/visual-quality-gate.test.js
npm run test:visual
PIXELDARIUM_CAPTURE_LABEL=azr1163-local-current node scripts/capture-zoom-video.js
rg -n "agent-studio|tools/agent-studio" index.html js
```

Latest `npm run test:visual` evidence:

- local, region, continent, settlement, accepted-terrain, entity, and HUD cases
  use WebGPU readback gates.
- mobile pan readback: `opaqueCoverage: 1`, `nonblankCoverage: 1`,
  `blackishCoverage: 0`.
- mobile pan cache: stable underlay required and drawn with policy
  `stable-parent-underlay-before-detail-tile`.
- continuous zoom sweep: `localAnchoredFrames: 9`,
  `maxAnchorErrorDeg: 1.421e-14`, `peakFrameMs: 7.4`.

Latest zoom-through capture evidence:

- `blackSegments: []`.
- `localAnchoredFrames: 100`.
- strict local `maxAnchorErrorDeg: 2.487e-14`.
- `maxRawAnchorErrorDeg: 7.319` remains as a diagnostic for the early
  planet-band projection transition, not the local anchored zoom contract.

Linear also requests deployed Browser/Tailscale capture from
`https://homepc.tail437cf6.ts.net/`. The host is reachable on port 443, but the
page currently returns HTTP 502 and does not load the Pixeldarium app, so that
deployed evidence must be refreshed after the Tailscale service is healthy.
