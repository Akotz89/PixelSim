const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const manifest = JSON.parse(read("data/audio.json"));
const audioHandoff = JSON.parse(read("assets/audio/pixeldarium-equivalence/handoff-manifest.json"));
const sidecarContext = {
  PS: {
    assets: {
      captured: {},
      registerJSON(url, data) {
        this.captured[url] = data;
        return data;
      }
    }
  }
};

vm.runInNewContext(read("data/audio.json.js"), sidecarContext);
assert.strictEqual(
  JSON.stringify(sidecarContext.PS.assets.captured["data/audio.json"]),
  JSON.stringify(manifest),
  "audio JSON sidecar should match audio manifest"
);

[
  "assets/audio/music/silence.ogg",
  "assets/audio/ambient/silence.ogg",
  "assets/audio/sfx/silence.ogg"
].forEach((file) => {
  assert.ok(fs.existsSync(path.join(root, file)), file + " should exist");
  assert.ok(fs.statSync(path.join(root, file)).size > 0, file + " should be a non-empty placeholder");
});

assert.strictEqual(audioHandoff.runtimeUse, true, "accepted audio handoff should be runtime-owned");
assert.strictEqual(audioHandoff.acceptedPackCount, 3, "audio handoff should include accepted packs only");
assert.strictEqual(audioHandoff.assetCount, 30, "audio handoff should include all accepted WAV candidates");
assert.ok(manifest.handoffs && manifest.handoffs.azr798, "audio manifest should reference AZR-798 handoff");
assert.strictEqual(manifest.handoffs.azr798.assetCount, 30, "audio manifest handoff should record accepted WAV count");

audioHandoff.assets.forEach((asset) => {
  assert.ok(fs.existsSync(path.join(root, asset.url)), asset.url + " should exist");
  assert.ok(fs.statSync(path.join(root, asset.url)).size > 0, asset.url + " should be non-empty");
  if (asset.loop) {
    assert.ok(manifest.ambient[asset.id], asset.id + " should be registered as ambient loop");
    assert.strictEqual(manifest.ambient[asset.id].runtimeUse, true, asset.id + " should be runtime accepted");
  } else {
    assert.ok(manifest.sfx[asset.id], asset.id + " should be registered as one-shot sfx");
    assert.strictEqual(manifest.sfx[asset.id].runtimeUse, true, asset.id + " should be runtime accepted");
  }
});

const addedListeners = {};
const runtimeErrors = [];

function FakeGain() {
  this.connected = [];
  this.gain = {
    value: 1,
    setValueAtTime(value) {
      this.value = value;
    },
    linearRampToValueAtTime(value) {
      this.value = value;
    },
    cancelScheduledValues() {}
  };
}
FakeGain.prototype.connect = function(target) {
  this.connected.push(target);
};

function FakeSource() {
  this.loop = false;
  this.loopStart = 0;
  this.loopEnd = 0;
  this.started = false;
  this.stopped = false;
}
FakeSource.prototype.connect = function(target) {
  this.target = target;
};
FakeSource.prototype.start = function() {
  this.started = true;
};
FakeSource.prototype.stop = function() {
  this.stopped = true;
};

function FakeAudioContext() {
  this.state = "suspended";
  this.currentTime = 0;
  this.destination = {};
}
FakeAudioContext.prototype.createGain = function() {
  return new FakeGain();
};
FakeAudioContext.prototype.createBufferSource = function() {
  return new FakeSource();
};
FakeAudioContext.prototype.decodeAudioData = function(buffer, resolve) {
  const decoded = { byteLength: buffer.byteLength || 1, duration: 1 };

  if (typeof resolve === "function") {
    resolve(decoded);
  }

  return Promise.resolve(decoded);
};
FakeAudioContext.prototype.resume = function() {
  this.state = "running";
  return Promise.resolve(true);
};

const context = {
  assert,
  console,
  Promise,
  Object,
  AudioContext: FakeAudioContext,
  fetch(url) {
    return Promise.resolve({
      ok: true,
      arrayBuffer() {
        return Promise.resolve(new ArrayBuffer(8));
      }
    });
  },
  window: {
    location: { protocol: "http:" },
    addEventListener(type, handler) {
      addedListeners[type] = handler;
    }
  }
};

const source = [
  "js/core/namespace.js",
  "js/core/event-types.js",
  "js/core/assert.js",
  "js/core/events.js",
  "js/core/audio.js"
].map(read).join("\n");

vm.runInNewContext(source, context);
context.PS.runtime.recordError = function(kind, payload) {
  runtimeErrors.push({ kind, payload });
};
context.PS.audio.loadManifest(manifest);

assert.strictEqual(context.PS.audio.context, null, "audio context should not be created before user interaction");
assert.strictEqual(typeof addedListeners.pointerdown, "function", "audio should install first-interaction unlock handler");

Promise.resolve()
  .then(() => context.PS.audio.playMusic("main_theme"))
  .then((queued) => {
    assert.strictEqual(queued.queued, true, "music request should queue before unlock");
    assert.strictEqual(queued.trackId, "main_theme", "queued music should preserve track id");
    addedListeners.pointerdown();
    return context.PS.audio.unlock();
  })
  .then(() => context.PS.audio.playMusic("main_theme"))
  .then((played) => {
    assert.strictEqual(played, true, "playMusic should decode and start the manifest file after unlock");
    assert.strictEqual(context.PS.audio.getStats().contextCreated, true, "stats should show context creation");
    assert.strictEqual(context.PS.audio.getStats().unlocked, true, "stats should show unlocked audio");
    assert.strictEqual(context.PS.audio.getStats().currentMusic, "main_theme", "stats should show current music");
    assert.strictEqual(context.PS.audio.setVolume("music", 0.25), true, "music volume should be settable");
    assert.strictEqual(context.PS.audio.volumes.music, 0.25, "music volume should store normalized value");
    assert.strictEqual(context.PS.audio.setMuted(true), true, "mute should enable");
    assert.strictEqual(context.PS.audio.muted, true, "mute should persist");
    assert.strictEqual(context.PS.audio.toggleMute(), false, "toggleMute should disable mute");
    return context.PS.audio.playAmbient("forest");
  })
  .then((ambient) => {
    assert.strictEqual(ambient, true, "playAmbient should map biome to ambient layer");
    return context.PS.audio.playSFX("organism_birth");
  })
  .then((sfx) => {
    assert.strictEqual(sfx, true, "playSFX should play one-shot sounds");
    context.PS.events.emit(context.PS.eventTypes.ORGANISM_BORN, { id: 1 });
    assert.ok(context.PS.audio.getStats().sfxPlays >= 1, "event subscriptions should trigger SFX");

    const noAudioContext = {
      console,
      window: { addEventListener() {} },
      PS: {}
    };
    vm.runInNewContext([
      read("js/core/namespace.js"),
      read("js/core/audio.js")
    ].join("\n"), noAudioContext);
    assert.strictEqual(noAudioContext.PS.audio.initContext(), false, "missing Web Audio should degrade without throwing");
    assert.strictEqual(runtimeErrors.length, 0, "supported fake audio path should not log runtime errors");
    console.log("audio system checks passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
