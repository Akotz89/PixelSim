// Browser-side visual screenshot helpers for tests/visual/screenshot.test.js.
(function() {
const world = PS.world;
const canvas = document.getElementById("game-webgpu") || document.querySelector("canvas");
const dimensions = PS.systems && PS.systems.world && PS.systems.world.dimensions
  ? PS.systems.world.dimensions
  : null;
const WORLD_WIDTH = dimensions && Number.isFinite(Number(dimensions.width))
  ? Number(dimensions.width)
  : Math.max.apply(null, world.planetTiles.map((tile) => Number(tile && tile.x) || 0)) + 1;
const WORLD_HEIGHT = dimensions && Number.isFinite(Number(dimensions.height))
  ? Number(dimensions.height)
  : Math.max.apply(null, world.planetTiles.map((tile) => Number(tile && tile.y) || 0)) + 1;
const CONFIG = window.CONFIG || { TILE_SIZE: Math.max(1, Math.round(canvas.width / Math.max(1, WORLD_WIDTH))) };

function getTileIndex(x, y) {
  const tileX = PS.worldGrid && typeof PS.worldGrid.getWrappedX === "function"
    ? PS.worldGrid.getWrappedX(x)
    : Math.max(0, Math.min(WORLD_WIDTH - 1, Math.round(Number(x) || 0)));
  const tileY = PS.worldGrid && typeof PS.worldGrid.getClampedY === "function"
    ? PS.worldGrid.getClampedY(y)
    : Math.max(0, Math.min(WORLD_HEIGHT - 1, Math.round(Number(y) || 0)));
  return tileY * WORLD_WIDTH + tileX;
}

function setupVisualCaseView(config) {
if (typeof setWorldSeed === "function") {
  setWorldSeed("PIXEL-VIS-001");
}
if (typeof seedWorld === "function") {
  seedWorld();
}

const view = PS.camera.getView();
view.zoomLevel = config.zoom;

if (config.orbitEvents) {
  view.latitude = 4;
  view.longitude = -12;
  view.panEastMeters = 0;
  view.panNorthMeters = 0;
  world.tick = Math.max(world.tick || 0, 240);
  world.timelineEvents = [
    {
      tick: world.tick - 40,
      type: "biology.first-life",
      label: "First life",
      detail: "microbial bloom",
      category: "biology",
      severity: "info",
      source: "biology",
      location: { latitude: 4, longitude: -12 }
    },
    {
      tick: world.tick - 20,
      type: "geology.rift",
      label: "Rift surge",
      detail: "tectonic pressure",
      category: "geology",
      severity: "critical",
      source: "geology",
      location: { latitude: -8, longitude: 18 }
    }
  ];
}
return view;
}

function configureOverlayAndEntityMarkers(config, view) {
if (config.overlay || config.entities) {
  const centerTile = world.planetTiles[Math.floor(world.planetTiles.length / 2)] || { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  const centerX = Math.max(4, Math.min(WORLD_WIDTH - 5, Math.round(Number(centerTile.x) || WORLD_WIDTH / 2)));
  const centerY = Math.max(4, Math.min(WORLD_HEIGHT - 5, Math.round(Number(centerTile.y) || WORLD_HEIGHT / 2)));
  const focusTile = world.planetTiles[getTileIndex(centerX, centerY)] || centerTile;
  world.organisms = [];
  for (let marker = 0; marker < 18; marker++) {
    const tileX = centerX + (marker % 6) - 3;
    const tileY = centerY + Math.floor(marker / 6) - 1;
    const tile = world.planetTiles[getTileIndex(tileX, tileY)] || focusTile;
    world.organisms.push({
      x: tile.x,
      y: tile.y,
      latitude: tile.latitude,
      longitude: tile.longitude,
      prevX: tile.x,
      prevY: tile.y,
      prevLatitude: tile.latitude,
      prevLongitude: tile.longitude,
      energy: 180,
      lineageId: 1,
      speciesId: 1,
      populationId: 1,
      representativeId: 1000 + marker
    });
  }
  if (PS.sim && PS.sim.organisms && typeof PS.sim.organisms.rebuildIndexes === "function") {
    PS.sim.organisms.rebuildIndexes();
  }
  view.latitude = Number(focusTile.latitude) || 0;
  view.longitude = Number(focusTile.longitude) || 0;
  view.panEastMeters = 0;
  view.panNorthMeters = 0;
  if (config.overlay) {
    world.overlayPerformance = {};
    if (PS.render && PS.render.observationOverlays) {
      PS.render.observationOverlays.setActive(config.overlay);
    } else {
      world.activeObservationOverlay = config.overlay;
    }
  }
}
}

function configureBiomeTarget(config) {
if (config.biome || config.entities || config.settlement || config.acceptedTerrain) {
  const targetBiome = config.biome || null;
  let targetTile = null;

    for (let i = 0; i < world.planetTiles.length; i++) {
      const tile = world.planetTiles[i];
      if (!tile) {
        continue;
      }
    if (!targetBiome || tile.biome === targetBiome) {
      targetTile = tile;
      break;
    }
  }

  if (config.entities && world.organisms.length > 0) {
    const organism = world.organisms[0];
    targetTile = { x: organism.x, y: organism.y, latitude: organism.latitude, longitude: organism.longitude };
    organism.energy = 240;
    organism.directionX = 1;
    organism.directionY = 0;
    organism.selected = true;
    const foodX = Math.max(0, Math.min(WORLD_WIDTH - 1, Math.round(Number(organism.x) || 0) + 1));
    const foodY = Math.max(0, Math.min(WORLD_HEIGHT - 1, Math.round(Number(organism.y) || 0)));
    const foodTile = world.planetTiles[getTileIndex(foodX, foodY)] || targetTile;
    let visualFood;
    if (typeof addFoodAt === "function") {
      visualFood = addFoodAt(foodTile.x, foodTile.y);
    } else {
      world.food = Array.isArray(world.food) ? world.food : [];
      visualFood = {
        x: foodTile.x,
        y: foodTile.y,
        active: true,
        foodIndex: world.food.length
      };
      world.food.push(visualFood);
    }
    visualFood.latitude = Number(organism.latitude);
    visualFood.longitude = Number(organism.longitude);
    visualFood.prevX = visualFood.x;
    visualFood.prevY = visualFood.y;
    visualFood.prevLatitude = visualFood.latitude;
    visualFood.prevLongitude = visualFood.longitude;
    visualFood.energy = CONFIG.FOOD_ENERGY_VALUE;
    if (PS.sim && PS.sim.representatives) {
      PS.sim.representatives.select(organism);
      const representative = PS.sim.representatives.getRepresentative(organism.representativeId);
      if (representative) {
        representative.behavior = "foraging";
        representative.target = { type: "food", x: visualFood.x, y: visualFood.y };
        representative.selected = true;
      }
    }
  }

  if (config.acceptedTerrain || config.settlement) {
    if (!targetTile) {
      targetTile = world.planetTiles[Math.floor(world.planetTiles.length / 2)];
    }

    if (config.acceptedTerrain) {
      world.food = [];
      world.organisms = [];
      world.settlements = [];
      world.settlementRoutes = [];
      if (PS.sim && PS.sim.organisms && typeof PS.sim.organisms.rebuildIndexes === "function") {
        PS.sim.organisms.rebuildIndexes();
      }
      if (PS.sim && PS.sim.settlements && typeof PS.sim.settlements.rebuildIndexes === "function") {
        PS.sim.settlements.rebuildIndexes();
      }
    }
return targetTile;
}
}
}

function configureAcceptedTerrainTarget(config, targetTile) {
    let fallbackLandTile = null;
    let fallbackMidLatitudeLandTile = null;

    for (let i = 0; i < world.planetTiles.length; i++) {
      const tile = world.planetTiles[i];
      const blend = tile && tile.tileBlend;
      const weights = blend && blend.biomeWeights;
      const tileX = Math.round(Number(tile && tile.x));
      const tileY = Math.round(Number(tile && tile.y));
      const canStageDistrict = tileX >= 12 && tileX <= WORLD_WIDTH - 13 && tileY >= 12 && tileY <= WORLD_HEIGHT - 13;
      if (!fallbackLandTile && tile && tile.biome && tile.biome !== "ocean" && canStageDistrict) {
        fallbackLandTile = tile;
      }
      if (!fallbackMidLatitudeLandTile && tile && tile.biome && tile.biome !== "ocean" && canStageDistrict && Math.abs(Number(tile.latitude) || 0) <= 45) {
        fallbackMidLatitudeLandTile = tile;
      }
      if (
        tile &&
        tile.biome &&
        tile.biome !== "ocean" &&
        canStageDistrict &&
        Math.abs(Number(tile.latitude) || 0) <= 45 &&
        weights &&
        Number(blend.transitionStrength) > 0.18
      ) {
        targetTile = tile;
        break;
      }
    }
    if (!targetTile || targetTile.biome === "ocean") {
      targetTile = fallbackMidLatitudeLandTile || fallbackLandTile || targetTile;
    }

    if (targetTile && targetTile.biome && targetTile.biome !== "ocean") {
      const targetX = Number.isFinite(Number(targetTile.x)) ? Number(targetTile.x) : WORLD_WIDTH / 2;
      const targetY = Number.isFinite(Number(targetTile.y)) ? Number(targetTile.y) : WORLD_HEIGHT / 2;
      const centerX = Math.round(targetX);
      const centerY = Math.round(targetY);
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const tx = Math.max(0, Math.min(WORLD_WIDTH - 1, centerX + dx));
          const ty = Math.max(0, Math.min(WORLD_HEIGHT - 1, centerY + dy));
          const tile = world.planetTiles[getTileIndex(tx, ty)];
          if (!tile || !tile.biome || tile.biome === "ocean") {
            continue;
          }
          const biomeWeight = {};
          biomeWeight[tile.biome] = 0.72;
          biomeWeight.ocean = 0.28;
          tile.tileBlend = Object.assign({}, tile.tileBlend || {}, {
            biomeWeights: biomeWeight,
            transitionStrength: 0.76,
            xAmount: dx > 0 ? 0.68 : (dx < 0 ? 0.32 : 0.5),
            yAmount: dy > 0 ? 0.68 : (dy < 0 ? 0.32 : 0.24)
          });
        }
      }
      if (PS.render && PS.render.surface && typeof PS.render.surface.resetChunkCache === "function") {
        PS.render.surface.resetChunkCache();
      }
      if (PS.render && PS.render.surfaceRender && typeof PS.render.surfaceRender.resetChunkCache === "function") {
        PS.render.surfaceRender.resetChunkCache();
      }
      if (PS.render && PS.render.surfaceRender && typeof PS.render.surfaceRender.invalidateTerrainCache === "function") {
        PS.render.surfaceRender.invalidateTerrainCache();
      }
      if (PS.render && PS.render.terrain && typeof PS.render.terrain.invalidateCache === "function") {
        PS.render.terrain.invalidateCache();
      }
    }
return targetTile;
}

function configureSettlementTarget(config, targetTile) {
  if (config.settlement) {
    if (!targetTile) {
      targetTile = world.planetTiles[Math.floor(world.planetTiles.length / 2)];
    }

    const targetX = Number.isFinite(Number(targetTile.x)) ? Number(targetTile.x) : WORLD_WIDTH / 2;
    const targetY = Number.isFinite(Number(targetTile.y)) ? Number(targetTile.y) : WORLD_HEIGHT / 2;
    const centerX = Math.max(12, Math.min(WORLD_WIDTH - 13, Math.round(targetX)));
    const centerY = Math.max(12, Math.min(WORLD_HEIGHT - 13, Math.round(targetY)));
    const parentTile = world.planetTiles[getTileIndex(centerX, centerY)] || targetTile;
    const parentMeters = PS.render && PS.render.globe && typeof PS.render.globe.getSurfaceMeters === "function"
      ? PS.render.globe.getSurfaceMeters(parentTile.latitude, parentTile.longitude)
      : { eastMeters: 0, northMeters: 0 };
    const makeVisualSettlement = (fixture) => {
      const tile = world.planetTiles[getTileIndex(centerX + fixture.dx, centerY + fixture.dy)] || parentTile;
      const localLatLon = PS.render && PS.render.globe && typeof PS.render.globe.getLatLonFromSurfaceMeters === "function"
        ? PS.render.globe.getLatLonFromSurfaceMeters(
          parentMeters.eastMeters + fixture.eastMeters,
          parentMeters.northMeters + fixture.northMeters
        )
        : { latitude: tile.latitude, longitude: tile.longitude };
      return {
        id: fixture.id,
        lineageId: 3,
        x: tile.x,
        y: tile.y,
        prevX: tile.x,
        prevY: tile.y,
        latitude: localLatLon.latitude,
        longitude: localLatLon.longitude,
        prevLatitude: localLatLon.latitude,
        prevLongitude: localLatLon.longitude,
        foundedTick: world.tick,
        radius: fixture.radius,
        population: fixture.population,
        foodStock: fixture.foodStock,
        storedFood: fixture.storedFood,
        development: fixture.development,
        level: fixture.level,
        influenceRadius: fixture.influenceRadius,
        claimedTiles: fixture.claimedTiles,
        claimedFood: fixture.claimedFood,
        parentSettlementId: fixture.isOutpost ? 9101 : 0,
        isOutpost: fixture.isOutpost,
        isColony: !fixture.isOutpost,
        isActive: true,
        lastActiveTick: world.tick
      };
    };
    const settlementFixtures = [
      { id: 9101, dx: 0, dy: 0, eastMeters: 0, northMeters: 0, radius: 11, population: 760, foodStock: 520, storedFood: 610, development: 0.96, level: 8, influenceRadius: 15, claimedTiles: 900, claimedFood: 210, isOutpost: false },
      { id: 9102, dx: 2, dy: 0, eastMeters: 74, northMeters: -8, radius: 6, population: 160, foodStock: 142, storedFood: 164, development: 0.72, level: 4, influenceRadius: 8, claimedTiles: 260, claimedFood: 64, isOutpost: true },
      { id: 9103, dx: -2, dy: 1, eastMeters: -82, northMeters: -44, radius: 6, population: 190, foodStock: 210, storedFood: 235, development: 0.78, level: 4, influenceRadius: 9, claimedTiles: 300, claimedFood: 88, isOutpost: true },
      { id: 9104, dx: -2, dy: -2, eastMeters: -70, northMeters: 58, radius: 5, population: 120, foodStock: 98, storedFood: 120, development: 0.62, level: 3, influenceRadius: 7, claimedTiles: 210, claimedFood: 42, isOutpost: true },
      { id: 9105, dx: 2, dy: -2, eastMeters: 86, northMeters: 54, radius: 5, population: 112, foodStock: 126, storedFood: 144, development: 0.58, level: 3, influenceRadius: 7, claimedTiles: 196, claimedFood: 46, isOutpost: true },
      { id: 9106, dx: 0, dy: 3, eastMeters: 18, northMeters: -72, radius: 5, population: 138, foodStock: 166, storedFood: 184, development: 0.66, level: 3, influenceRadius: 8, claimedTiles: 230, claimedFood: 72, isOutpost: true },
      { id: 9107, dx: 0, dy: -3, eastMeters: -20, northMeters: 76, radius: 5, population: 128, foodStock: 116, storedFood: 140, development: 0.6, level: 3, influenceRadius: 7, claimedTiles: 205, claimedFood: 52, isOutpost: true },
      { id: 9108, dx: 3, dy: 2, eastMeters: 122, northMeters: -62, radius: 4, population: 76, foodStock: 88, storedFood: 98, development: 0.46, level: 2, influenceRadius: 6, claimedTiles: 132, claimedFood: 28, isOutpost: true },
      { id: 9109, dx: -3, dy: 2, eastMeters: -128, northMeters: -58, radius: 4, population: 82, foodStock: 92, storedFood: 108, development: 0.5, level: 2, influenceRadius: 6, claimedTiles: 148, claimedFood: 34, isOutpost: true }
    ];

    world.settlements = settlementFixtures.map(makeVisualSettlement);
    world.settlementRoutes = world.settlements.slice(1).map((settlement, index) => ({
      id: 8101 + index,
      parentSettlementId: 9101,
      childSettlementId: settlement.id,
      lineageId: 3,
      isActive: true,
      foodTransferred: 140 - index * 18,
      lastTransferTick: world.tick
    }));
    world.nextSettlementId = 9110;
    world.nextSettlementRouteId = 8109;
    if (PS.sim && PS.sim.settlements && typeof PS.sim.settlements.rebuildIndexes === "function") {
      PS.sim.settlements.rebuildIndexes();
    }
    targetTile = parentTile;
  }
return targetTile;
}

function applyTargetAndEntityPositions(config, view, targetTile) {
  if (targetTile) {
    view.latitude = Number(targetTile.latitude);
    view.longitude = Number(targetTile.longitude);
    view.panEastMeters = 0;
    view.panNorthMeters = 0;
  }

  if (config.entities && world.organisms.length > 0) {
    const organism = world.organisms[0];
    organism.x = targetTile ? targetTile.x : organism.x;
    organism.y = targetTile ? targetTile.y : organism.y;
    organism.prevX = organism.x;
    organism.prevY = organism.y;
    organism.latitude = view.latitude;
    organism.longitude = view.longitude;
    organism.prevLatitude = view.latitude;
    organism.prevLongitude = view.longitude;
    if (Array.isArray(world.food) && world.food.length > 0) {
      world.food[0].x = organism.x;
      world.food[0].y = organism.y;
      world.food[0].prevX = organism.x;
      world.food[0].prevY = organism.y;
      world.food[0].latitude = view.latitude;
      world.food[0].longitude = view.longitude;
      world.food[0].prevLatitude = view.latitude;
      world.food[0].prevLongitude = view.longitude;
    }
    if (PS.sim && PS.sim.representatives) {
      const representative = PS.sim.representatives.select(organism);
      const targetFood = Array.isArray(world.food) && world.food.length > 0 ? world.food[0] : null;
      if (representative) {
        representative.behavior = "foraging";
        representative.target = {
          type: "food",
          x: targetFood ? targetFood.x : organism.x,
          y: targetFood ? targetFood.y : organism.y
        };
        representative.selected = true;
      }
    }
  }
}

function configureSettlementParticles(config) {
  if (config.settlement && PS.render && PS.render.particles) {
    if (typeof PS.render.particles.reset === "function") {
      PS.render.particles.reset(world.rngState || 0x9E3779B9);
    }
    if (typeof PS.render.particles.loadDefinitions === "function") {
      PS.render.particles.loadDefinitions(PS.assets ? PS.assets.particlesData : null);
    }
    const settlementPoint = PS.render.entities && typeof PS.render.entities.getSettlementRenderPosition === "function"
      ? PS.render.entities.getSettlementRenderPosition(world.settlements[0])
      : null;
    const activityEmitter = typeof PS.render.particles.createEmitter === "function"
      ? PS.render.particles.createEmitter("settlement_activity", {
        id: "visual.settlement_activity",
        active: false,
        position: {
          x: settlementPoint ? settlementPoint.x : canvas.width * 0.5,
          y: settlementPoint ? settlementPoint.y : canvas.height * 0.5
        }
      })
      : null;
    if (activityEmitter && typeof activityEmitter.burst === "function") {
      activityEmitter.burst(24);
    }
  }
}

function finishVisualCase(config) {
world.isPaused = true;
world.needsRender = true;
if (typeof drawWorld === "function") {
  drawWorld();
}
world.needsRender = false;
if (config.hud && typeof updateHud === "function") {
  updateHud();
}
}

function prepareVisualCase(config) {
  const view = setupVisualCaseView(config);
  configureOverlayAndEntityMarkers(config, view);
  let targetTile = configureBiomeTarget(config);

  if (config.acceptedTerrain || config.settlement) {
    targetTile = configureAcceptedTerrainTarget(config, targetTile);
  }
  if (config.settlement) {
    targetTile = configureSettlementTarget(config, targetTile);
  }

  applyTargetAndEntityPositions(config, view, targetTile);
  configureSettlementParticles(config);
  finishVisualCase(config);
}

async function readPresentedFrame(label, includePixels) {
  if (!PS.gpu || !PS.gpu.device || !PS.gpu.context || typeof PS.gpu.context.getCurrentTexture !== "function") {
    return null;
  }

  const device = PS.gpu.device;
  const width = Math.max(1, Math.round(Number(canvas.width) || 1));
  const height = Math.max(1, Math.round(Number(canvas.height) || 1));
  const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
  const format = PS.gpu.format || "bgra8unorm";
  const texture = device.createTexture({
    label: label || "visual.capture",
    size: { width, height },
    format,
    usage: 16 | 1
  });
  const originalGetCurrentTexture = PS.gpu.context.getCurrentTexture.bind(PS.gpu.context);

  PS.gpu.context.getCurrentTexture = function () {
    return texture;
  };

  try {
    if (typeof drawWorld === "function") {
      drawWorld();
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (typeof drawWorld === "function") {
      drawWorld();
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  } finally {
    PS.gpu.context.getCurrentTexture = originalGetCurrentTexture;
  }

  const encoder = device.createCommandEncoder({ label: (label || "visual.capture") + ".copy" });
  const buffer = device.createBuffer({
    label: (label || "visual.capture") + ".buffer",
    size: bytesPerRow * height,
    usage: 1 | 8
  });
  encoder.copyTextureToBuffer(
    { texture },
    { buffer, bytesPerRow, rowsPerImage: height },
    { width, height }
  );
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(1);

  const data = new Uint8Array(buffer.getMappedRange());
  const buckets = {};
  let opaque = 0;
  let nonblank = 0;
  let min = 255;
  let max = 0;
  let sum = 0;
  const rgba = includePixels ? new Uint8Array(width * height * 4) : null;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = y * bytesPerRow + x * 4;
      const sourceBlue = data[sourceOffset];
      const green = data[sourceOffset + 1];
      const sourceRed = data[sourceOffset + 2];
      const alpha = data[sourceOffset + 3];
      const red = format === "bgra8unorm" ? sourceRed : sourceBlue;
      const blue = format === "bgra8unorm" ? sourceBlue : sourceRed;
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

      min = Math.min(min, luminance);
      max = Math.max(max, luminance);
      sum += luminance;
      if (alpha > 0) {
        opaque += 1;
      }
      if (alpha > 0 && luminance >= 8) {
        nonblank += 1;
      }
      buckets[(red >> 4) + ":" + (green >> 4) + ":" + (blue >> 4)] = true;

      if (rgba) {
        const destOffset = (y * width + x) * 4;
        rgba[destOffset] = red;
        rgba[destOffset + 1] = green;
        rgba[destOffset + 2] = blue;
        rgba[destOffset + 3] = alpha;
      }
    }
  }

  if (typeof buffer.unmap === "function") {
    buffer.unmap();
  }
  if (texture && typeof texture.destroy === "function") {
    texture.destroy();
  }

  return {
    width,
    height,
    opaqueCoverage: Number((opaque / Math.max(1, width * height)).toFixed(4)),
    nonblankCoverage: Number((nonblank / Math.max(1, width * height)).toFixed(4)),
    coarseColorCount: Object.keys(buckets).length,
    luminanceMin: Number(min.toFixed(2)),
    luminanceMax: Number(max.toFixed(2)),
    luminanceMean: Number((sum / Math.max(1, width * height)).toFixed(2)),
    contrastRange: Number((max - min).toFixed(2)),
    rgbaBase64: rgba ? btoa(Array.from(rgba, (value) => String.fromCharCode(value)).join("")) : null
  };
}

function drawAcceptedTerrainProofCaches(config) {
if (
  config.acceptedTerrain &&
  PS.render &&
  PS.render.webgpuSurfaceTile &&
  typeof PS.render.webgpuSurfaceTile.drawTerrainAtlas === "function"
) {
  const previousPaused = world.isPaused;
  const previousInteracting = world.isCameraInteracting;
  world.isPaused = true;
  world.isCameraInteracting = false;
  const cellCache = [];
  const transitionCellCache = [];
  const proofTileSize = config.proofScene ? 18 : 16;
  const proofColumns = config.proofScene ? Math.ceil(canvas.width / proofTileSize) + 1 : 4;
  const proofRows = config.proofScene ? Math.ceil(canvas.height / proofTileSize) + 1 : 4;
  const proofCount = proofColumns * proofRows;
  const proofCacheTileSize = CONFIG && CONFIG.TILE_SIZE ? CONFIG.TILE_SIZE : 64;
  for (let i = 0; i < proofCount; i++) {
    const x = i % proofColumns;
    const y = Math.floor(i / proofColumns);
    const selector = (x * 7 + y * 11) % 12;
    const biome = "grassland";
    const isWater = selector === 0 || selector === 3;
    const isRock = selector === 2;
    const isSand = selector === 1;
    const surface = isWater ? (selector === 0 ? "deep water" : "open water shallows") : (isRock ? "stone ridge" : (isSand ? "sand dune" : "grass"));
    const feature = isWater ? "foam" : (isRock ? "ridge" : (isSand ? "dune" : "meadow"));
    const acceptedTerrainCellName = isWater
      ? (selector === 0 ? "water-deep.0" : "water-shallow.0")
      : (isRock ? "rock-mountain.0" : (isSand ? "dirt-soil.0" : "grass-lush.0"));
    const sample = {
      biome,
      acceptedTerrainCellName,
      acceptedTransitionCellName: "",
      detail: {
        surface,
        feature,
        materialSignals: isWater
          ? { coast: 0.8, shallowWater: selector === 3 ? 0.7 : 0.2, waterDepth: selector === 0 ? 0.85 : 0.35 }
          : (isRock ? { slope: 0.8 } : (isSand ? { dryness: 0.8 } : {}))
      },
      tileBlend: {
        biomeWeights: isWater ? { grassland: 0.28, ocean: 0.72 } : { grassland: 0.72, ocean: 0.28 },
        transitionStrength: 0.76,
        xAmount: x % 2 ? 0.68 : 0.32,
        yAmount: y % 2 ? 0.68 : 0.24
      }
    };
    cellCache.push({
      sample,
      screenX: x * proofCacheTileSize,
      screenY: y * proofCacheTileSize
    });
    transitionCellCache.push({
      sample: {
        biome: "grassland",
        acceptedTransitionCellName: [
          "grass-water.edge.n",
          "grass-water.edge.e",
          "grass-water.corner.se",
          "grass-sand.edge.s",
          "grass-rock.edge.w"
        ][(x + y) % 5]
      },
      screenX: x * proofCacheTileSize,
      screenY: y * proofCacheTileSize
    });
  }
  PS.render.webgpuSurfaceTile.drawTerrainAtlas({
    sampleEast: 2,
    sampleNorth: 50,
    renderScreenX: 0,
    renderScreenY: 0,
    renderSamplePixelSize: proofTileSize,
    chunkSamples: proofColumns
  }, cellCache, 1);
  PS.render.webgpuSurfaceTile.drawTerrainAtlas({
    sampleEast: 0,
    sampleNorth: 0,
    renderScreenX: 0,
    renderScreenY: 0,
    renderSamplePixelSize: proofTileSize,
    chunkSamples: proofColumns
  }, transitionCellCache, 1);
  world.isPaused = previousPaused;
  world.isCameraInteracting = previousInteracting;
}
}

async function readProofSceneFrame(config) {
if (config.proofScene && PS.gpu && PS.gpu.device && PS.render && PS.render.webgpuSurfaceTile) {
  const previousPaused = world.isPaused;
  const previousInteracting = world.isCameraInteracting;
  world.isPaused = true;
  world.isCameraInteracting = false;
  const device = PS.gpu.device;
  const width = Math.max(1, Math.round(Number(canvas.width) || 1));
  const height = Math.max(1, Math.round(Number(canvas.height) || 1));
  const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
  const includeProofPixels = Boolean(config.writeProofEvidence);
  const proofFormat = PS.gpu.format || "bgra8unorm";
  const proofTexture = device.createTexture({
    label: "azr-803.proof-readback",
    size: { width, height },
    format: proofFormat,
    usage: 16 | 1
  });
  const proofTileSize = 18;
  const proofColumns = Math.ceil(width / proofTileSize) + 1;
  const proofRows = Math.ceil(height / proofTileSize) + 1;
  const proofCacheTileSize = CONFIG && CONFIG.TILE_SIZE ? CONFIG.TILE_SIZE : 64;
  const cellCache = [];
  const transitionCellCache = [];

  for (let i = 0; i < proofColumns * proofRows; i++) {
    const x = i % proofColumns;
    const y = Math.floor(i / proofColumns);
    const selector = (x * 7 + y * 11) % 12;
    const biome = "grassland";
    const isWater = selector === 0 || selector === 3;
    const isRock = selector === 2;
    const isSand = selector === 1;
    const surface = isWater ? (selector === 0 ? "deep water" : "open water shallows") : (isRock ? "stone ridge" : (isSand ? "sand dune" : "grass"));

    cellCache.push({
      sample: {
        biome,
        acceptedTerrainCellName: isWater
          ? (selector === 0 ? "water-deep.0" : "water-shallow.0")
          : (isRock ? "rock-mountain.0" : (isSand ? "dirt-soil.0" : "grass-lush.0")),
        detail: {
          surface,
          feature: isWater ? "foam" : (isRock ? "ridge" : (isSand ? "dune" : "meadow")),
          materialSignals: isWater
            ? { coast: 0.8, shallowWater: selector === 3 ? 0.7 : 0.2, waterDepth: selector === 0 ? 0.85 : 0.35 }
            : (isRock ? { slope: 0.8 } : (isSand ? { dryness: 0.8 } : {}))
        },
        tileBlend: {
          biomeWeights: isWater ? { grassland: 0.28, ocean: 0.72 } : { grassland: 0.72, ocean: 0.28 },
          transitionStrength: 0.76,
          xAmount: x % 2 ? 0.68 : 0.32,
          yAmount: y % 2 ? 0.68 : 0.24
        }
      },
      screenX: x * proofCacheTileSize,
      screenY: y * proofCacheTileSize
    });
    transitionCellCache.push({
      sample: {
        biome: "grassland",
        acceptedTransitionCellName: [
          "grass-water.edge.n",
          "grass-water.edge.e",
          "grass-water.corner.se",
          "grass-sand.edge.s",
          "grass-rock.edge.w"
        ][(x + y) % 5]
      },
      screenX: x * proofCacheTileSize,
      screenY: y * proofCacheTileSize
    });
  }

  PS.render.webgpuSurfaceTile.drawTerrainAtlas({
    sampleEast: 0,
    sampleNorth: 0,
    renderScreenX: 0,
    renderScreenY: 0,
    renderSamplePixelSize: proofTileSize,
    chunkSamples: proofColumns
  }, cellCache, 1, { textureView: proofTexture.createView(), gbuffer: true, loadOp: "clear" });
  PS.render.webgpuSurfaceTile.drawTerrainAtlas({
    sampleEast: 0,
    sampleNorth: 0,
    renderScreenX: 0,
    renderScreenY: 0,
    renderSamplePixelSize: proofTileSize,
    chunkSamples: proofColumns
  }, transitionCellCache, 1, { textureView: proofTexture.createView(), gbuffer: true, loadOp: "load" });
  world.isPaused = previousPaused;
  world.isCameraInteracting = previousInteracting;

  const encoder = device.createCommandEncoder({ label: "azr-803.proof-readback.copy" });
  const buffer = device.createBuffer({
    label: "azr-803.proof-readback.buffer",
    size: bytesPerRow * height,
    usage: 1 | 8
  });
  encoder.copyTextureToBuffer(
    { texture: proofTexture },
    { buffer, bytesPerRow, rowsPerImage: height },
    { width, height }
  );
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(1);

  const data = new Uint8Array(buffer.getMappedRange());
  const buckets = {};
  let nonblank = 0;
  let min = 255;
  let max = 0;
  let sum = 0;
  const rgba = includeProofPixels ? new Uint8Array(width * height * 4) : null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * bytesPerRow + x * 4;
      const sourceBlue = data[offset];
      const green = data[offset + 1];
      const sourceRed = data[offset + 2];
      const alpha = data[offset + 3];
      const red = proofFormat === "bgra8unorm" ? sourceRed : sourceBlue;
      const blue = proofFormat === "bgra8unorm" ? sourceBlue : sourceRed;
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      min = Math.min(min, luminance);
      max = Math.max(max, luminance);
      sum += luminance;
      if (alpha > 0 && luminance >= 8) {
        nonblank += 1;
      }
      buckets[(red >> 4) + ":" + (green >> 4) + ":" + (blue >> 4)] = true;
      if (rgba) {
        const rgbaOffset = (y * width + x) * 4;
        rgba[rgbaOffset] = red;
        rgba[rgbaOffset + 1] = green;
        rgba[rgbaOffset + 2] = blue;
        rgba[rgbaOffset + 3] = alpha;
      }
    }
  }

  return {
    width,
    height,
    nonblankCoverage: Number((nonblank / Math.max(1, width * height)).toFixed(4)),
    coarseColorCount: Object.keys(buckets).length,
    luminanceMin: Number(min.toFixed(2)),
    luminanceMax: Number(max.toFixed(2)),
    luminanceMean: Number((sum / Math.max(1, width * height)).toFixed(2)),
    contrastRange: Number((max - min).toFixed(2)),
    rgbaBase64: rgba ? btoa(Array.from(rgba, (value) => String.fromCharCode(value)).join("")) : null
  };
  }

  return null;
}

