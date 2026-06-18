import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getPlanetInterpolatedProjection, projectPlanetPoint } from "./planet-grid.js";
import { projectPlanetLocalPoint } from "./planet-surface.js";
import { ensureEntitySurfacePosition, getEntitySurfacePosition, interpolateLongitudeDeg, isGlobeRenderMode, isPlanetLocalView } from "./planet-view.js";
import { getSettlementById } from "../sim/settlements-state.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";
import { canvas } from "../ui/dom-refs.js";

PS.render = PS.render || {};
PS.render.entities = PS.render.entities || {};

PS.render.entities.organismRenderPerf = PS.render.entities.organismRenderPerf || {
  lastOrganismRenderCount: 0,
  lastOrganismVisualMode: "individual",
  lastOrganismClusterRenderCount: 0,
  lastOrganismIndividualRenderCount: 0,
  lastSpriteCacheHits: 0,
  lastSpriteCacheMisses: 0,
  lastAnimationSeedComputes: 0,
  lastEstimatedRenderObjectsPerSecond: 0
};

PS.render.entities.settlementVisualStats = PS.render.entities.settlementVisualStats || {
  lastSettlementShadowCasters: 0,
  lastSettlementShadowRects: 0,
  lastSettlementShadowMaxAlpha: 0,
  lastSettlementShadowMaxWidth: 0,
  lastSettlementRouteSegments: 0,
  lastSettlementRouteBedSegments: 0,
  lastSettlementInfluenceCells: 0,
  lastSettlementInfluenceMaxAlpha: 0,
  lastSettlementWorldUiMarks: 0,
  lastSettlementWorldUiMaxAlpha: 0,
  lastSettlementDistrictOffsets: 0
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

  if (isPlanetLocalView()) {
    return projectPlanetLocalPoint(renderLongitude, renderLatitude);
  }

  return projectPlanetPoint(renderLongitude, renderLatitude);
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

PS.render.entities.shouldDrawDetailedLocalEntities = function () {
  var band = PS.render.entities.getCurrentEntityZoomBand();

  return band === "local" || band === "settlement" || Boolean(CONFIG.PLANET_DEBUG_OVERLAY);
};

PS.render.entities.shouldDrawDetailedSettlementEntities = function () {
  return PS.render.entities.shouldDrawDetailedLocalEntities();
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

PS.render.entities.getCurrentEntityZoomBand = function () {
  var view = world && world.planetView ? world.planetView : null;
  var zoom = view ? Number(view.zoomLevel) || 0 : 0;

  if (PS.render.pipeline && typeof PS.render.pipeline.getZoomBand === "function") {
    return PS.render.pipeline.getZoomBand(zoom);
  }

  if (zoom >= 19) { return "settlement"; }
  if (zoom >= 15) { return "local"; }
  if (zoom >= 10) { return "region"; }
  if (zoom >= 6) { return "continent"; }
  if (zoom >= 3) { return "planet"; }
  return "orbit";
};

PS.render.entities.getOrganismVisualMode = function () {
  var band = PS.render.entities.getCurrentEntityZoomBand();

  if (band === "local" || band === "settlement") {
    return "individual";
  }

  return band === "region" ? "aggregate" : "hidden";
};

PS.render.entities.drawFood = function () {
  if (!PS.render.entities.shouldDrawDetailedLocalEntities()) {
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
  if (organism.energy >= CONFIG.ORGANISM_RENDER_HIGH_ENERGY) {
    return "#fff26b";
  }

  if (organism.energy < CONFIG.ORGANISM_RENDER_LOW_ENERGY) {
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

  if (!PS.render.entities.shouldDrawDetailedLocalEntities()) {
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

  if (!PS.render.entities.shouldDrawDetailedLocalEntities()) {
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

  if (!PS.render.entities.shouldDrawDetailedSettlementEntities()) {
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
  var casters = 0;
  var maxAlpha = 0;
  var maxWidth = 0;
  var stats = PS.render.entities.settlementVisualStats;

  if (!PS.render.entities.shouldDrawDetailedSettlementEntities()) {
    stats.lastSettlementShadowCasters = 0;
    stats.lastSettlementShadowRects = 0;
    stats.lastSettlementShadowMaxAlpha = 0;
    stats.lastSettlementShadowMaxWidth = 0;
    stats.lastSettlementDistrictOffsets = 0;
    return false;
  }

  if (!PS.render.webgpuEntity || typeof PS.render.webgpuEntity.drawShadowRects !== "function") {
    stats.lastSettlementShadowCasters = 0;
    stats.lastSettlementShadowRects = 0;
    stats.lastSettlementShadowMaxAlpha = 0;
    stats.lastSettlementShadowMaxWidth = 0;
    stats.lastSettlementDistrictOffsets = 0;
    return false;
  }

  stats.lastSettlementDistrictOffsets = 0;

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var size = PS.render.entities.getSettlementDrawSize(settlement);
    var width = Math.max(4, size * 0.82);
    var height = Math.max(2, size * 0.24);
    var alpha = point && Number.isFinite(Number(point.visibility)) ? Number(point.visibility) : 1;
    var shadowAlpha = Math.max(0, Math.min(0.18, 0.15 * alpha));
    var heightUnits = Math.max(3, Math.min(16, Math.round(size * 0.34 + (Number(settlement && settlement.level) || 1) * 0.8)));

    if (!point || point.visible === false || settlement && settlement.isActive === false) {
      continue;
    }

    if (PS.render.shadows && typeof PS.render.shadows.appendStampedRects === "function") {
      drawn += PS.render.shadows.appendStampedRects(rects, {
        x: point.x - width / 2,
        y: point.y + size * 0.28,
        width: width,
        rectHeight: height,
        heightUnits: heightUnits,
        alpha: shadowAlpha,
        mode: "soft",
        distance2Ground: Math.max(0, Number(settlement && settlement.shadowDistance2Ground) || 0),
        maxIterations: 3,
        color: [0.02, 0.035, 0.055]
      });
      casters += 1;
      maxAlpha = Math.max(maxAlpha, shadowAlpha);
      maxWidth = Math.max(maxWidth, width);
    }
  }

  stats.lastSettlementShadowCasters = casters;
  stats.lastSettlementShadowRects = drawn;
  stats.lastSettlementShadowMaxAlpha = maxAlpha;
  stats.lastSettlementShadowMaxWidth = maxWidth;

  return drawn > 0 && PS.render.webgpuEntity.drawShadowRects(new Float32Array(rects));
};

PS.render.entities.drawSettlementCitizens = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawDetailedSettlementEntities()) {
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
      var offset = PS.render.entities.getSettlementDistrictOffset(settlement, "citizen", baseSize * 1.8, citizenIndex);

      if (PS.render.entities.appendEntityCell(
        batches,
        selected && selected.renderCell,
        point,
        baseSize,
        0.95,
        "citizen",
        offset.x,
        offset.y
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

  if (!PS.render.entities.shouldDrawDetailedSettlementEntities()) {
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
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;
  var maxAlpha = 0;
  var stats = PS.render.entities.settlementVisualStats;

  if (!PS.render.entities.shouldDrawDetailedSettlementEntities()) {
    stats.lastSettlementWorldUiMarks = 0;
    stats.lastSettlementWorldUiMaxAlpha = 0;
    return false;
  }

  if (!batches || !PS.atlas || typeof PS.atlas.getSettlementWorldUiCell !== "function") {
    stats.lastSettlementWorldUiMarks = 0;
    stats.lastSettlementWorldUiMaxAlpha = 0;
    return false;
  }

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var metrics = PS.render.entities.getSettlementWorldUiMetrics(settlement);
    var baseSize = Math.max(3, PS.render.entities.getSettlementDrawSize(settlement) * 0.2);

    for (var metricIndex = 0; metricIndex < metrics.length; metricIndex += 1) {
      var fallbackCell = PS.atlas.getSettlementWorldUiCell(settlement, metrics[metricIndex]);
      var selected = PS.assets && PS.assets.equivalence && typeof PS.assets.equivalence.select === "function"
        ? PS.assets.equivalence.select("worldUi", fallbackCell && fallbackCell.name ? fallbackCell.name : "entity.settlement.world-ui.fallback")
        : null;
      var cell = selected && selected.renderCell ? selected.renderCell : fallbackCell;
      var offset = PS.render.entities.getSettlementDistrictOffset(settlement, "worldUi", baseSize * 2.2, metricIndex);
      var alpha = settlement && settlement.isOutpost ? 0.66 : 0.76;

      if (PS.render.entities.appendEntityCell(batches, cell, point, baseSize, alpha, "worldUi", offset.x, offset.y)) {
        drawn += 1;
        maxAlpha = Math.max(maxAlpha, alpha);
      }
    }
  }

  stats.lastSettlementWorldUiMarks = drawn;
  stats.lastSettlementWorldUiMaxAlpha = maxAlpha;

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawSettlementStockpiles = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawDetailedSettlementEntities()) {
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
    var offset = PS.render.entities.getSettlementDistrictOffset(settlement, "stockpile", baseSize * 1.55, i);

    if (PS.render.entities.appendEntityCell(batches, selected && selected.renderCell, point, baseSize, 0.92, "stockpile", offset.x, offset.y)) {
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawSettlementWorkStatus = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawDetailedSettlementEntities()) {
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
    var offset = PS.render.entities.getSettlementDistrictOffset(settlement, "workStatus", baseSize * 1.7, i);

    if (PS.render.entities.appendEntityCell(batches, selected && selected.renderCell, point, baseSize, 0.86, "workStatus", offset.x, offset.y)) {
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawSettlementEffects = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;

  if (!PS.render.entities.shouldDrawDetailedSettlementEntities()) {
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

  if (energy >= CONFIG.ORGANISM_RENDER_HIGH_ENERGY) {
    return 2;
  }

  if (energy < CONFIG.ORGANISM_RENDER_LOW_ENERGY) {
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

PS.render.entities.getOrganismFacing = function (organism) {
  var facing = organism ? organism.facing : null;
  var dx;
  var dy;

  if (typeof facing === "string") {
    facing = facing.toLowerCase();
    if (facing === "south" || facing === "s") {
      return { code: 0, suffix: "s" };
    }
    if (facing === "west" || facing === "w") {
      return { code: 1, suffix: "w" };
    }
    if (facing === "east" || facing === "e") {
      return { code: 2, suffix: "e" };
    }
    if (facing === "north" || facing === "n") {
      return { code: 3, suffix: "n" };
    }
  }

  if (Number.isFinite(Number(facing))) {
    facing = clamp(Math.round(Number(facing)), 0, 3);
    return {
      code: facing,
      suffix: ["s", "w", "e", "n"][facing]
    };
  }

  dx = Math.round(Number(organism && organism.directionX) || 0);
  dy = Math.round(Number(organism && organism.directionY) || 0);

  if (dx === 0 && dy === 0) {
    dx = Math.round(Number(organism && organism.x) || 0) - Math.round(Number(organism && organism.prevX) || 0);
    dy = Math.round(Number(organism && organism.y) || 0) - Math.round(Number(organism && organism.prevY) || 0);
  }

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx < 0 ? { code: 1, suffix: "w" } : { code: 2, suffix: "e" };
  }

  if (dy < 0) {
    return { code: 3, suffix: "n" };
  }

  return dy > 0 ? { code: 0, suffix: "s" } : { code: 0, suffix: "s" };
};

PS.render.entities.isOrganismMoving = function (organism) {
  if (!organism) {
    return false;
  }

  return Math.round(Number(organism.directionX) || 0) !== 0 ||
    Math.round(Number(organism.directionY) || 0) !== 0 ||
    Math.round(Number(organism.x) || 0) !== Math.round(Number(organism.prevX) || 0) ||
    Math.round(Number(organism.y) || 0) !== Math.round(Number(organism.prevY) || 0);
};

PS.render.entities.getOrganismWalkFrame = function (organism) {
  var explicit = Number(organism && organism.animFrame);
  var nowMs;

  if (!PS.render.entities.isOrganismMoving(organism)) {
    return 0;
  }

  if (Number.isFinite(explicit)) {
    return clamp(Math.round(explicit), 0, 1);
  }

  nowMs = typeof performance !== "undefined" && performance && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
  return Math.floor(nowMs / 250) & 1;
};

PS.render.entities.getOrganismCreatureType = function (organism) {
  var explicit = String(organism && (organism.creatureType || organism.spriteSheet || organism.entityType || organism.typeId) || "").toLowerCase();
  var traits = organism && organism.traits ? organism.traits : {};

  if (explicit.indexOf("bird") >= 0) {
    return "bird";
  }

  if (explicit.indexOf("rabbit") >= 0 || explicit.indexOf("herbivore") >= 0) {
    return "rabbit";
  }

  if ((Number(traits.movementTendency) || 0) >= 0.75 && (Number(traits.bodySize) || 1) <= 1.2) {
    return "bird";
  }

  return "rabbit";
};

PS.render.entities.selectAuthoredOrganismCell = function (organism, facing, walkFrame) {
  var equivalence = PS.assets && PS.assets.equivalence;
  var type = PS.render.entities.getOrganismCreatureType(organism);
  var suffix = facing && facing.suffix ? facing.suffix : "s";
  var sideSuffix = suffix === "w" || suffix === "n" ? "w" : "e";
  var candidates = [
    type + "." + suffix + "." + walkFrame,
    type + "." + suffix + ".walk-" + walkFrame,
    type + "." + suffix,
    type + "." + sideSuffix,
    "rabbit." + suffix,
    "rabbit." + sideSuffix,
    "rabbit.s"
  ];
  var loadedSheet = equivalence && typeof equivalence.getLoadedSheet === "function"
    ? equivalence.getLoadedSheet("creatures")
    : null;
  var sheet = loadedSheet && loadedSheet.sheet && typeof loadedSheet.sheet.getCell === "function"
    ? loadedSheet.sheet
    : null;
  var selected;
  var i;

  if (!equivalence || typeof equivalence.selectCell !== "function") {
    return null;
  }

  for (i = 0; i < candidates.length; i += 1) {
    if (sheet && !sheet.getCell(candidates[i])) {
      continue;
    }

    selected = equivalence.selectCell("creatures", candidates[i], "creature", "");
    if (selected && selected.renderCell) {
      return selected.renderCell;
    }
  }

  return null;
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
  var authoredCell = renderContext.authoredCell || null;
  var organism = renderContext.organism || {
    id: entityId,
    representativeId: entityId,
    lineageId: Math.max(1, Math.round(Number(renderContext.lineageId) || 1)),
    traits: traits || {}
  };

  organism.traits = traits || organism.traits || {};

  if (authoredCell) {
    return {
      cell: authoredCell,
      morphologyKey: renderContext.morphologyKey || ("entity.organism.authored." + frameVariant),
      preview: null
    };
  }

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

PS.render.entities.getOrganismVisualSeed = function (organism, index) {
  var stableId = Math.round(Number(organism && (organism.representativeId || organism.id || organism.poolIndex)) || 0);

  if (!stableId) {
    stableId = Math.round((Number(organism && organism.x) || 0) * 73856093) ^
      Math.round((Number(organism && organism.y) || 0) * 19349663) ^
      Math.round(Number(index) || 0);
  }

  return (Math.imul(stableId ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 1;
};

PS.render.entities.getOrganismVisualState = function (organism, index) {
  var facing = PS.render.entities.getOrganismFacing(organism);
  var walkFrame = PS.render.entities.getOrganismWalkFrame(organism);
  var seed = PS.render.entities.getOrganismVisualSeed(organism, index);
  var energy = Number(organism && organism.energy) || 0;
  var state = walkFrame > 0 || Number(organism && organism.directionX) !== 0 || Number(organism && organism.directionY) !== 0
    ? "move"
    : "idle";

  if (organism && organism.isDecaying) {
    state = "die_decay";
  } else if (organism && organism.isMigrating) {
    state = "migrate";
  } else if (organism && organism.isSleeping) {
    state = "sleep";
  } else if (organism && organism.isFighting) {
    state = "fight";
  } else if (organism && organism.isConstructing) {
    state = "construct";
  } else if (organism && organism.isWorking) {
    state = "work";
  } else if (organism && organism.behavior === "foraging") {
    state = "forage";
  }

  return {
    family: "organism",
    state: state,
    direction: facing.code,
    directionSuffix: facing.suffix,
    frameCount: state === "idle" ? 2 : 4,
    frameRate: state === "idle" ? 4 : 8,
    frameVariant: walkFrame,
    phaseOffset: seed & 1023,
    tint: PS.render.entities.getLineageColor(organism),
    statusPixel: energy > 0 && energy < CONFIG.ORGANISM_RENDER_LOW_ENERGY ? "hungry" : ""
  };
};

PS.render.entities.getOrganismSpriteCache = function (organism, index) {
  var perf = PS.render.entities.organismRenderPerf;
  var seed = PS.render.entities.getOrganismAnimationSeed(organism, index);
  var variant = seed & 3;
  var facing = PS.render.entities.getOrganismFacing(organism);
  var walkFrame = PS.render.entities.getOrganismWalkFrame(organism);
  var creatureType = PS.render.entities.getOrganismCreatureType(organism);
  var authoredCandidateKey = [
    "entity.organism.authored",
    creatureType,
    facing.suffix,
    walkFrame
  ].join(".");
  var authoredCell = null;
  var entityId = organism && (organism.representativeId || organism.id || organism.poolIndex);
  var traits = organism && organism.traits ? organism.traits : {};
  var morphologyContext = {
    organism: organism,
    lineageId: organism && organism.lineageId,
    frameVariant: variant,
    authoredCell: null
  };
  var morphologyKey;
  var cache = organism ? organism._renderSpriteCache : null;
  var changed;
  var generated;

  if (!cache) {
    cache = {};
    if (organism) {
      organism._renderSpriteCache = cache;
    }
  }

  if (cache.authoredCandidateKey === authoredCandidateKey && cache.isAuthored && cache.cell) {
    perf.lastSpriteCacheHits += 1;
    return cache;
  }

  authoredCell = PS.render.entities.selectAuthoredOrganismCell(organism, facing, walkFrame);
  morphologyContext.authoredCell = authoredCell;
  morphologyKey = authoredCell
    ? [
      authoredCandidateKey,
      authoredCell.name || authoredCell.sourceCellName || "cell"
    ].join(".")
    : PS.render.entities.getMorphologyKey(traits, entityId, morphologyContext);

  changed = cache.morphologyKey !== morphologyKey ||
    !cache.cell;

  if (changed) {
    generated = PS.render.entities.generateSprite(traits, entityId, morphologyContext);
    cache.variant = variant;
    cache.authoredCandidateKey = authoredCandidateKey;
    cache.isAuthored = Boolean(authoredCell);
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

PS.render.entities.getOrganismClusterSources = function () {
  var populations = world && Array.isArray(world.biologyPopulations) ? world.biologyPopulations : [];
  var representatives = world && Array.isArray(world.biologyRepresentatives) ? world.biologyRepresentatives : [];
  var clusters = [];
  var i;

  for (i = 0; i < populations.length; i += 1) {
    if (populations[i] && populations[i].isActive !== false && Number(populations[i].count) > 0) {
      clusters.push(populations[i]);
    }
  }

  if (clusters.length > 0) {
    return clusters;
  }

  for (i = 0; i < representatives.length; i += 1) {
    if (representatives[i] && representatives[i].isActive !== false) {
      clusters.push(representatives[i]);
    }
  }

  return clusters;
};

PS.render.entities.getOrganismClusterCell = function (cluster) {
  if (PS.atlas && typeof PS.atlas.getPopulationClusterCell === "function") {
    return PS.atlas.getPopulationClusterCell(cluster);
  }

  if (PS.atlas && typeof PS.atlas.getRepresentativeIntentCell === "function") {
    return PS.atlas.getRepresentativeIntentCell(cluster);
  }

  return null;
};

PS.render.entities.drawOrganismClusters = function () {
  var clusters = PS.render.entities.getOrganismClusterSources();
  var batches = PS.render.entities.createEntityBatches();
  var baseSize = Math.max(4, Number(CONFIG.ORGANISM_DRAW_SIZE) || 4);
  var interpolation = typeof getFrameInterpolation === "function" ? getFrameInterpolation() : 1;
  var perf = PS.render.entities.organismRenderPerf;
  var drawn = 0;

  if (!batches || !PS.atlas) {
    return false;
  }

  for (var i = 0; i < clusters.length; i += 1) {
    var cluster = clusters[i];
    var count = Math.max(1, Math.round(Number(cluster && cluster.count) || 1));
    var size = baseSize * Math.min(2.65, 1.05 + Math.log(count + 1) * 0.24);
    var point = PS.render.entities.getRenderPosition(cluster, interpolation);
    var cell = PS.render.entities.getOrganismClusterCell(cluster);

    if (PS.render.entities.appendEntityCell(batches, cell, point, size, 1, "organism", 0, -size * 0.25)) {
      drawn += 1;
    }
  }

  perf.lastOrganismClusterRenderCount = drawn;
  perf.lastOrganismIndividualRenderCount = 0;
  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.drawOrganisms = function () {
  var organisms = world && Array.isArray(world.organisms) ? world.organisms : [];
  var visualMode = PS.render.entities.getOrganismVisualMode();
  var batches = PS.render.webgpuEntity && typeof PS.render.webgpuEntity.beginBatches === "function"
    ? PS.render.webgpuEntity.beginBatches()
    : null;
  var drawSize = Math.max(3, Number(CONFIG.ORGANISM_DRAW_SIZE) || 4);
  var interpolation = typeof getFrameInterpolation === "function" ? getFrameInterpolation() : 1;
  var pointScratch = {};
  var perf = PS.render.entities.organismRenderPerf;
  var drawn = 0;

  perf.lastOrganismRenderCount = organisms.length;
  perf.lastOrganismVisualMode = visualMode;
  perf.lastOrganismClusterRenderCount = 0;
  perf.lastOrganismIndividualRenderCount = 0;
  perf.lastSpriteCacheHits = 0;
  perf.lastSpriteCacheMisses = 0;
  perf.lastAnimationSeedComputes = 0;
  perf.lastEstimatedRenderObjectsPerSecond = 0;

  if (visualMode === "aggregate") {
    return PS.render.entities.shouldDrawGlobeScaleEntities()
      ? PS.render.entities.drawOrganismClusters()
      : false;
  }

  if (visualMode === "hidden") {
    return false;
  }

  if (!PS.render.entities.shouldDrawDetailedLocalEntities()) {
    return false;
  }

  if (!batches || !PS.atlas || typeof PS.atlas.getTraitOrganismCell !== "function") {
    return false;
  }

  for (var i = 0; i < organisms.length; i += 1) {
    var organism = organisms[i];
    var visualState = PS.render.entities.getOrganismVisualState(organism, i);
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

  perf.lastOrganismIndividualRenderCount = drawn;
  perf.lastEstimatedRenderObjectsPerSecond = perf.lastSpriteCacheMisses * 30;
  return drawn > 0 && PS.render.webgpuEntity.drawBatches(batches);
};

PS.render.entities.getSettlementDrawSize = function (settlement) {
  var level = Math.max(1, Math.round(Number(settlement && settlement.level) || 1));
  var population = Math.max(0, Number(settlement && settlement.population) || 0);
  var radius = Math.max(0, Number(settlement && settlement.radius) || 0);
  var claimedTiles = Math.max(0, Number(settlement && settlement.claimedTiles) || 0);
  var development = Math.max(0, Math.min(1, Number(settlement && settlement.development) || 0));
  var growthScale = 1.7 +
    Math.min(level, 8) * 0.28 +
    Math.sqrt(population) * 0.18 +
    Math.sqrt(claimedTiles) * 0.12 +
    radius * 0.22 +
    development * 1.2;

  return Math.max(6, CONFIG.ORGANISM_DRAW_SIZE * growthScale * PS.render.entities.getSettlementGroundDetailScale());
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

PS.render.entities.getSettlementVisualFootprint = function (settlements, options) {
  var list = Array.isArray(settlements) ? settlements : (world && Array.isArray(world.settlements) ? world.settlements : []);
  var settings = options || {};
  var width = Math.max(1, Math.round(Number(settings.width) || Number(PS.gpu && PS.gpu.canvas && PS.gpu.canvas.width) || 1));
  var height = Math.max(1, Math.round(Number(settings.height) || Number(PS.gpu && PS.gpu.canvas && PS.gpu.canvas.height) || 1));
  var minX = width;
  var minY = height;
  var maxX = 0;
  var maxY = 0;
  var count = 0;

  for (var i = 0; i < list.length; i += 1) {
    var settlement = list[i];
    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var size = PS.render.entities.getSettlementDrawSize(settlement);
    var extent = Math.max(size, size * 2.2);

    if (!point || point.visible === false || settlement && settlement.isActive === false) {
      continue;
    }

    minX = Math.min(minX, point.x - extent);
    minY = Math.min(minY, point.y - extent);
    maxX = Math.max(maxX, point.x + extent);
    maxY = Math.max(maxY, point.y + extent);
    count += 1;
  }

  if (count === 0) {
    return {
      count: 0,
      width: 0,
      height: 0,
      widthCoverage: 0,
      heightCoverage: 0,
      areaCoverage: 0
    };
  }

  minX = Math.max(0, Math.min(width, minX));
  minY = Math.max(0, Math.min(height, minY));
  maxX = Math.max(0, Math.min(width, maxX));
  maxY = Math.max(0, Math.min(height, maxY));

  return {
    count: count,
    minX: minX,
    minY: minY,
    maxX: maxX,
    maxY: maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    widthCoverage: Math.max(0, maxX - minX) / width,
    heightCoverage: Math.max(0, maxY - minY) / height,
    areaCoverage: (Math.max(0, maxX - minX) * Math.max(0, maxY - minY)) / Math.max(1, width * height)
  };
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

  if (!PS.render.entities.shouldDrawDetailedSettlementEntities()) {
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

    var band = PS.render.entities.getCurrentEntityZoomBand();
    var mapScale = band === "settlement" ? 0.72 : (band === "local" ? 0.82 : 1);
    var offset = PS.render.entities.getSettlementDistrictOffset(settlement, "structure", size * mapScale, i);
    var structureSize = (settlement && settlement.isOutpost ? size * 0.82 : size) * mapScale;
    var structureAlpha = band === "settlement" ? 0.82 : (band === "local" ? 0.88 : 0.96);

    if (PS.render.entities.appendEntityCell(batches, cell, point, structureSize, structureAlpha, "settlement", offset.x, offset.y)) {
      drawn += 1;
    }
  }

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

PS.render.entities.getSettlementVisualSeed = function (settlement, fallbackIndex) {
  var raw = settlement && settlement.id !== undefined ? String(settlement.id) : String(fallbackIndex || 0);
  var hash = 2166136261;

  for (var i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

PS.render.entities.getSettlementDistrictOffset = function (settlement, role, baseSize, index) {
  var seed = PS.render.entities.getSettlementVisualSeed(settlement, index || 0);
  var roleSeed = PS.render.entities.getSettlementVisualSeed({ id: role || "district" }, seed & 255);
  var development = Math.max(0, Math.min(1, Number(settlement && settlement.development) || 0));
  var radius = Math.max(0.35, Number(baseSize) || 1);
  var ordinal = Math.max(0, Number(index) || 0);
  var angle = Math.PI * 2 * ((((seed ^ roleSeed) >>> 0) % 997) / 997 + ordinal * 0.137);
  var distance = radius * (0.44 + development * 0.18 + (ordinal % 3) * 0.11);

  if (role === "structure") {
    distance *= settlement && settlement.isOutpost ? 0.22 : 0.08;
  } else if (role === "worldUi") {
    angle = -Math.PI / 3 + ordinal * 0.34;
    distance = radius * (0.88 + ordinal * 0.12);
  } else if (role === "stockpile") {
    angle += Math.PI * 0.18;
    distance *= 0.72;
  } else if (role === "citizen") {
    distance *= 0.92;
  } else if (role === "workStatus") {
    angle -= Math.PI * 0.2;
    distance *= 0.78;
  }

  PS.render.entities.settlementVisualStats.lastSettlementDistrictOffsets += 1;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance
  };
};

PS.render.entities.getSettlementWorldUiMetrics = function (settlement) {
  var level = Math.max(1, Math.round(Number(settlement && settlement.level) || 1));
  var stock = Math.max(Number(settlement && settlement.foodStock) || 0, Number(settlement && settlement.storedFood) || 0);
  var development = Math.max(0, Math.min(1, Number(settlement && settlement.development) || 0));
  var metrics = [];

  if (!settlement || settlement.isOutpost || level < 4) {
    metrics.push(stock > 0 ? "food" : "development");
    return metrics;
  }

  metrics.push("population");
  metrics.push(stock > 0 || development < 0.35 ? "food" : "development");
  return metrics;
};

PS.render.entities.drawSettlementInfluence = function () {
  var settlements = world && Array.isArray(world.settlements) ? world.settlements : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;
  var maxAlpha = 0;
  var stats = PS.render.entities.settlementVisualStats;

  if (!PS.render.entities.shouldDrawDetailedSettlementEntities()) {
    stats.lastSettlementInfluenceCells = 0;
    stats.lastSettlementInfluenceMaxAlpha = 0;
    return false;
  }

  if (!batches || !PS.atlas || typeof PS.atlas.getSettlementInfluenceCell !== "function") {
    stats.lastSettlementInfluenceCells = 0;
    stats.lastSettlementInfluenceMaxAlpha = 0;
    return false;
  }

  for (var i = 0; i < settlements.length; i += 1) {
    var settlement = settlements[i];
    var point = PS.render.entities.getSettlementRenderPosition(settlement);
    var drawSize = PS.render.entities.getSettlementDrawSize(settlement);
    var development = Math.max(0, Math.min(1, Number(settlement && settlement.development) || 0));
    var claimedTiles = Math.max(0, Number(settlement && settlement.claimedTiles) || 0);
    var radiusScale = Math.max(1.05, Math.min(1.85, (Number(settlement && settlement.influenceRadius) || 1) * 0.22));
    var size = drawSize * radiusScale;
    var cell = PS.atlas.getSettlementInfluenceCell(settlement);
    var alpha = Math.min(0.32, 0.18 + development * 0.12);
    var seed = PS.render.entities.getSettlementVisualSeed(settlement, i + 1);
    var patchCount = Math.max(2, Math.min(7, Math.ceil(Math.sqrt(claimedTiles) / 7) + Math.round(development * 2)));
    var patchIndex;

    if (!point || point.visible === false || settlement && settlement.isActive === false) {
      continue;
    }

    if (PS.render.entities.appendEntityCell(batches, cell, point, size, alpha, "influence")) {
      drawn += 1;
      maxAlpha = Math.max(maxAlpha, alpha);
    }

    for (patchIndex = 0; patchIndex < patchCount; patchIndex += 1) {
      var angleSeed = ((seed >>> ((patchIndex % 4) * 4)) & 15) / 16;
      var angle = Math.PI * 2 * ((patchIndex / patchCount) + angleSeed * 0.18);
      var distance = size * (0.18 + 0.1 * (patchIndex % 3));
      var patchSize = drawSize * (0.42 + 0.08 * ((seed >>> (patchIndex % 12)) & 3));
      var patchAlpha = Math.min(0.24, 0.12 + development * 0.08 + patchIndex * 0.006);

      if (PS.render.entities.appendEntityCell(
        batches,
        cell,
        point,
        patchSize,
        patchAlpha,
        "influence",
        Math.cos(angle) * distance,
        Math.sin(angle) * distance
      )) {
        drawn += 1;
        maxAlpha = Math.max(maxAlpha, patchAlpha);
      }
    }
  }

  stats.lastSettlementInfluenceCells = drawn;
  stats.lastSettlementInfluenceMaxAlpha = maxAlpha;

  return PS.render.entities.drawEntityBatches(batches, drawn);
};

/**
 * @description Converts settlement route paths and influence statistics into entity batches for roads, supply routes, trade paths, and route-bed accents.
 * @returns {number} Number of settlement route entity segments drawn.
 */
PS.render.entities.drawSettlementRoutes = function () {
  var routes = world && Array.isArray(world.settlementRoutes) ? world.settlementRoutes : [];
  var batches = PS.render.entities.createEntityBatches();
  var drawn = 0;
  var bedDrawn = 0;
  var stats = PS.render.entities.settlementVisualStats;

  if (CONFIG.PLANET_DEBUG_DISABLE_SETTLEMENT_ROUTE_ENTITIES) {
    stats.lastSettlementRouteSegments = 0;
    stats.lastSettlementRouteBedSegments = 0;
    return false;
  }

  if (!PS.render.entities.shouldDrawDetailedSettlementEntities()) {
    stats.lastSettlementRouteSegments = 0;
    stats.lastSettlementRouteBedSegments = 0;
    return false;
  }

  if (!batches || !PS.atlas || typeof PS.atlas.getRouteCell !== "function") {
    stats.lastSettlementRouteSegments = 0;
    stats.lastSettlementRouteBedSegments = 0;
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
    var size = Math.max(6, Number(CONFIG.ORGANISM_DRAW_SIZE) || 4) * 1.18;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var segments = parentPoint && childPoint
      ? Math.max(2, Math.min(18, Math.ceil(distance / Math.max(8, size * 0.72))))
      : 1;
    var segmentIndex;
    var t;
    var segmentPoint;

    if (route && route.isActive === false) {
      continue;
    }

    for (segmentIndex = 0; segmentIndex < segments; segmentIndex += 1) {
      t = segments <= 1 ? 0.5 : (segmentIndex + 0.5) / segments;
      segmentPoint = parentPoint && childPoint ? {
        x: parentPoint.x + dx * t,
        y: parentPoint.y + dy * t,
        visible: parentPoint.visible !== false || childPoint.visible !== false,
        visibility: Math.max(
          Number.isFinite(Number(parentPoint.visibility)) ? Number(parentPoint.visibility) : 1,
          Number.isFinite(Number(childPoint.visibility)) ? Number(childPoint.visibility) : 1
        )
      } : point;

      if (PS.render.entities.appendEntityCell(batches, cell, segmentPoint, size * 1.16, 0.14, "route", 0, 0, [1.18, 0.78, 0.58, 1])) {
        drawn += 1;
        bedDrawn += 1;
      }

      if (PS.render.entities.appendEntityCell(batches, cell, segmentPoint, size * 0.62, 0.48, "route", 0, 0, [1.22, 0.72, 0.50, 1])) {
        drawn += 1;
      }
    }
  }

  stats.lastSettlementRouteSegments = drawn;
  stats.lastSettlementRouteBedSegments = bedDrawn;
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

PS.render.entities.rebuildShaders = function () {};
PS.render.entities.rebuildTextures = function () {};
