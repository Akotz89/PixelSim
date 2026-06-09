"use strict";
PS.audio = PS.audio || {
  manifest: { music: {}, ambient: {}, sfx: {}, events: {}, biomes: {} },
  context: null,
  gains: {},
  buffers: {},
  pendingBuffers: {},
  currentMusic: null,
  currentAmbient: null,
  mediaElements: {
    music: null,
    ambient: null,
    sfx: []
  },
  requestedMusic: null,
  requestedAmbient: null,
  unlocked: false,
  unlockHandlersInstalled: false,
  eventSubscriptionsInstalled: false,
  muted: false,
  volumes: {
    master: 1,
    music: 0.72,
    ambient: 0.55,
    sfx: 0.8
  },
  stats: {
    buffersLoaded: 0,
    buffersFailed: 0,
    bufferFallbacks: 0,
    musicPlays: 0,
    ambientPlays: 0,
    sfxPlays: 0,
    queued: 0,
    lastError: null
  },

  loadManifest: function(data) {
    this.manifest = data || this.manifest;
    this.setupEventSubscriptions();
    return this.manifest;
  },

  getAudioContextCtor: function() {
    return typeof AudioContext === "function"
      ? AudioContext
      : (typeof webkitAudioContext === "function" ? webkitAudioContext : null);
  },

  initContext: function() {
    var AudioContextCtor;

    if (this.context) {
      return true;
    }

    AudioContextCtor = this.getAudioContextCtor();

    if (!AudioContextCtor) {
      this.recordError("Web Audio API unavailable");
      return false;
    }

    try {
      this.context = new AudioContextCtor();
      this.gains.master = this.context.createGain();
      this.gains.music = this.context.createGain();
      this.gains.ambient = this.context.createGain();
      this.gains.sfx = this.context.createGain();
      this.gains.music.connect(this.gains.master);
      this.gains.ambient.connect(this.gains.master);
      this.gains.sfx.connect(this.gains.master);
      this.gains.master.connect(this.context.destination);
      this.applyVolumes();
      return true;
    } catch (error) {
      this.recordError(error && error.message ? error.message : String(error));
      return false;
    }
  },

  installUnlockHandlers: function() {
    var self = this;
    var unlock;

    if (this.unlockHandlersInstalled || typeof window === "undefined" || typeof window.addEventListener !== "function") {
      return;
    }

    unlock = function() {
      self.unlock();
    };

    this.unlockHandlersInstalled = true;
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchend", unlock, { once: true, passive: true });
  },

  unlock: function() {
    var self = this;

    if (!this.initContext()) {
      return Promise.resolve(false);
    }

    return this.resume().then(function() {
      self.unlocked = true;

      if (self.requestedMusic) {
        self.playMusic(self.requestedMusic);
      }

      if (self.requestedAmbient) {
        self.playAmbient(self.requestedAmbient);
      }

      return true;
    });
  },

  resume: function() {
    if (!this.context || typeof this.context.resume !== "function" || this.context.state === "running") {
      return Promise.resolve(true);
    }

    return this.context.resume().then(function() {
      return true;
    }).catch(function(error) {
      PS.audio.recordError(error && error.message ? error.message : String(error));
      return false;
    });
  },

  applyVolumes: function() {
    this.setGain("master", this.muted ? 0 : this.volumes.master);
    this.setGain("music", this.volumes.music);
    this.setGain("ambient", this.volumes.ambient);
    this.setGain("sfx", this.volumes.sfx);
    this.updateMediaElementVolumes();
  },

  setGain: function(channel, value) {
    var gain = this.gains[channel];
    var normalized = Math.max(0, Math.min(1, Number(value) || 0));

    if (!gain) {
      return false;
    }

    if (gain.gain && typeof gain.gain.setValueAtTime === "function" && this.context) {
      gain.gain.setValueAtTime(normalized, this.context.currentTime || 0);
    } else if (gain.gain) {
      gain.gain.value = normalized;
    }

    return true;
  },

  setVolume: function(channel, value) {
    var key = String(channel || "");

    if (!Object.prototype.hasOwnProperty.call(this.volumes, key)) {
      return false;
    }

    this.volumes[key] = Math.max(0, Math.min(1, Number(value) || 0));
    this.applyVolumes();
    return true;
  },

  setMuted: function(value) {
    this.muted = Boolean(value);
    this.applyVolumes();
    return this.muted;
  },

  toggleMute: function() {
    return this.setMuted(!this.muted);
  },

  fetchArrayBuffer: function(url) {
    if (typeof fetch === "function" && !(typeof window !== "undefined" && window.location && window.location.protocol === "file:")) {
      return fetch(url).then(function(response) {
        if (!response.ok) {
          throw new Error("Failed to load audio: " + url + " " + response.status);
        }

        return response.arrayBuffer();
      });
    }

    return new Promise(function(resolve, reject) {
      var request;

      if (typeof XMLHttpRequest !== "function") {
        reject(new Error("Audio loading unavailable for " + url));
        return;
      }

      request = new XMLHttpRequest();
      request.open("GET", url, true);
      request.responseType = "arraybuffer";
      request.onload = function() {
        if (request.status !== 0 && (request.status < 200 || request.status >= 300)) {
          reject(new Error("Failed to load audio: " + url + " " + request.status));
          return;
        }

        resolve(request.response);
      };
      request.onerror = function() {
        reject(new Error("Failed to load audio: " + url));
      };
      request.send();
    });
  },

  decodeAudioData: function(arrayBuffer) {
    var context = this.context;

    if (!context || typeof context.decodeAudioData !== "function") {
      return Promise.reject(new Error("Audio context cannot decode buffers"));
    }

    return new Promise(function(resolve, reject) {
      var result;

      try {
        result = context.decodeAudioData(arrayBuffer, resolve, reject);
      } catch (error) {
        reject(error);
        return;
      }

      if (result && typeof result.then === "function") {
        result.then(resolve).catch(reject);
      }
    });
  },

  loadBuffer: function(url, options) {
    var self = this;
    var shouldRecordFailure = !(options && options.recordFailure === false);

    if (!url) {
      return Promise.reject(new Error("Audio URL is required"));
    }

    if (this.buffers[url]) {
      return Promise.resolve(this.buffers[url]);
    }

    if (this.pendingBuffers[url]) {
      return this.pendingBuffers[url];
    }

    if (!this.initContext()) {
      return Promise.resolve(null);
    }

    this.pendingBuffers[url] = this.fetchArrayBuffer(url).then(function(buffer) {
      return self.decodeAudioData(buffer);
    }).then(function(audioBuffer) {
      self.buffers[url] = audioBuffer;
      self.stats.buffersLoaded++;
      delete self.pendingBuffers[url];
      return audioBuffer;
    }).catch(function(error) {
      if (shouldRecordFailure) {
        self.stats.buffersFailed++;
        self.recordError(error && error.message ? error.message : String(error));
      } else {
        self.stats.bufferFallbacks++;
      }
      delete self.pendingBuffers[url];
      return null;
    });

    return this.pendingBuffers[url];
  },

  makeSource: function(audioBuffer, targetGain, options) {
    var source;

    if (!this.context || !audioBuffer || !targetGain) {
      return null;
    }

    source = this.context.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = Boolean(options && options.loop);

    if (source.loop && options) {
      source.loopStart = Math.max(0, Number(options.loopStart) || 0);
      source.loopEnd = Math.max(0, Number(options.loopEnd) || 0);
    }

    source.connect(targetGain);
    return source;
  },

  fadeGain: function(gain, from, to, fadeMs) {
    var param = gain && gain.gain ? gain.gain : null;
    var now = this.context ? this.context.currentTime || 0 : 0;
    var duration = Math.max(0, Number(fadeMs) || 0) / 1000;

    if (!param) {
      return;
    }

    if (typeof param.cancelScheduledValues === "function") {
      param.cancelScheduledValues(now);
    }

    if (typeof param.setValueAtTime === "function") {
      param.setValueAtTime(from, now);
    } else {
      param.value = from;
    }

    if (typeof param.linearRampToValueAtTime === "function") {
      param.linearRampToValueAtTime(to, now + duration);
    } else {
      param.value = to;
    }
  },

  getEffectiveVolume: function(channel, localVolume) {
    var channelVolume = Object.prototype.hasOwnProperty.call(this.volumes, channel) ? this.volumes[channel] : 1;
    var volume = this.muted ? 0 : this.volumes.master * channelVolume * Math.max(0, Math.min(1, Number(localVolume) || 1));

    return Math.max(0, Math.min(1, volume));
  },

  updateMediaElementVolumes: function() {
    if (this.mediaElements.music) {
      this.mediaElements.music.volume = this.getEffectiveVolume("music", this.mediaElements.music._psVolume);
      this.mediaElements.music.muted = this.muted;
    }

    if (this.mediaElements.ambient) {
      this.mediaElements.ambient.volume = this.getEffectiveVolume("ambient", this.mediaElements.ambient._psVolume);
      this.mediaElements.ambient.muted = this.muted;
    }

    for (var i = this.mediaElements.sfx.length - 1; i >= 0; i--) {
      var item = this.mediaElements.sfx[i];

      if (!item || item.ended) {
        this.mediaElements.sfx.splice(i, 1);
      } else {
        item.volume = this.getEffectiveVolume("sfx", item._psVolume);
        item.muted = this.muted;
      }
    }
  },

  playMediaElement: function(channel, id, definition) {
    var self = this;
    var element;
    var playResult;

    if (typeof document === "undefined" || typeof document.createElement !== "function" || !definition || !definition.url) {
      this.recordError("Audio media fallback unavailable: " + id);
      return Promise.resolve(false);
    }

    element = document.createElement("audio");
    element.src = definition.url;
    element.loop = Boolean(definition.loop);
    element.preload = "auto";
    element._psVolume = Math.max(0, Math.min(1, Number(definition.volume) || 1));
    element.volume = this.getEffectiveVolume(channel, element._psVolume);
    element.muted = this.muted;

    if (channel === "music") {
      if (this.mediaElements.music) {
        this.mediaElements.music.pause();
      }

      this.mediaElements.music = element;
      this.currentMusic = { id: id, source: null, gain: null, element: element };
    } else if (channel === "ambient") {
      if (this.mediaElements.ambient) {
        this.mediaElements.ambient.pause();
      }

      this.mediaElements.ambient = element;
      this.currentAmbient = { id: id, biomeId: this.requestedAmbient, source: null, gain: null, element: element };
    } else {
      this.mediaElements.sfx.push(element);
    }

    try {
      playResult = element.play();
    } catch (error) {
      this.recordError(error && error.message ? error.message : String(error));
      return Promise.resolve(false);
    }

    if (playResult && typeof playResult.then === "function") {
      return playResult.then(function() {
        self.stats.lastError = null;
        return true;
      }).catch(function(error) {
        self.recordError(error && error.message ? error.message : String(error));
        return false;
      });
    }

    this.stats.lastError = null;
    return Promise.resolve(true);
  },

  playMusic: function(trackId) {
    var track = this.manifest && this.manifest.music ? this.manifest.music[trackId] : null;
    var self = this;

    this.requestedMusic = trackId;

    if (!track) {
      this.recordError("Unknown music track: " + trackId);
      return Promise.resolve(false);
    }

    if (!this.unlocked) {
      this.stats.queued++;
      return Promise.resolve({ queued: true, trackId: trackId });
    }

    return this.loadBuffer(track.url, { recordFailure: false }).then(function(buffer) {
      var source;
      var gain;
      var fadeMs = Math.max(0, Number(track.fadeMs) || 0);

      if (!buffer || !self.context) {
        return self.playMediaElement("music", trackId, track);
      }

      if (self.currentMusic && self.currentMusic.source) {
        try {
          self.currentMusic.source.stop();
        } catch (error) {
          self.recordError(error && error.message ? error.message : String(error));
        }
      }

      gain = self.context.createGain();
      gain.connect(self.gains.music);
      self.fadeGain(gain, 0, 1, fadeMs);
      source = self.makeSource(buffer, gain, track);

      if (!source) {
        return false;
      }

      source.start(0);
      self.currentMusic = { id: trackId, source: source, gain: gain };
      self.stats.musicPlays++;
      return true;
    }).then(function(result) {
      if (result === true && self.currentMusic && self.currentMusic.element) {
        self.stats.musicPlays++;
      }

      return result;
    });
  },

  playAmbient: function(biomeId) {
    var ambientId = this.manifest && this.manifest.biomes ? this.manifest.biomes[biomeId] || biomeId : biomeId;
    var ambient = this.manifest && this.manifest.ambient ? this.manifest.ambient[ambientId] : null;
    var self = this;

    this.requestedAmbient = biomeId;

    if (!ambient) {
      return Promise.resolve(false);
    }

    if (!this.unlocked) {
      this.stats.queued++;
      return Promise.resolve({ queued: true, biomeId: biomeId });
    }

    return this.loadBuffer(ambient.url, { recordFailure: false }).then(function(buffer) {
      var source;
      var gain;

      if (!buffer || !self.context) {
        return self.playMediaElement("ambient", ambientId, ambient);
      }

      if (self.currentAmbient && self.currentAmbient.source) {
        try {
          self.currentAmbient.source.stop();
        } catch (error) {
          self.recordError(error && error.message ? error.message : String(error));
        }
      }

      gain = self.context.createGain();
      gain.connect(self.gains.ambient);
      self.fadeGain(gain, 0, Math.max(0, Math.min(1, Number(ambient.volume) || 1)), 900);
      source = self.makeSource(buffer, gain, ambient);

      if (!source) {
        return false;
      }

      source.start(0);
      self.currentAmbient = { id: ambientId, biomeId: biomeId, source: source, gain: gain };
      self.stats.ambientPlays++;
      return true;
    }).then(function(result) {
      if (result === true && self.currentAmbient && self.currentAmbient.element) {
        self.stats.ambientPlays++;
      }

      return result;
    });
  },

  playSFX: function(sfxId) {
    var sfx = this.manifest && this.manifest.sfx ? this.manifest.sfx[sfxId] : null;
    var self = this;

    if (!sfx || !this.unlocked) {
      return Promise.resolve(false);
    }

    return this.loadBuffer(sfx.url, { recordFailure: false }).then(function(buffer) {
      var source;
      var gain;

      if (!buffer || !self.context) {
        return self.playMediaElement("sfx", sfxId, sfx);
      }

      gain = self.context.createGain();
      gain.connect(self.gains.sfx);
      self.setGainObject(gain, Math.max(0, Math.min(1, Number(sfx.volume) || 1)));
      source = self.makeSource(buffer, gain, { loop: false });

      if (!source) {
        return false;
      }

      source.start(0);
      self.stats.sfxPlays++;
      return true;
    }).then(function(result) {
      if (result === true && self.mediaElements.sfx.length > 0) {
        self.stats.sfxPlays++;
      }

      return result;
    });
  },

  setGainObject: function(gain, value) {
    if (gain && gain.gain && typeof gain.gain.setValueAtTime === "function" && this.context) {
      gain.gain.setValueAtTime(value, this.context.currentTime || 0);
    } else if (gain && gain.gain) {
      gain.gain.value = value;
    }
  },

  setupEventSubscriptions: function() {
    var self = this;

    if (this.eventSubscriptionsInstalled || !PS.events || !PS.events.types || typeof PS.events.on !== "function") {
      return false;
    }

    this.eventSubscriptionsInstalled = true;
    PS.events.on(PS.events.types.ORGANISM_BORN, function() {
      self.playSFX("organism_birth");
    });
    PS.events.on(PS.events.types.SETTLEMENT_FOUNDED, function() {
      self.playSFX("settlement_founded");
    });
    if (PS.events.types.BIOME_CHANGED) {
      PS.events.on(PS.events.types.BIOME_CHANGED, function(payload) {
        if (payload && payload.biomeId) {
          self.playAmbient(payload.biomeId);
        }
      });
    }

    return true;
  },

  getStats: function() {
    return {
    supported: !!this.getAudioContextCtor(),
      contextCreated: !!this.context,
      unlocked: this.unlocked,
      muted: this.muted,
      volumes: Object.assign({}, this.volumes),
      buffersLoaded: this.stats.buffersLoaded,
      buffersFailed: this.stats.buffersFailed,
      bufferFallbacks: this.stats.bufferFallbacks,
      musicPlays: this.stats.musicPlays,
      ambientPlays: this.stats.ambientPlays,
      sfxPlays: this.stats.sfxPlays,
      queued: this.stats.queued,
      currentMusic: this.currentMusic ? this.currentMusic.id : null,
      currentAmbient: this.currentAmbient ? this.currentAmbient.biomeId : null,
      lastError: this.stats.lastError
    };
  },

  recordError: function(message) {
    this.stats.lastError = String(message || "Audio error");

    if (PS.runtime && typeof PS.runtime.recordError === "function") {
      PS.runtime.recordError("audio.error", { message: this.stats.lastError });
    }

    return false;
  }
};

PS.audio.installUnlockHandlers();
