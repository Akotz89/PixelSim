"use strict";
PS.atlas = PS.atlas || {};

PS.atlas.getTerrainCivilizationFamily = function (type, civilization, pressure) {
  var family = String(civilization && civilization.family || "").toLowerCase();

  if (type === "route") {
    if (family === "road" || family === "canal" || family === "dock" || family === "track") {
      return family;
    }
    if (Number(civilization && civilization.waterPressure) > 0.45) {
      return "canal";
    }
    if (Number(civilization && civilization.dockPressure) > 0.45) {
      return "dock";
    }
    return pressure >= 0.52 ? "road" : "track";
  }

  if (type === "border") {
    return "border";
  }

  if (family === "farm" || family === "yard" || family === "block" || family === "dock" || family === "production") {
    return family;
  }
  if (Number(civilization && civilization.productionPressure) > 0.42) {
    return "production";
  }
  if (Number(civilization && civilization.farmPressure) > 0.42) {
    return "farm";
  }
  if (civilization && (civilization.isColony || Number(civilization.level) >= 4 || pressure >= 0.78)) {
    return "block";
  }
  return "yard";
};

PS.atlas.getTerrainCivilizationInfo = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var signals = detail.materialSignals || {};
  var civilization = sample && sample.civilization ? sample.civilization : {};
  var settlement = Math.max(
    Number(signals.settlementDensity) || 0,
    Number(civilization.settlementPressure) || 0,
    civilization.type === "settlement" ? Number(civilization.pressure) || 0 : 0
  );
  var route = Math.max(
    Number(signals.routeTraffic) || 0,
    Number(civilization.routePressure) || 0,
    civilization.type === "route" ? Number(civilization.pressure) || 0 : 0
  );
  var border = Math.max(
    Number(signals.borderInfluence) || 0,
    Number(civilization.borderPressure) || 0,
    civilization.type === "border" ? Number(civilization.pressure) || 0 : 0
  );
  var pressure = Math.max(settlement, route, border);
  var type = "settlement";

  if (pressure < 0.18) {
    return null;
  }

  if (civilization.type === "settlement") {
    type = "settlement";
    pressure = settlement || Number(civilization.pressure) || pressure;
  } else if (civilization.type === "route") {
    type = "route";
    pressure = route || Number(civilization.pressure) || pressure;
  } else if (civilization.type === "border") {
    type = "border";
    pressure = border || Number(civilization.pressure) || pressure;
  } else if (route >= settlement && route >= border) {
    type = "route";
    pressure = route;
  } else if (border >= settlement && border >= route) {
    type = "border";
    pressure = border;
  } else {
    pressure = settlement;
  }

  return {
    type: type,
    bucket: clamp(Math.floor(clamp(pressure, 0, 1) * 4), 1, 3),
    pressure: clamp(pressure, 0, 1),
    family: PS.atlas.getTerrainCivilizationFamily(type, civilization, pressure),
    lineageId: Math.max(1, Math.round(Number(civilization.lineageId) || 1))
  };
};

PS.atlas.getTerrainCivilizationKey = function (sample) {
  var civilization = PS.atlas.getTerrainCivilizationInfo(sample);

  if (!civilization) {
    return "civ0";
  }

  return "civ." + civilization.type + "." + civilization.bucket + "." + civilization.family;
};

PS.atlas.applyTerrainCivilizationPalette = function (palette, civilization) {
  if (!civilization) {
    return palette;
  }

  var builtBase = civilization.type === "route" ? [130, 102, 70] : (civilization.type === "border" ? [82, 96, 132] : [118, 96, 76]);
  var builtAccent = civilization.type === "route" ? [220, 188, 122] : (civilization.type === "border" ? [154, 184, 232] : [214, 178, 112]);
  var pressure = clamp(0.14 + civilization.pressure * 0.22, 0, 0.38);

  return {
    base: [
      Math.round(palette.base[0] * (1 - pressure) + builtBase[0] * pressure),
      Math.round(palette.base[1] * (1 - pressure) + builtBase[1] * pressure),
      Math.round(palette.base[2] * (1 - pressure) + builtBase[2] * pressure)
    ],
    accent: [
      Math.round(palette.accent[0] * (1 - pressure) + builtAccent[0] * pressure),
      Math.round(palette.accent[1] * (1 - pressure) + builtAccent[1] * pressure),
      Math.round(palette.accent[2] * (1 - pressure) + builtAccent[2] * pressure)
    ],
    dark: palette.dark,
    pattern: palette.pattern
  };
};

PS.atlas.writeTerrainRect = function (cell, x, y, width, height, fill, edge) {
  var right = x + Math.max(1, Math.round(Number(width) || 1)) - 1;
  var bottom = y + Math.max(1, Math.round(Number(height) || 1)) - 1;
  var px;
  var py;

  for (py = y; py <= bottom; py++) {
    for (px = x; px <= right; px++) {
      PS.atlas.writePixel(cell, px, py, edge && (px === x || py === y || px === right || py === bottom) ? edge : fill);
    }
  }
};

