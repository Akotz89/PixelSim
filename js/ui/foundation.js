import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp, normalizeSeedText } from "../core/utils.js";
import { getWrappedWorldX } from "../render/planet-grid.js";
import { getPlanetSurfaceChunkLineage } from "../render/planet-surface.js";
import { getPlanetCameraScaleInfo, getPlanetDistanceLabel, getPlanetLocalSurfaceAddress, getPlanetScaleLabel, getPlanetSurfaceCacheStats } from "../render/planet-view.js";
import { drawWorld } from "../render/pipeline.js";
import { isFertile } from "../render/terrain-hydrology.js";
import { getNearestOrganismInRadius, getOrganismTravelKmPerTick } from "../sim/organisms-indexes.js";
import { getNearestInfluencingSettlement } from "../sim/settlements-founding.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";
import { controlsPanel, eraText, foodGrowthSlider, foodGrowthValue, foodSizeSlider, foodSizeValue, foodText, gameWrap, menuBackdrop, menuTabs, menuToggleButton, menuToggleText, organismSizeSlider, organismSizeValue, pauseButton, populationText, restartButton, seedInput, speedDownButton, speedLabel, speedSlider, speedUpButton, speedValue, startingFoodSlider, startingFoodValue, stepButton, timeScaleSlider, timeScaleValue, uiMenu } from "./dom-refs.js";
// fallow-ignore-next-line circular-dependency
import { updateSettlementSummary } from "./history-summary.js";
// fallow-ignore-next-line circular-dependency
import { updateEventLog, updateInspectPanel } from "./inspect-history.js";
// fallow-ignore-next-line circular-dependency
import { escapeSummaryText, updateEcosystemSummary, updateLineageSummary, updateSimulationAlerts, updateTraitSummary } from "./summary.js";

export function updateHud() {
  var fertilePercent = world.planetSummary
    ? Math.round(world.planetSummary.fertileLandPercent)
    : Math.round((world.fertileTiles / (WORLD_WIDTH * WORLD_HEIGHT)) * 100);
  var waterPercent = world.planetSummary
    ? Math.round(world.planetSummary.waterPercent)
    : 0;
  var estimatedIndividuals = world.organisms.length * Math.max(1, Math.round(Number(CONFIG.ORGANISM_POPULATION_UNIT) || 1));
  var lifecycleState = world.isExtinct ? "extinct" : (world.isPaused ? "paused" : "running");
  var planetScaleInfo = getPlanetCameraScaleInfo();
  var planetScaleBar = PS.camera && typeof PS.camera.getScaleBar === "function"
    ? PS.camera.getScaleBar(180)
    : { label: "-", pixelWidth: 0, metersPerCanvasPixel: planetScaleInfo.metersPerCanvasPixel };
  var planetCacheStats = getPlanetSurfaceCacheStats();
  var renderCacheStats = PS.render && PS.render.surfaceRender && typeof PS.render.surfaceRender.getCacheStats === "function"
    ? PS.render.surfaceRender.getCacheStats()
    : {
      chunks: 0,
      lastVisibleChunks: 0,
      lastPendingChunks: 0,
      lastGeneratedThisPass: 0,
      lastFallbackChunks: 0
    };
  var centerPyramidLineage = getPlanetSurfaceChunkLineage(
    getPlanetLocalSurfaceAddress(Math.floor(WORLD_WIDTH / 2), Math.floor(WORLD_HEIGHT / 2)).address
  );

  setElementClass(eraText, "hud-card hud-era");
  setElementHtml(eraText, makeHudPrimary("Era", world.era, lifecycleState));
  setElementClass(populationText, "hud-card hud-population");
  setElementHtml(
    populationText,
    makeHudPrimary("Population Bands", world.organisms.length, "~" + estimatedIndividuals.toLocaleString() + " individuals")
  );
  setElementClass(foodText, "hud-metrics");
  setElementHtml(foodText, [
    makeHudMetric("Tick", world.tick),
    makeHudMetric("Day", getSimulationDayLabel()),
    makeHudMetric("Food", world.food.length),
    makeHudMetric("Time Scale", PS.time ? PS.time.getTimeScaleLabel() : "-"),
    makeHudMetric("Compression", PS.time ? PS.time.getTimeCompressionLabel() : "-"),
    makeHudMetric("Water", waterPercent + "%"),
    makeHudMetric("Fertile Land", fertilePercent + "%"),
    makeHudScaleCue(planetScaleInfo, planetScaleBar),
    makeHudMetric("Zoom", getPlanetScaleLabel()),
    makeHudMetric("Cache LOD", planetScaleInfo.anchorName + " " + planetScaleInfo.anchorLevel),
    makeHudMetric("Ground Px", getPlanetDistanceLabel(planetScaleInfo.metersPerCanvasPixel) + "/px"),
    makeHudMetric("Footprint", getPlanetDistanceLabel(planetScaleInfo.footprintWidthKm * 1000) + " x " + getPlanetDistanceLabel(planetScaleInfo.footprintHeightKm * 1000)),
    makeHudMetric("Camera", "~" + getPlanetDistanceLabel(planetScaleInfo.approximateAltitudeKm * 1000)),
    makeHudMetric("Surface Cache", planetCacheStats.chunks + "c/" + planetCacheStats.samples + "s"),
    makeHudMetric("Render Chunks", renderCacheStats.lastVisibleChunks + "v/" + renderCacheStats.chunks + "c/" + renderCacheStats.lastPendingChunks + "p/" + renderCacheStats.lastGeneratedThisPass + "g/" + renderCacheStats.lastFallbackChunks + "f"),
    makeHudMetric("Pyramid", centerPyramidLineage.length + " parents"),
    makeHudMetric("Travel", Math.round(getOrganismTravelKmPerTick()) + " km/tick"),
    makeHudMetric("Render FPS", world.fps.toFixed(1)),
    makeHudMetric("Sim TPS", world.tps.toFixed(1)),
    makeHudMetric("Update", world.updateMs.toFixed(2) + "ms"),
    makeHudMetric("Draw", world.drawMs.toFixed(2) + "ms"),
    makeHudMetric("Max", world.maxUpdateMs.toFixed(2) + "/" + world.maxDrawMs.toFixed(2) + "ms")
  ].join(""));

  setElementHtml(speedLabel, makeTimeCompressionControl());
  syncTuningControls();
  syncControlStates();
  updateEcosystemSummary();
  updateSimulationAlerts();
  updateTraitSummary();
  updateLineageSummary();
  updateSettlementSummary();
  updateEventLog();

  if (window.PS && PS.ui && PS.ui.observationOverlays) {
    PS.ui.observationOverlays.sync();
  }

  if (window.PS && PS.ui && PS.ui.timeline) {
    PS.ui.timeline.sync();
  }

  updateInspectPanel();

  if (window.PS && PS.ui && PS.ui.hud) {
    PS.ui.hud.updateSeedDisplay();
  }

  if (window.PS && PS.debug) {
    if (PS.debug.performance) {
      PS.debug.performance.render();
    }

    if (PS.debug.profiler) {
      PS.debug.profiler.render();
    }

    if (PS.debug.overlays) {
      PS.debug.overlays.render();
    }
  }
}

