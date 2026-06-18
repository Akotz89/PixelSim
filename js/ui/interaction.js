"use strict";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { stepSimulationOnce, toggleSimulationPaused } from "../main-loop.js";
import { world } from "../systems/state.js";
import { beginPlanetDrag, endPlanetDrag, getCanvasPointFromEvent, panPlanetViewFromKeyboard, updatePlanetDrag, zoomPlanetView } from "./camera-input.js";
import { setMenuOpen, setMenuPage, toggleMenuOpen } from "./foundation.js";
import { requestRestartSimulationFromControls } from "./persistence-controls.js";

export function getPlanetWheelZoomDelta(event) {
  var deltaY = Number(event && event.deltaY) || 0;
  var mode = Number(event && event.deltaMode) || 0;
  var pixelDelta = deltaY;

  if (mode === 1) {
    pixelDelta *= 16;
  } else if (mode === 2) {
    pixelDelta *= 240;
  }

  return clamp(-pixelDelta / 1200, -0.08, 0.08);
}

export function registerSimulationInputActions() {
  if (!PS.input) {
    return false;
  }

  if (typeof PS.input.clearHandlers === "function") {
    PS.input.clearHandlers();
  }

  PS.input.on("pointer_down", function(event) {
    beginPlanetDrag(event);
    return true;
  });
  PS.input.on("pointer_move", function(event) {
    updatePlanetDrag(event);
    return true;
  });
  PS.input.on("pointer_up", function(event) {
    endPlanetDrag(event);
    return true;
  });
  PS.input.on("pointer_cancel", function(event) {
    endPlanetDrag(event);
    return true;
  });
  PS.input.on("wheel_zoom", function(event) {
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    zoomPlanetView(getPlanetWheelZoomDelta(event), getCanvasPointFromEvent(event));
    return true;
  });
  PS.input.on("close_menu", function(event) {
    return setMenuOpen(false);
  });
  PS.input.on("toggle_performance", function(event) {
    if (!PS.debug || !PS.debug.performance) {
      return false;
    }

    PS.debug.performance.toggle();
    return true;
  });
  PS.input.on("toggle_overlays", function(event) {
    if (!PS.debug || !PS.debug.overlays) {
      return false;
    }

    PS.debug.overlays.toggle();
    return true;
  });
  PS.input.on("toggle_profiler", function(event) {
    if (!PS.debug || !PS.debug.profiler) {
      return false;
    }

    PS.debug.profiler.toggle();
    return true;
  });
  PS.input.on("toggle_console", function(event) {
    if (!PS.debug || !PS.debug.console) {
      return false;
    }

    PS.debug.console.toggle();
    return true;
  });
  PS.input.on("cycle_observation_overlay", function(event) {
    if (!PS.ui || !PS.ui.observationOverlays) {
      return false;
    }

    PS.ui.observationOverlays.cycle();
    return true;
  });
  PS.input.on("toggle_menu", function(event) {
    toggleMenuOpen();
    return true;
  });
  PS.input.on("toggle_pause", function(event) {
    toggleSimulationPaused();
    return true;
  });
  PS.input.on("step_once", function(event) {
    stepSimulationOnce();
    return true;
  });
  PS.input.on("zoom_in_large", function(event) {
    zoomPlanetView(1);
    return true;
  });
  PS.input.on("zoom_out_large", function(event) {
    zoomPlanetView(-1);
    return true;
  });
  PS.input.on("zoom_in", function(event) {
    zoomPlanetView(0.5);
    return true;
  });
  PS.input.on("zoom_out", function(event) {
    zoomPlanetView(-0.5);
    return true;
  });
  PS.input.on("pan_up", function(event) {
    return panPlanetViewFromKeyboard(0, 24);
  });
  PS.input.on("pan_down", function(event) {
    return panPlanetViewFromKeyboard(0, -24);
  });
  PS.input.on("pan_left", function(event) {
    return panPlanetViewFromKeyboard(-24, 0);
  });
  PS.input.on("pan_right", function(event) {
    return panPlanetViewFromKeyboard(24, 0);
  });
  PS.input.on("restart", function(event) {
    requestRestartSimulationFromControls();
    return true;
  });
  PS.input.on("menu_page_controls", function(event) {
    if (!world.isMenuOpen) {
      return false;
    }

    setMenuPage("controls");
    return true;
  });
  PS.input.on("menu_page_status", function(event) {
    if (!world.isMenuOpen) {
      return false;
    }

    setMenuPage("status");
    return true;
  });
  PS.input.on("menu_page_ecosystem", function(event) {
    if (!world.isMenuOpen) {
      return false;
    }

    setMenuPage("ecosystem");
    return true;
  });
  PS.input.on("menu_page_log", function(event) {
    if (!world.isMenuOpen) {
      return false;
    }

    setMenuPage("log");
    return true;
  });

  return true;
}

export function shouldIgnoreSimulationShortcut(target) {
  if (!target) {
    return false;
  }

  var tagName = String(target.tagName || "").toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button" ||
    Boolean(target.isContentEditable)
  );
}

export function handleSimulationShortcut(event) {
  if (shouldIgnoreSimulationShortcut(event.target)) {
    return false;
  }

  var handled = PS.input && typeof PS.input.handleKeyDown === "function"
    ? PS.input.handleKeyDown(event)
    : false;

  if (handled && typeof event.preventDefault === "function") {
    event.preventDefault();
  }

  return handled;
}
