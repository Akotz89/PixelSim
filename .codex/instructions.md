# Pixeldarium — Codex Project Instructions

## Validation

Run `bash .codex/setup.sh` before committing. It checks:
- `node --check` on all JS files (syntax validation)
- `python3 -c "import ast; ast.parse()"` on all Python scripts (syntax validation)
- `git diff --check` (whitespace errors)
- Line ending consistency (must be LF)
- Standalone Agent Studio validation from `../pixeldarium-agent-studio`
- Runtime boundary isolation (no tooling references in `js/` or `index.html`)

Do not run inline WSL/bash loops through Antigravity `run_command`. If a
validation command needs shell variables, loops, multiline bodies, or multiple
commands, write it to a `.sh` file first and run that script with
`wsl -d Ubuntu-24.04 -- bash /mnt/c/.../script.sh`.

## Architecture Constraints

Read [AGENTS.md](../AGENTS.md) for the 7 mandatory architecture decisions (D1-D7).
Key constraints that affect every edit:

1. **PS.* namespace** — All functions must be under `var PS = {};` namespace
2. **No ES modules** — Use `<script>` tags, not import/export
3. **Files < 500 lines** — Split if approaching limit
4. **var only** — Use `var`, not `let` or `const` (broadest compat)
5. **Hard crash on errors** — Use `PS.assert()`, never silently swallow
6. **No external dependencies** — No npm, no CDN, no frameworks at runtime
7. **WebGPU required** — Use `navigator.gpu` / `PS.gpu`. WebGL2 is not a fallback or acceptance path.
8. **WASM compute** — CPU-heavy sim work uses Rust compiled via `wasm-pack`.
   The .wasm binary is base64-encoded to a .wasm.js sidecar before commit.
   `wasm-pack` is a dev tool, not a runtime dep. No browser-time compilation.
9. **WGSL shaders** — Shaders are .wgsl.js sidecars setting `window.SHADER_*_WGSL`.
10. **Workers via blob URL** — `new Worker(blobUrl)` pattern required for file://.

## Agent Studio Handoff

Asset generation and production tooling now live in the standalone private
Agent Studio repo:

```text
/mnt/c/Users/Aaron/Azyrra/projects/pixeldarium-agent-studio
```

Do not recreate `tools/agent-studio` in this runtime repo. For asset generation,
work orders, AI image adapters, post-processing, validation reports, and raw
outputs, switch to the standalone studio repo and run its validation there.

This runtime repo may receive only reviewed game-ready assets plus the minimal
runtime manifest/script changes required by a scoped integration issue. Follow
`docs/agent-studio-handoff.md` before accepting any studio output.

## File Structure (Post-E0)

```
js/core/    — namespace, config, events, assert, log, math
js/render/  — gpu.js (WebGPU primary), wgsl-shader-manager.js, webgpu-*.js
              surface-tile-batcher.js, camera.js, entities.js
js/sim/     — loop, world, organisms, food, terrain
js/layers/  — geology, atmosphere, ocean, biosphere
js/spatial/ — grid, chunks, queries
js/epochs/  — registry, epoch-*.js
js/ui/      — hud, menu, panels, inspect
js/persist/ — save, load, migrate
js/workers/ — sim-worker.js (WASM compute, blob URL init)
wasm/       — X.wasm.js sidecars (base64-encoded wasm-pack output)
shaders/    — X.wgsl.js (WGSL compute/render)
docs/agent-studio-handoff.md — Runtime-safe Agent Studio handoff contract
```

## Testing

- Tests in `tests/` directory
- Syntax validation: `node --check <file>`
- Browser smoke tests for runtime behavior
- Deterministic: same seed must produce same results

## Save Format

See [docs/save-format.md](../docs/save-format.md) for the persistence schema.
Current version: 1. Do not change save format without version bump.

## Linear Integration

- All work tracked under AZR team, Pixeldarium project
- Branch naming: `aaronkotz89/azr-NNN-description`
- Epics: AZR-254 to AZR-267 (game), AZR-825 (simulation-first engine)
- Agent Studio pipeline issues belong in the separate Pixeldarium Agent Studio
  Linear project, not this runtime project.
