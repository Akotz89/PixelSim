# Pixeldarium — Codex Project Instructions

## Validation

Run `bash .codex/setup.sh` before committing. It checks:
- `node --check` on all JS files (syntax validation)
- `python3 -c "import ast; ast.parse()"` on all Python scripts (syntax validation)
- `git diff --check` (whitespace errors)
- Line ending consistency (must be LF)
- Agent studio pipeline manifest consistency
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

## AI Game Studio Workflow

When doing asset generation work, follow the workflow in AGENTS.md section
"AI Game Studio". Key commands:

### Generate a sprite
```
# Option 1: Use PixelLab MCP (preferred for pixel art)
#   Tools: create_character, create_tileset, create_map_object
#   See tools/agent-studio/docs/pixellab-api-reference.md

# Option 2: Use SpriteCook MCP
#   Tools: create_image_asset, animate_asset

# Option 3: Use gpt-image-2 with prompt templates
#   See tools/agent-studio/templates/prompt-templates.md

# Output raw PNG to tools/agent-studio/exports/
```

### Post-process a generated sprite
```bash
python3 tools/agent-studio/scripts/pipeline_runner.py \
  --input tools/agent-studio/exports/raw-sprite.png \
  --palette tools/agent-studio/source/pixeldarium-palette.json \
  --output tools/agent-studio/exports/processed/ \
  --tile-size 16
```

### Validate a sprite sheet
```bash
node tools/agent-studio/verify-sprite-sheet.js \
  tools/agent-studio/exports/processed/sprite-sheet.png
```

### Score acceptance
```bash
node tools/agent-studio/score-asset-acceptance.js \
  tools/agent-studio/exports/processed/sprite-sheet.png
```

### Python dependencies for post-processing
```bash
pip install Pillow numpy
```

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
tools/agent-studio/          — AI asset production (see AGENTS.md)
tools/agent-studio/scripts/  — Python post-processing pipeline
tools/agent-studio/source/   — Palette, style refs
tools/agent-studio/templates/ — Prompt templates
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
- Epics: AZR-254 to AZR-267 (game), AZR-404 (AI pipeline)
- Pipeline issues: AZR-414 to AZR-417
