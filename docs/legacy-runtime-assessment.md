# Legacy Runtime Assessment

Date: 2026-06-02

## Purpose

AZR-352 tracks the architecture follow-up after Phase 1: remove runtime dependence on `js/legacy/*` shards once modern `PS.*` modules have parity.

This document is the current domain inventory and migration decision log for non-UI legacy runtime files. UI runtime retirement is covered separately in `docs/legacy-ui-assessment.md` and is complete: `index.html` no longer loads any `js/legacy/ui/*` scripts.

## Phase 1 Scope Reconciliation

Phase 1 Foundation is not proof that every `js/legacy/*` runtime shard is gone. Linear defines Phase 1 as planet rendering, performance foundation, WebGL2 migration, decoupled sim loop, spatial indexing, and project restructure. The completed E0 issues established the target architecture, removed root compatibility files, and retired the legacy UI runtime loader.

The legacy runtime retirement work was explicitly tracked by AZR-352 and its children:

- AZR-357: migrate food and organism runtime shards after the Phase 2 biological model gate.
- AZR-358: migrate settlement/civilization runtime shards after settlement model follow-up.
- AZR-359: migrate main-loop shards last, after the other runtime surfaces are stable.

Current audit result: `js/legacy/ui` may still exist as an empty local directory, but Git tracks no `js/legacy/ui/*` files and `index.html` loads no legacy UI scripts. Food, organism, settlement, civilization, and main-loop runtime have also moved under modern `js/*` modules. `index.html` no longer loads any tracked `js/legacy/*` runtime files.

## Current Runtime Inventory

`index.html` loads 0 non-UI legacy scripts:

| Domain | Runtime scripts | Decision |
| --- | ---: | --- |
| State/utils | 0 | Migrated in AZR-354 to `js/systems/state.js` and `js/core/utils.js`. |
| Persistence | 0 | Migrated in AZR-355 to focused `js/systems/persistence-*` modules after browser parity coverage. |
| Planet/terrain/render | 0 | Migrated in AZR-356 to ordered `js/render/*` modules with compatibility preserved. |
| Food/organisms | 0 | Migrated in AZR-357 to focused `js/sim/food-*` and `js/sim/organisms-*` modules after aggregate/representative model coverage. |
| Settlements | 0 | Migrated in AZR-358 to focused `js/sim/settlements-*` and `js/sim/civilizations-*` modules after progression coverage. |
| Main loop | 0 | Migrated in AZR-359 to focused `js/main-*` modules after all preceding runtime surfaces were stable. |

## State / Utils

Runtime scripts: none.

Decision: migrated in AZR-354. `index.html` no longer loads `js/legacy/state/*` or `js/legacy/utils/*`.

Target shape:

- `js/systems/state.js` owns DOM/world initialization surfaces.
- `js/core/utils.js` owns seed, RNG, tile index, clamp, and world-position compatibility helpers.

Verification:

- `.codex/setup.sh`
- `tests/globe-interaction.test.js`
- `tests/mobile-layout.test.js`
- Any tests that load world helpers directly.

## Persistence

Runtime scripts: none.

Decision: migrated in AZR-355. `index.html` no longer loads `js/legacy/persistence/*`.

Target shape:

- Keep `js/systems/persistence.js` as the facade.
- Focused implementation modules live in `js/systems/persistence-db.js`, `js/systems/persistence-save-data.js`, `js/systems/persistence-restore-core.js`, `js/systems/persistence-restore-entities.js`, and `js/systems/persistence-io.js`.

Verification:

- `tests/persistence-parity.test.js`
- `tests/globe-interaction.test.js`
- `bash .codex/setup.sh`

## Planet / Terrain / Render

Runtime scripts: none.

Decision: migrated in AZR-356. `index.html` no longer loads `js/legacy/planet/*`, `js/legacy/terrain/*`, `js/legacy/render-terrain-cache/*`, or `js/legacy/render/*`.

Target shape:

