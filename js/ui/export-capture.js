import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { world } from "../systems/state.js";
import { canvas, captureBookmarkCheckbox, captureModeSelect, persistenceStatus, recordingExportButton, screenshotExportButton } from "./dom-refs.js";
import { setElementText } from "./foundation.js";
import { setPersistenceStatus } from "./persistence-controls.js";

PS.ui = PS.ui || {};

PS.ui.exportCapture = (function() {
  var maxRecordingMs = 8000;
  var state = {
    recording: false,
    recorder: null,
    chunks: [],
    timer: null,
    stopPromise: null,
    stopResolve: null,
    lastCaptureRef: "",
    message: "CAPTURE: Ready"
  };

  function cleanSegment(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "none";
  }

  function getCanvas() {
    return PS.gpu && PS.gpu.canvas ? PS.gpu.canvas : (typeof canvas !== "undefined" ? canvas : null);
  }

  function getDeepTimeSegment() {
    var years = PS.deepTime && typeof PS.deepTime.getCurrentYears === "function"
      ? PS.deepTime.getCurrentYears()
      : world.deepTimeYears;

    return "y" + Math.max(0, Math.round(Number(years) || 0));
  }

  function getSelectionSegment() {
    var event = world.selectedTimelineEvent || null;
    var tracked = world.trackedLineage || null;

    if (event) {
      return "event-" + cleanSegment((event.type || "event") + "-" + (event.id || event.tick || world.tick));
    }

    if (tracked && Number(tracked.speciesId) > 0) {
      return "species-" + Math.max(1, Math.round(Number(tracked.speciesId) || 1));
    }

    if (tracked && Number(tracked.lineageId) > 0) {
      return "lineage-" + Math.max(1, Math.round(Number(tracked.lineageId) || 1));
    }

    return "camera";
  }

  function getMode(options) {
    return options && options.includeHud ? "hud" : "simulation";
  }

  function makeFilename(extension, options) {
    var parts = [
      "pixeldarium",
      cleanSegment(world.seedText || "seed"),
      cleanSegment(world.era || "epoch"),
      "tick-" + Math.max(0, Math.round(Number(world.tick) || 0)),
      getDeepTimeSegment(),
      getSelectionSegment(),
      getMode(options)
    ];

    return parts.join("-") + "." + cleanSegment(extension || "png");
  }

  function setStatus(message, isError) {
    state.message = message;

    if (typeof setPersistenceStatus === "function") {
      setPersistenceStatus(message, Boolean(isError));
      return;
    }

    if (persistenceStatus) {
      setElementText(persistenceStatus, message);
      persistenceStatus.className = isError ? "error" : "";
    }
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function linkBookmark(filename, options) {
    if (!options || !options.bookmark || !PS.ui.bookmarks || typeof PS.ui.bookmarks.createFromCurrentContext !== "function") {
      return null;
    }

    return PS.ui.bookmarks.createFromCurrentContext({
      label: "Capture " + filename.replace(/\.[^.]+$/, ""),
      note: options.includeHud
        ? "PNG capture from render surface with HUD context noted in filename."
        : "PNG capture from render surface.",
      screenshotRef: filename
    });
  }

  function captureScreenshot(options) {
    var captureOptions = options || {};
    var targetCanvas = getCanvas();
    var filename = captureOptions.filename || makeFilename("png", captureOptions);

    return new Promise(function(resolve, reject) {
      if (!targetCanvas || typeof targetCanvas.toBlob !== "function") {
        var missing = new Error("Screenshot export needs a capture-capable canvas.");
        setStatus("CAPTURE ERROR: " + missing.message, true);
        reject(missing);
        return;
      }

      targetCanvas.toBlob(function(blob) {
        if (!blob) {
          var failed = new Error("Browser did not return a PNG blob.");
          setStatus("CAPTURE ERROR: " + failed.message, true);
          reject(failed);
          return;
        }

        if (captureOptions.download !== false) {
          downloadBlob(blob, filename);
        }

        state.lastCaptureRef = filename;
        linkBookmark(filename, captureOptions);
        setStatus("CAPTURE: Saved " + filename, false);
        resolve({ filename: filename, blob: blob, mode: getMode(captureOptions) });
      }, "image/png");
    });
  }

  function getRecorderType() {
    if (typeof MediaRecorder === "undefined") {
      return "";
    }

    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
      return "video/webm;codecs=vp9";
    }

    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("video/webm")) {
      return "video/webm";
    }

    return "video/webm";
  }

  function stopRecording() {
    var stopPromise = state.stopPromise;

    if (!state.recording || !state.recorder) {
      return Promise.resolve({ recorded: false, reason: "not-recording" });
    }

    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    if (state.recorder.state !== "inactive" && typeof state.recorder.stop === "function") {
      state.recorder.stop();
    }

    return stopPromise || Promise.resolve({ recorded: false, reason: "missing-promise" });
  }

  function startRecording(options) {
    var captureOptions = options || {};
    var targetCanvas = getCanvas();
    var durationMs = clamp(Math.round(Number(captureOptions.durationMs) || maxRecordingMs), 1000, maxRecordingMs);
    var mimeType = getRecorderType();
    var stream;
    var recorder;
    var filename;

    if (state.recording) {
      return Promise.resolve({ started: false, reason: "already-recording" });
    }

    if (!targetCanvas || typeof targetCanvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      setStatus("CAPTURE: Recording unsupported in this browser", true);
      return Promise.resolve({ started: false, reason: "unsupported" });
    }

    stream = targetCanvas.captureStream(Math.max(1, Math.round(Number(captureOptions.fps) || 30)));
    filename = captureOptions.filename || makeFilename("webm", captureOptions);
    recorder = new MediaRecorder(stream, mimeType ? { mimeType: mimeType } : undefined);

    state.recording = true;
    state.recorder = recorder;
    state.chunks = [];
    state.stopPromise = new Promise(function(resolve) {
      state.stopResolve = resolve;
    });

    recorder.ondataavailable = function(event) {
      if (event.data && event.data.size > 0) {
        state.chunks.push(event.data);
      }
    };

    recorder.onstop = function() {
      var blob = new Blob(state.chunks, { type: mimeType || "video/webm" });
      state.recording = false;
      state.recorder = null;
      state.chunks = [];
      state.timer = null;
      state.lastCaptureRef = filename;

      if (captureOptions.download !== false) {
        downloadBlob(blob, filename);
      }

      setStatus("CAPTURE: Saved " + filename, false);

      if (state.stopResolve) {
        state.stopResolve({ recorded: true, filename: filename, blob: blob, durationMs: durationMs });
        state.stopResolve = null;
      }

      state.stopPromise = null;
      syncControls();
    };

    recorder.start();
    state.timer = setTimeout(stopRecording, durationMs);
    setStatus("CAPTURE: Recording " + Math.round(durationMs / 1000) + "s", false);
    syncControls();
    return Promise.resolve({ started: true, filename: filename, durationMs: durationMs });
  }

  function syncControls() {
    if (recordingExportButton) {
      setElementText(recordingExportButton, state.recording ? "Stop" : "Record");
      recordingExportButton.className = state.recording ? "sim-button danger" : "sim-button";
    }
  }

  function getOptionsFromControls() {
    return {
      includeHud: captureModeSelect ? captureModeSelect.value === "hud" : false,
      bookmark: captureBookmarkCheckbox ? captureBookmarkCheckbox.checked : false
    };
  }

  function setup() {
    if (screenshotExportButton) {
      screenshotExportButton.addEventListener("click", function() {
        captureScreenshot(getOptionsFromControls()).catch(function() {});
      });
    }

    if (recordingExportButton) {
      recordingExportButton.addEventListener("click", function() {
        if (state.recording) {
          stopRecording().then(syncControls);
        } else {
          startRecording(getOptionsFromControls()).then(syncControls);
        }
      });
    }

    syncControls();
  }

  return {
    setup: setup,
    captureScreenshot: captureScreenshot,
    startRecording: startRecording,
    stopRecording: stopRecording,
    makeFilename: makeFilename,
    getState: function() {
      return {
        recording: state.recording,
        lastCaptureRef: state.lastCaptureRef,
        message: state.message,
        maxRecordingMs: maxRecordingMs
      };
    }
  };
})();
