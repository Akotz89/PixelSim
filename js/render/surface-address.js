import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getSurfaceMeterCoordinate } from "./planet-surface.js";
import { getLatLonFromSurfaceMeterCoordinate, getPlanetSurfaceLodZoomIndex, getPlanetView, getPlanetViewPanVector, getPlanetViewScale, getPlanetZoomLevel } from "./planet-view.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";
import { canvas } from "../ui/dom-refs.js";

PS.render = PS.render || {};
PS.render.surface = PS.render.surface || {};

PS.render.surface.getLocalAddress = function (gridX, gridY) {
  var scale = getPlanetViewScale();
  var screenX = (Number(gridX) + 0.5) * CONFIG.TILE_SIZE;
  var screenY = (Number(gridY) + 0.5) * CONFIG.TILE_SIZE;
  var meters = PS.camera && PS.camera.unified
    ? PS.camera.unified.screenToSurfaceMeters(screenX, screenY)
    : null;
  var viewMeters = PS.camera && PS.camera.unified
    ? PS.camera.unified.getCenterSurfaceMeters()
    : getSurfaceMeterCoordinate(getPlanetView().latitude, getPlanetView().longitude);
  var latLon = meters
    ? PS.camera.unified.getLatLonFromSurfaceMeters(meters.eastMeters, meters.northMeters)
    : getLatLonFromSurfaceMeterCoordinate(viewMeters.eastMeters, viewMeters.northMeters);

  if (!meters) {
    meters = {
      eastMeters: viewMeters.eastMeters + (Number(gridX) - WORLD_WIDTH / 2 + 0.5) * scale.metersPerSample,
      northMeters: viewMeters.northMeters - (Number(gridY) - WORLD_HEIGHT / 2 + 0.5) * scale.metersPerSample
    };
    latLon = getLatLonFromSurfaceMeterCoordinate(meters.eastMeters, meters.northMeters);
  }

  return {
    latitude: latLon.latitude,
    longitude: latLon.longitude,
    eastKm: (meters.eastMeters - viewMeters.eastMeters) / 1000,
    northKm: (meters.northMeters - viewMeters.northMeters) / 1000,
    eastMeters: meters.eastMeters,
    northMeters: meters.northMeters,
    address: PS.render.surface.getSampleAddress(latLon.latitude, latLon.longitude)
  };
};

PS.render.surface.makeChunkAddress = function (zoomLevelIndex, chunkX, chunkY) {
  var scale = getPlanetZoomLevel(
    typeof zoomLevelIndex === "number" ? zoomLevelIndex : getPlanetSurfaceLodZoomIndex(getPlanetView().zoomLevel)
  );
  var chunkSamples = PS.render.surface.getChunkSampleCount();
  var sampleMeters = Math.max(0.1, scale.metersPerSample);
  var normalizedChunkX = Math.round(Number(chunkX) || 0);
  var normalizedChunkY = Math.round(Number(chunkY) || 0);
  var chunkKey = [
    scale.index,
    sampleMeters,
    chunkSamples,
    normalizedChunkX,
    normalizedChunkY
  ].join(":");

  return {
    zoomLevel: scale.index,
    scaleName: scale.name,
    sampleMeters: sampleMeters,
    chunkSamples: chunkSamples,
    sampleEast: normalizedChunkX * chunkSamples,
    sampleNorth: normalizedChunkY * chunkSamples,
    chunkX: normalizedChunkX,
    chunkY: normalizedChunkY,
    localSampleX: 0,
    localSampleY: 0,
    chunkKey: chunkKey,
    sampleKey: "0:0"
  };
};

PS.render.surface.getChunkCenterLatLon = function (address) {
  var centerEastMeters = (address.sampleEast + address.chunkSamples / 2) * address.sampleMeters;
  var centerNorthMeters = (address.sampleNorth + address.chunkSamples / 2) * address.sampleMeters;

  return getLatLonFromSurfaceMeterCoordinate(centerEastMeters, centerNorthMeters);
};

PS.render.surface.getChunkParentAddress = function (address, parentZoomLevelIndex) {
  var targetZoomLevel = typeof parentZoomLevelIndex === "number"
    ? parentZoomLevelIndex
    : address.zoomLevel - 1;
  var center = PS.render.surface.getChunkCenterLatLon(address);

  if (targetZoomLevel < 0 || targetZoomLevel >= address.zoomLevel) {
    return null;
  }

  return PS.render.surface.getSampleAddress(center.latitude, center.longitude, targetZoomLevel);
};

PS.render.surface.getChunkLineage = function (address) {
  var lineage = [];

  for (var zoomLevel = address.zoomLevel - 1; zoomLevel >= 0; zoomLevel--) {
    var parentAddress = PS.render.surface.getChunkParentAddress(address, zoomLevel);

    if (parentAddress) {
      lineage.push({
        zoomLevel: parentAddress.zoomLevel,
        scaleName: parentAddress.scaleName,
        sampleMeters: parentAddress.sampleMeters,
        chunkX: parentAddress.chunkX,
        chunkY: parentAddress.chunkY,
        chunkKey: parentAddress.chunkKey
      });
    }
  }

  return lineage;
};

