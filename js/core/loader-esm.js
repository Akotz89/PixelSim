"use strict";
import { PS } from "./namespace.js";

/**
 * ES Module Loader for Pixeldarium
 *
 * Replaces the old <script> tag injection loader with dynamic import().
 * Loads manifest files sequentially as ES modules.
 *
 * Each module file:
 * - Exports its public API via `export function/var/const`
 * - Imports cross-module APIs through real ES module imports
 *
 * This loader runs from a <script type="module"> entry point.
 */

const core = PS.core;
const manifest = core.manifest;

const state = {
  status: "idle",
  loaded: [],
  currentScript: null,
  failedScript: null,
  error: null,
  totalScripts: manifest.length,
  moduleExports: new Map(),
};

function updateLoadingProgress() {
  const fill = document.getElementById("loading-progress-fill");
  const text = document.getElementById("loading-progress-text");

  if (fill) {
    const pct = (state.loaded.length / state.totalScripts) * 100;
    fill.style.width = pct + "%";
  }

  if (text) {
    text.textContent = "Loading... " + state.loaded.length + "/" + state.totalScripts;
  }
}

function recordFailure(scriptPath, error) {
  const message = "Failed to load module: " + scriptPath;
  const crash = new Error(message);

  crash.scriptPath = scriptPath;
  crash.cause = error;

  state.status = "failed";
  state.failedScript = scriptPath;
  state.error = message;

  if (PS.runtime && typeof PS.runtime.recordError === "function") {
    PS.runtime.recordError("load.error", {
      message: message,
      source: scriptPath,
      error: error && error.message ? error.message : String(error),
    });
  }

  if (typeof globalThis.showDebugMessage === "function") {
    globalThis.showDebugMessage("LOAD ERROR: " + message);
  }

  console.error("[loader] " + message, error);
  throw crash;
}

function validateManifest(list) {
  if (!Array.isArray(list)) {
    throw new Error("PS.core.manifest must be an array before loader starts");
  }

  list.forEach(function (scriptPath, index) {
    if (typeof scriptPath !== "string" || scriptPath.length === 0) {
      throw new Error("PS.core.manifest[" + index + "] must be a script path");
    }
  });
}

/**
 * Load a single module via dynamic import().
 * Resolves the path relative to the document base URL.
 */
async function loadModule(scriptPath) {
  // Build the URL relative to the page
  const base = document.baseURI || window.location.href;
  const url = new URL(scriptPath, base).href;

  try {
    const mod = await import(/* @vite-ignore */ url);
    return mod;
  } catch (err) {
    // If dynamic import fails, fall back to <script type="module"> tag
    console.warn("[loader] import() failed for " + scriptPath + ", falling back to script tag:", err.message);
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");

      script.type = "module";
      script.src = scriptPath;
      script.async = false;
      script.onload = function () {
        resolve({});
      };
      script.onerror = function (event) {
        reject(event && event.error ? event.error : new Error("Script load failed: " + scriptPath));
      };

      document.head.appendChild(script);
    });
  }
}

/**
 * Load all manifest files sequentially.
 * Sequential loading preserves the dependency order.
 */
async function loadManifest(list) {
  validateManifest(list);

  state.status = "loading";
  state.loaded = [];
  state.currentScript = null;
  state.failedScript = null;
  state.error = null;

  for (const scriptPath of list) {
    state.currentScript = scriptPath;

    try {
      const mod = await loadModule(scriptPath);
      state.moduleExports.set(scriptPath, mod);
      state.loaded.push(scriptPath);
      updateLoadingProgress();
    } catch (err) {
      recordFailure(scriptPath, err);
    }
  }

  state.status = "complete";
  state.currentScript = null;

  return state;
}

// Expose on PS namespace
core.loaderState = state;
core.loadModule = loadModule;
core.loadManifest = loadManifest;

// Start loading
core.loaderPromise = loadManifest(manifest);
