---
title: 'Game Architecture'
project: 'Pixeldarium'
date: '2026-06-01'
author: 'Aaron'
version: '1.0'
stepsCompleted: [1]
status: 'in-progress'

# Source Documents
gdd: 'gdd.md'
epics: 'epics.md'
decision_log: 'decision-log.md'
---

# Pixeldarium — Game Architecture

## Document Status

This architecture document is being created through the GDS Architecture Workflow.

**Steps Completed:** 2 of 9 (Initialize, Context)

---

## Project Context

### Game Overview

**Pixeldarium** — Browser-based planetary simulation running the full arc of cosmic history (Big Bang → galactic civilization) as one continuous, emergent simulation. Player is a cosmic observer watching civilizations attempt the Great Filters. Pure vanilla HTML/CSS/JS, zero dependencies.

### Technical Scope

**Platform:** Desktop web browser (Chrome 120+, Firefox 120+, Safari 17+)
**Genre:** Simulation / Observation / Sandbox (HIGH complexity per genre taxonomy)
**Project Level:** EXTREME — multi-scale physics + biology + civilization sim in vanilla browser JS

### Core Systems

| System | Complexity | GDD Source |
|--------|-----------|------------|
| Planet Rendering (globe, zoom, chunks) | 🔴 Critical | Pillar 2, Art Style, E1 |
| N-body Cosmological Sim | 🔴 High | Epoch 0, A-3 |
| Geological Simulation (tectonics, volcanism) | 🟡 High | Epoch 1 |
| Organism Evolution Engine (traits, morphology) | 🔴 Critical | Epochs 2-5, Pillar 1 |
| Intelligence / Cultural Transmission | 🟡 High | Epochs 5-6 |
| Settlement / Civilization Pipeline | 🟡 High | Epochs 7-9 |
| Great Filter System (8 filters) | 🟡 High | Epochs 7-10 |
| Orbital Mechanics Engine | 🟡 High | Epochs 10-11 |
| Time Scale Manager | 🟢 Medium | E10 |
| Observation Tool Suite (10 tools) | 🟢 Medium | E9 |
| State Management / Save-Load | 🟢 Medium | Tech Specs |
| Procedural Generation | 🔴 Critical | Art Style, Pillar 5 |

### Technical Requirements

- **Rendering:** 60 FPS during continuous zoom, <16ms per frame
- **Simulation:** <100ms per tick at 10,000 organisms, decoupled from render
- **Memory:** <500 MB browser footprint
- **Load time:** <2 seconds
- **Storage:** IndexedDB for save/load
- **Dependencies:** ZERO — no libraries, no CDN, no npm, no build tools
- **Networking:** None (single-player)

### Complexity Drivers

**Critical:**
1. Multi-scale rendering (microbe → galaxy, seamless zoom, pixel art at all levels)
2. Continuous morphological evolution (procedural sprite generation from trait state)
3. 12-epoch simulation engine with epoch-agnostic core + epoch-specific modules

**Novel (no standard patterns):**
1. Adaptive time scaling (12+ orders of magnitude)
2. Emergent epoch transitions (no hard boundaries)
3. Great Filter emergence from simulation dynamics
4. Fully simulated cosmological initial conditions

### Technical Risks

