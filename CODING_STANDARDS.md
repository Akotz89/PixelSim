# Pixeldarium Coding Standards

Pixeldarium extends the global `code-quality` plugin standards with runtime-specific rules for the simulation engine.

## Runtime Architecture

- Use ES modules for source files loaded by `js/core/loader-esm.js`.
- Keep `PS.*` as the shared runtime namespace, but do not add new `window.*` migration globals.
- Do not reintroduce script-tag preamble globals such as `var X = window.X`.
- Keep source modules under the existing layer boundaries:
  - `core` imports no project layer.
  - `sim` imports `core`.
  - `render` imports `core`.
  - `ui` imports `core`, `render`, and `sim`.
  - `systems` may coordinate `core`, `sim`, `render`, and `ui`.
  - `debug` may inspect all layers.
  - `assets` imports `core`.

## Safety Rules

- No `innerHTML` assignment. Build DOM with `textContent`, `replaceChildren`, and `createElement`.
- No `eval()` or `new Function()`.
- Do not hardcode secrets, credentials, tokens, or API keys.
- TODO/FIXME comments must include a Linear issue key, for example `TODO(AZR-1234): explain follow-up`.
- New functions should stay under 200 LOC and below cognitive complexity 30. Extract focused helpers before crossing those limits.

## Fallow Gates

- Keep `.fallowrc.json` entry points aligned with the runtime entry modules.
- Do not increase dead files, dead exports, circular dependencies, security findings, or duplication.
- Use `npm run lint:fallow` for regression checks when changing source structure.
- Use `npx fallow health` to confirm the score remains at or above the Code Health A threshold.

## Verification

- Run `node scripts/run-all-tests.js` for milestone work.
- Run focused tests for the modules touched before the full suite when available.
- For loader, manifest, rendering, or UI behavior changes, start Vite and run a browser smoke check.
- Record known baseline failures separately from new regressions.
