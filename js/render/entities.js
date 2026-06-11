"use strict";
PS.render = PS.render || {};
PS.render.entities = PS.render.entities || {};

PS.render.entities.organismRenderPerf = PS.render.entities.organismRenderPerf || {
  lastOrganismRenderCount: 0,
  lastSpriteCacheHits: 0,
  lastSpriteCacheMisses: 0,
  lastAnimationSeedComputes: 0,
  lastEstimatedRenderObjectsPerSecond: 0
};

PS.render.entities.getTileRenderPosition = function (tileX, tileY) {
  if (isGlobeRenderMode()) {
    return getPlanetInterpolatedProjection(tileX, tileY);
  }

  return {
    x: tileX * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    y: tileY * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    scale: 1,
    visibility: 1,
    visible: true
  };
};

PS.render.entities.drawTileEntity = function (tileX, tileY, size, color) {
  var point = PS.render.entities.getTileRenderPosition(tileX, tileY);

  if (!point) {
    return;
  }

  drawEntityAtCanvasPosition(
    point.x,
    point.y,
    Math.max(1, size * (point.scale || 1)),
    color
  );
};

PS.render.entities.getInterpolationAmount = function (interpolation) {
  var rawInterpolation = Number(interpolation);
  return Number.isFinite(rawInterpolation) ? clamp(rawInterpolation, 0, 1) : 1;
};

PS.render.entities.getInterpolatedTileCoordinate = function (previous, current, amount, worldSize, shouldWrap) {
  var from = Number(previous);
  var to = Number(current);

  if (!Number.isFinite(from) || !Number.isFinite(to) || amount >= 1) {
    return to;
  }

  var delta = to - from;

  if (shouldWrap && worldSize > 0 && Math.abs(delta) > worldSize / 2) {
    delta += delta > 0 ? -worldSize : worldSize;
  }

  var value = from + delta * amount;

  if (shouldWrap && worldSize > 0) {
    while (value < 0) {
      value += worldSize;
    }

    while (value >= worldSize) {
      value -= worldSize;
    }
  }

  return value;
};

PS.render.entities.getInterpolatedTileRenderPosition = function (entity, amount) {
  if (!entity) {
    return null;
  }

  return PS.render.entities.getTileRenderPosition(
    PS.render.entities.getInterpolatedTileCoordinate(entity.prevX, entity.x, amount, WORLD_WIDTH, true),
    PS.render.entities.getInterpolatedTileCoordinate(entity.prevY, entity.y, amount, WORLD_HEIGHT, false)
  );
};

PS.render.entities.getRenderPosition = function (entity, interpolation) {
  if (!entity) {
    return null;
  }

  var amount = PS.render.entities.getInterpolationAmount(interpolation);

  if (!isGlobeRenderMode()) {
    return PS.render.entities.getInterpolatedTileRenderPosition(entity, amount);
  }

  var surfacePosition = getEntitySurfacePosition(entity);

  if (!surfacePosition) {
    return PS.render.entities.getInterpolatedTileRenderPosition(entity, amount);
  }

  ensureEntitySurfacePosition(entity);

  var renderLatitude = surfacePosition.latitude;
  var renderLongitude = surfacePosition.longitude;

  if (
    amount < 1 &&
    Number.isFinite(Number(entity.prevLatitude)) &&
    Number.isFinite(Number(entity.prevLongitude))
  ) {
    renderLatitude = Number(entity.prevLatitude) + (surfacePosition.latitude - Number(entity.prevLatitude)) * amount;
    renderLongitude = interpolateLongitudeDeg(entity.prevLongitude, surfacePosition.longitude, amount);
  }

  if (isGlobeRenderMode()) {
    if (isPlanetLocalView()) {
      return projectPlanetLocalPoint(renderLongitude, renderLatitude);
    }

    return projectPlanetPoint(renderLongitude, renderLatitude);
  }

  return PS.render.entities.getTileRenderPosition(entity.x, entity.y);
};

PS.render.entities.writeRenderPosition = function (entity, interpolation, output) {
  var out = output || {};
  var amount;
  var x;
  var y;
  var projected;

  if (!entity) {
    return null;
  }

  if (isGlobeRenderMode()) {
    projected = PS.render.entities.getRenderPosition(entity, interpolation);
    if (!projected) {
      return null;
    }
    out.x = projected.x;
    out.y = projected.y;
    out.scale = projected.scale;
    out.visibility = projected.visibility;
    out.visible = projected.visible;
    return out;
  }

  amount = PS.render.entities.getInterpolationAmount(interpolation);
  x = PS.render.entities.getInterpolatedTileCoordinate(entity.prevX, entity.x, amount, WORLD_WIDTH, true);
  y = PS.render.entities.getInterpolatedTileCoordinate(entity.prevY, entity.y, amount, WORLD_HEIGHT, false);
  out.x = x * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
  out.y = y * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
  out.scale = 1;
  out.visibility = 1;
  out.visible = true;
  return out;
};

