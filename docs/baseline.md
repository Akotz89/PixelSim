# Pixeldarium — Pre-Restructure Baseline

**Captured**: 2026-06-01  
**Commit**: `da3416c` (main, post-merge of spherical-mechanics branch)  
**Purpose**: Reference point before E0 restructure to track regression and progress.

## Codebase Metrics

### File Size Summary

| File | Lines | Role |
|------|-------|------|
| planet.js | 3,294 | Earth-scale projection, surface chunks, LOD, zoom |
| render.js | 3,250 | All rendering — Canvas 2D, globe, terrain, entities |
| settlements.js | 2,481 | Camps → outposts → colonies → empire progression |
| persistence.js | 1,965 | IndexedDB + JSON save/load |
| ui.js | 1,728 | Menu, HUD, inspect, trait panels, event log |
| main.js | 1,429 | Game loop, world init, update tick, draw |
| render-terrain-cache.js | 1,337 | Terrain chunk caching for render |
| style.css | 1,496 | Full UI styling |
| organisms.js | 866 | Organism lifecycle, traits, lineage |
| terrain.js | 549 | Terrain generation |
| food.js | 416 | Food spawning, spatial indexing |
| config.js | 228 | All constants in flat CONFIG object |
| index.html | 191 | Entry point, script tag loading |
| state.js | 180 | DOM refs + monolithic world object |
| utils.js | 74 | RNG, clamp, tile index |
| **Total source** | **19,484** | |
| tests/planet-zoom-anchor.test.js | 2,391 | Planet zoom anchor tests |
| tests/food-index.test.js | 83 | Food spatial index tests |
| **Total with tests** | **21,958** | |

### Code Structure Metrics

| Metric | Value |
|--------|-------|
| Source files | 15 |
| Test files | 2 |
| Total global functions | 773 |
| CONFIG constants | 198 |
| Files > 1000 lines | 7 (violates <500 target) |
| Files > 2000 lines | 4 |
| Largest file | planet.js (3,294 lines) |

### Architecture State (Pre-E0)

| Aspect | Current | Target (Post-E0) |
|--------|---------|-------------------|
| Rendering API | Canvas 2D (`ctx.fillRect`) | WebGPU raw API |
| Namespace | ~773 global functions | PS.* namespace |
| Sim loop | rAF + accumulator (coupled) | Decoupled accumulator |
| Entity storage | JS arrays + objects | Typed arrays (SoA) |
| State management | Monolithic `world` object | PS.world + event bus |
| Spatial indexing | Bucket-based | Chunk-aligned |
| Epoch system | Hardcoded era if/else | Registry pattern |
| Module loading | `<script>` tags | `<script>` tags (keep) |
| Max file size | 3,294 lines | <500 lines |

## Performance Metrics (Runtime)

The game tracks these metrics in the HUD (Status tab):

| Metric | Source | Description |
|--------|--------|-------------|
| FPS | `world.fps` | Frames per second (rAF rate) |
| TPS | `world.tps` | Simulation ticks per second |
| Update ms | `world.updateMs` | Average update time per frame |
| Draw ms | `world.drawMs` | Average draw time per frame |
| Max Update ms | `world.maxUpdateMs` | Peak update time since last stats window |
| Max Draw ms | `world.maxDrawMs` | Peak draw time since last stats window |
| Surface Cache | chunk/sample counts | LOD surface chunk cache utilization |
| Render Chunks | visible/cached/pending/generated/fallback | Terrain render pipeline stats |

### How to Capture Runtime Baseline

1. Open `index.html` in Chrome/Edge
2. Let simulation run for ~60 seconds at 1x speed
3. Open the Status tab in the menu
4. Record FPS, TPS, Update, Draw, Max values
5. Open Chrome DevTools → Performance → Record 10 seconds
6. Note: JS heap size, total layout time, paint time

### Captured Runtime Baseline (2026-06-01, Chrome DevTools)

**Sample 1** — 1x speed, ~10 seconds in, Organisms era:

| Metric | Value |
|--------|-------|
| FPS | 120 |
| TPS | 4 |
| Update ms | 0.30 |
| Draw ms | 0.05 |
| Max Update ms | 0.40 |
| Max Draw ms | 0.20 |
| Tick | 117 |
| Organisms | 27 |
| Food | 516 |
| JS Heap | 26 MB used / 28 MB total |

**Sample 2** — 5x speed, ~25 seconds in, Settlements era:

| Metric | Value |
|--------|-------|
| FPS | 120 |
| TPS | 26 |
| Update ms | 0.97 |
| Draw ms | 0.12 |
| Max Update ms | 1.30 |
| Max Draw ms | 0.40 |
| Tick | 921 |
| Organisms | 157 |
| Food | 515 |
| Settlements | 3 |
| JS Heap | 26 MB used / 28 MB total |

**Key observations:**
- FPS runs at 120 (likely 120Hz display or uncapped rAF)
- Update cost scales ~3x from 27→157 organisms (0.30→0.97ms)
- Draw cost is negligible at default zoom (<0.2ms)
- Memory is light at 26MB — well below expected 50-200MB (chunks not yet generated)
- TPS at 1x is 4 (expected from CONFIG.SIM_UPDATE_INTERVAL_MS=200 with speed multiplier)

### Performance Bottleneck Areas (from code review)

1. **planet.js surface chunk generation** — Procedural terrain at 8 LOD levels, LRU cache (1536 chunks)
2. **render.js globe rasterization** — Per-pixel biome calculation for globe view
3. **settlements.js update loop** — O(n²) settlement-to-settlement route checks
4. **render-terrain-cache.js** — Progressive chunk rendering with frame budget
5. **organisms.js spatial queries** — Bucket-based food search per organism

## Syntax Validation

All 13 JS files pass `node --check`:

```
config.js: OK
state.js: OK
utils.js: OK
planet.js: OK
terrain.js: OK
food.js: OK
organisms.js: OK
settlements.js: OK
render-terrain-cache.js: OK
render.js: OK
persistence.js: OK
ui.js: OK
main.js: OK
```

## Git State

- **Branch**: main
- **Commit**: da3416c
- **Remote**: https://github.com/Akotz89/Pixeldarium.git
- **Clean working tree**: Yes (post-merge)
- **Total merged PRs**: 79 + 1 direct merge
- **CI**: GitHub Pages auto-deploy on main push
