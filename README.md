<p align="center">
  <img src="docs/screenshots/social-preview.png" alt="Pixeldarium — Planet-Scale Emergent Sandbox" width="800">
</p>

<h1 align="center">🌍 Pixeldarium</h1>

<p align="center">
  <strong>Watch a primordial planet evolve from simple organisms to galactic civilization — all in your browser.</strong>
</p>

<p align="center">
  <a href="https://akotz89.github.io/Pixeldarium/"><img src="https://img.shields.io/badge/▶_Play_Now-GitHub_Pages-58F06C?style=for-the-badge&logo=github" alt="Play Now"></a>
</p>

<p align="center">
  <a href="https://github.com/Akotz89/Pixeldarium/actions/workflows/validate.yml"><img src="https://img.shields.io/github/actions/workflow/status/Akotz89/Pixeldarium/validate.yml?style=flat-square&label=CI&logo=github" alt="CI"></a>
  <a href="https://github.com/Akotz89/Pixeldarium/releases/latest"><img src="https://img.shields.io/github/v/release/Akotz89/Pixeldarium?style=flat-square&color=58F06C" alt="Release"></a>
  <img src="https://img.shields.io/badge/Pure-HTML%2FCSS%2FJS-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="Pure JS">
  <img src="https://img.shields.io/badge/Dependencies-Zero-brightgreen?style=flat-square" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/Build_Step-None-blue?style=flat-square" alt="No Build">
  <img src="https://img.shields.io/badge/Protocol-file%3A%2F%2F-purple?style=flat-square" alt="file:// compatible">
  <img src="https://img.shields.io/github/last-commit/Akotz89/Pixeldarium?style=flat-square&color=orange" alt="Last Commit">
</p>

---

## ✨ What Is This?

