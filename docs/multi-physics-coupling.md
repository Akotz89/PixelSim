# Multi-Physics Coupling

AZR-839 adds `PS.sim.coupling`, the orchestration contract for the Phase 2 simulation stack. It composes existing simulation modules instead of replacing their internal compute passes.

## Canonical Tick Order

1. Heat diffusion
2. LBM ocean
3. Salinity and density
4. Moisture and precipitation
5. Atmospheric chemistry
6. Reaction-diffusion vegetation
7. Pixel CA
8. Lenia ecosystems
9. Biome LUT render

Each pass slot records the resources it reads and writes. Feedback loops are treated as next-tick inputs so the coupling report can assert previous-tick read discipline.

## Texture Registry

`ensureTextureRegistry()` initializes the 12 logical GPU textures required by the architecture:

- temperature
- velocity
- salinity
- density
- moisture
- atmosphere
- vegetation
- element_grid
- species
- elevation
- biome_lut
- biome_render

The registry stores format, writer, readers, logical name, dimensions, and WebGPU target id.

## WASM Elevation Upload

`uploadWasmElevation()` delegates to `PS.sim.wasmBridge.uploadElevationToGpu()`. The bridge creates a typed view directly over WASM linear memory and writes it to the coupling elevation GPU buffer.

## Profiling

`tick()` records per-pass timing and emits `PS.log("sim", "DEBUG", "coupling pass timing", ...)` for each pass plus an info-level tick summary.

## Causal Simulation Rule

Phase 2 simulation tests should prove cause and effect, not tune toward preferred-looking distributions. A downstream system must declare which upstream fields it reads, tests should vary one upstream cause while holding the rest of the habitat fixed, and assertions should be directional: warmer input raises weathering, higher CO2 lowers ocean pH, lower pH reduces coral density. If a population cannot survive under the current initial conditions, the test should expose that causal chain rather than adjust constants to force a healthy population.

## Parameter Provenance And Time Drivers

Base parameters need an explicit source before they are trusted by the simulation. Each baseline value should declare units, range, origin, and update cadence:

- Preset: epoch or planet-spec initialization, such as starting atmospheric CO2, ocean ratio, or average mineral abundance.
- Upstream field: values produced by earlier passes, such as temperature, moisture, ocean pH, vegetation density, volcanic emission, and elevation.
- Exogenous driver: outside influence over time, such as volcanic eruptions, asteroid dust, orbital forcing, solar changes, player/agent interventions, or runaway biology.

Long-running environmental change should enter through driver fields, not direct downstream tuning. For example, volcanic activity writes lava and volcanic-emission fields, geochemistry converts those into CO2/SO2/ocean pH changes, heat reads CO2 as greenhouse forcing, moisture responds to temperature, and biology responds to the changed habitat. If biology converts atmospheric CO2 into O2 fast enough to cause collapse or runaway oxygenation, that outcome should be represented as a coupled carbon-cycle feedback rather than clamped to a target atmosphere.
