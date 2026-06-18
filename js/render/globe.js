import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp, randomUnit } from "../core/utils.js";
import { getClampedWorldY, getWrappedWorldX } from "./planet-grid.js";
import { getPlanetProjection, getSurfaceMeterCoordinate, wrapPlanetLongitudeDelta } from "./planet-surface.js";
import { ensureEntitySurfacePosition, getEntitySurfacePosition, getLatitudeDistanceKmPerDegree, getLatLonFromLocalOffset, getLongitudeDistanceKmPerDegree, getPlanetCircumferenceKm, getPlanetLatitudeForTile, getPlanetLatitudeScale, getPlanetLongitudeForTile, getPlanetPoleToPoleKm, getPlanetTileLatitudeStepDeg, getPlanetTileLongitudeStepDeg, getPlanetView, getPlanetViewScale, getRandomLatLonInTile, getTileFromLatLon, invalidatePlanetRenderCache, isGlobeRenderMode, isPlanetLocalView, normalizeLongitude, setEntitySurfacePosition, syncEntityTileFromSurfacePosition } from "./planet-view.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";
import { canvas } from "../ui/dom-refs.js";

PS.render = PS.render || {};
PS.render.globe = PS.render.globe || {};

PS.render.globe.isActive = function () {
  return isGlobeRenderMode();
};

PS.render.globe.isLocalView = function () {
  return isPlanetLocalView();
};

PS.render.globe.getProjection = function () {
  return getPlanetProjection();
};

PS.render.globe.getLatLonFromCanvasPoint = function (canvasX, canvasY) {
  if (PS.camera && PS.camera.unified) {
    return PS.camera.unified.screenToLatLon(canvasX, canvasY);
  }

  if (isGlobeRenderMode() && isPlanetLocalView()) {
    return PS.render.globe.getLocalLatLonFromCanvasPoint(canvasX, canvasY);
  }

  if (!isGlobeRenderMode()) {
    var flatTileX = clamp(Math.floor((Number(canvasX) || 0) / CONFIG.TILE_SIZE), 0, WORLD_WIDTH - 1);
    var flatTileY = clamp(Math.floor((Number(canvasY) || 0) / CONFIG.TILE_SIZE), 0, WORLD_HEIGHT - 1);

    return {
      latitude: getPlanetLatitudeForTile(flatTileY),
      longitude: getPlanetLongitudeForTile(flatTileX)
    };
  }

  var projection = getPlanetProjection();
  var normalizedX = ((Number(canvasX) || 0) - projection.centerX) / projection.radius;
  var normalizedYNorth = -((Number(canvasY) || 0) - projection.centerY) / projection.radius;
  var rho = Math.sqrt(normalizedX * normalizedX + normalizedYNorth * normalizedYNorth);

  if (rho > 1) {
    return null;
  }

  if (rho === 0) {
    return {
      latitude: projection.viewLatitudeDeg,
      longitude: projection.viewLongitudeDeg
    };
  }

  var centerLatitude = projection.viewLatitudeDeg * Math.PI / 180;
  var centerLongitude = projection.viewLongitudeDeg * Math.PI / 180;
  var angularDistance = Math.asin(rho);
  var latitude = Math.asin(
    Math.cos(angularDistance) * Math.sin(centerLatitude) +
    (normalizedYNorth * Math.sin(angularDistance) * Math.cos(centerLatitude)) / rho
  );
  var longitude = centerLongitude + Math.atan2(
    normalizedX * Math.sin(angularDistance),
    rho * Math.cos(centerLatitude) * Math.cos(angularDistance) -
      normalizedYNorth * Math.sin(centerLatitude) * Math.sin(angularDistance)
  );

  return {
    latitude: clamp(latitude * 180 / Math.PI, -90, 90),
    longitude: PS.render.globe.normalizeLongitude(longitude * 180 / Math.PI)
  };
};

PS.render.globe.getLatLonFromProjectedPoint = function (projection, canvasX, canvasY) {
  var radius = Math.max(1, Number(projection && projection.radius) || 1);
  var x = ((Number(canvasX) || 0) - (Number(projection.centerX) || 0)) / radius;
  var y = ((Number(projection.centerY) || 0) - (Number(canvasY) || 0)) / radius;
  var rho = Math.sqrt(x * x + y * y);

  if (rho > 1) {
    return null;
  }

  var centerLatitude = (Number(projection.viewLatitudeDeg) || 0) * Math.PI / 180;
  var centerLongitude = (Number(projection.viewLongitudeDeg) || 0) * Math.PI / 180;
  var c = Math.asin(clamp(rho, 0, 1));
  var sinC = Math.sin(c);
  var cosC = Math.cos(c);
  var sinCenterLatitude = Math.sin(centerLatitude);
  var cosCenterLatitude = Math.cos(centerLatitude);
  var latitude;
  var longitude;

  if (rho < 0.000001) {
    latitude = centerLatitude;
    longitude = centerLongitude;
  } else {
    latitude = Math.asin(
      cosC * sinCenterLatitude + (y * sinC * cosCenterLatitude) / rho
    );
    longitude = centerLongitude + Math.atan2(
      x * sinC,
      rho * cosCenterLatitude * cosC - y * sinCenterLatitude * sinC
    );
  }

  return {
    latitude: clamp(latitude * 180 / Math.PI, -90, 90),
    longitude: normalizeLongitude(longitude * 180 / Math.PI),
    visibility: clamp(cosC, 0, 1)
  };
};

