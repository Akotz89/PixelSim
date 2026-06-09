# Pixeldarium Top-Down Simulation Art Contract

The controlling runtime-facing art contract is
`docs/pixeldarium-art-bible.md`.

Agent Studio may keep richer production notes in the private studio repo, but
runtime integration must follow `docs/agent-studio-handoff.md` and the
repo-local art bible.

Summary:

- target a very high straight-down simulation-map view with top-down 3/4
  readability where small sprites need identity;
- make terrain dominate before buildings;
- represent settlements as small rectilinear footprints, farms, yards, roads,
  canals, docks, and production blocks;
- render actors as micro-sprites or speckles at map scale;
- keep sprite-sheet diffuse/normal production as a separate lane;
- reject close illustrated village art, isometric views, hero buildings,
  large characters, UI, and copied commercial assets.

Foundation Art Pack v0.1 candidate outputs now cover:

- a terrain-first Riverforge settlement-region concept anchor;
- terrain and texture base tiles;
- settlement block and room-footprint symbols;
- micro actor/resource speckles;
- overlay, light, route, selection, and particle symbols.
- side-by-side diffuse/normal candidate sheets using `#8080FF` flat normal
  production placeholders before runtime acceptance.

This document is a pointer only. The playable runtime must not load Agent
Studio files or raw generated assets.
