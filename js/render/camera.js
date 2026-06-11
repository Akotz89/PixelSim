"use strict";
PS.camera = PS.camera || {};
PS.camera.stats = PS.camera.stats || {
  lastZoomFrom: 0,
  lastZoomTo: 0,
  lastZoomDirection: 0,
  lastZoomAnchorErrorDeg: 0,
  lastZoomAnchorCanvasX: 0,
  lastZoomAnchorCanvasY: 0,
  lastZoomPreloadSurfaceLodIndex: 0
};
PS.camera.inertia = PS.camera.inertia || {
  zoomVelocity: 0,
  zoomAccumulator: 0,
  panVelocityX: 0,
  panVelocityY: 0,
  anchorCanvasX: 0,
  anchorCanvasY: 0,
  hasZoomAnchor: false
};

PS.camera.getMotionConfig = function () {
  return {
    panAcceleration: Math.max(0.01, Number(CONFIG.PLANET_CAMERA_PAN_ACCELERATION) || 0.62),
    panFriction: clamp(Number(CONFIG.PLANET_CAMERA_PAN_FRICTION) || 0.84, 0, 0.98),
    panMaxSpeed: Math.max(0.1, Number(CONFIG.PLANET_CAMERA_PAN_MAX_SPEED) || 42),
    zoomAcceleration: Math.max(0.01, Number(CONFIG.PLANET_CAMERA_ZOOM_ACCELERATION) || 0.6),
    zoomFriction: clamp(Number(CONFIG.PLANET_CAMERA_ZOOM_FRICTION) || 0.72, 0, 0.98),
    zoomMaxSpeed: Math.max(0.01, Number(CONFIG.PLANET_CAMERA_ZOOM_MAX_SPEED) || 0.85)
  };
};

PS.camera.clampVelocity = function (value, maxSpeed) {
  var speed = Math.max(0, Number(maxSpeed) || 0);
  return clamp(Number(value) || 0, -speed, speed);
};

PS.camera.getIntegerZoomLevel = function (zoomLevel) {
  return clamp(
    Math.round(Number(zoomLevel) || 0),
    0,
    PS.camera.getZoomLevels().length - 1
  );
};

PS.camera.getZoomOutShift = function (zoomLevel) {
  return clamp(
    PS.camera.getZoomLevels().length - 1 - PS.camera.getIntegerZoomLevel(zoomLevel),
    0,
    30
  );
};

PS.camera.getPowerOfTwoZoomScale = function (zoomLevel) {
  return 1 << PS.camera.getIntegerZoomLevel(zoomLevel);
};

PS.camera.tileToScreenBitShift = function (tileX, tileY, originTileX, originTileY, zoomLevel) {
  var shift = PS.camera.getZoomOutShift(zoomLevel);
  var deltaX = Math.round(Number(tileX) || 0) - Math.round(Number(originTileX) || 0);
  var deltaY = Math.round(Number(tileY) || 0) - Math.round(Number(originTileY) || 0);
  var screenTileX = deltaX >> shift;
  var screenTileY = deltaY >> shift;

  return {
    screenTileX: screenTileX,
    screenTileY: screenTileY,
    snappedTileX: Math.round(Number(originTileX) || 0) + (screenTileX << shift),
    snappedTileY: Math.round(Number(originTileY) || 0) + (screenTileY << shift),
    coveredTileMinX: Math.round(Number(originTileX) || 0) + (screenTileX << shift),
    coveredTileMinY: Math.round(Number(originTileY) || 0) + (screenTileY << shift),
    coveredTileMaxX: Math.round(Number(originTileX) || 0) + (screenTileX << shift) + ((1 << shift) - 1),
    coveredTileMaxY: Math.round(Number(originTileY) || 0) + (screenTileY << shift) + ((1 << shift) - 1),
    zoomOutShift: shift
  };
};

