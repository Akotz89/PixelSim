function registerSimulationInputActions() {
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

    zoomPlanetView(event.deltaY < 0 ? 0.25 : -0.25, getCanvasPointFromEvent(event));
    return true;
  });
  PS.input.on("close_menu", function(event) {
    return setMenuOpen(false);
  });
  PS.input.on("toggle_performance", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target) || !window.PS || !PS.debug || !PS.debug.performance) {
      return false;
    }

    PS.debug.performance.toggle();
    return true;
  });
  PS.input.on("toggle_overlays", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target) || !window.PS || !PS.debug || !PS.debug.overlays) {
      return false;
    }

    PS.debug.overlays.toggle();
    return true;
  });
  PS.input.on("toggle_profiler", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target) || !window.PS || !PS.debug || !PS.debug.profiler) {
      return false;
    }

    PS.debug.profiler.toggle();
    return true;
  });
  PS.input.on("toggle_console", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target) || !window.PS || !PS.debug || !PS.debug.console) {
      return false;
    }

    PS.debug.console.toggle();
    return true;
  });
  PS.input.on("cycle_observation_overlay", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target) || !window.PS || !PS.ui || !PS.ui.observationOverlays) {
      return false;
    }

    PS.ui.observationOverlays.cycle();
    return true;
  });
  PS.input.on("toggle_menu", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target)) {
      return false;
    }

    toggleMenuOpen();
    return true;
  });
  PS.input.on("toggle_pause", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target)) {
      return false;
    }

    toggleSimulationPaused();
    return true;
  });
  PS.input.on("step_once", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target)) {
      return false;
    }

    stepSimulationOnce();
    return true;
  });
  PS.input.on("zoom_in_large", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target)) {
      return false;
    }

    zoomPlanetView(1);
    return true;
  });
  PS.input.on("zoom_out_large", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target)) {
      return false;
    }

    zoomPlanetView(-1);
    return true;
  });
  PS.input.on("zoom_in", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target)) {
      return false;
    }

    zoomPlanetView(0.5);
    return true;
  });
  PS.input.on("zoom_out", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target)) {
      return false;
    }

    zoomPlanetView(-0.5);
    return true;
  });
  PS.input.on("pan_up", function(event) {
    return shouldIgnoreSimulationShortcut(event.target) ? false : panPlanetViewFromKeyboard(0, 24);
  });
  PS.input.on("pan_down", function(event) {
    return shouldIgnoreSimulationShortcut(event.target) ? false : panPlanetViewFromKeyboard(0, -24);
  });
  PS.input.on("pan_left", function(event) {
    return shouldIgnoreSimulationShortcut(event.target) ? false : panPlanetViewFromKeyboard(-24, 0);
  });
  PS.input.on("pan_right", function(event) {
    return shouldIgnoreSimulationShortcut(event.target) ? false : panPlanetViewFromKeyboard(24, 0);
  });
  PS.input.on("restart", function(event) {
    if (shouldIgnoreSimulationShortcut(event.target)) {
      return false;
    }

    requestRestartSimulationFromControls();
    return true;
  });
  PS.input.on("menu_page_controls", function(event) {
    if (!world.isMenuOpen || shouldIgnoreSimulationShortcut(event.target)) {
      return false;
    }

    setMenuPage("controls");
    return true;
  });
  PS.input.on("menu_page_status", function(event) {
    if (!world.isMenuOpen || shouldIgnoreSimulationShortcut(event.target)) {
      return false;
    }

    setMenuPage("status");
    return true;
  });
  PS.input.on("menu_page_ecosystem", function(event) {
    if (!world.isMenuOpen || shouldIgnoreSimulationShortcut(event.target)) {
      return false;
    }

    setMenuPage("ecosystem");
    return true;
  });
  PS.input.on("menu_page_log", function(event) {
    if (!world.isMenuOpen || shouldIgnoreSimulationShortcut(event.target)) {
      return false;
    }

    setMenuPage("log");
    return true;
  });

  return true;
}

function shouldIgnoreSimulationShortcut(target) {
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

function handleSimulationShortcut(event) {
  var handled = PS.input && typeof PS.input.handleKeyDown === "function"
    ? PS.input.handleKeyDown(event)
    : false;

  if (handled && typeof event.preventDefault === "function") {
    event.preventDefault();
  }

  return handled;
}
