const { assert, vm, read } = require("./helpers/world-context.js");

function makeCanvas(width, height, rectWidth, rectHeight) {
  return {
    width,
    height,
    rectWidth,
    rectHeight,
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        width: this.rectWidth,
        height: this.rectHeight
      };
    }
  };
}

function makeContext() {
  const timers = [];
  const resizeObservers = [];
  const mediaQueries = [];
  const resizeListeners = [];
  const canvas = makeCanvas(100, 50, 100, 50);
  const device = {
    limits: { maxTextureDimension2D: 4096 },
    queue: { submit() {} },
    createCommandEncoder() {
      return {
        beginRenderPass() {
          return { end() {} };
        },
        finish() {
          return {};
        }
      };
    }
  };
  const context = {
    configured: [],
    configure(descriptor) {
      this.configured.push(descriptor);
    },
    getCurrentTexture() {
      return {
        createView() {
          return {};
        }
      };
    }
  };
  const sandbox = {
    assert,
    console,
    canvas,
    devicePixelRatio: 1,
    WORLD_HEIGHT: 180,
    WORLD_WIDTH: 360,
    performance: {
      now() {
        return 1;
      }
    },
    clearTimeout(id) {
      if (id && timers[id - 1]) {
        timers[id - 1].cleared = true;
      }
    },
    setTimeout(fn, ms) {
      timers.push({ fn, ms, cleared: false });
      return timers.length;
    },
    ResizeObserver: function FakeResizeObserver(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      resizeObservers.push(this);
    },
    window: {
      addEventListener(name, handler) {
        resizeListeners.push({ name, handler });
      },
      removeEventListener(name, handler) {
        for (let i = resizeListeners.length - 1; i >= 0; i -= 1) {
          if (resizeListeners[i].name === name && resizeListeners[i].handler === handler) {
            resizeListeners.splice(i, 1);
            return;
          }
        }
      }
    },
    globalThis: {
      devicePixelRatio: 1,
      matchMedia(query) {
        const mediaQuery = {
          query,
          listeners: [],
          removed: [],
          addEventListener(name, handler) {
            this.listeners.push({ name, handler });
          },
          removeEventListener(name, handler) {
            this.removed.push({ name, handler });
            this.listeners = this.listeners.filter(function (entry) {
              return entry.name !== name || entry.handler !== handler;
            });
          },
          dispatch(name) {
            this.listeners
              .filter(function (entry) { return entry.name === name; })
              .forEach(function (entry) { entry.handler(); });
          }
        };
        mediaQueries.push(mediaQuery);
        return mediaQuery;
      }
    },
    PS: {
      events: {
        emitted: [],
        types: null,
        emit(name, payload) {
          this.emitted.push({ name, payload });
        }
      },
      gpu: {
        status: "ready",
        canvas,
        device,
        context,
        format: "rgba8unorm"
      },
      render: {
        webgpuGbuffer: {
          rebuilds: [],
          rebuildTextures(width, height) {
            this.rebuilds.push({ width, height });
          }
        }
      }
    }
  };

  sandbox.ResizeObserver.prototype.observe = function observe(target) {
    this.observed.push(target);
  };
  sandbox.ResizeObserver.prototype.disconnect = function disconnect() {
    this.disconnected = true;
  };
  sandbox.window.matchMedia = sandbox.globalThis.matchMedia;
  sandbox.window.PS = sandbox.PS;
  sandbox.window.canvas = sandbox.canvas;
  sandbox.matchMedia = sandbox.globalThis.matchMedia;
  sandbox.globalThis.window = sandbox.window;
  sandbox.globalThis.PS = sandbox.PS;
  sandbox.globalThis.canvas = sandbox.canvas;
  sandbox.globalThis.setTimeout = sandbox.setTimeout;
  sandbox.globalThis.clearTimeout = sandbox.clearTimeout;
  vm.createContext(sandbox);

  [
    "js/core/namespace.js",
    "js/core/event-types.js",
    "js/render/renderer.js",
    "js/render/canvas-resize.js",
    "js/render/webgpu-renderer.js"
  ].forEach(function (file) {
    vm.runInContext(read(file), sandbox, { filename: file });
  });

  sandbox.PS.events.types = sandbox.PS.eventTypes;

  return {
    canvas,
    context,
    device,
    mediaQueries,
    resizeObservers,
    timers,
    sandbox
  };
}

