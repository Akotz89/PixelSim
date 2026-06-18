import { PS } from "../core/namespace.js";

export function registerWgslManifest(runtime) {
  var manifest = PS.render && PS.render.wgslShaderManifest;
  var found = false;

  if (!Array.isArray(manifest)) {
    PS.render.wgslShaderManifest = [];
    manifest = PS.render.wgslShaderManifest;
  }

  for (var i = 0; i < manifest.length; i += 1) {
    if (manifest[i] && manifest[i].name === runtime.shaderName) {
      found = true;
      break;
    }
  }

  if (!found) {
    manifest.push({
      name: runtime.shaderName,
      path: runtime.shaderPath
    });
  }

  return manifest;
}

export function loadWgslRuntimeAssets(runtime, loader, missingMessage) {
  var assetLoader = loader || (PS.assets && PS.assets.startupLoader) || (PS.assets && PS.assets.AssetLoader ? new PS.assets.AssetLoader() : null);
  var configPromise = assetLoader && typeof assetLoader.loadJSON === "function"
    ? assetLoader.loadJSON(runtime.configPath)
    : Promise.resolve(runtime.defaults);
  var shaderPromise;

  runtime.registerManifest();

  if (!PS.render || !PS.render.wgslShaders || typeof PS.render.wgslShaders.loadFromFile !== "function") {
    shaderPromise = Promise.reject(new Error(missingMessage));
  } else {
    shaderPromise = PS.render.wgslShaders.loadFromFile(runtime.shaderName, runtime.shaderPath, assetLoader);
  }

  return Promise.all([configPromise, shaderPromise]).then(function (results) {
    runtime.config = runtime.normalizeConfig(results[0]);
    return {
      config: runtime.config,
      shader: results[1]
    };
  });
}

export function mergeRuntimeConfig(runtime, config, arrayDefaults) {
  var source = config || {};
  var merged = {};
  var key;

  for (key in runtime.defaults) {
    if (Object.prototype.hasOwnProperty.call(runtime.defaults, key)) {
      merged[key] = runtime.defaults[key];
    }
  }

  for (key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      merged[key] = source[key];
    }
  }

  if (Array.isArray(arrayDefaults)) {
    for (var i = 0; i < arrayDefaults.length; i += 1) {
      key = arrayDefaults[i];
      merged[key] = Array.isArray(source[key]) && source[key].length > 0 ? source[key] : runtime.defaults[key];
    }
  }

  return merged;
}

export function getRuntimeDimensions(runtime, options) {
  var spec = options || {};
  var config = runtime.normalizeConfig(spec.config || runtime.config || {});

  return {
    width: Math.max(1, Math.round(Number(spec.width || config.width || runtime.defaults.width))),
    height: Math.max(1, Math.round(Number(spec.height || config.height || runtime.defaults.height)))
  };
}
