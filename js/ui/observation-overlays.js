import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getTileManhattanDistance } from "../render/planet-grid.js";
import { foodWeb } from "../sim/food-web.js";
import { collectOrganismsInRadius } from "../sim/organisms-indexes.js";
import { ensureOrganismTraits } from "../sim/organisms-traits.js";
import { lineageTracking } from "../sim/lineage-tracking.js";
import { lenia } from "../sim/lenia.js";
import { massExtinction } from "../sim/mass-extinction.js";
import { terrainPressure } from "../sim/terrain-pressure.js";
import { world } from "../systems/state.js";
import { canvas, observationOverlayButtons, observationOverlayStatus } from "./dom-refs.js";
import { setElementText } from "./foundation.js";

PS.ui = PS.ui || {};
PS.render = PS.render || {};
PS.render.overlays = PS.render.overlays || {
  manifest: [
    {
      id: "observation.temperature",
      semantic: "Temperature",
      blendMode: "screen",
      alpha: 0.68,
      shortcut: "O"
    },
    {
      id: "observation.population",
      semantic: "Population",
      blendMode: "lighter",
      alpha: 0.82,
      shortcut: "O"
    },
    {
      id: "observation.resources",
      semantic: "Resources",
      blendMode: "lighter",
      alpha: 0.78,
      shortcut: "O"
    },
    {
      id: "observation.foodweb",
      semantic: "Food Web",
      blendMode: "screen",
      alpha: 0.74,
      shortcut: "O"
    },
    {
      id: "observation.selection",
      semantic: "Selection",
      blendMode: "screen",
      alpha: 0.72,
      shortcut: "O"
    },
    {
      id: "observation.extinction",
      semantic: "Extinction",
      blendMode: "screen",
      alpha: 0.76,
      shortcut: "O"
    },
    {
      id: "observation.atmosphere",
      semantic: "Atmosphere",
      blendMode: "screen",
      alpha: 0.58,
      shortcut: "O"
    },
    {
      id: "observation.microbial",
      semantic: "Microbes",
      blendMode: "lighter",
      alpha: 0.78,
      shortcut: "O"
    }
  ],
  getManifest: function () {
    return this.manifest.slice();
  },
  get: function (id) {
    var targetId = String(id || "none");

    for (var i = 0; i < this.manifest.length; i++) {
      if (this.manifest[i].id === targetId) {
        return this.manifest[i];
      }
    }

    return null;
  },
  drawOrbitalAssets: function () { return false; },
  drawPlanetaryBodies: function () { return false; },
  drawProbeMissions: function () { return false; },
  drawEmpireSectors: function () { return false; },
  drawInterstellarFleets: function () { return false; },
  drawEmpireLegacy: function () { return false; },
  drawStarSystems: function () { return false; },
  drawInspectSelection: function () { return false; },
  drawScanlines: function () { return false; }
};

