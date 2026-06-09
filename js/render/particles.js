PS.render = PS.render || {};

PS.render.ParticleEmitter = function (system, effectId, config) {
  this.system = system;
  this.effectId = String(effectId || "");
  this.config = system.mergeConfig(effectId, config || {});
  this.id = String(this.config.id || effectId || "emitter");
  this.active = this.config.active !== false;
  this.carry = 0;
};

PS.render.ParticleEmitter.prototype.start = function () {
  this.active = true;
  return this;
};

PS.render.ParticleEmitter.prototype.stop = function () {
  this.active = false;
  return this;
};

PS.render.ParticleEmitter.prototype.setPosition = function (x, y) {
  this.config.position = {
    x: Number(x) || 0,
    y: Number(y) || 0
  };
  return this;
};

PS.render.ParticleEmitter.prototype.setRate = function (rate) {
  this.config.rate = Math.max(0, Number(rate) || 0);
  return this;
};

PS.render.ParticleEmitter.prototype.burst = function (count) {
  return this.system.emitFromConfig(this.config, Math.max(0, Math.floor(Number(count) || 0)));
};

PS.render.ParticleSystem = function (maxParticles) {
  this.maxParticles = Math.max(1, Math.floor(Number(maxParticles) || 10000));
  this.active = new Uint8Array(this.maxParticles);
  this.x = new Float32Array(this.maxParticles);
  this.y = new Float32Array(this.maxParticles);
  this.vx = new Float32Array(this.maxParticles);
  this.vy = new Float32Array(this.maxParticles);
  this.age = new Float32Array(this.maxParticles);
  this.life = new Float32Array(this.maxParticles);
  this.gravity = new Float32Array(this.maxParticles);
  this.size = new Float32Array(this.maxParticles);
  this.fadeIn = new Float32Array(this.maxParticles);
  this.fadeOut = new Float32Array(this.maxParticles);
  this.red = new Float32Array(this.maxParticles);
  this.green = new Float32Array(this.maxParticles);
  this.blue = new Float32Array(this.maxParticles);
  this.alpha = new Float32Array(this.maxParticles);
  this.freeList = new Uint32Array(this.maxParticles);
  this.freeTop = 0;
  this.emitters = [];
  this.birthEmitter = null;
  this.definitions = {};
  this.seed = 1;
  this.target = null;
  this.program = null;
  this.quadBuffer = null;
  this.instanceBuffer = null;
  this.instanceData = new Float32Array(this.maxParticles * 8);
  this.locations = null;
  this.stats = {
    active: 0,
    peak: 0,
    emitters: 0,
    drawCalls: 0,
    visible: 0,
    culled: 0,
    emitted: 0,
    dropped: 0,
    updateMs: 0,
    renderMs: 0,
    lastFrameMs: 0,
    maxParticles: this.maxParticles,
    ready: false,
    lastError: ""
  };
  this.reset(1);
};

PS.render.ParticleSystem.prototype.reset = function (seed) {
  this.seed = (Number(seed) || 1) >>> 0;
  if (this.seed === 0) {
    this.seed = 1;
  }
  this.active.fill(0);
  this.freeTop = this.maxParticles;
  for (var i = 0; i < this.maxParticles; i++) {
    this.freeList[i] = this.maxParticles - i - 1;
  }
  this.emitters.length = 0;
  this.birthEmitter = null;
  this.stats.active = 0;
  this.stats.peak = 0;
  this.stats.emitters = 0;
  this.stats.drawCalls = 0;
  this.stats.visible = 0;
  this.stats.culled = 0;
  this.stats.emitted = 0;
  this.stats.dropped = 0;
  this.stats.updateMs = 0;
  this.stats.renderMs = 0;
  this.stats.lastFrameMs = 0;
  this.stats.lastError = "";
  return this;
};

PS.render.ParticleSystem.prototype.random = function () {
  this.seed = (1664525 * this.seed + 1013904223) >>> 0;
  return this.seed / 4294967296;
};

PS.render.ParticleSystem.prototype.randomRange = function (range, fallback) {
  if (Array.isArray(range)) {
    return (Number(range[0]) || 0) + ((Number(range[1]) || 0) - (Number(range[0]) || 0)) * this.random();
  }
  return Number.isFinite(Number(range)) ? Number(range) : fallback;
};

PS.render.ParticleSystem.prototype.parseColor = function (color) {
  var selected = Array.isArray(color)
    ? color[Math.floor(this.random() * Math.max(1, color.length))]
    : color;
  var text = String(selected || "#ffffff").replace("#", "");

  if (text.length !== 6) {
    return { red: 1, green: 1, blue: 1 };
  }

  return {
    red: parseInt(text.slice(0, 2), 16) / 255,
    green: parseInt(text.slice(2, 4), 16) / 255,
    blue: parseInt(text.slice(4, 6), 16) / 255
  };
};