const env = makeContext();
const resize = env.sandbox.PS.render.canvasResize;

assert.strictEqual(env.sandbox.PS.eventTypes.CANVAS_RESIZED, "canvas.resized", "canvas resize event type should be registered");
assert.ok(env.sandbox.PS.eventPayloads[env.sandbox.PS.eventTypes.CANVAS_RESIZED], "canvas resize event should document its payload");
assert.strictEqual(resize.debounceMs, 32, "canvas resize should use low-latency resize coalescing");

resize.start();
assert.strictEqual(env.resizeObservers.length, 1, "start should register one resize observer");
assert.deepStrictEqual(env.resizeObservers[0].observed, [env.canvas], "resize observer should watch the WebGPU canvas");
assert.strictEqual(env.mediaQueries.length, 1, "start should register one DPR media query");
assert.strictEqual(env.mediaQueries[0].listeners.length, 1, "DPR query should have one change listener");

resize.start();
assert.strictEqual(env.resizeObservers.length, 2, "second start should replace the observer");
assert.strictEqual(env.resizeObservers[0].disconnected, true, "second start should disconnect the previous observer");
assert.strictEqual(env.mediaQueries[0].removed.length, 1, "second start should remove the previous DPR listener");

env.sandbox.devicePixelRatio = 1.5;
env.sandbox.globalThis.devicePixelRatio = 1.5;
env.mediaQueries[1].dispatch("change");
assert.strictEqual(env.mediaQueries.length, 3, "DPR change should re-arm the media query for the new DPR");
assert.strictEqual(env.mediaQueries[1].removed.length, 1, "DPR change should remove the consumed media query listener");
assert.strictEqual(env.timers[env.timers.length - 1].ms, 32, "DPR resize should use the resize debounce interval");

resize.stop();
assert.strictEqual(env.resizeObservers[1].disconnected, true, "stop should disconnect the active observer");
assert.strictEqual(env.mediaQueries[2].removed.length, 1, "stop should remove the active DPR listener");

resize.requestResize();
env.sandbox.PS.gpu.status = "lost";
assert.strictEqual(resize.applyPendingResize(), false, "resize should not apply while the GPU device is not ready");
assert.strictEqual(env.context.configured.length, 0, "device-lost guard should avoid context reconfiguration");
assert.strictEqual(resize.dirty, true, "blocked resize should remain pending for device recovery");

env.sandbox.PS.gpu.status = "ready";
env.canvas.rectWidth = 120;
env.canvas.rectHeight = 60;
resize.onResize();
assert.strictEqual(env.context.configured.length, 0, "resize callback should not reconfigure the context mid-frame");
env.timers[env.timers.length - 1].fn();
assert.strictEqual(resize.dirty, true, "debounced resize should mark the canvas dirty");
assert.strictEqual(env.context.configured.length, 0, "debounced resize should still wait for the frame boundary");

const renderer = new env.sandbox.PS.render.WebGPURenderer();
assert.strictEqual(renderer.beginFrame(), true, "WebGPU frame should begin after applying pending canvas resize");
assert.strictEqual(env.canvas.width, 180, "frame-boundary resize should update physical canvas width");
assert.strictEqual(env.canvas.height, 90, "frame-boundary resize should update physical canvas height");
assert.strictEqual(env.context.configured.length, 1, "frame-boundary resize should reconfigure the context once");
assert.strictEqual(env.sandbox.PS.render.webgpuGbuffer.rebuilds.length, 1, "frame-boundary resize should rebuild G-buffer textures");
assert.strictEqual(env.sandbox.PS.events.emitted[env.sandbox.PS.events.emitted.length - 1].name, "canvas.resized", "resize should emit the registered event constant");
const resizePayload = env.sandbox.PS.events.emitted[env.sandbox.PS.events.emitted.length - 1].payload;
assert.strictEqual(resizePayload.width, 180, "resize event should report the applied physical width");
assert.strictEqual(resizePayload.height, 90, "resize event should report the applied physical height");
assert.strictEqual(resizePayload.dpr, 1.5, "resize event should report the applied DPR");

console.log("canvas resize checks passed");
