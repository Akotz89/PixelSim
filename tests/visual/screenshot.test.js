const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../..");
const goldenDir = path.join(__dirname, "golden");
const proofEvidenceDir = path.join(root, "docs", "visual-regression", "azr-803");
const updateGolden = process.env.PIXELDARIUM_UPDATE_GOLDEN === "1";
const writeProofEvidence = process.env.PIXELDARIUM_WRITE_PROOF_EVIDENCE === "1";
const threshold = 0.05;
const viewport = { width: 960, height: 540 };
const mobileViewport = { width: 390, height: 844 };
const visualAverageFrameBudgetMs = 35;
const continuousZoomFrameBudgetMs = 50;
const webgpuLaunchArgs = [
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan,WebGPUDeveloperFeatures",
  "--enable-webgpu-developer-features",
  "--use-angle=vulkan"
];

const cases = [
  { name: "orbit-view", zoom: 0, orbitEvents: true, expectedBand: "orbit" },
  { name: "continent-view", zoom: 2, biome: "forest", expectedBand: "continent", maxDarkPixels: 0.16 },
  { name: "overlay-visible", zoom: 0, overlay: "observation.population", expectedBand: "orbit" },
  { name: "region-view", zoom: 4, biome: "forest", expectedBand: "region", maxDarkPixels: 0.16 },
  { name: "local-view", zoom: 6, biome: "forest", expectedBand: "local", maxDarkPixels: 0.16 },
  { name: "surface-temperate", zoom: 5, biome: "forest", expectedBand: "region", maxDarkPixels: 0.16 },
  { name: "surface-desert", zoom: 5, biome: "desert", expectedBand: "region", maxDarkPixels: 0.16 },
  { name: "accepted-terrain", zoom: 6, biome: "forest", acceptedTerrain: true, expectedBand: "local", maxDarkPixels: 0.16 },
  { name: "entities-visible", zoom: 6, entities: true, expectedBand: "local", maxDarkPixels: 0.16 },
  { name: "settlement-ground", zoom: 7, settlement: true, acceptedTerrain: true, proofScene: true, expectedBand: "settlement", maxDarkPixels: 0.16 },
  { name: "hud-visible", zoom: 2, hud: true, expectedBand: "continent", maxDarkPixels: 0.16 }
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function parsePng(buffer) {
  assert.strictEqual(buffer.toString("hex", 0, 8), "89504e470d0a1a0a", "PNG signature expected");

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const chunks = [];

  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      assert.strictEqual(data[8], 8, "visual PNG baselines must use 8-bit channels");
      colorType = data[9];
      assert.ok(colorType === 2 || colorType === 6, "visual PNG baselines must be RGB or RGBA");
      assert.strictEqual(data[12], 0, "interlaced PNG baselines are not supported");
    } else if (type === "IDAT") {
      chunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(width * height * 4);
  let rawOffset = 0;
  let outOffset = 0;
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[rawOffset++];
    const scanline = Buffer.from(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;

    for (let x = 0; x < stride; x++) {
      const left = x >= bytesPerPixel ? scanline[x - bytesPerPixel] : 0;
      const up = previous[x] || 0;
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] || 0 : 0;
      let value = scanline[x];

      if (filter === 1) {
        value = (value + left) & 255;
      } else if (filter === 2) {
        value = (value + up) & 255;
      } else if (filter === 3) {
        value = (value + Math.floor((left + up) / 2)) & 255;
      } else if (filter === 4) {
        value = (value + paeth(left, up, upperLeft)) & 255;
      } else {
        assert.strictEqual(filter, 0, "unsupported PNG filter");
      }

      scanline[x] = value;
    }

    for (let x = 0; x < width; x++) {
      const source = x * bytesPerPixel;
      pixels[outOffset++] = scanline[source];
      pixels[outOffset++] = scanline[source + 1];
      pixels[outOffset++] = scanline[source + 2];
      pixels[outOffset++] = bytesPerPixel === 4 ? scanline[source + 3] : 255;
    }

    previous = scanline;
  }

  return { width, height, pixels };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function diffPng(current, golden) {
  assert.strictEqual(current.width, golden.width, "visual baseline width changed");
  assert.strictEqual(current.height, golden.height, "visual baseline height changed");

  const total = current.width * current.height;
  let changed = 0;

  for (let i = 0; i < total; i++) {
    const offset = i * 4;
    const delta =
      Math.abs(current.pixels[offset] - golden.pixels[offset]) +
      Math.abs(current.pixels[offset + 1] - golden.pixels[offset + 1]) +
      Math.abs(current.pixels[offset + 2] - golden.pixels[offset + 2]) +
      Math.abs(current.pixels[offset + 3] - golden.pixels[offset + 3]);

    if (delta > 18) {
      changed++;
    }
  }

  return changed / total;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = crcTable[(crc ^ buffer[i]) & 255] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function encodeRgbaPng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const scanlineLength = width * 4;
  const raw = Buffer.alloc((scanlineLength + 1) * height);
  for (let y = 0; y < height; y++) {
    const rawOffset = y * (scanlineLength + 1);
    raw[rawOffset] = 0;
    rgba.copy(raw, rawOffset + 1, y * scanlineLength, (y + 1) * scanlineLength);
  }

  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function getProofEvidencePng(metrics, screenshot) {
  const image = metrics && metrics.image;
  if (!image || !image.rgbaBase64) {
    return screenshot;
  }
  return encodeRgbaPng(image.width, image.height, Buffer.from(image.rgbaBase64, "base64"));
}

function getDarkPixelRatio(image) {
  const total = image.width * image.height;
  let dark = 0;

  for (let i = 0; i < total; i++) {
    const offset = i * 4;
    const alpha = image.pixels[offset + 3];
    const luminance =
      image.pixels[offset] * 0.2126 +
      image.pixels[offset + 1] * 0.7152 +
      image.pixels[offset + 2] * 0.0722;

    if (alpha > 0 && luminance < 14) {
      dark++;
    }
  }

  return dark / total;
}

function getImageSummary(image) {
  const total = image.width * image.height;
  const buckets = new Set();
  let min = 255;
  let max = 0;
  let sum = 0;
  let nonblank = 0;

  for (let i = 0; i < total; i++) {
    const offset = i * 4;
    const alpha = image.pixels[offset + 3];
    const red = image.pixels[offset];
    const green = image.pixels[offset + 1];
    const blue = image.pixels[offset + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    min = Math.min(min, luminance);
    max = Math.max(max, luminance);
    sum += luminance;

    if (alpha > 0 && luminance >= 8) {
      nonblank += 1;
    }

    buckets.add([
      red >> 4,
      green >> 4,
      blue >> 4
    ].join(":"));
  }

  return {
    width: image.width,
    height: image.height,
    nonblankCoverage: Number((nonblank / total).toFixed(4)),
    coarseColorCount: buckets.size,
    luminanceMin: Number(min.toFixed(2)),
    luminanceMax: Number(max.toFixed(2)),
    luminanceMean: Number((sum / total).toFixed(2)),
    contrastRange: Number((max - min).toFixed(2))
  };
}

function getProofDensityMetrics(caseStats, image) {
  const rendererStats = caseStats && caseStats.rendererStats ? caseStats.rendererStats : {};
  const uses = rendererStats.equivalenceAssetUses || {};
  const useFamilies = Object.keys(uses).filter((key) => Number(uses[key]) > 0);

  return {
    zoomBand: caseStats.zoomBand,
    image: caseStats.proofReadback || getImageSummary(image),
    distinctAcceptedFamilies: useFamilies.length,
    acceptedFamilies: useFamilies.sort(),
    terrainMaterialDraws: rendererStats.equivalenceTerrainDraws || 0,
    terrainTransitionDraws: rendererStats.equivalenceTransitionDraws || 0,
    settlementDraws: rendererStats.settlementEntityDraws || 0,
    routeDraws: rendererStats.routeEntityDraws || 0,
    shadowDraws: rendererStats.shadowEntityDraws || 0,
    vegetationDraws: rendererStats.vegetationEntityDraws || 0,
    citizenDraws: rendererStats.citizenEntityDraws || 0,
    stockpileDraws: rendererStats.stockpileEntityDraws || 0,
    workStatusDraws: rendererStats.workStatusEntityDraws || 0,
    effectDraws: rendererStats.effectEntityDraws || 0,
    worldUiDraws: rendererStats.worldUiEntityDraws || 0,
    particleVisible: caseStats.particleStats && caseStats.particleStats.visible || 0,
    particleDrawCalls: caseStats.particleStats && caseStats.particleStats.drawCalls || 0
  };
}

function writeProofEvidenceFile(name, screenshot, metrics) {
  if (!writeProofEvidence) {
    return;
  }

  ensureDir(proofEvidenceDir);
  const evidencePng = getProofEvidencePng(metrics, screenshot);
  const metricsJson = JSON.stringify(metrics, (key, value) => key === "rgbaBase64" ? undefined : value, 2) + "\n";
  fs.writeFileSync(path.join(proofEvidenceDir, name + ".png"), evidencePng);
  fs.writeFileSync(path.join(proofEvidenceDir, name + ".metrics.json"), metricsJson);
}

function fileUrl(filePath) {
  return pathToFileURL(filePath).href;
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
  await page.goto(fileUrl(path.join(root, "index.html")), { waitUntil: "load", timeout: 30000 });
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
      PS.assets.startupWgslShaderStatus.loaded === true,
    null,
    { timeout: 30000 }
  );
}

async function prepareCase(page, testCase) {
  await page.evaluate((config) => {
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
        const visualFood = typeof addFoodAt === "function"
          ? addFoodAt(foodTile.x, foodTile.y)
          : { x: foodTile.x, y: foodTile.y };
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

        for (let i = 0; i < world.planetTiles.length; i++) {
          const tile = world.planetTiles[i];
          const blend = tile && tile.tileBlend;
          const weights = blend && blend.biomeWeights;
          if (
            tile &&
            tile.biome &&
            tile.biome !== "ocean" &&
            weights &&
            Number(blend.transitionStrength) > 0.18
          ) {
            targetTile = tile;
            break;
          }
        }

        if (targetTile && targetTile.biome && targetTile.biome !== "ocean") {
          const centerX = Math.round(Number(targetTile.x) || 0);
          const centerY = Math.round(Number(targetTile.y) || 0);
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
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
      }

      if (config.settlement) {
        if (!targetTile) {
          targetTile = world.planetTiles[Math.floor(world.planetTiles.length / 2)];
        }

        const centerX = Math.max(8, Math.min(WORLD_WIDTH - 9, Math.round(Number(targetTile.x) || WORLD_WIDTH / 2)));
        const centerY = Math.max(8, Math.min(WORLD_HEIGHT - 9, Math.round(Number(targetTile.y) || WORLD_HEIGHT / 2)));
        const parentTile = world.planetTiles[getTileIndex(centerX, centerY)] || targetTile;
        const childTile = world.planetTiles[getTileIndex(centerX + 1, centerY + 1)] || parentTile;
        const makeVisualSettlement = (id, tile, isOutpost) => ({
          id,
          lineageId: 3,
          x: tile.x,
          y: tile.y,
          prevX: tile.x,
          prevY: tile.y,
          latitude: tile.latitude,
          longitude: tile.longitude,
          prevLatitude: tile.latitude,
          prevLongitude: tile.longitude,
          foundedTick: world.tick,
          radius: isOutpost ? 3 : 6,
          population: isOutpost ? 44 : 180,
          foodStock: isOutpost ? 48 : 160,
          storedFood: isOutpost ? 52 : 190,
          development: isOutpost ? 0.38 : 0.82,
          level: isOutpost ? 2 : 5,
          influenceRadius: isOutpost ? 4 : 8,
          claimedTiles: isOutpost ? 72 : 260,
          claimedFood: isOutpost ? 16 : 58,
          parentSettlementId: isOutpost ? 9101 : 0,
          isOutpost: Boolean(isOutpost),
          isColony: !isOutpost,
          isActive: true,
          lastActiveTick: world.tick
        });

        world.settlements = [
          makeVisualSettlement(9101, parentTile, false),
          makeVisualSettlement(9102, childTile, true)
        ];
        world.settlementRoutes = [{
          id: 8101,
          parentSettlementId: 9101,
          childSettlementId: 9102,
          lineageId: 3,
          isActive: true,
          foodTransferred: 140,
          lastTransferTick: world.tick
        }];
        world.nextSettlementId = 9103;
        world.nextSettlementRouteId = 8102;
        if (PS.sim && PS.sim.settlements && typeof PS.sim.settlements.rebuildIndexes === "function") {
          PS.sim.settlements.rebuildIndexes();
        }
        targetTile = parentTile;
      }

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
      }

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

    world.isPaused = false;
    world.needsRender = true;
    if (typeof drawWorld === "function") {
      drawWorld();
    }
    if (config.entities) {
      world.isPaused = true;
      world.needsRender = false;
    }
    if (config.hud && typeof updateHud === "function") {
      updateHud();
    }
  }, testCase);

  await page.waitForTimeout(350);

  return page.evaluate(async (config) => {
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

    let proofReadback = null;
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

      proofReadback = {
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

    const stats = PS.render.renderer && typeof PS.render.renderer.getStats === "function"
      ? PS.render.renderer.getStats()
      : {};
    const surfaceStats = PS.render.webgpuSurfaceTile ? PS.render.webgpuSurfaceTile.state : {};
    if (config.acceptedTerrain && surfaceStats) {
      stats.equivalenceTerrainDraws = surfaceStats.equivalenceTerrainDrawCount || 0;
      stats.equivalenceTransitionDraws = surfaceStats.equivalenceTransitionDrawCount || 0;
      stats.equivalenceAssetUses = Object.assign({}, stats.equivalenceAssetUses || {}, surfaceStats.equivalenceSelectedUses || {});
      stats.equivalenceAssetSheets = Object.assign({}, stats.equivalenceAssetSheets || {}, surfaceStats.equivalenceSelectedSheets || {});
      if (
        !stats.equivalenceTerrainDraws &&
        stats.equivalenceAssetUses &&
        (stats.equivalenceAssetUses.terrainGround || stats.equivalenceAssetUses.terrainWater)
      ) {
        stats.equivalenceTerrainDraws = (stats.equivalenceAssetUses.terrainGround || 0) + (stats.equivalenceAssetUses.terrainWater || 0);
      }
      if (!stats.equivalenceTransitionDraws && stats.equivalenceAssetUses && stats.equivalenceAssetUses.terrainTransition) {
        stats.equivalenceTransitionDraws = stats.equivalenceAssetUses.terrainTransition;
      }
    }
    const particleStats = PS.render.particles && typeof PS.render.particles.getStats === "function"
      ? PS.render.particles.getStats()
      : {};
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
      routeDiagnostics,
      proofReadback,
      selectedRepresentative: PS.sim && PS.sim.representatives && world.organisms[0]
        ? PS.sim.representatives.getRepresentative(world.organisms[0].representativeId)
        : null,
      debugText: (document.getElementById("debug-output") || {}).textContent || ""
    };
  }, testCase);
}

async function runInteractionSmoke(page) {
  await page.evaluate(() => {
    const view = PS.camera.getView();
    view.zoomLevel = 2;
    world.planetView.zoomLevel = 2;
    world.isPaused = true;
    world.needsRender = true;
    if (typeof drawWorld === "function") {
      drawWorld();
    }
  });

  const before = await page.evaluate(() => ({
    zoomLevel: world.planetView.zoomLevel,
    latitude: world.planetView.latitude,
    longitude: world.planetView.longitude,
    panEastMeters: world.planetView.panEastMeters,
    panNorthMeters: world.planetView.panNorthMeters
  }));

  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.wheel(0, -420);
  await page.waitForTimeout(140);
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.width / 2 + 120, viewport.height / 2 + 44, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(140);

  const after = await page.evaluate(() => ({
    zoomLevel: world.planetView.zoomLevel,
    latitude: world.planetView.latitude,
    longitude: world.planetView.longitude,
    panEastMeters: world.planetView.panEastMeters,
    panNorthMeters: world.planetView.panNorthMeters,
    debugText: (document.getElementById("debug-output") || {}).textContent || ""
  }));

  assert.ok(after.zoomLevel > before.zoomLevel, "direct file wheel input should zoom in");
  assert.ok(
    after.latitude !== before.latitude ||
      after.longitude !== before.longitude ||
      after.panEastMeters !== before.panEastMeters ||
      after.panNorthMeters !== before.panNorthMeters,
    "direct file drag input should move the planet view"
  );
  assert.strictEqual(after.debugText.trim(), "", "direct file interaction smoke should not write debug errors");

  return {
    zoomBefore: Number(before.zoomLevel.toFixed(3)),
    zoomAfter: Number(after.zoomLevel.toFixed(3)),
    moved: true
  };
}

async function runContinuousZoomSweep(page) {
  const sweep = await page.evaluate(async () => {
    const cursorX = canvas.width * 0.62;
    const cursorY = canvas.height * 0.48;
    const frames = [];
    const bands = {};
    const preloadTargets = {};
    const previousView = {
      zoomLevel: world.planetView.zoomLevel,
      latitude: world.planetView.latitude,
      longitude: world.planetView.longitude,
      panEastMeters: world.planetView.panEastMeters,
      panNorthMeters: world.planetView.panNorthMeters
    };
    const previousInteracting = world.isCameraInteracting;
    let maxAnchorErrorDeg = 0;
    let maxTransitionAlpha = 0;
    let blendedFrames = 0;
    let localAnchoredFrames = 0;

    world.planetView.zoomLevel = 1;
    world.planetView.latitude = 18.5;
    world.planetView.longitude = -42.25;
    world.planetView.panEastMeters = 0;
    world.planetView.panNorthMeters = 0;
    if (PS.camera && typeof PS.camera.stopInertia === "function") {
      PS.camera.stopInertia();
    }
    world.isCameraInteracting = true;
    if (typeof drawWorld === "function") {
      drawWorld();
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));

    for (let i = 0; i < 24; i++) {
      const before = getPlanetLatLonFromCanvasPoint(cursorX, cursorY);
      const beforeLocal = isPlanetLocalView();
      const startedAt = performance.now();

      adjustPlanetZoomAtCanvasPoint(1, cursorX, cursorY);
      if (PS.camera && typeof PS.camera.updateInertia === "function") {
        PS.camera.updateInertia();
      }
      if (typeof drawWorld === "function") {
        drawWorld();
      }

      const afterLocal = isPlanetLocalView();
      const cameraStats = PS.camera.getZoomTransitionStats();
      const pipelineStats = PS.render.pipeline.getStats();
      const after = getPlanetLatLonFromCanvasPoint(cursorX, cursorY);
      const lonDelta = ((after.longitude - before.longitude + 540) % 360) - 180;
      const measuredError = Math.abs(after.latitude - before.latitude) + Math.abs(lonDelta);

      frames.push(performance.now() - startedAt);
      bands[pipelineStats.zoomBand] = true;
      preloadTargets[String(pipelineStats.preloadSurfaceLodIndex)] = true;
      if (beforeLocal && afterLocal) {
        localAnchoredFrames++;
        maxAnchorErrorDeg = Math.max(maxAnchorErrorDeg, measuredError, Number(cameraStats.lastZoomAnchorErrorDeg) || 0);
      }
      maxTransitionAlpha = Math.max(maxTransitionAlpha, Number(pipelineStats.transitionAlpha) || 0);
      if ((Number(pipelineStats.blendedLayers) || 0) > 0) {
        blendedFrames++;
      }

      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    const sortedFrames = frames.slice().sort((a, b) => a - b);
    const trimmedFrames = sortedFrames.length > 4 ? sortedFrames.slice(1, sortedFrames.length - 1) : sortedFrames;
    const sum = frames.reduce((total, value) => total + value, 0);
    const trimmedSum = trimmedFrames.reduce((total, value) => total + value, 0);
    const p80FrameMs = sortedFrames[Math.max(0, Math.min(sortedFrames.length - 1, Math.ceil(sortedFrames.length * 0.8) - 1))];
    const finalZoom = Number(world.planetView.zoomLevel.toFixed(3));
    world.planetView.zoomLevel = previousView.zoomLevel;
    world.planetView.latitude = previousView.latitude;
    world.planetView.longitude = previousView.longitude;
    world.planetView.panEastMeters = previousView.panEastMeters;
    world.planetView.panNorthMeters = previousView.panNorthMeters;
    world.isCameraInteracting = previousInteracting;
    if (PS.camera && typeof PS.camera.stopInertia === "function") {
      PS.camera.stopInertia();
    }
    if (typeof drawWorld === "function") {
      drawWorld();
    }

    return {
      startZoom: 1,
      endZoom: finalZoom,
      bands: Object.keys(bands).sort(),
      preloadTargets: Object.keys(preloadTargets).sort(),
      maxAnchorErrorDeg,
      localAnchoredFrames,
      maxTransitionAlpha,
      blendedFrames,
      averageFrameMs: sum / frames.length,
      trimmedAverageFrameMs: trimmedSum / Math.max(1, trimmedFrames.length),
      peakFrameMs: Math.max.apply(Math, frames),
      p80FrameMs,
      frames: frames.map((value) => Number(value.toFixed(3))),
      debugText: (document.getElementById("debug-output") || {}).textContent || ""
    };
  });

  assert.strictEqual(sweep.debugText.trim(), "", "continuous zoom sweep should not write debug errors");
  assert.ok(sweep.endZoom > sweep.startZoom, "continuous zoom sweep should advance zoom");
  assert.ok(sweep.bands.includes("continent"), "continuous zoom sweep should cross continent band");
  assert.ok(sweep.bands.includes("region"), "continuous zoom sweep should cross region band");
  assert.ok(sweep.bands.includes("local"), "continuous zoom sweep should cross local band");
  assert.ok(sweep.bands.includes("settlement"), "continuous zoom sweep should cross settlement band");
  assert.ok(sweep.preloadTargets.length > 1, "continuous zoom sweep should update preload LOD targets");
  assert.ok(sweep.maxTransitionAlpha > 0, "continuous zoom sweep should exercise LOD transition alpha");
  assert.ok(sweep.blendedFrames > 0, "continuous zoom sweep should draw blended LOD frames");
  assert.ok(sweep.localAnchoredFrames > 0, "continuous zoom sweep should exercise local anchored zoom frames");
  assert.ok(
    sweep.maxAnchorErrorDeg <= 1e-7,
    "continuous zoom sweep should preserve cursor anchor; maxAnchorErrorDeg=" + sweep.maxAnchorErrorDeg
  );
  assert.ok(
    sweep.trimmedAverageFrameMs < continuousZoomFrameBudgetMs,
    "continuous zoom trimmed average frame time " + sweep.trimmedAverageFrameMs.toFixed(3) + "ms should stay under " +
      continuousZoomFrameBudgetMs + "ms; rawAverage=" + sweep.averageFrameMs.toFixed(3) + "ms"
  );
  assert.ok(
    sweep.p80FrameMs < continuousZoomFrameBudgetMs,
    "continuous zoom p80 frame time " + sweep.p80FrameMs.toFixed(3) + "ms should stay under " + continuousZoomFrameBudgetMs + "ms; peak=" +
      sweep.peakFrameMs.toFixed(3) + "ms frames=" + JSON.stringify(sweep.frames)
  );

  return {
    startZoom: sweep.startZoom,
    endZoom: sweep.endZoom,
    bands: sweep.bands,
    preloadTargets: sweep.preloadTargets,
    maxAnchorErrorDeg: Number(sweep.maxAnchorErrorDeg.toExponential(3)),
    localAnchoredFrames: sweep.localAnchoredFrames,
    maxTransitionAlpha: Number(sweep.maxTransitionAlpha.toFixed(3)),
    blendedFrames: sweep.blendedFrames,
    averageFrameMs: Number(sweep.averageFrameMs.toFixed(3)),
    trimmedAverageFrameMs: Number(sweep.trimmedAverageFrameMs.toFixed(3)),
    peakFrameMs: Number(sweep.peakFrameMs.toFixed(3)),
    p80FrameMs: Number(sweep.p80FrameMs.toFixed(3))
  };
}

async function run() {
  ensureDir(goldenDir);

  const browser = await launchVisualBrowser();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  const failures = [];

  page.on("pageerror", (error) => errors.push(String(error && error.message ? error.message : error)));
  page.on("requestfailed", (request) => failures.push(request.url()));
  await loadApp(page);

  const results = [];

  for (const testCase of cases) {
    const caseStats = await prepareCase(page, Object.assign({}, testCase, { writeProofEvidence }));
    if (testCase.expectedBand) {
      assert.strictEqual(
        caseStats.zoomBand,
        testCase.expectedBand,
        testCase.name + " should exercise the " + testCase.expectedBand + " zoom band"
      );
    }
    assert.strictEqual(caseStats.debugText.trim(), "", testCase.name + " should not write debug errors");
    if (testCase.orbitEvents) {
      assert.ok(caseStats.rendererStats.orbitEventMarkerDraws > 0, testCase.name + " should draw orbit event markers through WebGPU");
    }
    if (testCase.overlay) {
      assert.strictEqual(caseStats.rendererStats.observationOverlayActive, testCase.overlay, testCase.name + " should keep the requested observation overlay active");
      assert.strictEqual(caseStats.rendererStats.observationOverlayCompositor, "webgpu", testCase.name + " should render observation overlays through WebGPU");
      assert.ok(caseStats.rendererStats.observationOverlayUploads > 0, testCase.name + " should upload an observation overlay texture");
      assert.ok(caseStats.rendererStats.observationOverlaySamples > 0, testCase.name + " should sample the planet grid for observation overlay data");
    }
    if (testCase.entities) {
      if (process.env.PIXELDARIUM_DEBUG_SETTLEMENT_STATS === "1") {
        console.error(JSON.stringify(caseStats.rendererStats));
      }
      assert.ok(caseStats.rendererStats.organismEntityDraws > 0, testCase.name + " should draw organism facades through WebGPU");
      assert.ok(caseStats.rendererStats.foodEntityDraws > 0, testCase.name + " should draw food facades through WebGPU");
      assert.ok(caseStats.rendererStats.intentEntityDraws > 0, testCase.name + " should draw representative behavior/target cues through WebGPU");
      assert.strictEqual(caseStats.selectedRepresentative && caseStats.selectedRepresentative.behavior, "foraging", testCase.name + " should preserve a watched behavior cue");
      assert.strictEqual(caseStats.selectedRepresentative && caseStats.selectedRepresentative.target && caseStats.selectedRepresentative.target.type, "food", testCase.name + " should preserve a watched target cue");
    }
    if (testCase.acceptedTerrain) {
      if (process.env.PIXELDARIUM_DEBUG_SETTLEMENT_STATS === "1") {
        console.error(JSON.stringify(caseStats.rendererStats));
      }
      assert.ok(caseStats.rendererStats.equivalenceTerrainDraws > 0, testCase.name + " should draw accepted terrain material pixels through WebGPU");
      assert.ok(caseStats.rendererStats.equivalenceTransitionDraws > 0, testCase.name + " should draw accepted terrain transition pixels through WebGPU");
      assert.ok(caseStats.rendererStats.equivalenceAssetUses.terrainGround > 0 || caseStats.rendererStats.equivalenceAssetUses.terrainWater > 0, testCase.name + " should select accepted terrain material cells");
    }
    if (testCase.settlement) {
      assert.ok(caseStats.rendererStats.shadowEntityDraws > 0, testCase.name + " should draw settlement shadows through WebGPU");
      assert.ok(caseStats.rendererStats.vegetationEntityDraws > 0, testCase.name + " should draw settlement vegetation facades through WebGPU");
      assert.ok(caseStats.rendererStats.citizenEntityDraws > 0, testCase.name + " should draw settlement citizen facades through WebGPU");
      assert.ok(caseStats.rendererStats.worldUiEntityDraws > 0, testCase.name + " should draw settlement world UI facades through WebGPU");
      assert.ok(caseStats.rendererStats.stockpileEntityDraws > 0, testCase.name + " should draw accepted settlement stockpile facades through WebGPU");
      assert.ok(caseStats.rendererStats.workStatusEntityDraws > 0, testCase.name + " should draw accepted work/status overlays through WebGPU");
      assert.ok(caseStats.rendererStats.effectEntityDraws > 0, testCase.name + " should draw accepted material/effect overlays through WebGPU");
      assert.ok(caseStats.rendererStats.settlementEntityDraws > 0, testCase.name + " should draw settlement structures through WebGPU");
      assert.ok(
        caseStats.rendererStats.routeEntityDraws > 0,
        testCase.name + " should draw settlement routes through WebGPU; stats=" + JSON.stringify(caseStats.rendererStats) +
          " routeDiagnostics=" + JSON.stringify(caseStats.routeDiagnostics)
      );
      assert.ok(caseStats.rendererStats.equivalenceAssetSelections > 0, testCase.name + " should select accepted equivalence assets during runtime rendering");
      assert.ok(caseStats.rendererStats.equivalenceAssetRendered > 0, testCase.name + " should render through accepted equivalence texture pages");
      assert.strictEqual(caseStats.rendererStats.equivalenceAssetMissing, 0, testCase.name + " should resolve accepted equivalence sheets without missing cells");
      assert.ok(caseStats.rendererStats.equivalenceAssetUses.settlement > 0, testCase.name + " should select accepted settlement structure cells");
      assert.ok(caseStats.rendererStats.equivalenceAssetUses.vegetation > 0, testCase.name + " should select accepted vegetation cells");
      assert.ok(caseStats.rendererStats.equivalenceAssetUses.citizen > 0, testCase.name + " should select accepted creature/citizen cells");
      assert.ok(caseStats.rendererStats.equivalenceAssetUses.worldUi > 0, testCase.name + " should select accepted UI/status cells");
      assert.ok(caseStats.rendererStats.equivalenceAssetUses.stockpile > 0, testCase.name + " should select accepted stockpile cells");
      assert.ok(caseStats.rendererStats.equivalenceAssetUses.workStatus > 0, testCase.name + " should select accepted work/status overlay cells");
      assert.ok(caseStats.rendererStats.equivalenceAssetUses.effect > 0, testCase.name + " should select accepted material/effect cells");
      assert.ok(caseStats.particleStats.ready === true, testCase.name + " should have ready particle definitions");
      assert.ok(caseStats.particleStats.visible > 0, testCase.name + " should draw settlement activity particles through WebGPU");
      assert.ok(caseStats.particleStats.drawCalls > 0, testCase.name + " should submit a WebGPU particle draw");
    }
    const screenshot = await page.screenshot({ fullPage: false });
    const goldenPath = path.join(goldenDir, testCase.name + ".png");
    const currentImage = parsePng(screenshot);
    const darkPixelRatio = getDarkPixelRatio(currentImage);
    const proofMetrics = testCase.proofScene ? getProofDensityMetrics(caseStats, currentImage) : null;

    if (typeof testCase.maxDarkPixels === "number") {
      assert.ok(
        darkPixelRatio <= testCase.maxDarkPixels,
        testCase.name + " dark-pixel coverage " + (darkPixelRatio * 100).toFixed(2) + "% exceeds viewport underlay budget"
      );
    }

    if (testCase.proofScene) {
      writeProofEvidenceFile(testCase.name + "-desktop", screenshot, proofMetrics);
      assert.ok(proofMetrics.image.nonblankCoverage > 0.55, testCase.name + " should have dense nonblank coverage; metrics=" + JSON.stringify(proofMetrics));
      assert.ok(proofMetrics.image.coarseColorCount >= 24, testCase.name + " should have broad terrain/entity color coverage; metrics=" + JSON.stringify(proofMetrics));
      assert.ok(proofMetrics.image.contrastRange >= 80, testCase.name + " should preserve readable contrast; metrics=" + JSON.stringify(proofMetrics));
      assert.ok(proofMetrics.distinctAcceptedFamilies >= 9, testCase.name + " should draw many accepted asset families together; metrics=" + JSON.stringify(proofMetrics));
      assert.ok(proofMetrics.terrainMaterialDraws > 0, testCase.name + " should include accepted terrain material draws");
      assert.ok(proofMetrics.terrainTransitionDraws > 0, testCase.name + " should include accepted terrain transition draws");
      assert.ok(proofMetrics.citizenDraws > 0, testCase.name + " should include actors");
      assert.ok(proofMetrics.workStatusDraws > 0, testCase.name + " should include work/status overlays");
      assert.ok(proofMetrics.worldUiDraws > 0, testCase.name + " should include UI/status marks");
    }

    if (updateGolden || !fs.existsSync(goldenPath)) {
      fs.writeFileSync(goldenPath, screenshot);
      results.push({ name: testCase.name, updated: true, diff: 0, darkPixels: Number(darkPixelRatio.toFixed(4)), band: caseStats.zoomBand });
      continue;
    }

    const diff = diffPng(currentImage, parsePng(fs.readFileSync(goldenPath)));
    assert.ok(diff <= threshold, testCase.name + " visual diff " + (diff * 100).toFixed(2) + "% exceeds 5%");
    results.push({ name: testCase.name, updated: false, diff: Number(diff.toFixed(4)), darkPixels: Number(darkPixelRatio.toFixed(4)), band: caseStats.zoomBand });
  }

  if (writeProofEvidence) {
    const proofCase = cases.find((testCase) => testCase.proofScene);
    if (proofCase) {
      const localProofCase = Object.assign({}, proofCase, { zoom: 6, expectedBand: "local", writeProofEvidence });
      const localStats = await prepareCase(page, localProofCase);
      const localScreenshot = await page.screenshot({ fullPage: false });
      const localMetrics = getProofDensityMetrics(localStats, parsePng(localScreenshot));

      assert.strictEqual(localStats.zoomBand, "local", "local proof scene should exercise the local zoom band");
      assert.ok(localMetrics.terrainMaterialDraws > 0, "local proof scene should include accepted terrain material draws");
      assert.ok(localMetrics.terrainTransitionDraws > 0, "local proof scene should include accepted terrain transition draws");
      assert.ok(localMetrics.distinctAcceptedFamilies >= 9, "local proof scene should preserve accepted family coverage");
      writeProofEvidenceFile(proofCase.name + "-local-desktop", localScreenshot, localMetrics);

      await page.setViewportSize(mobileViewport);
      const mobileStats = await prepareCase(page, Object.assign({}, proofCase, { writeProofEvidence }));
      const mobileScreenshot = await page.screenshot({ fullPage: false });
      const mobileMetrics = getProofDensityMetrics(mobileStats, parsePng(mobileScreenshot));

      assert.strictEqual(mobileStats.zoomBand, "settlement", "mobile proof scene should remain in settlement band");
      assert.ok(mobileMetrics.terrainMaterialDraws > 0, "mobile proof scene should include accepted terrain material draws");
      assert.ok(mobileMetrics.terrainTransitionDraws > 0, "mobile proof scene should include accepted terrain transition draws");
      assert.ok(mobileMetrics.distinctAcceptedFamilies >= 9, "mobile proof scene should preserve accepted family coverage");
      writeProofEvidenceFile(proofCase.name + "-mobile", mobileScreenshot, mobileMetrics);
      await page.setViewportSize(viewport);
    }
    await loadApp(page);
  }

  const interaction = await runInteractionSmoke(page);
  const zoomSweep = await runContinuousZoomSweep(page);

  const perf = await page.evaluate(async () => {
    const frames = [];
    if (PS.camera && typeof PS.camera.stopInertia === "function") {
      PS.camera.stopInertia();
    }
    world.isCameraInteracting = false;
    await new Promise((resolve) => setTimeout(resolve, Math.max(40, Number(CONFIG.PLANET_CAMERA_INTERACTION_SETTLE_MS) || 140) + 20));
    world.isCameraInteracting = false;
    world.planetView.zoomLevel = 2;
    world.planetView.latitude = 18.5;
    world.planetView.longitude = -42.25;
    world.planetView.panEastMeters = 0;
    world.planetView.panNorthMeters = 0;
    world.isPaused = true;
    for (let i = 0; i < 60; i++) {
      if (typeof updateWorld === "function") {
        updateWorld(1 / 60);
      }
      if (typeof drawWorld === "function") {
        drawWorld();
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    for (let i = 0; i < 100; i++) {
      const startedAt = performance.now();
      if (typeof updateWorld === "function") {
        updateWorld(1 / 60);
      }
      if (typeof drawWorld === "function") {
        drawWorld();
      }
      frames.push(performance.now() - startedAt);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const sum = frames.reduce((total, value) => total + value, 0);
    return {
      averageFrameMs: sum / frames.length,
      peakFrameMs: Math.max.apply(Math, frames),
      frames: frames.map((value) => Number(value.toFixed(3))),
      rendererStats: PS.render.renderer.getStats(),
      debugText: (document.getElementById("debug-output") || {}).textContent || ""
    };
  });

  await browser.close();

  assert.deepStrictEqual(errors, [], "visual smoke should not emit page errors");
  assert.deepStrictEqual(failures, [], "visual smoke should not have failed requests");
  assert.strictEqual(perf.debugText.trim(), "", "visual smoke should not write debug errors");
  assert.ok(
    perf.averageFrameMs < visualAverageFrameBudgetMs,
    "average visual frame time " + perf.averageFrameMs.toFixed(3) + "ms should stay under " + visualAverageFrameBudgetMs + "ms; frames=" + JSON.stringify(perf.frames)
  );
  assert.ok(
    perf.peakFrameMs < 50,
    "peak visual frame time " + perf.peakFrameMs.toFixed(3) + "ms should stay under 50ms; frames=" + JSON.stringify(perf.frames)
  );

  console.log("visual screenshot checks passed", JSON.stringify({
    results,
    interaction,
    zoomSweep,
    averageFrameMs: Number(perf.averageFrameMs.toFixed(3)),
    peakFrameMs: Number(perf.peakFrameMs.toFixed(3))
  }));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
