import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";

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
    if (settlement >= 0.24 && route < Math.max(0.88, settlement + 0.32)) {
      type = "settlement";
      pressure = settlement;
    } else {
      type = "route";
      pressure = route || Number(civilization.pressure) || pressure;
    }
  } else if (civilization.type === "border") {
    if (settlement >= 0.24 && border < Math.max(0.82, settlement + 0.28)) {
      type = "settlement";
      pressure = settlement;
    } else {
      type = "border";
      pressure = border || Number(civilization.pressure) || pressure;
    }
  } else if (route >= settlement && route >= border) {
    if (settlement >= 0.24 && route < Math.max(0.88, settlement + 0.32)) {
      pressure = settlement;
    } else {
      type = "route";
      pressure = route;
    }
  } else if (border >= settlement && border >= route) {
    if (settlement >= 0.24 && border < Math.max(0.82, settlement + 0.28)) {
      pressure = settlement;
    } else {
      type = "border";
      pressure = border;
    }
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
  var visualVariant;

  if (!civilization) {
    return "civ0";
  }

  visualVariant = civilization.type === "settlement"
    ? (
      sample && sample.renderSettlementParcelFillOnly
        ? ".parcel.fill." + PS.atlas.getTerrainCivilizationParcelVariant(sample, civilization)
        : ".parcel." + PS.atlas.getTerrainCivilizationParcelVariant(sample, civilization)
    )
    : "";

  return "civ." + civilization.type + "." + civilization.bucket + "." + civilization.family + visualVariant;
};

PS.atlas.getTerrainCivilizationParcelVariant = function (sample, civilization) {
  var sampleX = Number.isFinite(Number(sample && sample.surfaceSampleX))
    ? Math.round(Number(sample.surfaceSampleX) * 4)
    : Math.round(Number(sample && sample.x) || 0) * 4;
  var sampleY = Number.isFinite(Number(sample && sample.surfaceSampleY))
    ? Math.round(Number(sample.surfaceSampleY) * 4)
    : Math.round(Number(sample && sample.y) || 0) * 4;
  var lineage = Math.max(1, Math.round(Number(civilization && civilization.lineageId) || 1));
  var pressure = Math.round(clamp(Number(civilization && civilization.pressure) || 0, 0, 1) * 11);
  var hash = Math.abs(sampleX * 73856093 + sampleY * 19349663 + lineage * 83492791 + pressure * 2654435761);

  return hash % 12;
};

