import { PS } from "./namespace.js";
import { clamp } from "./utils.js";
import { updateOrganism } from "../sim/organisms-behavior.js";
import { world } from "../systems/state.js";

PS.animation = PS.animation || {};

PS.animation.AnimationDefinition = {
  fromStates: function (states) {
    var output = {};
    var ids = states && typeof states === "object" ? Object.keys(states) : [];

    for (var i = 0; i < ids.length; i++) {
      output[ids[i]] = PS.animation.normalizeState(states[ids[i]]);
    }

    return output;
  },

  fromAseprite: function (json) {
    var states = {};
    var frameNames = [];
    var frames = json && json.frames ? json.frames : {};
    var tags = json && json.meta && Array.isArray(json.meta.frameTags) ? json.meta.frameTags : [];
    var keys = Object.keys(frames);

    for (var i = 0; i < keys.length; i++) {
      frameNames.push(keys[i]);
    }

    for (var t = 0; t < tags.length; t++) {
      var tag = tags[t] || {};
      var from = Math.max(0, Math.floor(Number(tag.from) || 0));
      var to = Math.min(frameNames.length - 1, Math.floor(Number(tag.to) || from));
      var names = [];
      var totalDuration = 0;

      for (var f = from; f <= to; f++) {
        names.push(frameNames[f]);
        totalDuration += Number(frames[frameNames[f]] && frames[frameNames[f]].duration) || 0;
      }

      states[tag.name] = PS.animation.normalizeState({
        frames: names,
        fps: totalDuration > 0 && names.length > 0 ? 1000 / (totalDuration / names.length) : 8,
        loop: tag.loop !== false
      });
    }

    return states;
  },

  fromGrid: function (meta) {
    var states = {};
    var groups = meta && meta.animations ? meta.animations : {};
    var ids = Object.keys(groups);

    for (var i = 0; i < ids.length; i++) {
      states[ids[i]] = PS.animation.normalizeState(groups[ids[i]]);
    }

    return states;
  }
};

PS.animation.normalizeState = function (config) {
  var source = config || {};
  var frames = Array.isArray(source.frames) ? source.frames.slice() : [];
  var fps = Math.max(0.001, Number(source.fps) || 1);

  return {
    frames: frames,
    fps: fps,
    loop: source.loop !== false,
    onComplete: typeof source.onComplete === "function" ? source.onComplete : null
  };
};

PS.animation.AnimationController = function (spriteSheet) {
  this.spriteSheet = spriteSheet || null;
  this.states = {};
  this.transitions = [];
  this.stateName = "";
  this.frameIndex = 0;
  this.frameTimer = 0;
  this.completed = false;
};

PS.animation.AnimationController.prototype.addState = function (name, config) {
  var stateName = String(name || "");

  if (!stateName) {
    throw new Error("AnimationController.addState requires a state name");
  }

  this.states[stateName] = PS.animation.normalizeState(config);

  if (!this.stateName) {
    this.setState(stateName);
  }

  return this;
};

PS.animation.AnimationController.prototype.loadStates = function (states) {
  var ids = states && typeof states === "object" ? Object.keys(states) : [];

  for (var i = 0; i < ids.length; i++) {
    this.addState(ids[i], states[ids[i]]);
  }

  return this;
};

PS.animation.AnimationController.prototype.addTransition = function (from, to, condition) {
  this.transitions.push({
    from: String(from || ""),
    to: String(to || ""),
    condition: condition
  });
  return this;
};

PS.animation.AnimationController.prototype.setState = function (name) {
  var stateName = String(name || "");

  if (!this.states[stateName]) {
    return false;
  }

  if (this.stateName !== stateName) {
    this.stateName = stateName;
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.completed = false;
  }

  return true;
};

PS.animation.AnimationController.prototype.evaluateTransitions = function (subject) {
  for (var i = 0; i < this.transitions.length; i++) {
    var transition = this.transitions[i];

    if (transition.from && transition.from !== this.stateName) {
      continue;
    }

    if (typeof transition.condition === "function" && transition.condition(subject, this)) {
      return this.setState(transition.to);
    }
  }

  return false;
};

