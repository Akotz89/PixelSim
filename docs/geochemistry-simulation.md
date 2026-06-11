# Geochemistry Simulation

AZR-837 adds the coarse-grained chemical backbone for planet-scale atmosphere,
ocean, and soil state.

## Fields

`PS.sim.geochemistry` owns three typed-array grids:

- Atmosphere: `CO2`, `O2`, `CH4`, `H2O_vapor`, `SO2`, `N2` in ppm.
- Ocean: `pH`, dissolved CO2, dissolved O2, alkalinity, calcium, magnesium.
- Soil: organic carbon, mineral nitrogen, mineral phosphorus, pH, silicate
  weathering rate, fossil carbon.

The module exposes a CPU validation path plus `shaders/geochemistry.wgsl` for
the WebGPU compute contract.

## Reactions

- Photosynthesis raises O2 and lowers CO2 in vegetated warm cells.
- Respiration returns a smaller amount of CO2 and H2O.
- Silicate weathering draws down CO2 faster on warm, wet land.
- Volcanic emission raises local CO2 and SO2.
- Methane oxidation lowers CH4 and O2 while raising CO2.
- Air-sea exchange dissolves atmospheric CO2 into ocean chemistry, lowering pH.

## Agent Control

Agents may call `PS.sim.geochemistry.applyAgentPatch(state, { co2Ppm })` to
modify atmospheric ppm and immediately refresh the summary. The existing
atmosphere layer reads the geochemistry summary when present and otherwise keeps
its older fallback chemistry.

## Debug Surface

The module publishes `world.geochemistry` and `world.atmosphere.debugOverlayRows`
with CO2, O2, CH4, ocean pH, and weathering values. The existing atmosphere
observation overlay uses these values when present.
