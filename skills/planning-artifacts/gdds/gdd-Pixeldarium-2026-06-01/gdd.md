---
title: Pixeldarium
game_type: Simulation
platforms: [Web Browser (HTML/CSS/JS)]
created: 2026-06-01
updated: 2026-06-01
---

# Pixeldarium — Game Design Document

**Author:** Aaron Kotz
**Game Type:** Simulation / Observation / Sandbox
**Target Platform(s):** Web Browser (desktop, any modern Chromium/Firefox/Safari)

---

## Executive Summary

### Core Concept

Pixeldarium is a browser-based planetary simulation that runs the full arc of cosmic history — from the Big Bang through biogenesis, evolution, civilization, and galactic expansion — as one continuous, emergent simulation. The player is a cosmic observer: watching, investigating, and gently nudging a procedurally generated universe to see which of its civilizations survive the Great Filters and which collapse under their own weight.

The entire experience runs in pure HTML, CSS, and JavaScript with zero external libraries. The planet view is as smooth and interactive as Google Earth. Time spans 14 billion years. Nothing is scripted. Everything emerges from simple rules interacting at increasing scales of complexity.

It is a Fermi Paradox aquarium — a digital paludarium of civilization.

### Target Audience

- **Primary:** The watchers. Science enthusiasts fascinated by cosmology, evolution, astrobiology, the Fermi Paradox, and Great Filter theory. Isaac Arthur viewers. Kurzgesagt fans. People who watch Dwarf Fortress let's plays for the emergent stories but never play because the management is too demanding. People who watch procedural generation videos for hours. The audience for WATCHING deep simulations is far larger than the audience for PLAYING them — Pixeldarium serves the watchers directly.
- **Secondary:** Simulation game players who DO play (Songs of Syx, Dwarf Fortress, RimWorld, Species: ALRE, Thrive, Spore, Conway's Game of Life). People who enjoy emergent systems and want to tinker with initial conditions.
- **Tertiary:** Web technology enthusiasts who appreciate the "built in vanilla JS" constraint as a technical feat.

### Unique Selling Points (USPs)

1. **Big Bang to Galactic Empire in one continuous simulation** — no loading screens, no phase breaks, no scripted transitions. Every epoch is earned by the one before it.
2. **Fermi Paradox as gameplay** — the Great Filters are not events, they are emergent consequences of simulated physics, chemistry, biology, and sociology. Most civilizations fail. The rare successes are the reward.
3. **Google Earth fluidity** — seamless zoom from a single microbe to the full planet to the solar system, with procedural detail at every scale.
4. **Zero dependencies** — pure HTML/CSS/JS. No npm, no Node, no build tools, no libraries. Runs from a folder on any desktop. Pushes browser technology to its absolute limits.
5. **Continuous morphological evolution** — organisms gradually change appearance as traits accumulate. Watch a fish develop legs. There are no hard epoch boundaries.

---

## Goals and Context

### Project Goals

1. Build the most ambitious browser-based simulation ever attempted in vanilla web technology.
2. Create an experience that makes the Fermi Paradox visceral — not abstract. The player should FEEL the improbability of technological civilization.
3. Demonstrate that HTML/CSS/JS can deliver experiences typically associated with Unity, Unreal, or native code.
4. Produce a simulation that is genuinely fascinating to watch — a "fish tank for the cosmos" that the player leaves running while they work.
5. Build iteratively with phased implementation. Phase 1: Make the planet beautiful and fast. Phase 2+: Deepen each epoch.

### Background and Rationale

**Inspiration sources:**
- **Songs of Syx** — pixel art civilization management, deep systems, satisfying scale
- **Google Earth** — smooth, interactive, multi-scale planetary navigation
- **Species: ALRE** — watching artificial evolution unfold without player control
- **Thrive** — staged evolution from microbe to galactic civilization
- **Isaac Arthur (YouTube)** — Fermi Paradox, Great Filters, megastructures, Kardashev scale
- **Paludarium/aquarium hobby** — the joy of building a living system and watching it evolve

**The core question this game answers:** "If you started a universe from scratch with slightly different initial conditions, what kind of life — if any — would emerge? Would it survive?"

**Design philosophy:** Games like Dwarf Fortress, RimWorld, and Spore have proven that emergent stories are deeply compelling. But they gate that experience behind complex management UIs that most people bounce off. The audience for WATCHING these games (YouTube, Twitch, let's plays, Reddit stories) vastly exceeds the audience for playing them at a high level. Pixeldarium removes the management gate entirely. The emergent story engine IS the product. The goal is legendary depth — so many interconnected systems that you can zoom into any corner of the simulation and find something happening. Every settlement has a story. Every lineage has a history. Every extinction has a traceable cause. The player should be able to get lost in it for hours.

---

## Core Gameplay

### Game Pillars

#### 1. Emergent Complexity
Simple rules at each scale produce surprising, unscripted outcomes. The simulation IS the game. A cellular automaton doesn't know it's building a cathedral. The player's delight comes from watching complexity arise from simplicity.

#### 2. Seamless Scale
One continuous world from the molecular to the galactic. Zoom from a single organism to the whole planet to the star system without a loading screen, without a seam. Google Earth fluidity is the benchmark. Every zoom level has meaningful content.

#### 3. Deep Time
Billions of years unfold. Every epoch is earned by the one before it. Nothing is handed to the player; everything is earned by the simulation. The fish doesn't magically become a land animal — it accumulates limb traits over millions of simulated years.

#### 4. Vanilla Browser Mastery
Pure HTML/CSS/JS, no libraries. The technical constraint is a design identity, not a limitation. The game is proof that browser technology can do things people think require native engines. Every optimization is a design statement.

#### 5. Observable Complexity
The simulation must be fascinating to WATCH. Visual clarity at every zoom level. The player should be able to see and understand what's happening through visual cues alone — patterns, colors, movements, scale changes — without depending on tooltips or text.

#### 6. Living Planet
The planet is an active participant, not a backdrop. Geology, weather, oceans, and continents shape what life can become. Tectonic activity creates mountain barriers that isolate populations. Ocean currents distribute nutrients. Climate shifts drive evolution. The terrain is never just scenery.

### Core Gameplay Loop

**Watch → Wonder → Wait → Witness (or Mourn)**

This is not a traditional "do → feedback → optimize" game loop. Pixeldarium is an observation experience:

1. **Watch** — The player observes the simulation at their chosen scale and time speed. They navigate the planet, zoom in on interesting areas, browse overlays.
2. **Wonder** — Patterns emerge. A promising species appears. A civilization starts building near a volcano. The player thinks: "Will these ones make it?"
3. **Wait** — The player watches pressure build. Resources deplete. A rival civilization expands nearby. Climate shifts. Tension accumulates.
4. **Witness** — The outcome unfolds. The species adapts and thrives — or collapses. The civilization launches its first orbital mission — or nukes itself. The player experiences emergence.

→ Back to **Watch** with new understanding of how this particular universe works.

The player's agency is in choosing WHERE to look, WHEN to speed up or slow down, and WHAT initial conditions to set. They are a cosmic scientist, not a god.

### Win/Loss Conditions

**None.** The simulation is open-ended. There is no victory screen, no score, no failure state for the player. The SIMULATION's civilizations can fail the Great Filters, but the player cannot lose. The reward is the journey.

Civilizations that reach Kardashev Type I, II, or III are milestones — not victories. Post-biological transcendence is an observed phenomenon, not a win condition.

---

## Game Mechanics

### Primary Mechanics

#### Observation
The player can navigate the world at any scale, from a single microbe to the full galaxy. Camera movement is smooth and responsive. Zoom transitions are seamless. Each zoom level reveals appropriate detail — organisms at ground level, biome patterns at regional level, continental structure at global level, orbital paths at solar system level.

#### Time Control
Hybrid adaptive time scaling:
- **Adaptive baseline:** The sim detects which epoch is active and sets a natural pace (cosmological = ~1 billion years/sec, geological = ~10 million years/sec, biological = ~100,000 years/sec, civilizational = ~10 years/sec, space age = ~1 month/sec).
- **Manual override:** The player can always adjust speed via slider (1x to 10,000x).
- **Event spotlight:** Significant moments (first cell division, first multicellular organism, first land animal, first tool use, first settlement, first nuclear detonation, first orbital launch) automatically trigger a brief slowdown or pause to draw the player's attention.

#### Parameter Nudging
During the simulation, the player can adjust global parameters:
- Mutation rate
- Disaster frequency
- Resource abundance
- Solar radiation
- Volcanic activity

These are not "god powers" — they are scientific instrument adjustments. The player is running an experiment, not playing a god game.

#### Seed and Initial Conditions
Before the simulation starts, the player can configure:
- **Random seed** — deterministic RNG for reproducible runs
- **Element ratios** — hydrogen, helium, heavier element distribution from the Big Bang
- **Stellar mass** — affects habitable zone, planet formation, stellar lifetime
- **Planet count** — how many planets form in the solar system
- **Presets** — "Super-Earth," "Water World," "Desert Planet," "Earth-like" etc. (these are initial-condition presets, not planet-type selectors; the actual planet type emerges from the physics)

### Controls and Input

| Input | Action |
|-------|--------|
| Mouse drag | Pan camera |
| Scroll wheel | Zoom in/out (Google Earth-style smooth zoom) |
| Right-click drag | Rotate globe |
| Click | Inspect tile/entity |
| Space | Pause/resume |
| N | Step one tick (while paused) |
| +/- | Increase/decrease sim speed |
| R | Restart with current seed |
| 1-9 | Toggle observation overlays |
| Tab | Cycle inspection targets |
| Esc | Close menu/panel |
| Arrow keys | Pan camera |

---

## Simulation Specific Elements

### Core Simulation Systems

**What is being simulated:** The complete physical, chemical, biological, and sociological history of a universe — from the Big Bang through galactic civilization.

**Simulation depth:** Hybrid realistic/emergent. Each scale uses the simplest model that produces believable emergent behavior. The cosmological layer uses Newtonian gravity with Barnes-Hut approximation. The biological layer uses trait-based evolutionary agents. The civilizational layer uses resource/territory/technology competition. Realism is valued, but emergent drama takes priority over physical accuracy when they conflict.

**System interconnections:** Every layer feeds the next:
- Cosmology → determines element distribution → determines planet composition
- Planet composition → determines geology → determines biomes and climate
- Biomes/climate → determines food distribution → determines evolutionary pressure
- Evolutionary pressure → determines which traits survive → determines species capability
- Species capability → determines civilization potential → determines technology trajectory
- Technology trajectory → determines Great Filter encounters → determines survival

**Emergent behaviors (design intent):**
- Convergent evolution (separate lineages independently develop similar traits)
- Civilization rise and fall cycles
- Mass extinction events followed by adaptive radiation
- Arms races between predator and prey species
- Climate-driven migration patterns
- Resource-driven warfare between civilizations
- Accidental self-extinction (nuclear winter, runaway climate change)

**Simulation tickrate:** Variable by epoch. Target: 60 FPS rendering with decoupled simulation ticks. Sim tick rate adjusts with time scale — cosmological epochs may process millions of years per tick, while civilizational epochs process days.

### Epoch Architecture

The simulation progresses through a continuous sequence of emergent epochs. There are no hard boundaries between epochs — each emerges naturally from the conditions created by the previous one. The epoch labels are observational categories, not mechanical phases.

#### Epoch 0: Cosmological Formation
- **Simulates:** Big Bang → element synthesis → galaxy formation → solar system → planet accretion
- **Model:** Gravitational N-body simulation with spatial partitioning for performance. Particle system for dust and gas dynamics.
- **Player sees:** Dust condenses. Stars ignite. An accretion disk forms. Planets coalesce from debris. Orbital mechanics stabilize.
- **Duration:** ~10 minutes of real time at default speed
- **Transition to next:** When a rocky planet with stable orbit and liquid water potential forms
- **[IMPLEMENTATION: EXPERIMENTAL]** — Full particle sim at this scale requires aggressive optimization to maintain 60 FPS in a browser.

#### Epoch 1: Primordial Planet
- **Simulates:** Tectonic plates, volcanic activity, ocean formation, atmosphere evolution, continent drift + atmospheric chemistry, ocean chemistry, amino acid synthesis
- **Model:** Dual-layer — geological simulation (continental drift, volcanism, ocean basins) + chemical simulation (atmospheric composition, ocean pH, organic molecule concentration)
- **Player sees:** Continents form and drift. Volcanoes erupt. Oceans fill. A "life progress" indicator builds as chemical conditions converge.
- **Great Filter:** Life may never emerge if conditions don't converge (wrong atmosphere, too much volcanic activity, no liquid water stability).
- **Transition to next:** When chemical complexity crosses the abiogenesis threshold

#### Epoch 2: Microbial Life
- **Simulates:** Single-cell organisms competing for chemical energy, reproducing, mutating
- **Model:** [EXPERIMENTAL] Candidate approaches: individual agents (tile-based), concentration fields (reaction-diffusion), per-tile population numbers, or simplified agent-based. The right model depends on visual appeal, performance, and what looks right at this scale.
- **Player sees:** Color blooms spreading across oceans. Microbial mats forming. Competition for energy sources. Mass die-offs and recoveries.
- **Great Filter:** Multicellularity may never emerge. Most microbial populations stay simple.
- **Transition to next:** When cell cooperation mechanisms evolve (symbiosis, colonial behavior)

#### Epoch 3: Multicellular Life
- **Simulates:** Complex organisms with body plans, organ systems, predator/prey dynamics
- **Model:** Trait-based agents with continuous morphological evolution. Organisms' visual appearance changes gradually as traits accumulate.
- **Player sees:** Creatures in the ocean growing larger, developing distinct body shapes. Predators chasing prey. Cambrian-explosion-style diversification.
- **Great Filter:** Land colonization requires specific adaptations (lungs/air-breathing, structural support, desiccation resistance). Many lineages never make it.
- **Transition to next:** When organisms develop traits sufficient for terrestrial survival

#### Epoch 4: Land Colonization
- **Simulates:** Terrestrial ecosystems, plant-analog ground cover, land-adapted organisms, food webs
- **Model:** Extended trait-based agents with terrain affinity, new trait axes (terrestrial movement, temperature regulation, reproductive strategies)
- **Player sees:** Organisms crawling out of water. Green cover spreading across land. Forests of organisms developing. Diverse terrestrial ecosystems.
- **Great Filter:** Mass extinction events (volcanic, asteroid, climate shift) can reset progress. Biodiversity may crash.
- **Transition to next:** When neurological complexity traits reach levels that enable tool-like behavior

#### Epoch 5: Intelligence Emergence
- **Simulates:** Gradual development of cognitive capabilities across a continuum
- **Model:** Intelligence is NOT a threshold — it's a spectrum built from independent trait axes:
  - Tool use (manipulation capability)
  - Language (communication complexity)
  - Social behavior (cooperation, teaching)
  - Planning (temporal reasoning, cause-effect)
  - Memory (information storage, cultural learning)
- **Player sees:** Species using rudimentary tools. Social groups forming. Behavioral complexity increasing visibly.
- **Great Filter:** The right combination of traits may never accumulate. A species can be great at tool use but antisocial, or highly social but without manipulative appendages.
- **Transition to next:** When social+tool+communication traits combine sufficiently for group coordination

#### Epoch 6: Tribal Societies
- **Simulates:** Pre-settlement social groups, cultural evolution, inter-group dynamics
- **Model:** Hybrid emergence from three interacting systems:
  1. **Population dynamics** — Dense clustering with sufficient resources enables groups
  2. **Social trait evolution** — Cooperation, communication, hierarchy traits must be present
  3. **Cultural transmission** — Learned behaviors pass to offspring alongside genetic traits
- **Player sees:** Groups of intelligent organisms moving together. Territory marking. Inter-group encounters (trade, conflict, avoidance). Cultural differentiation between groups.
- **Great Filter:** Tribal warfare, resource depletion, disease, natural disasters can prevent settlement.
- **Transition to next:** When a tribe accumulates enough resource surplus and technological knowledge for permanent settlement

#### Epoch 7: Settlement / Early Civilization
- **Simulates:** Permanent settlements, agriculture, crafts, trade, early governance
- **Model:** Settlement entities with population, food stock, development level, technology. Supply routes between settlements.
- **Player sees:** Buildings appearing on the landscape. Fields around settlements. Roads connecting villages. Population growth visible.
- **Current codebase state:** settlements.js has ~400 lines for this epoch.
- **Transition to next:** When settlement complexity, population, and technology reach city-state thresholds

#### Epoch 8: City-States / Nations / Warfare
- **Simulates:** Political entities, territory control, warfare, diplomacy, cultural identity
- **Model:** Territory-claiming entities with military, economic, diplomatic capabilities. Borders shift based on power dynamics.
- **Player sees:** Borders appearing on the map. Armies moving. Cities growing. Empires expanding and contracting. Dark ages and renaissances.
- **Great Filters active:**
  - Resource wars (finite planetary resources)
  - Internal politics/fragmentation (empires fracture, civil wars)
  - Pandemic/plague (dense populations vulnerable)
  - Cultural stagnation (societies can get stuck at a tech level)

#### Epoch 9: Industrial Revolution / Technology
- **Simulates:** Technological acceleration, resource extraction, atmospheric modification, global connectivity
- **Model:** Technology tree (emergent, not prescribed), industrial production chains, atmospheric chemistry feedback from industry
- **Player sees:** Factories appearing. Transportation networks. Cities glowing at night. Atmospheric haze. Global temperature changes visible.
- **Great Filters active:**
  - Climate feedback (industrialization changes atmosphere — runaway warming/cooling)
  - Nuclear/WMD risk (advanced civilizations develop self-ending weapons)
  - AI/automation divergence (may cause transcendence, stagnation, or self-destruction)

#### Epoch 10: Space Age
- **Simulates:** Orbital mechanics, rocket physics, satellite networks, planetary exploration
- **Model:** Physics-based Keplerian orbits, delta-v budgets, transfer windows. Gravitational simulation at solar system scale.
- **Player sees:** Rockets launching. Satellites orbiting. Space stations. Lunar/planetary bases. Transfer orbits visible.
- **Great Filter:** Getting to space is HARD. Most civilizations that develop nuclear weapons destroy themselves before achieving sustainable spaceflight.
- **Transition to next:** When a civilization establishes self-sustaining off-world presence

#### Epoch 11: Interstellar Expansion
- **Simulates:** Generation ships, stellar engineering, multi-system civilization management
- **Model:** Interstellar travel mechanics (sub-light unless physics allows FTL emergence), colony establishment on surveyed systems
- **Player sees:** Ships departing the solar system. New colonies appearing around other stars. Communication networks spanning light-years.
- **Transition to next:** No defined transition — the simulation continues

#### Epoch 12: Post-Biological / Transcendence (Open-Ended)
- **Simulates:** Whatever emerges. Possible outcomes include Kardashev Type II/III civilizations, Dyson swarms, digital consciousness, galactic gardening (seeding new planets with life), heat death awareness.
- **Model:** Open. The endgame mechanics depend entirely on what the earlier epochs produced.
- **Player sees:** Megastructures. Stellar engineering. Potentially the simulation coming full circle as a transcendent civilization seeds new star systems with life.
- **No endpoint.** The simulation keeps running. The player decides when they've seen enough.

### Management Mechanics

Pixeldarium is primarily an observation game, not a management game. The player does NOT manage resources, place buildings, or direct units. Instead, the player manages their own ATTENTION:

- **What to watch** — camera position, zoom level, which overlay to display
- **When to watch** — time speed, pause, event spotlight
- **What to investigate** — lineage tracking, entity inspection, historical timeline
- **What to experiment with** — parameter nudging, initial conditions, seed variation

The simulation manages itself. The player's role is scientific observation.

### Building and Construction

Not applicable. There is no player-directed construction. Settlements, cities, and infrastructure are built by the simulated civilizations autonomously.

### Economic and Resource Loops

The economy exists WITHIN the simulation, not as a player-facing mechanic:

- **Biological economy:** Energy flows from sunlight → photosynthesis → food chains → decomposition. Organisms compete for energy.
- **Civilizational economy:** Resources (food, materials, energy) flow through settlement networks. Trade routes emerge between settlements with complementary resources.
- **Industrial economy:** Extraction → manufacturing → consumption → waste. Finite resources create pressure for innovation or conflict.
- **Interstellar economy:** Colony networks, resource transfer across star systems.

The player observes these economies through overlays and dashboards but does not participate directly.

### Progression and Unlocks

#### Simulation Progression
Progression is emergent, not prescribed. The simulation does not follow a fixed tech tree or unlock sequence. What happens depends entirely on the initial conditions and the emergent dynamics of each run.

However, certain capabilities are PREREQUISITES for others:
- Multicellularity requires cell cooperation mechanisms
- Intelligence requires sufficient neurological complexity
- Settlement requires agriculture-equivalent food surplus
- Space requires industrial-level technology AND political stability

These are not unlock gates — they are physical/evolutionary constraints that the simulation enforces naturally.

#### Observation Tool Unlocks
As the simulation reaches new epochs, new observation tools become relevant:
- **Epoch 0-1:** Camera, time controls, geological overlays
- **Epoch 2-4:** Organism inspection, trait overlays, lineage tracking
- **Epoch 5-6:** Social behavior overlays, cultural maps
- **Epoch 7-9:** Political borders, trade routes, technology indicators, atmospheric overlays
- **Epoch 10-12:** Orbital view, solar system navigation, interstellar map

Tools are always available — they just show meaningful data once the relevant epoch is active.

### Sandbox vs. Scenario

Pixeldarium is purely sandbox. There are no scenarios, campaigns, or guided missions.

**Sandbox mode:** Every run is unique. The player sets initial conditions and watches. There is no "correct" outcome.

**Seed system:** Deterministic RNG ensures reproducible runs. Share a seed to let someone else watch the same universe unfold.

**Preset initial conditions:** "Super-Earth," "Water World," "Desert Planet," "Binary Star," "Heavy Metal" (high heavy-element ratio), "Quiet Universe" (low disaster frequency), "Crucible" (high disaster frequency, strong selective pressure).

### Systems Interaction Map

The simulation is built from interconnected systems where each layer's output feeds the next layer's input. No system operates in isolation.

```
Cosmological Physics
  └─▶ Element Distribution
        └─▶ Stellar/Planetary Formation
              └─▶ Geological Systems ◀──▶ Atmospheric Chemistry
                    │                        │
                    ├─▶ Biome Distribution    ├─▶ Climate System
                    │     │                  │     │
                    │     └─▶ Food/Energy ◀──┘     │
                    │           │                   │
                    │           └─▶ Organism Population
                    │                 │
                    │                 ├─▶ Trait Evolution ◀─▶ Environmental Pressure
                    │                 │     │
                    │                 │     └─▶ Intelligence Spectrum
                    │                 │           │
                    │                 │           └─▶ Social/Cultural Systems
                    │                 │                 │
                    │                 │                 └─▶ Settlement/Civilization
                    │                 │                       │
                    │                 │                       ├─▶ Technology
                    │                 │                       │     │
                    │                 │                       │     └─▶ Atmospheric Impact ──▶ Climate Feedback
                    │                 │                       │
                    │                 │                       ├─▶ Resource Extraction ──▶ Depletion Pressure
                    │                 │                       │
                    │                 │                       └─▶ Space Capability
                    │                 │                             │
                    │                 │                             └─▶ Interstellar Expansion
                    │                 │
                    └─────────────────┴─▶ Mass Extinction Events (external: asteroid, volcanic)
```

**Key feedback loops:**
- Civilization → atmospheric chemistry → climate → food supply → population → civilization stability
- Organism traits → food web dynamics → environmental pressure → trait selection
- Resource extraction → depletion → conflict OR innovation → technology → new resources
- Population density → disease risk → population crash → reduced density

### Long-Tail Balance

The simulation must remain interesting across very long play sessions (8+ hours). Balance strategies:

- **No equilibrium traps.** If a system reaches stable equilibrium, perturbation mechanisms (random mutations, geological events, asteroid impacts) prevent permanent stasis.
- **Catastrophe recovery.** Mass extinction events clear dominant species and create adaptive radiation windows. The simulation recovers, not restarts.
- **Multiple concurrent civilizations.** A single planet can host multiple competing civilizations that rise and fall independently, preventing single-lineage stagnation.
- **Technology isn't permanent.** Dark ages, resource depletion, and political collapse can cause technological regression. A civilization at industrial level can fall back to agrarian.
- **Speciation prevents monoculture.** Reproductive isolation from geographic barriers, trait divergence, or cultural separation ensures biodiversity doesn't collapse to a single species.

### Emergence Boundaries

Emergent behavior is the core of Pixeldarium, but unconstrained emergence can produce degenerate states. Boundaries:

- **Population hard caps per tile.** Prevents infinite organism stacking. Enforced by energy/food scarcity, not arbitrary limits.
- **Extinction recovery window.** After a mass extinction, food regrowth and mutation rates increase temporarily to prevent permanent dead worlds.
- **Trait value clamping.** Individual traits have physical bounds (vision range can't exceed planetary scale, metabolism can't go negative). The simulation enforces physical plausibility.
- **Civilization collapse floor.** A civilization can regress but cannot un-evolve its species. Biological traits persist even if cultural/technological progress is lost.
- **Time scale guardrails.** The adaptive time system prevents the simulation from racing through interesting epochs. Event spotlight ensures the player doesn't miss critical moments.
- **Resource regeneration.** Planetary resources regenerate on geological timescales (millions of years). A civilization that depletes resources faces pressure but the planet eventually recovers for the next cycle.

### End State

Pixeldarium has no defined end state. The simulation is open-ended by design decision (D020).

**Observable milestones** (not win conditions):
- First self-replicating molecule
- First multicellular organism
- First land colonization
- First tool use
- First permanent settlement
- First city-state
- First industrial-scale technology
- First orbital launch
- First interstellar mission
- Kardashev Type I (planetary energy utilization)
- Kardashev Type II (stellar energy utilization)
- Kardashev Type III (galactic energy utilization)

**The simulation continues indefinitely.** A transcendent civilization may seed new planets, creating nested simulations. A collapsed civilization may leave behind ruins that a new species discovers millions of years later. The player watches as long as they choose.

---

## Progression and Balance

### Player Progression

There is no player progression in the traditional sense. The player does not level up, unlock abilities, or gain power. Instead, the player's understanding deepens:

- First run: "Wow, things are happening."
- Fifth run: "I see how tectonic activity affects biome distribution, which affects food density, which affects population pressure, which affects evolutionary rate."
- Twentieth run: "If I increase the heavy element ratio, I get more volcanic activity early, which produces a thicker atmosphere, which traps more heat, which makes the habitable zone narrower, which concentrates life near the poles, which creates more competition, which accelerates intelligence emergence."

This is progression through UNDERSTANDING, not through mechanical advancement.

### Difficulty Curve

Not applicable in the traditional sense. The simulation's difficulty is the complexity of its systems. The player's challenge is comprehension, not skill.

### Economy and Resources

See "Economic and Resource Loops" in Simulation Specific Elements.

---

## Level Design Framework

### Level Types

There are no levels. The entire simulation takes place on one continuous, procedurally generated planet (and eventually its solar system and galaxy).

### Level Progression

Progression is epoch-based and emergent. See "Epoch Architecture" in Simulation Specific Elements.

---

## Art and Audio Direction

### Art Style

**Pixel art at all scales.** Every entity, terrain feature, and structure is rendered as discrete pixels via WebGPU — no SVG, no 3D models, no Canvas 2D. The aesthetic is Songs of Syx meets Google Earth:

- **Globe view:** Procedural terrain coloring per pixel. Continents, oceans, ice caps, biome bands visible. Atmospheric haze and cloud layer overlay.
- **Regional view:** Biome detail. River systems visible. Mountain ranges. Coastline detail. Individual terrain features.
- **Local view:** Individual organisms visible as pixel entities. Food sources. Ground texture detail (grass, sand, rock, water). Settlements as pixel structures.
- **Sub-local view (future):** Organism morphology visible. Trait expression shown through body shape, size, coloring, appendages.

**Color palette:** Naturalistic but heightened. Earth tones for terrain with enough saturation to be readable at small pixel sizes. Organisms use distinct hue families for lineage identification. Civilizations develop visual culture (flags, building styles) as they advance.

**Visual language:**
- Healthy ecosystems: vibrant, varied colors
- Stressed ecosystems: desaturated, sparse
- Extinct areas: grey, still
- Active civilizations: glowing points of light (especially at night)
- Atmospheric pollution: visible haze over industrial areas
- Nuclear events: bright flash → expanding grey zone

### Audio and Music

**[DEFERRED]** Audio is not in Phase 1 scope. Future considerations:
- Ambient procedural soundscapes that reflect the current epoch and zoom level
- Geological rumble at planetary formation scale
- Ocean/wind ambience at surface level
- Civilization buzz at city scale
- Electronic/cosmic tones at space scale

---

## Technical Specifications

### Performance Requirements

- **Frame rate:** 60 FPS sustained on modern desktop browsers (Chrome 120+, Firefox 120+, Safari 17+)
- **Simulation rate:** Decoupled from frame rate. Target: 60 TPS at civilizational time scale, with time compression for geological/cosmological scales
- **Memory:** Target <500 MB browser memory footprint with full simulation running
- **Load time:** <2 seconds from file open to first frame
- **Zoom transitions:** <16ms per frame during continuous zoom (no stutter, no pop-in visible to the player)

### Platform-Specific Details

- **Runtime:** Any modern web browser. No Node.js, no npm, no build tools.
- **Deployment:** Static files served from a local folder OR GitHub Pages. No server-side code.
- **Storage:** IndexedDB for save/load. JSON export/import for portability.
- **No external dependencies:** Zero libraries. Zero CDN imports. Zero npm packages. Pure vanilla HTML, CSS, and JavaScript only.

### Asset Requirements

- **No pre-made assets.** All visuals are procedurally generated via WebGPU render passes and WGSL shaders.
- **No image files loaded from disk.** Terrain, organisms, structures, UI elements — all rendered programmatically via GPU.
- **Font:** System font stack only. No Google Fonts (that would be an external dependency).

---

## Development Epics

### Epic Structure

See `epics.md` for detailed breakdown. Summary table:

| # | Epic | Phase | Priority | Description |
|---|------|-------|----------|-------------|
| E1 | Planet Rendering | 1 | 🔴 Critical | Google Earth-smooth globe navigation, chunk streaming, LOD, visual quality |
| E2 | Performance Foundation | 1 | 🔴 Critical | 60 FPS at all zoom levels, spatial indexing, memory management |
| E3 | Epoch 3-4: Biological Sim | 2 | 🟡 High | Continuous morphological evolution, trait-based organisms, food webs |
| E4 | Epoch 1-2: Primordial + Microbial | 2 | 🟡 High | Geological sim, chemistry sim, abiogenesis, microbial life |
| E5 | Epoch 5-6: Intelligence + Tribal | 3 | 🟡 High | Multi-axis intelligence, social traits, cultural transmission |
| E6 | Epoch 7-9: Civilization Arc | 3 | 🟡 High | Settlements→cities→nations→industrial, Great Filters |
| E7 | Epoch 0: Cosmological | 4 | 🟢 Medium | Big Bang, particle sim, solar system formation |
| E8 | Epoch 10-11: Space + Interstellar | 4 | 🟢 Medium | Orbital mechanics, space program, interstellar expansion |
| E9 | Observation Tools | 2-4 | 🟢 Medium | Overlays, lineage tracking, timeline, stats dashboard, bookmarks |
| E10 | Time Scale System | 2 | 🟢 Medium | Adaptive time, event spotlight, epoch-aware pacing |
| E11 | Epoch 12: Transcendence | 5 | 🔵 Future | Open-ended endgame, megastructures, galactic gardening |
| E12 | Audio | 5 | 🔵 Future | Procedural ambient soundscapes |
| E13 | UI/UX Polish | 2-5 | 🟢 Medium | Dashboard redesign, mobile responsiveness, accessibility |

---

## Success Metrics

### Technical Metrics

- 60 FPS sustained during continuous globe zoom on a 2020-era laptop
- <100ms per simulation tick at 10,000 organisms
- <500 MB memory footprint with full simulation state
- Zero external dependencies (verified by `grep -r "import\|require\|cdn\|googleapis" *.js *.html *.css`)
- IndexedDB save/load round-trip under 2 seconds

### Gameplay Metrics

- A complete Big Bang → first civilization run completes in under 60 minutes of real time at default speed
- At least 3 distinct Great Filter failure modes observable in a typical run
- Lineage tracking can follow a species across 1,000+ generations without loss
- Two different seeds produce visibly different planetary outcomes (continent shapes, biome distribution, species diversity)
- A player can leave the simulation running for 8+ hours without memory leak or performance degradation

---

## Out of Scope

### Explicitly excluded from v1.0

- **Multiplayer** — no shared universes, no multiplayer observation
- **Mobile optimization** — desktop browsers only for Phase 1
- **Audio** — deferred to Phase 5
- **Modding API** — no plugin system or user scripting
- **Pre-rendered assets** — everything is procedural
- **Narrative/story mode** — no scripted content, no campaigns
- **VR/AR** — desktop browser only
- **Localization** — English only

### Deferred to post-v1.0

- **History branching** — rewind and fork the simulation timeline (technically ambitious for browser memory)
- **Civilization comparison** — side-by-side view of multiple civilizations on the same or different planets
- **Galactic gardening endgame** — transcendent civilizations seeding new planets
- **Multi-planet simultaneous sim** — simulating multiple planets in the same solar system with independent biospheres

---

## Assumptions and Dependencies

### Assumptions

- [RESOLVED: A-1: WebGPU (navigator.gpu) is the required rendering API. It is a native browser built-in — not an external library. WebGL2 is legacy migration debt only, not a runtime fallback.]
- [ASSUMPTION: A-2: IndexedDB storage is sufficient for world-state snapshots needed for timeline scrubbing. If snapshot sizes exceed browser storage limits (~50-100 MB per snapshot), compression or selective checkpointing will be needed.]
- [ASSUMPTION: A-3: Spatial-partitioning gravity approximation for the cosmological epoch is achievable at 60 FPS with up to 10,000 particles in the browser. WASM compute (Rust) handles N-body if JS proves insufficient.]
- [ASSUMPTION: A-4: A single browser tab can maintain <500 MB memory footprint while tracking 10,000+ agents across a full planetary simulation. Memory pooling and object reuse will be critical.]
- [RESOLVED: A-5: Web Workers are used for WASM compute. Workers initialize via blob URL (not direct file:// path). WASM binary is base64-encoded in a .wasm.js sidecar. No external dependencies. SharedArrayBuffer not required — Transferable ArrayBuffer zero-copy bridge used instead.]

### Dependencies

- Modern web browser with WebGPU support (Chrome 113+, Edge 113+, Safari 18+)
- WebGPU-required startup failure for browsers without `navigator.gpu`
- IndexedDB for persistence
- No server, no build tools, no runtime dependencies
- wasm-pack (development tool only, not a browser dependency)
