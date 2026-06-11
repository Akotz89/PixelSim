"use strict";
var PS = window.PS || {};

PS.meta = PS.meta || {};
PS.meta.name = "Pixeldarium";
PS.meta.version = PS.meta.version || "0.1.0";

window.PS = PS;

PS.core = PS.core || {};
PS.core.bootstrapScript = "js/core/namespace.js";
PS.core.manifestSource = "index.html";
PS.core.manifest = [
  "config.js",
  "js/core/config.js",
  "js/core/event-types.js",
  "js/core/events.js",
  "js/core/math.js",
  "js/core/prng.js",
  "js/core/noise.js",
  "js/core/assert.js",
  "js/core/log.js",
  "js/core/audio.js",
  "js/core/input.js",
  "js/core/tile-registry.js",
  "js/core/entity-registry.js",
  "js/core/animation.js",
  "js/assets/registry.js",
  "js/assets/loader.js",
  "js/core/data-loader.js",
  "js/assets/sprite-sheet.js",
  "js/assets/equivalence.js",
  "js/ui/dom-refs.js",
  "js/systems/state.js",
  "js/systems/world.js",
  "js/core/utils.js",
  "js/core/trait-schema.js",
  "js/core/world-grid.js",
  "js/core/bitsmap.js",
  "js/core/planet-metrics.js",
  "js/systems/spatial.js",
  "js/systems/pool-manager.js",
  "js/systems/pools.js",
  "js/systems/tile-grid.js",
  "js/systems/persistence-db.js",
  "js/systems/persistence-config.js",
  "js/systems/save-migration.js",
  "js/systems/persistence-save-data.js",
  "js/systems/persistence-restore-core.js",
  "js/systems/persistence-restore-entities.js",
  "js/systems/persistence-io.js",
  "js/systems/persistence.js",
  "js/systems/time.js",
  "js/systems/deep-time.js",
  "js/render/ranmap.js",
  "js/render/tile-iterator.js",
  "js/render/particles.js",
  "js/render/entity-atlas.js",
  "js/render/entity-atlas-organisms.js",
  "js/render/entity-atlas-intents.js",
  "js/render/entity-atlas-civilization.js",
  "js/render/entity-atlas-events.js",
  "js/render/terrain-atlas-civilization.js",
  "js/render/terrain-atlas-detail.js",
  "js/render/camera-unified.js",
  "js/render/globe.js",
  "js/render/planet-view.js",
  "js/render/planet-surface.js",
  "js/render/planet-grid.js",
  "js/render/terrain-hydrology.js",
  "js/render/terrain-seeding.js",
  "js/render/pipeline-compat.js",
  "js/render/renderer.js",
  "js/render/gpu.js",
  "js/render/wgsl-shader-manager.js",
  "js/render/webgpu-targets.js",
  "js/render/webgpu-gbuffer.js",
  "js/render/webgpu-compositor.js",
  "js/render/webgpu-point-lights.js",
  "js/render/webgpu-water-displacement.js",
  "js/render/webgpu-entity.js",
  "js/render/webgpu-globe.js",
  "js/render/webgpu-surface-underlay.js",
  "js/render/water-rendering.js",
  "js/render/surface-tile-batcher.js",
  "js/render/webgpu-surface-tile.js",
  "js/render/webgpu-renderer.js",
  "js/sim/compute-harness.js",
  "js/sim/heat-diffusion.js",
  "js/render/surface-worker-client.js",
  "js/render/surface-ecology.js",
  "js/render/surface-ready-feather.js",
  "js/render/draw-order.js",
  "js/render/camera.js",
  "js/render/lod.js",
  "js/render/projection.js",
  "js/render/surface-address.js",
  "js/render/surface-cache.js",
  "js/render/surface-features.js",
  "js/render/surface-feature-query.js",
  "js/render/surface-noise.js",
  "js/render/surface-geometry.js",
  "js/render/surface-streaming.js",
  "js/render/surface-render-cache.js",
  "js/render/terrain.js",
  "js/render/surface-landform.js",
  "js/render/surface-imagery.js",
  "js/render/surface-color.js",
  "js/render/surface-texture.js",
  "js/render/surface-patterns.js",
  "js/render/surface-strata.js",
  "js/render/surface-natural.js",
  "js/render/surface-hydrology.js",
  "js/render/surface-transitions.js",
  "js/render/terrain-transitions.js",
  "js/render/surface-material.js",
  "js/render/surface-relief.js",
  "js/render/entities.js",
  "js/render/vegetation-render.js",
  "js/render/environment-overlays.js",
  "js/render/pipeline.js",
  "js/sim/food-runtime.js",
  "js/sim/vegetation.js",
  "js/sim/tile-worker.js",
  "js/sim/food-growth.js",
  "js/sim/food.js",
  "js/sim/modifiers.js",
  "js/sim/trait-registry.js",
  "js/sim/organisms-traits.js",
  "js/sim/organisms-indexes.js",
  "js/sim/terrain-pressure.js",
  "js/sim/speciation.js",
  "js/sim/food-web.js",
  "js/sim/mass-extinction.js",
  "js/sim/organisms-behavior.js",
  "js/sim/evolution.js",
  "js/sim/organisms.js",
  "js/sim/representatives.js",
  "js/sim/lineage-tracking.js",
  "js/sim/settlements-state.js",
  "js/sim/settlements-growth.js",
  "js/sim/civilizations-orbital.js",
  "js/sim/civilizations-probes.js",
  "js/sim/civilizations-stars.js",
  "js/sim/civilizations-empire.js",
  "js/sim/settlements-founding.js",
  "js/sim/settlements-routes.js",
  "js/sim/settlements-runtime.js",
  "js/sim/settlements.js",
  "js/sim/civilizations.js",
  "js/core/world-gen.js",
  "js/epochs/registry.js",
  "js/epochs/primordial.js",
  "js/epochs/microbial.js",
  "js/layers/registry.js",
  "js/layers/geology.js",
  "js/layers/atmosphere.js",
  "js/ui/foundation.js",
  "js/ui/component.js",
  "js/ui/panel-manager.js",
  "js/ui/tooltip.js",
  "js/ui/modal.js",
  "js/ui/statistics-dashboard.js",
  "js/ui/summary.js",
  "js/ui/history-summary.js",
  "js/ui/inspect-history.js",
  "js/ui/inspect.js",
  "js/ui/camera-input.js",
  "js/ui/persistence-controls.js",
  "js/ui/interaction.js",
  "js/ui/touch.js",
  "js/ui/spotlight.js",
  "js/ui/observation-overlays.js",
  "js/ui/timeline.js",
  "js/ui/bookmarks.js",
  "js/ui/setup.js",
  "js/ui/hud.js",
  "js/ui/panels.js",
  "js/ui/controls.js",
  "js/ui/notifications.js",
  "js/debug/performance.js",
  "js/debug/console.js",
  "js/debug/profiler.js",
  "js/debug/overlays.js",
  "js/debug/inspector.js",
  "js/main-runtime.js",
  "js/main-ecosystem-stability.js",
  "js/main-ecosystem-summary.js",
  "js/main-simulation.js",
  "js/main-loop.js",
  "js/main.js"
];

