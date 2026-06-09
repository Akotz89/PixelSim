"use strict";
PS.debug = PS.debug || {};

PS.debug.console = {
  visible: false,
  element: null,
  input: null,
  setup: function() {
    this.element = document.getElementById("debug-console");
    this.input = document.getElementById("debug-console-input");
    this.bindInput();
  },
  bindInput: function() {
    if (!this.input || this.input.dataset.bound === "true") {
      return;
    }

    this.input.dataset.bound = "true";
    this.input.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        PS.debug.console.run(event.currentTarget.value);
        event.currentTarget.value = "";
      }
    });
  },
  toggle: function() {
    this.visible = !this.visible;
    this.render();
    return this.visible;
  },
  render: function() {
    if (!this.element) {
      this.setup();
    }

    if (!this.element) {
      return;
    }

    this.element.hidden = !this.visible;

    if (this.visible && this.input) {
      this.input.focus();
    }
  },
  run: function(command) {
    var parts = String(command || "").trim().split(/\s+/);
    var key;
    var valueText;
    var value;

    if (parts[0] === "set" && parts.length >= 3) {
      key = parts[1].replace(/^CONFIG\./, "");
      valueText = parts.slice(2).join(" ");
      value = Number.isFinite(Number(valueText)) ? Number(valueText) : valueText;

      if (PS.config && typeof PS.config.setConstant === "function") {
        value = PS.config.setConstant(key, value);
      } else if (Object.prototype.hasOwnProperty.call(CONFIG, key)) {
        CONFIG[key] = value;
      } else {
        PS.ui.notifications && PS.ui.notifications.show("Config error", "Unknown CONFIG key", "warn");
        return null;
      }

      PS.ui.notifications && PS.ui.notifications.show("Config set", "CONFIG." + key, "info");
      return value;
    }

    if (parts[0] === "get" && parts.length === 2) {
      key = parts[1].replace(/^CONFIG\./, "");
      if (Object.prototype.hasOwnProperty.call(CONFIG, key)) {
        return CONFIG[key];
      }
      PS.ui.notifications && PS.ui.notifications.show("Config error", "Unknown CONFIG key", "warn");
      return null;
    }

    if (parts[0] === "reset" && (parts[1] === "CONFIG" || parts[1] === "config")) {
      if (PS.core && PS.core.DataLoader && PS.assets && PS.assets.startupLoader) {
        return PS.core.DataLoader.loadConfig(PS.assets.startupLoader);
      }
      if (PS.config && typeof PS.config.resetConstants === "function") {
        return PS.config.resetConstants();
      }
      return null;
    }

    PS.ui.notifications && PS.ui.notifications.show("Debug console", "Use: set/get/reset CONFIG", "warn");
    return null;
  }
};
