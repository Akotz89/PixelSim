const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
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

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: webgpuLaunchArgs,
    executablePath: process.env.PIXELDARIUM_CHROME_PATH || undefined
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const errors = [];
  const failures = [];

  page.on("pageerror", (error) => errors.push(String(error && error.message ? error.message : error)));
  page.on("requestfailed", (request) => failures.push(request.url()));
  await page.goto(fileUrl(path.join(root, "index.html")), { waitUntil: "load", timeout: 30000 });
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
    throw new Error("zoom input app did not become ready: " + JSON.stringify(readiness) + "\n" +
      (error && error.stack ? error.stack : String(error)));
  }

  const result = await page.evaluate(async () => {
    const cameraInput = await import(new URL("js/ui/camera-input.js", location.href).href);
    const interaction = await import(new URL("js/ui/interaction.js", location.href).href);
    const world = PS.world;
    const canvas = PS.gpu && PS.gpu.canvas
      ? PS.gpu.canvas
      : document.getElementById("game-webgpu") || document.querySelector("canvas");
    const getPlanetLatLonFromCanvasPoint = (canvasX, canvasY) => PS.render.globe.getLatLonFromCanvasPoint(canvasX, canvasY);
    const zoomPlanetView = cameraInput.zoomPlanetView;
    const beginPlanetDrag = cameraInput.beginPlanetDrag;
    const updatePlanetDrag = cameraInput.updatePlanetDrag;
    const endPlanetDrag = cameraInput.endPlanetDrag;
    const getPlanetWheelZoomDelta = interaction.getPlanetWheelZoomDelta;

    function nextFrame() {
      if (typeof drawWorld === "function") {
        drawWorld();
      }
      return new Promise((resolve) => requestAnimationFrame(resolve));
    }

    async function settle(frames, samples) {
      for (let i = 0; i < frames; i += 1) {
        if (PS.camera && typeof PS.camera.updateInertia === "function") {
          PS.camera.updateInertia();
        }
        await nextFrame();
        samples.push(Number((PS.camera.getView().zoomLevel || 0).toFixed(5)));
      }
    }

    function resetCamera() {
      const view = PS.camera.getView();
      view.zoomLevel = 2;
      view.latitude = 18.5;
      view.longitude = -42.25;
      view.panEastMeters = 0;
      view.panNorthMeters = 0;
      if (PS.camera && typeof PS.camera.stopInertia === "function") {
        PS.camera.stopInertia();
      }
      world.isPaused = true;
      world.isCameraInteracting = false;
      world.planetView = view;
    }

    function maxStep(samples) {
      let max = 0;
      for (let i = 1; i < samples.length; i += 1) {
        max = Math.max(max, Math.abs(samples[i] - samples[i - 1]));
      }
      return Number(max.toFixed(5));
    }

    function maxAcceleration(samples) {
      let max = 0;
      for (let i = 2; i < samples.length; i += 1) {
        const previousStep = samples[i - 1] - samples[i - 2];
        const nextStep = samples[i] - samples[i - 1];
        max = Math.max(max, Math.abs(nextStep - previousStep));
      }
      return Number(max.toFixed(5));
    }

    const center = {
      canvasX: canvas.width * 0.5,
      canvasY: canvas.height * 0.5
    };
    const wheelSamples = [];
    const pinchSamples = [];
    const burstPinchSamples = [];
    const noisyHoldPinchSamples = [];
    const noisyMovePinchSamples = [];
    const jitterAnchorPinchSamples = [];
    const jitterAnchorCenterSamples = [];
    let pinchEndAtRelease = 0;
    let burstEndAtRelease = 0;
    let noisyHoldEndAtRelease = 0;
    let noisyMoveEndAtRelease = 0;
    let jitterAnchorEndAtRelease = 0;

    resetCamera();
    wheelSamples.push(Number(PS.camera.getView().zoomLevel.toFixed(5)));
    for (let i = 0; i < 10; i += 1) {
      zoomPlanetView(getPlanetWheelZoomDelta({
        deltaY: -120,
        deltaMode: 0,
        clientX: center.canvasX,
        clientY: center.canvasY
      }), center);
      await settle(1, wheelSamples);
    }
    await settle(12, wheelSamples);

    resetCamera();
    pinchSamples.push(Number(PS.camera.getView().zoomLevel.toFixed(5)));
    beginPlanetDrag({
      pointerType: "touch",
      pointerId: 1,
      clientX: 110,
      clientY: 420,
      preventDefault() {}
    });
    beginPlanetDrag({
      pointerType: "touch",
      pointerId: 2,
      clientX: 280,
      clientY: 420,
      preventDefault() {}
    });
    for (let i = 0; i < 10; i += 1) {
      updatePlanetDrag({
        pointerType: "touch",
        pointerId: 2,
        clientX: 280 + i * 10,
        clientY: 420,
        preventDefault() {}
      });
      await settle(1, pinchSamples);
    }
    pinchEndAtRelease = Number(PS.camera.getView().zoomLevel.toFixed(5));
    endPlanetDrag({ pointerType: "touch", pointerId: 1 });
    endPlanetDrag({ pointerType: "touch", pointerId: 2 });
    await settle(12, pinchSamples);

    resetCamera();
    burstPinchSamples.push(Number(PS.camera.getView().zoomLevel.toFixed(5)));
    beginPlanetDrag({
      pointerType: "touch",
      pointerId: 1,
      clientX: 110,
      clientY: 420,
      preventDefault() {}
    });
    beginPlanetDrag({
      pointerType: "touch",
      pointerId: 2,
      clientX: 280,
      clientY: 420,
      preventDefault() {}
    });
    for (let i = 0; i < 12; i += 1) {
      updatePlanetDrag({
        pointerType: "touch",
        pointerId: 2,
        clientX: 280 + i * 14,
        clientY: 420,
        preventDefault() {}
      });
    }
    await settle(8, burstPinchSamples);
    burstEndAtRelease = Number(PS.camera.getView().zoomLevel.toFixed(5));
    endPlanetDrag({ pointerType: "touch", pointerId: 1 });
    endPlanetDrag({ pointerType: "touch", pointerId: 2 });
    await settle(12, burstPinchSamples);

    resetCamera();
    noisyHoldPinchSamples.push(Number(PS.camera.getView().zoomLevel.toFixed(5)));
    beginPlanetDrag({
      pointerType: "touch",
      pointerId: 1,
      clientX: 110,
      clientY: 420,
      preventDefault() {}
    });
    beginPlanetDrag({
      pointerType: "touch",
      pointerId: 2,
      clientX: 280,
      clientY: 420,
      preventDefault() {}
    });
    for (let i = 0; i < 18; i += 1) {
      updatePlanetDrag({
        pointerType: "touch",
        pointerId: 2,
        clientX: 280 + (i % 2 === 0 ? 0.75 : -0.75),
        clientY: 420 + (i % 3 === 0 ? 0.5 : -0.5),
        preventDefault() {}
      });
      await settle(1, noisyHoldPinchSamples);
    }
    noisyHoldEndAtRelease = Number(PS.camera.getView().zoomLevel.toFixed(5));
    endPlanetDrag({ pointerType: "touch", pointerId: 1 });
    endPlanetDrag({ pointerType: "touch", pointerId: 2 });
    await settle(8, noisyHoldPinchSamples);

    resetCamera();
    noisyMovePinchSamples.push(Number(PS.camera.getView().zoomLevel.toFixed(5)));
    beginPlanetDrag({
      pointerType: "touch",
      pointerId: 1,
      clientX: 110,
      clientY: 420,
      preventDefault() {}
    });
    beginPlanetDrag({
      pointerType: "touch",
      pointerId: 2,
      clientX: 280,
      clientY: 420,
      preventDefault() {}
    });
    for (let i = 0; i < 16; i += 1) {
      updatePlanetDrag({
        pointerType: "touch",
        pointerId: 2,
        clientX: 280 + i * 8 + (i % 2 === 0 ? 1.2 : -1.2),
        clientY: 420 + (i % 4 === 0 ? 1 : -1),
        preventDefault() {}
      });
      await settle(1, noisyMovePinchSamples);
    }
    noisyMoveEndAtRelease = Number(PS.camera.getView().zoomLevel.toFixed(5));
    endPlanetDrag({ pointerType: "touch", pointerId: 1 });
    endPlanetDrag({ pointerType: "touch", pointerId: 2 });
    await settle(8, noisyMovePinchSamples);

    resetCamera();
    jitterAnchorPinchSamples.push(Number(PS.camera.getView().zoomLevel.toFixed(5)));
    jitterAnchorCenterSamples.push(getPlanetLatLonFromCanvasPoint(center.canvasX, center.canvasY));
    beginPlanetDrag({
      pointerType: "touch",
      pointerId: 1,
      clientX: 110,
      clientY: 420,
      preventDefault() {}
    });
    beginPlanetDrag({
      pointerType: "touch",
      pointerId: 2,
      clientX: 280,
      clientY: 420,
      preventDefault() {}
    });
    for (let i = 0; i < 18; i += 1) {
      const midpointJitterX = i % 2 === 0 ? 5 : -5;
      const midpointJitterY = i % 3 === 0 ? 4 : -4;
      updatePlanetDrag({
        pointerType: "touch",
        pointerId: 1,
        clientX: 110 - i * 5 + midpointJitterX,
        clientY: 420 + midpointJitterY,
        preventDefault() {}
      });
      updatePlanetDrag({
        pointerType: "touch",
        pointerId: 2,
        clientX: 280 + i * 5 + midpointJitterX,
        clientY: 420 + midpointJitterY,
        preventDefault() {}
      });
      await settle(1, jitterAnchorPinchSamples);
      jitterAnchorCenterSamples.push(getPlanetLatLonFromCanvasPoint(center.canvasX, center.canvasY));
    }
    jitterAnchorEndAtRelease = Number(PS.camera.getView().zoomLevel.toFixed(5));
    endPlanetDrag({ pointerType: "touch", pointerId: 1 });
    endPlanetDrag({ pointerType: "touch", pointerId: 2 });
    await settle(8, jitterAnchorPinchSamples);

    function maxCenterDrift(samples) {
      const start = samples[0];
      let max = 0;
      for (let i = 1; i < samples.length; i += 1) {
        const sample = samples[i];
        const longitudeDelta = ((Number(sample.longitude) - Number(start.longitude) + 540) % 360) - 180;
        max = Math.max(max, Math.abs(Number(sample.latitude) - Number(start.latitude)) + Math.abs(longitudeDelta));
      }
      return Number(max.toFixed(6));
    }

    return {
      wheel: {
        start: wheelSamples[0],
        end: wheelSamples[wheelSamples.length - 1],
        maxStep: maxStep(wheelSamples),
        maxAcceleration: maxAcceleration(wheelSamples),
        samples: wheelSamples
      },
      pinch: {
        start: pinchSamples[0],
        release: pinchEndAtRelease,
        end: pinchSamples[pinchSamples.length - 1],
        postReleaseDrift: Number((pinchSamples[pinchSamples.length - 1] - pinchEndAtRelease).toFixed(5)),
        maxStep: maxStep(pinchSamples),
        maxAcceleration: maxAcceleration(pinchSamples),
        samples: pinchSamples
      },
      burstPinch: {
        start: burstPinchSamples[0],
        release: burstEndAtRelease,
        end: burstPinchSamples[burstPinchSamples.length - 1],
        postReleaseDrift: Number((burstPinchSamples[burstPinchSamples.length - 1] - burstEndAtRelease).toFixed(5)),
        maxStep: maxStep(burstPinchSamples),
        maxAcceleration: maxAcceleration(burstPinchSamples),
        samples: burstPinchSamples
      },
      noisyHoldPinch: {
        start: noisyHoldPinchSamples[0],
        release: noisyHoldEndAtRelease,
        end: noisyHoldPinchSamples[noisyHoldPinchSamples.length - 1],
        drift: Number((noisyHoldPinchSamples[noisyHoldPinchSamples.length - 1] - noisyHoldPinchSamples[0]).toFixed(5)),
        postReleaseDrift: Number((noisyHoldPinchSamples[noisyHoldPinchSamples.length - 1] - noisyHoldEndAtRelease).toFixed(5)),
        maxStep: maxStep(noisyHoldPinchSamples),
        maxAcceleration: maxAcceleration(noisyHoldPinchSamples),
        samples: noisyHoldPinchSamples
      },
      noisyMovePinch: {
        start: noisyMovePinchSamples[0],
        release: noisyMoveEndAtRelease,
        end: noisyMovePinchSamples[noisyMovePinchSamples.length - 1],
        postReleaseDrift: Number((noisyMovePinchSamples[noisyMovePinchSamples.length - 1] - noisyMoveEndAtRelease).toFixed(5)),
        maxStep: maxStep(noisyMovePinchSamples),
        maxAcceleration: maxAcceleration(noisyMovePinchSamples),
        samples: noisyMovePinchSamples
      },
      jitterAnchorPinch: {
        start: jitterAnchorPinchSamples[0],
        release: jitterAnchorEndAtRelease,
        end: jitterAnchorPinchSamples[jitterAnchorPinchSamples.length - 1],
        postReleaseDrift: Number((jitterAnchorPinchSamples[jitterAnchorPinchSamples.length - 1] - jitterAnchorEndAtRelease).toFixed(5)),
        maxStep: maxStep(jitterAnchorPinchSamples),
        maxAcceleration: maxAcceleration(jitterAnchorPinchSamples),
        maxCenterDriftDeg: maxCenterDrift(jitterAnchorCenterSamples),
        samples: jitterAnchorPinchSamples
      },
      motion: PS.camera.getMotionConfig(),
      anchorErrorDeg: PS.camera.getZoomTransitionStats().lastZoomAnchorErrorDeg
    };
  });

  await browser.close();

  console.log(JSON.stringify(result, null, 2));

  assert.deepStrictEqual(errors, [], "page should not throw while probing zoom input");
  assert.deepStrictEqual(failures, [], "page should not fail requests while probing zoom input");
  assert.ok(result.wheel.end > result.wheel.start, "wheel zoom should move inward");
  assert.ok(result.pinch.end > result.pinch.start, "pinch zoom should move inward");
  assert.ok(result.wheel.maxStep <= 0.018, "wheel zoom should not jump scale bands, got " + result.wheel.maxStep);
  assert.ok(result.pinch.maxStep <= 0.011, "pinch zoom should not jump scale bands, got " + result.pinch.maxStep);
  assert.ok(result.burstPinch.maxStep <= 0.011, "bursty mobile pinch should be frame-capped, got " + result.burstPinch.maxStep);
  assert.ok(result.pinch.maxAcceleration <= 0.011, "pinch zoom should not jerk between frames, got " + result.pinch.maxAcceleration);
  assert.ok(result.noisyHoldPinch.maxStep <= 0.003, "stationary noisy pinch should stay dead-zoned, got " + result.noisyHoldPinch.maxStep);
  assert.ok(Math.abs(result.noisyHoldPinch.drift) <= 0.01, "stationary noisy pinch should not crawl zoom, drift " + result.noisyHoldPinch.drift);
  assert.ok(Math.abs(result.noisyHoldPinch.postReleaseDrift) <= 0.001, "stationary noisy pinch should stop on release, drift " + result.noisyHoldPinch.postReleaseDrift);
  assert.ok(result.noisyMovePinch.end > result.noisyMovePinch.start, "noisy deliberate pinch should move inward");
  assert.ok(result.noisyMovePinch.maxStep <= 0.011, "noisy deliberate pinch should stay frame-capped, got " + result.noisyMovePinch.maxStep);
  assert.ok(result.noisyMovePinch.maxAcceleration <= 0.011, "noisy deliberate pinch should not jerk between frames, got " + result.noisyMovePinch.maxAcceleration);
  assert.ok(result.wheel.end - result.wheel.start <= 0.2, "wheel zoom should descend gradually, got " + (result.wheel.end - result.wheel.start));
  assert.ok(result.pinch.end - result.pinch.start >= 0.09, "pinch zoom should track a deliberate gesture without feeling stalled, got " + (result.pinch.end - result.pinch.start));
  assert.ok(result.pinch.end - result.pinch.start <= 0.22, "pinch zoom should descend gradually, got " + (result.pinch.end - result.pinch.start));
  assert.ok(Math.abs(result.pinch.postReleaseDrift) <= 0.022, "pinch zoom should only glide a small capped amount after release, drift " + result.pinch.postReleaseDrift);
  assert.ok(result.burstPinch.release - result.burstPinch.start >= 0.08, "bursty mobile pinch should retain cumulative gesture intent, got " + (result.burstPinch.release - result.burstPinch.start));
  assert.ok(result.burstPinch.release - result.burstPinch.start <= 0.19, "bursty mobile pinch should still stay bounded, got " + (result.burstPinch.release - result.burstPinch.start));
  assert.ok(Math.abs(result.burstPinch.postReleaseDrift) <= 0.022, "bursty mobile pinch should only glide a small capped amount after release, drift " + result.burstPinch.postReleaseDrift);
  assert.ok(result.jitterAnchorPinch.end > result.jitterAnchorPinch.start, "jittery two-finger pinch should still zoom deliberately");
  assert.ok(result.jitterAnchorPinch.maxStep <= 0.011, "jittery two-finger pinch should stay frame-capped, got " + result.jitterAnchorPinch.maxStep);
  assert.ok(result.jitterAnchorPinch.maxAcceleration <= 0.011, "jittery two-finger pinch should not jerk between frames, got " + result.jitterAnchorPinch.maxAcceleration);
  assert.ok(result.jitterAnchorPinch.maxCenterDriftDeg <= 0.35, "jittery pinch midpoint should not drag the camera anchor around, drift " + result.jitterAnchorPinch.maxCenterDriftDeg);
  assert.ok(Math.abs(result.jitterAnchorPinch.postReleaseDrift) <= 0.022, "jittery pinch should only glide a small capped amount after release, drift " + result.jitterAnchorPinch.postReleaseDrift);
  assert.ok(result.anchorErrorDeg <= 0.000001, "anchored zoom should keep the cursor location stable");
}

run().catch((error) => {
  console.error(error && (error.stack || error.message) ? (error.stack || error.message) : error);
  process.exit(1);
});