PS.atlas.applyTerrainCivilizationPalette = function (palette, civilization) {
  if (!civilization) {
    return palette;
  }

  var family = String(civilization.family || "").toLowerCase();
  var material = {
    base: [122, 98, 74],
    accent: [214, 178, 112],
    dark: palette.dark,
    pattern: palette.pattern,
    blendMin: 0.18,
    blendMax: 0.42
  };
  var pressure;

  if (civilization.type === "route") {
    material.base = family === "canal" ? [74, 82, 78] : (family === "dock" ? [112, 86, 62] : [104, 78, 56]);
    material.accent = family === "canal" ? [112, 128, 120] : (family === "dock" ? [154, 118, 78] : [140, 104, 70]);
    material.blendMin = 0.82;
    material.blendMax = 0.94;
    material.pattern = family === "canal" ? "wave" : "workedGround";
  } else if (civilization.type === "border") {
    material.base = [96, 74, 58];
    material.accent = [132, 102, 72];
    material.blendMin = 0.78;
    material.blendMax = 0.90;
    material.pattern = "workedGround";
  } else if (family === "farm") {
    material.base = [94, 86, 64];
    material.accent = [112, 102, 68];
    material.dark = [
      Math.round(palette.dark[0] * 0.72 + 58 * 0.28),
      Math.round(palette.dark[1] * 0.72 + 62 * 0.28),
      Math.round(palette.dark[2] * 0.72 + 38 * 0.28)
    ];
    material.pattern = "workedGround";
    material.blendMin = 0.86;
    material.blendMax = 0.98;
  } else if (family === "block") {
    material.base = [78, 72, 66];
    material.accent = [98, 90, 76];
    material.dark = [
      Math.round(palette.dark[0] * 0.58 + 44 * 0.42),
      Math.round(palette.dark[1] * 0.58 + 48 * 0.42),
      Math.round(palette.dark[2] * 0.58 + 48 * 0.42)
    ];
    material.pattern = "settlementGround";
    material.blendMin = 0.90;
    material.blendMax = 1.00;
  } else if (family === "production") {
    material.base = [76, 68, 62];
    material.accent = [104, 82, 66];
    material.dark = [
      Math.round(palette.dark[0] * 0.48 + 34 * 0.52),
      Math.round(palette.dark[1] * 0.48 + 32 * 0.52),
      Math.round(palette.dark[2] * 0.48 + 30 * 0.52)
    ];
    material.pattern = "settlementGround";
    material.blendMin = 0.90;
    material.blendMax = 1.00;
  } else {
    material.base = [90, 78, 66];
    material.accent = [112, 96, 72];
    material.pattern = "settlementGround";
    material.blendMin = 0.88;
    material.blendMax = 1.00;
  }

  pressure = clamp(material.blendMin + civilization.pressure * (material.blendMax - material.blendMin), material.blendMin, material.blendMax);

  return {
    base: [
      Math.round(palette.base[0] * (1 - pressure) + material.base[0] * pressure),
      Math.round(palette.base[1] * (1 - pressure) + material.base[1] * pressure),
      Math.round(palette.base[2] * (1 - pressure) + material.base[2] * pressure)
    ],
    accent: [
      Math.round(palette.accent[0] * (1 - pressure) + material.accent[0] * pressure),
      Math.round(palette.accent[1] * (1 - pressure) + material.accent[1] * pressure),
      Math.round(palette.accent[2] * (1 - pressure) + material.accent[2] * pressure)
    ],
    dark: material.dark,
    pattern: material.pattern
  };
};

PS.atlas.withTerrainHeightAlpha = function (color, alpha) {
  if (!color) {
    return color;
  }

  return [
    color[0],
    color[1],
    color[2],
    clamp(Math.round(Number(alpha) || 0), 0, 255)
  ];
};

PS.atlas.getTerrainCivilizationReliefProfile = function (civilization) {
  var family = String(civilization && civilization.family || "").toLowerCase();

  if (civilization && civilization.type === "route") {
    if (family === "canal") {
      return { light: 152, warm: 136, shadow: 108, ground: 122 };
    }
    if (family === "dock") {
      return { light: 152, warm: 140, shadow: 118, ground: 130 };
    }
    return { light: 146, warm: 138, shadow: 122, ground: 130 };
  }

  if (civilization && civilization.type === "border") {
    return { light: 142, warm: 128, shadow: 110, ground: 122 };
  }

  if (family === "farm") {
    return { light: 176, warm: 152, shadow: 108, ground: 124 };
  }
  if (family === "block") {
    return { light: 210, warm: 174, shadow: 112, ground: 132 };
  }
  if (family === "production") {
    return { light: 220, warm: 180, shadow: 92, ground: 116 };
  }

  return { light: 188, warm: 158, shadow: 114, ground: 128 };
};

