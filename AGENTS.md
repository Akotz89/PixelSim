# Pixeldarium — Agent Instructions

## Project Identity

Pixeldarium is a planet-scale pixel simulation engine. Song of Syx-inspired,
running primordial→galactic civilization in pure HTML/CSS/JS. No frameworks,
no server, runs from `file://` protocol.

## Architecture Decisions (Mandatory)

These 7 decisions are locked. Do not deviate without explicit user approval.

### D1: WebGPU Primary + WASM Compute
All rendering MUST use WebGPU (`navigator.gpu`). WebGL2 is legacy migration
debt only, not a runtime fallback or acceptance path. Browsers without WebGPU
must show a WebGPU-required failure state and stop startup. No Canvas 2D for
simulation rendering. No Three.js, PixiJS, or external abstractions.

WASM (WebAssembly via `WebAssembly.*`) is the compute backend for CPU-heavy
simulation work (tectonic, river pathfinding, erosion). WASM modules are
compiled offline with `wasm-pack` and committed as `.wasm.js` base64 sidecars
— identical pattern to WGSL shader sidecars. No WASM compilation at runtime.

WebGPU compute shaders (WGSL) replace the WebGL2 ping-pong FBO pattern for
all simulation data passes. Shaders load via `.wgsl.js` sidecars that set
`window.SHADER_*_WGSL` globals.

Web Workers are permitted for WASM simulation work. Workers init from a blob
URL (not a direct `file://` path) to work under the `file://` protocol.

### D2: Decoupled Accumulator Loop
Fixed-timestep simulation at 60 TPS, decoupled from render via accumulator
pattern. Never tie sim updates to `requestAnimationFrame` rate.

### D3: Typed Arrays for Mass Entities
Organisms, food, particles use `Float32Array`/`Uint16Array` struct-of-arrays.
Complex entities (settlements, star systems) use classes.

### D4: PS.* Namespace + ES Module Loader
All runtime code shares the `PS.*` namespace, but source files are loaded as ES
modules through `js/core/loader-esm.js`. Use real `import` / `export`
statements for cross-module dependencies. Do not reintroduce legacy
`var X = window.X` preambles or new `window.*` migration globals.

### D5: Centralized State + Event Bus
Single `PS.world` state object. All cross-system communication via
`PS.events.emit()` / `PS.events.on()`. No direct cross-file function calls
for state changes.

### D6: Epoch Registry with Always-On Layers
Geological and atmospheric layers run in ALL epochs. Epoch-specific systems
register via `PS.epochs.register()`. No hardcoded era if/else chains.

### D7: Chunk-Aligned Spatial Indexing
Spatial index chunks must align with render tile boundaries. Queries return
chunk-local results.

### Optimization Operating Model
Follow `docs/optimization-operating-model.md` for scale-sensitive work. Every
performance, rendering, streaming, or mass-simulation change must identify the
bottleneck, representation change, chunk/batch/aggregate boundary, readiness
state, perception contract, new constraint, and verification metric.

## File Structure

```
js/
  core/       namespace.js, config.js, events.js, assert.js, log.js, math.js
  render/     gpu.js, wgsl-shader-manager.js, webgpu-targets.js,
              webgpu-gbuffer.js, webgpu-compositor.js, webgpu-renderer.js,
              webgpu-surface-tile.js, webgpu-globe.js, webgpu-entity.js,
              webgpu-surface-underlay.js, surface-tile-batcher.js,
              camera.js, globe.js, terrain.js, entities.js
  wasm/       (committed .wasm.js base64 sidecars — dev build output)
  workers/    sim-worker.js (WASM simulation, blob URL init)
  sim/        loop.js, world.js, organisms.js, food.js, terrain.js
  layers/     geology.js, atmosphere.js, ocean.js, biosphere.js
  spatial/    grid.js, chunks.js, queries.js
  epochs/     registry.js, epoch-*.js
  ui/         hud.js, menu.js, panels.js, inspect.js
  persist/    save.js, load.js, migrate.js
```

## Coding Conventions

