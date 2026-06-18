const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  PS: {
    render: {}
  },
  CONFIG: {
    TILE_SIZE: 10
  },
  WORLD_WIDTH: 20,
  WORLD_HEIGHT: 10,
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },
  isGlobeRenderMode() {
    return false;
  },
  getEntitySurfacePosition(entity) {
    if (
      entity &&
      Number.isFinite(Number(entity.latitude)) &&
      Number.isFinite(Number(entity.longitude))
    ) {
      return {
        latitude: Number(entity.latitude),
        longitude: Number(entity.longitude)
      };
    }

    return null;
  },
  ensureEntitySurfacePosition(entity) {
    return entity;
  },
  isPlanetLocalView() {
    return false;
  },
  projectPlanetLocalPoint(longitude, latitude) {
    return {
      x: 100 + longitude,
      y: 200 - latitude,
      scale: 1.4
    };
  },
  projectPlanetPoint() {
    return null;
  },
  interpolateLongitudeDeg(fromLongitude, toLongitude, amount) {
    return fromLongitude + (toLongitude - fromLongitude) * amount;
  },
  drawEntityAtCanvasPosition() {}
};

vm.runInNewContext(`${read("js/render/entities.js")}

var midpoint = PS.render.entities.getRenderPosition({
  prevX: 2,
  prevY: 4,
  x: 4,
  y: 8
}, 0.5);

assert.strictEqual(midpoint.x, 35, "flat render X should interpolate between previous and current tile centers");
assert.strictEqual(midpoint.y, 65, "flat render Y should interpolate between previous and current tile centers");

var wrapped = PS.render.entities.getRenderPosition({
  prevX: 19,
  prevY: 5,
  x: 0,
  y: 5
}, 0.5);

assert.strictEqual(wrapped.x, 200, "wrapped flat render X should take the shortest world-edge path");
assert.strictEqual(wrapped.y, 55, "wrapped flat render Y should stay centered on the row");

var current = PS.render.entities.getRenderPosition({
  prevX: 2,
  prevY: 2,
  x: 7,
  y: 3
}, 1);

assert.strictEqual(current.x, 75, "full interpolation should render current X");
assert.strictEqual(current.y, 35, "full interpolation should render current Y");

isGlobeRenderMode = function() {
  return true;
};
isPlanetLocalView = function() {
  return true;
};

var settlementPoint = PS.render.entities.getSettlementRenderPosition({
  id: 12,
  x: 7,
  y: 3,
  latitude: 11,
  longitude: -41
});

assert.strictEqual(settlementPoint.x, 59, "local settlement render X should use surface longitude projection");
assert.strictEqual(settlementPoint.y, 189, "local settlement render Y should use surface latitude projection");
assert.strictEqual(settlementPoint.scale, 1.4, "local settlement render should preserve projected scale");

console.log("render interpolation checks passed");
`, context);
