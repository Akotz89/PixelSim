# Lenia Ecosystem Simulation

AZR-838 adds `PS.sim.lenia`, a continuous cellular automata contract for post-equilibrium biology. It runs as a simulation module, not as a new always-on layer, so the Phase 2 layer manifest remains geology plus atmosphere.

## Runtime Contract

- Grid: `rgba32float`, one channel per species.
- Species channels: microbes, vegetation, coral, lichen.
- Update rule: convolution neighborhood, Lenia bell-curve growth, habitat suitability, volcanic wipeout, and carrying-capacity normalization.
- GPU path: `shaders/lenia.wgsl` dispatches `8x8x1` workgroups and targets 512x512 in under 5 ms per tick.
- CPU path: deterministic validation helpers cover emergence, habitat coupling, competition, pH collapse, and export behavior.

## Physical Coupling

- Temperature gates survival ranges.
- Moisture controls land organism growth.
- Ocean mask separates land vegetation and marine species.
- Ocean pH below 7.8 collapses coral density.
- Volcanic fields wipe local density.
- CO2 can boost vegetation photosynthesis efficiency.

## Agent And Render Handoff

Agents can call `exportDistributionMap(field, width, height, config)` for a JSON-ready species map with per-cell densities and a summary. Rendering can call `makeDensityOverlayRgba(...)` or `getCellDensity(...)`; the existing microbial observation overlay reads Lenia density when a live state exists.