PS.camera.screenToTileBitShift = function (screenTileX, screenTileY, originTileX, originTileY, zoomLevel) {
  var shift = PS.camera.getZoomOutShift(zoomLevel);

  return {
    tileX: Math.round(Number(originTileX) || 0) + (Math.round(Number(screenTileX) || 0) << shift),
    tileY: Math.round(Number(originTileY) || 0) + (Math.round(Number(screenTileY) || 0) << shift),
    tileMaxX: Math.round(Number(originTileX) || 0) + (Math.round(Number(screenTileX) || 0) << shift) + ((1 << shift) - 1),
    tileMaxY: Math.round(Number(originTileY) || 0) + (Math.round(Number(screenTileY) || 0) << shift) + ((1 << shift) - 1),
    zoomOutShift: shift
  };
};

PS.camera.getZoomLevels = function () {
  return Array.isArray(CONFIG.PLANET_ZOOM_LEVELS) && CONFIG.PLANET_ZOOM_LEVELS.length > 0
    ? CONFIG.PLANET_ZOOM_LEVELS
    : [{ name: "Globe", metersPerSample: getPlanetEquatorKmPerTile() * 1000, chunkKm: 4000 }];
};

PS.camera.getZoomLevel = function (index) {
  var levels = PS.camera.getZoomLevels();
  var normalizedIndex = clamp(Math.round(Number(index) || 0), 0, levels.length - 1);
  var level = levels[normalizedIndex] || levels[0];

  return {
    index: normalizedIndex,
    name: String(level.name || "Scale " + normalizedIndex),
    metersPerSample: Math.max(0.1, Number(level.metersPerSample) || 1),
    chunkKm: Math.max(0.001, Number(level.chunkKm) || 1)
  };
};

PS.camera.interpolateScaleValue = function (fromValue, toValue, amount) {
  var from = Math.max(0.000001, Number(fromValue) || 1);
  var to = Math.max(0.000001, Number(toValue) || from);

  return Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * clamp(Number(amount) || 0, 0, 1));
};

PS.camera.getZoomAnchorIndex = function (zoomLevel) {
  var levels = PS.camera.getZoomLevels();

  return clamp(Math.floor(Number(zoomLevel) || 0), 0, levels.length - 1);
};

PS.camera.getSurfaceLodZoomIndex = function (zoomLevel) {
  var levels = PS.camera.getZoomLevels();
  var normalizedZoom = clamp(Number(zoomLevel) || 0, 0, levels.length - 1);
  var lowerIndex = Math.floor(normalizedZoom);
  var upperIndex = Math.ceil(normalizedZoom);
  var zoomFraction = normalizedZoom - lowerIndex;

  if (lowerIndex === upperIndex || lowerIndex < 1) {
    return lowerIndex;
  }

  return zoomFraction + 1e-9 >= 0.55 ? upperIndex : lowerIndex;
};

PS.camera.getInterpolatedZoomLevel = function (zoomLevel) {
  var levels = PS.camera.getZoomLevels();
  var normalizedZoom = clamp(Number(zoomLevel) || 0, 0, levels.length - 1);
  var lowerIndex = Math.floor(normalizedZoom);
  var upperIndex = Math.ceil(normalizedZoom);
  var amount = normalizedZoom - lowerIndex;
  var lower = PS.camera.getZoomLevel(lowerIndex);
  var upper = PS.camera.getZoomLevel(upperIndex);
  var anchorIndex = PS.camera.getZoomAnchorIndex(normalizedZoom);

  if (lowerIndex === upperIndex) {
    return {
      index: lower.index,
      anchorIndex: lower.index,
      lowerIndex: lower.index,
      upperIndex: upper.index,
      zoomValue: normalizedZoom,
      zoomFraction: 0,
      name: lower.name,
      anchorName: lower.name,
      metersPerSample: lower.metersPerSample,
      chunkKm: lower.chunkKm,
      zoomOutShift: PS.camera.getZoomOutShift(lower.index),
      powerOfTwoScale: PS.camera.getPowerOfTwoZoomScale(lower.index)
    };
  }

  return {
    index: anchorIndex,
    anchorIndex: anchorIndex,
    lowerIndex: lower.index,
    upperIndex: upper.index,
    zoomValue: normalizedZoom,
    zoomFraction: amount,
    name: lower.name + "-" + upper.name,
    anchorName: PS.camera.getZoomLevel(anchorIndex).name,
    metersPerSample: PS.camera.interpolateScaleValue(lower.metersPerSample, upper.metersPerSample, amount),
    chunkKm: PS.camera.interpolateScaleValue(lower.chunkKm, upper.chunkKm, amount),
    zoomOutShift: PS.camera.getZoomOutShift(anchorIndex),
    powerOfTwoScale: PS.camera.getPowerOfTwoZoomScale(anchorIndex)
  };
};

