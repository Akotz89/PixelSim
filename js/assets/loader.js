import { PS } from "../core/namespace.js";

PS.assets = PS.assets || {};

PS.assets.AssetLoader = function () {
  this.cache = new Map();
  this.pending = new Map();
  this.progress = {
    total: 0,
    loaded: 0,
    failed: 0
  };
  this.onProgress = null;
};

PS.assets.AssetLoader.prototype.getProgress = function () {
  var total = this.progress.total;

  return {
    total: total,
    loaded: this.progress.loaded,
    failed: this.progress.failed,
    percent: total > 0 ? Math.round((this.progress.loaded / total) * 100) : 0
  };
};

PS.assets.AssetLoader.prototype._report = function () {
  if (typeof this.onProgress === "function") {
    this.onProgress(this.getProgress());
  }
};

PS.assets.AssetLoader.prototype._trackStart = function (url, promise) {
  this.pending.set(url, promise);
  this.progress.total += 1;
  this._report();
  return promise;
};

PS.assets.AssetLoader.prototype._trackSuccess = function (url, asset) {
  this.pending.delete(url);
  this.cache.set(url, asset);
  this.progress.loaded += 1;
  this._report();
  return asset;
};

PS.assets.AssetLoader.prototype._trackFailure = function (url, error) {
  this.pending.delete(url);
  this.progress.failed += 1;
  this._report();

  if (PS.runtime && typeof PS.runtime.recordError === "function") {
    PS.runtime.recordError("asset.load.error", {
      message: "Failed to load asset: " + url,
      source: url,
      error: error && error.message ? error.message : String(error)
    });
  }

  throw error;
};

PS.assets.AssetLoader.prototype._loadCached = function (url, loadSource) {
  var self = this;

  if (this.cache.has(url)) {
    return Promise.resolve(this.cache.get(url));
  }

  if (this.pending.has(url)) {
    return this.pending.get(url);
  }

  return this._trackStart(url, loadSource.call(this, url).then(function (asset) {
    return self._trackSuccess(url, asset);
  }).catch(function (error) {
    return self._trackFailure(url, error);
  }));
};

PS.assets.AssetLoader.prototype._loadImageElement = function (url) {
  return new Promise(function (resolve, reject) {
    var image = new Image();

    image.onload = function () {
      resolve(image);
    };
    image.onerror = function (event) {
      reject(event && event.error ? event.error : new Error("Failed to load image: " + url));
    };
    image.src = url;
  });
};

PS.assets.AssetLoader.prototype._loadImageSource = function (url) {
  return this._loadImageElement(url);
};

PS.assets.AssetLoader.prototype.loadImage = function (url) {
  return this._loadCached(url, this._loadImageSource);
};

PS.assets.AssetLoader.prototype._loadJSONWithFetch = function (url) {
  var fetchFn = typeof fetch === "function" ? fetch : null;

  if (!fetchFn) {
    return this._loadJSONWithXHR(url);
  }

  return fetchFn(url).then(function (response) {
    if (!response.ok) {
      throw new Error("Failed to load " + url + ": " + response.status);
    }

    return response.json();
  });
};

