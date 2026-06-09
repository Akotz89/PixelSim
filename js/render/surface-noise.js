PS.render = PS.render || {};
PS.render.surfaceNoise = PS.render.surfaceNoise || {};

PS.render.surfaceNoise.getLayerNoise = function (meters, patchMeters, salt) {
  var normalizedPatchMeters = Math.max(1, Number(patchMeters) || 1);
  var eastCell = (Number(meters.eastMeters) || 0) / normalizedPatchMeters;
  var northCell = (Number(meters.northMeters) || 0) / normalizedPatchMeters;
  var cellEast = Math.floor(eastCell);
  var cellNorth = Math.floor(northCell);
  var eastAmount = PS.render.surfaceNoise.smoothAmount(eastCell - cellEast);
  var northAmount = PS.render.surfaceNoise.smoothAmount(northCell - cellNorth);
  var topLeft = PS.render.surfaceNoise.getCellNoise(cellEast, cellNorth, normalizedPatchMeters, salt);
  var topRight = PS.render.surfaceNoise.getCellNoise(cellEast + 1, cellNorth, normalizedPatchMeters, salt);
  var bottomLeft = PS.render.surfaceNoise.getCellNoise(cellEast, cellNorth + 1, normalizedPatchMeters, salt);
  var bottomRight = PS.render.surfaceNoise.getCellNoise(cellEast + 1, cellNorth + 1, normalizedPatchMeters, salt);
  var top = topLeft + (topRight - topLeft) * eastAmount;
  var bottom = bottomLeft + (bottomRight - bottomLeft) * eastAmount;

  return top + (bottom - top) * northAmount;
};

PS.render.surfaceNoise.smoothAmount = function (amount) {
  var t = clamp(Number(amount) || 0, 0, 1);

  return t * t * (3 - 2 * t);
};

PS.render.surfaceNoise.getSeed = function (patchMeters, salt) {
  var seedOffset = typeof hashSeedText === "function" ? hashSeedText(world.seedText || "") % 100000 : 0;

  return Math.round(Number(patchMeters) || 1) + (Number(salt) || 0) * 31 + seedOffset;
};

PS.render.surfaceNoise.getCellNoise = function (cellEast, cellNorth, patchMeters, salt) {
  return getDeterministicUnitNoise(
    Math.round(Number(cellEast) || 0) + (Number(salt) || 0) * 17,
    Math.round(Number(cellNorth) || 0) - (Number(salt) || 0) * 23,
    PS.render.surfaceNoise.getSeed(patchMeters, salt)
  );
};

PS.render.surfaceNoise.getPixelNoise = function (meters, patchMeters, salt) {
  var normalizedPatchMeters = Math.max(1, Number(patchMeters) || 1);
  var cellEast = Math.floor((Number(meters.eastMeters) || 0) / normalizedPatchMeters);
  var cellNorth = Math.floor((Number(meters.northMeters) || 0) / normalizedPatchMeters);

  return PS.render.surfaceNoise.getCellNoise(cellEast, cellNorth, normalizedPatchMeters, salt);
};

PS.render.surfaceNoise.getQuantized = function (latitude, longitude, metersPerPatch) {
  var patchMeters = Math.max(1, Number(metersPerPatch) || 1);
  var latitudeMeters = latitude * getLatitudeDistanceKmPerDegree() * 1000;
  var longitudeMeters = longitude * getLongitudeDistanceKmPerDegree(latitude) * 1000;
  var cellLatitude = Math.floor(latitudeMeters / patchMeters);
  var cellLongitude = Math.floor(longitudeMeters / patchMeters);

  return PS.math.deterministicUnitNoise(cellLatitude, cellLongitude, patchMeters);
};

PS.render.surfaceNoise.getSnowSignal = function (tile, latitude) {
  var biome = tile && tile.biome ? tile.biome : "unknown";
  var absLatitude = Math.abs(Number(latitude) || 0);
  var elevationValue = tile && Number.isFinite(Number(tile.elevation)) ? Number(tile.elevation) : 0;
  var elevation = clamp((Math.tanh(elevationValue / 2) + 1) / 2, 0, 1);
  var ridge = clamp(tile && Number.isFinite(Number(tile.ridgeStrength)) ? Number(tile.ridgeStrength) : 0, 0, 1);
  var roughness = clamp(tile && Number.isFinite(Number(tile.roughness)) ? Number(tile.roughness) : 0, 0, 1);
  var highlandLift = clamp(tile && Number.isFinite(Number(tile.highlandLift)) ? Number(tile.highlandLift) / 1.4 : 0, 0, 1);
  var polarSnow = clamp((absLatitude - 62) / 24, 0, 1) * clamp((elevation - 0.44) / 0.34 + ridge * 0.20, 0, 1);
  var mountainSnow =
    clamp((elevation - 0.76) / 0.18, 0, 1) *
    clamp(ridge * 0.52 + highlandLift * 0.38 + roughness * 0.10 - 0.26, 0, 1) *
    clamp((absLatitude - 18) / 42, 0, 1);

  if (biome === "ice") {
    return clamp(0.78 + polarSnow * 0.20 + ridge * 0.08, 0, 1);
  }

  if (biome === "ocean") {
    return clamp(polarSnow * 0.18, 0, 0.22);
  }

  return clamp(Math.max(polarSnow, mountainSnow), 0, 0.86);
};

PS.render.surfaceNoise.getRegionalContext = function (tile) {
  var seaLevelDelta = tile ? Number(tile.seaLevelDelta) : 0;

  return {
    continentShape: clamp(tile && Number.isFinite(Number(tile.continentShape)) ? Number(tile.continentShape) : 0, 0, 1.15),
    plateInfluence: clamp(tile && Number.isFinite(Number(tile.plateInfluence)) ? Number(tile.plateInfluence) : 0, 0, 1),
    islandArc: clamp(tile && Number.isFinite(Number(tile.islandArc)) ? Number(tile.islandArc) : 0, 0, 1),
    shelfStrength: clamp(tile && Number.isFinite(Number(tile.shelfStrength)) ? Number(tile.shelfStrength) : 0, 0, 1),
    seaLevelDelta: Number.isFinite(seaLevelDelta) ? seaLevelDelta : 0,
    highlandLift: clamp(tile && Number.isFinite(Number(tile.highlandLift)) ? Number(tile.highlandLift) : 0, 0, 1.4),
    coastFactor: clamp(tile && Number.isFinite(Number(tile.coastFactor)) ? Number(tile.coastFactor) : 0, 0, 1),
    coastlineNoise: clamp(tile && Number.isFinite(Number(tile.coastlineNoise)) ? Number(tile.coastlineNoise) : 0, 0, 1)
  };
};
