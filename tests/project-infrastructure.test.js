const assert = require("assert");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const PORT = 3210;
const HOST = "127.0.0.1";
const BASE_URL = "http://" + HOST + ":" + PORT;

function wait(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

function startDevServer() {
  const child = spawn(
    "npm",
    ["run", "dev", "--", "--host", HOST, "--port", String(PORT), "--strictPort"],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      shell: process.platform === "win32"
    }
  );
  const output = [];

  child.stdout.on("data", function(chunk) {
    output.push(chunk.toString());
  });
  child.stderr.on("data", function(chunk) {
    output.push(chunk.toString());
  });

  return {
    child: child,
    output: output,
    stop: function() {
      return new Promise(function(resolve) {
        let resolved = false;

        function finish() {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }

        if (child.exitCode !== null) {
          finish();
          return;
        }

        child.once("exit", finish);

        try {
          if (process.platform === "win32") {
            child.kill();
          } else {
            process.kill(-child.pid, "SIGTERM");
          }
        } catch (error) {
          child.kill();
        }

        setTimeout(function() {
          if (child.exitCode === null) {
            try {
              if (process.platform === "win32") {
                child.kill("SIGKILL");
              } else {
                process.kill(-child.pid, "SIGKILL");
              }
            } catch (error) {
              // The process may already have exited.
            }
          }
          finish();
        }, 2000);
      });
    }
  };
}

async function waitForServer(server) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 15000) {
    if (server.child.exitCode !== null) {
      throw new Error("Vite exited early:\n" + server.output.join(""));
    }

    try {
      const response = await fetch(BASE_URL + "/assets/test.json");

      if (response.ok) {
        return;
      }
    } catch (error) {
      // Server is still starting.
    }

    await wait(250);
  }

  throw new Error("Timed out waiting for Vite dev server:\n" + server.output.join(""));
}

