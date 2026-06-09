"use strict";
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
  var self = this;

  if (this.cache.has(url)) {
    return Promise.resolve(this.cache.get(url));
  }

  if (this.pending.has(url)) {
    return this.pending.get(url);
  }

  return this._trackStart(url, this._loadImageSource(url).then(function (image) {
    return self._trackSuccess(url, image);
  }).catch(function (error) {
    return self._trackFailure(url, error);
  }));
};

PS.assets.AssetLoader.prototype._loadJSONWithFetch = function (url) {
  return fetch(url).then(function (response) {
    if (!response.ok) {
      throw new Error("Failed to load " + url + ": " + response.status);
    }

    return response.json();
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
  return new Promise(function (resolve, reject) {
    var request;

    if (typeof XMLHttpRequest !== "function") {
      reject(new Error("XMLHttpRequest is unavailable for " + url));
      return;
    }

    request = new XMLHttpRequest();
    request.open("GET", url, true);
    if (typeof request.overrideMimeType === "function") {
      request.overrideMimeType("application/json");
    }
    request.onload = function () {
      if (request.status !== 0 && (request.status < 200 || request.status >= 300)) {
        reject(new Error("Failed to load " + url + ": " + request.status));
        return;
      }

      try {
        resolve(JSON.parse(request.responseText));
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

PS.assets.AssetLoader.prototype._loadJSONWithScriptFallback = function (url) {
  return new Promise(function (resolve, reject) {
    var script;

    if (PS.assets.jsonData && Object.prototype.hasOwnProperty.call(PS.assets.jsonData, url)) {
      resolve(PS.assets.jsonData[url]);
      return;
    }

    if (typeof document === "undefined" || !document.head) {
      reject(new Error("Script JSON fallback is unavailable for " + url));
      return;
    }

    script = document.createElement("script");
    script.src = url + ".js";
    script.async = false;
    script.onload = function () {
      if (PS.assets.jsonData && Object.prototype.hasOwnProperty.call(PS.assets.jsonData, url)) {
        resolve(PS.assets.jsonData[url]);
        return;
      }

      reject(new Error("JSON sidecar did not register " + url));
    };
    script.onerror = function () {
      reject(new Error("Failed to load " + script.src));
    };
    document.head.appendChild(script);
  });
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
  var self = this;

  if (this.cache.has(url)) {
    return Promise.resolve(this.cache.get(url));
  }

  if (this.pending.has(url)) {
    return this.pending.get(url);
  }

  return this._trackStart(url, this._loadJSONSource(url).then(function (data) {
    return self._trackSuccess(url, data);
  }).catch(function (error) {
    return self._trackFailure(url, error);
  }));
};

PS.assets.AssetLoader.prototype._loadTextWithFetch = function (url) {
  return fetch(url).then(function (response) {
    if (!response.ok) {
      throw new Error("Failed to load " + url + ": " + response.status);
    }

    return response.text();
  });
};

PS.assets.AssetLoader.prototype._loadTextWithXHR = function (url) {
  return new Promise(function (resolve, reject) {
    var request;

    if (typeof XMLHttpRequest !== "function") {
      reject(new Error("XMLHttpRequest is unavailable for " + url));
      return;
    }

    request = new XMLHttpRequest();
    request.open("GET", url, true);
    if (typeof request.overrideMimeType === "function") {
      request.overrideMimeType("text/plain");
    }
    request.onload = function () {
      if (request.status !== 0 && (request.status < 200 || request.status >= 300)) {
        reject(new Error("Failed to load " + url + ": " + request.status));
        return;
      }

      resolve(request.responseText);
    };
    request.onerror = function () {
      reject(new Error("Failed to load " + url));
    };
    request.send();
  });
};

PS.assets.AssetLoader.prototype._loadTextWithScriptFallback = function (url) {
  return new Promise(function (resolve, reject) {
    var script;

    if (PS.assets.textData && Object.prototype.hasOwnProperty.call(PS.assets.textData, url)) {
      resolve(PS.assets.textData[url]);
      return;
    }

    if (typeof document === "undefined" || !document.head) {
      reject(new Error("Script text fallback is unavailable for " + url));
      return;
    }

    script = document.createElement("script");
    script.src = url + ".js";
    script.async = false;
    script.onload = function () {
      if (PS.assets.textData && Object.prototype.hasOwnProperty.call(PS.assets.textData, url)) {
        resolve(PS.assets.textData[url]);
        return;
      }

      reject(new Error("Text sidecar did not register " + url));
    };
    script.onerror = function () {
      reject(new Error("Failed to load " + script.src));
    };
    document.head.appendChild(script);
  });
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
  var self = this;

  if (this.cache.has(url)) {
    return Promise.resolve(this.cache.get(url));
  }

  if (this.pending.has(url)) {
    return this.pending.get(url);
  }

  return this._trackStart(url, this._loadTextSource(url).then(function (text) {
    return self._trackSuccess(url, text);
  }).catch(function (error) {
    return self._trackFailure(url, error);
  }));
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
      self.loadImage(sheet.path),
      sheet.meta ? self.loadJSON(sheet.meta) : Promise.resolve(self.createSpriteSheetMeta(sheet)),
      pixelDataUrl ? self.loadJSON(pixelDataUrl).catch(function () { return null; }) : Promise.resolve(null)
    ]).then(function (parts) {
      var image = parts[0];
      var meta = parts[1];
      var pixelData = parts[2];
      var spriteSheet = PS.assets.SpriteSheet && typeof PS.assets.SpriteSheet.detect === "function"
        ? PS.assets.SpriteSheet.detect(image, meta)
        : null;

      loaded[loadedSheetId] = {
        id: loadedSheetId,
        image: image,
        meta: meta,
        sheet: spriteSheet,
        path: sheet.path,
        pixelData: pixelData,
        pixelDataPath: pixelData ? pixelDataUrl : "",
        animations: sheet.animations || {},
        sprites: sheet.sprites || []
      };

      return loaded[loadedSheetId];
    });
  })).then(function () {
    return manifest;
  });
};

PS.assets.createLoader = function () {
  return new PS.assets.AssetLoader();
};