PS.camera.getZoomFactor = function () {
  var scale = PS.camera.getScale();
  var globeScale = PS.camera.getZoomLevel(0);
  var ratio = globeScale.metersPerSample / Math.max(0.1, scale.metersPerSample);

  return clamp(Math.sqrt(ratio), 1, 28);
};

PS.camera.getView = function () {
  if (!world.planetView) {
    world.planetView = {
      zoomLevel: clamp(
        Number(CONFIG.PLANET_ZOOM_LEVEL) || 0,
        0,
        PS.camera.getZoomLevels().length - 1
      ),
      latitude: Number(CONFIG.PLANET_VIEW_LATITUDE_DEG) || 0,
      longitude: Number(CONFIG.PLANET_VIEW_LONGITUDE_DEG) || 0,
      panEastMeters: 0,
      panNorthMeters: 0
    };
  }

  world.planetView.zoomLevel = clamp(
    Number(world.planetView.zoomLevel) || 0,
    0,
    PS.camera.getZoomLevels().length - 1
  );
  world.planetView.latitude = clamp(Number(world.planetView.latitude) || 0, -90, 90);
  world.planetView.longitude = ((Number(world.planetView.longitude) || 0) + 540) % 360 - 180;

  return world.planetView;
};

PS.camera.getScale = function () {
  return PS.camera.getInterpolatedZoomLevel(PS.camera.getView().zoomLevel);
};