PS.render.globe.getSampleSize = function (projection, multiplier) {
  var normalizedMultiplier = Number(multiplier) || 1;
  var longitudeSpacing = (projection.radius * Math.PI * 2) / Math.max(1, WORLD_WIDTH);
  var latitudeSpacing = (projection.radius * Math.PI) / Math.max(1, WORLD_HEIGHT);

  return Math.max(3, Math.ceil(Math.max(longitudeSpacing, latitudeSpacing) * normalizedMultiplier));
};

PS.render.globe.getRasterScale = function (width, height, maxSizeOverride) {
  var configuredMaxSize = Number.isFinite(Number(maxSizeOverride))
    ? Number(maxSizeOverride)
    : Number(CONFIG.PLANET_GLOBE_RASTER_MAX_SIZE) || 720;
  var maxSize = Math.max(48, configuredMaxSize);
  var largestSize = Math.max(1, Number(width) || 1, Number(height) || 1);

  return clamp(maxSize / largestSize, 0.04, 1);
};

PS.render.globe.getTileLatLon = function (x, y) {
  return {
    latitude: getPlanetLatitudeForTile(getClampedWorldY(y)),
    longitude: getPlanetLongitudeForTile(getWrappedWorldX(x))
  };
};

PS.render.globe.getTileFromLatLon = function (latitude, longitude) {
  var normalizedLongitude = PS.render.globe.normalizeLongitude(longitude);
  var normalizedLatitude = clamp(Number(latitude) || 0, -90, 90);

  return {
    x: getWrappedWorldX(Math.floor(((normalizedLongitude + 180) / 360) * WORLD_WIDTH)),
    y: getClampedWorldY(Math.floor(((90 - normalizedLatitude) / 180) * WORLD_HEIGHT))
  };
};

PS.render.globe.getLongitudeDistanceKmPerDegree = function (latitude) {
  return Math.max(0.001, (getPlanetCircumferenceKm() / 360) * getPlanetLatitudeScale(latitude));
};

PS.render.globe.getLatitudeDistanceKmPerDegree = function () {
  return getPlanetPoleToPoleKm() / 180;
};

PS.render.globe.normalizeLongitude = function (longitude) {
  return ((Number(longitude) || 0) + 540) % 360 - 180;
};

PS.render.globe.getLatLonFromLocalOffset = function (eastKm, northKm) {
  var view = getPlanetView();
  var viewMeters = getSurfaceMeterCoordinate(view.latitude, view.longitude);

  return PS.render.globe.getLatLonFromSurfaceMeters(
    viewMeters.eastMeters + (Number(eastKm) || 0) * 1000,
    viewMeters.northMeters + (Number(northKm) || 0) * 1000
  );
};

PS.render.globe.getLatLonFromSurfaceMeters = function (eastMeters, northMeters) {
  var latitude = clamp(
    (Number(northMeters) || 0) / (PS.render.globe.getLatitudeDistanceKmPerDegree() * 1000),
    -90,
    90
  );
  var longitude = PS.render.globe.normalizeLongitude(
    (Number(eastMeters) || 0) / (PS.render.globe.getLongitudeDistanceKmPerDegree(latitude) * 1000)
  );

  return {
    latitude: latitude,
    longitude: longitude
  };
};

PS.render.globe.getSurfaceMeters = function (latitude, longitude) {
  if (PS.camera && PS.camera.unified) {
    return PS.camera.unified.getSurfaceMeters(latitude, longitude);
  }

  return {
    northMeters: (Number(latitude) || 0) * PS.render.globe.getLatitudeDistanceKmPerDegree() * 1000,
    eastMeters: PS.render.globe.normalizeLongitude(longitude) * PS.render.globe.getLongitudeDistanceKmPerDegree(latitude) * 1000
  };
};

