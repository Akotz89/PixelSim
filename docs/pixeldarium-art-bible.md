# Pixeldarium Art Bible

Linear scope: AZR-420.

This is the controlling visual contract for Pixeldarium runtime assets,
procedural asset generation, and Agent Studio handoff. It defines the original
Pixeldarium pixel style used by the WebGPU-only runtime. Asset generation may
use external art for study, but final pixels, silhouettes, layouts, palettes,
UI identity, and animation sheets must be original Pixeldarium work.

## Runtime Boundary

- The playable runtime is WebGPU-only. Do not design assets around WebGL,
  Canvas2D, SVG, DOM, or renderer fallback paths.
- CPU-bound serial generation and validation work may use WASM where it improves
  determinism or throughput, but the loaded game remains browser-native.
- Runtime assets live under `assets/` and are declared through
  `assets/manifest.json` and `assets/manifest.json.js`.
- Agent Studio outputs must pass `docs/agent-studio-handoff.md` before entering
  the runtime repo.
- Candidate-only files, raw generation prompts, raw reference exports, and
  provider evidence stay outside the playable runtime.

## Visual Pillars

- Planet-first: terrain, water, climate, coastlines, and elevation remain
  readable before buildings or actors dominate the frame.
- Simulation-readable: every visible mark should explain biome, pressure,
  movement, scarcity, population, settlement growth, or selected intent.
- Pixel-native: all authored and generated marks resolve to crisp pixel cells
  with nearest-neighbor sampling and stable atlas coordinates.
- Original-reference discipline: references may describe density, map-view
  clarity, or production constraints, but they must not supply copied pixels,
  copied palettes, copied UI layouts, traced silhouettes, or extracted files.

## Perspective

- Primary view: top-down 3/4 simulation-map read.
- Terrain: straight-down material read with local relief implied through color,
  pixel pattern, ridge marks, water masks, and shadows.
- Characters, creatures, props, and buildings: slight top/front read is allowed
  when it improves recognition at small sizes.
- Avoid isometric projection, hero-building composition, close illustrated
  village scenes, large portrait characters, and decorative scene art that does
  not communicate simulation state.

## Dimensions

| Asset type | Canonical size | Notes |
| --- | --- | --- |
| Terrain tile source cells | 16x16 | Minimum authored material cell for local terrain, transitions, and procedural terrain detail. |
| Accepted terrain atlas cells | 32x32 | Current runtime sheets in `assets/terrain/*.png` and accepted handoff sheets use 32x32 grid cells for richer material variation. |
| Entity sprite, small | 16x32 | Citizens, small organisms, tiny workers, and map-scale actors. |
| Entity sprite, medium | 32x32 | Medium organisms, stockpiles, equipment, compact resources, and readable props. |
| Entity sprite, large | 32x64 | Large organisms, tall props, markers, and special interactable entities. |
| Building sprite, small | 32x32 | Huts, room footprints, machines, outposts, and compact facility blocks. |
| Building sprite, large | 64x64 | Halls, larger structures, docks, farms, yards, and compound blocks. |
| UI icon | 32x32 | Runtime icons, status marks, tech/culture symbols, overlay controls, and small HUD glyphs. |
| Overlay marker | 16x16 or 32x32 | Use 16x16 for dense fields and 32x32 for selected or high-priority state. |
| Normal-map cell | Match diffuse | Optional normal maps must match the diffuse sheet dimensions exactly. |

Use power-of-two cell dimensions when adding new sheet families. Keep sheets no
larger than 2048x2048 unless a future issue raises the runtime limit and updates
the handoff gate.

## Sprite Sheet Layouts

| Sheet type | Layout | Naming example |
| --- | --- | --- |
| Character walk sheet | 4 columns x 4 rows | `entity-citizen-worker-sheet.png` |
| Character direction rows | down, left, right, up | Row order is fixed for animation tooling. |
| Tileset sheet | 16x16 grid | `terrain-wetland-sheet.png` when a full tileset is needed. |
| Runtime terrain strip | 8 columns x 1 row | Current biome atlases use `assets/terrain/{biome}.png`. |
| Icon strip | 8 icons horizontal | `ui-status-sheet.png` with matching atlas metadata. |
| Effect strip | 8 or 16 frames horizontal | Particles and material effects should remain compact strips. |

Every sheet metadata file must use the grid contract consumed by
`PS.assets.SpriteSheet`: `type`, `tileWidth`, `tileHeight`, `columns`, `rows`,
and optional `names`. Sheet width must equal `tileWidth * columns`; sheet height
must equal `tileHeight * rows`.

## Animation Specs

| Animation | Frames | Directional | FPS | Loop |
| --- | --- | --- | --- | --- |
| Walk cycle | 4 frames per direction | yes | 8 | yes |
| Idle | 2 frames | optional | 4 | yes |
| Attack | 3 frames | optional | 8 | no |
| Death | 4 frames | no | 8 | no |
| Work/action | 4 frames | optional | 8 | yes while task is active |
| Spawn/emerge | 4 frames | no | 8 | no |
| Ambient terrain | 2-4 frames | no | 4-8 | yes, sparse use only |

