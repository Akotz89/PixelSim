# Agent Simulation Control

AZR-835 defines the Phase 2 control surface for agent-driven simulation runs.
It is intentionally headless and deterministic so CI, Linear handoffs, and
future Agent Studio workflows can reproduce the same planet seed without a
browser.

## Epoch Control

AZR-841 adds `PS.epochs.setEpoch(n)` and `PS.epochs.getEpochState()` as the
agent API for deep-time scaling. Epoch transitions load upstream state first:
atmospheric CO2/O2/CH4/N2, greenhouse forcing, active simulation pass overlays,
years-per-tick scaling, ocean state hints, life activation hints, and biome LUT
palette id. Agents should treat those values as causes, not desired downstream
population targets.

The epoch config lives at `sim/configs/epoch-configs.json`. It contains 13
epochs from Hadean through Galactic Civilization. Hadean disables the ocean pass;
Archean enables it; epoch 3 carries Lenia species spawn hints after biome
stabilization; epoch 6 runs at one year per tick.

## Planet Spec

The schema lives at `schemas/planet-spec.schema.json`. Specs may be JSON or the
small YAML subset used by `scripts/sim-control.js`: nested objects, scalar
strings, numbers, and booleans.

Required fields:

- `seed`: deterministic planet seed.
- `width` and `height`: simulation raster dimensions.
- `climate.meanTemperatureC`: baseline heat in C.
- `climate.temperatureAmplitudeC`: equator-to-pole heat swing in C.
- `climate.oceanRatio`: target ocean coverage.
- `simulation.dt`: fixed step duration.
- `simulation.diffusion`: solver diffusion coefficient.
- `simulation.iterations`: default tick count.

Example:

```bash
node scripts/sim-runner.js --spec examples/planet-arctic.json --sim heat --ticks 1000 --export reports/temp-arctic.png
node scripts/sim-validator.js --input reports/temp-arctic.png --check nan --check temperature-range --check biome-distribution
```

The runner writes a PNG plus `reports/temp-arctic.png.json`. The JSON sidecar is
the validator source for numerical ranges, histograms, biome coverage, and NaN
counts.

## Validator Checks

`scripts/sim-validator.js` emits a JSON report and exits nonzero if any check
fails.

- `nan`: no NaN or infinite values. Failure means the run should halt.
- `temperature-range`: all heat values must stay within `[-100, 100]` C.
- `salinity-range`: all salinity values must stay within `[0, 60]` PSU.
- `velocity-range`: all velocity magnitudes must stay within `[0, 10]` m/s.
- `biome-distribution`: ocean coverage must be greater than 60 percent and land
  coverage greater than 20 percent.

## WASM Worker Integration Spec

The worker bridge is a future runtime integration point, not a requirement for
the current headless CLI.

Message protocol:

- `init`: `{ type, id, wasmModule, memoryBytes, spec }`
- `loadSpec`: `{ type, id, spec }`
- `run`: `{ type, id, sim, ticks, inputBuffers }`
- `validate`: `{ type, id, checks }`
- `export`: `{ type, id, format }`
- `ready`: `{ type, id, capabilities }`
- `progress`: `{ type, id, tick, totalTicks }`
- `result`: `{ type, id, sim, buffers, stats, biome }`
- `validation`: `{ type, id, report }`
- `error`: `{ type, id, message, recoverable }`

SharedArrayBuffer bridge:

- Prefer `SharedArrayBuffer` for long-lived solver memory only when
  `crossOriginIsolated === true`.
- Fall back to transferred `ArrayBuffer` snapshots for file URLs and any local
  preview without the required headers.
- Keep GPU upload ownership on the main thread; workers return typed-array
  buffers and metadata only.

Required server headers for SharedArrayBuffer:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The existing `docs/webworker-evaluation.md` decision still applies to direct JS
worker files under `file://`: they are not a reliable default path.

## Tuner Playbook

`scripts/sim-tuner-playbook.js` turns validator reports into executable agent
recommendations.

Patterns:

- `nan-immediate-halt`: halt, reduce `simulation.dt` by 50 percent, clamp
  `simulation.diffusion` to `<= 0.2`, and rerun the same seed.
- `temperature-too-narrow`: increase `climate.temperatureAmplitudeC` by 25
  percent or lower diffusion by 20 percent.
- `temperature-out-of-range`: move `climate.meanTemperatureC` toward 0 and
  reduce amplitude before increasing ticks.
- `currents-too-weak`: increase `climate.currentStrength`, then rerun
  `velocity-range`.
- `salinity-out-of-range`: move `climate.salinityPsu` toward 35 and reduce
  evaporation-biased temperature amplitude.
- `biome-balance-miss`: adjust `climate.oceanRatio` until the validator reports
  ocean coverage greater than 60 percent and land coverage greater than 20
  percent.

Example:

```bash
node scripts/sim-validator.js --input reports/temp-arctic.png --check nan --check temperature-range > reports/temp-arctic.validation.json
node scripts/sim-tuner-playbook.js --report reports/temp-arctic.validation.json
```
