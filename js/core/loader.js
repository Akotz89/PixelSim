"use strict";
(function () {
  var PS = window.PS || {};

  PS.core = PS.core || {};
  window.PS = PS;

  var core = PS.core;
  var state = {
    status: "idle",
    loaded: [],
    currentScript: null,
    failedScript: null,
    error: null
  };

  function recordFailure(scriptPath, error) {
    var message = "Failed to load script: " + scriptPath;
    var crash = new Error(message);

    crash.scriptPath = scriptPath;
    crash.cause = error;

    state.status = "failed";
    state.failedScript = scriptPath;
    state.error = message;

    if (PS.runtime && typeof PS.runtime.recordError === "function") {
      PS.runtime.recordError("load.error", {
        message: message,
        source: scriptPath,
        error: error && error.message ? error.message : String(error)
      });
    }

    if (typeof showDebugMessage === "function") {
      showDebugMessage("LOAD ERROR: " + message);
    }

    if (typeof PS.assert === "function") {
      try {
        PS.assert(false, message);
      } catch (assertError) {
        crash = assertError;
      }
    }

    throw crash;
  }

  function validateManifest(manifest) {
    if (!Array.isArray(manifest)) {
      throw new Error("PS.core.manifest must be an array before loader starts");
    }

    manifest.forEach(function (scriptPath, index) {
      if (typeof scriptPath !== "string" || scriptPath.length === 0) {
        throw new Error("PS.core.manifest[" + index + "] must be a script path");
      }
    });
  }

  function loadScript(scriptPath) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");

      script.src = scriptPath;
      script.async = false;
      script.onload = function () {
        resolve(scriptPath);
      };
      script.onerror = function (event) {
        reject(event && event.error ? event.error : new Error("Script load failed"));
      };

      document.head.appendChild(script);
    });
  }

  function loadManifest(manifest) {
    validateManifest(manifest);

    state.status = "loading";
    state.loaded = [];
    state.currentScript = null;
    state.failedScript = null;
    state.error = null;

    return manifest.reduce(function (chain, scriptPath) {
      return chain.then(function () {
        state.currentScript = scriptPath;

        return loadScript(scriptPath).then(function () {
          state.loaded.push(scriptPath);
        });
      });
    }, Promise.resolve()).then(function () {
      state.status = "complete";
      state.currentScript = null;

      return state;
    }).catch(function (error) {
      return recordFailure(state.currentScript || "unknown", error);
    });
  }

  core.loaderState = state;
  core.loadScript = loadScript;
  core.loadManifest = loadManifest;
  core.loaderPromise = loadManifest(core.manifest);
}());
