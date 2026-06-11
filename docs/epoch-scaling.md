# Epoch Scaling

AZR-841 adds `PS.epochs.StateMachine`, a 13-epoch state machine from Hadean to Galactic Civilization. It reconfigures simulation scale through config data rather than era-specific branches.

## State Machine

`setEpoch(n)` transitions to an epoch from `sim/configs/epoch-configs.json`, which is described by `schemas/epoch-config.schema.json`. `getEpochState()` returns an agent-readable state with active passes, atmosphere, greenhouse forcing, timescale, palette id, ocean state, and life state.

The state machine does not mutate the canonical coupling order. It filters active passes from `PS.sim.coupling.passOrder`, so Hadean can omit ocean passes while Archean adds `lbm-ocean` without changing the global pass ordering contract.

## Transition Effects

Transitions change upstream environmental state before any downstream biology or rendering response.

- Active passes are stored on the pipeline as `activePassIds` and passed to `setActivePasses()` when a pipeline provides that method.
- Atmospheric state writes CO2, O2, CH4, and greenhouse forcing to `world.atmosphere`; heat diffusion receives greenhouse forcing through the `heat.greenhouse` input buffer when initialized.
- Timescale comes from `ticks_per_year` and `years_per_game_second`; `PS.time` reads the active epoch state when manual time override is off.
- Visual palette data is stored on `PS.sim.biomeLut.state.epochPaletteId` and `epochPalette`, and the active LUT is regenerated from that palette.
- Epoch 3 keeps Lenia species pending until `biome-stable` resolves through `PS.epochs.updateEpochGates()`.
- Epoch transitions emit `epoch.changed` through `PS.events.emit()` when the event bus is available.

## Causal Boundary

Epoch transitions seed upstream simulation state. They do not directly tune biome output, species density, coral survival, or final render colors. If a transition loads high CO2, greenhouse forcing and geochemistry respond first; downstream biology reads the resulting habitat.