Motion should favor readable state over smooth interpolation. Animate only the
pixels needed to show intent: feet, tools, carried resources, flags, water
ripples, smoke, glints, particle bursts, or selected biological traits.

## Style Direction

- Outlines: characters, creatures, props, and buildings use a 1px dark outline
  only where it improves separation from terrain. Terrain has no hard outline.
- Shading: use 2-3 values per color: base, shadow, and highlight. Add a fourth
  accent only for selected state, resource signal, biological trait, or hazard.
- Terrain texture: terrain is material-driven. Use pixel clusters, erosion
  marks, lichen, reeds, foam, cracked soil, scree, snow edges, and coast bands
  to explain biome and pressure.
- Buildings: buildings read as settlement footprints first: rooms, yards,
  roads, canals, docks, farms, walls, storage, and production blocks.
- Actors: at settlement scale actors may be micro-sprites or speckles, but
  selected representatives must remain inspectable at local zoom.
- UI icons: prefer simple silhouettes with one interior signal. Avoid glossy
  badges, beveled frames, and dense pictograms that blur at 32x32.

## Color And Palette

The runtime palette source is the asset registry consumed by terrain, surface
color, and atlas code. Current checks verify that terrain rendering resolves
through `PS.assets.getPaletteColor`, `PS.render.terrain.getBaseBiomeColor`, and
`PS.atlas.getPaletteRgb`.

Required palette behavior:

- Terrain uses naturalistic but heightened colors with enough contrast to read
  at small pixel sizes.
- Each terrain material has base, dark, and accent/highlight ranges.
- Organism lineage colors stay distinct enough to identify related groups at
  region and local zoom.
- Civilization colors may vary by culture, but must not override terrain
  readability.
- Opaque runtime pixels must stay inside accepted Pixeldarium palette ranges
  for their asset family.
- Avoid neon channels, pure RGB primaries, copied external palettes, and
  single-hue asset families that collapse under zoom.

Current accepted terrain atlas families:

- grass
- forest
- desert
- water
- ocean
- mountain
- tundra
- wetland

The deterministic terrain atlas generator is
`scripts/build-terrain-biomes.js`. If a generated atlas color changes, update
the generator, regenerated PNG/JSON sidecars, manifest entries, and tests
together.

## Naming Convention

Single assets:

```text
{category}-{name}-{variant}.png
```

Sprite sheets:

```text
{category}-{name}-sheet.png
{category}-{name}-atlas.json
```

Runtime manifest sprite IDs:

```text
{category}.{name}.{variant}
```

Examples:

```text
terrain-wetland-sheet.png
terrain-wetland-atlas.json
terrain.wetland.0
entity-citizen-worker-sheet.png
entity.citizen_worker.walk_down_0
ui-status-sheet.png
ui.status.hungry
```

Use lowercase ASCII names. Separate words with hyphens in filenames and
underscores inside sprite IDs only when the runtime family already uses that
shape. Do not encode provider names, reference names, prompts, or source file
paths in runtime asset names.

## Asset Family Contracts

### Terrain

- Terrain cells should read as material, not decoration.
- Add terrain detail by signal: moisture, elevation, slope, river, coast,
  roughness, vegetation, ice, resource pressure, settlement disturbance.
- Terrain transitions must blend between material families without hard seams.
- Use no outline. Shape comes from value, cluster boundaries, masks, and relief.

### Organisms And Citizens

- Small organisms use 16x32 when the body needs vertical read; compact creatures
  may use 32x32 when width matters.
- Visual traits may alter body size, limb count, appendages, markings,
  posture, color family, camouflage, and selected intent.
- Keep silhouettes continuous across evolution; the system should show gradual
  change, not hard creature classes.

### Buildings And Settlement Props

- Buildings are map-footprint readable first and facade-readable second.
- Small buildings use 32x32. Large rooms or compound blocks use 64x64.
- Variants should encode function: dwelling, storage, production, civic,
  defense, agriculture, dock, infrastructure, machine, ruin.

### UI And Overlays

- UI icons are 32x32 and must remain legible over dark and light panels.
- World overlays use batched WebGPU draw paths and should not require DOM
  layout, Canvas2D drawing, or image filters.
- Selection and alert marks should reserve the brightest accents for active
  player-visible state.

## Quality Gate

Before accepting a new art family into runtime:

1. Confirm dimensions and metadata match this bible.
2. Confirm filenames and sprite IDs follow the naming convention.
3. Confirm colors are original Pixeldarium palette values or accepted generated
   variations.
4. Confirm the asset communicates simulation state at the target zoom band.
5. Confirm no runtime file loads Agent Studio raw exports or candidate-only
   sources.
6. Run the focused asset tests plus the visual gate relevant to the changed
   family.

Minimum checks:

```bash
node tests/art-bible.test.js
node tests/asset-manifest.test.js
node tests/render-palette-registry.test.js
node tests/visual-quality-gate.test.js
```

Broaden to `npm test` and `npm run test:visual` when assets, manifests,
rendering, or camera behavior changed.
