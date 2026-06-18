# Pixeldarium — Decision Log

## Session: 2026-06-01

### D001 — Game Type Classification
- **Decision:** Simulation (primary), with sandbox and god-game elements
- **Signal match:** Songs of Syx inspiration, planetary management, systems-driven emergent gameplay
- **Genre complexity:** HIGH (simulation is rated high in genre-complexity.csv)

### D002 — Epoch Scope
- **Decision:** ALL twelve epochs included in v1.0 scope
- **Epochs:** Primordial chemistry → Microbial → Multicellular → Land colonization → Intelligence → Tribal → Settlement → City-states/nations → Industrial → Space age → Interstellar → Post-biological/transcendence
- **Risk:** Massive scope. Each epoch is essentially a sub-game. Phasing will be critical.

### D003 — Player Role
- **Decision:** Primarily observation-based. Player watches the simulation unfold, tweaks parameters, nudges things.
- **References:** Lif, Species: ALRE, Thrive
- **Note:** This means the sim must be interesting to WATCH. Emergent behavior and visual feedback are critical.

### D004 — Epoch Transitions
- **Decision:** One continuous real-time simulation from primordial to galactic, with seamless time scaling.
- **Implication:** No loading screens, no phase breaks. Time acceleration must scale by orders of magnitude (geological → biological → civilizational → cosmic).

### D005 — Technical Constraint
- **Decision:** Pure HTML/CSS/JavaScript, no external libraries, no build tools, no Node.js dependency.
- **Reason:** Push vanilla browser tech to its limits. Must run from a local folder.

### D006 — Working Mode
- **Decision:** Facilitative — walk through key design sections collaboratively before drafting.

### D007 — Game Pillars (6 pillars, designer's choice)
- **Decision:** Keep all 6 pillars despite typical 2-4 recommendation.
- **Rationale:** Designer considers all 6 genuinely non-negotiable. Accepted with caveat: if any pillar never resolves a tradeoff during design, revisit.
- **Pillars:**
  1. **Emergent Complexity** — Simple rules at each scale produce surprising, unscripted outcomes. The simulation IS the game.
  2. **Seamless Scale** — One continuous world from molecular to galactic. Google Earth fluidity. No seams between zoom levels.
  3. **Deep Time** — Billions of years unfold. Every epoch is earned by the one before it. Nothing is handed.
  4. **Vanilla Browser Mastery** — Pure HTML/CSS/JS, no libraries. The technical constraint is a design identity.
  5. **Observable Complexity** — Fascinating to watch. Visual clarity at every zoom level without tooltip dependency.
  6. **Living Planet** — The planet is an active participant, not a backdrop. Geology, weather, oceans shape what life can become.

### D008 — Core Emotional Loop
- **Decision:** Not a traditional game loop. This is a "digital aquarium of civilization" — a Fermi Paradox simulator.
- **Core experience:** Watch → Wonder → Wait → Witness (or Mourn)
- **Design metaphor:** The player watches their planet attempt the Great Filters. Each epoch transition is a filter. Most lineages, most civilizations fail. The rare successes are the reward.
- **Reference inspirations:** Isaac Arthur (Fermi Paradox/Great Filters YouTube), Species: ALRE, Thrive, paludarium/aquarium hobby
- **Player agency:** Primarily observational. Player is a cosmic scientist — investigation tools, not control levers.

### D009 — Simulation Scope: Big Bang Origin
- **Decision:** The simulation starts at cosmological scale and cascades down.
- **Flow:** Big Bang → element distribution → galaxy formation → solar system formation → planet formation → geological evolution → biogenesis → biological evolution → civilization → space age → galactic
- **Key insight:** Planet types (super-Earth, water world, desert world) are EMERGENT from initial conditions, not menu selections. The player can set initial constraints (element ratios, stellar mass, etc.) and the physics determines what kind of planet forms.
- **Implication:** This adds at least 2 more simulation layers above "primordial planet" — cosmological and stellar/planetary formation.

### D010 — GDD Scope vs Implementation Scope
- **Decision:** Full Big Bang-to-transcendence vision in the GDD. Phased implementation marked in the document.
- **Rationale:** Complete design document serves as north star. Implementation phases are tracked separately.

### D011 — Implementation Phase 1 Priority
- **Decision:** Planet rendering + performance FIRST.
- **Rationale:** Google Earth smoothness pillar. If the planet view isn't buttery smooth and visually stunning, nothing else matters. This is the foundation.
- **Current state:** render.js (4,083 lines) and planet.js (3,295 lines) are the largest files. Globe view with Earth-scale zoom exists but has 8 identified performance bottlenecks.
- **Phase 1 scope:** Rendering pipeline optimization, chunk streaming performance, visual quality, smooth zoom transitions, responsive camera controls.

