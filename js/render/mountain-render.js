import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";

PS.render = PS.render || {};

PS.render.mountains = PS.render.mountains || (function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function getSignals(sample) {
    return sample && sample.detail && sample.detail.materialSignals ? sample.detail.materialSignals : {};
  }

  function isMountainSample(sample, biome) {
    var detail = sample && sample.detail ? sample.detail : {};
    var signals = getSignals(sample);
    var biomeKey = String(biome || sample && sample.biome || "").toLowerCase();
    var surface = String(detail.surface || sample && sample.surface || "").toLowerCase();
    var feature = String(detail.feature || sample && sample.feature || "").toLowerCase();

    return biomeKey === "highland" ||
      biomeKey === "mountain" ||
      biomeKey === "mountains" ||
      surface.indexOf("mountain") >= 0 ||
      surface.indexOf("cliff") >= 0 ||
      surface.indexOf("ridge") >= 0 ||
      feature.indexOf("ridge") >= 0 ||
      Number(signals.highlandLift) > 0.48 ||
      Number(signals.elevation) > 0.72 ||
      Number(detail.elevation) > 0.72 && surface.indexOf("rock") >= 0;
  }

  function getVariant(tileX, tileY, salt, max) {
    var variants = Math.max(1, Math.round(Number(max) || 1));
    if (PS.ranmap && typeof PS.ranmap.variant === "function") {
      return PS.ranmap.variant(Number(tileX) + (Number(salt) || 0), tileY, variants);
    }
    return Math.abs(Math.round(Number(tileX) || 0) * 31 + Math.round(Number(tileY) || 0) * 17 + (Number(salt) || 0)) % variants;
  }

  function getFormationInfo(tileX, tileY, sample, biome) {
    var x = Math.round(Number(tileX) || 0);
    var y = Math.round(Number(tileY) || 0);
    var localX = ((x % 3) + 3) % 3;
    var localY = ((y % 3) + 3) % 3;
    var centerDistance = Math.abs(localX - 1) + Math.abs(localY - 1);
    var signals = getSignals(sample);
    var snow = Math.max(
      Number(signals.snow) || 0,
      String(biome || sample && sample.biome || "").toLowerCase() === "ice" ? 0.7 : 0,
      String(sample && sample.detail && sample.detail.surface || "").toLowerCase().indexOf("snow") >= 0 ? 0.85 : 0
    );
    var height = Math.max(
      Number(signals.elevation) || 0,
      Number(sample && sample.detail && sample.detail.elevation) || 0,
      Number(sample && sample.highlandLift) || 0.62
    );
    var heightUnits = Math.max(18, Math.min(31, Math.round(22 + height * 8 - centerDistance * 2)));
    var edgeMask = 0;

    if (localY === 0) { edgeMask |= 8; }
    if (localX === 2) { edgeMask |= 1; }
    if (localY === 2) { edgeMask |= 4; }
    if (localX === 0) { edgeMask |= 2; }

    return {
      anchorX: x - localX,
      anchorY: y - localY,
      localX: localX,
      localY: localY,
      centerDistance: centerDistance,
      isPeak: centerDistance === 0,
      edgeMask: edgeMask,
      heightUnits: heightUnits,
      snow: clamp(snow + (centerDistance === 0 ? 0.24 : 0), 0, 1),
      baseVariant: getVariant(x, y, 11, 4),
      capVariant: getVariant(x, y, 19, 4),
      snowVariant: getVariant(x, y, 23, 4),
      cliffShade: localY === 0 ? "north-dark" : (localY === 2 ? "south-light" : "mid")
    };
  }

  function selectTerrainCell(material, variant, fallbackCell, use) {
    var selected;

    if (!PS.assets || !PS.assets.terrainMaterials || typeof PS.assets.terrainMaterials.selectCell !== "function") {
      return null;
    }

    selected = PS.assets.terrainMaterials.selectCell(material, variant, use || "mountain", fallbackCell && fallbackCell.name ? fallbackCell.name : "");
    return selected && selected.renderCell ? selected.renderCell : null;
  }

  function appendSurfaceCell(target, cell, screenX, screenY, width, height, alpha, flipShade) {
    var page;

    if (!target || !cell || !PS.render.surfaceTileBatcher || typeof PS.render.surfaceTileBatcher.getPageBuffer !== "function") {
      return false;
    }

    page = PS.render.surfaceTileBatcher.getPageBuffer(target, cell.pageIndex);
    PS.render.surfaceTileBatcher.appendInstance(
      page,
      screenX,
      screenY,
      width,
      height,
      cell.u0,
      cell.v0,
      cell.u1,
      cell.v1,
      alpha,
      Number(flipShade) || 0,
      cell.splitAtlas,
      null
    );
    target.count++;
    target.mountainOverlays = (target.mountainOverlays || 0) + 1;
    if (target.materialCounts) {
      target.materialCounts[cell.name] = (target.materialCounts[cell.name] || 0) + 1;
    }
    return true;
  }

  function appendMountainShadow(target, info, screenX, screenY, samplePixelSize, alpha, policy) {
    if (!target || !target.shadowRects || !PS.render.shadows || typeof PS.render.shadows.appendStampedRects !== "function") {
      return 0;
    }

    return PS.render.shadows.appendStampedRects(target.shadowRects, {
      x: screenX + samplePixelSize * 0.05,
      y: screenY + samplePixelSize * 0.42,
      width: samplePixelSize * 1.18,
      rectHeight: samplePixelSize * 0.48,
      heightUnits: info.heightUnits,
      alpha: Math.min(0.52, 0.32 * (Number(alpha) || 1)),
      mode: "hard",
      maxIterations: policy && policy.shadowIterations !== undefined ? policy.shadowIterations : undefined,
      distance2Ground: info.isPeak ? samplePixelSize * 0.42 : samplePixelSize * 0.18,
      color: [0.012, 0.018, 0.028]
    });
  }

  function appendMountain(target, sample, biome, tileX, tileY, screenX, screenY, samplePixelSize, alpha, lodState, fallbackCell) {
    var policy = PS.render.surfaceTileBatcher && typeof PS.render.surfaceTileBatcher.getVisualPolicy === "function"
      ? PS.render.surfaceTileBatcher.getVisualPolicy(lodState)
      : {};
    var info;
    var baseCell;
    var capCell;
    var snowCell;
    var drawAlpha = clamp(alpha === undefined ? 1 : alpha, 0, 1);
    var shadeBias;
    var appended = 0;

    if (!isMountainSample(sample, biome) || policy.mountainOverlays === "disabled") {
      return 0;
    }

    info = getFormationInfo(tileX, tileY, sample, biome);
    baseCell = selectTerrainCell("mountain", info.baseVariant + (info.edgeMask ? 4 : 0), fallbackCell, "mountainCliff");
    if (!baseCell) {
      baseCell = selectTerrainCell("rock", info.baseVariant, fallbackCell, "mountainCliff");
    }
    shadeBias = info.cliffShade === "north-dark" ? 0.34 : (info.cliffShade === "south-light" ? 0.08 : 0.18);

    if (baseCell && appendSurfaceCell(target, baseCell, screenX, screenY, samplePixelSize, samplePixelSize, drawAlpha, shadeBias)) {
      appended++;
    }

    if (info.isPeak) {
      capCell = selectTerrainCell("mountain", info.capVariant + 3, fallbackCell, "mountainPeak");
      if (capCell && appendSurfaceCell(target, capCell, screenX, screenY - samplePixelSize * 0.42, samplePixelSize, samplePixelSize * 0.62, drawAlpha, 0.05)) {
        appended++;
      }
    }

    if (info.snow >= 0.45) {
      snowCell = selectTerrainCell("snow", info.snowVariant, fallbackCell, "mountainSnow");
      if (snowCell && appendSurfaceCell(target, snowCell, screenX, screenY - (info.isPeak ? samplePixelSize * 0.34 : 0), samplePixelSize, info.isPeak ? samplePixelSize * 0.54 : samplePixelSize * 0.38, drawAlpha * Math.min(0.82, info.snow), 0)) {
        appended++;
      }
    }

    if (appended > 0) {
      target.mountainTiles = (target.mountainTiles || 0) + 1;
      target.mountainShadowRects = (target.mountainShadowRects || 0) + appendMountainShadow(target, info, screenX, screenY, samplePixelSize, drawAlpha, policy);
    }

    return appended;
  }

  return {
    isMountainSample: isMountainSample,
    getFormationInfo: getFormationInfo,
    selectTerrainCell: selectTerrainCell,
    appendMountain: appendMountain
  };
}());
