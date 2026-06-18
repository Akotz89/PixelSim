"use strict";
import { PS } from "../core/namespace.js";

PS.render = PS.render || {};
PS.atlas = PS.atlas || {};

PS.atlas.getOrbitEventCategoryBucket = function (event) {
  var category = String(event && event.category || event && event.source || event && event.type || "biology").toLowerCase();

  if (category.indexOf("geolog") >= 0 || category.indexOf("tectonic") >= 0) { return 1; }
  if (category.indexOf("atmos") >= 0 || category.indexOf("climate") >= 0) { return 2; }
  if (category.indexOf("civil") >= 0 || category.indexOf("settlement") >= 0 || category.indexOf("space") >= 0) { return 3; }
  if (category.indexOf("extinction") >= 0 || category.indexOf("death") >= 0) { return 4; }
  return 0;
};

PS.atlas.getOrbitEventSeverityBucket = function (event) {
  var severity = String(event && event.severity || "info").toLowerCase();

  if (severity === "critical" || severity === "error") { return 2; }
  if (severity === "warning" || severity === "warn" || severity === "caution") { return 1; }
  return 0;
};

PS.atlas.getOrbitEventMarkerColor = function (categoryBucket, severityBucket) {
  var colors = [
    [108, 232, 126, 255],
    [255, 188, 86, 255],
    [112, 218, 255, 255],
    [222, 154, 255, 255],
    [255, 112, 104, 255]
  ];
  var color = colors[Math.max(0, Math.min(colors.length - 1, categoryBucket))];

  if (severityBucket >= 2) {
    return [255, 72, 72, 255];
  }
  if (severityBucket === 1) {
    return [255, Math.max(160, color[1]), 72, 255];
  }
  return color;
};

PS.atlas.drawOrbitEventMarkerCell = function (cell, categoryBucket, severityBucket) {
  var signal = PS.atlas.getOrbitEventMarkerColor(categoryBucket, severityBucket);
  var shadow = [5, 9, 18, 170];
  var glow = [signal[0], signal[1], signal[2], 78];
  var highlight = [255, 255, 236, 235];
  var x;
  var y;

  PS.atlas.fillNormalHalf(cell);
  PS.atlas.writeDot(cell, 8, 8, 6, glow);

  for (x = 5; x <= 11; x++) {
    PS.atlas.writePixel(cell, x, 4, shadow);
    PS.atlas.writePixel(cell, x, 12, shadow);
  }
  for (y = 5; y <= 11; y++) {
    PS.atlas.writePixel(cell, 4, y, shadow);
    PS.atlas.writePixel(cell, 12, y, shadow);
  }

  PS.atlas.writePixel(cell, 8, 3, highlight);
  PS.atlas.writePixel(cell, 8, 4, signal);
  PS.atlas.writePixel(cell, 6, 6, signal);
  PS.atlas.writePixel(cell, 10, 6, signal);
  PS.atlas.writePixel(cell, 5, 8, signal);
  PS.atlas.writePixel(cell, 11, 8, signal);
  PS.atlas.writePixel(cell, 6, 10, signal);
  PS.atlas.writePixel(cell, 10, 10, signal);
  PS.atlas.writePixel(cell, 8, 11, signal);
  PS.atlas.writePixel(cell, 8, 12, shadow);

  if (severityBucket >= 1) {
    PS.atlas.writePixel(cell, 7, 7, highlight);
    PS.atlas.writePixel(cell, 9, 7, highlight);
    PS.atlas.writePixel(cell, 8, 9, highlight);
  }

  if (severityBucket >= 2) {
    PS.atlas.writePixel(cell, 4, 4, signal);
    PS.atlas.writePixel(cell, 12, 4, signal);
    PS.atlas.writePixel(cell, 4, 12, signal);
    PS.atlas.writePixel(cell, 12, 12, signal);
  }
};

PS.atlas.getOrbitEventMarkerCell = function (event) {
  var categoryBucket = PS.atlas.getOrbitEventCategoryBucket(event);
  var severityBucket = PS.atlas.getOrbitEventSeverityBucket(event);
  var name = "entity.event." + categoryBucket + "." + severityBucket;
  var cell = PS.atlas.cells[name];

  if (!cell) {
    cell = PS.atlas.allocateCell(name, 32, 16);
    PS.atlas.drawOrbitEventMarkerCell(cell, categoryBucket, severityBucket);
    PS.atlas.stats.eventMarkerCells++;
    PS.atlas.pages[cell.pageIndex].version++;
  }

  return cell;
};
