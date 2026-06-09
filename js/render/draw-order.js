"use strict";
PS.render = PS.render || {};

PS.render.DrawLayer = {
  TERRAIN_BASE: 0,
  TERRAIN_TRANSITION: 1,
  TERRAIN_DECORATION: 2,
  WATER_SURFACE: 3,
  SHADOW: 4,
  ENTITY_GROUND: 5,
  VEGETATION_TRUNK: 6,
  ENTITY_SORTED: 7,
  VEGETATION_CANOPY: 8,
  BUILDING_WALL: 9,
  BUILDING_ROOF: 10,
  PARTICLE_BELOW: 11,
  WEATHER: 12,
  ROUTE_OVERLAY: 13,
  SELECTION_OVERLAY: 14,
  DEBUG_OVERLAY: 15,
  UI_WORLD: 16,
  UI_SCREEN: 17
};

PS.render.DrawLayerNames = {};

Object.keys(PS.render.DrawLayer).forEach(function (name) {
  PS.render.DrawLayerNames[PS.render.DrawLayer[name]] = name;
});

PS.render.DrawOrderManager = function () {
  this.layers = {};
  this.stats = {};
  this.lastFlushStats = {};
  this.lastFlushSequence = [];
};

PS.render.DrawOrderManager.prototype.normalizeLayer = function (layer) {
  var numericLayer = Number(layer);

  if (!Number.isFinite(numericLayer)) {
    throw new Error("Draw layer must be a finite number");
  }

  numericLayer = Math.round(numericLayer);

  if (numericLayer < PS.render.DrawLayer.TERRAIN_BASE || numericLayer > PS.render.DrawLayer.UI_SCREEN) {
    throw new Error("Draw layer out of range: " + numericLayer);
  }

  return numericLayer;
};

PS.render.DrawOrderManager.prototype.submit = function (layer, drawCommand) {
  var numericLayer = this.normalizeLayer(layer);
  var command = typeof drawCommand === "function" ? { draw: drawCommand } : (drawCommand || {});

  if (typeof command.draw !== "function") {
    throw new Error("Draw command requires a draw function");
  }

  if (!this.layers[numericLayer]) {
    this.layers[numericLayer] = [];
  }

  command.layer = numericLayer;
  this.layers[numericLayer].push(command);
  return command;
};

PS.render.DrawOrderManager.prototype.getCommandSortY = function (command) {
  var value = command && command.sortY;

  if (!Number.isFinite(Number(value))) {
    value = command && command.y;
  }

  if (!Number.isFinite(Number(value)) && command && command.entity) {
    value = command.entity.sortY;
  }

  if (!Number.isFinite(Number(value)) && command && command.entity) {
    value = command.entity.screenY;
  }

  if (!Number.isFinite(Number(value)) && command && command.entity) {
    value = command.entity.y;
  }

  return Number.isFinite(Number(value)) ? Number(value) : 0;
};

PS.render.DrawOrderManager.prototype.getOrderedLayerIds = function () {
  return Object.keys(this.layers).map(function (layer) {
    return Number(layer);
  }).sort(function (a, b) {
    return a - b;
  });
};

PS.render.DrawOrderManager.prototype.flush = function (renderer) {
  var orderedLayers = this.getOrderedLayerIds();
  var flushStats = {};
  var flushSequence = [];

  for (var i = 0; i < orderedLayers.length; i++) {
    var layer = orderedLayers[i];
    var commands = this.layers[layer] || [];

    if (layer === PS.render.DrawLayer.ENTITY_SORTED) {
      commands.sort(function (a, b) {
        return PS.render.drawOrder.getCommandSortY(a) - PS.render.drawOrder.getCommandSortY(b);
      });
    }

    for (var j = 0; j < commands.length; j++) {
      commands[j].draw(renderer, layer);
      flushSequence.push({
        layer: layer,
        layerName: PS.render.DrawLayerNames[layer] || String(layer),
        id: commands[j].id || null,
        sortY: PS.render.drawOrder.getCommandSortY(commands[j])
      });
    }

    flushStats[layer] = {
      layer: layer,
      layerName: PS.render.DrawLayerNames[layer] || String(layer),
      drawCalls: commands.length
    };
  }

  this.stats = flushStats;
  this.lastFlushStats = flushStats;
  this.lastFlushSequence = flushSequence;
  this.clear();
  return flushStats;
};

PS.render.DrawOrderManager.prototype.clear = function () {
  this.layers = {};
};

PS.render.DrawOrderManager.prototype.getLayerStats = function () {
  return this.lastFlushStats;
};

PS.render.DrawOrderManager.prototype.getDebugSnapshot = function () {
  var stats = this.getLayerStats();
  var snapshot = [];

  for (var layer = PS.render.DrawLayer.TERRAIN_BASE; layer <= PS.render.DrawLayer.UI_SCREEN; layer++) {
    snapshot.push({
      layer: layer,
      layerName: PS.render.DrawLayerNames[layer] || String(layer),
      drawCalls: stats[layer] ? stats[layer].drawCalls : 0
    });
  }

  return snapshot;
};

PS.render.drawOrder = PS.render.drawOrder || new PS.render.DrawOrderManager();
