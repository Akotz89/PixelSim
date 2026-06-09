"use strict";
PS.render = PS.render || {};
PS.atlas = PS.atlas || {};

PS.atlas.getRepresentativeBehaviorBucket = function (representative) {
  var behavior = String(representative && representative.behavior || "watching");

  if (behavior === "feeding") { return 1; }
  if (behavior === "breeding") { return 2; }
  if (behavior === "foraging") { return 3; }
  if (behavior === "retiring") { return 4; }
  return 0;
};

PS.atlas.getRepresentativeTargetBucket = function (representative) {
  var targetType = String(representative && representative.target && representative.target.type || "");

  if (targetType === "food") { return 1; }
  if (targetType === "tile") { return 2; }
  if (targetType === "settlement") { return 3; }
  return 0;
};

PS.atlas.getRepresentativeWatchBucket = function (representative) {
  if (representative && representative.selected) { return 2; }
  if (representative && representative.pinned) { return 1; }
  return representative && Number(representative.bookmarkScore) > 0 ? 3 : 0;
};

PS.atlas.drawRepresentativeIntentCell = function (cell, behaviorBucket, targetBucket, watchBucket, lineageId) {
  var colors = CONFIG && CONFIG.LINEAGE_COLORS ? CONFIG.LINEAGE_COLORS : ["#72d7ff"];
  var baseRgb = PS.atlas.hexToRgb(colors[(Math.max(1, lineageId) - 1) % colors.length]);
  var base = [baseRgb[0], baseRgb[1], baseRgb[2], 235];
  var signal = behaviorBucket === 1 ? [112, 238, 112, 255]
    : behaviorBucket === 2 ? [255, 210, 98, 255]
    : behaviorBucket === 3 ? [126, 218, 255, 255]
    : behaviorBucket === 4 ? [255, 118, 102, 255]
    : [224, 236, 238, 230];
  var shadow = [8, 14, 20, 180];
  var highlight = [255, 255, 236, 235];
  var x;
  var y;

  PS.atlas.fillNormalHalf(cell);

  for (x = 4; x <= 11; x++) {
    PS.atlas.writePixel(cell, x, 3, shadow);
    PS.atlas.writePixel(cell, x, 12, shadow);
  }
  for (y = 4; y <= 11; y++) {
    PS.atlas.writePixel(cell, 3, y, shadow);
    PS.atlas.writePixel(cell, 12, y, shadow);
  }

  if (watchBucket === 2) {
    for (x = 5; x <= 10; x++) {
      PS.atlas.writePixel(cell, x, 4, highlight);
      PS.atlas.writePixel(cell, x, 11, highlight);
    }
    for (y = 5; y <= 10; y++) {
      PS.atlas.writePixel(cell, 4, y, highlight);
      PS.atlas.writePixel(cell, 11, y, highlight);
    }
  } else if (watchBucket === 1) {
    PS.atlas.writeDot(cell, 8, 8, 5, [base[0], base[1], base[2], 86]);
  } else if (watchBucket === 3) {
    PS.atlas.writePixel(cell, 8, 2, highlight);
    PS.atlas.writePixel(cell, 10, 4, highlight);
    PS.atlas.writePixel(cell, 12, 8, highlight);
  }

  if (behaviorBucket === 3) {
    PS.atlas.writePixel(cell, 5, 9, signal);
    PS.atlas.writePixel(cell, 6, 8, signal);
    PS.atlas.writePixel(cell, 7, 7, signal);
    PS.atlas.writePixel(cell, 8, 6, signal);
    PS.atlas.writePixel(cell, 9, 7, signal);
  } else if (behaviorBucket === 2) {
    PS.atlas.writePixel(cell, 8, 5, signal);
    PS.atlas.writePixel(cell, 7, 7, signal);
    PS.atlas.writePixel(cell, 8, 7, signal);
    PS.atlas.writePixel(cell, 9, 7, signal);
    PS.atlas.writePixel(cell, 8, 9, signal);
  } else if (behaviorBucket === 1) {
    PS.atlas.writeDot(cell, 8, 8, 2, signal);
    PS.atlas.writePixel(cell, 8, 5, highlight);
  } else if (behaviorBucket === 4) {
    PS.atlas.writePixel(cell, 5, 5, signal);
    PS.atlas.writePixel(cell, 6, 6, signal);
    PS.atlas.writePixel(cell, 7, 7, signal);
    PS.atlas.writePixel(cell, 8, 8, signal);
    PS.atlas.writePixel(cell, 9, 9, signal);
    PS.atlas.writePixel(cell, 10, 10, signal);
  } else {
    PS.atlas.writeDot(cell, 8, 8, 1, signal);
  }

  if (targetBucket === 1) {
    PS.atlas.writePixel(cell, 12, 5, [96, 242, 112, 255]);
    PS.atlas.writePixel(cell, 13, 6, [96, 242, 112, 255]);
    PS.atlas.writePixel(cell, 12, 7, [96, 242, 112, 255]);
  } else if (targetBucket > 1) {
    PS.atlas.writePixel(cell, 12, 5, base);
    PS.atlas.writePixel(cell, 13, 6, base);
    PS.atlas.writePixel(cell, 12, 7, base);
  }
};

PS.atlas.getRepresentativeIntentCell = function (representative) {
  var behaviorBucket = PS.atlas.getRepresentativeBehaviorBucket(representative);
  var targetBucket = PS.atlas.getRepresentativeTargetBucket(representative);
  var watchBucket = PS.atlas.getRepresentativeWatchBucket(representative);
  var lineageBucket = ((Math.max(1, Math.round(Number(representative && representative.lineageId) || 1)) - 1) % 16) + 1;
  var name = "entity.intent." + behaviorBucket + "." + targetBucket + "." + watchBucket + "." + lineageBucket;
  var cell = PS.atlas.cells[name];

  if (!cell) {
    cell = PS.atlas.allocateCell(name, 32, 16);
    PS.atlas.drawRepresentativeIntentCell(cell, behaviorBucket, targetBucket, watchBucket, lineageBucket);
    PS.atlas.stats.intentCells++;
    PS.atlas.pages[cell.pageIndex].version++;
  }

  return cell;
};