PS.render.observationOverlays = PS.render.observationOverlays || {
  ids: [
    "observation.temperature",
    "observation.population",
    "observation.resources",
    "observation.foodweb",
    "observation.selection",
    "observation.extinction",
    "observation.atmosphere",
    "observation.microbial"
  ],
  getActiveId: function () {
    return world.activeObservationOverlay || "none";
  },
  setActive: function (id) {
    var nextId = String(id || "none");

    if (nextId !== "none" && this.ids.indexOf(nextId) < 0) {
      nextId = "none";
    }

    world.activeObservationOverlay = nextId;
    world.needsRender = true;
    return nextId;
  },
  cycle: function () {
    var options = ["none"].concat(this.ids);
    var currentIndex = options.indexOf(this.getActiveId());
    var nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % options.length;

    return this.setActive(options[nextIndex]);
  },
  getDensityAt: function (items, tileX, tileY, radius) {
    var count = 0;
    var safeRadius = Math.max(1, Math.round(Number(radius) || 1));

    if (!Array.isArray(items)) {
      return 0;
    }

    for (var i = 0; i < items.length; i++) {
      var item = items[i];

      if (
        Math.abs((Number(item.x) || 0) - tileX) <= safeRadius &&
        Math.abs((Number(item.y) || 0) - tileY) <= safeRadius
      ) {
        count++;
      }
    }

    return clamp(count / Math.max(1, safeRadius * safeRadius * 0.75), 0, 1);
  },
  getMicrobialCell: function (tileX, tileY) {
    if (PS.epochs && PS.epochs.microbial && typeof PS.epochs.microbial.getCellForTile === "function") {
      return PS.epochs.microbial.getCellForTile(tileX, tileY);
    }

    return null;
  },
  makeSample: function (red, green, blue, alpha) {
    return {
      red: clamp(Math.round(Number(red) || 0), 0, 255),
      green: clamp(Math.round(Number(green) || 0), 0, 255),
      blue: clamp(Math.round(Number(blue) || 0), 0, 255),
      alpha: clamp(Math.round(Number(alpha) || 0), 0, 255)
    };
  },
  /**
   * @description Converts a named observation overlay and tile state into an RGBA sample used for terrain diagnostics and visualization layers.
   * @param {string} id Overlay identifier, for example temperature, moisture, biomass, or civilization pressure.
   * @param {number} tileX World tile x coordinate.
   * @param {number} tileY World tile y coordinate.
   * @param {Object|null} tile Terrain tile data used by the selected overlay.
   * @returns {Object} RGBA sample with red, green, blue, and alpha channels.
   */
  getOverlaySample: function (id, tileX, tileY, tile) {
    var activeId = String(id || "none");
    var safeTile = tile || {};

    if (activeId === "observation.temperature") {
      var latitudeHeat = 1 - Math.abs(Number(safeTile.latitude) || 0) / 90;
      var elevationCool = clamp(Number(safeTile.elevation) || 0, 0, 1) * 0.35;
      var heat = clamp(latitudeHeat - elevationCool, 0, 1);
      return this.makeSample(80 + heat * 190, 80 + heat * 90, 255 - heat * 180, 42 + heat * 120);
    }

    if (activeId === "observation.population") {
      var population = this.getDensityAt(world.organisms, tileX, tileY, 2);
      return this.makeSample(255, 214, 88, population * 220);
    }

    if (activeId === "observation.resources") {
      var resources = this.getDensityAt(world.food, tileX, tileY, 2);
      return this.makeSample(86, 255, 118, resources * 220);
    }

    if (activeId === "observation.foodweb") {
      var nearby = typeof collectOrganismsInRadius === "function"
        ? collectOrganismsInRadius(tileX, tileY, 2, 0, 16)
        : [];
      var predators = 0;
      var prey = 0;

      for (var nearbyIndex = 0; nearbyIndex < nearby.length; nearbyIndex++) {
        var nearbyTraits = typeof ensureOrganismTraits === "function" ? ensureOrganismTraits(nearby[nearbyIndex]) : nearby[nearbyIndex].traits;
        var role = foodWeb && typeof foodWeb.getRole === "function"
          ? foodWeb.getRole(nearbyTraits)
          : (Number(nearbyTraits && nearbyTraits.carnivory) > CONFIG.PREDATION_CARNIVORY_THRESHOLD ? "predator" : "herbivore");

        if (role === "predator") {
          predators++;
        } else {
          prey++;
        }
      }

      var pressure = clamp(predators / Math.max(1, prey), 0, 1);
      return this.makeSample(255 * pressure, 210 - pressure * 90, 70 + prey * 8, Math.min(230, (predators + prey) * 34));
    }

    if (activeId === "observation.selection") {
      var sample = typeof terrainPressure.getSample === "function"
        ? terrainPressure.getSample(tileX, tileY)
        : null;
      var selection = sample ? clamp(Number(sample.pressure) || 0, 0, 1) : 0;
      var isolation = sample ? clamp(Number(sample.isolation) || 0, 0, 1) : 0;
      var innovation = sample ? clamp(Number(sample.innovationPressure) || 0, 0, 1) : 0;
      var lineage = lineageTracking && typeof lineageTracking.getHighlightAt === "function"
        ? lineageTracking.getHighlightAt(tileX, tileY)
        : 0;

      return this.makeSample(90 + selection * 120 + lineage * 45, 110 + innovation * 90 + lineage * 130, 210 - isolation * 80, 40 + Math.max(selection, isolation, lineage) * 185);
    }

    if (activeId === "observation.extinction") {
      var summary = massExtinction && typeof massExtinction.getSummary === "function"
        ? massExtinction.getSummary()
        : null;
      var latest = summary && (summary.activeEvent || summary.latest);
      var recovery = summary && summary.recoveryWindow;
      var eventLocation = latest && latest.location ? latest.location : null;
      var distance = eventLocation && Number.isFinite(Number(eventLocation.x)) && Number.isFinite(Number(eventLocation.y))
        ? getTileManhattanDistance(tileX, tileY, eventLocation.x, eventLocation.y)
        : Infinity;
      var radius = latest ? Math.max(5, Math.round((Number(latest.severityScore) || 0.3) * 24)) : 1;
      var devastation = Number.isFinite(distance) ? clamp(1 - distance / radius, 0, 1) : 0;
      var recoveryBloom = recovery
        ? clamp(1 - (Math.max(0, Number(recovery.endTick) || 0) - Math.max(0, Number(world.tick) || 0)) / Math.max(1, Number(recovery.durationTicks) || 1), 0, 1)
        : 0;

      return this.makeSample(220 + devastation * 35, 80 + recoveryBloom * 130, 70 + recoveryBloom * 120, Math.max(devastation * 230, recoveryBloom * 90));
    }

    if (activeId === "observation.atmosphere") {
      var gases = world.atmosphere && world.atmosphere.gases ? world.atmosphere.gases : {};
      var chemistry = world.geochemistry || {};
      var oxygen = Number.isFinite(Number(chemistry.oxygenPercent))
        ? clamp(Number(chemistry.oxygenPercent) / 35, 0, 1)
        : clamp(Number(gases.o2) || 0, 0, 1);
      var carbon = Number.isFinite(Number(chemistry.co2Ppm))
        ? clamp(Number(chemistry.co2Ppm) / 100000, 0, 1)
        : clamp(Number(gases.co2) || 0, 0, 1);
      var acid = Number.isFinite(Number(chemistry.oceanPh)) ? clamp((8.2 - Number(chemistry.oceanPh)) / 2, 0, 1) : 0;
      return this.makeSample(80 + oxygen * 120 + acid * 45, 150 + oxygen * 80 - acid * 55, 220 + carbon * 35, 70 + Math.max(oxygen, carbon, acid) * 120);
    }

    if (activeId === "observation.microbial") {
      if (lenia && lenia.state && typeof lenia.getCellDensity === "function") {
        var microbes = lenia.getCellDensity(tileX, tileY, "microbes");
        var vegetation = lenia.getCellDensity(tileX, tileY, "vegetation");
        var coral = lenia.getCellDensity(tileX, tileY, "coral");
        var lichen = lenia.getCellDensity(tileX, tileY, "lichen");
        var density = Math.max(microbes, vegetation, coral, lichen);
        return this.makeSample(82 + coral * 160 + lichen * 70, 120 + vegetation * 135 + microbes * 70, 128 + microbes * 110 + coral * 70, density * 230);
      }
      var cell = this.getMicrobialCell(tileX, tileY);
      var bloom = clamp(Number(cell && cell.bloomIntensity) || 0, 0, 1);
      var stress = clamp(Number(cell && cell.stress) || 0, 0, 1);
      return this.makeSample(80 + stress * 140, 255 - stress * 70, 146 + bloom * 80, bloom * 225);
    }

    return this.makeSample(0, 0, 0, 0);
  }
};

