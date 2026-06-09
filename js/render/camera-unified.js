PS.camera = PS.camera || {};

PS.camera.unified = PS.camera.unified || {
  state: {
    x: 0,
    y: 0,
    zoom: 0,
    rotation: 0,
    viewportW: 0,
    viewportH: 0
  },

  getViewport: function () {
    var viewportW = typeof canvas !== "undefined" && canvas ? Number(canvas.width) || 0 : 0;
    var viewportH = typeof canvas !== "undefined" && canvas ? Number(canvas.height) || 0 : 0;

    this.state.viewportW = viewportW;
    this.state.viewportH = viewportH;

    return {
      width: viewportW,
      height: viewportH,
      centerX: viewportW / 2,
      centerY: viewportH / 2
    };
  },

  normalizeLongitude: function (longitude) {
    return ((Number(longitude) || 0) + 540) % 360 - 180;
  },

  getLatitudeScale: function (latitude) {
    if (PS.planet && PS.planet.metrics && typeof PS.planet.metrics.getLatitudeScale === "function") {
      return PS.planet.metrics.getLatitudeScale(latitude);
    }

    return Math.max(0.08, Math.cos((Number(latitude) || 0) * Math.PI / 180));
  },

  getLatitudeDistanceKmPerDegree: function () {
    if (PS.planet && PS.planet.metrics && typeof PS.planet.metrics.getPoleToPoleKm === "function") {
      return PS.planet.metrics.getPoleToPoleKm() / 180;
    }

    return 111.32;
  },

  getLongitudeDistanceKmPerDegree: function (latitude) {
    var circumferenceKm = PS.planet && PS.planet.metrics && typeof PS.planet.metrics.getCircumferenceKm === "function"
      ? PS.planet.metrics.getCircumferenceKm()
      : 40075;

    return Math.max(0.001, (circumferenceKm / 360) * this.getLatitudeScale(latitude));
  },

  getSurfaceMeters: function (latitude, longitude) {
    return {
      northMeters: (Number(latitude) || 0) * this.getLatitudeDistanceKmPerDegree() * 1000,
      eastMeters: this.normalizeLongitude(longitude) * this.getLongitudeDistanceKmPerDegree(latitude) * 1000
    };
  },

  getCenterSurfaceMeters: function () {
    var state = this.syncFromPlanetView();
    var centerLatLon = this.worldToLatLon(state.x, state.y);

    return this.getSurfaceMeters(centerLatLon.latitude, centerLatLon.longitude);
  },

  surfaceMetersToScreen: function (eastMeters, northMeters) {
    var viewport = this.getViewport();
    var centerMeters = this.getCenterSurfaceMeters();

    return {
      screenX: viewport.centerX + ((Number(eastMeters) - centerMeters.eastMeters) / this.getMetersPerSample()) * CONFIG.TILE_SIZE,
      screenY: viewport.centerY - ((Number(northMeters) - centerMeters.northMeters) / this.getMetersPerSample()) * CONFIG.TILE_SIZE
    };
  },

  screenToSurfaceMeters: function (screenX, screenY) {
    var viewport = this.getViewport();
    var centerMeters = this.getCenterSurfaceMeters();

    return {
      eastMeters: centerMeters.eastMeters + ((Number(screenX) || 0) - viewport.centerX) / CONFIG.TILE_SIZE * this.getMetersPerSample(),
      northMeters: centerMeters.northMeters - ((Number(screenY) || 0) - viewport.centerY) / CONFIG.TILE_SIZE * this.getMetersPerSample()
    };
  },

  clientToScreen: function (clientX, clientY) {
    var rect = canvas.getBoundingClientRect();

    return {
      canvasX: (Number(clientX) - rect.left) * (canvas.width / rect.width),
      canvasY: (Number(clientY) - rect.top) * (canvas.height / rect.height)
    };
  },

  getLatLonFromSurfaceMeters: function (eastMeters, northMeters) {
    var latitude = clamp(
      (Number(northMeters) || 0) / (this.getLatitudeDistanceKmPerDegree() * 1000),
      -90,
      90
    );
    var longitude = this.normalizeLongitude(
      (Number(eastMeters) || 0) / (this.getLongitudeDistanceKmPerDegree(latitude) * 1000)
    );

    return {
      latitude: latitude,
      longitude: longitude
    };
  },

  latLonToWorld: function (latitude, longitude) {
    return {
      worldX: ((this.normalizeLongitude(longitude) + 180) / 360) * Math.max(1, WORLD_WIDTH),
      worldY: ((90 - clamp(Number(latitude) || 0, -90, 90)) / 180) * Math.max(1, WORLD_HEIGHT)
    };
  },

  worldToLatLon: function (worldX, worldY) {
    return {
      latitude: 90 - (clamp(Number(worldY) || 0, 0, WORLD_HEIGHT) / Math.max(1, WORLD_HEIGHT)) * 180,
      longitude: this.normalizeLongitude(((Number(worldX) || 0) / Math.max(1, WORLD_WIDTH)) * 360 - 180)
    };
  },

  syncFromPlanetView: function () {
    var view = world && world.planetView ? world.planetView : null;
    var latitude = view ? Number(view.latitude) || 0 : Number(CONFIG.PLANET_VIEW_LATITUDE_DEG) || 0;
    var longitude = view ? Number(view.longitude) || 0 : Number(CONFIG.PLANET_VIEW_LONGITUDE_DEG) || 0;
    var worldPoint = this.latLonToWorld(latitude, longitude);
    var viewport = this.getViewport();

    this.state.x = worldPoint.worldX;
    this.state.y = worldPoint.worldY;
    this.state.zoom = view ? Number(view.zoomLevel) || 0 : Number(CONFIG.PLANET_ZOOM_LEVEL) || 0;
    this.state.rotation = view && Number.isFinite(Number(view.rotation)) ? Number(view.rotation) : 0;
    this.state.viewportW = viewport.width;
    this.state.viewportH = viewport.height;

    return this.getState();
  },

  getState: function () {
    return {
      x: this.state.x,
      y: this.state.y,
      zoom: this.state.zoom,
      rotation: this.state.rotation,
      viewportW: this.state.viewportW,
      viewportH: this.state.viewportH
    };
  },

  setState: function (nextState) {
    nextState = nextState || {};

    if (Number.isFinite(Number(nextState.x))) {
      this.state.x = Number(nextState.x);
    }

    if (Number.isFinite(Number(nextState.y))) {
      this.state.y = Number(nextState.y);
    }

    if (Number.isFinite(Number(nextState.zoom))) {
      this.state.zoom = Number(nextState.zoom);
    }

    if (Number.isFinite(Number(nextState.rotation))) {
      this.state.rotation = Number(nextState.rotation);
    }

    if (Number.isFinite(Number(nextState.viewportW))) {
      this.state.viewportW = Number(nextState.viewportW);
    }

    if (Number.isFinite(Number(nextState.viewportH))) {
      this.state.viewportH = Number(nextState.viewportH);
    }

    return this.getState();
  },

  getZoomBand: function () {
    var zoom = this.syncFromPlanetView().zoom;

    if (zoom < 0.75) {
      return "orbit";
    }

    if (zoom < 1.75) {
      return "planet";
    }

    if (zoom < 3.75) {
      return "region";
    }

    if (zoom < 5.75) {
      return "local";
    }

    return "settlement";
  },

  tileToWorld: function (tileX, tileY) {
    return {
      worldX: getWrappedWorldX(tileX) + 0.5,
      worldY: getClampedWorldY(tileY) + 0.5
    };
  },

  worldToTile: function (worldX, worldY) {
    return {
      tileX: getWrappedWorldX(Math.floor(Number(worldX) || 0)),
      tileY: getClampedWorldY(Math.floor(Number(worldY) || 0))
    };
  },

  getMetersPerSample: function () {
    if (PS.camera && typeof PS.camera.getScale === "function") {
      return Math.max(0.1, PS.camera.getScale().metersPerSample);
    }

    return Math.max(0.1, Number(CONFIG.PLANET_ZOOM_LEVELS && CONFIG.PLANET_ZOOM_LEVELS[0] && CONFIG.PLANET_ZOOM_LEVELS[0].metersPerSample) || 1);
  },

  isLocalView: function () {
    var zoom = this.syncFromPlanetView().zoom;
    var alphas = PS.render && PS.render.lod && typeof PS.render.lod.getLayerAlphas === "function"
      ? PS.render.lod.getLayerAlphas(zoom)
      : null;

    return alphas ? alphas.tiles >= 0.999 && alphas.globe <= 0.001 : zoom >= 1.4;
  },

  isTransitioning: function () {
    var zoom = this.syncFromPlanetView().zoom;
    var alphas = PS.render && PS.render.lod && typeof PS.render.lod.getLayerAlphas === "function"
      ? PS.render.lod.getLayerAlphas(zoom)
      : null;

    return alphas
      ? alphas.globe > 0.01 && alphas.tiles > 0.01
      : zoom >= 0.8 && zoom < 1.4;
  },

  worldToScreen: function (worldX, worldY) {
    var latLon = this.worldToLatLon(worldX, worldY);
    return this.latLonToScreen(latLon.latitude, latLon.longitude);
  },

  latLonToScreen: function (latitude, longitude) {
    var viewport = this.getViewport();
    var state = this.syncFromPlanetView();
    var viewLatLon = this.worldToLatLon(state.x, state.y);
    var targetMeters;
    var viewMeters;
    var projection;

    if (!isGlobeRenderMode() || this.isLocalView()) {
      targetMeters = this.getSurfaceMeters(latitude, longitude);
      viewMeters = this.getCenterSurfaceMeters();

      return {
        screenX: viewport.centerX + ((targetMeters.eastMeters - viewMeters.eastMeters) / this.getMetersPerSample()) * CONFIG.TILE_SIZE,
        screenY: viewport.centerY - ((targetMeters.northMeters - viewMeters.northMeters) / this.getMetersPerSample()) * CONFIG.TILE_SIZE
      };
    }

    projection = this.projectLatLon(longitude, latitude);

    return projection ? {
      screenX: projection.x,
      screenY: projection.y,
      scale: projection.scale,
      visibility: projection.visibility,
      visible: projection.visible
    } : null;
  },

  screenToWorld: function (screenX, screenY) {
    var latLon = this.screenToLatLon(screenX, screenY);
    return latLon ? this.latLonToWorld(latLon.latitude, latLon.longitude) : null;
  },

  screenToTile: function (screenX, screenY) {
    var worldPoint = this.screenToWorld(screenX, screenY);
    return worldPoint ? this.worldToTile(worldPoint.worldX, worldPoint.worldY) : null;
  },

  screenToLatLon: function (screenX, screenY) {
    var viewport = this.getViewport();
    var state = this.syncFromPlanetView();
    var centerLatLon = this.worldToLatLon(state.x, state.y);
    var centerMeters;
    var eastMeters;
    var northMeters;
    var projection;
    var normalizedX;
    var normalizedYNorth;
    var rho;
    var centerLatitude;
    var centerLongitude;
    var angularDistance;
    var latitude;
    var longitude;

    if (!isGlobeRenderMode()) {
      return this.worldToLatLon(
        (Number(screenX) || 0) / CONFIG.TILE_SIZE,
        (Number(screenY) || 0) / CONFIG.TILE_SIZE
      );
    }

    if (this.isLocalView()) {
      centerMeters = this.screenToSurfaceMeters(screenX, screenY);
      eastMeters = centerMeters.eastMeters;
      northMeters = centerMeters.northMeters;
      return this.getLatLonFromSurfaceMeters(eastMeters, northMeters);
    }

    projection = this.getProjection();
    normalizedX = ((Number(screenX) || 0) - projection.centerX) / projection.radius;
    normalizedYNorth = -((Number(screenY) || 0) - projection.centerY) / projection.radius;
    rho = Math.sqrt(normalizedX * normalizedX + normalizedYNorth * normalizedYNorth);

    if (rho > 1) {
      return null;
    }

    if (rho === 0) {
      return {
        latitude: projection.viewLatitudeDeg,
        longitude: projection.viewLongitudeDeg
      };
    }

    centerLatitude = projection.viewLatitudeDeg * Math.PI / 180;
    centerLongitude = projection.viewLongitudeDeg * Math.PI / 180;
    angularDistance = Math.asin(rho);
    latitude = Math.asin(
      Math.cos(angularDistance) * Math.sin(centerLatitude) +
      (normalizedYNorth * Math.sin(angularDistance) * Math.cos(centerLatitude)) / rho
    );
    longitude = centerLongitude + Math.atan2(
      normalizedX * Math.sin(angularDistance),
      rho * Math.cos(centerLatitude) * Math.cos(angularDistance) -
        normalizedYNorth * Math.sin(centerLatitude) * Math.sin(angularDistance)
    );

    return {
      latitude: clamp(latitude * 180 / Math.PI, -90, 90),
      longitude: this.normalizeLongitude(longitude * 180 / Math.PI)
    };
  },

  getProjection: function () {
    var viewport = this.getViewport();
    var state = this.syncFromPlanetView();
    var viewLatLon = this.worldToLatLon(state.x, state.y);
    var zoomFactor = PS.camera && typeof PS.camera.getZoomFactor === "function"
      ? PS.camera.getZoomFactor()
      : 1;

    return {
      centerX: viewport.centerX,
      centerY: viewport.centerY,
      radius: Math.floor(Math.min(viewport.width, viewport.height) * 0.46 * zoomFactor),
      viewLongitudeDeg: viewLatLon.longitude,
      viewLatitudeDeg: viewLatLon.latitude,
      zoomFactor: zoomFactor
    };
  },

  wrapLongitudeDelta: function (degrees) {
    var delta = Number(degrees) || 0;

    while (delta < -180) {
      delta += 360;
    }

    while (delta > 180) {
      delta -= 360;
    }

    return delta;
  },

  projectLatLon: function (longitudeDeg, latitudeDeg) {
    var projection = this.getProjection();
    var latitude = (Number(latitudeDeg) || 0) * Math.PI / 180;
    var centerLatitude = projection.viewLatitudeDeg * Math.PI / 180;
    var longitudeDelta = this.wrapLongitudeDelta(
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
  },

  getVisibleTileRect: function () {
    var viewport = this.getViewport();
    var points = [
      this.screenToWorld(0, 0),
      this.screenToWorld(viewport.width, 0),
      this.screenToWorld(0, viewport.height),
      this.screenToWorld(viewport.width, viewport.height)
    ].filter(Boolean);
    var minX;
    var minY;
    var maxX;
    var maxY;

    if (points.length < 4 || (!this.isLocalView() && !this.isTransitioning() && isGlobeRenderMode())) {
      return {
        minX: 0,
        minY: 0,
        maxX: WORLD_WIDTH - 1,
        maxY: WORLD_HEIGHT - 1
      };
    }

    minX = points[0].worldX;
    maxX = points[0].worldX;
    minY = points[0].worldY;
    maxY = points[0].worldY;

    points.forEach(function (point) {
      minX = Math.min(minX, point.worldX);
      maxX = Math.max(maxX, point.worldX);
      minY = Math.min(minY, point.worldY);
      maxY = Math.max(maxY, point.worldY);
    });

    if (maxX - minX > WORLD_WIDTH / 2) {
      minX = 0;
      maxX = WORLD_WIDTH - 1;
    }

    return {
      minX: clamp(Math.floor(minX) - 1, 0, WORLD_WIDTH - 1),
      minY: clamp(Math.floor(minY) - 1, 0, WORLD_HEIGHT - 1),
      maxX: clamp(Math.ceil(maxX) + 1, 0, WORLD_WIDTH - 1),
      maxY: clamp(Math.ceil(maxY) + 1, 0, WORLD_HEIGHT - 1)
    };
  }
};
