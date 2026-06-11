# Proof Scene Acceptance

Linear scope: AZR-1037, AZR-1038.

Pixeldarium gameplay, simulation, entity, VFX, camera, overlay, and interaction
issues must define a short proof scene whenever user-visible behavior changes.
The proof scene is the local acceptance contract for what a reviewer should see
in roughly 5-15 seconds.

YouTube clips, Chroma rows, Hindsight facts, and research notes can justify why
a proof scene is valuable. They do not prove local Pixeldarium completion.

## Required Proof Scene Fields

Every visible-behavior issue must state:

- Affected zoom band.
- Initial state.
- Trigger.
- Visible tell.
- Behavior.
- Consequence.
- Termination condition.
- Pass/fail observation.
- Evidence artifact.
- Verification command.

If a field is not applicable, the issue must say why.

## Actor-Scale Readability Gate

Organism, hazard, faction, resource, settlement, citizen, and entity-facing work
must also state:

- Actor type.
- Primary verb.
- Visible tell.
- Simulation consequence.
- Mitigation, adaptation, or counterplay.
- Affected zoom bands.
- Proof scene.
- Verification command.

The watcher should be able to infer the actor's action or state at gameplay
zoom without relying on debug text.

## VFX State-Communication Gate

VFX-facing work must state:

- Simulation state being communicated.
- Effect layer.
- Actor-scale readability test.
- Dense-prop or overlap stress case.
- Hazard, resource, or traversable-edge readability.
- Pass/fail observation.

VFX categories covered by this gate include water, fog/weather, glow/light,
fire, poison, decay, particles, and future magic or technology fields.

Decorative polish can be accepted only as decorative polish. Effects that claim
to communicate simulation state must prove the communicated state.

## Example: Simulation/Organism Proof Scene

```text
Proof scene:
- Affected zoom band: Local, 15-18.999.
- Initial state: Seeded pond-edge tile with two organisms, one food source, and one predator representative visible.
- Trigger: Advance the simulation until the predator detects prey within the local representative radius.
- Visible tell: Predator changes facing/heading and shows a pursuit cue before contact.
- Behavior: Predator moves toward prey without teleporting or clipping through blocked terrain.
- Consequence: Prey population or representative state changes after contact; food-web event is emitted or visible.
- Termination condition: Contact resolves, predator cooldown starts, or prey escapes beyond detection radius.
- Pass/fail observation: Reviewer can identify detect, pursue, resolve, and cooldown/escape from local view.
- Evidence artifact: Local screenshot/clip or deterministic visual test artifact.
- Verification command: `node tests/predation.test.js` plus the issue-specific visual proof command.
```

## Example: Terrain/VFX Proof Scene

```text
Proof scene:
- Affected zoom band: Region and Local.
- Initial state: Seeded shoreline with water, traversable land edge, vegetation scatter, and representative organisms.
- Trigger: Enable the water/material VFX layer and advance enough frames for animation cadence.
- Visible tell: Water displacement marks water cells while shoreline and traversable edge remain readable.
- Behavior: VFX animates without hiding organisms, resources, or selection/inspection overlays.
- Consequence: Watcher can distinguish water, land, hazard/resource edge, and actor path context.
- Termination condition: Capture after stable animation loop or defined frame count.
- Pass/fail observation: Dense-prop overlap does not collapse into unreadable noise at gameplay zoom.
- Evidence artifact: Local screenshot/clip or automated pixel-sample report.
- Verification command: `node tests/webgpu-water-displacement.test.js` and `node tests/particles.test.js` when touched.
```

## Acceptance Boundary

Documentation-only and purely internal refactor issues do not need proof clips
unless they change user-visible behavior. Runtime-visible work does.

Accepted implementation requires local proof from this repo: tests, browser
smoke, screenshots, clips, pixel samples, or equivalent artifacts named in the
issue. Source evidence alone is never enough.