PS.assets.AssetLoader.prototype._loadWithXHR = function (url, mimeType, parseResponse) {
  return new Promise(function (resolve, reject) {
    var request;

    if (typeof XMLHttpRequest !== "function") {
      reject(new Error("XMLHttpRequest is unavailable for " + url));
      return;
    }

    request = new XMLHttpRequest();
    request.open("GET", url, true);
    if (typeof request.overrideMimeType === "function") {
      request.overrideMimeType(mimeType);
    }
    request.onload = function () {
      if (request.status !== 0 && (request.status < 200 || request.status >= 300)) {
        reject(new Error("Failed to load " + url + ": " + request.status));
        return;
      }

      try {
        resolve(parseResponse(request.responseText));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = function () {
      reject(new Error("Failed to load " + url));
    };
    request.send();
  });
};

PS.assets.jsonData = PS.assets.jsonData || {};
PS.assets.textData = PS.assets.textData || {};

PS.assets.registerJSON = function (url, data) {
  PS.assets.jsonData[url] = data;
  return data;
};

PS.assets.registerText = function (url, text) {
  PS.assets.textData[url] = String(text || "");
  return PS.assets.textData[url];
};

PS.assets.AssetLoader.prototype._loadJSONWithXHR = function (url) {
  return this._loadWithXHR(url, "application/json", function (responseText) {
    return JSON.parse(responseText);
  });
};

PS.assets.AssetLoader.prototype._loadRegisteredSidecar = function (url, registryName, label) {
  return new Promise(function (resolve, reject) {
    var script;
    var registry = PS.assets[registryName] || {};

    if (Object.prototype.hasOwnProperty.call(registry, url)) {
      resolve(registry[url]);
      return;
    }

    if (typeof document === "undefined" || !document.head) {
      reject(new Error("Script " + label + " fallback is unavailable for " + url));
      return;
    }

    script = document.createElement("script");
    script.src = url + ".js";
    script.async = false;
    script.onload = function () {
      registry = PS.assets[registryName] || {};
      if (Object.prototype.hasOwnProperty.call(registry, url)) {
        resolve(registry[url]);
        return;
      }

      reject(new Error(label + " sidecar did not register " + url));
    };
    script.onerror = function () {
      reject(new Error("Failed to load " + script.src));
    };
    document.head.appendChild(script);
  });
};

PS.assets.AssetLoader.prototype._loadJSONWithScriptFallback = function (url) {
  return this._loadRegisteredSidecar(url, "jsonData", "JSON");
};

PS.assets.AssetLoader.prototype._loadJSONSource = function (url) {
  var self = this;

  if (PS.assets.jsonData && Object.prototype.hasOwnProperty.call(PS.assets.jsonData, url)) {
    return Promise.resolve(PS.assets.jsonData[url]);
  }

  if (typeof window !== "undefined" && window.location && window.location.protocol === "file:") {
    return this._loadJSONWithScriptFallback(url);
  }

  if (typeof fetch !== "function") {
    return this._loadJSONWithXHR(url).catch(function () {
      return self._loadJSONWithScriptFallback(url);
    });
  }

  return this._loadJSONWithFetch(url).catch(function (error) {
    if (typeof XMLHttpRequest === "function") {
      return self._loadJSONWithXHR(url).catch(function () {
        return self._loadJSONWithScriptFallback(url);
      });
    }

    return self._loadJSONWithScriptFallback(url);
  });
};

PS.assets.AssetLoader.prototype.loadJSON = function (url) {
  return this._loadCached(url, this._loadJSONSource);
};

PS.assets.AssetLoader.prototype._loadTextWithFetch = function (url) {
  var fetchFn = typeof fetch === "function" ? fetch : null;

  if (!fetchFn) {
    return this._loadTextWithXHR(url);
  }

  return fetchFn(url).then(function (response) {
    if (!response.ok) {
      throw new Error("Failed to load " + url + ": " + response.status);
    }

    return response.text();
  });
};

PS.assets.AssetLoader.prototype._loadTextWithXHR = function (url) {
  return this._loadWithXHR(url, "text/plain", function (responseText) {
    return responseText;
  });
};

PS.assets.AssetLoader.prototype._loadTextWithScriptFallback = function (url) {
  return this._loadRegisteredSidecar(url, "textData", "Text");
};

PS.assets.AssetLoader.prototype._loadTextSource = function (url) {
  var self = this;

  if (PS.assets.textData && Object.prototype.hasOwnProperty.call(PS.assets.textData, url)) {
    return Promise.resolve(PS.assets.textData[url]);
  }

  if (typeof window !== "undefined" && window.location && window.location.protocol === "file:") {
    return this._loadTextWithScriptFallback(url);
  }

  if (typeof fetch !== "function") {
    return this._loadTextWithXHR(url).catch(function () {
      return self._loadTextWithScriptFallback(url);
    });
  }

  return this._loadTextWithFetch(url).catch(function (error) {
    if (typeof XMLHttpRequest === "function") {
      return self._loadTextWithXHR(url).catch(function () {
        return self._loadTextWithScriptFallback(url);
      });
    }

    return self._loadTextWithScriptFallback(url);
  });
};

PS.assets.AssetLoader.prototype.loadText = function (url) {
  return this._loadCached(url, this._loadTextSource);
};

PS.assets.AssetLoader.prototype.loadManifest = function (url) {
  var self = this;

  return this.loadJSON(url).then(function (manifest) {
    if (manifest && manifest.sheets) {
      return self.loadSpriteSheetManifest(manifest);
    }

    var loads = [];

    Object.keys(manifest || {}).forEach(function (categoryId) {
      var category = manifest[categoryId];

      if (!Array.isArray(category)) {
        return;
      }

      category.forEach(function (entry) {
        if (!entry) {
          return;
        }

        if (entry.sheet) {
          loads.push(self.loadImage(entry.sheet));
        }

        if (entry.meta) {
          loads.push(self.loadJSON(entry.meta));
        }
      });
    });

    return Promise.allSettled(loads).then(function () {
      return manifest;
    });
  });
};

PS.assets.AssetLoader.prototype.createPixelDataImage = function (url, pixelData) {
  var source = pixelData || {};
  var width = Math.max(1, Math.round(Number(source.width) || 1));
  var height = Math.max(1, Math.round(Number(source.height) || 1));

  return {
    src: String(url || ""),
    width: width,
    height: height,
    naturalWidth: width,
    naturalHeight: height,
    pixelDataBacked: true
  };
};

PS.assets.AssetLoader.prototype.loadSpriteSheetImage = function (url, pixelData) {
  var self = this;

  if (!url) {
    return Promise.resolve(this.createPixelDataImage("", pixelData));
  }

  if (this.cache.has(url)) {
    return Promise.resolve(this.cache.get(url));
  }

  if (pixelData && typeof window !== "undefined" && window.location && window.location.protocol === "file:") {
    return Promise.resolve(this.createPixelDataImage(url, pixelData));
  }

  if (!pixelData) {
    return this.loadImage(url);
  }

  return this._loadImageSource(url).then(function (image) {
    self.cache.set(url, image);
    return image;
  }).catch(function () {
    var image = self.createPixelDataImage(url, pixelData);

    self.cache.set(url, image);
    return image;
  });
};

PS.assets.AssetLoader.prototype.createSpriteSheetMeta = function (sheet) {
  var names = [];
  var tileWidth = Number(sheet.tileSize) || 0;
  var tileHeight = Number(sheet.tileSize) || 0;
  var sprites = sheet.sprites || [];
  var maxX = 0;
  var maxY = 0;

  sprites.forEach(function (sprite) {
    var rect = sprite.rect || [0, 0, tileWidth, tileHeight];
    names.push(sprite.id);
    maxX = Math.max(maxX, Number(rect[0]) + Number(rect[2]));
    maxY = Math.max(maxY, Number(rect[1]) + Number(rect[3]));
    tileWidth = tileWidth || Number(rect[2]);
    tileHeight = tileHeight || Number(rect[3]);
  });

  return {
    type: "grid",
    tileWidth: tileWidth,
    tileHeight: tileHeight,
    columns: tileWidth > 0 ? Math.max(1, Math.ceil(maxX / tileWidth)) : sprites.length,
    rows: tileHeight > 0 ? Math.max(1, Math.ceil(maxY / tileHeight)) : 1,
    names: names
  };
};

PS.assets.AssetLoader.prototype.installTileSheetAtlas = function (tileSheetId, atlas) {
  var built;

  atlas.id = tileSheetId;

  if (PS.assets.tileSheets && PS.assets.tileSheets[tileSheetId]) {
    built = PS.assets.tileSheets[tileSheetId].reload(atlas);
  } else {
    built = new PS.assets.TileSheet(atlas);
  }

  return built;
};

PS.assets.AssetLoader.prototype.buildTileSheetAtlasFromSources = function (tileSheetId, definition, loadedSheets) {
  var sourceIds = definition.sourceSheets || definition.sheetIds || [];
  var sources = [];
  var atlas;

  sourceIds.forEach(function (sheetId) {
    var loaded = loadedSheets[sheetId];

    if (loaded && loaded.sheet) {
      sources.push({
        id: loaded.id || sheetId,
        sheet: loaded.sheet,
        pixelData: loaded.pixelData
      });
    }
  });

  if (sources.length === 0) {
    return null;
  }

  atlas = PS.assets.TileSheetPacker.pack(sources, {
    pageWidth: definition.pageWidth || 1024,
    pageHeight: definition.pageHeight || 1024
  });

  return this.installTileSheetAtlas(tileSheetId, atlas);
};

PS.assets.AssetLoader.prototype.loadTileSheetAtlas = function (tileSheetId, definition, loadedSheets) {
  var self = this;

  if (!definition.manifest) {
    return Promise.resolve(this.buildTileSheetAtlasFromSources(tileSheetId, definition, loadedSheets));
  }

  return this.loadJSON(definition.manifest).then(function (atlasManifest) {
    var pageDefinitions = atlasManifest.pages || [];

    return Promise.all(pageDefinitions.map(function (pageDefinition) {
      return (pageDefinition.pixelData ? self.loadJSON(pageDefinition.pixelData).catch(function () { return null; }) : Promise.resolve(null)).then(function (pixelData) {
        return self.loadSpriteSheetImage(pageDefinition.path, pixelData).then(function (image) {
          return {
            pageIndex: pageDefinition.pageIndex,
            width: pageDefinition.width,
            height: pageDefinition.height,
            image: image,
            pixelData: pixelData,
            path: pageDefinition.path || "",
            filter: pageDefinition.filter || atlasManifest.filter || "nearest",
            version: pageDefinition.version || 1
          };
        });
      });
    })).then(function (pages) {
      return self.installTileSheetAtlas(
        tileSheetId,
        PS.assets.TileSheetPacker.fromManifest(atlasManifest, pages)
      );
    });
  }).catch(function () {
    return self.buildTileSheetAtlasFromSources(tileSheetId, definition, loadedSheets);
  });
};

PS.assets.AssetLoader.prototype.buildTileSheetAtlases = function (manifest, loadedSheets) {
  var self = this;
  var tileSheets = manifest.tileSheets || {};
  var tileSheetIds = Object.keys(tileSheets);
  var built = {};

  if (!PS.assets.TileSheet || !PS.assets.TileSheetPacker) {
    return Promise.resolve(built);
  }

  return Promise.allSettled(tileSheetIds.map(function (tileSheetId) {
    var definition = tileSheets[tileSheetId] || {};

    return self.loadTileSheetAtlas(tileSheetId, definition, loadedSheets).then(function (tileSheet) {
      if (tileSheet) {
        built[tileSheetId] = tileSheet;
      }
      return tileSheet;
    });
  })).then(function () {
    PS.assets.tileSheets = built;
    if (tileSheetIds.length > 0) {
      PS.assets.TILE_SHEET = built[manifest.defaultTileSheet || tileSheetIds[0]] || null;
    }

    return built;
  });
};

PS.assets.AssetLoader.prototype.loadSpriteSheetManifest = function (manifest) {
  var self = this;
  var loaded = {};
  var sheetIds = Object.keys(manifest.sheets || {});

  PS.assets.manifest = manifest;
  PS.assets.loadedSheets = loaded;

  return Promise.allSettled(sheetIds.map(function (sheetId) {
    var sheet = manifest.sheets[sheetId];
    var loadedSheetId = sheet && sheet.id ? String(sheet.id) : String(sheetId);

    if (!sheet || !sheet.path) {
      return Promise.resolve(null);
    }

    var pixelDataUrl = sheet.pixelData || (
      String(sheet.path || "").indexOf("assets/pixeldarium-equivalence/") === 0
        ? String(sheet.path).replace(/\.png$/, ".rgba.json")
        : ""
    );

    return Promise.all([
      sheet.meta ? self.loadJSON(sheet.meta) : Promise.resolve(self.createSpriteSheetMeta(sheet)),
      pixelDataUrl ? self.loadJSON(pixelDataUrl).catch(function () { return null; }) : Promise.resolve(null)
    ]).then(function (parts) {
      var meta = parts[0];
      var pixelData = parts[1];

      return self.loadSpriteSheetImage(sheet.path, pixelData).then(function (image) {
        var spriteSheet = PS.assets.SpriteSheet && typeof PS.assets.SpriteSheet.detect === "function"
          ? PS.assets.SpriteSheet.detect(image, meta)
          : null;

        loaded[loadedSheetId] = {
          id: loadedSheetId,
          image: image,
          meta: meta,
          sheet: spriteSheet,
          path: sheet.path,
          splitAtlas: sheet.splitAtlas || null,
          pixelData: pixelData,
          pixelDataPath: pixelData ? pixelDataUrl : "",
          animations: sheet.animations || {},
          sprites: sheet.sprites || []
        };

        return loaded[loadedSheetId];
      });
    });
  })).then(function () {
    return self.buildTileSheetAtlases(manifest, loaded).then(function () {
      return manifest;
    });
  });
};

PS.assets.createLoader = function () {
  return new PS.assets.AssetLoader();
};
