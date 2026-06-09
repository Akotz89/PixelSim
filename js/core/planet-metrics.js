"use strict";
PS.planet = PS.planet || {};
PS.planet.metrics = PS.planet.metrics || {};

PS.planet.metrics.getRadiusKm = function () {
  return Math.max(1, Number(CONFIG.PLANET_RADIUS_KM) || 6371);
};

PS.planet.metrics.getCircumferenceKm = function () {
  return 2 * Math.PI * PS.planet.metrics.getRadiusKm();
};

PS.planet.metrics.getPoleToPoleKm = function () {
  return Math.PI * PS.planet.metrics.getRadiusKm();
};

PS.planet.metrics.getEquatorKmPerTile = function () {
  return PS.planet.metrics.getCircumferenceKm() / Math.max(1, WORLD_WIDTH);
};

PS.planet.metrics.getMeridianKmPerTile = function () {
  return PS.planet.metrics.getPoleToPoleKm() / Math.max(1, WORLD_HEIGHT);
};

PS.planet.metrics.getLatitudeForTile = function (y) {
  return 90 - ((Math.max(0, Number(y) || 0) + 0.5) / Math.max(1, WORLD_HEIGHT)) * 180;
};

PS.planet.metrics.getLongitudeForTile = function (x) {
  return ((Math.max(0, Number(x) || 0) + 0.5) / Math.max(1, WORLD_WIDTH)) * 360 - 180;
};

PS.planet.metrics.getTileLatitudeStepDeg = function () {
  return 180 / Math.max(1, WORLD_HEIGHT);
};

PS.planet.metrics.getTileLongitudeStepDeg = function () {
  return 360 / Math.max(1, WORLD_WIDTH);
};

PS.planet.metrics.getLatitudeScale = function (latitude) {
  return Math.max(0.08, Math.cos((Number(latitude) || 0) * Math.PI / 180));
};

PS.planet.metrics.getTileAreaKm2 = function (latitude) {
  var latitudeCenter = clamp(Number(latitude) || 0, -90, 90);
  var latitudeStep = 180 / Math.max(1, WORLD_HEIGHT);
  var longitudeStep = (360 / Math.max(1, WORLD_WIDTH)) * Math.PI / 180;
  var northLatitude = clamp(latitudeCenter + latitudeStep / 2, -90, 90) * Math.PI / 180;
  var southLatitude = clamp(latitudeCenter - latitudeStep / 2, -90, 90) * Math.PI / 180;
  var radius = PS.planet.metrics.getRadiusKm();

  return radius * radius * longitudeStep * Math.abs(Math.sin(northLatitude) - Math.sin(southLatitude));
};

PS.planet.metrics.makeTile = function (x, y, biome, fertilityScore, moisture, elevation) {
  var latitude = PS.planet.metrics.getLatitudeForTile(y);
  return {
    x: x,
    y: y,
    latitude: latitude,
    longitude: PS.planet.metrics.getLongitudeForTile(x),
    areaKm2: PS.planet.metrics.getTileAreaKm2(latitude),
    biome: biome,
    fertilityScore: fertilityScore,
    moisture: moisture,
    elevation: elevation
  };
};

PS.planet.metrics.refreshSummary = function () {
  var landTiles = 0;
  var waterTiles = 0;
  var fertileTiles = 0;
  var totalAreaKm2 = 0;
  var landAreaKm2 = 0;
  var waterAreaKm2 = 0;
  var fertileAreaKm2 = 0;

  if (Array.isArray(world.planetTiles)) {
    for (var i = 0; i < world.planetTiles.length; i++) {
      var tile = world.planetTiles[i];

      if (!tile) {
        continue;
      }

      totalAreaKm2 += Math.max(0, Number(tile.areaKm2) || 0);

      if (tile.biome === "ocean") {
        waterTiles++;
        waterAreaKm2 += Math.max(0, Number(tile.areaKm2) || 0);
      } else {
        landTiles++;
        landAreaKm2 += Math.max(0, Number(tile.areaKm2) || 0);
      }

      if (tile.biome === "forest" || tile.biome === "grassland") {
        fertileAreaKm2 += Math.max(0, Number(tile.areaKm2) || 0);
      }
    }
  }

  fertileTiles = Math.max(0, Number(world.fertileTiles) || 0);
  world.planetSummary = {
    name: CONFIG.PLANET_NAME || "Earth",
    radiusKm: PS.planet.metrics.getRadiusKm(),
    circumferenceKm: PS.planet.metrics.getCircumferenceKm(),
    poleToPoleKm: PS.planet.metrics.getPoleToPoleKm(),
    equatorKmPerTile: PS.planet.metrics.getEquatorKmPerTile(),
    meridianKmPerTile: PS.planet.metrics.getMeridianKmPerTile(),
    totalAreaKm2: totalAreaKm2,
    landAreaKm2: landAreaKm2,
    waterAreaKm2: waterAreaKm2,
    fertileAreaKm2: fertileAreaKm2,
    landTiles: landTiles,
    waterTiles: waterTiles,
    fertileTiles: fertileTiles,
    waterTilePercent: world.planetTiles && world.planetTiles.length > 0 ? (waterTiles / world.planetTiles.length) * 100 : 0,
    waterPercent: totalAreaKm2 > 0 ? (waterAreaKm2 / totalAreaKm2) * 100 : 0,
    fertileLandPercent: landAreaKm2 > 0 ? (fertileAreaKm2 / landAreaKm2) * 100 : 0,
    fertileTileLandPercent: landTiles > 0 ? (fertileTiles / landTiles) * 100 : 0
  };

  return world.planetSummary;
};
