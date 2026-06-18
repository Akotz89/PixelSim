"use strict";
import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";

PS.atlas = PS.atlas || {};

PS.atlas.getSettlementReadinessBucket = function (marker) {
  return clamp(Math.round(Number(marker && marker.progressBucket) || 0), 0, 3);
};

PS.atlas.drawSettlementReadinessCell = function (cell, marker) {
  var bucket = PS.atlas.getSettlementReadinessBucket(marker);
  var lineageId = Math.max(1, Math.round(Number(marker && marker.lineageId) || 1));
  var colors = CONFIG && CONFIG.LINEAGE_COLORS ? CONFIG.LINEAGE_COLORS : ["#72d7ff"];
  var baseRgb = PS.atlas.hexToRgb(colors[(lineageId - 1) % colors.length]);
  var base = [baseRgb[0], baseRgb[1], baseRgb[2], 235];
  var shadow = [18, 22, 28, 190];
  var ember = [232, 196, 96, 245];
  var pale = [
    Math.min(255, baseRgb[0] + 72),
    Math.min(255, baseRgb[1] + 72),
    Math.min(255, baseRgb[2] + 72),
    245
  ];
  var x;
  var y;

  PS.atlas.fillNormalHalf(cell);

  for (x = 3; x <= 12; x++) {
    PS.atlas.writePixel(cell, x, 12, shadow);
  }

  for (x = 4; x <= 11; x++) {
    PS.atlas.writePixel(cell, x, 10, base);
    if (x % 3 === 0 || bucket >= 2) {
      PS.atlas.writePixel(cell, x, 9, pale);
    }
  }

  for (y = 6; y <= 10; y++) {
    PS.atlas.writePixel(cell, 4, y, shadow);
    PS.atlas.writePixel(cell, 11, y, shadow);
  }

  PS.atlas.writePixel(cell, 6, 8, ember);
  PS.atlas.writePixel(cell, 7, 7, ember);
  PS.atlas.writePixel(cell, 8, 8, ember);

  if (bucket >= 1) {
    PS.atlas.writePixel(cell, 5, 5, base);
    PS.atlas.writePixel(cell, 6, 4, pale);
    PS.atlas.writePixel(cell, 9, 5, base);
    PS.atlas.writePixel(cell, 10, 4, pale);
  }

  if (bucket >= 2) {
    PS.atlas.writePixel(cell, 3, 7, base);
    PS.atlas.writePixel(cell, 12, 7, base);
    PS.atlas.writePixel(cell, 7, 3, pale);
    PS.atlas.writePixel(cell, 8, 3, pale);
  }

  if (bucket >= 3) {
    PS.atlas.writePixel(cell, 6, 2, ember);
    PS.atlas.writePixel(cell, 7, 2, ember);
    PS.atlas.writePixel(cell, 8, 2, ember);
    PS.atlas.writePixel(cell, 9, 2, ember);
  }
};

PS.atlas.getSettlementReadinessCell = function (marker) {
  var bucket = PS.atlas.getSettlementReadinessBucket(marker);
  var lineageId = Math.max(1, Math.round(Number(marker && marker.lineageId) || 1));
  var lineageBucket = lineageId % 16;
  var name = ["entity.settlement_readiness", lineageBucket, bucket].join(".");
  var cell = PS.atlas.cells[name];

  if (!cell) {
    cell = PS.atlas.allocateCell(name, 16, 16);
    PS.atlas.drawSettlementReadinessCell(cell, {
      lineageId: lineageId,
      progressBucket: bucket
    });
    PS.atlas.stats.settlementCells++;
    PS.atlas.pages[cell.pageIndex].version++;
  }

  return cell;
};
