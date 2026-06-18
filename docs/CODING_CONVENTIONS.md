# Coding Conventions

Pixeldarium is optimized for file-backed, browser-native runtime behavior. Code
should stay easy to inspect from source and safe to run from `file://`.

## JavaScript Shape

- Use plain script-tag JavaScript.
- Attach public APIs to `PS.*`.
- Do not use ES modules, imports, bundlers, runtime npm packages, CDNs, or
  framework abstractions.
- Prefer `var` in runtime source for broad browser compatibility.
- Keep files under 500 lines.
- Use kebab-case filenames.

## Runtime Boundaries

- WebGPU is required. Do not add WebGL2 or Canvas2D runtime fallbacks.
- WGSL shader text lives in `.wgsl` files with `.wgsl.js` sidecars.
- JSON runtime data lives in `data/` or `assets/` with `.json.js` sidecars.
- Agent Studio artifacts must be imported only as reviewed runtime assets,
  manifests, or docs.

## Configuration

- `config.js` provides bootstrap defaults.
- `data/config.json` is the runtime-loaded config source.
- `PS.config.refreshFromConstants()` updates derived config projections after
  data loads or debug-console overrides.
- Add validation to `PS.core.DataLoader` when new config data becomes
  startup-critical.

## Simulation

- Simulation runs through the fixed timestep accumulator.
- Deterministic world generation goes through `PS.core.worldGen.generateWorld`.
- Use seeded PRNG streams from `PS.core.createPRNG`; do not use `Math.random`
  in generation paths.
- Aggregate state is authoritative at planet scale. Representative entities are
  watcher-facing facades.

## Rendering

- Route rendering through the active WebGPU renderer facade.
- Keep chunk, batch, cache, and readiness boundaries explicit.
- Do not add per-frame full-world scans for visible-only detail.
- Track performance metrics when changing rendering, streaming, or mass
  simulation paths.

## Tests

- Add focused Node tests for pure logic and source/manifest contracts.
- Add Playwright tests only when browser behavior or screenshots matter.
- Keep `npm test` passing.
- Use `npm run test:visual` for screenshot evidence and visual gate changes.

## Comments

Use comments for non-obvious lifecycle, data packing, shader alignment, or
readiness-state behavior. Avoid comments that restate simple assignments.
