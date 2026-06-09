"use strict";
function toggleSimulationPaused() {
  return setSimulationPaused(!world.isPaused);
}

function setSimulationSpeed(speed) {
  var nextSpeed = clamp(Math.round(Number(speed) || world.speed), 1, 10);

  if (world.speed === nextSpeed) {
    return false;
  }

  world.speed = nextSpeed;
  return true;
}

function adjustSimulationSpeed(delta) {
  return setSimulationSpeed(world.speed + Math.round(Number(delta) || 0));
}

function stepSimulationOnce() {
  if (!world.isPaused || world.isExtinct) {
    return false;
  }

  var updateStart = performance.now();
  updateWorld(PS.time.dt);
  world.updateMs = performance.now() - updateStart;
  world.maxUpdateMs = Math.max(world.maxUpdateMs, world.updateMs);
  world.interpolation = 1;

  var drawStart = performance.now();
  drawWorld();
  world.drawMs = performance.now() - drawStart;
  PS.time.recordRenderFrame(world.drawMs);
  world.maxDrawMs = Math.max(world.maxDrawMs, world.drawMs);

  updateHud();
  return true;
}

var lastFrameTime = performance.now();
var statsTimer = performance.now();
var hudTimer = performance.now();
var framesSinceStatsUpdate = 0;
var simTicksSinceStatsUpdate = 0;
var updateMsSinceStatsUpdate = 0;
var drawMsSinceStatsUpdate = 0;
var measuredUpdateFrames = 0;
var measuredDrawFrames = 0;
var maxUpdateMsSinceStatsUpdate = 0;
var maxDrawMsSinceStatsUpdate = 0;
var gameLoopStarted = false;

function getLoadingScreen() {
  return document.getElementById("loading-screen");
}

function updateLoadingScreen(progress, message) {
  var screen = getLoadingScreen();
  var fill = document.getElementById("loading-progress-fill");
  var text = document.getElementById("loading-progress-text");
  var total = progress && Number(progress.total) ? Number(progress.total) : 0;
  var loaded = progress ? Number(progress.loaded) || 0 : 0;
  var failed = progress ? Number(progress.failed) || 0 : 0;
  var percent = progress ? Number(progress.percent) || 0 : 0;

  if (screen) {
    screen.hidden = false;
  }

  if (fill) {
    fill.style.width = Math.max(0, Math.min(100, percent)) + "%";
  }

  if (text) {
    text.textContent = (message || "Loading...") + " " + (loaded + failed) + "/" + total;
  }
}

function hideLoadingScreen() {
  var screen = getLoadingScreen();

  if (screen) {
    screen.hidden = true;
  }
}

function loadStartupAssets() {
  var startedAt = performance.now();

  if (!PS.assets || typeof PS.assets.AssetLoader !== "function") {
    return Promise.resolve({
      loaded: false,
      reason: "AssetLoader unavailable",
      loadMs: 0
    });
  }

  var loader = new PS.assets.AssetLoader();

  PS.assets.startupLoader = loader;
  updateLoadingScreen(loader.getProgress(), "Loading...");
  loader.onProgress = function (progress) {
    updateLoadingScreen(progress, "Loading...");
  };

  return loader.loadManifest("assets/manifest.json").then(function (manifest) {
    var loadedSheets = PS.assets.loadedSheets || {};
    var sheetIds = Object.keys(loadedSheets);

    PS.assets.startupStatus = {
      loaded: true,
      manifest: manifest,
      loadedSheets: sheetIds,
      fallback: false,
      loadMs: performance.now() - startedAt
    };

    if (PS.log && typeof PS.log.info === "function") {
      PS.log.info("assets.loaded", "Loaded asset sheets: " + (sheetIds.join(", ") || "none"));
    }

    return PS.assets.startupStatus;
  }).catch(function (error) {
    PS.assets.startupStatus = {
      loaded: false,
      fallback: true,
      reason: error && error.message ? error.message : String(error),
      loadMs: performance.now() - startedAt
    };

    if (PS.runtime && typeof PS.runtime.recordError === "function") {
      PS.runtime.recordError("asset.manifest.fallback", PS.assets.startupStatus);
    }

    updateLoadingScreen(loader.getProgress(), "Using fallback...");

    return PS.assets.startupStatus;
  });
}