PS.ui.observationOverlays = {
  setup: function() {
    for (var i = 0; i < observationOverlayButtons.length; i++) {
      observationOverlayButtons[i].addEventListener("click", function(event) {
        PS.render.observationOverlays.setActive(
          event.currentTarget.getAttribute("data-observation-overlay")
        );
        PS.ui.observationOverlays.sync();
      });
    }

    this.sync();
  },
  sync: function() {
    var activeId = PS.render.observationOverlays.getActiveId();
    var activeOverlay = PS.render.overlays && typeof PS.render.overlays.get === "function"
      ? PS.render.overlays.get(activeId)
      : null;
    var stats = world.overlayPerformance || {};
    var label = activeOverlay ? activeOverlay.semantic : "None";
    var detail = activeOverlay
      ? " / " + (stats.compositor || "canvas") +
        " / " + (stats.blendMode || activeOverlay.blendMode || "source-over") +
        " / " + (Number(stats.lastFrameMs) || 0).toFixed(2) + "ms" +
        " / " + Math.max(0, Number(stats.lastSampleCount) || 0) + " samples"
      : "";

    for (var i = 0; i < observationOverlayButtons.length; i++) {
      var button = observationOverlayButtons[i];
      var isActive = button.getAttribute("data-observation-overlay") === activeId;

      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.className = isActive ? "active" : "";
    }

    setElementText(observationOverlayStatus, "OVERLAY: " + label + detail);
  },
  cycle: function() {
    var activeId = PS.render.observationOverlays.cycle();

    this.sync();
    return activeId;
  }
};