PS.atlas.getTerrainCivilizationBaseHeightAlpha = function (civilization, patternAmount) {
  var relief = PS.atlas.getTerrainCivilizationReliefProfile(civilization);
  var amount = Number(patternAmount) || 0;

  if (civilization && civilization.type === "settlement") {
    return clamp(Math.round(relief.ground + amount * 10), 104, 156);
  }

  return clamp(Math.round(relief.ground + amount * 32), 96, 176);
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

PS.atlas.mixTerrainCivilizationColor = function (color, ground, amount, alpha) {
  var blend = clamp(Number(amount) || 0, 0, 1);
  var base = ground || color;

  if (!color || !base) {
    return color;
  }

  return [
    Math.round(base[0] * (1 - blend) + color[0] * blend),
    Math.round(base[1] * (1 - blend) + color[1] * blend),
    Math.round(base[2] * (1 - blend) + color[2] * blend),
    clamp(Math.round(Number(alpha) || Number(base[3]) || 128), 0, 255)
  ];
};

PS.atlas.writeTerrainBrokenRect = function (cell, x, y, width, height, fill, shadow, variant) {
  var right = x + Math.max(1, Math.round(Number(width) || 1)) - 1;
  var bottom = y + Math.max(1, Math.round(Number(height) || 1)) - 1;
  var phase = Math.max(0, Math.round(Number(variant) || 0));
  var px;
  var py;
  var hash;

  for (py = y; py <= bottom; py++) {
    for (px = x; px <= right; px++) {
      hash = (px * 19 + py * 23 + phase * 29) & 15;
      if (hash <= 2) {
        continue;
      }
      PS.atlas.writePixel(cell, px, py, hash >= 13 && shadow ? shadow : fill);
    }
  }
};

PS.atlas.writeTerrainSolidRect = function (cell, x, y, width, height, fill, edge, variant) {
  var right = x + Math.max(1, Math.round(Number(width) || 1)) - 1;
  var bottom = y + Math.max(1, Math.round(Number(height) || 1)) - 1;
  var phase = Math.max(0, Math.round(Number(variant) || 0));
  var px;
  var py;
  var hash;

  for (py = y; py <= bottom; py++) {
    for (px = x; px <= right; px++) {
      hash = (px * 13 + py * 17 + phase * 19) & 31;
      if (edge && (px === x || px === right || py === y || py === bottom) && hash > 4) {
        PS.atlas.writePixel(cell, px, py, edge);
      } else {
        PS.atlas.writePixel(cell, px, py, fill);
      }
    }
  }
};

PS.atlas.writeTerrainDistrictBase = function (cell, fill, edge, phase) {
  var x;
  var y;
  var hash;

  for (y = 0; y < 16; y += 1) {
    for (x = 0; x < 16; x += 1) {
      hash = (x * 7 + y * 11 + phase * 13) & 31;
      PS.atlas.writePixel(cell, x, y, edge && hash <= 1 ? edge : fill);
    }
  }
};

PS.atlas.writeTerrainDistrictFlatBase = function (cell, fill) {
  var x;
  var y;
  var ground = PS.atlas.warmTerrainCivilizationPixel(fill);

  for (y = 0; y < 16; y += 1) {
    for (x = 0; x < 16; x += 1) {
      PS.atlas.writePixel(cell, x, y, ground);
    }
  }
};

PS.atlas.warmTerrainCivilizationPixel = function (rgba) {
  if (!rgba) {
    return rgba;
  }

  return [
    clamp(Math.max(Math.round(Number(rgba[0]) || 0), Math.round((Number(rgba[1]) || 0) * 0.96), Math.round((Number(rgba[2]) || 0) * 0.94)), 0, 255),
    clamp(Math.round((Number(rgba[1]) || 0) * 0.92), 0, 255),
    clamp(Math.round((Number(rgba[2]) || 0) * 0.84), 0, 255),
    clamp(Math.round(Number(rgba[3]) || 255), 0, 255)
  ];
};

PS.atlas.writeTerrainDistrictGround = function (cell, civilization, fill, shadow, ground, phase, parcelVariant) {
  var family = String(civilization && civilization.family || "").toLowerCase();
  var offset = Math.max(0, Math.round(Number(parcelVariant) || 0));
  var edge = shadow || ground || fill;
  var sparse = PS.atlas.mixTerrainCivilizationColor(fill, ground, 0.42, Math.max(96, Number(ground && ground[3]) || 122));

  PS.atlas.writeTerrainDistrictBase(cell, ground || fill, null, phase + offset);

  if (family === "farm") {
    PS.atlas.writeTerrainSolidRect(cell, 2 + ((phase + offset) % 4), 3 + (offset % 3), 4, 2, sparse, ground, phase + offset);
    if (offset % 3 === 0) {
      PS.atlas.writeTerrainSolidRect(cell, 9, 10 + (phase % 2), 3, 1, sparse, ground, phase + offset + 2);
    }
    return;
  }

  if (family === "block") {
    PS.atlas.writeTerrainSolidRect(cell, 3 + ((phase + offset) % 4), 3 + (offset % 2), 3, 2, sparse, shadow, phase + offset);
    if (offset % 4 === 1) {
      PS.atlas.writeTerrainSolidRect(cell, 10, 9 + (phase % 2), 2, 2, sparse, shadow, phase + offset + 2);
    }
    return;
  }

  if (family === "production") {
    PS.atlas.writeTerrainSolidRect(cell, 4 + (offset % 3), 5, 3, 2, sparse, shadow, phase + offset);
    if (offset % 2 === 0) {
      PS.atlas.writeTerrainSolidRect(cell, 9 - (phase % 2), 10, 3, 1, sparse, shadow, phase + offset + 2);
    }
    return;
  }

  if ((phase + offset) % 2 === 0) {
    PS.atlas.writeTerrainSolidRect(cell, 4 + ((phase + offset) % 4), 5 + (offset % 3), 3, 2, sparse, shadow, phase + offset);
  }
  if (offset === 1) {
    PS.atlas.writeTerrainSolidRect(cell, 10, 11, 2, 1, sparse, shadow, phase + offset + 2);
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
  var districtGround = null;
  var phase = clamp(Math.round(Number(variant) || 0), 0, 15);
  var relief = civilization ? PS.atlas.getTerrainCivilizationReliefProfile(civilization) : null;
  var i;
  var x;
  var y;
  var sampleX = Number.isFinite(Number(sample && sample.surfaceSampleX)) ? Number(sample.surfaceSampleX) : Number(sample && sample.x) || 0;
  var sampleY = Number.isFinite(Number(sample && sample.surfaceSampleY)) ? Number(sample.surfaceSampleY) : Number(sample && sample.y) || 0;
  var parcelVariant = Math.abs(Math.round(sampleX * 11 + sampleY * 17 + phase * 3)) % 6;

  if (!civilization) {
    return;
  }

  light = PS.atlas.withTerrainHeightAlpha(light, relief.light);
  warm = PS.atlas.withTerrainHeightAlpha(warm, relief.warm);
  shadow = PS.atlas.withTerrainHeightAlpha(shadow, relief.shadow);
  if (civilization.type === "settlement" || civilization.type === "route" || civilization.type === "border") {
    ground = [
      palette.base[0],
      palette.base[1],
      palette.base[2],
      255
    ];
  }
  ground = PS.atlas.withTerrainHeightAlpha(ground, relief.ground);
  if (civilization.type === "settlement") {
    light = PS.atlas.mixTerrainCivilizationColor(light, ground, 0.20, relief.ground + 10);
    warm = PS.atlas.mixTerrainCivilizationColor(warm, ground, 0.24, relief.ground + 8);
    shadow = PS.atlas.mixTerrainCivilizationColor(shadow, ground, 0.28, relief.ground - 10);
  }
  districtGround = PS.atlas.withTerrainHeightAlpha([
    Math.round(ground[0] * 0.18 + palette.base[0] * 0.82),
    Math.round(ground[1] * 0.18 + palette.base[1] * 0.82),
    Math.round(ground[2] * 0.18 + palette.base[2] * 0.82)
  ], relief.ground);

  if (civilization.type === "settlement") {
    PS.atlas.writeTerrainDistrictFlatBase(cell, ground);
    return;
  }

  if (civilization.type === "route") {
    var routeSettlementDensity = Math.max(
      Number(sample && sample.detail && sample.detail.materialSignals && sample.detail.materialSignals.settlementDensity) || 0,
      Number(sample && sample.civilization && sample.civilization.settlementPressure) || 0
    );
    if (routeSettlementDensity >= 0.24) {
      PS.atlas.writeTerrainDistrictFlatBase(cell, ground);
      return;
    }
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

  if (civilization.type === "border") {
    PS.atlas.writeTerrainDistrictFlatBase(cell, ground);
    return;
  }

  for (i = 0; i < 3 + civilization.bucket; i++) {
    x = (phase * 3 + i * 5) % 16;
    y = (phase + i * 4) % 16;
    PS.atlas.writePixel(cell, x, y, light);
    PS.atlas.writePixel(cell, Math.min(15, x + 1), y, shadow);
  }
};
