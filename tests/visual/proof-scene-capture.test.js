const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../..");
const outputDir = path.join(root, "docs", "visual-regression", "azr-1081");
const viewport = { width: 960, height: 540 };
const webgpuLaunchArgs = [
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan,WebGPUDeveloperFeatures",
  "--enable-webgpu-developer-features",
  "--use-angle=vulkan"
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const payload = Buffer.concat([typeBuffer, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(payload), 8 + data.length);
  return chunk;
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  const ihdr = Buffer.alloc(13);
  const rows = Buffer.alloc(height * (1 + width * 4));

  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (1 + width * 4);
    rows[rowOffset] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(rows, rowOffset + 1);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function getImageSummary(width, height, rgba) {
  const buckets = new Set();
  let nonblank = 0;
  let dark = 0;
  let min = 255;
  let max = 0;
  let sum = 0;
  const total = Math.max(1, width * height);

  for (let offset = 0; offset < rgba.length; offset += 4) {
    const red = rgba[offset];
    const green = rgba[offset + 1];
    const blue = rgba[offset + 2];
    const alpha = rgba[offset + 3];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    min = Math.min(min, luminance);
    max = Math.max(max, luminance);
    sum += luminance;
    if (luminance >= 8) {
      nonblank += 1;
    }
    if (luminance < 8) {
      dark += 1;
    }
    buckets.add([red >> 4, green >> 4, blue >> 4].join(":"));
  }

  return {
    width,
    height,
    nonblankCoverage: Number((nonblank / total).toFixed(4)),
    darkPixelRatio: Number((dark / total).toFixed(4)),
    coarseColorCount: buckets.size,
    luminanceMin: Number(min.toFixed(2)),
    luminanceMax: Number(max.toFixed(2)),
    luminanceMean: Number((sum / total).toFixed(2)),
    contrastRange: Number((max - min).toFixed(2))
  };
}

function getCentralStripeSummary(width, height, rgba) {
  const minX = Math.floor(width * 0.36);
  const maxX = Math.floor(width * 0.64);
  const minY = Math.floor(height * 0.24);
  const maxY = Math.floor(height * 0.74);
  const cropWidth = Math.max(1, maxX - minX);
  const cropHeight = Math.max(1, maxY - minY);
  const col = new Array(cropWidth).fill(0);
  const row = new Array(cropHeight).fill(0);
  let cyanPixels = 0;
  let brightCyanPixels = 0;

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const offset = (y * width + x) * 4;
      const red = rgba[offset];
      const green = rgba[offset + 1];
      const blue = rgba[offset + 2];
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      col[x - minX] += luminance;
      row[y - minY] += luminance;
      if (green > red * 1.12 && blue > red * 1.08 && green > 70 && blue > 70) {
        cyanPixels += 1;
      }
      if (green > 120 && blue > 120 && red < 115) {
        brightCyanPixels += 1;
      }
    }
  }

  for (let x = 0; x < col.length; x += 1) {
    col[x] /= cropHeight;
  }
  for (let y = 0; y < row.length; y += 1) {
    row[y] /= cropWidth;
  }

  function meanStep(values) {
    let total = 0;
    for (let i = 1; i < values.length; i += 1) {
      total += Math.abs(values[i] - values[i - 1]);
    }
    return total / Math.max(1, values.length - 1);
  }

  const verticalEnergy = meanStep(col);
  const horizontalEnergy = meanStep(row);

  return {
    crop: { minX, maxX, minY, maxY, width: cropWidth, height: cropHeight },
    verticalEnergy: Number(verticalEnergy.toFixed(3)),
    horizontalEnergy: Number(horizontalEnergy.toFixed(3)),
    verticalDominance: Number((verticalEnergy / Math.max(0.001, horizontalEnergy)).toFixed(3)),
    cyanRatio: Number((cyanPixels / Math.max(1, cropWidth * cropHeight)).toFixed(4)),
    brightCyanRatio: Number((brightCyanPixels / Math.max(1, cropWidth * cropHeight)).toFixed(4))
  };
}