function loadStartupData() {
  if (!PS.assets || typeof PS.assets.AssetLoader !== "function") {
    return Promise.resolve({ loaded: false, reason: "AssetLoader unavailable" });
  }

  var loader = PS.assets.startupLoader || new PS.assets.AssetLoader();

  PS.assets.startupLoader = loader;

  return Promise.all([
    PS.core && PS.core.DataLoader && typeof PS.core.DataLoader.loadConfig === "function"
      ? PS.core.DataLoader.loadConfig(loader)
      : loader.loadJSON("data/config.json"),
    loader.loadJSON("data/entities.json"),
    loader.loadJSON("data/tiles.json"),
    loader.loadJSON("data/biomes.json"),
    loader.loadJSON("data/transitions.json"),
    loader.loadJSON("data/particles.json"),
    loader.loadJSON("data/animations.json"),
    loader.loadJSON("data/keybindings.json"),
    loader.loadJSON("data/audio.json")
  ]).then(function (results) {
    var configStatus = results[0];
    var entitiesData = results[1];
    var tilesData = results[2];
    var biomesData = results[3];
    var transitionsData = results[4];
    var particlesData = results[5];
    var animationsData = results[6];
    var keybindingsData = results[7];
    var audioData = results[8];
    var tileCount = 0;
    var biomeCount = Array.isArray(biomesData && biomesData.biomes) ? biomesData.biomes.length : 0;
    var transitionPairs = Array.isArray(transitionsData && transitionsData.pairs) ? transitionsData.pairs.length : 0;
    var animationGroups = animationsData && animationsData.animations ? Object.keys(animationsData.animations).length : 0;

    if (PS.core && PS.core.EntityRegistry && typeof PS.core.EntityRegistry.loadFromJSON === "function") {
      PS.core.EntityRegistry.loadFromJSON(entitiesData);
    }

    if (PS.core && PS.core.TileRegistry && typeof PS.core.TileRegistry.loadFromJSON === "function") {
      tileCount = PS.core.TileRegistry.loadFromJSON(tilesData).length;
    }

    if (PS.assets) {
      PS.assets.biomesData = biomesData;
      PS.assets.transitionsData = transitionsData;
      PS.assets.particlesData = particlesData;
      PS.assets.animationsData = animationsData;
    }

    if (PS.animation && typeof PS.animation.loadDefinitions === "function") {
      PS.animation.loadDefinitions(animationsData);
    }

    if (PS.audio && typeof PS.audio.loadManifest === "function") {
      PS.audio.loadManifest(audioData);
    }

    if (PS.input && typeof PS.input.setBindings === "function") {
      PS.input.setBindings(keybindingsData);
    }

    if (PS.render && typeof PS.render.TerrainTransitionResolver === "function") {
      PS.render.terrainTransitions = new PS.render.TerrainTransitionResolver(
        PS.core && PS.core.TileRegistry ? PS.core.TileRegistry : null,
        transitionsData
      );
    }

    PS.assets.startupDataStatus = {
      loaded: true,
      config: configStatus && configStatus.loaded === true,
      configValues: configStatus && configStatus.valueCount ? configStatus.valueCount : 0,
      entities: PS.core && PS.core.EntityRegistry ? PS.core.EntityRegistry.list().length : 0,
      tiles: tileCount,
      biomes: biomeCount,
      transitionPairs: transitionPairs,
      particleEffects: particlesData && particlesData.effects ? Object.keys(particlesData.effects).length : 0,
      animationGroups: animationGroups,
      keybindingActions: keybindingsData && keybindingsData.bindings ? Object.keys(keybindingsData.bindings).length : 0,
      audioTracks: audioData && audioData.music ? Object.keys(audioData.music).length : 0,
      audioAmbient: audioData && audioData.ambient ? Object.keys(audioData.ambient).length : 0,
      audioSfx: audioData && audioData.sfx ? Object.keys(audioData.sfx).length : 0,
      transitionResolverReady: !!(PS.render && PS.render.terrainTransitions)
    };

    return PS.assets.startupDataStatus;
  });
}