- Follow `CODING_STANDARDS.md`; the global `code-quality` Gemini plugin also
  enforces these rules from
  `C:\Users\Aaron\.gemini\config\plugins\code-quality\`.
- Keep new files focused and below 500 lines where practical.
- Keep new functions under 200 LOC and below cognitive complexity 30.
- Export public APIs with ES module exports and attach behavior under `PS.*`
  when the runtime namespace needs it.
- Use `const`/`let` for new code. Do not introduce new `var` declarations.
- Seeded deterministic RNG via `PS.math.random()`
- Errors must hard crash: `PS.assert(condition, message)` pauses sim and throws
- No silent fails, no try/catch swallowing errors
- No `innerHTML` assignment, no `eval()` / `new Function()`, no hardcoded
  secrets, and no TODO/FIXME without a Linear issue key.

## Error Philosophy

If the sim is failing, it MUST hard crash and error loudly. No silent
degradation. The debug panel (`#debug-output`) must show the full error.

## Testing

- Tests go in `tests/` directory
- Run with `node --check` for syntax validation
- Browser-based smoke tests for runtime verification
- Tests must verify deterministic behavior for same seed
- For milestone work, run `npx fallow health` and
  `node scripts/run-all-tests.js`; report known baseline failures separately
  from new regressions.

## Antigravity Command Safety

Antigravity `run_command` must not use inline WSL/bash loops such as
`wsl ... bash -c "for f in ...; do node --check $f; done"`. That command
shape is fragile because Windows/PowerShell layers can expand bash variables
before WSL receives them. Put multi-step bash bodies in a checked-in or scratch
`.sh` file and run `wsl -d Ubuntu-24.04 -- bash /mnt/c/.../script.sh`.

## Runtime Constraints

- Must work from `file://` protocol (no server required)
- No external CDN dependencies at runtime
- No external libraries or frameworks at runtime
- GitHub Pages deploys from main branch root

**Native browser APIs** — WebGPU (`navigator.gpu`), WASM (`WebAssembly`), and
Web Workers are all browser built-ins and are explicitly permitted and preferred.
They are NOT external dependencies.

**WASM build exception** — `wasm-pack` is a development-time compiler tool
(like ImageMagick for sprites, or Python for palette processing). The compiled
`.wasm` binary is base64-encoded into a `.wasm.js` sidecar and committed to
the repo. No npm, no node_modules, no runtime build step. The browser only
ever loads a plain `<script src="wasm/X.wasm.js">` tag.

**Worker blob URL pattern** — Web Workers under `file://` must be initialized
from a blob URL (construct worker source in a JS string, create a Blob, use
`URL.createObjectURL`). Direct `new Worker('path/to/file.js')` is blocked by
browser null-origin policy on `file://`.

## Agent Studio Handoff

Pixeldarium Agent Studio is now a separate private tooling project:

- Local root: `/mnt/c/Users/Aaron/Azyrra/projects/pixeldarium-agent-studio`
- GitHub: `Akotz89/Pixeldarium-Agent-Studio`
- Linear project: `Pixeldarium Agent Studio`

This game repo remains the zero-dependency runtime. Do not add Node, Python,
DCC, AI-generation, media-processing, or external API requirements to the
runtime path.

The only valid handoff from Agent Studio into this repo is a reviewed runtime
integration change that lands accepted assets and updates runtime manifests or
script tags as needed. Raw outputs, work orders, reports, adapter jobs,
provider credentials, generated evidence, and production-lane tooling stay in
the private studio repo.

When a runtime change needs image-generation source material, route the studio
job through an approved private tooling adapter such as `run-openai-image-job.js`
and import only reviewed runtime assets through a separate integration patch.

Runtime boundary checks:

```bash
bash .codex/setup.sh
rg -n "agent-studio|tools/agent-studio" index.html js
```

The `rg` command must return no matches before runtime changes are considered
clean. See `docs/agent-studio-handoff.md` for the full handoff contract.

## Planning Artifacts

All planning documents: `skills/planning-artifacts/gdds/gdd-Pixeldarium-2026-06-01/`
- `gdd.md` — Game Design Document
- `game-architecture.md` — Architecture blueprint
- `linear-stories.md` — Story specifications
- `epics.md` — Epic overview
- `decision-log.md` — Decision rationale

## Linear Integration

- **Linear project: Pixeldarium** (AZR team) — GAME RUNTIME ONLY
- Do NOT file pipeline, tooling, art production, or Agent Studio issues here.
  Those belong in the "Pixeldarium Agent Studio" Linear project.
- Epics: AZR-254 to AZR-267 (E0-E13), AZR-825 (Simulation-First Planet Engine)
- Branch naming: `aaronkotz89/azr-NNN-title`
- See AZR-885 for the audit that enforced this boundary.
