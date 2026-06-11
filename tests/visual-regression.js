const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const goldenDir = path.join(__dirname, "visual-regression", "golden");
const diffDir = path.join(__dirname, "visual-regression", "diff");
const updateGolden = process.env.PIXELDARIUM_UPDATE_VISUAL_REGRESSION === "1";
const threshold = 0.05;
const viewport = { width: 960, height: 540 };
const webgpuLaunchArgs = [
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan,WebGPUDeveloperFeatures",
  "--enable-webgpu-developer-features",
  "--use-angle=vulkan"
];

const locations = [
  { name: "temperate", latitude: 12.5, longitude: -41.25 },
  { name: "desert", latitude: -18.75, longitude: 63.5 },
  { name: "polar", latitude: 54.25, longitude: 8.75 }
];
const zooms = [
  { name: "world", value: 0 },
  { name: "region", value: 4 },
  { name: "area", value: 5 },
  { name: "surface", value: 7 }
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
      colorType = data[9];
      assert.ok(colorType === 2 || colorType === 6, "visual regression PNGs must be RGB or RGBA");
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

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const scanline = Buffer.from(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;

    for (let x = 0; x < stride; x += 1) {
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

    for (let x = 0; x < width; x += 1) {
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

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
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
  for (let y = 0; y < height; y += 1) {
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

function diffImages(current, golden) {
  assert.strictEqual(current.width, golden.width, "visual regression width changed");
  assert.strictEqual(current.height, golden.height, "visual regression height changed");

  const total = current.width * current.height;
  const diffPixels = Buffer.alloc(total * 4);
  let changed = 0;

  for (let i = 0; i < total; i += 1) {
    const offset = i * 4;
    const delta =
      Math.abs(current.pixels[offset] - golden.pixels[offset]) +
      Math.abs(current.pixels[offset + 1] - golden.pixels[offset + 1]) +
      Math.abs(current.pixels[offset + 2] - golden.pixels[offset + 2]) +
      Math.abs(current.pixels[offset + 3] - golden.pixels[offset + 3]);

    if (delta > 18) {
      changed += 1;
      diffPixels[offset] = 255;
      diffPixels[offset + 1] = 64;
      diffPixels[offset + 2] = 64;
      diffPixels[offset + 3] = 255;
    } else {
      diffPixels[offset] = Math.floor(current.pixels[offset] * 0.35);
      diffPixels[offset + 1] = Math.floor(current.pixels[offset + 1] * 0.35);
      diffPixels[offset + 2] = Math.floor(current.pixels[offset + 2] * 0.35);
      diffPixels[offset + 3] = 255;
    }
  }

  return {
    ratio: changed / total,
    png: encodeRgbaPng(current.width, current.height, diffPixels)
  };
}

function launchBrowser() {
  const options = { headless: true, args: webgpuLaunchArgs };
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
      PS.render.wgslShaders &&
      PS.render.wgslShaders.registry &&
      PS.render.wgslShaders.registry["globe-sphere"] &&
      PS.render.wgslShaders.registry["terrain-tile"] &&
      PS.render.wgslShaders.registry["gbuffer-terrain"],
    null,
    { timeout: 30000 }
  );
}

async function prepareCapture(page, testCase) {
  return page.evaluate((config) => {
    if (typeof setWorldSeed === "function") {
      setWorldSeed("PIXEL-VIS-REGRESSION-001");
    }
    if (typeof seedWorld === "function") {
      seedWorld();
    }

    const view = PS.camera.getView();
    view.zoomLevel = config.zoom;
    view.latitude = config.latitude;
    view.longitude = config.longitude;
    view.panEastMeters = 0;
    view.panNorthMeters = 0;
    world.isPaused = true;
    world.isCameraInteracting = false;
    world.needsRender = true;
    if (PS.camera && typeof PS.camera.stopInertia === "function") {
      PS.camera.stopInertia();
    }
    if (typeof drawWorld === "function") {
      drawWorld();
    }

    return {
      zoomBand: PS.render.pipeline.getZoomBand(world.planetView.zoomLevel),
      visualLod: PS.render.pipeline.getStats().visualLevel,
      debugText: (document.getElementById("debug-output") || {}).textContent || ""
    };
  }, testCase);
}

async function run() {
  ensureDir(goldenDir);
  ensureDir(diffDir);

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  const failures = [];
  const results = [];

  page.on("pageerror", (error) => errors.push(String(error && error.message ? error.message : error)));
  page.on("requestfailed", (request) => failures.push(request.url()));
  await loadApp(page);

  for (const location of locations) {
    for (const zoom of zooms) {
      const name = location.name + "-" + zoom.name;
      const stats = await prepareCapture(page, Object.assign({}, location, { zoom: zoom.value }));
      assert.strictEqual(stats.debugText.trim(), "", name + " should not write debug errors");
      await page.waitForTimeout(120);

      const screenshot = await page.screenshot({ fullPage: false });
      const goldenPath = path.join(goldenDir, name + ".png");
      const diffPath = path.join(diffDir, name + ".diff.png");

      if (updateGolden || !fs.existsSync(goldenPath)) {
        fs.writeFileSync(goldenPath, screenshot);
        if (fs.existsSync(diffPath)) {
          fs.unlinkSync(diffPath);
        }
        results.push({ name, updated: true, diff: 0, band: stats.zoomBand, visualLod: stats.visualLod });
        continue;
      }

      const diff = diffImages(parsePng(screenshot), parsePng(fs.readFileSync(goldenPath)));
      if (diff.ratio > threshold) {
        fs.writeFileSync(diffPath, diff.png);
      } else if (fs.existsSync(diffPath)) {
        fs.unlinkSync(diffPath);
      }
      assert.ok(diff.ratio <= threshold, name + " visual diff " + (diff.ratio * 100).toFixed(2) + "% exceeds 5%; diff=" + diffPath);
      results.push({ name, updated: false, diff: Number(diff.ratio.toFixed(4)), band: stats.zoomBand, visualLod: stats.visualLod });
    }
  }

  await browser.close();
  assert.deepStrictEqual(errors, [], "visual regression should not emit page errors");
  assert.deepStrictEqual(failures, [], "visual regression should not have failed requests");
  assert.strictEqual(results.length, 12, "visual regression should cover 3 locations across 4 zoom levels");

  console.log("visual regression checks passed", JSON.stringify({ results }));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