PS.render.globe.getLocalLatLonFromCanvasPoint = function (canvasX, canvasY) {
  if (PS.camera && PS.camera.unified) {
    return PS.camera.unified.screenToLatLon(canvasX, canvasY);
  }

  var scale = getPlanetViewScale();
  var sampleX = (Number(canvasX) || 0) / CONFIG.TILE_SIZE;
  var sampleY = (Number(canvasY) || 0) / CONFIG.TILE_SIZE;
  var viewMeters = getSurfaceMeterCoordinate(getPlanetView().latitude, getPlanetView().longitude);
  var eastMeters = viewMeters.eastMeters + (sampleX - WORLD_WIDTH / 2) * scale.metersPerSample;
  var northMeters = viewMeters.northMeters - (sampleY - WORLD_HEIGHT / 2) * scale.metersPerSample;

  return PS.render.globe.getLatLonFromSurfaceMeters(eastMeters, northMeters);
};

PS.render.globe.getLocalCanvasPoint = function (longitude, latitude) {
  if (PS.camera && PS.camera.unified) {
    var point = PS.camera.unified.latLonToScreen(latitude, longitude);

    return point ? {
      x: point.screenX,
      y: point.screenY
    } : null;
  }

  var scale = getPlanetViewScale();
  var viewMeters = PS.render.globe.getSurfaceMeters(getPlanetView().latitude, getPlanetView().longitude);
  var targetMeters = PS.render.globe.getSurfaceMeters(latitude, longitude);
  var eastMeters = targetMeters.eastMeters - viewMeters.eastMeters;
  var northMeters = targetMeters.northMeters - viewMeters.northMeters;

  return {
    x: canvas.width / 2 + (eastMeters / scale.metersPerSample) * CONFIG.TILE_SIZE,
    y: canvas.height / 2 - (northMeters / scale.metersPerSample) * CONFIG.TILE_SIZE
  };
};

PS.render.globe.getRandomLatLonInTile = function (x, y) {
  var center = PS.render.globe.getTileLatLon(x, y);
  var latitudeJitter = (randomUnit() - 0.5) * getPlanetTileLatitudeStepDeg() * 0.86;
  var longitudeJitter = (randomUnit() - 0.5) * getPlanetTileLongitudeStepDeg() * 0.86;

  return {
    latitude: clamp(center.latitude + latitudeJitter, -90, 90),
    longitude: PS.render.globe.normalizeLongitude(center.longitude + longitudeJitter)
  };
};

PS.render.globe.getEntitySurfacePosition = function (entity) {
  if (!entity) {
    return null;
  }

  if (
    Number.isFinite(Number(entity.latitude)) &&
    Number.isFinite(Number(entity.longitude))
  ) {
    return {
      latitude: clamp(Number(entity.latitude), -90, 90),
      longitude: PS.render.globe.normalizeLongitude(entity.longitude)
    };
  }

  return PS.render.globe.getTileLatLon(entity.x, entity.y);
};

PS.render.globe.setEntitySurfacePosition = function (entity, latitude, longitude) {
  if (!entity) {
    return entity;
  }

  entity.latitude = clamp(Number(latitude) || 0, -90, 90);
  entity.longitude = PS.render.globe.normalizeLongitude(longitude);
  return entity;
};

PS.render.globe.assignRandomEntitySurfacePositionInTile = function (entity) {
  if (!entity) {
    return entity;
  }

  var position = PS.render.globe.getRandomLatLonInTile(entity.x, entity.y);
  return PS.render.globe.setEntitySurfacePosition(entity, position.latitude, position.longitude);
};

PS.render.globe.ensureEntitySurfacePosition = function (entity) {
  var position = PS.render.globe.getEntitySurfacePosition(entity);

  if (!position) {
    return entity;
  }

  return PS.render.globe.setEntitySurfacePosition(entity, position.latitude, position.longitude);
};

PS.render.globe.syncEntityTileFromSurfacePosition = function (entity) {
  var position = PS.render.globe.getEntitySurfacePosition(entity);

  if (!entity || !position) {
    return entity;
  }

  var tile = PS.render.globe.getTileFromLatLon(position.latitude, position.longitude);
  entity.x = tile.x;
  entity.y = tile.y;
  return entity;
};

PS.render.globe.interpolateLongitude = function (fromLongitude, toLongitude, amount) {
  return PS.render.globe.normalizeLongitude(
    (Number(fromLongitude) || 0) +
      wrapPlanetLongitudeDelta((Number(toLongitude) || 0) - (Number(fromLongitude) || 0)) *
      clamp(Number(amount) || 0, 0, 1)
  );
};

PS.render.globe.getSurfaceSample = function (latitude, longitude, tile, zoomLevelIndex) {
  return PS.render.surface.getChunkSample(latitude, longitude, tile, zoomLevelIndex);
};

PS.render.globe.getVisibleChunks = function (guardSamples, maxChunks) {
  return PS.render.surface.getVisibleChunks(guardSamples, maxChunks);
};

PS.render.globe.rebuildShaders = function () {};
PS.render.globe.rebuildTextures = function () {
  if (typeof invalidatePlanetRenderCache === "function") {
    invalidatePlanetRenderCache();
  }
};