PS.animation.AnimationController.prototype.update = function (dt, subject) {
  var state = this.states[this.stateName];
  var step = Math.max(0, Number(dt) || 0);
  var frameDuration;

  this.evaluateTransitions(subject);
  state = this.states[this.stateName];

  if (!state || state.frames.length <= 1 || this.completed || step <= 0) {
    return this.getCurrentFrame();
  }

  frameDuration = 1 / state.fps;
  this.frameTimer += step;

  while (this.frameTimer + 0.000001 >= frameDuration && !this.completed) {
    this.frameTimer -= frameDuration;
    this.frameIndex++;

    if (this.frameIndex >= state.frames.length) {
      if (state.loop) {
        this.frameIndex = 0;
      } else {
        this.frameIndex = state.frames.length - 1;
        this.completed = true;
        if (state.onComplete) {
          state.onComplete(this);
        }
      }
    }
  }

  return this.getCurrentFrame();
};

PS.animation.AnimationController.prototype.getCurrentFrame = function () {
  var state = this.states[this.stateName];

  if (!state || state.frames.length === 0) {
    return null;
  }

  return state.frames[Math.max(0, Math.min(this.frameIndex, state.frames.length - 1))];
};

PS.animation.AnimationController.prototype.getCurrentProgress = function () {
  var state = this.states[this.stateName];

  if (!state || state.frames.length <= 1) {
    return 0;
  }

  return clamp(this.frameIndex / (state.frames.length - 1), 0, 1);
};

PS.animation.definitions = PS.animation.definitions || {};
PS.animation.controllers = PS.animation.controllers || new Map();
PS.animation.stats = PS.animation.stats || {
  definitions: 0,
  controllers: 0,
  updated: 0,
  visibleUpdated: 0,
  lastUpdateMs: 0,
  maxVisibleControllers: 5000,
  ready: false
};

PS.animation.visibleBatch = PS.animation.visibleBatch || {
  capacity: 0,
  keys: null,
  stateIds: null,
  frameIndexes: null,
  timers: null,
  overflowSlots: new Map()
};
PS.animation.visibleOrganismStates = PS.animation.visibleOrganismStates || {
  idle: null,
  walkRight: null,
  walkLeft: null
};

PS.animation.loadDefinitions = function (data) {
  var groups = data && data.animations ? data.animations : {};
  var ids = Object.keys(groups);

  PS.animation.definitions = {};
  for (var i = 0; i < ids.length; i++) {
    PS.animation.definitions[ids[i]] = PS.animation.AnimationDefinition.fromStates(groups[ids[i]]);
  }

  PS.animation.visibleOrganismStates.idle = PS.animation.definitions.organism ? PS.animation.definitions.organism.idle : null;
  PS.animation.visibleOrganismStates.walkRight = PS.animation.definitions.organism ? PS.animation.definitions.organism.walk_right : null;
  PS.animation.visibleOrganismStates.walkLeft = PS.animation.definitions.organism ? PS.animation.definitions.organism.walk_left : null;

  PS.animation.stats.definitions = ids.length;
  PS.animation.stats.ready = ids.length > 0;
  return PS.animation.definitions;
};

PS.animation.getDefinition = function (id) {
  return PS.animation.definitions[String(id || "")] || null;
};

PS.animation.getController = function (key, definitionId) {
  var controllerKey = String(key || "");
  var controller = PS.animation.controllers.get(controllerKey);
  var definition = PS.animation.getDefinition(definitionId);

  if (!controllerKey || !definition) {
    return null;
  }

  if (!controller) {
    controller = new PS.animation.AnimationController();
    controller.loadStates(definition);
    PS.animation.controllers.set(controllerKey, controller);
    PS.animation.stats.controllers = PS.animation.controllers.size;
  }

  return controller;
};

PS.animation.getOrganismState = function (organism) {
  var dx = Number(organism && organism.x) - Number(organism && organism.prevX);
  var dy = Number(organism && organism.y) - Number(organism && organism.prevY);

  if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
    return dx < 0 ? "walk_left" : "walk_right";
  }

  if (Number(organism && organism.directionX) < 0) {
    return "walk_left";
  }

  if (Number(organism && organism.directionX) > 0 || Number(organism && organism.directionY) !== 0) {
    return "walk_right";
  }

  return "idle";
};

PS.animation.getOrganismStateId = function (organism) {
  var stateName = PS.animation.getOrganismState(organism);

  if (stateName === "walk_right") {
    return 1;
  }

  if (stateName === "walk_left") {
    return 2;
  }

  return 0;
};

PS.animation.getOrganismStateName = function (stateId) {
  if (stateId === 1) {
    return "walk_right";
  }

  if (stateId === 2) {
    return "walk_left";
  }

  return "idle";
};

