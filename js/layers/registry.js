"use strict";
import { PS } from "../core/namespace.js";

PS.layers = {
  entries: {},
  order: [],
  register: function(id, layer) {
    var layerId = String(id || "").trim();

    if (!layerId) {
      throw new Error("Layer id is required");
    }

    this.entries[layerId] = layer || {};

    if (this.order.indexOf(layerId) < 0) {
      this.order.push(layerId);
    }

    return this.entries[layerId];
  },
  get: function(id) {
    return this.entries[String(id || "")] || null;
  },
  updateAll: function(dt) {
    var updated = [];

    for (var i = 0; i < this.order.length; i++) {
      var layerId = this.order[i];
      var layer = this.entries[layerId];

      if (layer && layer.alwaysOn !== false && typeof layer.update === "function") {
        layer.update(dt);
        updated.push(layerId);
      }
    }

    return updated;
  },
  getManifest: function() {
    var manifest = [];

    for (var i = 0; i < this.order.length; i++) {
      var layerId = this.order[i];
      var layer = this.entries[layerId] || {};

      manifest.push({
        id: layerId,
        alwaysOn: layer.alwaysOn !== false,
        family: layer.family || "simulation",
        watcherOutputs: layer.watcherOutputs || []
      });
    }

    return manifest;
  }
};