### D012 — Epoch 0: Cosmological Simulation
- **Decision:** Fully simulated. Particle physics, gravity, accretion disk dynamics, orbital mechanics from the start.
- **Player sees:** Dust condense, stars ignite, accretion disk form, planets accrete, orbital mechanics stabilize.
- **Duration:** Could take 10+ minutes of sim time (adjustable with time acceleration).
- **Technical note:** This is a GPU-hostile workload in vanilla JS. Use WebGPU compute where parallelism fits, WASM for serial CPU-heavy kernels, and chunked spatial approximations such as spatial hashing or Barnes-Hut style aggregation.

### D1v2 — WebGPU Required Runtime
- **Decision:** WebGPU (`navigator.gpu`) is the required render and GPU-compute API.
- **Rationale:** The visual target depends on WGSL render passes, G-buffer composition, point lights, and simulation data passes. Maintaining WebGL2 as a second runtime would split acceptance and block the WebGPU/WASM architecture.
- **Constraint:** Browsers without WebGPU show a WebGPU-required failure state and stop startup. WebGL2 is legacy migration debt only, not a runtime fallback.

### D1-WASM — Sidecar WASM For Serial Simulation Kernels
- **Decision:** Rust/WASM sidecars handle CPU-heavy serial simulation kernels that do not map cleanly to GPU compute.
- **Rationale:** River networks, erosion, tectonics, and similar algorithms need deterministic serial or graph-heavy work without blocking the render thread.
- **Constraint:** WASM is built offline, committed as base64 sidecars, and initialized through a worker-safe no-fetch path for `file://` compatibility.

### D013 — Epoch 1: Primordial Planet
- **Decision:** Dual-layer simulation — geology AND chemistry simultaneously.
- **Geology:** Tectonic plates, volcanic activity, ocean formation, atmosphere evolution, continent drift.
- **Chemistry:** Atmospheric chemistry, ocean chemistry, mineral formation, amino acid synthesis.
- **Visual:** Player watches continents form while the chemical conditions for life accumulate.
- **Time scale:** Millions of years per second.
- **Great Filter:** Life may never emerge if conditions don't converge.

### D014 — Epoch 2: Microbial Life
- **Decision:** OPEN — keep mechanics flexible for experimentation.
- **Candidates explored:** Tile-based individual agents, concentration fields (reaction-diffusion), colony-based per-tile populations, simplified agent-based.
- **Designer note:** "I will know it when I see it." Each epoch's mechanical approach needs to be prototyped and evaluated for practicality, visual appeal, and art style fit.
- **Implication:** The GDD will describe the DESIGN INTENT for each epoch (what the player should experience) but leave implementation approach as "experimental" with candidate strategies listed.

### D015 — Epochs 3-4: Biological Evolution Visualization
- **Decision:** Continuous morphological evolution. NO hard epoch boundaries.
- **Design:** Organisms gradually change appearance based on accumulated traits. A fish develops limbs, crawls onto land. The player watches it happen frame by frame across deep time.
- **Implication:** Requires a visual representation system that can express a wide trait space (body plan, limb count, size, coloring, appendages) — not just colored dots.

### D016 — Epoch 5: Intelligence Emergence
- **Decision:** Gradual continuum, not a threshold switch.
- **Design:** Tool use, language, social complexity develop independently on separate trait axes. They combine and reinforce. There's no single "intelligence moment" — a species with high tool use but low social behavior looks very different from one with the reverse.
- **Great Filter:** Intelligence may never emerge if the right combination of traits doesn't accumulate. Environmental pressures (climate change, resource scarcity, competition) influence which traits are selected for.

### D017 — Epoch 6: Tribal Formation
- **Decision:** Hybrid of all candidate approaches.
- **Design:** Tribal formation emerges from the intersection of:
  1. **Population dynamics** — Dense clustering with sufficient resources enables groups
  2. **Social trait evolution** — Cooperation, communication, hierarchy traits must be present
  3. **Cultural transmission** — Learned behaviors pass to offspring, creating cultural evolution alongside biological
- **Implication:** This is a multi-factor emergence system. No single condition is sufficient — all three layers interact.

### D018 — Epochs 7-10: Civilization Great Filters
- **Decision:** ALL eight Great Filter categories included.
- **Filters:**
  1. **Resource wars** — Finite planetary resources drive conflict, collapse, or innovation
  2. **Climate feedback** — Industrialization changes atmosphere. Self-inflicted runaway warming/cooling
  3. **Nuclear/WMD risk** — Advanced civilizations develop self-ending weapons. Game theory plays out
  4. **AI/automation divergence** — Automation may cause transcendence, stagnation, or self-destruction
  5. **Cultural stagnation** — Civilizations can get "stuck" at a tech level. Social ossification
  6. **Pandemic/plague** — Dense populations vulnerable to disease. Biological filter
  7. **Asteroid/cosmic events** — External extinction events. Planet can get hit regardless of progress
  8. **Internal politics/fragmentation** — Empires fracture, civil wars, dark ages. Progress is not linear.
