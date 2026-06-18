import { PS } from "../core/namespace.js";
import { world } from "../systems/state.js";

PS.debug = PS.debug || {};

PS.debug.overlays = {
  visible: false,
  element: null,
  setup: function() {
    this.element = document.getElementById("debug-overlays");
    this.render();
  },
  toggle: function() {
    this.visible = !this.visible;
    world.needsRender = true;
    this.render();
    return this.visible;
  },
  render: function() {
    if (!this.element) {
      this.element = document.getElementById("debug-overlays");
    }

    if (!this.element) {
      return;
    }

    this.element.hidden = !this.visible;
    var layerText = "";
    if (PS.render && PS.render.drawOrder && typeof PS.render.drawOrder.getDebugSnapshot === "function") {
      layerText = " | layers " + PS.render.drawOrder.getDebugSnapshot().filter(function (layer) {
        return layer.drawCalls > 0;
      }).map(function (layer) {
        return layer.layerName + ":" + layer.drawCalls;
      }).join(",");
    }

    this.element.textContent =
      "Overlays | food buckets " + Object.keys(world.foodBuckets || {}).length +
      " | organism buckets " + Object.keys(world.organismBuckets || {}).length +
      " | settlement buckets " + Object.keys(world.settlementBuckets || {}).length +
      layerText;
  }
};