PS.render.entities.drawSurfaceEntity = function (entity, interpolation, size, color, spriteId, state) {
  var point = PS.render.entities.getRenderPosition(entity, interpolation);
  var cell = spriteId && PS.atlas && typeof PS.atlas.getCell === "function"
    ? PS.atlas.getCell(spriteId)
    : null;
  var drawSize = Math.max(1, Number(size) || CONFIG.ORGANISM_DRAW_SIZE || 4);
  var alpha = point && Number.isFinite(Number(point.visibility)) ? Number(point.visibility) : 1;

  if (!point || point.visible === false || !cell || !PS.render.webgpuEntity || typeof PS.render.webgpuEntity.drawCell !== "function") {
    return false;
  }

  return PS.render.webgpuEntity.drawCell(
    cell,
    point.x - drawSize / 2,
    point.y - drawSize / 2,
    drawSize,
    drawSize,
    {
      alpha: alpha,
      kind: state && state.kind ? state.kind : ""
    }
  );
};

PS.render.entities.shouldDrawGlobeScaleEntities = function () {
  return !isGlobeRenderMode() ||
    isPlanetLocalView() ||
    Boolean(CONFIG.PLANET_GLOBE_ENTITY_MARKERS) ||
    Boolean(CONFIG.PLANET_DEBUG_OVERLAY);
};

PS.render.entities.createEntityBatches = function () {
  return PS.render.webgpuEntity && typeof PS.render.webgpuEntity.beginBatches === "function"
    ? PS.render.webgpuEntity.beginBatches()
    : null;
};

PS.render.entities.appendEntityCell = function (batches, cell, point, size, alpha, kind, offsetX, offsetY, tint) {
  var drawSize = Math.max(1, Number(size) || 1);
  var visibility = point && Number.isFinite(Number(point.visibility)) ? Number(point.visibility) : 1;

  if (!batches || !cell || !point || point.visible === false || !PS.render.webgpuEntity) {
    return false;
  }

  PS.render.webgpuEntity.appendCell(
    batches,
    cell,
    point.x - drawSize / 2 + (Number(offsetX) || 0),
    point.y - drawSize / 2 + (Number(offsetY) || 0),
    drawSize,
    drawSize,
    Math.max(0, Math.min(1, (Number(alpha) || 1) * visibility)),
    tint || null,
    kind || ""
  );
  return true;
};

PS.render.entities.drawEntityBatches = function (batches, drawn) {
  return drawn > 0 && PS.render.webgpuEntity && typeof PS.render.webgpuEntity.drawBatches === "function"
    ? PS.render.webgpuEntity.drawBatches(batches, { useGbuffer: true })
    : false;
};

PS.render.entities.drawFood = function () {
  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  var items = world && Array.isArray(world.food) ? world.food : [];
  var batches = PS.render.webgpuEntity && typeof PS.render.webgpuEntity.beginBatches === "function"
    ? PS.render.webgpuEntity.beginBatches()
    : null;
  var drawSize = Math.max(2, (Number(CONFIG.FOOD_DRAW_SIZE) || Number(CONFIG.ORGANISM_DRAW_SIZE) || 4) * 0.75);
  var drawn = 0;

  if (!batches || !PS.atlas || typeof PS.atlas.getFoodCell !== "function") {
    return false;
  }

  for (var i = 0; i < items.length; i += 1) {
    var food = items[i];
    var point = PS.render.entities.getRenderPosition(food, 1);
    var variant = Math.abs(Math.round((Number(food && food.x) || 0) * 17 + (Number(food && food.y) || 0) * 31)) % 4;
    var cell = PS.atlas.getFoodCell(variant, food);
    var visibility = point && Number.isFinite(Number(point.visibility)) ? Number(point.visibility) : 1;

    if (!point || point.visible === false || !cell) {
      continue;
    }

    PS.render.webgpuEntity.appendCell(
      batches,
      cell,
      point.x - drawSize / 2,
      point.y - drawSize / 2,
      drawSize,
      drawSize,
      visibility,
      null,
      "food"
    );
    drawn += 1;
  }

  return drawn > 0 && PS.render.webgpuEntity.drawBatches(batches);
};

