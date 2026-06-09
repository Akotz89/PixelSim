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
      chunkKm: lower.chunkKm
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
    chunkKm: PS.camera.interpolateScaleValue(lower.chunkKm, upper.chunkKm, amount)
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
  var eastKm = -(Number(deltaX) || 0) * scale.metersPerSample / CONFIG.TILE_SIZE / 1000;
  var northKm = (Number(deltaY) || 0) * scale.metersPerSample / CONFIG.TILE_SIZE / 1000;

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

PS.camera.setZoom = function (zoomLevel) {
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

  if (!PS.camera.setZoom(zoomLevel)) {
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

PS.camera.getZoomTransitionStats = function () {
  return Object.assign({}, PS.camera.stats);
};

PS.camera.adjustZoom = function (delta) {
  return PS.camera.setZoom(PS.camera.getView().zoomLevel + (Number(delta) || 0));
};

PS.camera.adjustZoomAtCanvasPoint = function (delta, canvasX, canvasY) {
  return PS.camera.setZoomAtCanvasPoint(
    PS.camera.getView().zoomLevel + (Number(delta) || 0),
    canvasX,
    canvasY
  );
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