function loadStartupShaders() {
  var loader = PS.assets && PS.assets.startupLoader ? PS.assets.startupLoader : null;

  function registerWgslManifests() {
    var registrars = [
      PS.render.webgpuGlobe,
      PS.render.webgpuSurfaceUnderlay,
      PS.render.webgpuSurfaceTile,
      PS.render.webgpuCompositor,
      PS.render.webgpuPointLights,
      PS.render.webgpuEntity,
      PS.sim && PS.sim.heatDiffusion
    ];

    for (var i = 0; i < registrars.length; i += 1) {
      if (registrars[i] && typeof registrars[i].registerManifest === "function") {
        registrars[i].registerManifest();
      }
    }
  }

  function loadRequiredWgslShaders(status) {
    var manifest = PS.render.wgslShaderManifest || [];

    if (!PS.render.wgslShaders || typeof PS.render.wgslShaders.loadManifest !== "function" || manifest.length === 0) {
      return Promise.resolve(status);
    }

    return PS.render.wgslShaders.loadManifest(manifest, loader).then(function (entries) {
      var manifestStatus = PS.render.wgslShaders.lastManifestStatus || {
        total: manifest.length,
        loaded: entries.length,
        failed: 0,
        failedShaders: []
      };

      PS.assets.startupWgslShaderStatus = {
        loaded: manifestStatus.loaded === manifestStatus.total && manifestStatus.failed === 0,
        shaders: entries.length,
        total: manifestStatus.total,
        failed: manifestStatus.failed,
        failedShaders: manifestStatus.failedShaders || []
      };

      if (manifestStatus.failed > 0 || manifestStatus.loaded !== manifestStatus.total) {
        throw new Error("Required WGSL shaders failed to load");
      }

      status.wgsl = PS.assets.startupWgslShaderStatus;
      return status;
    });
  }

  registerWgslManifests();

  PS.assets.startupShaderStatus = {
    loaded: true,
    shaders: 0,
    total: 0,
    failed: 0,
    wgslOnly: true
  };

  return loadRequiredWgslShaders(PS.assets.startupShaderStatus).catch(function (error) {
    var message = error && error.message ? error.message : String(error);

    if (message.indexOf("Required WGSL shaders failed to load") >= 0) {
      if (PS.runtime && typeof PS.runtime.recordError === "function") {
        PS.runtime.recordError("wgsl.manifest.failed", PS.assets.startupWgslShaderStatus || { reason: message });
      }
      throw error;
    }

    if (PS.runtime && typeof PS.runtime.recordError === "function") {
      PS.runtime.recordError("wgsl.manifest.failed", { reason: message });
    }

    throw error;
  });
}