PS.render.entities.getRgbaFromHex = function (hexColor, alpha) {
  var color = String(hexColor || "#ffffff").replace("#", "");

  if (color.length !== 6) {
    return "rgba(255, 255, 255, " + alpha + ")";
  }

  var red = parseInt(color.slice(0, 2), 16);
  var green = parseInt(color.slice(2, 4), 16);
  var blue = parseInt(color.slice(4, 6), 16);
  return "rgba(" + red + ", " + green + ", " + blue + ", " + alpha + ")";
};

PS.render.entities.getLineageColor = function (organism) {
  var lineageId = typeof organism.lineageId === "number" ? organism.lineageId : 1;
  return PS.render.entities.getLineageColorById(lineageId);
};

PS.render.entities.getLineageColorById = function (lineageId) {
  var colorIndex = (lineageId - 1) % CONFIG.LINEAGE_COLORS.length;
  return CONFIG.LINEAGE_COLORS[colorIndex];
};

PS.render.entities.getOrganismColor = function (organism) {
  if (organism.energy > 200) {
    return "#fff26b";
  }

  if (organism.energy < 60) {
    return "#ff9c69";
  }

  return PS.render.entities.getLineageColor(organism);
};

PS.render.entities.drawRepresentativeMarker = function (organism, interpolation) {
  var representative = organism && organism.representative ? organism.representative : organism;
  var point = PS.render.entities.getRenderPosition(organism, interpolation);
  var size = Math.max(4, Number(CONFIG.ORGANISM_DRAW_SIZE) || 4) * 1.35;
  var cell = PS.atlas && typeof PS.atlas.getRepresentativeIntentCell === "function"
    ? PS.atlas.getRepresentativeIntentCell(representative)
    : null;
  var batches = PS.render.entities.createEntityBatches();

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  return PS.render.entities.appendEntityCell(batches, cell, point, size, 1, "intent", 0, -size * 0.55) &&
    PS.render.entities.drawEntityBatches(batches, 1);
};

