# Parameter Provenance And Environmental Drivers

AZR-1059 adds a causal modeling layer for base simulation parameters and external environmental change. The rule is simple: parameters and drivers change upstream fields; downstream systems react through their normal inputs.

## Parameter Registry

`PS.sim.parameters` loads `sim/configs/parameters.json`. Every parameter must declare:

- `id`: stable key such as `atmosphere.co2_ppm` or `volcanic.activity`.
- `unit`: ppm, pH, W/m2, ratio, normalized, or another explicit unit.
- `range`: valid numeric bounds.
- `provenance`: where the baseline came from.
- `updateCadence`: when it can change.
- `fields`: named driver/coupling fields affected by the parameter.

Epoch and planet-spec presets seed values through `createBaseline()`. They do not erase provenance: each baseline value keeps a trace record showing whether it came from an epoch preset, planet spec, derived field, stellar preset, or model parameter.

## Environmental Drivers

`PS.sim.environmentDrivers` represents external and long-running influences:

- Volcanism writes volcanic emission, greenhouse forcing, and mineral distribution.
- Orbital or solar forcing writes solar forcing and albedo.
- Asteroid or dust events write dust opacity, albedo, and solar forcing.
- Agent intervention patches named upstream fields only.
- Runaway biology converts atmospheric CO2 into O2 and changes vegetation/species density fields.

Drivers do not write coral density, final biome color, or target atmosphere distributions directly. For example, volcanism raises CO2/SO2 and mineral fields; geochemistry then computes ocean pH; Lenia coral responds to that pH later. If coral collapses, the chain is traceable.

## Adding A Parameter Or Driver

Add a parameter when a baseline value needs units, range, and origin. Add a driver when a value changes over time. The driver must publish named fields and consumers so tests can vary one upstream cause while holding other inputs fixed.

Do not tune a downstream output to look reasonable. If a starting atmosphere cannot support an ecosystem, expose that through provenance, driver fields, and directional tests.
