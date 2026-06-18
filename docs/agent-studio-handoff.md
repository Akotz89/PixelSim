# Pixeldarium Agent Studio Handoff

Pixeldarium Agent Studio is the private, dependency-capable production pipeline
for concept art, sprites, animation previews, modeling references, audio,
narrative/copy validation, evidence bundles, and asset QA.

The source of truth for studio tooling is outside this runtime repo:

- Local root: `/mnt/c/Users/Aaron/Azyrra/projects/pixeldarium-agent-studio`
- GitHub: `Akotz89/Pixeldarium-Agent-Studio`
- Linear project: `Pixeldarium Agent Studio`

## Runtime Boundary

Pixeldarium remains a zero-dependency game runtime:

- `index.html` must run from `file://`.
- Runtime code stays under `js/` using the `PS.*` namespace and script tags.
- No Node, Python, DCC, browser-automation, media-processing, AI-generation, or
  external API dependency can be required to play the game.
- Raw studio outputs, work orders, reports, provider jobs, generated evidence,
  and credentials stay out of this repo.

## Accepted Handoff Shape

Agent Studio outputs can enter this repo only through a reviewed runtime
integration change. That change should include:

- Accepted asset files placed under the runtime asset path chosen by the game
  integration issue.
- Any required runtime manifest, loader, or script-tag changes.
- Evidence that the output follows `docs/pixeldarium-art-bible.md`.
- A short provenance note naming the studio job, source asset, and acceptance
  evidence without copying raw reports or secrets.
- Focused runtime tests or visual evidence for the integration.

Do not integrate generated assets directly from raw studio exports.

## Game-Ready Export Contract

The studio-side export folder for a game-ready sheet is:

```text
exports/{category}/{name}/
```

The export must contain:

```text
{name}.png
{name}.json
```

It may also contain:

```text
{name}_normal.png
```

Only reviewed static outputs cross into the game repo. The runtime destination
is `assets/{category}/`, with `assets/manifest.json` and `assets/manifest.json.js`
updated by the integration patch.

The metadata JSON must match the Phase 0.2 grid format consumed by
`PS.assets.SpriteSheet`:

```json
{
  "type": "grid",
  "tileWidth": 32,
  "tileHeight": 32,
  "columns": 8,
  "rows": 1,
  "names": [
    "terrain.grass.0",
    "terrain.grass.1"
  ]
}
```

Rules:

- `type` is `grid`.
- `tileWidth`, `tileHeight`, `columns`, and `rows` are positive integers.
- Sheet width equals `tileWidth * columns`.
- Sheet height equals `tileHeight * rows`.
- `names`, when present, contains no more entries than grid cells.
- Optional normal maps match the sprite sheet dimensions.

## Studio Quality Gates

Studio validation must run before a runtime integration patch is opened:

- Required PNG and JSON files are present and named after the export directory.
- Sheet dimensions match the grid metadata exactly.
- Sheet dimensions are no larger than 2048x2048 pixels.
- Tile dimensions are between 8 and 128 pixels.
- Opaque pixels use colors from the Pixeldarium palette.
- Alpha is clean: every pixel alpha value is either `0` or `255`.

These gates belong in the private Studio repo. They can be implemented with
Python, Node, Pillow, DCC tooling, AI adapters, or any other generation
dependency needed for asset production. None of those dependencies may be
required to run `index.html` or any game runtime script.

## Required Checks

Run these from `/mnt/c/Users/Aaron/Azyrra/projects/pixeldarium` before accepting
studio output into runtime:

```bash
bash .codex/setup.sh
rg -n "agent-studio|tools/agent-studio" index.html js
```

The `rg` command must return no matches. Studio tooling may be mentioned in
documentation, Linear, GitHub PR text, or provenance notes, but runtime files
must not load or depend on it.

Run this from `/mnt/c/Users/Aaron/Azyrra/projects/pixeldarium-agent-studio`
before handing off a candidate:

```bash
npm run validate
```

## Cleanup Rule

The old in-game-repo `tools/agent-studio` copy has been removed. New studio
work should be created in the private studio repo.