export function getSimulationDay() {
  return Math.max(0, Math.round(Number(world.tick) || 0)) *
    Math.max(0, Number(CONFIG.SIM_DAYS_PER_TICK) || 0);
}

export function getSimulationDayLabel() {
  var day = getSimulationDay();
  var year = Math.floor(day / 365);
  var dayOfYear = Math.floor(day % 365);

  return "Y" + year + " D" + dayOfYear;
}

export function setElementText(element, text) {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

export function setElementHtml(element, html) {
  var range;

  if (element && typeof element.replaceChildren === "function" && typeof document !== "undefined" && typeof document.createRange === "function") {
    range = document.createRange();
    range.selectNodeContents(element);
    element.replaceChildren(range.createContextualFragment(html));
    return;
  }

  setElementText(element, html);
}

export function setElementClass(element, className) {
  if (element.className !== className) {
    element.className = className;
  }
}

export function setInputValue(input, value) {
  var stringValue = String(value);

  if (input.value !== stringValue) {
    input.value = stringValue;
  }
}

export function makeHudMetric(label, value) {
  return (
    "<span class=\"hud-metric\">" +
    "<b>" + escapeSummaryText(label) + "</b>" +
    "<span>" + escapeSummaryText(value) + "</span>" +
    "</span>"
  );
}

export function makeHudScaleCue(scaleInfo, scaleBar) {
  var safeInfo = scaleInfo || {};
  var safeBar = scaleBar || {};
  var pixelWidth = clamp(Math.round(Number(safeBar.pixelWidth) || 0), 48, 220);
  var scaleName = safeInfo.scaleName || safeInfo.surfaceLodName || "-";
  var groundPixel = getPlanetDistanceLabel(Number(safeInfo.metersPerCanvasPixel) || 0) + "/px";
  var label = safeBar.label || "-";

  return (
    "<span class=\"hud-scale-cue\" aria-label=\"Map scale\">" +
    "<b>" + escapeSummaryText(scaleName) + "</b>" +
    "<span class=\"hud-scale-bar\" aria-hidden=\"true\">" +
    "<i style=\"width:" + pixelWidth + "px\"></i>" +
    "</span>" +
    "<span class=\"hud-scale-meta\">" +
    "<strong>" + escapeSummaryText(label) + "</strong>" +
    "<em>" + escapeSummaryText(groundPixel) + "</em>" +
    "</span>" +
    "</span>"
  );
}

export function makeHudPrimary(label, value, detail) {
  return (
    "<span class=\"hud-primary-label\">" + escapeSummaryText(label) + "</span>" +
    "<strong>" + escapeSummaryText(value) + "</strong>" +
    "<small>" + escapeSummaryText(detail || "") + "</small>"
  );
}

export function makeTimeCompressionControl() {
  var compression = PS.time && typeof PS.time.getTimeCompressionLabel === "function"
    ? PS.time.getTimeCompressionLabel()
    : "-";
  var scale = PS.time && typeof PS.time.getTimeScaleLabel === "function"
    ? PS.time.getTimeScaleLabel()
    : "-";
  var state = world.isExtinct ? "extinct" : (world.isPaused ? "paused" : "running");

  return (
    "<b>" + escapeSummaryText("Speed " + world.speed + "x") + "</b>" +
    "<span>" + escapeSummaryText(compression) + "</span>" +
    "<small>" + escapeSummaryText(scale + " / " + state) + "</small>"
  );
}

export function getTuningInputNumber(input, fallbackValue) {
  if (!input) {
    return fallbackValue;
  }

  var value = Number(input.value);
  return Number.isFinite(value) ? value : fallbackValue;
}

export function syncTuningControls() {
  var growthPercent = Math.round(CONFIG.FERTILE_FOOD_GROWTH_CHANCE * 100);

  setInputValue(speedSlider, world.speed);
  setElementText(speedValue, world.speed + "x");
  if (PS.time) {
    setInputValue(timeScaleSlider, PS.time.timeScale.targetIndex);
    setElementText(timeScaleValue, PS.time.getTimeCompressionLabel());
  }
  setInputValue(organismSizeSlider, CONFIG.ORGANISM_DRAW_SIZE);
  setElementText(organismSizeValue, CONFIG.ORGANISM_DRAW_SIZE + "px");
  setInputValue(foodSizeSlider, CONFIG.FOOD_DRAW_SIZE);
  setElementText(foodSizeValue, CONFIG.FOOD_DRAW_SIZE + "px");
  setInputValue(startingFoodSlider, CONFIG.STARTING_FOOD);
  setElementText(startingFoodValue, String(CONFIG.STARTING_FOOD));
  setInputValue(foodGrowthSlider, growthPercent);
  setElementText(foodGrowthValue, growthPercent + "%");
  setInputValue(seedInput, world.seedText);
}

export function setButtonPressed(button, isPressed) {
  button.setAttribute("aria-pressed", isPressed ? "true" : "false");
  button.classList.toggle("active", Boolean(isPressed));
}

export function setButtonDisabled(button, isDisabled) {
  button.disabled = Boolean(isDisabled);
  button.setAttribute("aria-disabled", isDisabled ? "true" : "false");
}

export function syncControlStates() {
  setElementClass(
    controlsPanel,
    "controls-state " + (world.isExtinct ? "controls-extinct" : (world.isPaused ? "controls-paused" : "controls-running"))
  );
  setElementText(pauseButton, world.isExtinct ? "Extinct" : (world.isPaused ? "Resume" : "Pause"));
  setButtonPressed(pauseButton, world.isPaused);
  pauseButton.classList.toggle("danger", Boolean(world.isExtinct));
  setButtonDisabled(pauseButton, world.isExtinct);
  setButtonDisabled(stepButton, world.isExtinct || !world.isPaused);
  setButtonDisabled(speedDownButton, world.isExtinct || world.speed <= 1);
  setButtonDisabled(speedUpButton, world.isExtinct || world.speed >= 10);
  pauseButton.title = world.isExtinct ? "Run extinct. Restart to seed a new population." : "Pause or resume simulation (Space)";
  stepButton.title = "Advance one tick while paused (N)";
  speedDownButton.title = "Decrease simulation speed (-)";
  speedUpButton.title = "Increase simulation speed (+)";
  timeScaleSlider.title = "Manual time scale override";
  restartButton.title = "Restart with current tuning (R)";
  pauseButton.setAttribute("aria-keyshortcuts", "Space");
  stepButton.setAttribute("aria-keyshortcuts", "N");
  speedDownButton.setAttribute("aria-keyshortcuts", "-");
  speedUpButton.setAttribute("aria-keyshortcuts", "+");
  restartButton.setAttribute("aria-keyshortcuts", "R");
}

export function syncMenuState() {
  setElementClass(gameWrap, world.isMenuOpen ? "menu-open" : "menu-closed");
  menuToggleButton.setAttribute("aria-expanded", world.isMenuOpen ? "true" : "false");
  uiMenu.setAttribute("aria-hidden", world.isMenuOpen ? "false" : "true");
  menuBackdrop.setAttribute("aria-hidden", world.isMenuOpen ? "false" : "true");
  menuBackdrop.tabIndex = world.isMenuOpen ? 0 : -1;

  if (world.isMenuOpen) {
    uiMenu.removeAttribute("inert");
  } else {
    uiMenu.setAttribute("inert", "");
  }

  setElementText(menuToggleText, world.isMenuOpen ? "Close" : "Menu");
  menuToggleButton.setAttribute("aria-label", world.isMenuOpen ? "Close simulation menu" : "Open simulation menu");
}

export function setMenuOpen(isOpen) {
  var nextOpen = Boolean(isOpen);

  if (world.isMenuOpen === nextOpen) {
    return false;
  }

  world.isMenuOpen = nextOpen;
  syncMenuState();
  return true;
}

export function toggleMenuOpen() {
  return setMenuOpen(!world.isMenuOpen);
}

export function syncMenuPage() {
  var activePage = world.menuPage || "controls";
  var pages = uiMenu.querySelectorAll("[data-menu-page]");
  var tabs = menuTabs.querySelectorAll("[data-menu-target]");

  for (var pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    var page = pages[pageIndex];
    var isVisible = page.getAttribute("data-menu-page") === activePage;

    if (PS.ui && PS.ui.panelManager && page.id && PS.ui.panelManager.get(page.id)) {
      if (isVisible) {
        PS.ui.panelManager.show(page.id);
      } else {
        PS.ui.panelManager.hide(page.id);
      }
    } else {
      page.hidden = !isVisible;
    }
  }

  for (var tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
    var isActive = tabs[tabIndex].getAttribute("data-menu-target") === activePage;
    tabs[tabIndex].classList.toggle("active", isActive);
    tabs[tabIndex].setAttribute("aria-pressed", isActive ? "true" : "false");
  }
}

export function setMenuPage(pageName) {
  var nextPage = String(pageName || "controls");

  if (!/^(controls|status|ecosystem|log)$/.test(nextPage)) {
    nextPage = "controls";
  }

  if (world.menuPage === nextPage) {
    syncMenuPage();
    return false;
  }

  world.menuPage = nextPage;
  syncMenuPage();
  return true;
}

export function applyTuningFromControls(redraw) {
  world.speed = clamp(Math.round(getTuningInputNumber(speedSlider, world.speed)), 1, 10);
  CONFIG.ORGANISM_DRAW_SIZE = clamp(Math.round(getTuningInputNumber(organismSizeSlider, CONFIG.ORGANISM_DRAW_SIZE)), 2, 14);
  CONFIG.FOOD_DRAW_SIZE = clamp(Math.round(getTuningInputNumber(foodSizeSlider, CONFIG.FOOD_DRAW_SIZE)), 1, 8);
  CONFIG.STARTING_FOOD = clamp(Math.round(getTuningInputNumber(startingFoodSlider, CONFIG.STARTING_FOOD)), 100, 1000);
  CONFIG.MAX_FOOD = Math.max(CONFIG.MAX_FOOD, CONFIG.STARTING_FOOD);
  CONFIG.FERTILE_FOOD_GROWTH_CHANCE = clamp(getTuningInputNumber(foodGrowthSlider, CONFIG.FERTILE_FOOD_GROWTH_CHANCE * 100) / 100, 0, 1);
  world.seedText = normalizeSeedText(seedInput.value);

  if (redraw) {
    drawWorld();
  }

  updateHud();
}

export function getNearestOrganismToTile(tileX, tileY) {
  return getNearestOrganismInRadius(tileX, tileY, 1);
}

export function getNearestSettlementToTile(tileX, tileY) {
  return typeof getNearestInfluencingSettlement === "function"
    ? getNearestInfluencingSettlement(tileX, tileY)
    : null;
}

export function getInspectContextRadius() {
  return Math.max(4, Math.round(Number(CONFIG.SETTLEMENT_RADIUS) / 2 || 6));
}

export function countFertileTilesInRadius(tileX, tileY, radius) {
  var normalizedRadius = Math.max(0, Math.round(Number(radius) || 0));
  var fertileTiles = 0;
  var sampledTiles = 0;

  for (var y = Math.max(0, tileY - normalizedRadius); y <= Math.min(WORLD_HEIGHT - 1, tileY + normalizedRadius); y++) {
    var rowRadius = normalizedRadius - Math.abs(tileY - y);

    for (var dx = -rowRadius; dx <= rowRadius; dx++) {
      var x = getWrappedWorldX(tileX + dx);
      sampledTiles++;

      if (isFertile(x, y)) {
        fertileTiles++;
      }
    }
  }

  return {
    fertileTiles: fertileTiles,
    sampledTiles: sampledTiles,
    fertilePercent: sampledTiles > 0 ? (fertileTiles / sampledTiles) * 100 : 0
  };
}
