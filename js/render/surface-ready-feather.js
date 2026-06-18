"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";

PS.render = PS.render || {};
PS.render.surfaceReadyFeather = PS.render.surfaceReadyFeather || {};

PS.render.surfaceReadyFeather.applyAddress = function (address, targetCanvas) {
  if (!address || !targetCanvas || CONFIG.PLANET_SURFACE_READY_EDGE_FEATHER === false) {
    return address;
  }

  var featherBase = Math.min(targetCanvas.width, targetCanvas.height);

  address.featherCenterX = targetCanvas.width / 2;
  address.featherCenterY = targetCanvas.height / 2;
  address.featherInnerRadius = featherBase * clamp(Number(CONFIG.PLANET_SURFACE_READY_EDGE_FEATHER_INNER_RATIO) || 0.34, 0.05, 1);
  address.featherOuterRadius = featherBase * clamp(Number(CONFIG.PLANET_SURFACE_READY_EDGE_FEATHER_OUTER_RATIO) || 0.49, 0.06, 1.2);
  address.featherMinAlpha = clamp(Number(CONFIG.PLANET_SURFACE_READY_EDGE_FEATHER_MIN_ALPHA) || 0.18, 0, 1);
  return address;
};

PS.render.surfaceReadyFeather.getAlpha = function (address, screenX, screenY, samplePixelSize) {
  if (!address || address.featherEnabled === false) {
    return 1;
  }

  var centerX = Number(address.featherCenterX);
  var centerY = Number(address.featherCenterY);
  var inner = Number(address.featherInnerRadius);
  var outer = Number(address.featherOuterRadius);
  var minAlpha = clamp(Number(address.featherMinAlpha) || 0, 0, 1);
  var cellCenterX;
  var cellCenterY;
  var distance;

  if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || !Number.isFinite(inner) || !Number.isFinite(outer) || outer <= inner) {
    return 1;
  }

  cellCenterX = screenX + samplePixelSize * 0.5;
  cellCenterY = screenY + samplePixelSize * 0.5;
  distance = Math.sqrt((cellCenterX - centerX) * (cellCenterX - centerX) + (cellCenterY - centerY) * (cellCenterY - centerY));

  if (distance <= inner) {
    return 1;
  }

  if (distance >= outer) {
    return minAlpha;
  }

  return clamp(minAlpha + (1 - minAlpha) * (outer - distance) / (outer - inner), minAlpha, 1);
};
