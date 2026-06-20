"use strict";
import { manifest } from "./manifest.js";
const globalScope = typeof window !== "undefined" ? window : globalThis;
export var PS = globalScope.PS || {};

PS.meta = PS.meta || {};
PS.meta.name = "Pixeldarium";
PS.meta.version = PS.meta.version || "0.1.0";

globalScope.PS = PS;

PS.core = PS.core || {};
PS.core.bootstrapScript = "js/core/namespace.js";
PS.core.manifestSource = "index.html";
PS.core.manifest = manifest;

PS.runtime = PS.runtime || {};
PS.runtime.errors = PS.runtime.errors || [];
PS.runtime.requiredFunctions = PS.runtime.requiredFunctions || [
  "PS.gpu.initialize",
  "PS.render.terrain.draw",
  "PS.render.pipeline.drawWorld",
  "PS.render.renderer.getActive",
  "PS.camera.getZoomLevel",
  "PS.persistence.save",
  "PS.time.runFrame",
  "PS.events.detectMilestones"
];

PS.runtime.resolvePath = function (pathName) {
  var parts = String(pathName || "").split(".");
  var cursor = parts[0] === "PS" ? PS : window[parts[0]];

  for (var i = 1; i < parts.length; i++) {
    if (!cursor) {
      return undefined;
    }

    cursor = cursor[parts[i]];
  }

  return cursor;
};

PS.runtime.verify = function (requiredFunctions) {
  var required = Array.isArray(requiredFunctions) ? requiredFunctions : PS.runtime.requiredFunctions;
  var missing = [];

  for (var i = 0; i < required.length; i++) {
    if (typeof PS.runtime.resolvePath(required[i]) !== "function") {
      missing.push(required[i]);
    }
  }

  var result = {
    ok: missing.length === 0,
    missing: missing
  };

  PS.runtime.lastVerification = result;

  if (!result.ok) {
    var message = "Missing runtime functions: " + missing.join(", ");

    if (PS.log && typeof PS.log === "function") {
      PS.log("runtime", "WARN", message, { missing: missing });
    }

    if (typeof PS.runtime.recordError === "function") {
      PS.runtime.recordError("runtime.verify.missing", {
        message: message,
        missing: missing
      });
    }
  }

  return result;
};

PS.runtime.recordError = function (kind, payload) {
  var entry = {
    kind: kind,
    payload: payload,
    time: new Date().toISOString()
  };

  PS.runtime.errors.push(entry);

  if (PS.runtime.errors.length > 50) {
    PS.runtime.errors.shift();
  }

  if (typeof showDebugMessage === "function") {
    showDebugMessage(kind + ": " + String(payload && payload.message ? payload.message : payload));
  }

  return entry;
};

window.addEventListener("error", function (event) {
  if (event.target && event.target !== window && event.target.src) {
    PS.runtime.recordError("load.error", {
      message: "Could not load " + event.target.src,
      source: event.target.src
    });
    return;
  }

  PS.runtime.recordError("runtime.error", {
    message: event.message,
    file: event.filename,
    line: event.lineno,
    column: event.colno
  });
}, true);

window.addEventListener("unhandledrejection", function (event) {
  PS.runtime.recordError("promise.error", {
    message: event.reason && event.reason.message ? event.reason.message : String(event.reason),
    reason: event.reason
  });
});