- Existing `js/render/*` modules own rendering behavior.
- Ordered compatibility surfaces live in `js/render/planet-view.js`, `js/render/planet-surface.js`, `js/render/planet-grid.js`, `js/render/terrain-hydrology.js`, `js/render/terrain-seeding.js`, `js/render/terrain-cache-runtime.js`, and `js/render/terrain-render-compat.js`. The old `pipeline-compat.js` shim was retired when the WebGPU pipeline became the owner of `window.drawWorld`.
- `js/core/planet-metrics.js` and `js/core/world-grid.js` continue to own shared calculations.
- Compatibility wrappers should disappear only after render and zoom-anchor tests cover direct `PS.render.*` API use.

Verification:

- `tests/planet-zoom-anchor.test.js`
- `tests/terrain-cache-canvas-pool.test.js`
- Visual smoke via `tests/mobile-layout.test.js` and `file://` browser console check.

## Food / Organisms

Runtime scripts: none.

Decision: migrated in AZR-357. `index.html` no longer loads `js/legacy/food/*` or `js/legacy/organisms/*`. `docs/biological-model-decision.md` chooses aggregate population records as authoritative and representative organisms as detailed watcher-facing facades, so the migration kept behavior stable while moving implementation under `js/sim/*`.

Target shape:

- `js/sim/food-runtime.js`, `js/sim/food-growth.js`, and `js/sim/food.js` own food behavior.
- `js/sim/organisms-traits.js`, `js/sim/organisms-indexes.js`, and `js/sim/organisms-behavior.js` own representative organism implementation.
- `js/sim/organisms.js` and `js/sim/evolution.js` own public organism/evolution facades.
- Aggregate biology records own population/species scale.
- Representative organism facades own inspectable local behavior.
- Typed-array fields include stable species, population, and representative IDs before migration is marked complete.

Verification:

- `tests/food-index.test.js`
- `tests/organism-runtime.test.js`
- `tests/spatial-index.test.js`
- Future E3/E4 trait/food-web tests.
- New aggregate population and representative organism persistence tests.

## Settlements

Runtime scripts: none.

Decision: migrated in AZR-358. `index.html` no longer loads `js/legacy/settlements/*`. The current settlement/civilization model was preserved and moved under focused simulation modules so Phase 3 work can iterate on explicit `PS.sim.*` facades instead of legacy shard paths.

Target shape:

- `js/sim/settlements.js` and `js/sim/civilizations.js` own the public surface.
- `js/sim/settlements-state.js`, `js/sim/settlements-growth.js`, `js/sim/settlements-founding.js`, `js/sim/settlements-routes.js`, and `js/sim/settlements-runtime.js` own settlement implementation.
- `js/sim/civilizations-orbital.js`, `js/sim/civilizations-probes.js`, `js/sim/civilizations-stars.js`, and `js/sim/civilizations-empire.js` own civilization progression implementation.

Verification:

- `tests/settlement-progression.test.js`
- Persistence tests covering all settlement/civilization fields.

## Main Loop

Runtime scripts: none.

Decision: migrated in AZR-359. Main loop code depended on namespace setup, world seeding, UI setup, simulation tick, render pipeline, worker mode, and startup sequencing, so it moved last after the other runtime surfaces were stable.

Target shape:

- `js/main.js` owns `PS.init()` and boot orchestration.
- `js/main-runtime.js` owns reset, event-log, and milestone helpers.
- `js/main-ecosystem-stability.js` and `js/main-ecosystem-summary.js` own ecosystem summary, stability, history, counters, and alerts.
- `js/main-simulation.js` owns world seeding, simulation tick updates, and pause state.
- `js/main-loop.js` owns frame loop, speed controls, single-step, stats aggregation, and `startGame()`.

Verification:

- `.codex/setup.sh`
- Browser `file://` console smoke.
- Time accumulator tests and any worker-mode tests.

## Next Implementation Order

AZR-352 has no remaining loaded `js/legacy/*` runtime migration lane. Future implementation should move through Phase 2 feature issues rather than the legacy runtime inventory.

## Standing Constraints

- Preserve `file://` static browser compatibility.
- Do not introduce a bundler, framework, or new runtime dependency.
- Keep script-tag loading and `PS.*` namespace surfaces.
- Keep every JS module under 500 lines.
- Keep root JavaScript limited to `config.js`.
- Keep the old project-name sweep clean; documentation should not reintroduce retired names.
