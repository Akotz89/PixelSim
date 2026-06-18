import { PS } from "../core/namespace.js";

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

PS.render.RenderLayer = {
  GROUND_COLOR: 0,
  WATER_BELOW: 1,
  GRASS_SNOW_OVERLAYS: 2,
  FLOORS: 3,
  TERRAIN_BELOW: 4,
  SHADOWS: 5,
  ENTITIES: 6,
  TERRAIN_MID: 7,
  TERRAIN_ABOVE: 8,
  WEATHER_EFFECTS: 9,
  OVERLAY_UI: 10
};

PS.render.DrawLayerNames = {};
PS.render.RenderLayerNames = {};

Object.keys(PS.render.DrawLayer).forEach(function (name) {
  PS.render.DrawLayerNames[PS.render.DrawLayer[name]] = name;
});

Object.keys(PS.render.RenderLayer).forEach(function (name) {
  PS.render.RenderLayerNames[PS.render.RenderLayer[name]] = name;
});

PS.render.DrawLayerToRenderLayer = {};
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.TERRAIN_BASE] = PS.render.RenderLayer.GROUND_COLOR;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.TERRAIN_TRANSITION] = PS.render.RenderLayer.TERRAIN_BELOW;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.TERRAIN_DECORATION] = PS.render.RenderLayer.GRASS_SNOW_OVERLAYS;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.WATER_SURFACE] = PS.render.RenderLayer.WATER_BELOW;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.SHADOW] = PS.render.RenderLayer.SHADOWS;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.ENTITY_GROUND] = PS.render.RenderLayer.ENTITIES;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.VEGETATION_TRUNK] = PS.render.RenderLayer.TERRAIN_MID;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.ENTITY_SORTED] = PS.render.RenderLayer.ENTITIES;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.VEGETATION_CANOPY] = PS.render.RenderLayer.TERRAIN_MID;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.BUILDING_WALL] = PS.render.RenderLayer.TERRAIN_BELOW;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.BUILDING_ROOF] = PS.render.RenderLayer.TERRAIN_ABOVE;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.PARTICLE_BELOW] = PS.render.RenderLayer.ENTITIES;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.WEATHER] = PS.render.RenderLayer.WEATHER_EFFECTS;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.ROUTE_OVERLAY] = PS.render.RenderLayer.OVERLAY_UI;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.SELECTION_OVERLAY] = PS.render.RenderLayer.OVERLAY_UI;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.DEBUG_OVERLAY] = PS.render.RenderLayer.OVERLAY_UI;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.UI_WORLD] = PS.render.RenderLayer.OVERLAY_UI;
PS.render.DrawLayerToRenderLayer[PS.render.DrawLayer.UI_SCREEN] = PS.render.RenderLayer.OVERLAY_UI;

PS.render.DrawOrderManager = function () {
  this.layers = {};
  this.stats = {};
  this.renderLayerStats = {};
  this.lastFlushStats = {};
  this.lastRenderLayerStats = {};
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

PS.render.DrawOrderManager.prototype.getRenderLayerForDrawLayer = function (layer) {
  var numericLayer = this.normalizeLayer(layer);
  var mapped = PS.render.DrawLayerToRenderLayer[numericLayer];

  return Number.isFinite(Number(mapped)) ? Number(mapped) : PS.render.RenderLayer.OVERLAY_UI;
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
    var renderA = PS.render.drawOrder.getRenderLayerForDrawLayer(a);
    var renderB = PS.render.drawOrder.getRenderLayerForDrawLayer(b);

    return renderA === renderB ? a - b : renderA - renderB;
  });
};

PS.render.DrawOrderManager.prototype.beginRenderLayer = function (renderer, renderLayer) {
  var stencilRef = renderLayer + 1;

  if (renderer && typeof renderer.beginRenderLayer === "function") {
    renderer.beginRenderLayer(renderLayer, stencilRef);
  } else if (renderer && typeof renderer.setStencilLayer === "function") {
    renderer.setStencilLayer(stencilRef, renderLayer);
  }

  return stencilRef;
};

PS.render.DrawOrderManager.prototype.endRenderLayer = function (renderer, renderLayer) {
  if (renderer && typeof renderer.endRenderLayer === "function") {
    renderer.endRenderLayer(renderLayer);
  }
};

PS.render.DrawOrderManager.prototype.flush = function (renderer) {
  var orderedLayers = this.getOrderedLayerIds();
  var flushStats = {};
  var renderLayerStats = {};
  var flushSequence = [];
  var currentRenderLayer = null;
  var currentStencilRef = 0;

  for (var i = 0; i < orderedLayers.length; i++) {
    var layer = orderedLayers[i];
    var commands = this.layers[layer] || [];
    var renderLayer = this.getRenderLayerForDrawLayer(layer);
    var renderLayerName = PS.render.RenderLayerNames[renderLayer] || String(renderLayer);

    if (renderLayer !== currentRenderLayer) {
      if (currentRenderLayer !== null) {
        this.endRenderLayer(renderer, currentRenderLayer);
      }
      currentRenderLayer = renderLayer;
      currentStencilRef = this.beginRenderLayer(renderer, renderLayer);
    }

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
        renderLayer: renderLayer,
        renderLayerName: renderLayerName,
        stencilRef: currentStencilRef,
        id: commands[j].id || null,
        sortY: PS.render.drawOrder.getCommandSortY(commands[j])
      });
    }

    flushStats[layer] = {
      layer: layer,
      layerName: PS.render.DrawLayerNames[layer] || String(layer),
      renderLayer: renderLayer,
      renderLayerName: renderLayerName,
      stencilRef: currentStencilRef,
      drawCalls: commands.length
    };
    if (!renderLayerStats[renderLayer]) {
      renderLayerStats[renderLayer] = {
        renderLayer: renderLayer,
        renderLayerName: renderLayerName,
        stencilRef: currentStencilRef,
        drawLayers: 0,
        drawCalls: 0
      };
    }
    renderLayerStats[renderLayer].drawLayers += 1;
    renderLayerStats[renderLayer].drawCalls += commands.length;
  }

  if (currentRenderLayer !== null) {
    this.endRenderLayer(renderer, currentRenderLayer);
  }

  this.stats = flushStats;
  this.renderLayerStats = renderLayerStats;
  this.lastFlushStats = flushStats;
  this.lastRenderLayerStats = renderLayerStats;
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

PS.render.DrawOrderManager.prototype.getRenderLayerStats = function () {
  return this.lastRenderLayerStats;
};

PS.render.DrawOrderManager.prototype.getRenderLayerSnapshot = function () {
  var stats = this.getRenderLayerStats();
  var snapshot = [];

  for (var layer = PS.render.RenderLayer.GROUND_COLOR; layer <= PS.render.RenderLayer.OVERLAY_UI; layer++) {
    snapshot.push({
      renderLayer: layer,
      renderLayerName: PS.render.RenderLayerNames[layer] || String(layer),
      stencilRef: layer + 1,
      drawCalls: stats[layer] ? stats[layer].drawCalls : 0,
      drawLayers: stats[layer] ? stats[layer].drawLayers : 0
    });
  }

  return snapshot;
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
