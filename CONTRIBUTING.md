# Contributing to Pixeldarium

Thanks for your interest in contributing to Pixeldarium! This guide covers everything
you need to know to make a successful contribution.

## 🚦 Before You Start

1. **Read [`AGENTS.md`](AGENTS.md)** — Contains all mandatory architecture decisions (D1–D7)
2. **Check [Linear](https://linear.app/openclaw-mock-up/project/pixeldarium-fd2791715086)** — See if the work is already tracked
3. **Open an issue first** — Discuss significant changes before implementing

## 🏗️ Architecture Rules

These are non-negotiable. PRs that violate them will be rejected.

| Rule | Requirement |
|------|-------------|
| **No frameworks** | Pure HTML/CSS/JS only |
| **No build step** | Must work by opening `index.html` |
| **No npm/CDN** | Zero external dependencies |
| **`file://` compatible** | Must run without a server |
| **PS.* namespace** | All functions under `var PS = {};` |
| **`<script>` loading** | No ES modules, no import/export |
| **`var` keyword** | Use `var`, not `let` or `const` |
| **< 500 lines** | Split files that approach the limit |
| **Hard crashes** | Use `PS.assert()`, never swallow errors |

## 🔧 Development Workflow

### Setup

```bash
git clone https://github.com/Akotz89/Pixeldarium.git
cd Pixeldarium
# No install step — there are no dependencies!
```

### Make Changes

1. Create a feature branch: `git checkout -b aaronkotz89/azr-NNN-description`
2. Make your changes
3. Validate: `bash .codex/setup.sh`
4. Test in browser: open `index.html` in Chrome/Edge

### Validation Checklist

Before submitting a PR, ensure:

```bash
npm test
git diff --check

# Line endings (must be LF)
# .gitattributes enforces this automatically
```

### Submit a PR

1. Push your branch
2. Open a PR against `main`
3. Fill in the PR template (architecture compliance checklist)
4. Wait for GitHub Pages deployment to verify

## 📁 File Organization

```
js/core/    — namespace, config, events, assert, log, math
js/render/  — webgl, shaders, camera, globe, terrain, entities
js/sim/     — loop, world, organisms, food, terrain
js/layers/  — geology, atmosphere, ocean, biosphere
js/spatial/ — grid, chunks, queries
js/epochs/  — registry, epoch-*.js
js/ui/      — hud, menu, panels, inspect
js/persist/ — save, load, migrate
```

## 🐛 Reporting Bugs

Use the [bug report template](https://github.com/Akotz89/Pixeldarium/issues/new?template=bug_report.yml).
Include:
- Steps to reproduce
- Browser and version
- Console errors (F12 → Console)
- World seed if relevant

## 💡 Feature Requests

Use the [feature request template](https://github.com/Akotz89/Pixeldarium/issues/new?template=feature_request.yml).

## 📏 Code Style

- **Indentation**: 2 spaces
- **Line endings**: LF (enforced by `.gitattributes`)
- **Encoding**: UTF-8 (no BOM)
- **Naming**: `camelCase` for functions/variables, `UPPER_SNAKE` for constants
- **Comments**: Preserve all existing comments unrelated to your changes