PS.render.entities.drawRepresentativeIntents = function () {
  var representatives = world && Array.isArray(world.biologyRepresentatives) ? world.biologyRepresentatives : [];
  var batches = PS.render.entities.createEntityBatches();
  var size = Math.max(4, Number(CONFIG.ORGANISM_DRAW_SIZE) || 4) * 1.2;
  var drawn = 0;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  if (!batches || !PS.atlas || typeof PS.atlas.getRepresentativeIntentCell !== "function") {
    return false;
  }

  for (var i = 0; i < representatives.length; i += 1) {
    var representative = representatives[i];
    var point = PS.render.entities.getRenderPosition(representative, 1);
    var cell = PS.atlas.getRepresentativeIntentCell(representative);

    if (representative && representative.isActive === false) {
      continue;
    }

    if (PS.render.entities.appendEntityCell(batches, cell, point, size, 1, "intent", 0, -size * 0.85)) {
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawSettlementReadiness = function () {
  var markers = world && Array.isArray(world.settlementReadinessMarkers) ? world.settlementReadinessMarkers : null;
  var settlements = markers ? markers : (world && Array.isArray(world.settlements) ? world.settlements : []);
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  if (!batches || !PS.atlas || typeof PS.atlas.getSettlementReadinessCell !== "function") {
    return false;
  }

  for (var i = 0; i < settlements.length; i += 1) {
    var source = settlements[i];
    var settlement = source && source.settlementId ? PS.render.entities.getSettlementById(source.settlementId) : source;
    var marker = markers ? source : {
      lineageId: settlement ? settlement.lineageId : 1,
      progressBucket: Math.max(0, Math.min(3, Math.floor((Number(settlement && settlement.development) || 0) * 4))),
      x: settlement ? settlement.x : 0,
      y: settlement ? settlement.y : 0,
      prevX: settlement ? settlement.prevX : undefined,
      prevY: settlement ? settlement.prevY : undefined,
      latitude: settlement ? settlement.latitude : undefined,
      longitude: settlement ? settlement.longitude : undefined,
      prevLatitude: settlement ? settlement.prevLatitude : undefined,
      prevLongitude: settlement ? settlement.prevLongitude : undefined
    };
    var point = PS.render.entities.getRenderPosition(marker, 1);
    var size = Math.max(4, PS.render.entities.getSettlementDrawSize(settlement || marker) * 0.45);
    var cell = PS.atlas.getSettlementReadinessCell(marker);

    if (PS.render.entities.appendEntityCell(batches, cell, point, size, 0.9, "readiness", size * 0.35, -size * 0.9)) {
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawOrbitEventMarkers = function () {
  var events = world && Array.isArray(world.timelineEvents) ? world.timelineEvents : (world && Array.isArray(world.eventLog) ? world.eventLog : []);
  var batches = PS.render.entities.createEntityBatches();
  var size = Math.max(5, Number(CONFIG.ORGANISM_DRAW_SIZE) || 4) * 1.25;
  var drawn = 0;

  if (!batches || !PS.atlas || typeof PS.atlas.getOrbitEventMarkerCell !== "function") {
    return false;
  }

  for (var i = 0; i < events.length; i += 1) {
    var event = events[i];
    var point = PS.render.entities.getOrbitEventRenderPosition(event, i, events.length);
    var cell = PS.atlas.getOrbitEventMarkerCell(event);

    if (PS.render.entities.appendEntityCell(batches, cell, point, size, 0.9, "eventMarker")) {
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawSettlementShadows = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var rects = [];
  var drawn = 0;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  if (!PS.render.webgpuEntity || typeof PS.render.webgpuEntity.drawShadowRects !== "function") {
    return false;
  }

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var size = PS.render.entities.getSettlementDrawSize(settlement);
    var width = Math.max(4, size * 1.12);
    var height = Math.max(2, size * 0.42);
    var alpha = point && Number.isFinite(Number(point.visibility)) ? Number(point.visibility) : 1;

    if (!point || point.visible === false || settlement && settlement.isActive === false) {
      continue;
    }

    rects.push(
      point.x - width / 2,
      point.y + size * 0.28,
      width,
      height,
      0.02,
      0.035,
      0.055,
      Math.max(0, Math.min(0.42, 0.34 * alpha))
    );
    drawn += 1;
  }

  return drawn > 0 && PS.render.webgpuEntity.drawShadowRects(new Float32Array(rects));
};

PS.render.entities.drawSettlementCitizens = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  if (!batches || !PS.assets || !PS.assets.equivalence || typeof PS.assets.equivalence.select !== "function") {
    return false;
  }

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var count = Math.max(1, Math.min(4, Math.floor((Number(settlement && settlement.population) || 1) / 8)));
    var baseSize = Math.max(3, PS.render.entities.getSettlementDrawSize(settlement) * 0.23);

    for (var citizenIndex = 0; citizenIndex < count; citizenIndex += 1) {
      var selected = PS.assets.equivalence.select("citizen", "entity.fallback");
      var angle = (Math.PI * 2 * citizenIndex) / count;
      var offset = baseSize * 1.25;

      if (PS.render.entities.appendEntityCell(
        batches,
        selected && selected.renderCell,
        point,
        baseSize,
        0.95,
        "citizen",
        Math.cos(angle) * offset,
        Math.sin(angle) * offset
      )) {
        drawn += 1;
      }
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawSettlementVegetation = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  if (!batches || !PS.assets || !PS.assets.equivalence || typeof PS.assets.equivalence.select !== "function") {
    return false;
  }

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var selected = PS.assets.equivalence.select("vegetation", "entity.vegetation.fallback");
    var baseSize = Math.max(5, PS.render.entities.getSettlementDrawSize(settlement) * 0.36);

    if (PS.render.entities.appendEntityCell(batches, selected && selected.renderCell, point, baseSize, 0.92, "vegetation", -baseSize * 0.9, baseSize * 0.2)) {
      drawn += 1;
    }
    if (PS.render.entities.appendEntityCell(batches, selected && selected.renderCell, point, baseSize * 0.82, 0.86, "vegetation", baseSize * 0.95, -baseSize * 0.1)) {
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawSettlementWorldUi = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var metrics = ["population", "food", "development"];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  if (!batches || !PS.atlas || typeof PS.atlas.getSettlementWorldUiCell !== "function") {
    return false;
  }

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var baseSize = Math.max(4, PS.render.entities.getSettlementDrawSize(settlement) * 0.28);

    for (var metricIndex = 0; metricIndex < metrics.length; metricIndex += 1) {
      var fallbackCell = PS.atlas.getSettlementWorldUiCell(settlement, metrics[metricIndex]);
      var selected = PS.assets && PS.assets.equivalence && typeof PS.assets.equivalence.select === "function"
        ? PS.assets.equivalence.select("worldUi", fallbackCell && fallbackCell.name ? fallbackCell.name : "entity.settlement.world-ui.fallback")
        : null;
      var cell = selected && selected.renderCell ? selected.renderCell : fallbackCell;
      var offsetX = (metricIndex - 1) * baseSize * 0.75;
      var offsetY = -baseSize * 1.8;

      if (PS.render.entities.appendEntityCell(batches, cell, point, baseSize, 0.95, "worldUi", offsetX, offsetY)) {
        drawn += 1;
      }
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawSettlementStockpiles = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  if (!batches || !PS.assets || !PS.assets.equivalence || typeof PS.assets.equivalence.select !== "function") {
    return false;
  }

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var stock = Math.max(Number(settlement && settlement.foodStock) || 0, Number(settlement && settlement.storedFood) || 0);

    if (stock <= 0) {
      continue;
    }

    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var selected = PS.assets.equivalence.select("stockpile", "entity.food.fallback");
    var baseSize = Math.max(5, PS.render.entities.getSettlementDrawSize(settlement) * 0.34);

    if (PS.render.entities.appendEntityCell(batches, selected && selected.renderCell, point, baseSize, 0.96, "stockpile", baseSize * 0.72, baseSize * 0.46)) {
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawSettlementWorkStatus = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  if (!batches || !PS.assets || !PS.assets.equivalence || typeof PS.assets.equivalence.select !== "function") {
    return false;
  }

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var selected = PS.assets.equivalence.select("workStatus", "entity.intent.work");
    var baseSize = Math.max(4, PS.render.entities.getSettlementDrawSize(settlement) * 0.28);

    if (PS.render.entities.appendEntityCell(batches, selected && selected.renderCell, point, baseSize, 0.95, "workStatus", -baseSize * 0.55, -baseSize * 1.35)) {
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawSettlementEffects = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  if (!batches || !PS.assets || !PS.assets.equivalence || typeof PS.assets.equivalence.select !== "function") {
    return false;
  }

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var selected = PS.assets.equivalence.select("effect", "entity.effect.fallback");
    var baseSize = Math.max(5, PS.render.entities.getSettlementDrawSize(settlement) * 0.44);

    if (PS.render.entities.appendEntityCell(batches, selected && selected.renderCell, point, baseSize, 0.55, "effect", 0, 0)) {
      if (PS.render.renderer && typeof PS.render.renderer.addLight === "function") {
        PS.render.renderer.addLight(point.x, point.y, baseSize * 3, [1, 0.75, 0.2], 0.72, "settlementTorch");
      }
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.getOrganismEnergyBucket = function (organism) {
  var energy = Number(organism && organism.energy);

  if (energy > 200) {
    return 2;
  }

  if (energy < 60) {
    return 0;
  }

  return 1;
};

PS.render.entities.getOrganismHeadingBucket = function (organism) {
  var direction = organism ? organism.direction : null;
  var dx;
  var dy;

  if (Number.isFinite(Number(direction))) {
    return Math.max(0, Math.min(7, Math.round(Number(direction))));
  }

  if (typeof direction === "string" && direction.length > 0) {
    return direction.charCodeAt(0) & 7;
  }

  dx = Math.round(Number(organism && organism.x) || 0) - Math.round(Number(organism && organism.prevX) || 0);
  dy = Math.round(Number(organism && organism.y) || 0) - Math.round(Number(organism && organism.prevY) || 0);

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? 2 : 6;
  }

  if (dy !== 0) {
    return dy >= 0 ? 4 : 0;
  }

  return 0;
};

PS.render.entities.getOrganismAnimationSeed = function (organism, index) {
  var existing = Number(organism && organism.renderAnimationSeed);
  var stableId;
  var seed;

  if (Number.isFinite(existing) && existing > 0) {
    return existing >>> 0;
  }

  stableId = Math.round(Number(organism && (organism.representativeId || organism.id || organism.poolIndex)) || 0);
  if (!stableId) {
    stableId = Math.round((Number(organism && organism.x) || 0) * 73856093) ^
      Math.round((Number(organism && organism.y) || 0) * 19349663) ^
      Math.round(Number(index) || 0);
  }

  seed = Math.imul(stableId ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  if (organism) {
    organism.renderAnimationSeed = seed || 1;
  }
  PS.render.entities.organismRenderPerf.lastAnimationSeedComputes += 1;
  return seed || 1;
};

PS.render.entities.generateSprite = function (traits, entityId, context) {
  var renderContext = context || {};
  var frameVariant = clamp(Math.round(Number(renderContext.frameVariant) || 0), 0, 3);
  var organism = renderContext.organism || {
    id: entityId,
    representativeId: entityId,
    lineageId: Math.max(1, Math.round(Number(renderContext.lineageId) || 1)),
    traits: traits || {}
  };

  organism.traits = traits || organism.traits || {};

  if (PS.atlas && typeof PS.atlas.generateOrganismSprite === "function") {
    return PS.atlas.generateOrganismSprite(organism, frameVariant);
  }

  if (PS.atlas && typeof PS.atlas.getTraitOrganismCell === "function") {
    return {
      cell: PS.atlas.getTraitOrganismCell(organism, frameVariant),
      morphologyKey: PS.atlas.makeTraitHash ? PS.atlas.makeTraitHash(organism, frameVariant) : "entity.organism.fallback." + frameVariant,
      preview: null
    };
  }

  return {
    cell: null,
    morphologyKey: "entity.organism.missing." + frameVariant,
    preview: null
  };
};

PS.render.entities.getMorphologyKey = function (traits, entityId, context) {
  var renderContext = context || {};
  var frameVariant = clamp(Math.round(Number(renderContext.frameVariant) || 0), 0, 3);
  var organism = renderContext.organism || {
    id: entityId,
    representativeId: entityId,
    lineageId: Math.max(1, Math.round(Number(renderContext.lineageId) || 1)),
    traits: traits || {}
  };

  organism.traits = traits || organism.traits || {};

  if (PS.atlas && typeof PS.atlas.makeMorphologyKey === "function") {
    return PS.atlas.makeMorphologyKey(organism, frameVariant);
  }

  if (PS.atlas && typeof PS.atlas.makeTraitHash === "function") {
    return PS.atlas.makeTraitHash(organism, frameVariant);
  }

  if (PS.atlas && typeof PS.atlas.getOrganismTraitBuckets === "function") {
    var buckets = PS.atlas.getOrganismTraitBuckets(organism, frameVariant);
    return [
      "entity.organism.trait",
      buckets.lineage,
      buckets.bodySize,
      buckets.bodyShape,
      buckets.limbCount,
      buckets.appendageType,
      buckets.camouflage,
      buckets.thermal,
      buckets.water,
      buckets.predator,
      buckets.mobility,
      buckets.terrain,
      buckets.cognition,
      buckets.social,
      buckets.variant
    ].join(".");
  }

  return "entity.organism.missing." + frameVariant;
};

PS.render.entities.getOrganismMorphologyPreview = function (organism, index) {
  var seed = PS.render.entities.getOrganismAnimationSeed(organism, index);
  var frameVariant = seed & 3;

  if (PS.atlas && typeof PS.atlas.getOrganismMorphologyPreview === "function") {
    return PS.atlas.getOrganismMorphologyPreview(organism, frameVariant);
  }

  return null;
};

PS.render.entities.getOrganismSpriteCache = function (organism, index) {
  var perf = PS.render.entities.organismRenderPerf;
  var seed = PS.render.entities.getOrganismAnimationSeed(organism, index);
  var variant = seed & 3;
  var entityId = organism && (organism.representativeId || organism.id || organism.poolIndex);
  var traits = organism && organism.traits ? organism.traits : {};
  var morphologyContext = {
    organism: organism,
    lineageId: organism && organism.lineageId,
    frameVariant: variant
  };
  var morphologyKey = PS.render.entities.getMorphologyKey(traits, entityId, morphologyContext);
  var cache = organism ? organism._renderSpriteCache : null;
  var changed;
  var generated;

  if (!cache) {
    cache = {};
    if (organism) {
      organism._renderSpriteCache = cache;
    }
  }

  changed = cache.morphologyKey !== morphologyKey ||
    !cache.cell;

  if (changed) {
    generated = PS.render.entities.generateSprite(traits, entityId, morphologyContext);
    cache.variant = variant;
    cache.morphologyKey = morphologyKey;
    cache.preview = generated ? generated.preview : null;
    cache.cell = generated ? generated.cell : null;
    perf.lastSpriteCacheMisses += 1;
  } else {
    perf.lastSpriteCacheHits += 1;
  }

  return cache;
};

PS.render.entities.getOrganismRenderPerfStats = function () {
  return Object.assign({}, PS.render.entities.organismRenderPerf);
};

PS.render.entities.drawOrganisms = function () {
  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  var organisms = world && Array.isArray(world.organisms) ? world.organisms : [];
  var batches = PS.render.webgpuEntity && typeof PS.render.webgpuEntity.beginBatches === "function"
    ? PS.render.webgpuEntity.beginBatches()
    : null;
  var drawSize = Math.max(3, Number(CONFIG.ORGANISM_DRAW_SIZE) || 4);
  var interpolation = typeof getFrameInterpolation === "function" ? getFrameInterpolation() : 1;
  var pointScratch = {};
  var perf = PS.render.entities.organismRenderPerf;
  var drawn = 0;

  if (!batches || !PS.atlas || typeof PS.atlas.getTraitOrganismCell !== "function") {
    return false;
  }

  perf.lastOrganismRenderCount = organisms.length;
  perf.lastSpriteCacheHits = 0;
  perf.lastSpriteCacheMisses = 0;
  perf.lastAnimationSeedComputes = 0;
  perf.lastEstimatedRenderObjectsPerSecond = 0;

  for (var i = 0; i < organisms.length; i += 1) {
    var organism = organisms[i];
    var point = PS.render.entities.writeRenderPosition(organism, interpolation, pointScratch);
    var spriteCache = PS.render.entities.getOrganismSpriteCache(organism, i);
    var cell = spriteCache && spriteCache.cell;
    var visibility = point && Number.isFinite(Number(point.visibility)) ? Number(point.visibility) : 1;

    if (!point || point.visible === false || !cell) {
      continue;
    }

    PS.render.webgpuEntity.appendCell(
      batches,
      cell,
      point.x - drawSize / 2,
      point.y - drawSize / 2,
      drawSize,
      drawSize,
      visibility,
      null,
      "organism"
    );
    drawn += 1;
  }

  perf.lastEstimatedRenderObjectsPerSecond = perf.lastSpriteCacheMisses * 30;
  return drawn > 0 && PS.render.webgpuEntity.drawBatches(batches);
};

PS.render.entities.getSettlementDrawSize = function (settlement) {
  var level = Math.max(1, Math.round(Number(settlement.level) || 1));
  var growthScale = 2.1 + Math.min(level - 1, 5) * 0.35;
  return CONFIG.ORGANISM_DRAW_SIZE * growthScale * PS.render.entities.getSettlementGroundDetailScale();
};

PS.render.entities.getSettlementGroundDetailScale = function () {
  var view = world && world.planetView ? world.planetView : null;
  var band = PS.render.pipeline && typeof PS.render.pipeline.getZoomBand === "function"
    ? PS.render.pipeline.getZoomBand(view ? view.zoomLevel : 0)
    : "";

  if (band === "settlement") {
    return 1.85;
  }

  if (band === "local") {
    return 1.2;
  }

  return 1;
};

PS.render.entities.getSettlementById = function (settlementId) {
  var indexedSettlement = null;

  if (typeof getSettlementById === "function") {
    indexedSettlement = getSettlementById(settlementId);
    if (indexedSettlement) {
      return indexedSettlement;
    }
  }

  if (!Array.isArray(world.settlements)) {
    return null;
  }

  for (var i = 0; i < world.settlements.length; i++) {
    if (String(world.settlements[i].id) === String(settlementId)) {
      return world.settlements[i];
    }
  }

  return null;
};

PS.render.entities.getSettlementRenderPosition = function (settlement) {
  if (!settlement) {
    return null;
  }

  return PS.render.entities.getRenderPosition(settlement, 1);
};

PS.render.entities.drawSettlementMapBadge = function (settlement, point, size) {
  var batches = PS.render.entities.createEntityBatches();
  var cell = PS.atlas && typeof PS.atlas.getSettlementWorldUiCell === "function"
    ? PS.atlas.getSettlementWorldUiCell(settlement, "population")
    : null;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  return PS.render.entities.appendEntityCell(batches, cell, point, size, 0.95, "worldUi", 0, -size * 1.5) &&
    PS.render.entities.drawEntityBatches(batches, 1);
};

PS.render.entities.drawSettlements = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  if (!batches || !PS.atlas || typeof PS.atlas.getSettlementCell !== "function") {
    return false;
  }

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var size = PS.render.entities.getSettlementDrawSize(settlement);
    var fallbackCell = PS.atlas.getSettlementCell(settlement);
    var selected = PS.assets && PS.assets.equivalence && typeof PS.assets.equivalence.select === "function"
      ? PS.assets.equivalence.select("settlement", fallbackCell && fallbackCell.name ? fallbackCell.name : "entity.settlement.fallback")
      : null;
    var cell = selected && selected.renderCell ? selected.renderCell : fallbackCell;

    if (settlement && settlement.isActive === false) {
      continue;
    }

    if (PS.render.entities.appendEntityCell(batches, cell, point, size, 1, "settlement")) {
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawSettlementInfluence = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  if (!batches || !PS.atlas || typeof PS.atlas.getSettlementInfluenceCell !== "function") {
    return false;
  }

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var radiusScale = Math.max(1.2, Math.min(3, (Number(settlement && settlement.influenceRadius) || 1) * 0.35));
    var size = PS.render.entities.getSettlementDrawSize(settlement) * radiusScale;
    var cell = PS.atlas.getSettlementInfluenceCell(settlement);

    if (PS.render.entities.appendEntityCell(batches, cell, point, size, 0.55, "influence")) {
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawSettlementRoutes = function () {
  var routes = world && Array.isArray(world.settlementRoutes) ? world.settlementRoutes : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawGlobeScaleEntities()) {
    return false;
  }

  if (!batches || !PS.atlas || typeof PS.atlas.getRouteCell !== "function") {
    return false;
  }

  for (var i = 0; i < routes.length; i += 1) {
    var route = routes[i];
    var parent = PS.render.entities.getSettlementById(route.parentSettlementId || route.fromSettlementId || route.fromId);
    var child = PS.render.entities.getSettlementById(route.childSettlementId || route.toSettlementId || route.toId);
    var parentPoint = PS.render.entities.getSettlementRenderPosition(parent);
    var childPoint = PS.render.entities.getSettlementRenderPosition(child);
    var fallbackPoint = parentPoint || childPoint;
    var dx = childPoint && parentPoint ? childPoint.x - parentPoint.x : 0;
    var dy = childPoint && parentPoint ? childPoint.y - parentPoint.y : 0;
    var point = parentPoint && childPoint ? {
      x: parentPoint.x + dx * 0.5,
      y: parentPoint.y + dy * 0.5,
      visible: parentPoint.visible !== false || childPoint.visible !== false,
      visibility: Math.max(
        Number.isFinite(Number(parentPoint.visibility)) ? Number(parentPoint.visibility) : 1,
        Number.isFinite(Number(childPoint.visibility)) ? Number(childPoint.visibility) : 1
      )
    } : (fallbackPoint ? {
      x: fallbackPoint.x,
      y: fallbackPoint.y,
      visible: fallbackPoint.visible !== false,
      visibility: Number.isFinite(Number(fallbackPoint.visibility)) ? Number(fallbackPoint.visibility) : 1
    } : null);
    var shape = Math.abs(dx) > Math.abs(dy) * 1.4 ? "horizontal" : (Math.abs(dy) > Math.abs(dx) * 1.4 ? "vertical" : "diag");
    var cell = PS.atlas.getRouteCell(route, shape);
    var size = Math.max(6, Number(CONFIG.ORGANISM_DRAW_SIZE) || 4) * 2.1;

    if (route && route.isActive === false) {
      continue;
    }

    if (PS.render.entities.appendEntityCell(batches, cell, point, size, 0.85, "route")) {
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.getOrbitEventRenderPosition = function (event, index, total) {
  var source = event || {};
  var tileX = Number.isFinite(Number(source.tileX)) ? Number(source.tileX) : Number(source.x);
  var tileY = Number.isFinite(Number(source.tileY)) ? Number(source.tileY) : Number(source.y);
  var location = source.location || source.position || null;
  var targetCanvas = PS.gpu && PS.gpu.canvas ? PS.gpu.canvas : (typeof canvas !== "undefined" ? canvas : null);
  var fallbackWidth = targetCanvas ? targetCanvas.width : 800;
  var fallbackHeight = targetCanvas ? targetCanvas.height : 450;
  var count = Math.max(1, Number(total) || 1);
  var angle = -Math.PI / 2 + (Math.PI * 2 * ((Number(index) || 0) % count)) / count;
  var orbitRadius = Math.min(fallbackWidth, fallbackHeight) * 0.33;

  if (location) {
    if (Number.isFinite(Number(location.tileX)) || Number.isFinite(Number(location.x))) {
      tileX = Number.isFinite(Number(location.tileX)) ? Number(location.tileX) : Number(location.x);
      tileY = Number.isFinite(Number(location.tileY)) ? Number(location.tileY) : Number(location.y);
    } else if (Number.isFinite(Number(location.longitude)) && Number.isFinite(Number(location.latitude))) {
      return PS.render.entities.getRenderPosition({
        longitude: Number(location.longitude),
        latitude: Number(location.latitude),
        prevLongitude: Number(location.longitude),
        prevLatitude: Number(location.latitude),
        x: Number(source.x) || 0,
        y: Number(source.y) || 0
      }, 1);
    }
  }

  if (Number.isFinite(tileX) && Number.isFinite(tileY)) {
    return PS.render.entities.getTileRenderPosition(tileX, tileY);
  }

  return {
    x: fallbackWidth / 2 + Math.cos(angle) * orbitRadius,
    y: fallbackHeight / 2 + Math.sin(angle) * orbitRadius,
    scale: 1,
    visibility: 1,
    visible: true
  };
};

PS.render.entities.drawOrbitalAssets = function () {
  return false;
};

PS.render.entities.drawPlanetaryBodies = function () {
  return false;
};

PS.render.entities.drawProbeMissions = function () {
  return false;
};

PS.render.entities.drawStarSystems = function () {
  return false;
};

PS.render.entities.drawEmpireSectors = function () {
  return false;
};

PS.render.entities.drawInterstellarFleets = function () {
  return false;
};

PS.render.entities.drawEmpireLegacy = function () {
  return false;
};

PS.render.entities.rebuildShaders = function () {};
PS.render.entities.rebuildTextures = function () {};
