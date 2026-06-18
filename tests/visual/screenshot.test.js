const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../..");
const goldenDir = path.join(__dirname, "golden");
const visualEvidenceDir = path.join(root, "docs", "visual-regression", "current");
const proofEvidenceDir = path.join(root, "docs", "visual-regression", "azr-803");
const updateGolden = process.env.PIXELDARIUM_UPDATE_GOLDEN === "1";
const writeProofEvidence = process.env.PIXELDARIUM_WRITE_PROOF_EVIDENCE === "1";
const threshold = 0.05;
const viewport = { width: 960, height: 540 };
const mobileViewport = { width: 390, height: 844 };
const visualAverageFrameBudgetMs = 350;
const visualPeakFrameBudgetMs = 450;
const continuousZoomFrameBudgetMs = 60;
const continuousZoomPeakFrameBudgetMs = 40;
const webgpuLaunchArgs = [
  "--enable-unsafe-webgpu",
  "--enable-features=WebGPUDeveloperFeatures",
  "--enable-webgpu-developer-features",
  "--use-angle=d3d11",
  "--disable-dawn-features=use_dxc",
  "--allow-file-access-from-files"
];

const cases = [
  { name: "orbit-view", zoom: 0, orbitEvents: true, expectedBand: "orbit", minOpaqueCoverage: 0.18, minNonblankCoverage: 0.12, minCoarseColorCount: 24, minContrastRange: 45 },
  { name: "continent-view", zoom: 2, biome: "forest", expectedBand: "continent", maxDarkPixels: 0.16, minOpaqueCoverage: 0.7, minNonblankCoverage: 0.52, minCoarseColorCount: 28, minContrastRange: 55 },
  { name: "overlay-visible", zoom: 0, overlay: "observation.population", expectedBand: "orbit", minOpaqueCoverage: 0.18, minNonblankCoverage: 0.12, minCoarseColorCount: 24, minContrastRange: 45 },
  { name: "region-view", zoom: 4, biome: "forest", expectedBand: "region", maxDarkPixels: 0.16, minOpaqueCoverage: 0.7, minNonblankCoverage: 0.52, minCoarseColorCount: 28, minContrastRange: 55 },
  { name: "local-view", zoom: 6, biome: "forest", expectedBand: "local", maxDarkPixels: 0.16, minOpaqueCoverage: 0.7, minNonblankCoverage: 0.52, minCoarseColorCount: 28, minContrastRange: 55 },
  { name: "surface-temperate", zoom: 5, biome: "forest", expectedBand: "region", maxDarkPixels: 0.16, minOpaqueCoverage: 0.7, minNonblankCoverage: 0.52, minCoarseColorCount: 28, minContrastRange: 55 },
  { name: "surface-desert", zoom: 5, biome: "desert", expectedBand: "region", maxDarkPixels: 0.16, minOpaqueCoverage: 0.7, minNonblankCoverage: 0.52, minCoarseColorCount: 24, minContrastRange: 45 },
  { name: "accepted-terrain", zoom: 6, biome: "forest", acceptedTerrain: true, expectedBand: "local", maxDarkPixels: 0.16, minOpaqueCoverage: 0.7, minNonblankCoverage: 0.52, minCoarseColorCount: 28, minContrastRange: 55 },
  { name: "entities-visible", zoom: 6, entities: true, expectedBand: "local", maxDarkPixels: 0.16, minOpaqueCoverage: 0.7, minNonblankCoverage: 0.52, minCoarseColorCount: 28, minContrastRange: 55 },
  { name: "settlement-ground", zoom: 7, settlement: true, acceptedTerrain: true, proofScene: true, expectedBand: "settlement", maxDarkPixels: 0.16, minOpaqueCoverage: 0.7, minNonblankCoverage: 0.55, minCoarseColorCount: 32, minContrastRange: 70 },
  { name: "hud-visible", zoom: 2, hud: true, expectedBand: "continent", maxDarkPixels: 0.16, minOpaqueCoverage: 0.7, minNonblankCoverage: 0.52, minCoarseColorCount: 12, minContrastRange: 24 }
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

function getReadbackImage(readback) {
  if (!readback || !readback.rgbaBase64 || !readback.width || !readback.height) {
    return null;
  }

  return {
    width: readback.width,
    height: readback.height,
    pixels: Buffer.from(readback.rgbaBase64, "base64")
  };
}

function getReadbackPng(readbackImage) {
  if (!readbackImage) {
    return null;
  }

  return encodeRgbaPng(readbackImage.width, readbackImage.height, readbackImage.pixels);
}

function stripPixelPayload(metrics) {
  if (!metrics || typeof metrics !== "object") {
    return metrics;
  }

  const output = Object.assign({}, metrics);
  delete output.rgbaBase64;
  return output;
}

function writeSceneEvidenceFile(name, png, metrics) {
  if (!png) {
    return null;
  }

  ensureDir(visualEvidenceDir);
  const pngPath = path.join(visualEvidenceDir, name + ".png");
  const metricsPath = path.join(visualEvidenceDir, name + ".metrics.json");
  const metricsJson = JSON.stringify(metrics || {}, (key, value) => key === "rgbaBase64" ? undefined : value, 2) + "\n";

  fs.writeFileSync(pngPath, png);
  fs.writeFileSync(metricsPath, metricsJson);
  return pngPath;
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
  let opaque = 0;
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

    if (alpha > 0) {
      opaque += 1;
    }

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
    opaqueCoverage: Number((opaque / total).toFixed(4)),
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
    settlementFootprint: caseStats.settlementFootprint || null,
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

const visualSourceUrl = process.env.PIXELDARIUM_VISUAL_URL || fileUrl(path.join(root, "index.html"));

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
  await page.goto(visualSourceUrl, { waitUntil: "load", timeout: 30000 });
  try {
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
  } catch (error) {
    const readiness = await page.evaluate(() => ({
      href: location.href,
      hasPS: !!window.PS,
      gpuStatus: window.PS && PS.gpu && PS.gpu.status,
      rendererActive: window.PS && PS.render && PS.render.renderer &&
        PS.render.renderer.getActive && PS.render.renderer.getActive() &&
        PS.render.renderer.getActive().name,
      dataStatus: window.PS && PS.assets && PS.assets.startupDataStatus,
      shaderStatus: window.PS && PS.assets && PS.assets.startupWgslShaderStatus,
      debugText: (document.getElementById("debug-output") || {}).textContent || ""
    })).catch((readinessError) => ({
      readinessError: String(readinessError && readinessError.message ? readinessError.message : readinessError)
    }));
    throw new Error("visual app did not become ready: " + JSON.stringify(readiness) + "\n" +
      (error && error.stack ? error.stack : String(error)));
  }
}

const screenshotBrowserHelperPath = path.join(root, "tests", "helpers", "screenshot-browser.js");
const screenshotBrowserHelperSource = fs.readFileSync(screenshotBrowserHelperPath, "utf8");

function runScreenshotBrowserHelper(page, helperName, testCase) {
  return page.evaluate(({ source, helperName: name, config }) => {
    if (!window.__pixeldariumScreenshotHelpers) {
      eval(source);
    }
    return window.__pixeldariumScreenshotHelpers[name](config);
  }, { source: screenshotBrowserHelperSource, helperName, config: testCase });
}

async function prepareCase(page, testCase) {
  await runScreenshotBrowserHelper(page, "prepareCase", testCase);
  await page.waitForTimeout(350);
  return runScreenshotBrowserHelper(page, "collectCaseStats", testCase);
}

async function runInteractionSmoke(page) {
  await page.evaluate(() => {
    const world = PS.world;
    const view = PS.camera.getView();
    view.zoomLevel = 2;
    world.planetView.zoomLevel = 2;
    world.isPaused = true;
    world.needsRender = true;
    if (typeof drawWorld === "function") {
      drawWorld();
    }
  });

  const before = await page.evaluate(() => {
    const world = PS.world;
    return {
      zoomLevel: world.planetView.zoomLevel,
      latitude: world.planetView.latitude,
      longitude: world.planetView.longitude,
      panEastMeters: world.planetView.panEastMeters,
      panNorthMeters: world.planetView.panNorthMeters
    };
  });

  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.wheel(0, -420);
  await page.waitForTimeout(140);
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.width / 2 + 120, viewport.height / 2 + 44, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(140);

  const after = await page.evaluate(() => {
    const world = PS.world;
    return {
      zoomLevel: world.planetView.zoomLevel,
      latitude: world.planetView.latitude,
      longitude: world.planetView.longitude,
      panEastMeters: world.planetView.panEastMeters,
      panNorthMeters: world.planetView.panNorthMeters,
      debugText: (document.getElementById("debug-output") || {}).textContent || ""
    };
  });

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

async function runMobilePanNonblankRegression(page) {
  await page.setViewportSize(mobileViewport);
  await page.evaluate(async () => {
    const world = PS.world;
    const view = PS.camera.getView();

    world.isPaused = true;
    world.isCameraInteracting = true;
    view.zoomLevel = 6.4;
    view.latitude = 18.5;
    view.longitude = -42.25;
    view.panEastMeters = 0;
    view.panNorthMeters = 0;
    world.planetView.zoomLevel = view.zoomLevel;
    world.planetView.latitude = view.latitude;
    world.planetView.longitude = view.longitude;
    world.planetView.panEastMeters = 0;
    world.planetView.panNorthMeters = 0;
    if (PS.camera && typeof PS.camera.stopInertia === "function") {
      PS.camera.stopInertia();
    }
    if (PS.render && PS.render.surfaceRender && typeof PS.render.surfaceRender.resetChunkCache === "function") {
      PS.render.surfaceRender.resetChunkCache();
    }
    if (PS.render && PS.render.surface && typeof PS.render.surface.resetChunkCache === "function") {
      PS.render.surface.resetChunkCache();
    }
    if (PS.render && PS.render.terrain && typeof PS.render.terrain.invalidateCache === "function") {
      PS.render.terrain.invalidateCache();
    }
    if (typeof drawWorld === "function") {
      drawWorld();
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  await page.mouse.move(mobileViewport.width * 0.5, mobileViewport.height * 0.52);
  await page.mouse.down();
  await page.mouse.move(mobileViewport.width * 0.24, mobileViewport.height * 0.38, { steps: 10 });
  await page.mouse.move(mobileViewport.width * 0.66, mobileViewport.height * 0.62, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(160);

  const metrics = await page.evaluate(async () => {
    const world = PS.world;
    const canvas = PS.gpu && PS.gpu.canvas
      ? PS.gpu.canvas
      : document.getElementById("game-webgpu") || document.querySelector("canvas");
    async function readPresentedFrame(label) {
      if (!PS.gpu || !PS.gpu.device || !PS.gpu.context || typeof PS.gpu.context.getCurrentTexture !== "function") {
        return null;
      }

      const device = PS.gpu.device;
      const width = Math.max(1, Math.round(Number(canvas.width) || 1));
      const height = Math.max(1, Math.round(Number(canvas.height) || 1));
      const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
      const format = PS.gpu.format || "bgra8unorm";
      const texture = device.createTexture({
        label,
        size: { width, height },
        format,
        usage: 16 | 1
      });
      const originalGetCurrentTexture = PS.gpu.context.getCurrentTexture.bind(PS.gpu.context);

      PS.gpu.context.getCurrentTexture = function () {
        return texture;
      };

      try {
        world.isCameraInteracting = true;
        if (typeof drawWorld === "function") {
          drawWorld();
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (typeof drawWorld === "function") {
          drawWorld();
        }
      } finally {
        PS.gpu.context.getCurrentTexture = originalGetCurrentTexture;
      }

      const encoder = device.createCommandEncoder({ label: label + ".copy" });
      const buffer = device.createBuffer({
        label: label + ".buffer",
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
      let blackish = 0;
      let min = 255;
      let max = 0;
      let sum = 0;
      const rgba = new Uint8Array(width * height * 4);

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
          if (alpha === 0 || luminance < 8) {
            blackish += 1;
          }
          buckets[(red >> 4) + ":" + (green >> 4) + ":" + (blue >> 4)] = true;
          const destOffset = (y * width + x) * 4;
          rgba[destOffset] = red;
          rgba[destOffset + 1] = green;
          rgba[destOffset + 2] = blue;
          rgba[destOffset + 3] = alpha;
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
        blackishCoverage: Number((blackish / Math.max(1, width * height)).toFixed(4)),
        coarseColorCount: Object.keys(buckets).length,
        luminanceMin: Number(min.toFixed(2)),
        luminanceMax: Number(max.toFixed(2)),
        luminanceMean: Number((sum / Math.max(1, width * height)).toFixed(2)),
        contrastRange: Number((max - min).toFixed(2)),
        rgbaBase64: btoa(Array.from(rgba, (value) => String.fromCharCode(value)).join(""))
      };
    }

    const scene = await readPresentedFrame("azr-1148.mobile-pan-nonblank");
    const pipelineStats = PS.render.pipeline && typeof PS.render.pipeline.getStats === "function"
      ? PS.render.pipeline.getStats()
      : {};
    const cacheStats = PS.render.surfaceRender && typeof PS.render.surfaceRender.getCacheStats === "function"
      ? PS.render.surfaceRender.getCacheStats()
      : {};
    return {
      scene,
      zoomBand: pipelineStats.zoomBand,
      zoomLevel: world.planetView.zoomLevel,
      cacheStats,
      debugText: (document.getElementById("debug-output") || {}).textContent || ""
    };
  });

  await page.setViewportSize(viewport);

  assert.ok(metrics.scene, "mobile pan regression should capture a WebGPU frame");
  assert.strictEqual(metrics.debugText.trim(), "", "mobile pan regression should not write debug errors");
  assert.ok(["local", "settlement"].includes(metrics.zoomBand), "mobile pan regression should exercise local/settlement surface bands");
  assert.ok(
    metrics.scene.opaqueCoverage >= 0.99,
    "mobile pan frame should stay opaque under streaming chunks; metrics=" + JSON.stringify(metrics)
  );
  assert.ok(
    metrics.scene.nonblankCoverage >= 0.94,
    "mobile pan frame should not expose blank/black chunk coverage; metrics=" + JSON.stringify(metrics)
  );
  assert.ok(
    metrics.scene.blackishCoverage <= 0.06,
    "mobile pan blackish coverage should remain below blank-chunk threshold; metrics=" + JSON.stringify(metrics)
  );
  assert.strictEqual(
    metrics.cacheStats.lastStableUnderlayRequired,
    true,
    "mobile pan should require stable parent underlay during interactive local streaming; metrics=" + JSON.stringify(metrics.cacheStats)
  );
  assert.strictEqual(
    metrics.cacheStats.lastStableUnderlayDrawn,
    true,
    "mobile pan should draw stable parent underlay while chunks are pending; metrics=" + JSON.stringify(metrics.cacheStats)
  );
  assert.strictEqual(
    metrics.cacheStats.lastStableUnderlayPolicy,
    "stable-parent-underlay-before-detail-tile",
    "mobile pan should publish the active no-blank underlay policy; metrics=" + JSON.stringify(metrics.cacheStats)
  );
  assert.strictEqual(
    metrics.cacheStats.lastUnderlayRequestedLevel,
    3,
    "mobile pan should request the local-resolution underlay source; metrics=" + JSON.stringify(metrics.cacheStats)
  );
  assert.strictEqual(
    metrics.cacheStats.lastUnderlaySourceLevel,
    metrics.cacheStats.lastUnderlayRequestedLevel,
    "mobile pan should draw the requested underlay source level without falling back to a smeared parent; metrics=" + JSON.stringify(metrics.cacheStats)
  );
  assert.ok(
    metrics.cacheStats.lastUnderlayTextureWidth >= 2048,
    "mobile pan should use the highest-resolution underlay texture; metrics=" + JSON.stringify(metrics.cacheStats)
  );
  assert.strictEqual(
    metrics.cacheStats.lastSmearEvidence,
    0,
    "mobile pan should not report source-level smear fallback; metrics=" + JSON.stringify(metrics.cacheStats)
  );
  assert.strictEqual(
    metrics.cacheStats.lastFlatParentEvidence,
    0,
    "mobile pan should not report a flat parent underlay; metrics=" + JSON.stringify(metrics.cacheStats)
  );
  assert.ok(
    metrics.scene.coarseColorCount >= 24,
    "mobile pan frame should retain terrain color variation; metrics=" + JSON.stringify(metrics)
  );

  const mobilePanImage = getReadbackImage(metrics.scene);
  const mobilePanEvidencePath = writeSceneEvidenceFile(
    "mobile-pan",
    getReadbackPng(mobilePanImage),
    stripPixelPayload(metrics)
  );

  return {
    band: metrics.zoomBand,
    zoom: Number(metrics.zoomLevel.toFixed(3)),
    scene: stripPixelPayload(metrics.scene),
    sceneEvidence: mobilePanEvidencePath,
    cache: {
      pending: metrics.cacheStats.lastPendingChunks,
      generatedThisPass: metrics.cacheStats.lastGeneratedThisPass,
      visible: metrics.cacheStats.lastVisibleChunks,
      stableUnderlayRequired: metrics.cacheStats.lastStableUnderlayRequired,
      stableUnderlayDrawn: metrics.cacheStats.lastStableUnderlayDrawn,
      stableUnderlayPolicy: metrics.cacheStats.lastStableUnderlayPolicy,
      underlayRequestedLevel: metrics.cacheStats.lastUnderlayRequestedLevel,
      underlaySourceLevel: metrics.cacheStats.lastUnderlaySourceLevel,
      underlaySourceName: metrics.cacheStats.lastUnderlaySourceName,
      underlayTextureWidth: metrics.cacheStats.lastUnderlayTextureWidth,
      readyChildCoverage: metrics.cacheStats.lastReadyChildCoverage,
      fallbackStaleCoverage: metrics.cacheStats.lastFallbackStaleCoverage,
      smearEvidence: metrics.cacheStats.lastSmearEvidence,
      flatParentEvidence: metrics.cacheStats.lastFlatParentEvidence
    }
  };
}

async function runContinuousZoomSweep(page) {
  const sweep = await page.evaluate(async () => {
    const world = PS.world;
    const canvas = PS.gpu && PS.gpu.canvas
      ? PS.gpu.canvas
      : document.getElementById("game-webgpu") || document.querySelector("canvas");
    const getPlanetLatLonFromCanvasPoint = (canvasX, canvasY) => PS.render.globe.getLatLonFromCanvasPoint(canvasX, canvasY);
    const isPlanetLocalView = () => PS.camera && PS.camera.unified && typeof PS.camera.unified.isLocalView === "function"
      ? PS.camera.unified.isLocalView()
      : world.planetView.zoomLevel >= 1.4;
    const cursorX = canvas.width * 0.62;
    const cursorY = canvas.height * 0.48;
    const frames = [];
    const bands = {};
    const preloadTargets = {};
    const underlaySourceLevels = {};
    const underlayRequestedLevels = {};
    let maxUnderlaySmearEvidence = 0;
    let maxFlatParentEvidence = 0;
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
    const startZoom = 1;
    const endZoom = PS.camera && typeof PS.camera.getZoomLevels === "function"
      ? PS.camera.getZoomLevels().length - 1
      : 7;
    const zoomTargets = [1.5, 1.75, 2.1, 2.8, 3.15, 3.5, 4.2, 4.9, 5.3, Math.min(6.7, endZoom)];

    if (typeof drawWorld === "function") {
      drawWorld();
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));

    for (let i = 0; i < zoomTargets.length; i++) {
      const before = getPlanetLatLonFromCanvasPoint(cursorX, cursorY);
      const beforeLocal = isPlanetLocalView();
      const startedAt = performance.now();
      const nextZoom = zoomTargets[i];

      if (PS.camera && typeof PS.camera.setZoomAtCanvasPoint === "function") {
        PS.camera.setZoomAtCanvasPoint(nextZoom, cursorX, cursorY);
      } else {
        world.planetView.zoomLevel = nextZoom;
      }
      if (typeof drawWorld === "function") {
        drawWorld();
      }

      const afterLocal = isPlanetLocalView();
      const cameraStats = PS.camera.getZoomTransitionStats();
      const pipelineStats = PS.render.pipeline.getStats();
      const cacheStats = PS.render.surfaceRender && typeof PS.render.surfaceRender.getCacheStats === "function"
        ? PS.render.surfaceRender.getCacheStats()
        : {};
      const after = getPlanetLatLonFromCanvasPoint(cursorX, cursorY);
      const lonDelta = ((after.longitude - before.longitude + 540) % 360) - 180;
      const measuredError = Math.abs(after.latitude - before.latitude) + Math.abs(lonDelta);

      frames.push(performance.now() - startedAt);
      bands[pipelineStats.zoomBand] = true;
      preloadTargets[String(pipelineStats.preloadSurfaceLodIndex)] = true;
      if (cacheStats.lastStableUnderlayDrawn) {
        underlaySourceLevels[String(cacheStats.lastUnderlaySourceLevel)] = true;
        underlayRequestedLevels[String(cacheStats.lastUnderlayRequestedLevel)] = true;
      }
      maxUnderlaySmearEvidence = Math.max(maxUnderlaySmearEvidence, Number(cacheStats.lastSmearEvidence) || 0);
      maxFlatParentEvidence = Math.max(maxFlatParentEvidence, Number(cacheStats.lastFlatParentEvidence) || 0);
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
      underlaySourceLevels: Object.keys(underlaySourceLevels).sort(),
      underlayRequestedLevels: Object.keys(underlayRequestedLevels).sort(),
      maxUnderlaySmearEvidence,
      maxFlatParentEvidence,
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
  assert.ok(
    sweep.underlayRequestedLevels.includes("3") && sweep.underlaySourceLevels.includes("3"),
    "continuous zoom sweep should request and draw the local underlay pyramid source; metrics=" + JSON.stringify({
      underlayRequestedLevels: sweep.underlayRequestedLevels,
      underlaySourceLevels: sweep.underlaySourceLevels,
      bands: sweep.bands
    })
  );
  assert.strictEqual(
    sweep.maxUnderlaySmearEvidence,
    0,
    "continuous zoom sweep should not report underlay source-level smear fallback; metrics=" + JSON.stringify({
      underlayRequestedLevels: sweep.underlayRequestedLevels,
      underlaySourceLevels: sweep.underlaySourceLevels
    })
  );
  assert.strictEqual(
    sweep.maxFlatParentEvidence,
    0,
    "continuous zoom sweep should not report a flat parent underlay; metrics=" + JSON.stringify({
      underlayRequestedLevels: sweep.underlayRequestedLevels,
      underlaySourceLevels: sweep.underlaySourceLevels
    })
  );
  assert.ok(
    sweep.maxTransitionAlpha > 0,
    "continuous zoom sweep should exercise LOD transition alpha; metrics=" + JSON.stringify({
      startZoom: sweep.startZoom,
      endZoom: sweep.endZoom,
      bands: sweep.bands,
      preloadTargets: sweep.preloadTargets,
      maxTransitionAlpha: sweep.maxTransitionAlpha,
      blendedFrames: sweep.blendedFrames
    })
  );
  assert.ok(
    sweep.blendedFrames > 0,
    "continuous zoom sweep should draw blended LOD frames; metrics=" + JSON.stringify({
      maxTransitionAlpha: sweep.maxTransitionAlpha,
      blendedFrames: sweep.blendedFrames,
      bands: sweep.bands
    })
  );
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
  assert.ok(
    sweep.peakFrameMs < continuousZoomPeakFrameBudgetMs,
    "continuous zoom peak frame time " + sweep.peakFrameMs.toFixed(3) + "ms should stay under " +
      continuousZoomPeakFrameBudgetMs + "ms; frames=" + JSON.stringify(sweep.frames)
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
      assert.ok(
        caseStats.rendererStats.equivalenceAssetUses.terrainGround > 0 ||
          caseStats.rendererStats.equivalenceAssetUses.terrainWater > 0 ||
          caseStats.rendererStats.equivalenceAssetUses.terrainMaterial > 0,
        testCase.name + " should select accepted terrain material cells"
      );
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
    const goldenPath = path.join(goldenDir, testCase.name + ".png");
    const readbackImage = getReadbackImage(caseStats.sceneReadback);
    const usesReadbackGate = Boolean(caseStats.sceneReadback);
    const screenshot = usesReadbackGate ? null : await page.screenshot({ fullPage: false });
    const currentImage = screenshot ? parsePng(screenshot) : null;
    const darkPixelRatio = currentImage ? getDarkPixelRatio(currentImage) : 0;
    const screenshotMetrics = currentImage ? getImageSummary(currentImage) : null;
    const sceneMetrics = caseStats.sceneReadback || (readbackImage ? getImageSummary(readbackImage) : screenshotMetrics);
    const resultSceneMetrics = stripPixelPayload(sceneMetrics);
    const sceneMetricSource = caseStats.sceneReadback ? "webgpu-readback" : "playwright-screenshot";
    const sceneEvidencePng = getReadbackPng(readbackImage) || screenshot;
    const sceneEvidencePath = writeSceneEvidenceFile(testCase.name, sceneEvidencePng, {
      name: testCase.name,
      source: sceneMetricSource,
      band: caseStats.zoomBand,
      scene: sceneMetrics,
      screenshot: screenshotMetrics,
      screenshotDiffSkipped: usesReadbackGate ? "webgpu-readback-gate" : null
    });
    const proofMetrics = testCase.proofScene ? getProofDensityMetrics(caseStats, currentImage) : null;

    if (!readbackImage && typeof testCase.maxDarkPixels === "number") {
      assert.ok(
        darkPixelRatio <= testCase.maxDarkPixels,
        testCase.name + " dark-pixel coverage " + (darkPixelRatio * 100).toFixed(2) + "% exceeds viewport underlay budget; metrics=" + JSON.stringify(screenshotMetrics)
      );
    }
    if (typeof testCase.minOpaqueCoverage === "number") {
      assert.ok(
        sceneMetrics.opaqueCoverage >= testCase.minOpaqueCoverage,
        testCase.name + " opaque scene coverage " + (sceneMetrics.opaqueCoverage * 100).toFixed(2) + "% is below " +
          (testCase.minOpaqueCoverage * 100).toFixed(2) + "%; source=" + sceneMetricSource + " metrics=" + JSON.stringify(sceneMetrics)
      );
    }
    if (typeof testCase.minNonblankCoverage === "number") {
      assert.ok(
        sceneMetrics.nonblankCoverage >= testCase.minNonblankCoverage,
        testCase.name + " nonblank scene coverage " + (sceneMetrics.nonblankCoverage * 100).toFixed(2) + "% is below " +
          (testCase.minNonblankCoverage * 100).toFixed(2) + "%; source=" + sceneMetricSource + " metrics=" + JSON.stringify(sceneMetrics)
      );
    }
    if (typeof testCase.minCoarseColorCount === "number") {
      assert.ok(
        sceneMetrics.coarseColorCount >= testCase.minCoarseColorCount,
        testCase.name + " coarse color count " + sceneMetrics.coarseColorCount + " is below " +
          testCase.minCoarseColorCount + "; source=" + sceneMetricSource + " metrics=" + JSON.stringify(sceneMetrics)
      );
    }
    if (typeof testCase.minContrastRange === "number") {
      assert.ok(
        sceneMetrics.contrastRange >= testCase.minContrastRange,
        testCase.name + " contrast range " + sceneMetrics.contrastRange.toFixed(2) + " is below " +
          testCase.minContrastRange.toFixed(2) + "; source=" + sceneMetricSource + " metrics=" + JSON.stringify(sceneMetrics)
      );
    }

    if (testCase.proofScene) {
      writeProofEvidenceFile(testCase.name + "-desktop", screenshot || Buffer.alloc(0), proofMetrics);
      assert.ok(proofMetrics.image.nonblankCoverage > 0.55, testCase.name + " should have dense nonblank coverage; metrics=" + JSON.stringify(proofMetrics));
      assert.ok(proofMetrics.image.coarseColorCount >= 24, testCase.name + " should have broad terrain/entity color coverage; metrics=" + JSON.stringify(proofMetrics));
      assert.ok(proofMetrics.image.contrastRange >= 80, testCase.name + " should preserve readable contrast; metrics=" + JSON.stringify(proofMetrics));
      assert.ok(proofMetrics.distinctAcceptedFamilies >= 9, testCase.name + " should draw many accepted asset families together; metrics=" + JSON.stringify(proofMetrics));
      assert.ok(proofMetrics.terrainMaterialDraws > 0, testCase.name + " should include accepted terrain material draws");
      assert.ok(proofMetrics.terrainTransitionDraws > 0, testCase.name + " should include accepted terrain transition draws");
      assert.ok(proofMetrics.settlementFootprint && proofMetrics.settlementFootprint.count >= 4, testCase.name + " should include multiple active simulated settlement sites; metrics=" + JSON.stringify(proofMetrics));
      assert.ok(proofMetrics.settlementFootprint.widthCoverage >= 0.34, testCase.name + " should frame a viewport-scale local settlement footprint; metrics=" + JSON.stringify(proofMetrics));
      assert.ok(proofMetrics.settlementFootprint.areaCoverage >= 0.06, testCase.name + " should not pass with a tiny central settlement patch; metrics=" + JSON.stringify(proofMetrics));
      assert.ok(proofMetrics.citizenDraws > 0, testCase.name + " should include actors");
      assert.ok(proofMetrics.workStatusDraws > 0, testCase.name + " should include work/status overlays");
      assert.ok(proofMetrics.worldUiDraws > 0, testCase.name + " should include UI/status marks");
    }

    if (!usesReadbackGate && (updateGolden || !fs.existsSync(goldenPath))) {
      fs.writeFileSync(goldenPath, screenshot);
      results.push({ name: testCase.name, updated: true, diff: 0, darkPixels: Number(darkPixelRatio.toFixed(4)), screenshot: screenshotMetrics, scene: resultSceneMetrics, sceneSource: sceneMetricSource, sceneEvidence: sceneEvidencePath, band: caseStats.zoomBand });
      continue;
    }

    if (!usesReadbackGate) {
      const diff = diffPng(currentImage, parsePng(fs.readFileSync(goldenPath)));
      assert.ok(diff <= threshold, testCase.name + " visual diff " + (diff * 100).toFixed(2) + "% exceeds 5%");
      results.push({ name: testCase.name, updated: false, diff: Number(diff.toFixed(4)), darkPixels: Number(darkPixelRatio.toFixed(4)), screenshot: screenshotMetrics, scene: resultSceneMetrics, sceneSource: sceneMetricSource, sceneEvidence: sceneEvidencePath, band: caseStats.zoomBand });
    } else {
      results.push({ name: testCase.name, updated: false, diff: null, screenshotDiffSkipped: "webgpu-readback-gate", darkPixels: null, screenshot: null, scene: resultSceneMetrics, sceneSource: sceneMetricSource, sceneEvidence: sceneEvidencePath, band: caseStats.zoomBand });
    }
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
  const mobilePan = await runMobilePanNonblankRegression(page);
  const zoomSweep = await runContinuousZoomSweep(page);

  const perf = await page.evaluate(async () => {
    const world = PS.world;
    const CONFIG = window.CONFIG || PS.config || {};
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
    if (PS.render && PS.render.surfaceRender && typeof PS.render.surfaceRender.resetChunkCache === "function") {
      PS.render.surfaceRender.resetChunkCache();
    }
    if (PS.render && PS.render.surface && typeof PS.render.surface.resetChunkCache === "function") {
      PS.render.surface.resetChunkCache();
    }
    if (PS.render && PS.render.terrain && typeof PS.render.terrain.invalidateCache === "function") {
      PS.render.terrain.invalidateCache();
    }
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
    perf.peakFrameMs < visualPeakFrameBudgetMs,
    "peak visual frame time " + perf.peakFrameMs.toFixed(3) + "ms should stay under " + visualPeakFrameBudgetMs + "ms; frames=" + JSON.stringify(perf.frames)
  );

  console.log("visual screenshot checks passed", JSON.stringify({
    results,
    interaction,
    mobilePan,
    zoomSweep,
    averageFrameMs: Number(perf.averageFrameMs.toFixed(3)),
    peakFrameMs: Number(perf.peakFrameMs.toFixed(3))
  }));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
