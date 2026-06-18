# Fallow Coverage Pipeline

AZR-1177 replaces the unusable Node `c8` coverage path with browser runtime coverage.

## Baseline

`npm run test:coverage` previously ran:

```bash
npx c8 --reporter json --reporter text --report-dir coverage npm test
```

On the current Windows worktree, that path reproduced the old blocker:

- `tests/project-infrastructure.test.js` printed its success message but stayed alive under `c8` because the spawned Vite process tree was not killed.
- Interrupting the run produced `coverage/coverage-final.json` as `{}`.
- Fallow could not use that file for coverage-aware CRAP scores.

## Current Pipeline

`npm run test:coverage` now runs:

```bash
node scripts/collect-browser-coverage.js
```

The collector starts the Vite app, launches Chromium through Playwright, enables JavaScript coverage, waits for the Pixeldarium loader plus startup assets/data, converts V8 coverage with `v8-to-istanbul`, and writes:

- `coverage/coverage-final.json`
- `coverage/browser-summary.json`

The coverage directory is intentionally ignored because these are generated reports.

## Verification Evidence

Latest local run:

```bash
npm run test:coverage
```

Output summary:

- Converted local JS modules: 217
- `coverage/coverage-final.json`: 15,196,932 bytes
- GPU status: `ready`
- Startup assets loaded: `true`
- Startup data loaded: `true`

Fallow accepts the generated file:

```bash
npx fallow health --coverage coverage/coverage-final.json --coverage-root C:\Users\Aaron\.codex\worktrees\pixeldarium\azr-1177-coverage --format json --output-file coverage\fallow-health-with-coverage.json
```

That command writes a health report with coverage-backed findings, including entries marked `coverage_source: "istanbul"`. It may still exit non-zero when ordinary health findings exist.

## Note

The collector records optional draw-exercise errors in `coverage/browser-summary.json` instead of failing coverage generation. Coverage generation only requires the app to load and startup assets/data to complete.