| ID | Risk | Mitigation |
|----|------|-----------|
| A-1 | Canvas 2D insufficient for 60 FPS planet rendering | WebGPU primary (still no-library — navigator.gpu is a browser built-in) |
| A-3 | N-body gravity too expensive for 10k particles in JS | WASM compute (Rust via wasm-pack, base64-sidecar pattern, no CDN) |
| A-5 | Single-threaded bottleneck (sim + render) | WASM Web Worker (blob URL init for file:// compat) |
| R-2 | Memory pressure from 10k+ agents + lineage history | Object pooling, typed arrays, selective history pruning |
| R-3 | 12 epoch models in one codebase = spaghetti | Strict module boundaries, epoch registry pattern |

---

## Engine & Framework

### Selected "Engine"

**Vanilla Browser** — HTML + CSS + JavaScript. No game engine, no libraries, no CDN, no npm, no build tools.

**Rationale:** Pillar 4 (Vanilla Browser Mastery). The zero-dependency constraint is a design identity. The game proves that browser technology can deliver experiences people associate with native engines. Additionally, static files must work on locked-down corporate machines with no admin install and no local server.

### Deployment Targets

| Target | Priority | Notes |
|--------|----------|-------|
| **Static files from folder** | 🔴 Primary | Must work via `file://` protocol in Chrome/Firefox/Safari. No server required. |
| **GitHub Pages** | 🟢 Secondary | Static hosting, HTTPS, works with ES modules |
| **Electron (Steam)** | 🔵 Future | Wrapper for distribution. Solve when we get there. |

### Browser APIs as Architecture

| Category | API | Role | Status |
|----------|-----|------|--------|
| Rendering | WebGPU (navigator.gpu) | Required GPU renderer, WGSL shaders | ✅ In use |
| Rendering | WebGL2 (raw) | Legacy migration debt only, not a fallback | 🚫 Retired |
| Compute | WASM (WebAssembly) | CPU-heavy sim: tectonics, rivers, erosion | ✅ Sidecar path |
| Threading | Web Worker (blob URL) | WASM compute off main thread | ✅ In use |
| Threading | OffscreenCanvas | Background terrain chunk generation | ⏳ Evaluate |
| Storage | IndexedDB | Save/load world state | ⏳ Planned |
| Audio | Web Audio API | Procedural soundscapes | 🔵 Deferred (Phase 5) |
| Loop | requestAnimationFrame | 60 FPS render loop | ✅ In use |
| Timing | performance.now() | High-res timestamps, tick decoupling | ✅ In use |
| Input | DOM Events | Mouse, keyboard, touch | ✅ In use |

### Constraint: `file://` Protocol Compatibility

The game must work when opened as a local file (double-click `index.html`). This creates specific constraints:

- **ES modules (`import`):** Blocked by CORS on `file://` in Chrome. Must use classic `<script>` tags or an import-map polyfill approach.
- **IndexedDB:** Works on `file://` in Chrome and Firefox. Safari may have restrictions.
- **Web Workers:** `new Worker('file.js')` works on `file://` in most browsers but may need blob URL fallback.
- **Fetch API:** Blocked on `file://`. Must load data inline or via script tags.

### Remaining Architectural Decisions

These must be made in Step 4:

1. Rendering pipeline architecture (WebGPU required, no runtime fallback)
2. Simulation loop (fixed timestep, decoupling strategy)
3. Data model (classes, typed arrays, ECS-like, struct-of-arrays)
4. Script loading (classic scripts order, concatenation, or import-map)
5. State management (centralized world object, events, observers)
6. Epoch plugin architecture (how to register/swap epoch-specific simulation modules)
7. Spatial indexing (grid hash, quadtree, chunk-based)
8. Memory management (pooling, typed arrays, GC avoidance)

---

## Architectural Decisions

### Decision Summary

| # | Category | Decision | Rationale |
|---|----------|----------|-----------|
| D1 | Rendering | WebGPU required + WASM compute | Planet rendering is a GPU workload. WebGPU is the native web GPU API; WASM handles CPU-bound serial work. Both are vanilla browser built-ins. WebGL2 is legacy migration debt only. |
| D2 | Sim Loop | Decoupled accumulator | Handles 12-order-of-magnitude time compression. Deterministic fixed dt. WASM worker owns sim tick; main thread owns render. |
| D3 | Data Model | Hybrid (classes + typed arrays) | Complex entities (settlements) use classes. Mass entities (organisms, particles) use typed arrays. |
| D4 | Script Loading | Classic `<script>` + `PS.*` namespace | Works on `file://`. No build tools. Namespace convention keeps growing codebase organized. |
| D5 | State | Centralized `PS.world` + event bus | Trivial save/load serialization. Event bus decouples UI from sim. Matches existing pattern. |
| D6 | Epochs | Hybrid registry + always-on layers | Epoch modules register behavior. Shared systems (geology, climate) persist across all epochs. |
| D7 | Spatial | Chunk-aligned index | Natural LOD alignment with rendering. N-body cosmological sim uses separate octree. |

### D1: Rendering Pipeline — WebGPU Primary + WASM Compute

**Approach:** WebGPU (`navigator.gpu`) for rendering and GPU compute. WASM
(Rust compiled via `wasm-pack`) for CPU-heavy serial simulation. WGSL compute
shaders replace WebGL2 ping-pong FBOs for simulation data passes.

Both WebGPU and WASM are **native browser APIs** — they satisfy the
zero-external-dependencies constraint. The wasm-pack build step is a
development tool (not a runtime dependency); the compiled binary is
base64-encoded to a `.wasm.js` sidecar and committed.

- WGSL vertex/fragment shaders for terrain, globe projection, entity sprites
- WebGPU compute shaders for heat diffusion, ocean LBM, moisture simulation
- WASM for tectonics, river networks, erosion (serial CPU algorithms)
- G-Buffer rendering: diffuse + normal attachments, full-screen compositor blit
- Texture atlas as `GPUTexture` arrays

**Unsupported browsers:** browsers without `navigator.gpu` receive a
WebGPU-required startup failure. Pixeldarium does not maintain a WebGL2 or
Canvas2D runtime fallback.

### D2: Simulation Loop — Decoupled Accumulator

**Pattern:**
```
function gameLoop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    
    accumulator += dt * PS.time.scale;
    
    while (accumulator >= SIM_TICK_MS) {
        PS.sim.tick(SIM_TICK_MS);
        accumulator -= SIM_TICK_MS;
        
        if (ticksThisFrame++ > MAX_TICKS_PER_FRAME) break;
    }
    
    const alpha = accumulator / SIM_TICK_MS;
    PS.render.frame(alpha); // interpolation factor
    
    requestAnimationFrame(gameLoop);
}
```

**Key parameters:**
- `SIM_TICK_MS`: Fixed simulation timestep (adjustable per epoch)
- `PS.time.scale`: Time compression multiplier (1x to 10,000x)
- `MAX_TICKS_PER_FRAME`: Cap to prevent freeze at extreme time compression
- `alpha`: Interpolation factor for smooth rendering between ticks

### D3: Data Model — Hybrid Tiers

**Tier 1: Typed Arrays (mass entities, >1000 instances)**
Used for: organisms, particles, microbes, food sources

```
PS.organisms = {
    count: 0,
    maxCount: 20000,
    x: new Float32Array(20000),
    y: new Float32Array(20000),
    energy: new Float32Array(20000),
    traitSpeed: new Float32Array(20000),
    traitSize: new Float32Array(20000),
    // ... 20+ trait arrays
    lineageId: new Uint32Array(20000),
    alive: new Uint8Array(20000),
};
```

**Tier 2: Class Instances (complex entities, <1000 instances)**
Used for: settlements, civilizations, tribes, tectonic plates, trade routes

```
class Settlement {
    constructor(x, y, founder) {
        this.id = PS.uid();
        this.x = x; this.y = y;
        this.population = 1;
        this.foodStock = 0;
        this.techLevel = 0;
        // ...
    }
    update(dt) { /* ... */ }
}
```

### D4: Script Loading — Namespace Convention

**Pattern:** All files register with `PS` (Pixeldarium) namespace.

```html
<!-- Core (load first) -->
<script src="js/core/namespace.js"></script>    <!-- PS = {} -->
<script src="js/core/config.js"></script>       <!-- PS.config -->
<script src="js/core/events.js"></script>       <!-- PS.events -->
<script src="js/core/math.js"></script>         <!-- PS.math -->

<!-- Systems -->
<script src="js/systems/world.js"></script>     <!-- PS.world -->
<script src="js/systems/time.js"></script>      <!-- PS.time -->
<script src="js/systems/spatial.js"></script>   <!-- PS.spatial -->

<!-- Rendering -->
<script src="js/render/gl.js"></script>         <!-- PS.gl -->
<script src="js/render/camera.js"></script>     <!-- PS.camera -->
<script src="js/render/terrain.js"></script>    <!-- PS.render.terrain -->

<!-- Epochs (load order doesn't matter - they register) -->
<script src="js/epochs/cosmological.js"></script>
<script src="js/epochs/primordial.js"></script>
<script src="js/epochs/microbial.js"></script>

<!-- Entry point (load last) -->
<script src="js/main.js"></script>              <!-- PS.init() -->
```

### D5: State Management — World + Event Bus

**`PS.world`:** Single object holding all simulation state. Serializable to JSON for save/load.

**`PS.events`:** Simple pub/sub event bus for decoupled communication.

```
PS.events.on('organism.born', (data) => { /* update UI */ });
PS.events.on('epoch.transition', (data) => { /* update overlays */ });
PS.events.on('settlement.founded', (data) => { /* notification */ });

// In simulation code:
PS.events.emit('organism.born', { id, x, y, traits });
```

### D6: Epoch Architecture — Registry + Layers

**Always-On Layers (shared systems):**
- Geological (tectonic drift, volcanism, erosion) — runs from Epoch 1 onward
- Atmospheric Chemistry (composition, greenhouse, ozone) — runs from Epoch 1 onward
- Climate (temperature, precipitation, ocean currents) — runs from Epoch 1 onward
- Food/Energy (photosynthesis, food chains, resource regeneration) — runs from Epoch 2 onward

**Epoch Modules (registered behavior):**

```
PS.epochs.register('primordial', {
    init() { /* setup geological sim */ },
    update(dt) { /* tick geological + chemical sim */ },
    render(ctx) { /* draw terrain changes */ },
    detect() { /* check if abiogenesis threshold met */ },
    cleanup() { /* transition resources */ }
});
```

**Transition:** When `detect()` returns true for the NEXT epoch, the next epoch's `init()` is called and its `update()` starts running alongside existing layers. Previous epoch's module may continue (geology keeps running) or wind down (cosmological formation stops after planets form).

### D7: Spatial Indexing — Chunk-Aligned

**Grid structure:** World divided into chunks matching the render tile grid. Each chunk maintains:
- List of organism indices in this chunk
- Entity count for fast density queries
- Dirty flag for spatial re-indexing

**Query pattern:**
```
PS.spatial.getNearby(x, y, radius) → [entityIndices]
PS.spatial.getChunk(x, y) → chunkData
PS.spatial.getChunkEntities(chunkX, chunkY) → [entityIndices]
```

**Special case:** N-body cosmological sim (Epoch 0) uses its own octree spatial structure, not the chunk grid.

---

## Cross-cutting Concerns

These patterns apply to ALL systems and must be followed by every implementation.

### Error Handling

**Strategy:** Fail loud, fail fast. No silent failures.

Every error is a bug that must be fixed. The simulation should hard-crash and display clear error information rather than silently degrading. This prevents bad design and bugs from accumulating undetected.

**Rules:**
- `window.onerror` and `unhandledrejection` → halt sim, display error overlay with stack trace
- No try-catch wrapping in normal code paths — let errors propagate
- No "mark entity dead and continue" — if an entity update throws, the sim stops
- The developer (Aaron) decides when to add resilience — it is never the default
- Use `PS.assert(condition, message)` for invariant checks in development

### Logging

**Strategy:** Structured with categories. Filter by system AND level.

**API:**
```
PS.log(category, level, message)
```

### Configuration

**Strategy:** Centralized `PS.config` with nested structure.

### Event System

**Pattern:** `PS.events` — string-keyed pub/sub with sync dispatch.

### Debug Tools

All debug tools built-in. All available during development.

### WebGPU Device Loss Recovery

**Problem:** Browsers can reclaim the GPU device at any time (tab
backgrounding, memory pressure, driver crash). All WebGPU state (GPUBuffer,
GPUTexture, GPUShaderModule, GPURenderPipeline) is invalidated.

**Pattern:** `device.lost` is a Promise (not a DOM event like WebGL2). Wire
it immediately after `requestDevice()`. On resolution, request a fresh adapter
and device, then rebuild all GPU objects.

```javascript
PS.gpu.init = async function(canvas) {
    var adapter = await navigator.gpu.requestAdapter();
    PS.gpu.device = await adapter.requestDevice();

    PS.gpu.device.lost.then(function(info) {
        PS.gpu.state.isDeviceLost = true;
        PS.gpu.state.deviceLossCount++;
        PS.events.emit(PS.events.types.RENDER_GL_CONTEXT_LOST);
        setTimeout(function() { PS.gpu.recover(); }, 1000);
    });
};

PS.gpu.recover = async function() {
    await PS.gpu.init(PS.gpu.state.canvas); // new adapter + device
    PS.render.rebuildShaders();
    PS.render.rebuildTextures();
    PS.gpu.state.isDeviceLost = false;
    PS.events.emit(PS.events.types.RENDER_GL_CONTEXT_RESTORED);
};
```

**Rule:** Every render subsystem must implement `rebuildShaders()` and
`rebuildTextures()`/`rebuildBuffers()`. GPU resources (pipelines, textures,
buffers, bind groups) are NEVER assumed to persist after a device loss.

---

## Project Structure

### Organization Pattern

**Pattern:** Domain-driven, organized by game systems.

### Directory Structure

```
Pixeldarium/
├── index.html                          # Entry point, <script> load order
├── style.css                           # All styles
├── js/
│   ├── core/                           # Foundation (load first)
│   ├── render/                         # WebGPU rendering
│   ├── systems/                        # Core simulation infrastructure
│   ├── sim/                            # Simulation modules
│   ├── layers/                         # Always-on shared simulation layers
│   ├── epochs/                         # Epoch-specific modules
│   ├── ui/                             # User interface
│   ├── debug/                          # Debug tools
│   └── main.js                         # PS.init() entry point
```

### Architectural Boundaries

1. **Render never reads sim directly.** Render uses interpolated state provided by the game loop.
2. **Sim never calls render.** Sim emits events; render subscribes.
3. **Epochs never import other epochs.** Each epoch module is self-contained.
4. **Layers are independent.** Layers communicate via `PS.world` state, not direct calls.
5. **UI never modifies `PS.world`.** UI reads state and sends commands via `PS.events`.
6. **Debug tools are optional.** Removing the `js/debug/` directory should not break the game.

---

**Pattern:** handle WebGPU `device.lost`. Pause simulation, terminate streaming
workers that own GPU-bound transfer buffers, clear transient renderer resources,
and either surface a permanent WebGPU-required failure or recreate WebGPU
resources on the supported recovery path.

**Rule:** Every render subsystem must implement `rebuildShaders()` and
`rebuildTextures()`/`rebuildBuffers()`. GPU resources are NEVER assumed to
persist after device loss.

---

## Architecture Validation

### Validation Summary

| Check | Result | Notes |
|-------|--------|-------|
| Decision Compatibility | ✅ PASS | D1-D7 internally consistent, no conflicts |
| GDD Coverage | ✅ PASS | 12/12 systems covered |
| Pattern Completeness | ✅ PASS | 8/8 patterns defined with code examples |
| Epic Mapping | ✅ PASS | 13/13 epics mapped to architecture locations |
| Document Completeness | ✅ PASS | No placeholders, all sections populated |

### Coverage Report

**Systems Covered:** 12/12
**Patterns Defined:** 8 (3 novel + 5 standard)
**Decisions Made:** 7
**Consistency Rules:** 6
**Architectural Boundaries:** 6

### Issues Found and Resolved

1. **WebGPU device loss** — Added recovery pattern with `device.lost` and renderer resource rebuild contract

### Validation Date

2026-06-01
