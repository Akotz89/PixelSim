# Simulation Causality Audit

AZR-1069 applies the parameter provenance rule across older simulation systems:
do not tune downstream outcomes to look reasonable. Every target-like constant
must be classified before it is changed.

## Classification Rules

- `allowed_constraint`: performance, memory, UI, debug, or safety bound that
  does not decide simulated ecology.
- `upstream_baseline_parameter`: initial condition that belongs in
  `sim/configs/parameters.json`.
- `driver_input`: time-varying influence that belongs in
  `sim/configs/environment-drivers.json`.
- `derived_field`: value computed from upstream fields and read by downstream
  systems.
- `downstream_tuning_violation`: target population, biome, pH, atmosphere, or
  distribution control that should become an upstream parameter, driver input,
  or derived field before agents tune it.

## Current Inventory

| File | Pattern | Classification | Replacement model |
| --- | --- | --- | --- |
| `js/render/terrain-seeding.js` | `PLANET_TARGET_WATER_PERCENT`, `PLANET_TARGET_FERTILE_LAND_PERCENT` | `upstream_baseline_parameter` | Treat as planet-spec initial conditions. Future work should route water inventory, basin capacity, and fertility through `surface.ocean_ratio`, hydrology, terrain relief, and mineral/weathering fields. |
| `js/sim/food-growth.js` | `FOOD_RECOVERY_TARGET_PER_ORGANISM` | `downstream_tuning_violation` | Replace target food recovery with primary productivity, moisture, fertility, vegetation density, and consumer pressure fields. |
| `js/sim/organisms-behavior.js` | `REPRODUCTION_RESOURCE_TARGET_PER_ORGANISM` | `downstream_tuning_violation` | Replace target reproduction scarcity with food-web availability and habitat carrying-capacity fields. |
| `js/sim/food-web.js` | `targetPredatorRatio` | `derived_field` | This is currently a diagnostic score. It must not feed reproduction, mutation, mortality, or spawning without becoming a causal field. |
| `js/sim/geochemistry.js` | `epoch_presets` | `upstream_baseline_parameter` | Fold duplicate gas presets into the parameter registry or keep them synchronized from `sim/configs/parameters.json`. |
| `js/sim/geochemistry.js` | `applyAgentPatch` direct gas writes | `driver_input` | Route through `agent_intervention` driver outputs and record provenance before changing atmosphere fields. |
| `js/epochs/state-machine.js` | raw epoch atmosphere config | `upstream_baseline_parameter` | Create epoch atmosphere state from parameter baselines instead of raw per-file defaults. |
| `js/main-simulation.js` | missing persistent environment driver timeline | `driver_input` | Add a per-tick driver timeline that evolves active events before downstream biology/rendering summaries react. |
| `scripts/sim-tuner-playbook.js` | target-seeking recommendations | `downstream_tuning_violation` | Recommend causal investigation and longer seed/tick sweeps instead of moving parameters toward preferred distributions. |

## Checklist For New Systems

1. Declare upstream fields read by the system.
2. Declare whether each new number is an initial baseline, driver input,
   derived field, allowed constraint, or downstream outcome.
3. Add forbidden outputs for any new driver.
4. Write directional tests that vary one upstream cause at a time.
5. If the result is collapse, extinction, runaway oxygenation, barren terrain,
   or failed coral growth, trace the upstream cause before changing constants.

## Applied In This Slice

The tuner playbook no longer recommends moving values toward desired salinity,
temperature, ocean, land, or biome distributions. It now instructs agents to
inspect upstream drivers and run broader seed/tick sweeps.

The remaining direct runtime paths stay documented here because replacing them
touches larger systems and should happen through linked implementation issues.