PS.render.ParticleSystem.prototype.loadDefinitions = function (data) {
  this.definitions = data && data.effects ? data.effects : {};
  this.stats.ready = Object.keys(this.definitions).length > 0;
  return this.definitions;
};

PS.render.ParticleSystem.prototype.mergeConfig = function (effectId, override) {
  var base = this.definitions[String(effectId || "")] || {};
  var config = {};
  var key;

  for (key in base) {
    if (Object.prototype.hasOwnProperty.call(base, key)) {
      config[key] = base[key];
    }
  }
  for (key in override) {
    if (Object.prototype.hasOwnProperty.call(override, key)) {
      config[key] = override[key];
    }
  }
  config.type = config.type || "point";
  config.rate = Math.max(0, Number(config.rate) || 0);
  config.lifetime = Math.max(0.05, Number(config.lifetime) || 1);
  config.fadeIn = Math.max(0, Number(config.fadeIn) || 0);
  config.fadeOut = Math.max(0, Number(config.fadeOut) || 0);
  config.gravity = Number(config.gravity) || 0;
  config.position = config.position || { x: canvas ? canvas.width / 2 : 0, y: canvas ? canvas.height / 2 : 0 };
  config.bounds = config.bounds || { x: 0, y: 0, width: canvas ? canvas.width : 1, height: canvas ? canvas.height : 1 };
  return config;
};

PS.render.ParticleSystem.prototype.createEmitter = function (effectId, config) {
  var emitter = new PS.render.ParticleEmitter(this, effectId, config || {});
  this.emitters.push(emitter);
  this.stats.emitters = this.emitters.length;
  return emitter;
};

PS.render.ParticleSystem.prototype.allocate = function () {
  if (this.freeTop <= 0) {
    this.stats.dropped++;
    return -1;
  }
  return this.freeList[--this.freeTop];
};

PS.render.ParticleSystem.prototype.release = function (index) {
  if (index < 0 || index >= this.maxParticles || !this.active[index]) {
    return false;
  }
  this.active[index] = 0;
  this.freeList[this.freeTop++] = index;
  this.stats.active--;
  return true;
};

PS.render.ParticleSystem.prototype.getSpawnPoint = function (config) {
  var bounds = config.bounds || {};
  var pos = config.position || {};

  if (config.type === "area") {
    return {
      x: (Number(bounds.x) || 0) + this.random() * Math.max(1, Number(bounds.width) || 1),
      y: (Number(bounds.y) || 0) + this.random() * Math.max(1, Number(bounds.height) || 1)
    };
  }

  if (config.type === "line") {
    return {
      x: (Number(bounds.x) || 0) + this.random() * Math.max(1, Number(bounds.width) || 1),
      y: Number(pos.y) || Number(bounds.y) || 0
    };
  }

  return {
    x: Number(pos.x) || 0,
    y: Number(pos.y) || 0
  };
};

PS.render.ParticleSystem.prototype.emitOne = function (config) {
  var index = this.allocate();
  var velocity = config.velocity || {};
  var point;
  var color;

  if (index < 0) {
    return false;
  }

  point = this.getSpawnPoint(config);
  color = this.parseColor(config.color);
  this.active[index] = 1;
  this.x[index] = point.x;
  this.y[index] = point.y;
  this.vx[index] = this.randomRange(velocity.x, 0);
  this.vy[index] = this.randomRange(velocity.y, 0);
  this.age[index] = 0;
  this.life[index] = config.lifetime;
  this.gravity[index] = Number(config.gravity) || 0;
  this.size[index] = this.randomRange(config.size, 1);
  this.fadeIn[index] = config.fadeIn;
  this.fadeOut[index] = config.fadeOut;
  this.red[index] = color.red;
  this.green[index] = color.green;
  this.blue[index] = color.blue;
  this.alpha[index] = 1;
  this.stats.active++;
  this.stats.emitted++;
  this.stats.peak = Math.max(this.stats.peak, this.stats.active);
  return true;
};

PS.render.ParticleSystem.prototype.emitFromConfig = function (config, count) {
  var emitted = 0;

  for (var i = 0; i < count; i++) {
    if (this.emitOne(config)) {
      emitted++;
    }
  }

  return emitted;
};

PS.render.ParticleSystem.prototype.update = function (dt) {
  var startedAt = performance.now();
  var step = Math.max(0, Math.min(0.1, Number(dt) || 0));

  for (var e = 0; e < this.emitters.length; e++) {
    var emitter = this.emitters[e];
    var emitCount;

    if (!emitter.active || emitter.config.rate <= 0) {
      continue;
    }

    emitter.carry += emitter.config.rate * step;
    emitCount = Math.floor(emitter.carry + 0.000001);
    if (emitCount > 0) {
      emitter.carry -= emitCount;
      this.emitFromConfig(emitter.config, emitCount);
    }
  }

  for (var i = 0; i < this.maxParticles; i++) {
    if (!this.active[i]) {
      continue;
    }

    this.age[i] += step;
    if (this.age[i] > this.life[i]) {
      this.release(i);
      continue;
    }

    this.vy[i] += this.gravity[i] * step;
    this.x[i] += this.vx[i] * step;
    this.y[i] += this.vy[i] * step;
  }

  this.stats.updateMs = performance.now() - startedAt;
  return this.stats.active;
};

