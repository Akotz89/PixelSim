require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const loaderSource = fs.readFileSync(path.join(root, "js/assets/loader.js"), "utf8");

function normalizeProgress(progress) {
  return {
    total: progress.total,
    loaded: progress.loaded,
    failed: progress.failed,
    percent: progress.percent
  };
}

function normalizeJSON(value) {
  return JSON.parse(JSON.stringify(value));
}

function createContext(options) {
  const settings = options || {};
  const fetchCalls = [];
  const xhrCalls = [];
  const scriptLoads = [];
  const imageLoads = [];
  const runtimeErrors = [];

  function TestImage() {
    this.onload = null;
    this.onerror = null;
  }

  Object.defineProperty(TestImage.prototype, "src", {
    set: function(url) {
      this._src = url;
      imageLoads.push(url);

      if (settings.failedImages && settings.failedImages[url]) {
        this.onerror({ error: new Error("missing image") });
        return;
      }

      this.onload();
    },
    get: function() {
      return this._src;
    }
  });

  const context = {
    PS: {
      assets: {},
      runtime: {
        recordError: function(kind, payload) {
          runtimeErrors.push({ kind: kind, payload: payload });
        }
      }
    },
    Map: Map,
    Promise: Promise,
    Error: Error,
    Image: TestImage,
    window: {
      location: {
        protocol: settings.protocol || "http:"
      }
    },
    fetch: function(url) {
      fetchCalls.push(url);

      if (settings.fetchRejects && settings.fetchRejects[url]) {
        return Promise.reject(new Error("Failed to fetch"));
      }

      if (settings.failedJSON && settings.failedJSON[url]) {
        return Promise.resolve({
          ok: false,
          status: 404
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: function() {
          return Promise.resolve(settings.json && settings.json[url] ? settings.json[url] : { url: url, ok: true });
        },
        text: function() {
          return Promise.resolve(settings.text && settings.text[url] ? settings.text[url] : "text:" + url);
        }
      });
    },
    XMLHttpRequest: function() {
      this.status = 0;
      this.responseText = "";
      this.open = function(method, url) {
        this.url = url;
        xhrCalls.push(url);
      };
      this.overrideMimeType = function() {};
      this.send = function() {
        if (settings.failedXHR && settings.failedXHR[this.url]) {
          this.onerror();
          return;
        }

        if (settings.xhrJSON && settings.xhrJSON[this.url]) {
          this.responseText = JSON.stringify(settings.xhrJSON[this.url]);
        } else {
          this.responseText = JSON.stringify({ url: this.url, ok: true });
        }

        this.onload();
      };
    },
    document: {
      createElement: function(tagName) {
        assert.strictEqual(tagName, "script", "JSON sidecar fallback should create a script tag");
        return {};
      },
      head: {
        appendChild: function(script) {
          scriptLoads.push(script.src);

          if (settings.scriptJSON && settings.scriptJSON[script.src]) {
            context.PS.assets.registerJSON(script.src.replace(/\.js$/, ""), settings.scriptJSON[script.src]);
            script.onload();
            return script;
          }

          if (settings.scriptText && settings.scriptText[script.src]) {
            context.PS.assets.registerText(script.src.replace(/\.js$/, ""), settings.scriptText[script.src]);
            script.onload();
            return script;
          }

          script.onerror();
          return script;
        }
      }
    },
    fetchCalls: fetchCalls,
    xhrCalls: xhrCalls,
    scriptLoads: scriptLoads,
    imageLoads: imageLoads,
    runtimeErrors: runtimeErrors
  };

  vm.createContext(context);
  vm.runInContext(loaderSource, context, { filename: "js/assets/loader.js" });
  return context;
}

async function testImageAndJSONCache() {
  const context = createContext({
    json: {
      "data/config.json": { name: "fixture", ok: true }
    }
  });
  const loader = new context.PS.assets.AssetLoader();
  const progressEvents = [];

  loader.onProgress = function(progress) {
    progressEvents.push(progress);
  };

  const image = await loader.loadImage("assets/test.png");
  const imageAgain = await loader.loadImage("assets/test.png");
  const data = await loader.loadJSON("data/config.json");
  const dataAgain = await loader.loadJSON("data/config.json");

  assert.ok(image instanceof context.Image, "loadImage should return an HTMLImageElement-compatible Image");
  assert.strictEqual(imageAgain, image, "second image load should return cached result");
  assert.deepStrictEqual(data, { name: "fixture", ok: true }, "loadJSON should return parsed data");
  assert.strictEqual(dataAgain, data, "second JSON load should return cached result");
  assert.deepStrictEqual(context.imageLoads, ["assets/test.png"], "image should be loaded only once");
  assert.deepStrictEqual(context.fetchCalls, ["data/config.json"], "JSON should be fetched only once");
  assert.ok(progressEvents.length >= 4, "progress callback should fire for start and completion");
  assert.deepStrictEqual(
    normalizeProgress(progressEvents[progressEvents.length - 1]),
    { total: 2, loaded: 2, failed: 0, percent: 100 },
    "final progress should include total, loaded, failed, and percent"
  );
}

async function testFailedLoadReports() {
  const context = createContext({
    failedImages: {
      "assets/missing.png": true
    }
  });
  const loader = context.PS.assets.createLoader();
  const progressEvents = [];

  loader.onProgress = function(progress) {
    progressEvents.push(progress);
  };

  await assert.rejects(
    loader.loadImage("assets/missing.png"),
    /missing image/,
    "failed image load should reject for caller handling"
  );

  assert.strictEqual(loader.getProgress().failed, 1, "failed load should increment failed progress");
  assert.strictEqual(context.runtimeErrors[0].kind, "asset.load.error", "failed load should record runtime error");
  assert.deepStrictEqual(
    normalizeProgress(progressEvents[progressEvents.length - 1]),
    { total: 1, loaded: 0, failed: 1, percent: 0 },
    "failed progress should be reported without crashing the loader process"
  );
}

async function testFileJSONFallback() {
  const context = createContext({
    protocol: "file:",
    scriptJSON: {
      "data/config.json.js": { fileFallback: true }
    }
  });
  const loader = new context.PS.assets.AssetLoader();
  const data = await loader.loadJSON("data/config.json");

  assert.deepStrictEqual(normalizeJSON(data), { fileFallback: true }, "file protocol JSON should load through sidecar fallback");
  assert.deepStrictEqual(context.fetchCalls, [], "file JSON should avoid unsupported fetch probes");
  assert.deepStrictEqual(context.xhrCalls, [], "file JSON should avoid unsupported XHR probes");
  assert.deepStrictEqual(context.scriptLoads, ["data/config.json.js"], "file JSON should load the URL sidecar directly");
  assert.strictEqual(loader.getProgress().loaded, 1, "fallback JSON success should count as loaded");
  assert.strictEqual(loader.getProgress().failed, 0, "fallback JSON success should not count as failed");
}

async function testFileJSONSidecarFallback() {
  const context = createContext({
    protocol: "file:",
    scriptJSON: {
      "data/config.json.js": { sidecar: true }
    }
  });
  const loader = new context.PS.assets.AssetLoader();
  const data = await loader.loadJSON("data/config.json");

  assert.deepStrictEqual(normalizeJSON(data), { sidecar: true }, "file protocol JSON should support a script sidecar fallback");
  assert.deepStrictEqual(context.fetchCalls, [], "file sidecar JSON should not probe fetch");
  assert.deepStrictEqual(context.xhrCalls, [], "file sidecar JSON should not probe XHR");
  assert.deepStrictEqual(context.scriptLoads, ["data/config.json.js"], "file JSON should load the URL sidecar");
  assert.strictEqual(loader.getProgress().loaded, 1, "sidecar JSON success should count as loaded");
  assert.strictEqual(loader.getProgress().failed, 0, "sidecar JSON success should not count as failed");
}

async function testTextSidecarFallbackAfterFetchFailure() {
  const context = createContext({
    fetchRejects: {
      "shaders/runtime.vert": true
    },
    failedXHR: {
      "shaders/runtime.vert": true
    },
    scriptText: {
      "shaders/runtime.vert.js": "#version 300 es\nvoid main() {}\n"
    }
  });
  const loader = new context.PS.assets.AssetLoader();
  const text = await loader.loadText("shaders/runtime.vert");

  assert.ok(text.indexOf("#version 300 es") >= 0, "shader text should fall back to the registered sidecar");
  assert.deepStrictEqual(context.fetchCalls, ["shaders/runtime.vert"], "text loading should try the raw shader first on http");
  assert.deepStrictEqual(context.xhrCalls, ["shaders/runtime.vert"], "text loading should try XHR before the script sidecar");
  assert.deepStrictEqual(context.scriptLoads, ["shaders/runtime.vert.js"], "text loading should use the shader sidecar after raw text failures");
  assert.strictEqual(loader.getProgress().loaded, 1, "sidecar text success should count as loaded");
  assert.strictEqual(loader.getProgress().failed, 0, "sidecar text success should not count as failed");
}

async function testManifestLoading() {
  const context = createContext({
    json: {
      "data/assets.json": {
        terrain: [
          { sheet: "assets/test.png", meta: "data/config.json" },
          { sheet: "assets/second.png" }
        ]
      },
      "data/config.json": { ok: true }
    },
    failedImages: {
      "assets/second.png": true
    }
  });
  const loader = new context.PS.assets.AssetLoader();
  const manifest = await loader.loadManifest("data/assets.json");

  assert.ok(manifest.terrain, "loadManifest should return parsed manifest");
  assert.deepStrictEqual(context.fetchCalls, ["data/assets.json", "data/config.json"], "manifest should load referenced JSON metadata");
  assert.deepStrictEqual(context.imageLoads, ["assets/test.png", "assets/second.png"], "manifest should attempt all image loads");
  assert.strictEqual(loader.getProgress().failed, 1, "manifest should report failed child loads");
}

async function testSpriteSheetUsesPixelDataFallbackForFileProtocol() {
  const context = createContext({
    protocol: "file:",
    failedImages: {
      "assets/terrain/grass.png": true
    },
    scriptJSON: {
      "assets/manifest.json.js": {
        sheets: {
          terrain_grass: {
            path: "assets/terrain/grass.png",
            meta: "assets/terrain/grass.json",
            pixelData: "assets/terrain/grass.rgba.json"
          }
        }
      },
      "assets/terrain/grass.json.js": {
        type: "grid",
        tileWidth: 32,
        tileHeight: 32,
        columns: 1,
        rows: 1,
        names: ["terrain.grass.0"]
      },
      "assets/terrain/grass.rgba.json.js": {
        type: "rgba-base64",
        width: 32,
        height: 32,
        byteLength: 4096,
        data: ""
      }
    }
  });
  const loader = new context.PS.assets.AssetLoader();

  context.PS.assets.SpriteSheet = {
    detect: function(image, meta) {
      assert.strictEqual(image.pixelDataBacked, true, "file protocol sheet should use a pixel-data-backed image proxy");
      assert.strictEqual(meta.names[0], "terrain.grass.0", "sheet metadata should still be loaded");
      return { detected: true };
    }
  };

  const manifest = await loader.loadManifest("assets/manifest.json");
  const loaded = context.PS.assets.loadedSheets.terrain_grass;

  assert.ok(manifest.sheets.terrain_grass, "sprite sheet manifest should load");
  assert.deepStrictEqual(context.imageLoads, [], "file protocol sheet with pixel data should not probe the raw PNG");
  assert.strictEqual(context.runtimeErrors.length, 0, "pixel-data-backed file sheet should not record image asset errors");
  assert.strictEqual(loaded.image.pixelDataBacked, true, "loaded sheet should expose the pixel-data image proxy");
  assert.strictEqual(loaded.pixelDataPath, "assets/terrain/grass.rgba.json", "loaded sheet should retain pixel-data provenance");
  assert.strictEqual(loader.getProgress().failed, 0, "pixel-data-backed sheet should not increment failed progress");
}

(async function() {
  await testImageAndJSONCache();
  await testFailedLoadReports();
  await testFileJSONFallback();
  await testFileJSONSidecarFallback();
  await testTextSidecarFallbackAfterFetchFailure();
  await testManifestLoading();
  await testSpriteSheetUsesPixelDataFallbackForFileProtocol();
  console.log("asset loader checks passed");
}()).catch(function(error) {
  console.error(error);
  process.exit(1);
});