Pixeldarium is a **planet-scale pixel simulation engine** inspired by the large-population, systems-first spirit of [Songs of Syx](https://store.steampowered.com/app/1162750/Songs_of_Syx/). It procedurally generates an Earth-scale planet and simulates the full arc of civilization — from the first self-replicating organisms through tribal settlements, space programs, and galactic empires.

**No frameworks. No server. No build step.** Just open `index.html` and watch evolution unfold.

---

## 🎨 Visual Identity

Pixeldarium uses a readable, simulation-first visual style: tiny pixel entities, layered terrain, zoom-dependent detail, and overlays that make emergent planetary history understandable at scale. The goal is not decorative complexity; it is clarity while thousands of systems move at once.

## Optimization Model

Pixeldarium's scale depends on authoritative aggregate state, chunk-aligned
render/simulation boundaries, WebGL2 batched presentation, readiness-gated
streaming, and representative local detail only where the watcher is focused.
See [Optimization Operating Model](docs/optimization-operating-model.md).

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/Akotz89/Pixeldarium.git

# Open in browser — that's it
open Pixeldarium/index.html
```

> **Or play instantly:** [akotz89.github.io/Pixeldarium](https://akotz89.github.io/Pixeldarium/)

### Requirements

| | |
|---|---|
| 🌐 **Browser** | Chrome, Edge, Firefox, or Safari (modern) |
| 📦 **Dependencies** | None |
| 🔧 **Build step** | None |
| 🖥️ **Server** | Not required — runs from `file://` |

---

## 🌌 Features

### 🪐 Procedural Planet
- Earth-scale planet generated from a single seed
- **8 zoom levels** — orbit → continent → region → neighborhood → 1 meter
- Deterministic terrain with biomes, coastlines, mountains, and hydrology
- Subcell pixel terrain texturing at ground level

### 🧬 Evolution & Ecosystem
- Organisms with heritable traits (vision, metabolism, reproduction, movement)
- Natural selection drives speciation over thousands of ticks
- Lineage tracking — watch family trees diverge and go extinct
- Food web dynamics with spatial foraging

### 🏛️ Civilization Progression
- **12 epochs** spanning the full arc of life:

  | Phase | Epochs |
  |-------|--------|
  | 🌋 Primordial | Chemical genesis, first organisms |
  | 🌿 Biological | Microbial → multicellular → intelligent |
  | 🏘️ Civilization | Tribal → settlement → colony networks |
  | 🌍 Planetary | Great filters, technology emergence |
  | 🚀 Space | Orbital → interplanetary → interstellar |
  | ✨ Transcendence | Galactic empire, energy transcendence |

### 💾 Persistence
- Auto-save to IndexedDB
- JSON export/import for sharing worlds
- Versioned save format with migration support

### 🎮 Controls
- **Scroll** — Zoom in/out (8 levels)
- **Click + Drag** — Pan the view
- **Menu** — Speed control, ecosystem stats, event log
- **Inspect** — Click organisms and settlements for details

---

## 🏗️ Architecture

Pixeldarium is built with a deliberate set of architectural decisions designed for performance, simplicity, and zero-dependency operation:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **D1** Rendering | WebGL2 raw API | Maximum GPU control, no abstraction overhead |
| **D2** Sim Loop | Decoupled accumulator | Fixed 60 TPS independent of render rate |
| **D3** Data Model | Typed arrays (SoA) | Cache-friendly, GC-free mass entity storage |
| **D4** Modules | `<script>` tags + `PS.*` namespace | Zero tooling, `file://` compatible |
| **D5** State | Centralized `PS.world` + event bus | Predictable state flow, easy serialization |
| **D6** Epochs | Registry pattern | Extensible without if/else chains |
| **D7** Spatial | Chunk-aligned indexing | Render-tile-aligned queries |

### Project Structure

```
Pixeldarium/
├── index.html              # Entry point
├── style.css               # Full UI styling
├── config.js               # All simulation constants
├── state.js                # DOM refs + world state
├── utils.js                # RNG, math utilities
├── planet.js               # Earth-scale projection & terrain
├── terrain.js              # Procedural terrain generation
├── food.js                 # Food spawning & spatial indexing
├── organisms.js            # Organism lifecycle & traits
├── settlements.js          # Settlement → empire progression
├── js/render/              # WebGL2 production rendering pipeline
├── shaders/                # File-backed WebGL2 shaders
├── persistence.js          # IndexedDB save/load
├── ui.js                   # Menu, HUD, inspect panels
├── main.js                 # Game loop & initialization
├── tests/                  # Test suite
├── docs/                   # Documentation & baselines
├── .codex/                 # AI agent validation config
└── .github/workflows/      # GitHub Pages deployment
```

---

## 📊 Codebase Stats

| Metric | Value |
|--------|-------|
| Total source lines | **19,484** |
| Source files | 15 |
| Test files | 2 |
| Global functions | 773 |
| Config constants | 198 |
| External dependencies | **0** |
| Build tools required | **0** |

---

## 🧪 Development

### Validation

```bash
npm test
git diff --check
```

Or use the included Codex validation script:

```bash
bash .codex/setup.sh
```

### Running Tests

```bash
npm test
```

`npm test` is the CI gate and runs the Node-based unit and integration suite
listed in `package.json`, including seed/tick simulation, persistence schema,
and settlement progression checks. Browser-backed persistence parity and visual
captures stay separate because they require Playwright or a rendered browser
surface:

```bash
npm run test:persistence
npm run test:visual
node tests/planet-zoom-anchor.test.js
```

Run narrow tests while editing, then run `npm test` before handing work off.

### Architecture Documentation

Full planning artifacts are in `skills/planning-artifacts/gdds/gdd-Pixeldarium-2026-06-01/`:

| Document | Description |
|----------|-------------|
| [Game Design Document](skills/planning-artifacts/gdds/gdd-Pixeldarium-2026-06-01/gdd.md) | 40KB — 12 epochs, 5 design pillars |
| [Architecture Blueprint](skills/planning-artifacts/gdds/gdd-Pixeldarium-2026-06-01/game-architecture.md) | 33KB — 7 decisions, 8 patterns |
| [Epic Overview](skills/planning-artifacts/gdds/gdd-Pixeldarium-2026-06-01/epics.md) | 14 epics across 5 phases |
| [Decision Log](skills/planning-artifacts/gdds/gdd-Pixeldarium-2026-06-01/decision-log.md) | Architecture decision rationale |

---

## 🤖 AI Agent Integration

Pixeldarium is designed for AI-assisted development. See [`AGENTS.md`](AGENTS.md) for:
- Mandatory architecture decisions (D1–D7)
- Coding conventions and error philosophy
- File structure targets
- Testing requirements

AI agents (Codex, Antigravity, etc.) should read `AGENTS.md` before making any changes.

---

## 📋 Roadmap

The project is organized into **5 phases** with **14 epics** and **72 stories**:

```
Phase 1: Foundation ━━━━━━━━━━━━━━ Project restructure, WebGL2, performance
Phase 2: Biological ━━━━━━━━━━━━━━ Geological layers, evolution, observation
Phase 3: Civilization ━━━━━━━━━━━━ Tribal dynamics, great filters, technology
Phase 4: Cosmos ━━━━━━━━━━━━━━━━━━ N-body, orbital mechanics, interstellar
Phase 5: Endgame ━━━━━━━━━━━━━━━━━ Transcendence, audio, UI polish
```

> Development is tracked in [Linear](https://linear.app/openclaw-mock-up/project/pixeldarium-fd2791715086) under the Azyrra team.

---

## 📝 License

This project is currently private/personal. All rights reserved.

---

<p align="center">
  <sub>Built with nothing but <code>&lt;script&gt;</code> tags and ambition.</sub>
</p>
