# Pixeldarium Documentation Index

## In-Repo Documentation

| Document | Path | Description |
|----------|------|-------------|
| [README](../README.md) | `README.md` | Project overview and how to run |
| [AGENTS.md](../AGENTS.md) | `AGENTS.md` | Agent instructions with D1-D7 architecture decisions |
| [Baseline](baseline.md) | `docs/baseline.md` | Pre-restructure codebase metrics (19,484 lines, 773 functions) |
| [Save Format](save-format.md) | `docs/save-format.md` | Persistence schema version 1 |
| [Legacy UI Assessment](legacy-ui-assessment.md) | `docs/legacy-ui-assessment.md` | Completed UI runtime shard retirement record |
| [Legacy Runtime Assessment](legacy-runtime-assessment.md) | `docs/legacy-runtime-assessment.md` | AZR-352 non-UI legacy runtime inventory and migration decisions |
| [Architecture](ARCHITECTURE.md) | `docs/ARCHITECTURE.md` | AZR-585 current runtime architecture, data flow, initialization order, and optimization boundaries |
| [Rendering](RENDERING.md) | `docs/RENDERING.md` | AZR-586 current WebGPU rendering pipeline, coordinate systems, zoom bands, atlas, shaders, and frame budget |
| [Getting Started](GETTING_STARTED.md) | `docs/GETTING_STARTED.md` | Phase 0 onboarding guide for setup, runtime shape, terrain/entity changes, config edits, and verification |
| [Coding Conventions](CODING_CONVENTIONS.md) | `docs/CODING_CONVENTIONS.md` | Phase 0 source conventions for script-tag JS, WebGPU runtime boundaries, data sidecars, config, simulation, rendering, tests, and comments |
| [Pixeldarium Art Bible](pixeldarium-art-bible.md) | `docs/pixeldarium-art-bible.md` | AZR-420 original pixel-art dimensions, sheet layouts, animation specs, naming, palette rules, and WebGPU-only asset contract |
| [Visual Quality Gate](visual-quality-gate.md) | `docs/visual-quality-gate.md` | AZR-364 Google-Earth smoothness and Songs-of-Syx-style simulation readability checklist |
| [Proof Scene Acceptance](proof-scene-acceptance.md) | `docs/proof-scene-acceptance.md` | AZR-1037/AZR-1038 local proof-scene fields and actor-scale readability gates |
| [Biological Model Decision](biological-model-decision.md) | `docs/biological-model-decision.md` | AZR-361 aggregate population and representative organism model gate |
| [Optimization Operating Model](optimization-operating-model.md) | `docs/optimization-operating-model.md` | Scale-first rendering/simulation rules derived from the YouTube deep-dive analysis |
| [Optimization Implementation Gate](optimization-implementation-gate.md) | `docs/optimization-implementation-gate.md` | AZR-637 implementation handoff gate for rendering, streaming, performance, mass-simulation, and observation work |
| [Phase 2 Readiness](phase-2-readiness.md) | `docs/phase-2-readiness.md` | AZR-353 reconciliation of GDD, Linear Phase 2 stories, and current repo evidence |
| [Agent Studio Handoff](agent-studio-handoff.md) | `docs/agent-studio-handoff.md` | Runtime-safe contract for accepting outputs from the private Pixeldarium Agent Studio repo |
| [Top-Down Simulation Art Contract](top-down-simulation-art-contract.md) | `docs/top-down-simulation-art-contract.md` | Pointer to the Agent Studio art bible controlling Songs-of-Syx-quality map-view art |

## Planning Artifacts

All planning documents live in `skills/planning-artifacts/gdds/gdd-Pixeldarium-2026-06-01/`:

| Document | Size | Description |
|----------|------|-------------|
| [GDD](../../skills/planning-artifacts/gdds/gdd-Pixeldarium-2026-06-01/gdd.md) | 40KB | Game Design Document — 12 epochs, 5 pillars, Song of Syx inspiration |
| [Architecture](../../skills/planning-artifacts/gdds/gdd-Pixeldarium-2026-06-01/game-architecture.md) | 33KB | Architecture blueprint — 7 decisions (D1-D7), 8 patterns, 45+ file structure |
| [Story Specs](../../skills/planning-artifacts/gdds/gdd-Pixeldarium-2026-06-01/linear-stories.md) | 38KB | Full specifications for all 72 stories |
| [Epics](../../skills/planning-artifacts/gdds/gdd-Pixeldarium-2026-06-01/epics.md) | 11KB | 14 epic overview with phase mapping and blocking graph |
| [Decision Log](../../skills/planning-artifacts/gdds/gdd-Pixeldarium-2026-06-01/decision-log.md) | 14KB | Architecture decision rationale |

## Configuration

| File | Path | Description |
|------|------|-------------|
| [.editorconfig](../.editorconfig) | `.editorconfig` | LF line endings, UTF-8, 2-space indent |
| [.gitattributes](../.gitattributes) | `.gitattributes` | Git-enforced LF line endings |
| [Codex Setup](.codex/setup.sh) | `.codex/setup.sh` | Validation script (node --check, whitespace, line endings) |
| [Codex Instructions](.codex/instructions.md) | `.codex/instructions.md` | Codex-specific project rules |
| [GitHub Pages](../.github/workflows/pages.yml) | `.github/workflows/pages.yml` | Auto-deploy main to GitHub Pages |

## Agent Studio Project

- **Linear:** [Pixeldarium Agent Studio](https://linear.app/openclaw-mock-up/project/pixeldarium-agent-studio-35c2d43bfca8)
- **Private GitHub:** `Akotz89/Pixeldarium-Agent-Studio`
- **Local root:** `/mnt/c/Users/Aaron/Azyrra/projects/pixeldarium-agent-studio`
- **Runtime boundary:** this game repo keeps only `docs/agent-studio-handoff.md`
  and reviewed runtime assets. Pipeline docs, tools, tests, reports, and raw
  generation outputs belong in the standalone Agent Studio repo.

## Linear Project

- **Project:** [Pixeldarium](https://linear.app/openclaw-mock-up/project/pixeldarium-fd2791715086)
- **Team:** Azyrra (AZR)
- **Epics:** AZR-254 to AZR-267 (14 epics, E0-E13)
- **Stories:** AZR-268 to AZR-339 (72 stories)
- **Milestones:** Phase 1-5

## Critical Path

```
E0 (Project Restructure) → E1 (Planet Rendering), E2 (Performance)
E1 + E2 → E3 (Bio Sim), E4 (Primordial), E7 (Cosmological)
E3 → E5 (Intelligence)
E5 → E6 (Civilization)
E6 + E7 → E8 (Space)
E8 → E11 (Transcendence)
```

**Entry point:** AZR-268 (E0-S1: PS namespace + core infrastructure)
