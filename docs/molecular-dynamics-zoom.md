# Molecular Dynamics Zoom

AZR-840 adds `PS.sim.molecularDynamics`, a pixel-art molecular dynamics contract for zoomed micro-scale cells. The module uses Lennard-Jones forces, Velocity Verlet CPU validation, and a WebGPU compute shader path for runtime execution.

## Causal Inputs

The MD view is initialized from the selected macro cell:

- Temperature sets particle kinetic energy.
- Salinity sets the Na+ and Cl- particle ratio.
- Pressure compresses the 256x256 micro-view box distribution.
- Medium selects the dominant particle family: water, atmosphere, or lava.

This keeps the micro-view causal. If a hot, salty, compressed ocean cell produces a chaotic ion-rich view, that is the consequence of upstream heat, salinity, and pressure fields rather than a tuned visual target.

## Physics Contract

- Force: Lennard-Jones potential with per-species epsilon, sigma, and mass from `sim/configs/molecular-dynamics.json`.
- Integration: Velocity Verlet for CPU validation and a WebGPU compute pass for particle stepping.
- Salt: water-rich states add hydration pressure that separates Na+/Cl- pairs instead of preserving a dry salt crystal.
- Ice: subzero macro temperature pulls water particles toward a regular lattice, increasing lattice-order score over time.

## Pixel Rendering

`makeParticlePixelSprites()` exports WebGPU-friendly sprite descriptors: x/y, 4x4 size, species color, and species id. It does not use Canvas2D and can be handed to the existing particle rendering path or a dedicated instanced particle renderer.

## Performance Contract

`getPerformanceContract(1000)` records the >30 FPS target for the 256x256 micro-view. `getPerformanceContract(2000)` records the spatial-hash requirement and <16ms/frame target. The WGSL module includes a single-pass particle update contract; the architecture target is to replace the O(N2) loop with grid-head/grid-next neighbor lists when the runtime benchmark gate lands.
