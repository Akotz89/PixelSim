# Getting Started

Pixeldarium is a zero-runtime-dependency browser simulation. It uses plain
script tags, the `PS.*` namespace, committed JSON/WGSL sidecars, and a required
WebGPU startup gate.

## Prerequisites

- Node.js for development commands and tests.
- A browser with WebGPU enabled for the playable runtime.
- No runtime package server is required. `index.html` must keep working from
  `file://`.

## Setup

```bash
npm install
npm test
npm run dev
```

`npm run dev` starts Vite for local HTTP testing. Vite is development tooling
only; the shipped runtime remains static HTML/CSS/JS.

## Project Map

- `index.html` contains the WebGPU canvas and UI shell.
- `config.js` is the bootstrap/default config source.
- `data/config.json` is loaded during startup and refreshes `CONFIG` plus
  `PS.config`.
- `js/core/namespace.js` owns the script manifest.
- `js/core/loader.js` injects scripts in dependency order.
- `js/assets/` loads images, JSON, text, sprite sheets, and file sidecars.
- `js/render/webgpu-*` owns the renderer path.
- `js/core/world-gen.js` owns deterministic world generation.
- `tests/` contains the Node and browser-backed verification suite.

## Add A Terrain Type

1. Add or update the terrain PNG and metadata under `assets/terrain/`.
2. Register the sheet in `assets/manifest.json` and regenerate the matching
   `.json.js` sidecar.
3. Add the tile definition to `data/tiles.json` and regenerate
   `data/tiles.json.js`.
4. Reference the tile from `data/biomes.json` when it belongs to a biome.
5. Run:

```bash
node tests/asset-manifest.test.js
node tests/tile-registry.test.js
node tests/tile-biome-data.test.js
npm test
```

## Add An Entity Type

1. Add the entity definition to `data/entities.json` and regenerate its sidecar.
2. Add sprite or atlas data under `assets/` when the entity has authored art.
3. Route rendering through the existing WebGPU entity/atlas path.
4. Run:

```bash
node tests/entity-registry.test.js
node tests/entity-atlas.test.js
npm test
```

## Change Simulation Parameters

Use `data/config.json` for runtime-tunable values. The debug console supports:

```text
get CONFIG.MAX_FOOD
set CONFIG.MAX_FOOD 1000
reset CONFIG
```

Changes made through the console are session-only. Durable changes belong in
`data/config.json` plus the sidecar.

## Verification

Use the narrowest relevant test while editing, then run `npm test` before
handoff. For rendered evidence, use:

```bash
npm run test:visual
```

When WebGPU is unavailable in headless Chromium, the expected smoke-test result
is a handled WebGPU-required stop, not a fallback renderer.
