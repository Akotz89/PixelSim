"use strict";
PS.render = PS.render || {};
PS.render.projection = PS.render.projection || {};

PS.render.projection.projectLocalPoint = function (longitude, latitude) {
  var point = getPlanetLocalCanvasPoint(longitude, latitude);

  if (
    point.x < -CONFIG.TILE_SIZE ||
    point.x > canvas.width + CONFIG.TILE_SIZE ||
    point.y < -CONFIG.TILE_SIZE ||
    point.y > canvas.height + CONFIG.TILE_SIZE
  ) {
    return null;
  }

  return {
    x: point.x,
    y: point.y,
    scale: 1,
    visibility: 1,
    visible: true
  };
};

PS.render.projection.getChunkKeyForTile = function (x, y, zoomLevelIndex) {
  var tile = getPlanetTile(x, y);
  var scale = getPlanetZoomLevel(
    typeof zoomLevelIndex === "number" ? zoomLevelIndex : getPlanetView().zoomLevel
  );
  var latitude = tile ? tile.latitude : getPlanetLatitudeForTile(getClampedWorldY(y));
  var longitude = tile ? tile.longitude : getPlanetLongitudeForTile(getWrappedWorldX(x));
  var latitudeKmPerDegree = getPlanetPoleToPoleKm() / 180;
  var longitudeKmPerDegree = Math.max(0.001, latitudeKmPerDegree * getPlanetLatitudeScale(latitude));
  var chunkLatitudeDegrees = scale.chunkKm / latitudeKmPerDegree;
  var chunkLongitudeDegrees = scale.chunkKm / longitudeKmPerDegree;
  var chunkY = Math.floor((latitude + 90) / Math.max(0.000001, chunkLatitudeDegrees));
  var chunkX = Math.floor((longitude + 180) / Math.max(0.000001, chunkLongitudeDegrees));

  return scale.index + ":" + chunkX + ":" + chunkY;
};

PS.render.projection.getProjection = function () {
  if (PS.camera && PS.camera.unified) {
    return PS.camera.unified.getProjection();
  }

  var zoomFactor = getPlanetZoomFactor();
  var radius = Math.floor(Math.min(canvas.width, canvas.height) * 0.46 * zoomFactor);
  var view = getPlanetView();

  return {
    centerX: canvas.width / 2,
    centerY: canvas.height / 2,
    radius: radius,
    viewLongitudeDeg: view.longitude,
    viewLatitudeDeg: view.latitude,
    zoomFactor: zoomFactor
  };
};

PS.render.projection.wrapLongitudeDelta = function (degrees) {
  if (PS.camera && PS.camera.unified) {
    return PS.camera.unified.wrapLongitudeDelta(degrees);
  }

  var delta = Number(degrees) || 0;

  while (delta < -180) {
    delta += 360;
  }

  while (delta > 180) {
    delta -= 360;
  }

  return delta;
};

PS.render.projection.projectPoint = function (longitudeDeg, latitudeDeg) {
  if (PS.camera && PS.camera.unified) {
    return PS.camera.unified.projectLatLon(longitudeDeg, latitudeDeg);
  }

  var projection = PS.render.projection.getProjection();
  var latitude = (Number(latitudeDeg) || 0) * Math.PI / 180;
  var centerLatitude = projection.viewLatitudeDeg * Math.PI / 180;
  var longitudeDelta = PS.render.projection.wrapLongitudeDelta(
    (Number(longitudeDeg) || 0) - projection.viewLongitudeDeg
  ) * Math.PI / 180;
  var visibility =
    Math.sin(centerLatitude) * Math.sin(latitude) +
    Math.cos(centerLatitude) * Math.cos(latitude) * Math.cos(longitudeDelta);

  if (visibility <= 0) {
    return null;
  }

  return {
    x: projection.centerX + projection.radius * Math.cos(latitude) * Math.sin(longitudeDelta),
    y: projection.centerY - projection.radius * (
      Math.cos(centerLatitude) * Math.sin(latitude) -
      Math.sin(centerLatitude) * Math.cos(latitude) * Math.cos(longitudeDelta)
    ),
    scale: clamp(0.22 + visibility * 0.78, 0.22, 1),
    visibility: visibility,
    visible: true
  };
};

PS.render.projection.getTileProjection = function (x, y) {
  var tile = getPlanetTile(
    clamp(Math.floor(Number(x) || 0), 0, WORLD_WIDTH - 1),
    clamp(Math.floor(Number(y) || 0), 0, WORLD_HEIGHT - 1)
  );

  if (!tile) {
    return null;
  }

  var projection = PS.render.projection.projectPoint(tile.longitude, tile.latitude);

  if (!projection) {
    return null;
  }

  projection.tile = tile;
  return projection;
};

PS.render.projection.getInterpolatedProjection = function (x, y) {
  if (isPlanetLocalView()) {
    var localTileX = getWrappedWorldCoordinateX(x);
    var localTileY = clamp(Number(y) || 0, 0, WORLD_HEIGHT - 1);
    var localLongitude = ((localTileX + 0.5) / Math.max(1, WORLD_WIDTH)) * 360 - 180;
    var localLatitude = 90 - ((localTileY + 0.5) / Math.max(1, WORLD_HEIGHT)) * 180;

    return PS.render.projection.projectLocalPoint(localLongitude, localLatitude);
  }

  var tileX = getWrappedWorldCoordinateX(x);
  var tileY = clamp(Number(y) || 0, 0, WORLD_HEIGHT - 1);
  var longitude = ((tileX + 0.5) / Math.max(1, WORLD_WIDTH)) * 360 - 180;
  var latitude = 90 - ((tileY + 0.5) / Math.max(1, WORLD_HEIGHT)) * 180;

  return PS.render.projection.projectPoint(longitude, latitude);
};

PS.render.projection.getTileFromCanvasPoint = function (canvasX, canvasY) {
  if (PS.camera && PS.camera.unified) {
    return PS.camera.unified.screenToTile(canvasX, canvasY);
  }

  var latLon = getPlanetLatLonFromCanvasPoint(canvasX, canvasY);

  if (!latLon) {
    return null;
  }

  return getTileFromLatLon(latLon.latitude, latLon.longitude);
};