function getDenseSettlementMaterialSummary(surfaceStats) {
  const counts = surfaceStats && surfaceStats.materialCounts ? surfaceStats.materialCounts : {};
  const entries = Object.entries(counts);
  const total = entries.reduce((sum, entry) => sum + (Number(entry[1]) || 0), 0);
  const rawCiv0 = entries
    .filter((entry) => /\.civ0\b/.test(entry[0]) && /(snow|lichen|stencil\.water|water)/.test(entry[0]))
    .reduce((sum, entry) => sum + (Number(entry[1]) || 0), 0);

  return {
    totalMaterialDraws: total,
    rawCiv0TerrainDraws: rawCiv0,
    rawCiv0TerrainRatio: Number((rawCiv0 / Math.max(1, total)).toFixed(4))
  };
}

function launchVisualBrowser() {
  const options = {
    headless: true,
    args: webgpuLaunchArgs
  };

  if (process.env.PIXELDARIUM_CHROME_PATH) {
    options.executablePath = process.env.PIXELDARIUM_CHROME_PATH;
  }

  return chromium.launch(options);
}

async function loadApp(page) {
  await page.goto(pathToFileURL(path.join(root, "index.html")).href, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(
    () => window.PS &&
      PS.gpu &&
      PS.gpu.status === "ready" &&
      PS.render &&
      PS.render.renderer &&
      PS.render.renderer.getActive &&
      PS.render.renderer.getActive() &&
      PS.render.renderer.getActive().name === "webgpu" &&
      PS.assets &&
      PS.assets.startupDataStatus &&
      PS.assets.startupDataStatus.loaded === true &&
      PS.assets.startupWgslShaderStatus &&
      PS.assets.startupWgslShaderStatus.loaded === true &&
      PS.render.proofScenes,
    null,
    { timeout: 30000 }
  );
}

async function captureTarget(page, target) {
  return page.evaluate(async (target) => {
    function configureActorScene(view) {
      const centerTile = world.planetTiles[Math.floor(world.planetTiles.length / 2)] || { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
      const centerX = Math.max(4, Math.min(WORLD_WIDTH - 5, Math.round(Number(centerTile.x) || WORLD_WIDTH / 2)));
      const centerY = Math.max(4, Math.min(WORLD_HEIGHT - 5, Math.round(Number(centerTile.y) || WORLD_HEIGHT / 2)));
      const focusTile = world.planetTiles[getTileIndex(centerX, centerY)] || centerTile;

      world.organisms = [];
      world.food = [];
      for (let marker = 0; marker < 18; marker += 1) {
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

      const organism = world.organisms[0];
      organism.energy = 240;
      organism.directionX = 1;
      organism.directionY = 0;
      organism.selected = true;
      const foodTile = world.planetTiles[getTileIndex(centerX + 1, centerY)] || focusTile;
      const food = typeof addFoodAt === "function" ? addFoodAt(foodTile.x, foodTile.y) : { x: foodTile.x, y: foodTile.y };
      food.latitude = Number(organism.latitude);
      food.longitude = Number(organism.longitude);
      food.prevX = food.x;
      food.prevY = food.y;
      food.prevLatitude = food.latitude;
      food.prevLongitude = food.longitude;
      food.energy = CONFIG.FOOD_ENERGY_VALUE;

      if (PS.sim && PS.sim.representatives) {
        PS.sim.representatives.select(organism);
        const representative = PS.sim.representatives.getRepresentative(organism.representativeId);
        if (representative) {
          representative.behavior = "foraging";
          representative.target = { type: "food", x: food.x, y: food.y };
          representative.selected = true;
        }
      }

      view.latitude = Number(focusTile.latitude) || 0;
      view.longitude = Number(focusTile.longitude) || 0;
      organism.x = focusTile.x;
      organism.y = focusTile.y;
      organism.prevX = organism.x;
      organism.prevY = organism.y;
      organism.latitude = view.latitude;
      organism.longitude = view.longitude;
      organism.prevLatitude = view.latitude;
      organism.prevLongitude = view.longitude;
      food.x = organism.x;
      food.y = organism.y;
      food.prevX = food.x;
      food.prevY = food.y;
      food.latitude = view.latitude;
      food.longitude = view.longitude;
      food.prevLatitude = view.latitude;
      food.prevLongitude = view.longitude;
      world.biologyRepresentatives = [{
        id: organism.representativeId,
        representativeId: organism.representativeId,
        x: organism.x,
        y: organism.y,
        prevX: organism.x,
        prevY: organism.y,
        latitude: view.latitude,
        longitude: view.longitude,
        prevLatitude: view.latitude,
        prevLongitude: view.longitude,
        lineageId: organism.lineageId,
        speciesId: organism.speciesId,
        populationId: organism.populationId,
        behavior: "foraging",
        target: { type: "food", x: food.x, y: food.y },
        selected: true,
        isActive: true
      }];
    }

    function configureSettlementScene(view) {
      let targetTile = null;
      let fallbackLandTile = null;
      let fallbackMidLatitudeLandTile = null;

      for (let i = 0; i < world.planetTiles.length; i += 1) {
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

      targetTile = targetTile || fallbackMidLatitudeLandTile || fallbackLandTile || world.planetTiles[Math.floor(world.planetTiles.length / 2)];

      const targetX = Number.isFinite(Number(targetTile.x)) ? Number(targetTile.x) : WORLD_WIDTH / 2;
      const targetY = Number.isFinite(Number(targetTile.y)) ? Number(targetTile.y) : WORLD_HEIGHT / 2;
      const centerX = Math.max(12, Math.min(WORLD_WIDTH - 13, Math.round(targetX)));
      const centerY = Math.max(12, Math.min(WORLD_HEIGHT - 13, Math.round(targetY)));
      const parentTile = world.planetTiles[getTileIndex(centerX, centerY)] || targetTile;

      for (let dy = -8; dy <= 8; dy += 1) {
        for (let dx = -8; dx <= 8; dx += 1) {
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
          if ((Math.abs(dx) <= 5 && Math.abs(dy) <= 5) || Math.abs(dx) === Math.abs(dy)) {
            tile.acceptedTransitionCellName = [
              "grass-water.edge.n",
              "grass-rock.edge.e",
              "grass-sand.corner.se",
              "grass-forest-floor.inner-corner.nw"
            ][Math.abs(dx * 3 + dy * 5) % 4];
          }
        }
      }

      const fixtures = [
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
      const parentMeters = PS.render && PS.render.globe && typeof PS.render.globe.getSurfaceMeters === "function"
        ? PS.render.globe.getSurfaceMeters(parentTile.latitude, parentTile.longitude)
        : { eastMeters: 0, northMeters: 0 };

      world.settlements = fixtures.map((fixture) => {
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
      });
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

      if (PS.render && PS.render.particles) {
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
            id: "azr1081.settlement_activity",
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

      view.latitude = Number(parentTile.latitude) || 0;
      view.longitude = Number(parentTile.longitude) || 0;
    }

    if (typeof setWorldSeed === "function") {
      setWorldSeed("PIXEL-AZR-1081");
    }
    if (typeof seedWorld === "function") {
      seedWorld();
    }

    const scene = PS.render.proofScenes.getById(target.id);
    const view = PS.camera.getView();
    view.zoomLevel = target.zoomLevel;
    view.latitude = target.latitude;
    view.longitude = target.longitude;
    view.panEastMeters = 0;
    view.panNorthMeters = 0;

    if (target.id === "globe-continent-causal-context") {
      world.timelineEvents = [{
        tick: Math.max(world.tick || 240, 240) - 20,
        type: "geology.rift",
        label: "Rift surge",
        detail: "tectonic pressure",
        category: "geology",
        severity: "critical",
        source: "geology",
        location: { latitude: target.latitude, longitude: target.longitude }
      }];
    } else if (target.id === "dense-local-settlement-readability") {
      configureSettlementScene(view);
    } else if (target.id === "actor-effect-readability") {
      configureActorScene(view);
    }

    world.planetView.zoomLevel = target.zoomLevel;
    world.planetView.latitude = view.latitude;
    world.planetView.longitude = view.longitude;
    world.planetView.panEastMeters = 0;
    world.planetView.panNorthMeters = 0;
    world.isPaused = true;
    world.isCameraInteracting = false;
    world.needsRender = true;

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

    const device = PS.gpu.device;
    const width = Math.max(1, Math.round(Number(canvas.width) || 1));
    const height = Math.max(1, Math.round(Number(canvas.height) || 1));
    const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
    const format = PS.gpu.format || "bgra8unorm";
    const texture = device.createTexture({
      label: "azr-1081." + target.id + ".capture",
      size: { width, height },
      format,
      usage: 16 | 1
    });
    const originalGetCurrentTexture = PS.gpu.context.getCurrentTexture.bind(PS.gpu.context);
    PS.gpu.context.getCurrentTexture = function () {
      return texture;
    };
    const renderTimingSamples = [];
    function captureRenderTimingSample(label) {
      const rendererStats = PS.render.renderer && typeof PS.render.renderer.getStats === "function"
        ? PS.render.renderer.getStats()
        : {};
      const surfaceStats = PS.render.webgpuSurfaceTile && typeof PS.render.webgpuSurfaceTile.getStats === "function"
        ? PS.render.webgpuSurfaceTile.getStats()
        : {};
      const cacheStats = PS.render.surfaceRender && typeof PS.render.surfaceRender.getCacheStats === "function"
        ? PS.render.surfaceRender.getCacheStats()
        : {};

      renderTimingSamples.push({
        label,
        terrainLastFrameMs: Number(rendererStats.terrainLastFrameMs) || 0,
        rendererLastFrameMs: Number(rendererStats.lastFrameMs) || 0,
        pipelineFrameMs: Number(rendererStats.pipelineFrameMs) || 0,
        tileDraws: Number(rendererStats.terrainDraws) || 0,
        districtMaterialDrawCount: Number(rendererStats.districtMaterialDrawCount) || 0,
        batchCacheHits: Number(surfaceStats.batchCacheHits) || 0,
        batchCacheMisses: Number(surfaceStats.batchCacheMisses) || 0,
        generatedThisPass: Number(cacheStats.lastGeneratedThisPass) || 0,
        pendingChunks: Number(cacheStats.lastPendingChunks) || 0,
        visibleChunks: Number(cacheStats.lastVisibleChunks) || 0
      });
    }
    try {
      if (PS.assets && PS.assets.equivalence && typeof PS.assets.equivalence.resetFrameStats === "function") {
        PS.assets.equivalence.resetFrameStats();
      }
      if (typeof drawWorld === "function") {
        drawWorld();
      }
      captureRenderTimingSample("cold");
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (typeof drawWorld === "function") {
        drawWorld();
      }
      captureRenderTimingSample("warm");
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (typeof drawWorld === "function") {
        drawWorld();
      }
      captureRenderTimingSample("final");
      await new Promise((resolve) => requestAnimationFrame(resolve));
    } finally {
      PS.gpu.context.getCurrentTexture = originalGetCurrentTexture;
    }

    const encoder = device.createCommandEncoder({ label: "azr-1081.capture.copy" });
    const buffer = device.createBuffer({
      label: "azr-1081.capture.buffer",
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
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceOffset = y * bytesPerRow + x * 4;
        const destOffset = (y * width + x) * 4;
        const sourceBlue = data[sourceOffset];
        const green = data[sourceOffset + 1];
        const sourceRed = data[sourceOffset + 2];
        rgba[destOffset] = format === "bgra8unorm" ? sourceRed : sourceBlue;
        rgba[destOffset + 1] = green;
        rgba[destOffset + 2] = format === "bgra8unorm" ? sourceBlue : sourceRed;
        rgba[destOffset + 3] = data[sourceOffset + 3];
      }
    }

    const rendererStats = PS.render.renderer && typeof PS.render.renderer.getStats === "function"
      ? PS.render.renderer.getStats()
      : {};
    const particleStats = PS.render.particles && typeof PS.render.particles.getStats === "function"
      ? PS.render.particles.getStats()
      : {};
    const surfaceStats = PS.render.webgpuSurfaceTile && typeof PS.render.webgpuSurfaceTile.getStats === "function"
      ? PS.render.webgpuSurfaceTile.getStats()
      : {};
    const settlementFootprint = PS.render.entities && typeof PS.render.entities.getSettlementVisualFootprint === "function"
      ? PS.render.entities.getSettlementVisualFootprint(world.settlements, { width, height })
      : null;
    const settlementVisualStats = PS.render.entities && PS.render.entities.settlementVisualStats
      ? Object.assign({}, PS.render.entities.settlementVisualStats)
      : {};

    return {
      id: target.id,
      title: scene ? scene.title : target.id,
      expectedBand: target.expectedBand,
      zoomBand: PS.render.pipeline.getZoomBand(world.planetView.zoomLevel),
      semanticColors: target.semanticColors,
      activeRenderLayers: target.activeRenderLayers,
      visibleSimulationState: scene ? scene.visibleSimulationState : [],
      passFailCriteria: scene ? scene.passFailCriteria : [],
      gpuStatus: PS.gpu.status,
      renderer: PS.render.renderer.getActive().name,
      rendererStats,
      surfaceStats,
      renderTimingSamples,
      particleStats,
      settlementFootprint,
      settlementVisualStats,
      debugText: (document.getElementById("debug-output") || {}).textContent || "",
      width,
      height,
      rgbaBase64: btoa(Array.from(rgba, (value) => String.fromCharCode(value)).join(""))
    };
  }, target);
}

async function run() {
  ensureDir(outputDir);
  const browser = await launchVisualBrowser();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const results = [];

  try {
    await loadApp(page);
    const targets = await page.evaluate(() => PS.render.proofScenes.getCaptureTargets());

    assert.deepStrictEqual(
      targets.map((target) => target.id).sort(),
      [
        "actor-effect-readability",
        "dense-local-settlement-readability",
        "globe-continent-causal-context"
      ],
      "AZR-1081 should capture every runtime proof target"
    );

    for (const target of targets) {
      const capture = await captureTarget(page, target);
      const rgba = Buffer.from(capture.rgbaBase64, "base64");
      const image = getImageSummary(capture.width, capture.height, rgba);
      const stripe = capture.id === "dense-local-settlement-readability"
        ? getCentralStripeSummary(capture.width, capture.height, rgba)
        : null;
      const denseMaterial = capture.id === "dense-local-settlement-readability"
        ? getDenseSettlementMaterialSummary(capture.surfaceStats)
        : null;
      const png = encodePng(capture.width, capture.height, rgba);
      const metrics = {
        issue: "AZR-1081",
        proofSceneId: capture.id,
        title: capture.title,
        expectedBand: capture.expectedBand,
        zoomBand: capture.zoomBand,
        screenshot: "docs/visual-regression/azr-1081/" + capture.id + ".png",
        image,
        stripe,
        denseMaterial,
        gpuStatus: capture.gpuStatus,
        renderer: capture.renderer,
        semanticColors: capture.semanticColors,
        activeRenderLayers: capture.activeRenderLayers,
        visibleSimulationState: capture.visibleSimulationState,
        passFailCriteria: capture.passFailCriteria,
        rendererStats: capture.rendererStats,
        surfaceStats: capture.surfaceStats,
        renderTimingSamples: capture.renderTimingSamples,
        particleStats: capture.particleStats,
        settlementFootprint: capture.settlementFootprint,
        settlementVisualStats: capture.settlementVisualStats,
        debugText: capture.debugText.trim()
      };

      fs.writeFileSync(path.join(outputDir, capture.id + ".png"), png);
      fs.writeFileSync(path.join(outputDir, capture.id + ".metrics.json"), JSON.stringify(metrics, null, 2) + "\n");

      assert.strictEqual(capture.gpuStatus, "ready", capture.id + " should initialize WebGPU");
      assert.strictEqual(capture.renderer, "webgpu", capture.id + " should render through WebGPU");
      assert.strictEqual(capture.zoomBand, capture.expectedBand, capture.id + " should report expected zoom band");
      assert.strictEqual(capture.debugText.trim(), "", capture.id + " should not write debug errors");
      var minNonblankCoverage = capture.id === "globe-continent-causal-context" ? 0.05 : 0.45;
      assert.ok(
        image.nonblankCoverage > minNonblankCoverage,
        capture.id + " should capture a nonblank WebGPU frame; metrics=" + JSON.stringify(image)
      );
      assert.ok(image.coarseColorCount >= 20, capture.id + " should preserve semantic color variety; metrics=" + JSON.stringify(image));
      assert.ok(image.contrastRange >= 60, capture.id + " should preserve readable contrast; metrics=" + JSON.stringify(image));

      if (capture.id === "globe-continent-causal-context") {
        assert.ok(Number(capture.rendererStats.globeDraws) > 0 || Number(capture.rendererStats.terrainDraws) > 0, "globe/continent scene should draw terrain context");
      } else if (capture.id === "dense-local-settlement-readability") {
        assert.ok(Number(capture.rendererStats.settlementEntityDraws) > 0, "dense settlement scene should draw settlement structures");
        assert.ok(Number(capture.rendererStats.citizenEntityDraws) > 0, "dense settlement scene should draw citizens");
        assert.ok(Number(capture.rendererStats.worldUiEntityDraws) > 0, "dense settlement scene should draw world UI/status marks");
        assert.ok(capture.settlementFootprint && capture.settlementFootprint.count >= 4, "dense settlement scene should stage multiple active simulated sites; footprint=" + JSON.stringify(capture.settlementFootprint));
        assert.ok(capture.settlementFootprint.widthCoverage >= 0.34, "dense settlement scene should occupy viewport-scale width; footprint=" + JSON.stringify(capture.settlementFootprint));
        assert.ok(capture.settlementFootprint.areaCoverage >= 0.06, "dense settlement scene should not collapse into a tiny patch; footprint=" + JSON.stringify(capture.settlementFootprint));
        assert.ok(Number(capture.rendererStats.routeEntityDraws) >= 96, "dense settlement scene should draw readable route/road adjacency; stats=" + JSON.stringify(capture.rendererStats));
        assert.ok(Number(capture.rendererStats.influenceEntityDraws) >= 36, "dense settlement scene should draw clustered district grounding, not one slab per settlement; stats=" + JSON.stringify(capture.rendererStats));
        assert.ok(Number(capture.rendererStats.districtMaterialDrawCount) >= 128, "dense settlement scene should draw district material masks in the terrain layer; stats=" + JSON.stringify(capture.rendererStats));
        assert.ok(
          Number(capture.rendererStats.equivalenceTransitionDraws) + Number(capture.rendererStats.equivalenceAssetUses && capture.rendererStats.equivalenceAssetUses.terrainTransition || 0) <= Number(capture.rendererStats.districtMaterialDrawCount) * 0.35,
          "dense settlement scene should not cover district material masks with repeated accepted transition overlays; stats=" + JSON.stringify(capture.rendererStats)
        );
        assert.ok(
          stripe && Number(stripe.verticalDominance) <= 1.28,
          "dense settlement scene should not read as a continuous vertical hatch/stripe field; stripe=" + JSON.stringify(stripe)
        );
        assert.ok(
          stripe && Number(stripe.brightCyanRatio) <= 0.08,
          "dense settlement scene should not read as a cyan height/normal hatch slab; stripe=" + JSON.stringify(stripe)
        );
        assert.ok(
          stripe && Number(stripe.cyanRatio) <= 0.055,
          "dense settlement scene should not retain a dense cyan route/hatch field over district parcels; stripe=" + JSON.stringify(stripe)
        );
        assert.ok(
          denseMaterial && Number(denseMaterial.rawCiv0TerrainRatio) <= 0.08,
          "dense settlement scene should not be dominated by raw civ0 snow/lichen/water terrain lattice; material=" + JSON.stringify(denseMaterial)
        );
        assert.ok(Number(capture.rendererStats.civilizationCounts && capture.rendererStats.civilizationCounts.route) > 0, "dense settlement scene should include route/road material masks; stats=" + JSON.stringify(capture.rendererStats.civilizationCounts));
        assert.ok(Number(capture.rendererStats.civilizationCounts && capture.rendererStats.civilizationCounts.settlement) > 0, "dense settlement scene should include settlement district material masks; stats=" + JSON.stringify(capture.rendererStats.civilizationCounts));
        assert.ok(
          Number(capture.rendererStats.civilizationCounts && capture.rendererStats.civilizationCounts.route) <= Number(capture.rendererStats.civilizationCounts && capture.rendererStats.civilizationCounts.total) * 0.58,
          "dense settlement scene route masks should not flood district materials; stats=" + JSON.stringify(capture.rendererStats.civilizationCounts)
        );
        assert.ok(
          Number(capture.rendererStats.civilizationCounts && capture.rendererStats.civilizationCounts.farm) > 0 ||
            Number(capture.rendererStats.civilizationCounts && capture.rendererStats.civilizationCounts.yard) > 0,
          "dense settlement scene should include farm/yard worked-ground material masks; stats=" + JSON.stringify(capture.rendererStats.civilizationCounts)
        );
        assert.ok(
          Number(capture.rendererStats.civilizationCounts && capture.rendererStats.civilizationCounts.block) > 0 ||
            Number(capture.rendererStats.civilizationCounts && capture.rendererStats.civilizationCounts.production) > 0,
          "dense settlement scene should include block/production district material masks; stats=" + JSON.stringify(capture.rendererStats.civilizationCounts)
        );
        assert.ok(
          Number(capture.rendererStats.equivalenceAssetUses && capture.rendererStats.equivalenceAssetUses.mountainCliff || 0) <=
            Math.max(1, Number(capture.rendererStats.districtMaterialDrawCount) || 0) * 8,
          "dense settlement scene should not let mountain cliff/noise assets dominate civilization district terrain; stats=" + JSON.stringify(capture.rendererStats.equivalenceAssetUses)
        );
        assert.ok(Number(capture.settlementVisualStats.lastSettlementInfluenceCells) >= 36, "settlement influence diagnostics should report clustered grounding cells; stats=" + JSON.stringify(capture.settlementVisualStats));
        assert.ok(Number(capture.settlementVisualStats.lastSettlementInfluenceMaxAlpha) <= 0.32, "settlement influence should stay below slab opacity; stats=" + JSON.stringify(capture.settlementVisualStats));
        assert.ok(Number(capture.settlementVisualStats.lastSettlementShadowMaxAlpha) <= 0.18, "settlement shadows should remain bounded below the terrain-dominating threshold; stats=" + JSON.stringify(capture.settlementVisualStats));
        assert.ok(Number(capture.settlementVisualStats.lastSettlementRouteBedSegments) > 0, "settlement routes should draw a low-alpha ground bed under crisp road marks; stats=" + JSON.stringify(capture.settlementVisualStats));
        assert.ok(Number(capture.rendererStats.worldUiEntityDraws) <= capture.settlementFootprint.count * 2, "dense settlement scene should not stamp every UI metric over every settlement; stats=" + JSON.stringify(capture.rendererStats));
        assert.ok(Number(capture.settlementVisualStats.lastSettlementWorldUiMarks) <= capture.settlementFootprint.count * 2, "world UI diagnostics should stay below repeated-icon dominance; stats=" + JSON.stringify(capture.settlementVisualStats));
        assert.ok(Number(capture.settlementVisualStats.lastSettlementWorldUiMaxAlpha) <= 0.76, "world UI marks should be lower alpha at map scale; stats=" + JSON.stringify(capture.settlementVisualStats));
        assert.ok(Number(capture.settlementVisualStats.lastSettlementDistrictOffsets) >= capture.settlementFootprint.count * 3, "settlement structures/status/stockpiles/citizens should use deterministic district offsets; stats=" + JSON.stringify(capture.settlementVisualStats));
        assert.ok(Number(capture.particleStats.visible) > 0, "dense settlement scene should draw particles");
      } else if (capture.id === "actor-effect-readability") {
        assert.ok(Number(capture.rendererStats.organismEntityDraws) > 0, "actor scene should draw organisms");
        assert.ok(Number(capture.rendererStats.foodEntityDraws) > 0, "actor scene should draw food/resource markers");
        assert.ok(Number(capture.rendererStats.intentEntityDraws) > 0, "actor scene should draw intent/status cues");
      }
      results.push({
        id: capture.id,
        band: capture.zoomBand,
        nonblankCoverage: image.nonblankCoverage,
        coarseColorCount: image.coarseColorCount,
        contrastRange: image.contrastRange
      });
    }
  } finally {
    await browser.close();
  }

  console.log("proof scene capture checks passed", JSON.stringify(results));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
