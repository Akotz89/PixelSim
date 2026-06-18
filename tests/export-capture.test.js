const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

function makeContext() {
  let clicked = false;
  const context = {
    console,
    PS: {
      gpu: {},
      ui: {
        bookmarks: {
          createFromCurrentContext(options) {
            context.bookmark = options;
            return options;
          }
        }
      },
      deepTime: {
        getCurrentYears() {
          return context.world.deepTimeYears;
        }
      }
    },
    world: {
      seedText: "PIXEL Test/Seed",
      era: "Microbial Bloom",
      tick: 42,
      deepTimeYears: 1200000,
      selectedTimelineEvent: null,
      trackedLineage: { speciesId: 13, lineageId: 7 },
      needsRender: false
    },
    canvas: {
      toBlob(callback, type) {
        context.toBlobType = type;
        callback(new context.Blob(["png"], { type: "image/png" }));
      },
      captureStream(fps) {
        context.captureFps = fps;
        return { id: "stream" };
      }
    },
    captureModeSelect: { value: "simulation" },
    captureBookmarkCheckbox: { checked: false },
    screenshotExportButton: null,
    recordingExportButton: null,
    persistenceStatus: null,
    bookmark: null,
    statusMessages: [],
    downloads: [],
    timers: [],
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    Boolean,
    Promise,
    Error,
    Blob,
    setTimeout(callback, delay) {
      context.timers.push(delay);
      context.timerCallback = callback;
      return 1;
    },
    clearTimeout() {
      context.timerCleared = true;
    },
    clamp(value, min, max) {
      return Math.max(min, Math.min(max, Number(value) || 0));
    },
    setElementText(element, text) {
      if (element) {
        element.textContent = text;
      }
    },
    setPersistenceStatus(message, isError) {
      context.statusMessages.push({ message, isError });
    },
    URL: {
      createObjectURL(blob) {
        context.createdBlob = blob;
        return "blob:test";
      },
      revokeObjectURL(url) {
        context.revokedUrl = url;
      }
    },
    document: {
      createElement(tag) {
        assert.strictEqual(tag, "a");
        return {
          href: "",
          download: "",
          click() {
            clicked = true;
            context.downloads.push(this.download);
          }
        };
      },
      body: {
        appendChild() {},
        removeChild() {}
      }
    },
    getClicked() {
      return clicked;
    }
  };

  context.window = context;
  context.MediaRecorder = function(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = "inactive";
    context.recorder = this;
  };
  context.MediaRecorder.isTypeSupported = function(type) {
    return type === "video/webm";
  };
  context.MediaRecorder.prototype.start = function() {
    this.state = "recording";
  };
  context.MediaRecorder.prototype.stop = function() {
    this.state = "inactive";
    this.ondataavailable({ data: new context.Blob(["webm"], { type: "video/webm" }) });
    this.onstop();
  };

  vm.createContext(context);
  vm.runInContext(read("js/ui/export-capture.js"), context, { filename: "js/ui/export-capture.js" });
  return context;
}

(async function run() {
  const context = makeContext();

  const filename = vm.runInContext("PS.ui.exportCapture.makeFilename('png', { includeHud: true })", context);
  assert.strictEqual(
    filename,
    "pixeldarium-pixel-test-seed-microbial-bloom-tick-42-y1200000-species-13-hud.png",
    "filename should include seed, epoch, tick, deep time, selection, and capture mode"
  );

  const beforeState = JSON.stringify(context.world);
  const screenshot = await vm.runInContext("PS.ui.exportCapture.captureScreenshot({ includeHud: true, bookmark: true })", context);
  assert.strictEqual(screenshot.filename, filename);
  assert.strictEqual(screenshot.mode, "hud");
  assert.strictEqual(context.toBlobType, "image/png");
  assert.strictEqual(context.getClicked(), true, "screenshot should use native download click");
  assert.strictEqual(context.bookmark.screenshotRef, filename, "screenshot should link capture ref into bookmark");
  assert.strictEqual(JSON.stringify(context.world), beforeState, "capture should not mutate simulation state");

  const unsupported = makeContext();
  unsupported.MediaRecorder = undefined;
  const unsupportedResult = await vm.runInContext("PS.ui.exportCapture.startRecording({ durationMs: 2000 })", unsupported);
  assert.strictEqual(unsupportedResult.reason, "unsupported", "missing MediaRecorder should be graceful");
  assert.ok(unsupported.statusMessages.some(function(entry) {
    return entry.isError && entry.message.indexOf("unsupported") >= 0;
  }), "unsupported recording should report user-facing status");

  const recorderContext = makeContext();
  const started = await vm.runInContext("PS.ui.exportCapture.startRecording({ durationMs: 50000, download: false })", recorderContext);
  assert.strictEqual(started.started, true);
  assert.strictEqual(started.durationMs, 8000, "recording duration should be bounded");
  assert.strictEqual(recorderContext.captureFps, 30);
  const stopped = await vm.runInContext("PS.ui.exportCapture.stopRecording()", recorderContext);
  assert.strictEqual(stopped.recorded, true);
  assert.strictEqual(stopped.filename.endsWith(".webm"), true);
  assert.strictEqual(vm.runInContext("PS.ui.exportCapture.getState().recording", recorderContext), false);

  console.log("export capture checks passed", JSON.stringify({
    filename,
    durationMs: started.durationMs
  }));
})().catch(function(error) {
  console.error(error);
  process.exit(1);
});
