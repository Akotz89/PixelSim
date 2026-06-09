"use strict";
function getPlanetLocalReferenceGridInfo(targetPixels) {
  return PS.render.reference.getLocalGridInfo(targetPixels);
}

function drawPlanetLocalCurvatureOverlay() {
  return PS.render.reference.drawLocalCurvature();
}

function drawPlanetLocalReferenceGrid() {
  return PS.render.reference.drawLocalGrid();
}

function drawPlanetScaleBar() {
  return PS.render.reference.drawScaleBar();
}

function drawPlanetReferenceGrid() {
  return PS.render.reference.draw();
}

window.buildTerrainCache = function () {
  return PS.render && PS.render.terrain && typeof PS.render.terrain.buildCache === "function"
    ? PS.render.terrain.buildCache()
    : null;
};
window.invalidateTerrainCache = function () {
  return PS.render && PS.render.terrain && typeof PS.render.terrain.invalidateCache === "function"
    ? PS.render.terrain.invalidateCache()
    : true;
};
window.getLocalSurfaceRenderCacheStats = function () {
  return {
    chunks: 0,
    lastVisibleChunks: 0,
    lastPendingChunks: 0,
    lastGeneratedThisPass: 0,
    lastFallbackChunks: 0
  };
};

window.drawWorld = function() {
  if (window.PS && PS.render && PS.render.pipeline && typeof PS.render.pipeline.drawWorld === "function") {
    PS.render.pipeline.drawWorld();
    return;
  }

  if (PS.render && PS.render.terrain && typeof PS.render.terrain.draw === "function") {
    PS.render.terrain.draw();
  }

  if (window.PS && PS.render && PS.render.overlays) {
    PS.render.overlays.drawOrbitalAssets();
    PS.render.overlays.drawPlanetaryBodies();
    PS.render.overlays.drawProbeMissions();
    PS.render.overlays.drawEmpireSectors();
    PS.render.overlays.drawInterstellarFleets();
    PS.render.overlays.drawEmpireLegacy();
    PS.render.overlays.drawStarSystems();
  }

  if (window.PS && PS.render && PS.render.overlays) {
    PS.render.overlays.drawInspectSelection();
    PS.render.overlays.drawScanlines();
  }
};
