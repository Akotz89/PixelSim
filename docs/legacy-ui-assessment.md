# Legacy UI Assessment

Date: 2026-06-02

## Current Runtime Truth

`index.html` no longer loads any `js/legacy/ui/*` runtime files.

The modern UI modules currently loaded are:

- `js/ui/hud.js`
- `js/ui/panels.js`
- `js/ui/controls.js`
- `js/ui/notifications.js`
- `js/ui/touch.js`
- `js/ui/spotlight.js`
- `js/ui/observation-overlays.js`
- `js/ui/timeline.js`
- `js/ui/foundation.js`
- `js/ui/summary.js`
- `js/ui/history-summary.js`
- `js/ui/inspect-history.js`
- `js/ui/inspect.js`
- `js/ui/camera-input.js`
- `js/ui/persistence-controls.js`
- `js/ui/interaction.js`
- `js/ui/setup.js`

## Phase 1 Scope Reconciliation

AZR-271, `E0-S4: Decompose ui.js + create js/debug/ infrastructure`, was scoped to create focused `js/ui` and `js/debug` files, keep each file under 500 lines, preserve the always-visible seed copy control, and keep debug tools tolerant of removal.

That scope was a decomposition/facade milestone. It did not explicitly require retiring every `js/legacy/ui` runtime file from `index.html`.

Therefore, Phase 1 can have met AZR-271 as written while still leaving unfinished architecture work in the UI lane. The remaining work should be tracked separately as UI module cleanup and legacy runtime migration, not hidden under the completed AZR-271 record.

## Remaining UI Lane Work

Linear issue AZR-366 tracks this as follow-up cleanup: the runtime migration is complete, but several modern UI modules still reflect the old multipart migration slices rather than final Pixeldarium UI ownership boundaries.

1. Split the migrated `js/ui/foundation.js` functions into focused HUD, controls, panels, and inspect modules.
2. Split the migrated `js/ui/summary.js` helpers into focused summary, ecosystem, lineage, and inspect modules where useful.
3. Split the migrated `js/ui/history-summary.js` helpers into focused event, ecosystem-history, and settlement-summary modules where useful.
4. Split the migrated `js/ui/inspect-history.js` helpers into focused event-log, trait-history, and inspect modules where useful.
5. Split the migrated `js/ui/interaction.js` helpers into focused camera, inspect, persistence-status, keyboard, and pointer-input modules where useful.
6. Split the migrated `js/ui/setup.js` bootstrap/event binding into focused setup modules where useful.
7. Keep static-browser and `file://` compatibility, root JS limited to `config.js`, and each JS module under 500 lines.

The loaded legacy runtime work that remained after UI retirement was tracked in `docs/legacy-runtime-assessment.md`. AZR-352 retired the non-UI runtime loader dependencies as follow-up work.

## Recent Correction

Commit `e940d85` moved touch gesture ownership out of `js/legacy/ui/part-07.js` into `js/ui/touch.js`, removed the legacy touch shard, and added mobile layout regression coverage. That was the first cleanup step in this lane, not the end of the UI migration.

Commit `4f10575` documented this assessment. The next implementation slice moved `js/legacy/ui/part-01.js` to `js/ui/foundation.js` so the runtime no longer loads that legacy shard.

The following implementation slice moved `js/legacy/ui/part-02.js` to `js/ui/summary.js`, reducing the loaded legacy UI shard count to four.

The next implementation slice moved `js/legacy/ui/part-03.js` to `js/ui/history-summary.js`, reducing the loaded legacy UI shard count to three.

The following implementation slice moved `js/legacy/ui/part-04.js` to `js/ui/inspect-history.js`, reducing the loaded legacy UI shard count to two.

The next implementation slice moved `js/legacy/ui/part-05.js` to `js/ui/interaction.js`, reducing the loaded legacy UI shard count to one.

The final implementation slice moved `js/legacy/ui/part-06.js` to `js/ui/setup.js`, removing `js/legacy/ui/*` from the runtime loader.

## AZR-366 Ownership Cleanup

Commit `d99e04f` handled persistence-schema cleanup outside the UI lane. The
AZR-366 UI cleanup slice splits the largest migrated interaction shard into
focused ownership modules:

- `js/ui/inspect.js`: inspect surface positions, inspectable entity resolution,
  and tile selection.
- `js/ui/camera-input.js`: pointer drag state, camera settle state, wheel zoom,
  canvas-to-tile conversion, and keyboard panning helpers.
- `js/ui/persistence-controls.js`: save/import/export status text and restart
  confirmation behavior.
- `js/ui/interaction.js`: remaining input action registration and shortcut
  dispatch bridge.

The runtime still uses static script tags through `PS.core.manifest`, keeps
`file://` compatibility, and keeps every `js/ui/*.js` file under 500 lines.