PS.render.ParticleSystem.prototype.getAlpha = function (index) {
  var remaining = this.life[index] - this.age[index];
  var alpha = 1;

  if (this.fadeIn[index] > 0) {
    alpha = Math.min(alpha, this.age[index] / this.fadeIn[index]);
  }
  if (this.fadeOut[index] > 0) {
    alpha = Math.min(alpha, remaining / this.fadeOut[index]);
  }

  return clamp(alpha, 0, 1);
};

PS.render.ParticleSystem.prototype.ensureRenderResources = function () {
  return Boolean(
    PS.render.webgpuEntity &&
    typeof PS.render.webgpuEntity.drawParticleRects === "function"
  );
};

PS.render.ParticleSystem.prototype.configureAttributes = function () {
  return false;
};

PS.render.ParticleSystem.prototype.render = function () {
  var startedAt = performance.now();
  var visible = 0;
  var i;
  var offset;

  if (!this.ensureRenderResources()) {
    this.stats.lastError = "Particle WebGPU renderer unavailable";
    return false;
  }

  for (i = 0; i < this.maxParticles; i++) {
    if (!this.active[i]) {
      continue;
    }
    if (
      this.x[i] < -8 ||
      this.y[i] < -8 ||
      this.x[i] > canvas.width + 8 ||
      this.y[i] > canvas.height + 8
    ) {
      this.stats.culled++;
      continue;
    }
    offset = visible * 8;
    this.instanceData[offset] = this.x[i] - this.size[i] / 2;
    this.instanceData[offset + 1] = this.y[i] - this.size[i] / 2;
    this.instanceData[offset + 2] = this.size[i];
    this.instanceData[offset + 3] = this.size[i];
    this.instanceData[offset + 4] = this.red[i];
    this.instanceData[offset + 5] = this.green[i];
    this.instanceData[offset + 6] = this.blue[i];
    this.instanceData[offset + 7] = this.getAlpha(i);
    visible++;
  }

  if (visible <= 0) {
    this.stats.visible = 0;
    this.stats.renderMs = performance.now() - startedAt;
    return false;
  }

  this.stats.visible = visible;
  if (!PS.render.webgpuEntity.drawParticleRects(this.instanceData.subarray(0, visible * 8))) {
    this.stats.lastError = "Particle WebGPU draw returned no visible instances";
    this.stats.renderMs = performance.now() - startedAt;
    this.stats.lastFrameMs = this.stats.updateMs + this.stats.renderMs;
    return false;
  }
  this.stats.drawCalls++;
  this.stats.renderMs = performance.now() - startedAt;
  this.stats.lastFrameMs = this.stats.updateMs + this.stats.renderMs;
  this.stats.lastError = "";
  return true;
};

PS.render.ParticleSystem.prototype.getActiveCount = function () {
  return this.stats.active;
};

PS.render.ParticleSystem.prototype.emitBirthSparkle = function (organism) {
  var projection = null;
  var x;
  var y;

  if (organism && PS.render.projection && typeof PS.render.projection.getInterpolatedProjection === "function") {
    projection = PS.render.projection.getInterpolatedProjection(organism.x, organism.y);
  }

  if (projection && projection.visible !== false) {
    x = projection.x;
    y = projection.y;
  } else {
    x = typeof canvas !== "undefined" && canvas ? canvas.width * 0.5 : 0;
    y = typeof canvas !== "undefined" && canvas ? canvas.height * 0.5 : 0;
  }

  if (!this.birthEmitter) {
    this.birthEmitter = this.createEmitter("birth_sparkle", {
      id: "event.birth_sparkle",
      active: false,
      position: { x: x, y: y }
    });
  }

  return this.birthEmitter.setPosition(x, y).burst(12);
};

PS.render.ParticleSystem.prototype.getStats = function () {
  return Object.assign({}, this.stats);
};

PS.render.ParticleSystem.prototype.rebuildShaders = function () {
  this.program = null;
  this.quadBuffer = null;
  this.instanceBuffer = null;
  this.locations = null;
};

PS.render.ParticleSystem.prototype.rebuildTextures = function () {};

PS.render.particles = PS.render.particles || new PS.render.ParticleSystem(
  typeof CONFIG !== "undefined" ? CONFIG.PARTICLE_MAX_ACTIVE : 10000
);
