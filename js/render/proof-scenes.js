import { PS } from "../core/namespace.js";
import { world } from "../systems/state.js";

PS.render = PS.render || {};
PS.render.proofScenes = PS.render.proofScenes || {};

PS.render.proofScenes.manifest = {
  schemaVersion: 1,
  issue: "AZR-1074",
  contract: "dense-simulation-readability-proof-scenes",
  runtimeBoundary: "Runtime-owned proof scene metadata only; no Agent Studio scripts, raw candidates, provider configs, or tooling are loaded.",
  rendererContractVersion: 1,
  scenes: [
    {
      id: "globe-continent-causal-context",
      title: "Globe and continent causal context",
      scale: "globe-continent",
      zoomBand: "continent",
      camera: {
        zoomLevel: 2,
        latitude: 12.5,
        longitude: -41.25
      },
      visibleSimulationState: [
        "terrain",
        "ocean",
        "coast",
        "biome",
        "atmosphere",
        "elevation",
        "eventMarkers"
      ],
      watcherInterpretation: "Watcher can read land/ocean, coasts, broad biome, and event context before local detail streams in.",
      activeRenderLayers: [
        "terrain.base",
        "space.event-markers",
        "overlays.reference",
        "ui.minimap"
      ],
      requiredCausalFields: [
        "terrain",
        "ocean",
        "coast",
        "biome",
        "atmosphere",
        "elevation"
      ],
      expectedSemanticColors: [
        "water",
        "coast",
        "forest",
        "desert",
        "ice",
        "event"
      ],
      passFailCriteria: [
        "Frame is nonblank and reports continent zoom band metadata.",
        "Parent globe/underlay remains visible when local tiles are not dominant.",
        "No debug label is required to identify ocean, coast, landmass, and event context."
      ],
      evidenceArtifact: "docs/visual-regression/azr-365-continent.png",
      verificationCommands: [
        "node tests/lod-layer-alpha.test.js",
        "node tests/render-layer-order.test.js",
        "node tests/visual/screenshot.test.js"
      ],
      acceptedAssets: [
        {
          id: "runtime-generated-terrain",
          provenance: "deterministic runtime simulation fields",
          runtimeUse: true
        }
      ]
    },
    {
      id: "dense-local-settlement-readability",
      title: "Dense local settlement readability",
      scale: "local-settlement",
      zoomBand: "settlement",
      camera: {
        zoomLevel: 7,
        latitude: 12.5,
        longitude: -41.25
      },
      visibleSimulationState: [
        "terrainMaterials",
        "buildings",
        "citizens",
        "stockpiles",
        "workStatus",
        "vegetation",
        "shadows",
        "particles",
        "lights",
        "worldUi"
      ],
      watcherInterpretation: "Watcher can identify terrain, paths/boundaries, buildings, stored resources, work/status marks, actors, shadows, particles, and lighting as one readable scene.",
      activeRenderLayers: [
        "terrain.base",
        "vegetation.grass",
        "water.displacement",
        "settlement.shadows",
        "resources.food",
        "settlement.readiness",
        "entities.organisms",
        "vegetation.world",
        "settlement.influence",
        "settlement.routes",
        "settlement.structures",
        "weather.particles",
        "settlement.worldUi"
      ],
      requiredCausalFields: [
        "terrainMaterials",
        "buildings",
        "citizens",
        "stockpiles",
        "workStatus",
        "vegetation",
        "shadows",
        "particles",
        "lights",
        "worldUi"
      ],
      expectedSemanticColors: [
        "terrain",
        "road",
        "water",
        "vegetation",
        "building",
        "citizen",
        "resource",
        "status",
        "shadow",
        "light"
      ],
      passFailCriteria: [
        "Frame is nonblank and reports settlement zoom band metadata.",
        "Accepted equivalence terrain, structures, resources, citizens, work status, effects, and vegetation are selected or explicitly fall back to deterministic runtime placeholders.",
        "Dense props do not hide terrain boundaries, route context, or actor/status readability."
      ],
      evidenceArtifact: "docs/visual-regression/azr-803/settlement-ground-desktop.metrics.json",
      verificationCommands: [
        "node tests/equivalence-assets.test.js",
        "node tests/webgpu-entity.test.js",
        "node tests/webgpu-point-lights.test.js",
        "node tests/visual/screenshot.test.js"
      ],
      acceptedAssets: [
        {
          id: "equivalence_terrain_materials_v0",
          provenance: "accepted runtime asset manifest",
          runtimeUse: true
        },
        {
          id: "equivalence_settlement_structures_v0",
          provenance: "accepted runtime asset manifest",
          runtimeUse: true
        },
        {
          id: "equivalence_resource_stockpiles_v0",
          provenance: "accepted runtime asset manifest",
          runtimeUse: true
        },
        {
          id: "equivalence_creature_npc_refined_v1",
          provenance: "accepted runtime asset manifest",
          runtimeUse: true
        },
        {
          id: "equivalence_work_status_overlays_v0",
          provenance: "accepted runtime asset manifest",
          runtimeUse: true
        },
        {
          id: "equivalence_material_effect_overlays_v0",
          provenance: "accepted runtime asset manifest",
          runtimeUse: true
        },
        {
          id: "equivalence_vegetation_scatter_v0",
          provenance: "accepted runtime asset manifest",
          runtimeUse: true
        }
      ]
    },
    {
      id: "actor-effect-readability",
      title: "Actor and effect readability",
      scale: "inspect-local",
      zoomBand: "local",
      camera: {
        zoomLevel: 6,
        latitude: 12.5,
        longitude: -41.25
      },
      visibleSimulationState: [
        "terrainMaterials",
        "ecologyMicrostructure",
        "organisms",
        "food",
        "hazards",
        "settlements",
        "routes",
        "intent",
        "particles"
      ],
      watcherInterpretation: "Watcher can identify organism/representative state, nearby food/resource signal, path or boundary context, and effect/status cue without opening debug overlays.",
      activeRenderLayers: [
        "terrain.base",
        "vegetation.grass",
        "resources.food",
        "entities.organisms",
        "settlement.routes",
        "weather.particles",
        "status.selection"
      ],
      requiredCausalFields: [
        "terrainMaterials",
        "organisms",
        "food",
        "hazards",
        "routes",
        "intent"
      ],
      expectedSemanticColors: [
        "terrain",
        "vegetation",
        "food",
        "organism",
        "intent",
        "effect",
        "selection"
      ],
      passFailCriteria: [
        "Frame is nonblank and reports local zoom band metadata.",
        "Actor, food/resource, route/boundary, and status/effect cue are distinguishable without debug text.",
        "Particles and overlays do not erase the actor or terrain edge context."
      ],
      evidenceArtifact: "docs/visual-regression/azr-365-intent-local.png",
      verificationCommands: [
        "node tests/equivalence-assets.test.js",
        "node tests/webgpu-entity.test.js",
        "node tests/particles.test.js",
        "node tests/visual/screenshot.test.js"
      ],
      acceptedAssets: [
        {
          id: "equivalence_creature_npc_refined_v1",
          provenance: "accepted runtime asset manifest",
          runtimeUse: true
        },
        {
          id: "equivalence_resource_stockpiles_v0",
          provenance: "accepted runtime asset manifest",
          runtimeUse: true
        },
        {
          id: "equivalence_material_effect_overlays_v0",
          provenance: "accepted runtime asset manifest",
          runtimeUse: true
        },
        {
          id: "runtime-generated-status-overlay",
          provenance: "deterministic runtime simulation fields",
          runtimeUse: true
        }
      ]
    }
  ]
};

PS.render.proofScenes.getManifest = function () {
  return PS.render.proofScenes.manifest;
};

PS.render.proofScenes.getAll = function () {
  return PS.render.proofScenes.manifest.scenes.slice();
};

PS.render.proofScenes.getById = function (id) {
  var scenes = PS.render.proofScenes.manifest.scenes;

  for (var i = 0; i < scenes.length; i += 1) {
    if (scenes[i].id === id) {
      return scenes[i];
    }
  }

  return null;
};

PS.render.proofScenes.getCaptureTargets = function () {
  return PS.render.proofScenes.manifest.scenes.map(function (scene) {
    return {
      id: scene.id,
      zoomLevel: scene.camera.zoomLevel,
      latitude: scene.camera.latitude,
      longitude: scene.camera.longitude,
      expectedBand: scene.zoomBand,
      semanticColors: scene.expectedSemanticColors.slice(),
      activeRenderLayers: scene.activeRenderLayers.slice(),
      verificationCommands: scene.verificationCommands.slice()
    };
  });
};