PS.atlas.writeTerrainFoundationRect = function (cell, x, y, width, height, fill, edge, ground, variant) {
  var right = x + Math.max(1, Math.round(Number(width) || 1)) - 1;
  var bottom = y + Math.max(1, Math.round(Number(height) || 1)) - 1;
  var phase = clamp(Math.round(Number(variant) || 0), 0, 15);
  var px;
  var py;
  var isEdge;

  for (py = y; py <= bottom; py++) {
    for (px = x; px <= right; px++) {
      isEdge = px === x || py === y || px === right || py === bottom;
      if (isEdge && ground && (px * 3 + py * 5 + phase) % 4 !== 0) {
        PS.atlas.writePixel(cell, px, py, ground);
      } else {
        PS.atlas.writePixel(cell, px, py, isEdge && edge ? edge : fill);
      }
    }
  }
};

PS.atlas.drawTerrainCivilizationMarks = function (cell, palette, variant, sample) {
  var civilization = PS.atlas.getTerrainCivilizationInfo(sample);
  var light = civilization ? PS.atlas.getTerrainDetailColor(palette, "light") : null;
  var warm = civilization ? PS.atlas.getTerrainDetailColor(palette, "warm") : null;
  var shadow = civilization ? PS.atlas.getTerrainDetailColor(palette, "shadow") : null;
  var ground = civilization && typeof PS.atlas.getTerrainOverlayGroundColor === "function"
    ? PS.atlas.getTerrainOverlayGroundColor(sample, palette)
    : null;
  var phase = clamp(Math.round(Number(variant) || 0), 0, 15);
  var i;
  var x;
  var y;

  if (!civilization) {
    return;
  }

  if (civilization.type === "settlement") {
    if (civilization.family === "farm") {
      for (i = 0; i < 4; i++) {
        PS.atlas.writeTerrainDash(cell, 2, 3 + i * 2, 11, true, i % 2 ? warm : shadow);
      }
      PS.atlas.writeTerrainFoundationRect(cell, 10, 9, 3, 3, warm, shadow, ground, phase);
    } else if (civilization.family === "production") {
      PS.atlas.writeTerrainFoundationRect(cell, 3, 4, 5, 4, warm, shadow, ground, phase);
      PS.atlas.writeTerrainFoundationRect(cell, 9, 7, 4, 3, warm, shadow, ground, phase + 2);
      PS.atlas.writeTerrainDash(cell, 4, 11, 8, true, shadow);
      PS.atlas.writePixel(cell, 11, 4, light);
      PS.atlas.writePixel(cell, 11, 5, light);
      PS.atlas.writePixel(cell, 12, 4, shadow);
    } else if (civilization.family === "dock") {
      PS.atlas.writeTerrainDash(cell, 2, 10, 12, true, shadow);
      PS.atlas.writeTerrainDash(cell, 5, 6, 7, false, warm);
      PS.atlas.writeTerrainFoundationRect(cell, 9, 4, 4, 3, warm, shadow, ground, phase);
    } else {
      PS.atlas.writeTerrainFoundationRect(cell, 3, 4, 4, 4, warm, shadow, ground, phase);
      PS.atlas.writeTerrainFoundationRect(cell, 9, 5, 3, 3, warm, shadow, ground, phase + 1);
      if (civilization.family === "block" || civilization.bucket >= 3) {
        PS.atlas.writeTerrainFoundationRect(cell, 5, 10, 6, 3, warm, shadow, ground, phase + 2);
        PS.atlas.writeTerrainDash(cell, 8, 2, 12, false, shadow);
      }
      PS.atlas.writeTerrainDash(cell, 2, 9, 12, true, shadow);
    }
    return;
  }

  if (civilization.type === "route") {
    y = 6 + (phase % 4);
    if (civilization.family === "canal") {
      PS.atlas.writeTerrainDash(cell, 1, y, 14, true, light);
      PS.atlas.writeTerrainDash(cell, 2, y + 1, 11, true, shadow);
    } else if (civilization.family === "dock") {
      PS.atlas.writeTerrainDash(cell, 1, y, 13, true, shadow);
      PS.atlas.writeTerrainDash(cell, 4, Math.max(0, y - 2), 5, false, warm);
      PS.atlas.writeTerrainDash(cell, 9, y + 1, 4, false, warm);
    } else {
      PS.atlas.writeTerrainDash(cell, 1, y, 14, true, shadow);
      PS.atlas.writeTerrainDash(cell, 2, y + 1, 11, true, warm);
    }
    if (civilization.bucket >= 2) {
      PS.atlas.writePixel(cell, 5, Math.max(0, y - 1), light);
      PS.atlas.writePixel(cell, 10, Math.min(15, y + 2), light);
    }
    if (civilization.bucket >= 3) {
      PS.atlas.writePixel(cell, 7, y, light);
      PS.atlas.writePixel(cell, 8, y + 1, light);
    }
    return;
  }

  for (i = 0; i < 3 + civilization.bucket; i++) {
    x = (phase * 3 + i * 5) % 16;
    y = (phase + i * 4) % 16;
    PS.atlas.writePixel(cell, x, y, light);
    PS.atlas.writePixel(cell, Math.min(15, x + 1), y, shadow);
  }
};