PS.animation.ensureVisibleBatch = function (capacity) {
  var batch = PS.animation.visibleBatch;
  var nextCapacity = Math.max(1, Math.floor(Number(capacity) || PS.animation.stats.maxVisibleControllers));

  if (batch.capacity >= nextCapacity && batch.keys) {
    return batch;
  }

  batch.capacity = nextCapacity;
  batch.keys = new Int32Array(nextCapacity);
  batch.stateIds = new Uint8Array(nextCapacity);
  batch.frameIndexes = new Uint16Array(nextCapacity);
  batch.timers = new Float32Array(nextCapacity);
  batch.overflowSlots = new Map();
  for (var i = 0; i < nextCapacity; i++) {
    batch.keys[i] = -1;
  }

  return batch;
};

PS.animation.getVisibleSlot = function (organism, batch) {
  var rawKey = organism && Number.isFinite(Number(organism.poolIndex))
    ? Math.floor(Number(organism.poolIndex))
    : -1;
  var overflowKey;
  var slot;

  if (rawKey >= 0 && rawKey < batch.capacity) {
    if (batch.keys[rawKey] !== rawKey) {
      batch.keys[rawKey] = rawKey;
      batch.stateIds[rawKey] = 255;
      batch.frameIndexes[rawKey] = 0;
      batch.timers[rawKey] = 0;
    }
    return rawKey;
  }

  overflowKey = String(organism && (organism.representativeId || organism.id || rawKey));
  slot = batch.overflowSlots.get(overflowKey);
  if (slot === undefined) {
    slot = batch.overflowSlots.size % batch.capacity;
    batch.overflowSlots.set(overflowKey, slot);
    batch.keys[slot] = -2;
    batch.stateIds[slot] = 255;
    batch.frameIndexes[slot] = 0;
    batch.timers[slot] = 0;
  }

  return slot;
};

PS.animation.updateVisibleOrganismFrame = function (organism, dt) {
  var batch;
  var slot;
  var stateId;
  var state;
  var frameDuration;
  var dx;
  var dy;

  if (!PS.animation.visibleOrganismStates.idle) {
    return null;
  }

  batch = PS.animation.ensureVisibleBatch(PS.animation.stats.maxVisibleControllers);
  slot = PS.animation.getVisibleSlot(organism, batch);
  dx = Number(organism && organism.x) - Number(organism && organism.prevX);
  dy = Number(organism && organism.y) - Number(organism && organism.prevY);
  if (dx < 0 || Number(organism && organism.directionX) < 0) {
    stateId = 2;
  } else if (dx > 0 || dy !== 0 || Number(organism && organism.directionX) > 0 || Number(organism && organism.directionY) !== 0) {
    stateId = 1;
  } else {
    stateId = 0;
  }

  if (batch.stateIds[slot] !== stateId) {
    batch.stateIds[slot] = stateId;
    batch.frameIndexes[slot] = 0;
    batch.timers[slot] = 0;
  }

  state = stateId === 1
    ? PS.animation.visibleOrganismStates.walkRight
    : (stateId === 2 ? PS.animation.visibleOrganismStates.walkLeft : PS.animation.visibleOrganismStates.idle);
  state = state || PS.animation.visibleOrganismStates.idle;
  if (!state || state.frames.length === 0) {
    return null;
  }

  if (typeof world === "undefined" || !world || !world.isPaused) {
    frameDuration = 1 / state.fps;
    batch.timers[slot] += Math.max(0, Number(dt) || 0);

    while (state.frames.length > 1 && batch.timers[slot] + 0.000001 >= frameDuration) {
      batch.timers[slot] -= frameDuration;
      batch.frameIndexes[slot]++;

      if (batch.frameIndexes[slot] >= state.frames.length) {
        batch.frameIndexes[slot] = state.loop ? 0 : state.frames.length - 1;
      }
    }
  }

  PS.animation.stats.updated++;
  return state.frames[Math.max(0, Math.min(batch.frameIndexes[slot], state.frames.length - 1))];
};

PS.animation.updateOrganism = function (organism, dt) {
  var key = organism && (organism.representativeId || organism.poolIndex || organism.id);
  var controller = PS.animation.getController("organism:" + key, "organism");
  var stateName;

  if (!controller) {
    return null;
  }

  stateName = PS.animation.getOrganismState(organism);
  controller.setState(stateName);
  controller.update(dt, organism);
  PS.animation.stats.updated++;
  return controller;
};