PS.render.surface.getChunkLineageLabel = function (lineage) {
  if (!Array.isArray(lineage) || lineage.length === 0) {
    return "-";
  }

  return lineage.map(function (item) {
    return item.scaleName + " " + item.chunkX + "," + item.chunkY;
  }).join(" <- ");
};

PS.render.surface.getChunkScreenRect = function (address) {
  var currentScale = getPlanetViewScale();
  var samplePixelSize = CONFIG.TILE_SIZE * (address.sampleMeters / Math.max(0.1, currentScale.metersPerSample));
  var minEastMeters = address.sampleEast * address.sampleMeters;
  var maxNorthMeters = (address.sampleNorth + address.chunkSamples) * address.sampleMeters;
  var sizePixels = address.chunkSamples * samplePixelSize;
  var screenPoint = PS.camera && PS.camera.unified
    ? PS.camera.unified.surfaceMetersToScreen(minEastMeters, maxNorthMeters)
    : null;

  if (!screenPoint) {
    var viewMeters = getSurfaceMeterCoordinate(getPlanetView().latitude, getPlanetView().longitude);

    screenPoint = {
      screenX: canvas.width / 2 + ((minEastMeters - viewMeters.eastMeters) / currentScale.metersPerSample) * CONFIG.TILE_SIZE,
      screenY: canvas.height / 2 - ((maxNorthMeters - viewMeters.northMeters) / currentScale.metersPerSample) * CONFIG.TILE_SIZE
    };
  }

  return {
    x: screenPoint.screenX,
    y: screenPoint.screenY,
    width: sizePixels,
    height: sizePixels,
    samplePixelSize: samplePixelSize
  };
};

PS.render.surface.getChunkScreenPriority = function (screenRect) {
  var centerX = (Number(screenRect.x) || 0) + (Number(screenRect.width) || 0) / 2;
  var centerY = (Number(screenRect.y) || 0) + (Number(screenRect.height) || 0) / 2;
  var deltaX = centerX - canvas.width / 2;
  var deltaY = centerY - canvas.height / 2;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
};

PS.render.surface.getChunkPriorityScore = function (screenRect) {
  var priorityDistance = PS.render.surface.getChunkScreenPriority(screenRect);
  var panVector = getPlanetViewPanVector();
  var centerX = (Number(screenRect.x) || 0) + (Number(screenRect.width) || 0) / 2;
  var centerY = (Number(screenRect.y) || 0) + (Number(screenRect.height) || 0) / 2;
  var deltaX = centerX - canvas.width / 2;
  var deltaNorthPixels = canvas.height / 2 - centerY;
  var aheadPixels = deltaX * panVector.eastUnit + deltaNorthPixels * panVector.northUnit;
  var directionalBoost = panVector.magnitude > 0
    ? clamp(aheadPixels / Math.max(1, Math.max(canvas.width, canvas.height) * 0.42), 0, 1) * Math.max(CONFIG.TILE_SIZE, Math.min(canvas.width, canvas.height) * 0.16)
    : 0;

  return Math.max(0, priorityDistance - directionalBoost);
};

PS.render.surface.getInteractiveVisibleChunks = function (guardSamples, visibleChunkLimit) {
  var normalizedGuardSamples = Math.max(1, Math.round(Number(guardSamples) || 1));
  var centerAddress = PS.render.surface.getLocalAddress(WORLD_WIDTH / 2, WORLD_HEIGHT / 2).address;
  var radius = Math.max(
    2,
    Math.ceil(Math.sqrt(Math.max(1, visibleChunkLimit))) + normalizedGuardSamples
  );
  var candidates = [];
  var visibleChunks = [];

  for (var chunkY = centerAddress.chunkY - radius; chunkY <= centerAddress.chunkY + radius; chunkY++) {
    for (var chunkX = centerAddress.chunkX - radius; chunkX <= centerAddress.chunkX + radius; chunkX++) {
      var address = PS.render.surface.makeChunkAddress(centerAddress.zoomLevel, chunkX, chunkY);
      var screenRect = PS.render.surface.getChunkScreenRect(address);

      if (
        screenRect.x > canvas.width + CONFIG.TILE_SIZE ||
        screenRect.x + screenRect.width < -CONFIG.TILE_SIZE ||
        screenRect.y > canvas.height + CONFIG.TILE_SIZE ||
        screenRect.y + screenRect.height < -CONFIG.TILE_SIZE
      ) {
        continue;
      }

      candidates.push({
        address: address,
        screenX: screenRect.x,
        screenY: screenRect.y,
        width: screenRect.width,
        height: screenRect.height,
        priorityDistance: PS.render.surface.getChunkScreenPriority(screenRect),
        priorityScore: PS.render.surface.getChunkPriorityScore(screenRect)
      });
    }
  }

  candidates.sort(function (a, b) {
    if (a.priorityScore !== b.priorityScore) {
      return a.priorityScore - b.priorityScore;
    }

    if (a.priorityDistance !== b.priorityDistance) {
      return a.priorityDistance - b.priorityDistance;
    }

    if (a.address.chunkY !== b.address.chunkY) {
      return a.address.chunkY - b.address.chunkY;
    }

    return a.address.chunkX - b.address.chunkX;
  });

  visibleChunks = candidates.slice(0, visibleChunkLimit);
  visibleChunks.totalCandidateChunks = candidates.length;
  visibleChunks.workingSetLimit = visibleChunkLimit;
  visibleChunks.culledChunks = Math.max(0, candidates.length - visibleChunks.length);
  return visibleChunks;
};

