const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFileSync, spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const captureLabel = String(process.env.PIXELDARIUM_CAPTURE_LABEL || "zoom-video").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
const sourceUrl = process.env.PIXELDARIUM_CAPTURE_URL || fileUrl(path.join(root, "index.html"));
const outputDir = path.join(root, "output", "playwright", captureLabel);
const framesDir = path.join(outputDir, "frames");
const videoPath = path.join(outputDir, "zoom-through.mp4");
const posterPath = path.join(outputDir, "zoom-through-poster.png");
const analysisPath = path.join(outputDir, "zoom-through.analysis.json");
const viewport = { width: 960, height: 540 };
const fps = 30;
const webgpuLaunchArgs = [
  "--enable-unsafe-webgpu",
  "--enable-features=WebGPUDeveloperFeatures",
  "--enable-webgpu-developer-features",
  "--use-angle=d3d11",
  "--disable-dawn-features=use_dxc",
  "--allow-file-access-from-files"
];

function fileUrl(filePath) {
  return pathToFileURL(filePath).href;
}

function percentile(values, ratio) {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] || 0;
}

function parseBlackdetect(stderr) {
  const lines = String(stderr || "").split(/\r?\n/).filter((line) => line.indexOf("black_") >= 0);
  return lines.map((line) => {
    const start = /black_start:([0-9.]+)/.exec(line);
    const end = /black_end:([0-9.]+)/.exec(line);
    const duration = /black_duration:([0-9.]+)/.exec(line);
    return {
      start: start ? Number(start[1]) : null,
      end: end ? Number(end[1]) : null,
      duration: duration ? Number(duration[1]) : null,
      raw: line
    };
  });
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
  const scanlineLength = width * 4;
  const raw = Buffer.alloc((scanlineLength + 1) * height);

  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

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

async function run() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: webgpuLaunchArgs,
    executablePath: process.env.PIXELDARIUM_CHROME_PATH || undefined
  });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  const failures = [];

  page.on("pageerror", (error) => errors.push(String(error && error.message ? error.message : error)));
  page.on("requestfailed", (request) => failures.push(request.url()));
  await page.goto(sourceUrl, { waitUntil: "load", timeout: 30000 });
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

  await page.evaluate(async () => {
    const world = PS.world;
    if (typeof setWorldSeed === "function") {
      setWorldSeed("PIXEL-ZOOM-VIDEO-001");
    }
    if (typeof seedWorld === "function") {
      seedWorld();
    }

    const view = PS.camera && typeof PS.camera.getView === "function"
      ? PS.camera.getView()
      : (world.planetView = world.planetView || {});

    world.isPaused = true;
    world.isCameraInteracting = true;
    view.zoomLevel = 1;
    view.latitude = 18.5;
    view.longitude = -42.25;
    view.panEastMeters = 0;
    view.panNorthMeters = 0;
    world.planetView = view;
    if (PS.camera && typeof PS.camera.stopInertia === "function") {
      PS.camera.stopInertia();
    }
    if (typeof drawWorld === "function") {
      drawWorld();
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  const totalFrames = 120;
  const frames = [];
  fs.mkdirSync(framesDir, { recursive: true });

  for (let i = 0; i < totalFrames; i += 1) {
    const capture = await page.evaluate(async ({ index, totalFrames }) => {
      const world = PS.world;
      const canvas = PS.gpu && PS.gpu.canvas
        ? PS.gpu.canvas
        : document.getElementById("game-webgpu") || document.querySelector("canvas");
      const getPlanetLatLonFromCanvasPoint = (canvasX, canvasY) => PS.render.globe.getLatLonFromCanvasPoint(canvasX, canvasY);
    function smoothstep(value) {
      const x = Math.max(0, Math.min(1, value));
      return x * x * (3 - 2 * x);
    }

      const view = PS.camera && typeof PS.camera.getView === "function"
      ? PS.camera.getView()
      : (world.planetView = world.planetView || {});
      const cursorX = canvas.width * 0.62;
      const cursorY = canvas.height * 0.48;
      const startZoom = 1;
      const endZoom = PS.camera && typeof PS.camera.getZoomLevels === "function"
        ? Math.min(PS.camera.getZoomLevels().length - 1, 7)
        : 7;
      const t = totalFrames <= 1 ? 1 : index / (totalFrames - 1);
      const zoom = startZoom + (endZoom - startZoom) * smoothstep(t);
      const before = getPlanetLatLonFromCanvasPoint(cursorX, cursorY);
      const beforeLocal = PS.camera && PS.camera.unified && typeof PS.camera.unified.isLocalView === "function"
        ? PS.camera.unified.isLocalView()
        : view.zoomLevel >= 1.4;
      const startedAt = performance.now();

      const device = PS.gpu.device;
      const width = Math.max(1, Math.round(Number(canvas.width) || 1));
      const height = Math.max(1, Math.round(Number(canvas.height) || 1));
      const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
      const format = PS.gpu.format || "bgra8unorm";
      const texture = device.createTexture({
        label: "zoom-video.frame-" + index,
        size: { width, height },
        format,
        usage: 16 | 1
      });
      const originalGetCurrentTexture = PS.gpu.context.getCurrentTexture.bind(PS.gpu.context);

      PS.gpu.context.getCurrentTexture = function () {
        return texture;
      };

      try {
        if (PS.camera && typeof PS.camera.setZoomAtCanvasPoint === "function") {
          PS.camera.setZoomAtCanvasPoint(zoom, cursorX, cursorY);
        } else {
          world.planetView.zoomLevel = zoom;
        }
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

      const after = getPlanetLatLonFromCanvasPoint(cursorX, cursorY);
      const lonDelta = before && after ? ((after.longitude - before.longitude + 540) % 360) - 180 : 0;
      const rawAnchorErrorDeg = before && after ? Math.abs(after.latitude - before.latitude) + Math.abs(lonDelta) : 0;
      const afterLocal = PS.camera && PS.camera.unified && typeof PS.camera.unified.isLocalView === "function"
        ? PS.camera.unified.isLocalView()
        : view.zoomLevel >= 1.4;
      const cameraStats = PS.camera && typeof PS.camera.getZoomTransitionStats === "function"
        ? PS.camera.getZoomTransitionStats()
        : {};
      const localAnchorMeasured = beforeLocal && afterLocal;
      const anchorErrorDeg = localAnchorMeasured
        ? Math.max(rawAnchorErrorDeg, Number(cameraStats.lastZoomAnchorErrorDeg) || 0)
        : 0;
      const pipelineStats = PS.render && PS.render.pipeline && typeof PS.render.pipeline.getStats === "function"
        ? PS.render.pipeline.getStats()
        : {};
      const rendererStats = PS.render && PS.render.webgpuRenderer && typeof PS.render.webgpuRenderer.getStats === "function"
        ? PS.render.webgpuRenderer.getStats()
        : {};
      const drawFrameMs = performance.now() - startedAt;

      const encoder = device.createCommandEncoder({ label: "zoom-video.frame-" + index + ".copy" });
      const buffer = device.createBuffer({
        label: "zoom-video.frame-" + index + ".buffer",
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
      buffer.unmap();
      texture.destroy();

      let binary = "";
      const chunkSize = 0x8000;
      for (let start = 0; start < rgba.length; start += chunkSize) {
        binary += String.fromCharCode.apply(null, rgba.subarray(start, start + chunkSize));
      }

      return {
        rgbaBase64: btoa(binary),
        width,
        height,
        frame: {
        index,
        zoomLevel: Number(world.planetView.zoomLevel.toFixed(3)),
        band: pipelineStats.zoomBand || (PS.render.pipeline && PS.render.pipeline.getZoomBand ? PS.render.pipeline.getZoomBand(world.planetView.zoomLevel) : ""),
        transitionAlpha: Number((Number(pipelineStats.transitionAlpha) || 0).toFixed(3)),
        blendedLayers: Number(pipelineStats.blendedLayers) || 0,
        frameMs: Number(drawFrameMs.toFixed(3)),
        anchorErrorDeg: Number(anchorErrorDeg.toExponential(3)),
        rawAnchorErrorDeg: Number(rawAnchorErrorDeg.toExponential(3)),
        localAnchorMeasured,
        rendererFrameMs: Number((rendererStats.lastFrameMs || 0).toFixed ? rendererStats.lastFrameMs.toFixed(3) : rendererStats.lastFrameMs || 0)
        }
      };
    }, { index: i, totalFrames });

    frames.push(capture.frame);
    fs.writeFileSync(
      path.join(framesDir, `frame-${String(i).padStart(4, "0")}.png`),
      encodeRgbaPng(capture.width, capture.height, Buffer.from(capture.rgbaBase64, "base64"))
    );
  }

  await page.evaluate(() => {
    const world = PS.world;
    world.isCameraInteracting = false;
  });

  await browser.close();

  execFileSync("ffmpeg", [
    "-y",
    "-framerate", String(fps),
    "-i", path.join(framesDir, "frame-%04d.png"),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    videoPath
  ], { stdio: "pipe" });
  execFileSync("ffmpeg", [
    "-y",
    "-ss", "2",
    "-i", videoPath,
    "-frames:v", "1",
    posterPath
  ], { stdio: "pipe" });

  const blackdetect = spawnSync("ffmpeg", [
    "-i", videoPath,
    "-vf", "blackdetect=d=0.1:pix_th=0.10",
    "-an",
    "-f", "null",
    "-"
  ], { encoding: "utf8" });
  const frameMs = frames.map((frame) => frame.frameMs);
  const localAnchorFrames = frames.filter((frame) => frame.localAnchorMeasured);
  const bands = {};
  frames.forEach((frame) => {
    bands[frame.band] = (bands[frame.band] || 0) + 1;
  });
  const summary = {
    captureMethod: "webgpu-texture-readback",
    sourceCanvas: viewport,
    frameCount: frames.length,
    fps,
    durationSeconds: Number((frames.length / fps).toFixed(2)),
    zoomStart: frames[0] ? frames[0].zoomLevel : null,
    zoomEnd: frames[frames.length - 1] ? frames[frames.length - 1].zoomLevel : null,
    bands: Object.keys(bands),
    bandCounts: bands,
    averageFrameMs: Number((frameMs.reduce((sum, value) => sum + value, 0) / Math.max(1, frameMs.length)).toFixed(3)),
    p80FrameMs: Number(percentile(frameMs, 0.8).toFixed(3)),
    peakFrameMs: Number(Math.max.apply(Math, frameMs).toFixed(3)),
    localAnchoredFrames: localAnchorFrames.length,
    maxAnchorErrorDeg: Number(Math.max.apply(Math, localAnchorFrames.map((frame) => frame.anchorErrorDeg).concat([0])).toExponential(3)),
    maxRawAnchorErrorDeg: Number(Math.max.apply(Math, frames.map((frame) => frame.rawAnchorErrorDeg || frame.anchorErrorDeg || 0).concat([0])).toExponential(3)),
    slowFrames: frames.filter((frame) => frame.frameMs > 60),
    blackSegments: parseBlackdetect(blackdetect.stderr),
    videoBytes: fs.statSync(videoPath).size
  };
  const analysis = {
    generatedAt: new Date().toISOString(),
    source: sourceUrl,
    videoPath,
    framesDir,
    posterPath,
    errors,
    failedRequests: failures,
    summary,
    frames
  };

  fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2) + "\n");
  console.log(JSON.stringify({ videoPath, framesDir, posterPath, analysisPath, summary }, null, 2));
}

run().catch((error) => {
  console.error(error && (error.stack || error.message) ? (error.stack || error.message) : error);
  process.exit(1);
});