- **Design note:** Each filter should emerge from simulation dynamics, not scripted events. Resource wars happen because resources actually deplete. Climate change happens because atmospheric chemistry is actually modeled.

### D019 — Epochs 10-11: Space Mechanics
- **Decision:** Physics-based orbital mechanics. Real Keplerian orbits, delta-v budgets, transfer windows.
- **Design:** Civilizations must solve actual orbital mechanics to expand to space. Early space is hard, expensive, dangerous.
- **Implication:** Requires N-body gravitational simulation at solar system scale. Vanilla JS orbital integrator.

### D020 — Epoch 12: Endgame
- **Decision:** Open-ended. No defined "win" state. The simulation keeps running.
- **Design:** The player decides when they've seen enough. Civilizations that reach Kardashev Type II, III, or transcendence are not "victories" — they're milestones in an ongoing simulation.
- **Implication:** No end screen, no score. The reward is the journey.

### D021 — Time Scale Management
- **Decision:** Hybrid — Adaptive baseline + manual override + event slowdowns.
- **Adaptive baseline:** Sim detects current epoch and sets natural pace (cosmological = billions yr/sec, biological = millions, civilization = years, space = months).
- **Manual override:** Player can always adjust speed via slider/buttons.
- **Event slowdowns:** Big moments (first cell, first land animal, first tool, first settlement, first nuclear weapon, first orbital launch) automatically get a spotlight — the sim slows or pauses briefly to draw attention.
- **Implication:** Needs an event detection system that recognizes "significant moments" and signals the time controller.

### D022 — Player Tools (Full Suite)
- **Decision:** All 10 observation tools included in the GDD.
- **Tools:**
  1. **Camera controls** — Google Earth-style pan, zoom, rotate at all scales
  2. **Time controls** — Speed, pause, step
  3. **Seed/initial conditions** — Element ratios, stellar mass, planet count, etc.
  4. **Observation overlays** — Temperature, population density, resources, atmosphere, evolutionary trees
  5. **Lineage tracking** — Follow a species/civilization through time. Pin and watch its story
  6. **Timeline/history** — Scrub back through events. Possibly branch/fork history
  7. **Statistics dashboard** — Population, resources, traits, biodiversity metrics
  8. **Bookmarks/annotations** — Mark moments, build personal planet history log
  9. **Parameter nudging** — Adjust mutation rate, disaster frequency, resources during sim
  10. **Screenshot/recording** — Capture and share moments
- **Technical note:** Timeline scrubbing with branching requires periodic world-state snapshots. Memory-intensive for browser. Needs compression strategy.

---

## Discovery Phase Complete — 2026-06-01

All core design dimensions walked:
- 6 game pillars
- Core emotional loop (Fermi Paradox aquarium)
- 12 epochs from Big Bang to open-ended transcendence
- All Great Filters as emergent drama generators
- Physics-based orbital mechanics
- Continuous morphological evolution (no hard boundaries)
- Hybrid time scaling with event spotlight
- Full 10-tool observation suite
- Phase 1 priority: Planet rendering + performance

**Next step:** Draft the full GDD from these decisions.

---

## Finalization — 2026-06-01

### Validation Pass Results

| ID | Status | Fix Applied |
|----|--------|-------------|
| Q-1 | ⚠️ warn | Minor filler — acceptable for draft |
| Q-2 | ✅ pass | Measurable targets present |
| Q-3 | ⚠️ fixed | Added Systems Interaction Map |
| Q-4 | ✅ pass | Pillars + loop documented |
| Q-5 | ✅ pass | Out of Scope present |
| Q-6 | ✅ pass | Self-contained sections |
| D-1 | ⚠️ fixed | Removed Barnes-Hut, WebWorker, Canvas 2D API names from epoch descriptions |
| D-3 | ✅ pass | Tech specs stay GDD-level |
| G-1 | ⚠️ fixed | Added systems_map, balance_long_tail, emergence_boundaries, end_state |
| G-2 | ✅ pass | Game type matches simulation, genre guide sections present |
| S-3 | ✅ fixed | Assumptions now indexed with A-1 through A-5 |
| S-4 | ✅ pass | No unfilled template variables |

### Fixes Applied
1. Added **Systems Interaction Map** with ASCII system dependency diagram and key feedback loops
2. Added **Long-Tail Balance** section with 5 anti-stagnation strategies
3. Added **Emergence Boundaries** section with 6 guardrails against degenerate states
4. Added **End State** section with 12 observable milestones
5. Cleaned implementation-specific terms from epoch descriptions (Barnes-Hut → spatial partitioning, WebWorkers → generic reference)
6. Indexed all assumptions (A-1 through A-5)

### GDD Status: READY
- `gdd.md` — finalized, validation passed
- `epics.md` — finalized, 13 epics across 5 phases
- `decision-log.md` — 22 design decisions + finalization record