(async function() {
  const server = startDevServer();
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForServer(server);

    const assetResponse = await fetch(BASE_URL + "/assets/test.json");
    const assetPayload = await assetResponse.json();

    assert.strictEqual(assetResponse.ok, true, "dev server should serve /assets/test.json");
    assert.strictEqual(assetPayload.ok, true, "dev server should return the asset fixture JSON");

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const consoleErrors = [];
    const pageErrors = [];

    page.on("console", function(message) {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", function(error) {
      pageErrors.push(error.message);
    });

    await page.goto(BASE_URL + "/", { waitUntil: "load" });
    await page.waitForFunction(function() {
      return window.PS &&
        PS.core &&
        PS.core.loaderState &&
        PS.core.loaderState.status === "complete";
    }, null, { timeout: 10000 });

    await page.waitForFunction(function() {
      return window.PS &&
        PS.gpu &&
        (PS.gpu.status === "ready" || PS.gpu.status === "failed");
    }, null, { timeout: 10000 });

    const gpuEvidence = await page.evaluate(function() {
      return {
        navigatorGpu: !!(navigator && navigator.gpu),
        status: PS.gpu ? PS.gpu.status : "missing",
        isWebGPU: !!(PS.gpu && PS.gpu.isWebGPU),
        contextClaimed: !!(PS.gpu && PS.gpu.context),
        error: PS.gpu ? PS.gpu.error : null,
        noticeText: document.getElementById("webgpu-required-notice")
          ? document.getElementById("webgpu-required-notice").textContent
          : "",
        startupAssets: PS.assets ? PS.assets.startupStatus || null : null,
        startupData: PS.assets ? PS.assets.startupDataStatus || null : null
      };
    });

    if (gpuEvidence.status === "failed") {
      const requiredEvidence = await page.evaluate(function() {
        return {
          loaderStatus: PS.core.loaderState.status,
          manifestCount: PS.core.manifest.length,
          loadedCount: PS.core.loaderState.loaded.length,
          gpuStatus: PS.gpu.status,
          isWebGPU: PS.gpu.isWebGPU,
          hasContextDeferredFlag: Object.prototype.hasOwnProperty.call(PS.gpu, "contextDeferred"),
          gpuRequired: PS.gpu.required,
          gpuError: PS.gpu.error,
          noticeText: document.getElementById("webgpu-required-notice").textContent,
          startupAssets: PS.assets.startupStatus || null,
          startupData: PS.assets.startupDataStatus || null,
          loadingText: document.getElementById("loading-progress-text").textContent
        };
      });

      assert.deepStrictEqual(consoleErrors, [], "WebGPU-required stop should not emit console errors");
      assert.deepStrictEqual(pageErrors, [], "WebGPU-required stop should be handled by startup");
      assert.strictEqual(requiredEvidence.loaderStatus, "complete", "dynamic script loader should still complete");
      assert.ok(requiredEvidence.manifestCount > 100, "script manifest should include the game runtime scripts");
      assert.strictEqual(requiredEvidence.loadedCount, requiredEvidence.manifestCount, "loader should load every manifest script");
      assert.strictEqual(requiredEvidence.gpuRequired, true, "WebGPU should be mandatory");
      assert.strictEqual(requiredEvidence.gpuStatus, "failed", "startup should stop when WebGPU cannot initialize");
      assert.strictEqual(requiredEvidence.isWebGPU, false, "failed WebGPU init should not mark the GPU layer ready");
      assert.strictEqual(requiredEvidence.hasContextDeferredFlag, false, "GPU bootstrap should not expose deferred canvas ownership");
      assert.ok(requiredEvidence.gpuError && requiredEvidence.gpuError.length > 0, "GPU error should explain the requirement");
      assert.ok(requiredEvidence.noticeText.length > 0, "page should show the WebGPU-required notice");
      assert.ok(requiredEvidence.loadingText.length > 0, "loading text should show the WebGPU-required notice");
      assert.strictEqual(requiredEvidence.startupAssets, null, "asset startup should not run after WebGPU-required failure");
      assert.strictEqual(requiredEvidence.startupData, null, "data startup should not run after WebGPU-required failure");
      console.log("project infrastructure checks passed", JSON.stringify({ webgpu: "required-stop" }));
      return;
    }

    await page.waitForFunction(function() {
      return window.PS &&
        PS.assets &&
        PS.assets.startupStatus &&
        PS.assets.startupStatus.loaded === true &&
        PS.assets.startupDataStatus &&
        PS.assets.startupDataStatus.loaded === true &&
        PS.core.TileRegistry &&
        PS.core.TileRegistry.list().length > 0 &&
        typeof world !== "undefined" &&
        Array.isArray(world.planetTiles) &&
        world.planetTiles.length > 0 &&
        document.getElementById("loading-screen") &&
        document.getElementById("loading-screen").hidden === true;
    }, null, { timeout: 10000 });

    const bootEvidence = await page.evaluate(function() {
      const scripts = Array.from(document.querySelectorAll("script[src]")).map(function(script) {
        return script.getAttribute("src");
      });
      const loadingScreen = document.getElementById("loading-screen");
      const loadingFill = document.getElementById("loading-progress-fill");
      const loadingText = document.getElementById("loading-progress-text");
      const lushTile = PS.core.TileRegistry && typeof PS.core.TileRegistry.get === "function"
        ? PS.core.TileRegistry.get("grass_lush")
        : null;
      const gpuCanvas = document.getElementById("game-webgpu");

      return {
        loaderStatus: PS.core.loaderState.status,
        manifestCount: PS.core.manifest.length,
        loadedCount: PS.core.loaderState.loaded.length,
        bootstrapScripts: scripts.filter(function(script) {
          return script === "js/core/namespace.js" || script === "js/core/loader-esm.js";
        }),
        startupAssets: PS.assets.startupStatus,
        startupData: PS.assets.startupDataStatus,
        gpuContextDeferred: PS.gpu ? PS.gpu.contextDeferred : null,
        gpuContextClaimed: !!(PS.gpu && PS.gpu.context),
        tileRegistryCount: PS.core.TileRegistry ? PS.core.TileRegistry.list().length : 0,
        lushTile: lushTile ? {
          id: lushTile.id,
          biome: lushTile.biome,
          baseColor: lushTile.baseColor,
          spriteId: PS.core.TileRegistry.getSpriteId("grass_lush", 3)
        } : null,
        biomesLoaded: PS.assets.biomesData && Array.isArray(PS.assets.biomesData.biomes)
          ? PS.assets.biomesData.biomes.length
          : 0,
        transitionResolverReady: !!PS.render.terrainTransitions,
        terrainBuildCacheType: PS.render && PS.render.terrain ? typeof PS.render.terrain.buildCache : "missing",
        globalBuildTerrainCacheType: typeof window.buildTerrainCache,
        globalInvalidateTerrainCacheType: typeof window.invalidateTerrainCache,
        globalSurfaceRenderStatsType: typeof window.getLocalSurfaceRenderCacheStats,
        surfaceRenderStats: PS.render && PS.render.surfaceRender && typeof PS.render.surfaceRender.getCacheStats === "function"
          ? PS.render.surfaceRender.getCacheStats()
          : null,
        spriteSystemLoaded: !!PS.spriteSystem,
        atlasLoaded: !!PS.atlas,
        atlasStats: PS.atlas && typeof PS.atlas.getStats === "function" ? PS.atlas.getStats() : null,
        atlasPageData: PS.atlas && PS.atlas.pages && PS.atlas.pages[0] && PS.atlas.pages[0].data
          ? {
            width: PS.atlas.pages[0].width,
            height: PS.atlas.pages[0].height,
            byteLength: PS.atlas.pages[0].data.byteLength,
            isUint8Array: PS.atlas.pages[0].data instanceof Uint8Array,
            hasCanvasPage: !!PS.atlas.pages[0].canvas
          }
          : null,
        gpuCanvas: gpuCanvas ? {
          id: gpuCanvas.id,
          width: gpuCanvas.width,
          height: gpuCanvas.height
        } : null,
        canvas2dSurfaceLoaded: !!document.getElementById("game"),
        loadingScreenHidden: loadingScreen ? loadingScreen.hidden : null,
        loadingFillWidth: loadingFill ? loadingFill.style.width : "",
        loadingText: loadingText ? loadingText.textContent : ""
      };
    });

    assert.deepStrictEqual(consoleErrors, [], "dev-server page should not emit console errors");
    assert.deepStrictEqual(pageErrors, [], "dev-server page should not throw page errors");
    assert.strictEqual(gpuEvidence.status, "ready", "WebGPU should initialize before runtime assets");
    assert.strictEqual(gpuEvidence.isWebGPU, true, "PS.gpu should expose WebGPU readiness");
    assert.strictEqual(gpuEvidence.contextDeferred, true, "startup should defer visible WebGPU canvas ownership during migration");
    assert.strictEqual(gpuEvidence.contextClaimed, false, "startup should not claim the visible canvas before WebGPU presenter ownership");
    assert.strictEqual(bootEvidence.loaderStatus, "complete", "dynamic script loader should complete");
    assert.ok(bootEvidence.manifestCount > 100, "script manifest should include the game runtime scripts");
    assert.strictEqual(bootEvidence.loadedCount, bootEvidence.manifestCount, "loader should load every manifest script");
    assert.deepStrictEqual(
      bootEvidence.bootstrapScripts,
      ["js/core/namespace.js", "js/core/loader-esm.js"],
      "dev-server page should include namespace and ESM loader bootstrap scripts"
    );
    assert.strictEqual(bootEvidence.startupAssets.loaded, true, "startup should load the asset manifest before game start");
    assert.strictEqual(bootEvidence.gpuContextDeferred, true, "boot evidence should retain deferred visible-canvas ownership");
    assert.strictEqual(bootEvidence.gpuContextClaimed, false, "boot evidence should prove WebGPU did not steal the visible canvas");
    assert.strictEqual(bootEvidence.startupAssets.fallback, false, "HTTP startup should not fall back from the asset manifest");
    assert.ok(
      bootEvidence.startupAssets.loadedSheets.indexOf("terrain_grass") >= 0,
      "startup should load the terrain grass sheet from assets"
    );
    assert.strictEqual(bootEvidence.startupData.loaded, true, "startup should load data before game start");
    assert.ok(bootEvidence.startupData.tiles >= 18, "startup should load tile definitions before game start");
    assert.ok(bootEvidence.startupData.biomes >= 8, "startup should load biome definitions before game start");
    assert.ok(bootEvidence.startupData.transitionPairs >= 5, "startup should load terrain transition definitions before game start");
    assert.strictEqual(bootEvidence.startupData.transitionResolverReady, false, "startup should not create a Canvas2D terrain transition resolver");
    assert.strictEqual(bootEvidence.tileRegistryCount, bootEvidence.startupData.tiles, "TileRegistry should contain startup tile definitions");
    assert.deepStrictEqual(
      bootEvidence.lushTile,
      {
        id: "grass_lush",
        biome: "temperate",
        baseColor: "#4a8c2a",
        spriteId: "terrain.grass.3"
      },
      "TileRegistry should expose loaded grass tile render data"
    );
    assert.strictEqual(bootEvidence.biomesLoaded, bootEvidence.startupData.biomes, "startup should retain loaded biome data");
    assert.strictEqual(bootEvidence.transitionResolverReady, false, "Canvas2D terrain transition resolver should not load in runtime");
    assert.strictEqual(bootEvidence.terrainBuildCacheType, "undefined", "terrain renderer should not expose obsolete build cache entry point");
    assert.strictEqual(bootEvidence.globalBuildTerrainCacheType, "undefined", "runtime should not expose obsolete buildTerrainCache global");
    assert.strictEqual(bootEvidence.globalInvalidateTerrainCacheType, "undefined", "runtime should not expose obsolete invalidateTerrainCache global");
    assert.strictEqual(bootEvidence.globalSurfaceRenderStatsType, "undefined", "runtime should not expose obsolete surface render stats global");
    assert.strictEqual(bootEvidence.surfaceRenderStats.canvases, null, "surface render stats should not retain a render canvas pool");
    assert.strictEqual(bootEvidence.spriteSystemLoaded, false, "runtime should not load the Canvas2D sprite system");
    assert.strictEqual(bootEvidence.atlasLoaded, true, "runtime should load the packed WebGPU entity atlas");
    assert.ok(bootEvidence.atlasStats.cellCount > 0, "packed WebGPU atlas should generate runtime cells");
    assert.deepStrictEqual(
      bootEvidence.atlasPageData,
      {
        width: 256,
        height: 256,
        byteLength: 262144,
        isUint8Array: true,
        hasCanvasPage: false
      },
      "packed WebGPU atlas should use a typed RGBA page, not a canvas page"
    );
    assert.deepStrictEqual(
      bootEvidence.gpuCanvas,
      { id: "game-webgpu", width: 1600, height: 850 },
      "runtime should expose the WebGPU presentation canvas"
    );
    assert.strictEqual(bootEvidence.canvas2dSurfaceLoaded, false, "runtime should not expose a separate Canvas2D game surface");
    assert.strictEqual(bootEvidence.loadingScreenHidden, true, "loading screen should hide after startup completes");
    assert.strictEqual(bootEvidence.loadingFillWidth, "100%", "loading progress bar should fill after assets load");
    assert.ok(/Loading\.\.\. \d+\/\d+/.test(bootEvidence.loadingText), "loading text should show startup asset counts");
    assert.ok(bootEvidence.startupAssets.loadMs < 3000, "dev-server startup asset load should stay under 3 seconds");

    console.log("project infrastructure checks passed");
  } finally {
    await browser.close();
    await server.stop();
  }
}()).catch(function(error) {
  console.error(error);
  process.exit(1);
});