PS.camera.getScaleLabel = function () {
  var scale = PS.camera.getScale();
  var anchorLabel = scale.zoomFraction > 0
    ? " anchor " + scale.anchorName
    : "";

  if (scale.metersPerSample >= 1000) {
    return scale.name + " " + (scale.metersPerSample / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + " km/sample" + anchorLabel;
  }

  return scale.name + " " + scale.metersPerSample.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " m/sample" + anchorLabel;
};

PS.camera.getScaleBar = function (targetPixels) {
  var scaleInfo = PS.camera.getInfo();
  var normalizedTargetPixels = Math.max(80, Number(targetPixels) || 220);
  var targetMeters = normalizedTargetPixels * scaleInfo.metersPerCanvasPixel;
  var distanceMeters = PS.camera.getNiceDistanceMeters(targetMeters);
  var pixelWidth = distanceMeters / Math.max(0.001, scaleInfo.metersPerCanvasPixel);

  return {
    distanceMeters: distanceMeters,
    label: PS.camera.getDistanceLabel(distanceMeters),
    pixelWidth: pixelWidth,
    metersPerCanvasPixel: scaleInfo.metersPerCanvasPixel
  };
};

PS.camera.getInfo = function () {
  var view = PS.camera.getView();
  var scale = PS.camera.getScale();
  var surfaceLod = PS.camera.getZoomLevel(PS.camera.getSurfaceLodZoomIndex(view.zoomLevel));
  var footprint = PS.camera.getLocalViewFootprint();
  var verticalFovRadians = 45 * Math.PI / 180;
  var metersPerCanvasPixel = scale.metersPerSample / Math.max(1, CONFIG.TILE_SIZE);
  var approximateAltitudeKm = footprint.heightKm / (2 * Math.tan(verticalFovRadians / 2));

  return {
    zoomLevel: scale.index,
    zoomValue: scale.zoomValue,
    zoomFraction: scale.zoomFraction,
    anchorLevel: scale.anchorIndex,
    anchorName: scale.anchorName,
    surfaceLodLevel: surfaceLod.index,
    surfaceLodName: surfaceLod.name,
    surfaceSampleMeters: surfaceLod.metersPerSample,
    scaleName: scale.name,
    zoomOutShift: scale.zoomOutShift,
    powerOfTwoScale: scale.powerOfTwoScale,
    latitude: view.latitude,
    longitude: view.longitude,
    metersPerSample: scale.metersPerSample,
    metersPerCanvasPixel: metersPerCanvasPixel,
    footprintWidthKm: footprint.widthKm,
    footprintHeightKm: footprint.heightKm,
    approximateAltitudeKm: Math.max(0.001, approximateAltitudeKm)
  };
};

PS.camera.getLocalViewFootprint = function () {
  var scale = PS.camera.getScale();

  return {
    widthKm: WORLD_WIDTH * scale.metersPerSample / 1000,
    heightKm: WORLD_HEIGHT * scale.metersPerSample / 1000,
    metersPerSample: scale.metersPerSample
  };
};

PS.camera.getDistanceLabel = function (meters) {
  var normalizedMeters = Math.max(0, Number(meters) || 0);

  if (normalizedMeters >= 1000000) {
    return (normalizedMeters / 1000000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + " Mm";
  }

  if (normalizedMeters >= 1000) {
    return (normalizedMeters / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + " km";
  }

  if (normalizedMeters >= 1) {
    return normalizedMeters.toLocaleString(undefined, { maximumFractionDigits: 0 }) + " m";
  }

  return (normalizedMeters * 100).toLocaleString(undefined, { maximumFractionDigits: 0 }) + " cm";
};

PS.camera.getNiceDistanceMeters = function (targetMeters) {
  var normalizedTarget = Math.max(0.01, Number(targetMeters) || 1);
  var exponent = Math.floor(Math.log10(normalizedTarget));
  var bestDistance = 1;
  var bestScore = Infinity;
  var bases = [1, 2, 5, 10];

  for (var offset = -1; offset <= 1; offset++) {
    var magnitude = Math.pow(10, exponent + offset);

    for (var i = 0; i < bases.length; i++) {
      var distance = bases[i] * magnitude;
      var score = Math.abs(Math.log(distance / normalizedTarget));

      if (score < bestScore) {
        bestDistance = distance;
        bestScore = score;
      }
    }
  }

  return Math.max(0.01, bestDistance);
};

PS.camera.focusLatLon = function (latitude, longitude) {
  var view = PS.camera.getView();
  var previousLatitude = view.latitude;
  var previousLongitude = view.longitude;
  var previousMeters = getSurfaceMeterCoordinate(previousLatitude, previousLongitude);

  view.latitude = clamp(Number(latitude) || 0, -90, 90);
  view.longitude = PS.render.globe.normalizeLongitude(longitude);

  if (
    previousLatitude !== view.latitude ||
    previousLongitude !== view.longitude
  ) {
    var nextMeters = getSurfaceMeterCoordinate(view.latitude, view.longitude);

    view.panEastMeters = clamp(nextMeters.eastMeters - previousMeters.eastMeters, -10000000, 10000000);
    view.panNorthMeters = clamp(nextMeters.northMeters - previousMeters.northMeters, -10000000, 10000000);
    invalidatePlanetRenderCache();
  }

  return view;
};

PS.camera.focusTile = function (x, y) {
  var tile = getPlanetTile(x, y);

  if (!tile) {
    return PS.camera.getView();
  }

  return PS.camera.focusLatLon(tile.latitude, tile.longitude);
};

PS.camera.focusCanvasPoint = function (canvasX, canvasY) {
  var latLon = getPlanetLatLonFromCanvasPoint(canvasX, canvasY);

  if (!latLon) {
    return false;
  }

  PS.camera.focusLatLon(latLon.latitude, latLon.longitude);
  return true;
};

PS.camera.panScreen = function (deltaX, deltaY) {
  var scale = PS.camera.getScale();
  var normalizedDeltaX = Number(deltaX) || 0;
  var normalizedDeltaY = Number(deltaY) || 0;
  var motion = PS.camera.getMotionConfig();
  var eastKm = -normalizedDeltaX * scale.metersPerSample / CONFIG.TILE_SIZE / 1000;
  var northKm = normalizedDeltaY * scale.metersPerSample / CONFIG.TILE_SIZE / 1000;

  PS.camera.inertia.panVelocityX = PS.camera.clampVelocity(
    PS.camera.inertia.panVelocityX + normalizedDeltaX * motion.panAcceleration,
    motion.panMaxSpeed
  );
  PS.camera.inertia.panVelocityY = PS.camera.clampVelocity(
    PS.camera.inertia.panVelocityY + normalizedDeltaY * motion.panAcceleration,
    motion.panMaxSpeed
  );

  return PS.camera.panKm(eastKm, northKm);
};

PS.camera.panSamples = function (eastSamples, northSamples) {
  var scale = PS.camera.getScale();

  return PS.camera.panKm(
    (Number(eastSamples) || 0) * scale.metersPerSample / 1000,
    (Number(northSamples) || 0) * scale.metersPerSample / 1000
  );
};

PS.camera.panKm = function (eastKm, northKm) {
  var target = PS.render.globe.getLatLonFromLocalOffset(eastKm, northKm);

  PS.camera.focusLatLon(target.latitude, target.longitude);
  return PS.camera.getView();
};

PS.camera.setRenderZoom = function (zoomLevel) {
  var view = PS.camera.getView();
  var previousZoom = Number(view.zoomLevel) || 0;
  var nextZoom = clamp(
    Number(zoomLevel) || 0,
    0,
    PS.camera.getZoomLevels().length - 1
  );

  if (view.zoomLevel === nextZoom) {
    return false;
  }

  view.lastZoomLevel = previousZoom;
  view.zoomDirection = nextZoom > previousZoom ? 1 : -1;
  view.zoomLevel = nextZoom;
  PS.camera.stats.lastZoomFrom = previousZoom;
  PS.camera.stats.lastZoomTo = nextZoom;
  PS.camera.stats.lastZoomDirection = view.zoomDirection;
  PS.camera.stats.lastZoomAnchorErrorDeg = 0;
  PS.camera.stats.lastZoomPreloadSurfaceLodIndex = PS.render && PS.render.lod && typeof PS.render.lod.getPreloadSurfaceLodIndex === "function"
    ? PS.render.lod.getPreloadSurfaceLodIndex()
    : PS.camera.getSurfaceLodZoomIndex(nextZoom);
  if (typeof markCameraInteracting === "function") {
    markCameraInteracting();
  }
  invalidatePlanetRenderCache();
  return true;
};

PS.camera.setZoom = function (zoomLevel) {
  return PS.camera.setRenderZoom(PS.camera.getIntegerZoomLevel(zoomLevel));
};

PS.camera.focusLatLonAtCanvasPoint = function (latitude, longitude, canvasX, canvasY) {
  var scale = PS.camera.getScale();
  var targetCanvas = typeof canvas !== "undefined" && canvas ? canvas : null;
  var viewportCenterX = targetCanvas ? (Number(targetCanvas.width) || 0) / 2 : 0;
  var viewportCenterY = targetCanvas ? (Number(targetCanvas.height) || 0) / 2 : 0;
  var sampleOffsetX = ((Number(canvasX) || 0) - viewportCenterX) / CONFIG.TILE_SIZE;
  var sampleOffsetY = ((Number(canvasY) || 0) - viewportCenterY) / CONFIG.TILE_SIZE;
  var targetMeters = getSurfaceMeterCoordinate(latitude, longitude);
  var centerMeters = {
    eastMeters: targetMeters.eastMeters - sampleOffsetX * scale.metersPerSample,
    northMeters: targetMeters.northMeters + sampleOffsetY * scale.metersPerSample
  };
  var centerLatLon = PS.render.globe.getLatLonFromSurfaceMeters(centerMeters.eastMeters, centerMeters.northMeters);

  PS.camera.focusLatLon(centerLatLon.latitude, centerLatLon.longitude);
  return PS.camera.getView();
};

PS.camera.setZoomAtCanvasPoint = function (zoomLevel, canvasX, canvasY) {
  var anchoredLatLon = typeof getPlanetLatLonFromCanvasPoint === "function"
    ? getPlanetLatLonFromCanvasPoint(canvasX, canvasY)
    : null;
  var afterLatLon;
  var longitudeDelta;

  if (!PS.camera.setRenderZoom(zoomLevel)) {
    return false;
  }

  if (anchoredLatLon && isPlanetLocalView()) {
    PS.camera.focusLatLonAtCanvasPoint(
      anchoredLatLon.latitude,
      anchoredLatLon.longitude,
      canvasX,
      canvasY
    );
  }

  afterLatLon = anchoredLatLon && typeof getPlanetLatLonFromCanvasPoint === "function"
    ? getPlanetLatLonFromCanvasPoint(canvasX, canvasY)
    : null;
  longitudeDelta = anchoredLatLon && afterLatLon
    ? ((Number(afterLatLon.longitude) - Number(anchoredLatLon.longitude) + 540) % 360) - 180
    : 0;
  PS.camera.stats.lastZoomAnchorErrorDeg = anchoredLatLon && afterLatLon
    ? Math.abs(Number(afterLatLon.latitude) - Number(anchoredLatLon.latitude)) + Math.abs(longitudeDelta)
    : 0;
  PS.camera.stats.lastZoomAnchorCanvasX = Number(canvasX) || 0;
  PS.camera.stats.lastZoomAnchorCanvasY = Number(canvasY) || 0;
  PS.camera.stats.lastZoomPreloadSurfaceLodIndex = PS.render && PS.render.lod && typeof PS.render.lod.getPreloadSurfaceLodIndex === "function"
    ? PS.render.lod.getPreloadSurfaceLodIndex()
    : PS.camera.getSurfaceLodZoomIndex(PS.camera.getView().zoomLevel);

  return true;
};

PS.camera.setIntegerZoomAtCanvasPoint = function (zoomLevel, canvasX, canvasY) {
  return PS.camera.setZoomAtCanvasPoint(PS.camera.getIntegerZoomLevel(zoomLevel), canvasX, canvasY);
};

PS.camera.getZoomTransitionStats = function () {
  return Object.assign({}, PS.camera.stats);
};

PS.camera.adjustZoom = function (delta) {
  var normalizedDelta = Number(delta) || 0;
  var motion = PS.camera.getMotionConfig();

  if (normalizedDelta === 0) {
    return false;
  }

  PS.camera.inertia.zoomVelocity = PS.camera.clampVelocity(
    PS.camera.inertia.zoomVelocity + normalizedDelta * motion.zoomAcceleration,
    motion.zoomMaxSpeed
  );
  PS.camera.inertia.hasZoomAnchor = false;
  if (typeof markCameraInteracting === "function") {
    markCameraInteracting();
  }
  world.needsRender = true;
  return true;
};

PS.camera.adjustZoomAtCanvasPoint = function (delta, canvasX, canvasY) {
  var normalizedDelta = Number(delta) || 0;
  var motion = PS.camera.getMotionConfig();

  if (normalizedDelta === 0) {
    return false;
  }

  PS.camera.inertia.zoomVelocity = PS.camera.clampVelocity(
    PS.camera.inertia.zoomVelocity + normalizedDelta * motion.zoomAcceleration,
    motion.zoomMaxSpeed
  );
  PS.camera.inertia.anchorCanvasX = Number(canvasX) || 0;
  PS.camera.inertia.anchorCanvasY = Number(canvasY) || 0;
  PS.camera.inertia.hasZoomAnchor = true;
  if (typeof markCameraInteracting === "function") {
    markCameraInteracting();
  }
  world.needsRender = true;
  return true;
};

PS.camera.stopInertia = function () {
  PS.camera.inertia.zoomVelocity = 0;
  PS.camera.inertia.zoomAccumulator = 0;
  PS.camera.inertia.panVelocityX = 0;
  PS.camera.inertia.panVelocityY = 0;
  PS.camera.inertia.hasZoomAnchor = false;
};

PS.camera.updateInertia = function () {
  var inertia = PS.camera.inertia;
  var view = PS.camera.getView();
  var motion = PS.camera.getMotionConfig();
  var maxZoom = PS.camera.getZoomLevels().length - 1;
  var zoomVelocity = Number(inertia.zoomVelocity) || 0;
  var panVelocityX = Number(inertia.panVelocityX) || 0;
  var panVelocityY = Number(inertia.panVelocityY) || 0;
  var zoomActive = Math.abs(zoomVelocity) > 0.0001;
  var panActive = Math.abs(panVelocityX) + Math.abs(panVelocityY) > 0.35;
  var didMove = false;

  if (zoomActive) {
    var nextZoom = clamp(view.zoomLevel + zoomVelocity, 0, maxZoom);
    var changed = inertia.hasZoomAnchor
      ? PS.camera.setZoomAtCanvasPoint(nextZoom, inertia.anchorCanvasX, inertia.anchorCanvasY)
      : PS.camera.setRenderZoom(nextZoom);

    didMove = changed || didMove;
    if (nextZoom <= 0 || nextZoom >= maxZoom) {
      inertia.zoomVelocity = 0;
      inertia.zoomAccumulator = 0;
    } else {
      inertia.zoomVelocity = zoomVelocity * motion.zoomFriction;
    }
  } else {
    inertia.zoomVelocity = 0;
    inertia.zoomAccumulator = 0;
  }

  if (panActive) {
    var scale = PS.camera.getScale();
    var eastKm = -panVelocityX * scale.metersPerSample / CONFIG.TILE_SIZE / 1000;
    var northKm = panVelocityY * scale.metersPerSample / CONFIG.TILE_SIZE / 1000;

    PS.camera.panKm(eastKm, northKm);
    inertia.panVelocityX = panVelocityX * motion.panFriction;
    inertia.panVelocityY = panVelocityY * motion.panFriction;
    didMove = true;
  } else {
    inertia.panVelocityX = 0;
    inertia.panVelocityY = 0;
  }

  if (didMove || Math.abs(inertia.zoomVelocity) > 0.0001 || Math.abs(inertia.panVelocityX) + Math.abs(inertia.panVelocityY) > 0.35) {
    if (typeof markCameraInteracting === "function") {
      markCameraInteracting();
    }
    world.needsRender = true;
    return true;
  }

  return false;
};

PS.camera.getPanVector = function () {
  var view = PS.camera.getView();
  var eastMeters = Number(view.panEastMeters) || 0;
  var northMeters = Number(view.panNorthMeters) || 0;
  var magnitude = Math.sqrt(eastMeters * eastMeters + northMeters * northMeters);

  if (magnitude <= 0.000001) {
    return {
      eastMeters: 0,
      northMeters: 0,
      magnitude: 0,
      eastUnit: 0,
      northUnit: 0
    };
  }

  return {
    eastMeters: eastMeters,
    northMeters: northMeters,
    magnitude: magnitude,
    eastUnit: eastMeters / magnitude,
    northUnit: northMeters / magnitude
  };
};

PS.camera.rebuildShaders = function () {};
PS.camera.rebuildTextures = function () {};