PS.animation.getOrganismFrame = function (organism, dt) {
  var controller;

  if (typeof world !== "undefined" && world && world.isPaused) {
    controller = PS.animation.getController("organism:" + (organism && (organism.representativeId || organism.poolIndex || organism.id)), "organism");
    return controller ? controller.getCurrentFrame() : null;
  }

  controller = PS.animation.updateOrganism(organism, dt);
  return controller ? controller.getCurrentFrame() : null;
};

PS.animation.getVisibleOrganismFrame = function (organism, dt) {
  return PS.animation.updateVisibleOrganismFrame(organism, dt);
};

/**
 * @description Updates visible organism animation frames in budgeted batches, choosing idle/walk frames and preserving frame output for renderer consumption.
 * @param {Array<Object>} organisms Visible organism records to update.
 * @param {number} count Maximum number of organisms to process this frame.
 * @param {number} dt Elapsed simulation time in seconds.
 * @param {Array<Object>|null} outputFrames Optional reusable output frame array.
 * @returns {Array<Object>} Frame descriptors for the visible organisms processed.
 */
PS.animation.updateVisibleOrganismFrames = function (organisms, count, dt, outputFrames) {
  var total = Math.min(Math.max(0, Math.floor(Number(count) || 0)), organisms ? organisms.length : 0);
  var startedAt = performance.now();
  var batch;
  var step = Math.max(0, Number(dt) || 0);
  var isPaused = typeof world !== "undefined" && world && world.isPaused;
  var idle = PS.animation.visibleOrganismStates.idle;
  var walkRight = PS.animation.visibleOrganismStates.walkRight || idle;
  var walkLeft = PS.animation.visibleOrganismStates.walkLeft || idle;
  var updated = 0;

  if (!idle || total <= 0) {
    PS.animation.stats.lastUpdateMs = performance.now() - startedAt;
    PS.animation.stats.visibleUpdated = total;
    return total;
  }

  batch = PS.animation.ensureVisibleBatch(Math.max(total, PS.animation.stats.maxVisibleControllers));

  for (var i = 0; i < total; i++) {
    var organism = organisms[i];
    var rawKey = organism && Number.isFinite(Number(organism.poolIndex))
      ? Math.floor(Number(organism.poolIndex))
      : -1;
    var slot = rawKey >= 0 && rawKey < batch.capacity
      ? rawKey
      : PS.animation.getVisibleSlot(organism, batch);
    var dx = Number(organism && organism.x) - Number(organism && organism.prevX);
    var dy = Number(organism && organism.y) - Number(organism && organism.prevY);
    var stateId = dx < 0 || Number(organism && organism.directionX) < 0
      ? 2
      : (dx > 0 || dy !== 0 || Number(organism && organism.directionX) > 0 || Number(organism && organism.directionY) !== 0 ? 1 : 0);
    var state = stateId === 1 ? walkRight : (stateId === 2 ? walkLeft : idle);
    var frameCount = state.frames.length;

    if (rawKey >= 0 && rawKey < batch.capacity && batch.keys[slot] !== rawKey) {
      batch.keys[slot] = rawKey;
      batch.stateIds[slot] = 255;
      batch.frameIndexes[slot] = 0;
      batch.timers[slot] = 0;
    }

    if (batch.stateIds[slot] !== stateId) {
      batch.stateIds[slot] = stateId;
      batch.frameIndexes[slot] = 0;
      batch.timers[slot] = 0;
    }

    if (!isPaused && frameCount > 1) {
      var frameDuration = 1 / state.fps;

      batch.timers[slot] += step;
      while (batch.timers[slot] + 0.000001 >= frameDuration) {
        batch.timers[slot] -= frameDuration;
        batch.frameIndexes[slot]++;

        if (batch.frameIndexes[slot] >= frameCount) {
          batch.frameIndexes[slot] = state.loop ? 0 : frameCount - 1;
        }
      }
    }

    outputFrames[i] = state.frames[Math.max(0, Math.min(batch.frameIndexes[slot], frameCount - 1))];
    updated++;
  }

  PS.animation.stats.updated += updated;
  PS.animation.stats.lastUpdateMs = performance.now() - startedAt;
  PS.animation.stats.visibleUpdated = total;
  return total;
};

PS.animation.resetFrameStats = function () {
  PS.animation.stats.updated = 0;
  PS.animation.stats.visibleUpdated = 0;
  PS.animation.stats.lastUpdateMs = 0;
};

PS.animation.getStats = function () {
  return Object.assign({}, PS.animation.stats);
};