function gameLoop() {
  try {
    var frameStart = performance.now();
    var now = frameStart;
    var frameElapsed = Math.min(250, Math.max(0, now - lastFrameTime));
    var timeFrame = null;
    var drawElapsed = 0;
    var hudElapsed = 0;
    var totalElapsed = 0;
    var overheadElapsed = 0;
    lastFrameTime = now;
    framesSinceStatsUpdate++;

    if (!world.isPaused) {
      timeFrame = PS.time.runFrame(frameElapsed, updateWorld);

      if (timeFrame.ticks > 0) {
        updateMsSinceStatsUpdate += timeFrame.updateMs;
        measuredUpdateFrames++;

        if (timeFrame.updateMs > maxUpdateMsSinceStatsUpdate) {
          maxUpdateMsSinceStatsUpdate = timeFrame.updateMs;
        }

        simTicksSinceStatsUpdate += timeFrame.ticks;
      }

      world.interpolation = timeFrame.interpolation;
    } else {
      PS.time.accumulator = 0;
      world.interpolation = 0;
    }

    if (!world.isPaused || world.needsRender) {
      var drawStart = performance.now();
      drawWorld();
      world.needsRender = false;
      drawElapsed = performance.now() - drawStart;
      PS.time.recordRenderFrame(drawElapsed);
      drawMsSinceStatsUpdate += drawElapsed;
      measuredDrawFrames++;

      if (drawElapsed > maxDrawMsSinceStatsUpdate) {
        maxDrawMsSinceStatsUpdate = drawElapsed;
      }
    }

    var statsElapsed = now - statsTimer;

    if (statsElapsed >= 500) {
      world.fps = framesSinceStatsUpdate / (statsElapsed / 1000);
      world.tps = simTicksSinceStatsUpdate / (statsElapsed / 1000);
      world.updateMs = measuredUpdateFrames > 0 ? updateMsSinceStatsUpdate / measuredUpdateFrames : 0;
      world.drawMs = measuredDrawFrames > 0 ? drawMsSinceStatsUpdate / measuredDrawFrames : 0;
      world.maxUpdateMs = maxUpdateMsSinceStatsUpdate;
      world.maxDrawMs = maxDrawMsSinceStatsUpdate;

      framesSinceStatsUpdate = 0;
      simTicksSinceStatsUpdate = 0;
      updateMsSinceStatsUpdate = 0;
      drawMsSinceStatsUpdate = 0;
      measuredUpdateFrames = 0;
      measuredDrawFrames = 0;
      maxUpdateMsSinceStatsUpdate = 0;
      maxDrawMsSinceStatsUpdate = 0;
      statsTimer = now;
    }

    if (now - hudTimer >= CONFIG.HUD_UPDATE_INTERVAL_MS) {
      var hudStart = performance.now();
      updateHud();
      hudElapsed = performance.now() - hudStart;
      hudTimer = now;
    }

    totalElapsed = performance.now() - frameStart;
    overheadElapsed = Math.max(
      0,
      totalElapsed -
        (timeFrame ? Number(timeFrame.updateMs) || 0 : 0) -
        drawElapsed
    );

    if (PS.debug && PS.debug.performance && typeof PS.debug.performance.recordFrame === "function") {
      PS.debug.performance.recordFrame({
        simMs: timeFrame ? timeFrame.updateMs : 0,
        renderMs: drawElapsed,
        overheadMs: Math.max(overheadElapsed, hudElapsed),
        totalMs: totalElapsed,
        ticks: timeFrame ? timeFrame.ticks : 0,
        droppedMs: timeFrame ? timeFrame.droppedMs : 0,
        droppedTicks: timeFrame && timeFrame.droppedMs > 0 && PS.time && PS.time.catchUpStats
          ? PS.time.catchUpStats.lastDroppedTicks
          : 0
      });
    }

    requestAnimationFrame(gameLoop);
  } catch (error) {
    reportRuntimeError(error);
  }
}

function startGame() {
  updateLoadingScreen({ total: 0, loaded: 0, failed: 0, percent: 0 }, "Loading...");

  return PS.gpu.initialize().then(function () {
    return loadStartupAssets();
  }).then(function () {
    return loadStartupData();
  }).then(function () {
    return loadStartupShaders();
  }).then(function () {
    try {
      setupControls();
      seedWorld();
      PS.time.reset();
      drawWorld();
      updateHud();
      syncControlStates();
      hideLoadingScreen();

      if (!gameLoopStarted) {
        gameLoopStarted = true;
        requestAnimationFrame(gameLoop);
      }
    } catch (error) {
      hideLoadingScreen();
      reportRuntimeError(error);
    }
  }).catch(function (error) {
    hideLoadingScreen();
    reportRuntimeError(error);
  });
}

window.startGame = startGame;
