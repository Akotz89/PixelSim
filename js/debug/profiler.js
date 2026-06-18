"use strict";
import { PS } from "../core/namespace.js";
import { world } from "../systems/state.js";

PS.debug = PS.debug || {};

PS.debug.profiler = {
  visible: false,
  element: null,
  setup: function() {
    this.element = document.getElementById("debug-profiler");
    this.render();
  },
  toggle: function() {
    this.visible = !this.visible;
    this.render();
    return this.visible;
  },
  render: function() {
    if (!this.element) {
      this.element = document.getElementById("debug-profiler");
    }

    if (!this.element) {
      return;
    }

    this.element.hidden = !this.visible;
    this.element.textContent =
      "Profiler | sim " + world.updateMs.toFixed(2) + "ms" +
      " | render " + world.drawMs.toFixed(2) + "ms" +
      " | interp " + (Number(world.interpolation) || 0).toFixed(2) +
      " | max " + world.maxUpdateMs.toFixed(2) + "/" + world.maxDrawMs.toFixed(2) + "ms" +
      " | " + this.getTickProfileLabel();
  },
  getTickProfileLabel: function() {
    var profile = world.tickProfileMs || {};

    return "tick food " + (Number(profile.food) || 0).toFixed(2) + "ms" +
      " org " + (Number(profile.organisms) || 0).toFixed(2) + "ms" +
      " set " + (Number(profile.settlements) || 0).toFixed(2) + "ms" +
      " terrain " + (Number(profile.terrain) || 0).toFixed(2) + "ms" +
      " events " + (Number(profile.events) || 0).toFixed(2) + "ms";
  }
};