PS.render.surface.getVisibleChunks = function (guardSamples, maxChunks) {
  var normalizedGuardSamples = Math.max(1, Math.round(Number(guardSamples) || 1));
  var visibleChunkLimit = Math.max(
    1,
    Math.round(Number(maxChunks) || PS.render.surface.getVisibleChunkLimit())
  );

  if (world.isCameraInteracting) {
    visibleChunkLimit = Math.min(
      visibleChunkLimit,
      Math.max(16, Math.round(Number(CONFIG.PLANET_SURFACE_INTERACTIVE_VISIBLE_CHUNK_LIMIT) || 96))
    );
  }

  if (world.isCameraInteracting) {
    return PS.render.surface.getInteractiveVisibleChunks(normalizedGuardSamples, visibleChunkLimit);
  }

  var samplePoints = [
    PS.render.surface.getLocalAddress(-normalizedGuardSamples, -normalizedGuardSamples).address,
    PS.render.surface.getLocalAddress(WORLD_WIDTH + normalizedGuardSamples, -normalizedGuardSamples).address,
    PS.render.surface.getLocalAddress(-normalizedGuardSamples, WORLD_HEIGHT + normalizedGuardSamples).address,
    PS.render.surface.getLocalAddress(WORLD_WIDTH + normalizedGuardSamples, WORLD_HEIGHT + normalizedGuardSamples).address
  ];
  var minChunkX = samplePoints[0].chunkX;
  var maxChunkX = samplePoints[0].chunkX;
  var minChunkY = samplePoints[0].chunkY;
  var maxChunkY = samplePoints[0].chunkY;
  var visibleChunks = [];

  for (var i = 1; i < samplePoints.length; i++) {
    minChunkX = Math.min(minChunkX, samplePoints[i].chunkX);
    maxChunkX = Math.max(maxChunkX, samplePoints[i].chunkX);
    minChunkY = Math.min(minChunkY, samplePoints[i].chunkY);
    maxChunkY = Math.max(maxChunkY, samplePoints[i].chunkY);
  }

  for (var chunkY = minChunkY; chunkY <= maxChunkY; chunkY++) {
    for (var chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
      var address = PS.render.surface.makeChunkAddress(samplePoints[0].zoomLevel, chunkX, chunkY);
      var screenRect = PS.render.surface.getChunkScreenRect(address);

      if (
        screenRect.x > canvas.width + CONFIG.TILE_SIZE ||
        screenRect.x + screenRect.width < -CONFIG.TILE_SIZE ||
        screenRect.y > canvas.height + CONFIG.TILE_SIZE ||
        screenRect.y + screenRect.height < -CONFIG.TILE_SIZE
      ) {
        continue;
      }

      visibleChunks.push({
        address: address,
        screenX: screenRect.x,
        screenY: screenRect.y,
        width: screenRect.width,
        height: screenRect.height,
        priorityDistance: PS.render.surface.getChunkScreenPriority(screenRect),
        priorityScore: PS.render.surface.getChunkPriorityScore(screenRect)
      });
    }
  }

  visibleChunks.sort(function (a, b) {
    if (a.priorityScore !== b.priorityScore) {
      return a.priorityScore - b.priorityScore;
    }

    if (a.priorityDistance !== b.priorityDistance) {
      return a.priorityDistance - b.priorityDistance;
    }

    if (a.address.chunkY !== b.address.chunkY) {
      return a.address.chunkY - b.address.chunkY;
    }

    return a.address.chunkX - b.address.chunkX;
  });

  var totalCandidateChunks = visibleChunks.length;
  visibleChunks.totalCandidateChunks = totalCandidateChunks;
  visibleChunks.workingSetLimit = visibleChunkLimit;

  if (visibleChunks.length > visibleChunkLimit) {
    visibleChunks = visibleChunks.slice(0, visibleChunkLimit);
    visibleChunks.totalCandidateChunks = totalCandidateChunks;
    visibleChunks.workingSetLimit = visibleChunkLimit;
  }

  visibleChunks.culledChunks = Math.max(0, visibleChunks.totalCandidateChunks - visibleChunks.length);
  return visibleChunks;
};