function collectRuntimeStats(config, sceneReadback, proofReadback) {
  const stats = PS.render.renderer && typeof PS.render.renderer.getStats === "function"
    ? PS.render.renderer.getStats()
    : {};
  const surfaceStats = PS.render.webgpuSurfaceTile ? PS.render.webgpuSurfaceTile.state : {};
  if (config.acceptedTerrain && surfaceStats) {
    stats.equivalenceTerrainDraws = surfaceStats.equivalenceTerrainDrawCount || 0;
    stats.equivalenceTransitionDraws = surfaceStats.equivalenceTransitionDrawCount || 0;
    stats.districtMaterialDrawCount = surfaceStats.districtMaterialDrawCount || 0;
    stats.civilizationCounts = Object.assign({}, stats.civilizationCounts || {}, surfaceStats.civilizationCounts || {});
    stats.equivalenceAssetUses = Object.assign({}, stats.equivalenceAssetUses || {}, surfaceStats.equivalenceSelectedUses || {});
    stats.equivalenceAssetSheets = Object.assign({}, stats.equivalenceAssetSheets || {}, surfaceStats.equivalenceSelectedSheets || {});
  }
  if (
    !stats.equivalenceTerrainDraws &&
    stats.equivalenceAssetUses &&
    (stats.equivalenceAssetUses.terrainGround || stats.equivalenceAssetUses.terrainWater || stats.equivalenceAssetUses.terrainMaterial)
  ) {
    stats.equivalenceTerrainDraws = (stats.equivalenceAssetUses.terrainGround || 0) +
      (stats.equivalenceAssetUses.terrainWater || 0) +
      (stats.equivalenceAssetUses.terrainMaterial || 0);
  }
  if (!stats.equivalenceTransitionDraws && stats.equivalenceAssetUses && stats.equivalenceAssetUses.terrainTransition) {
    stats.equivalenceTransitionDraws = stats.equivalenceAssetUses.terrainTransition;
  }
const particleStats = PS.render.particles && typeof PS.render.particles.getStats === "function"
  ? PS.render.particles.getStats()
  : {};
const settlementFootprint = PS.render.entities && typeof PS.render.entities.getSettlementVisualFootprint === "function"
  ? PS.render.entities.getSettlementVisualFootprint(world.settlements, { width: canvas.width, height: canvas.height })
  : null;
const routeDiagnostics = config.settlement && PS.render && PS.render.entities
  ? (() => {
    const before = PS.render.webgpuEntity && typeof PS.render.webgpuEntity.getStats === "function"
      ? PS.render.webgpuEntity.getStats()
      : {};
    let routeDrawResult = false;
    let routeError = "";
    try {
      routeDrawResult = typeof PS.render.entities.drawSettlementRoutes === "function"
        ? PS.render.entities.drawSettlementRoutes()
        : false;
    } catch (error) {
      routeError = String(error && (error.stack || error.message) ? (error.stack || error.message) : error);
    }
    const after = PS.render.webgpuEntity && typeof PS.render.webgpuEntity.getStats === "function"
      ? PS.render.webgpuEntity.getStats()
      : {};
    const route = Array.isArray(world.settlementRoutes) ? world.settlementRoutes[0] : null;
    const parent = route && PS.render.entities.getSettlementById
      ? PS.render.entities.getSettlementById(route.parentSettlementId || route.fromSettlementId || route.fromId)
      : null;
    const child = route && PS.render.entities.getSettlementById
      ? PS.render.entities.getSettlementById(route.childSettlementId || route.toSettlementId || route.toId)
      : null;
    const parentPoint = parent && PS.render.entities.getSettlementRenderPosition
      ? PS.render.entities.getSettlementRenderPosition(parent)
      : null;
    const childPoint = child && PS.render.entities.getSettlementRenderPosition
      ? PS.render.entities.getSettlementRenderPosition(child)
      : null;
    const routeCell = route && PS.atlas && PS.atlas.getRouteCell
      ? PS.atlas.getRouteCell(route, "diag")
      : null;
    return {
      routes: Array.isArray(world.settlementRoutes) ? world.settlementRoutes.length : 0,
      settlements: Array.isArray(world.settlements) ? world.settlements.length : 0,
      routeDrawResult,
      routeError,
      beforeRouteDrawCount: before.routeDrawCount || 0,
      afterRouteDrawCount: after.routeDrawCount || 0,
      routeIds: route ? {
        parent: route.parentSettlementId || route.fromSettlementId || route.fromId || null,
        child: route.childSettlementId || route.toSettlementId || route.toId || null
      } : null,
      parentFound: !!parent,
      childFound: !!child,
      parentPoint,
      childPoint,
      routeCell: routeCell ? {
        name: routeCell.name,
        pageIndex: routeCell.pageIndex,
        u0: routeCell.u0,
        v0: routeCell.v0,
        u1: routeCell.u1,
        v1: routeCell.v1
      } : null,
      flushSequence: PS.render.drawOrder && Array.isArray(PS.render.drawOrder.lastFlushSequence)
        ? PS.render.drawOrder.lastFlushSequence.map((entry) => entry.id)
        : []
    };
  })()
  : null;
return {
  zoomBand: PS.render.pipeline.getZoomBand(world.planetView.zoomLevel),
  zoomLevel: world.planetView.zoomLevel,
  rendererStats: stats,
  particleStats,
  settlementFootprint,
  routeDiagnostics,
  proofReadback,
  sceneReadback,
  selectedRepresentative: PS.sim && PS.sim.representatives && world.organisms[0]
    ? PS.sim.representatives.getRepresentative(world.organisms[0].representativeId)
    : null,
  debugText: (document.getElementById("debug-output") || {}).textContent || ""
  };
}

async function collectVisualCaseStats(config) {
  drawAcceptedTerrainProofCaches(config);
  const sceneReadback = await readPresentedFrame(
    "visual." + String(config.name || "case") + ".scene",
    true
  );
  const proofReadback = await readProofSceneFrame(config);
  return collectRuntimeStats(config, sceneReadback, proofReadback);
}

window.__pixeldariumScreenshotHelpers = {
  prepareCase: prepareVisualCase,
  collectCaseStats: collectVisualCaseStats
};
})();
