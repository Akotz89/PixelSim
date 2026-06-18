const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { chromium } = require("playwright");
const v8toIstanbul = require("v8-to-istanbul");
const istanbulCoverage = require("istanbul-lib-coverage");

const root = path.resolve(__dirname, "..");
const coverageDir = path.join(root, "coverage");
const coveragePath = path.join(coverageDir, "coverage-final.json");
const summaryPath = path.join(coverageDir, "browser-summary.json");
const host = "127.0.0.1";
const port = Number(process.env.PIXELDARIUM_COVERAGE_PORT || 3211);
const baseUrl = "http://" + host + ":" + port;
const webgpuLaunchArgs = [
  "--enable-unsafe-webgpu",
  "--enable-features=WebGPUDeveloperFeatures",
  "--enable-webgpu-developer-features",
  "--use-angle=d3d11",
  "--disable-dawn-features=use_dxc"
];

function wait(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

function startDevServer() {
  const child = spawn(
    "npm",
    ["run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"],
    {
      cwd: root,
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
    child,
    output,
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
        stopProcessTree(child, "SIGTERM");
        setTimeout(function() {
          if (child.exitCode === null) {
            stopProcessTree(child, "SIGKILL");
          }
          finish();
        }, 2000);
      });
    }
  };
}

function stopProcessTree(child, signal) {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }

    process.kill(-child.pid, signal);
  } catch (error) {
    try {
      child.kill(signal);
    } catch (innerError) {
      // The process may already have exited.
    }
  }
}

async function waitForServer(server) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 20000) {
    if (server.child.exitCode !== null) {
      throw new Error("Vite exited early:\n" + server.output.join(""));
    }

    try {
      const response = await fetch(baseUrl + "/assets/test.json");

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

function mapCoverageUrlToFile(url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch (error) {
    return null;
  }

  if (parsed.origin !== baseUrl) {
    return null;
  }

  const pathname = decodeURIComponent(parsed.pathname);

  if (!pathname.endsWith(".js")) {
    return null;
  }

  const relativePath = pathname.replace(/^\/+/, "").split("/").join(path.sep);
  const filePath = path.join(root, relativePath);

  return fs.existsSync(filePath) ? filePath : null;
}

async function addEntryToCoverageMap(coverageMap, entry) {
  const filePath = mapCoverageUrlToFile(entry.url);

  if (!filePath || !entry.source || !Array.isArray(entry.functions)) {
    return false;
  }

  const converter = v8toIstanbul(filePath, 0, { source: entry.source });
  await converter.load();
  converter.applyCoverage(entry.functions);
  coverageMap.merge(converter.toIstanbul());
  return true;
}

async function exerciseRuntime(page) {
  await page.goto(baseUrl + "/", { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(function() {
    return window.PS &&
      PS.core &&
      PS.core.loaderState &&
      PS.core.loaderState.status === "complete";
  }, null, { timeout: 15000 });
  await page.waitForFunction(function() {
    return window.PS &&
      PS.gpu &&
      (PS.gpu.status === "ready" || PS.gpu.status === "failed");
  }, null, { timeout: 15000 });

  let startup = await page.evaluate(function() {
    return {
      loaderStatus: PS.core.loaderState.status,
      manifestCount: PS.core.manifest.length,
      loadedCount: PS.core.loaderState.loaded.length,
      gpuStatus: PS.gpu.status,
      gpuError: PS.gpu.error || null,
      assetsLoaded: !!(PS.assets && PS.assets.startupStatus && PS.assets.startupStatus.loaded),
      dataLoaded: !!(PS.assets && PS.assets.startupDataStatus && PS.assets.startupDataStatus.loaded)
    };
  });

  let exerciseError = "";

  if (startup.gpuStatus === "ready") {
    await page.waitForFunction(function() {
      return window.PS &&
        PS.assets &&
        PS.assets.startupStatus &&
        PS.assets.startupStatus.loaded === true &&
        PS.assets.startupDataStatus &&
        PS.assets.startupDataStatus.loaded === true;
    }, null, { timeout: 15000 });
    startup = await page.evaluate(function() {
      return {
        loaderStatus: PS.core.loaderState.status,
        manifestCount: PS.core.manifest.length,
        loadedCount: PS.core.loaderState.loaded.length,
        gpuStatus: PS.gpu.status,
        gpuError: PS.gpu.error || null,
        assetsLoaded: !!(PS.assets && PS.assets.startupStatus && PS.assets.startupStatus.loaded),
        dataLoaded: !!(PS.assets && PS.assets.startupDataStatus && PS.assets.startupDataStatus.loaded)
      };
    });
    exerciseError = await page.evaluate(async function() {
      try {
        if (typeof setWorldSeed === "function") {
          setWorldSeed("PIXEL-COVERAGE-001");
        }
        if (typeof seedWorld === "function") {
          seedWorld();
        }
        if (PS.world) {
          PS.world.isPaused = true;
        }
        if (typeof drawWorld === "function") {
          drawWorld();
          await new Promise(function(resolve) {
            requestAnimationFrame(resolve);
          });
          drawWorld();
        }
      } catch (error) {
        return String(error && (error.stack || error.message) ? (error.stack || error.message) : error);
      }
      return "";
    });
  }

  return Object.assign({}, startup, { exerciseError });
}

async function run() {
  fs.rmSync(coverageDir, { recursive: true, force: true });
  fs.mkdirSync(coverageDir, { recursive: true });

  const server = startDevServer();
  let browser = null;

  try {
    await waitForServer(server);
    browser = await chromium.launch({
      headless: true,
      args: webgpuLaunchArgs,
      executablePath: process.env.PIXELDARIUM_CHROME_PATH || undefined
    });

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

    await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false });
    const startup = await exerciseRuntime(page);
    const entries = await page.coverage.stopJSCoverage();
    const coverageMap = istanbulCoverage.createCoverageMap({});
    let convertedEntries = 0;

    for (const entry of entries) {
      if (await addEntryToCoverageMap(coverageMap, entry)) {
        convertedEntries += 1;
      }
    }

    const files = coverageMap.files();

    if (files.length === 0) {
      throw new Error("Browser coverage did not include any local JavaScript modules");
    }

    fs.writeFileSync(coveragePath, JSON.stringify(coverageMap.toJSON(), null, 2) + "\n");
    fs.writeFileSync(summaryPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: baseUrl + "/",
      entries: entries.length,
      convertedEntries,
      files: files.length,
      startup,
      consoleErrors,
      pageErrors,
      coveragePath,
      note: "Use `npx fallow health --coverage coverage/coverage-final.json` to compute coverage-aware CRAP scores."
    }, null, 2) + "\n");

    console.log(JSON.stringify({
      coveragePath,
      summaryPath,
      files: files.length,
      convertedEntries,
      gpuStatus: startup.gpuStatus,
      assetsLoaded: startup.assetsLoaded,
      dataLoaded: startup.dataLoaded
    }, null, 2));
  } finally {
    if (browser) {
      await browser.close();
    }
    await server.stop();
  }
}

run().catch(function(error) {
  console.error(error && (error.stack || error.message) ? (error.stack || error.message) : error);
  process.exit(1);
});
