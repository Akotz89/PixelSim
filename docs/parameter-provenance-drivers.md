# Parameter Provenance And Environmental Drivers

AZR-1059 adds a causal modeling layer for base simulation parameters and external environmental change. The rule is simple: parameters and drivers change upstream fields; downstream systems react through their normal inputs.

## Parameter Registry

`PS.sim.parameters` loads `sim/configs/parameters.json`. Every parameter must declare:

- `id`: stable key such as `atmosphere.co2_ppm` or `volcanic.activity`.
- `unit`: ppm, pH, W/m2, ratio, normalized, or another explicit unit.
- `range`: valid numeric bounds.
- `provenance`: where the baseline came from.
- `family`: canonical category for the parameter.
- `sourceClass`: how the value is sourced.
- `determinedBy`: the causal process that decides the value.
- `updateCadence`: when it can change.
- `driverIds`: drivers known to move this value over time.
- `fields`: named driver/coupling fields affected by the parameter.

Epoch and planet-spec presets seed values through `createBaseline()`. They do not erase provenance: each baseline value keeps a trace record showing whether it came from an epoch preset, planet spec, derived field, stellar preset, or model parameter.

## Base Parameter Families

The initial catalog is intentionally broader than the current Phase 2 passes.
It names the upstream causes that future passes must reuse instead of inventing
local defaults:

- Stellar/orbital: star mass, solar constant, eccentricity, axial tilt.
- Planet formation: radius, gravity, rotation.
- Surface/interior: ocean ratio, albedo, tectonics, volcanism, minerals.
- Atmosphere: pressure, CO2, O2, N2, CH4, SO2.
- Ocean/hydrology: salinity, pH, precipitation.
- Biology: productivity, CO2-to-O2 conversion, mutation rate.

The allowed source classes are:

- `formation`: set by star/planet formation and stable unless a formation-scale
  event occurs.
- `epoch_or_planet_spec`: seeded by an epoch preset or player-created planet
  spec, then preserved with trace metadata.
- `derived_upstream`: computed from earlier upstream fields such as mass/radius,
  atmosphere chemistry, weathering, vegetation, or solar forcing.
- `model_state`: produced by another simulation model, such as biology or
  lineage state.
- `exogenous_driver`: moved by an event or long-running driver, such as
  volcanism, impacts, orbital changes, or intervention.

The current numbers are baseline seeds, not desired outcomes. As earlier epoch
systems mature, formation passes should overwrite preset values while preserving
the same parameter ids, units, ranges, and provenance traces.

## Environmental Drivers

`PS.sim.environmentDrivers` represents external and long-running influences:

- Volcanism writes atmosphere chemistry, volcanic emission, greenhouse forcing,
  mineral distribution, and downstream pH inputs.
- Orbital or solar forcing writes solar forcing and albedo.
- Asteroid or dust events write dust opacity, albedo, and solar forcing.
- Agent intervention patches named upstream fields only.
- Runaway biology converts atmospheric CO2 into O2 and changes vegetation/species density fields.

Drivers do not write coral density, final biome color, or target atmosphere distributions directly. For example, volcanism raises CO2/SO2 and mineral fields; geochemistry then computes ocean pH; Lenia coral responds to that pH later. If coral collapses, the chain is traceable.

Every driver declares causes, outputs, and forbidden outputs. Causes are the
inputs an implementation is allowed to vary. Outputs are upstream fields it may
write. Forbidden outputs document outcomes that must stay emergent.

Every driver also declares an event schema:

- `startTick`: when the driver starts affecting the world.
- `durationTicks`: how long the driver remains active.
- `decay`: `none`, `linear`, or `exponential`.
- `strength`: what the event magnitude represents.

Runtime driver writes are checked against declared outputs. A driver may write
`atmosphere`, `albedo`, `solar_forcing`, `mineral_distribution`, and other
upstream fields only when its contract says so. It must not write
`coral_density`, target population fields, target biome distributions, or
target atmosphere distributions. Unknown driver events hard fail.

## Adding A Parameter Or Driver

Add a parameter when a baseline value needs units, range, and origin. Add a driver when a value changes over time. The driver must publish named fields and consumers so tests can vary one upstream cause while holding other inputs fixed.

Do not tune a downstream output to look reasonable. If a starting atmosphere cannot support an ecosystem, expose that through provenance, driver fields, and directional tests.

For example, if pH collapses coral, do not raise coral constants. Trace pH to
CO2, alkalinity, weathering, biology, and volcanic sulfur. Then vary one of
those upstream causes and prove the directional chain. If the current planet
cannot support coral, that is a valid simulated result.