PS.runtime = PS.runtime || {};
PS.runtime.errors = PS.runtime.errors || [];
PS.runtime.requiredFunctions = PS.runtime.requiredFunctions || [
  "startGame",
  "drawWorld",
  "PS.gpu.initialize",
  "PS.sim.organisms.make",
  "PS.sim.settlements.update",
  "PS.sim.evolution.inheritTraits",
  "PS.render.terrain.draw",
  "PS.render.pipeline.drawWorld",
  "PS.render.renderer.getActive",
  "PS.camera.getZoomLevel",
  "PS.persistence.save",
  "PS.time.runFrame",
  "PS.events.detectMilestones"
];

PS.runtime.resolvePath = function (pathName) {
  var parts = String(pathName || "").split(".");
  var cursor = parts[0] === "PS" ? PS : window[parts[0]];

  for (var i = 1; i < parts.length; i++) {
    if (!cursor) {
      return undefined;
    }

    cursor = cursor[parts[i]];
  }

  return cursor;
};

PS.runtime.verify = function (requiredFunctions) {
  var required = Array.isArray(requiredFunctions) ? requiredFunctions : PS.runtime.requiredFunctions;
  var missing = [];

  for (var i = 0; i < required.length; i++) {
    if (typeof PS.runtime.resolvePath(required[i]) !== "function") {
      missing.push(required[i]);
    }
  }

  var result = {
    ok: missing.length === 0,
    missing: missing
  };

  PS.runtime.lastVerification = result;

  if (!result.ok) {
    var message = "Missing runtime functions: " + missing.join(", ");

    if (PS.log && typeof PS.log === "function") {
      PS.log("runtime", "WARN", message, { missing: missing });
    }

    if (typeof PS.runtime.recordError === "function") {
      PS.runtime.recordError("runtime.verify.missing", {
        message: message,
        missing: missing
      });
    }
  }

  return result;
};

PS.runtime.recordError = function (kind, payload) {
  var entry = {
    kind: kind,
    payload: payload,
    time: new Date().toISOString()
  };

  PS.runtime.errors.push(entry);

  if (PS.runtime.errors.length > 50) {
    PS.runtime.errors.shift();
  }

  if (typeof showDebugMessage === "function") {
    showDebugMessage(kind + ": " + String(payload && payload.message ? payload.message : payload));
  }

  return entry;
};

window.addEventListener("error", function (event) {
  if (event.target && event.target !== window && event.target.src) {
    PS.runtime.recordError("load.error", {
      message: "Could not load " + event.target.src,
      source: event.target.src
    });
    return;
  }

  PS.runtime.recordError("runtime.error", {
    message: event.message,
    file: event.filename,
    line: event.lineno,
    column: event.colno
  });
}, true);

window.addEventListener("unhandledrejection", function (event) {
  PS.runtime.recordError("promise.error", {
    message: event.reason && event.reason.message ? event.reason.message : String(event.reason),
    reason: event.reason
  });
});
