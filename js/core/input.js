"use strict";
PS.core = PS.core || {};

PS.core.InputManager = function () {
  this.bindings = {};
  this.keyToActions = {};
  this.handlers = {};
  this.downKeys = {};
};

PS.core.InputManager.prototype.normalizeBinding = function (binding) {
  return String(binding || "").trim();
};

PS.core.InputManager.prototype.clearBindings = function () {
  this.bindings = {};
  this.keyToActions = {};
};

PS.core.InputManager.prototype.bind = function (action, binding) {
  var actionId = String(action || "").trim();
  var key = this.normalizeBinding(binding);

  if (!actionId || !key) {
    return false;
  }

  if (!this.bindings[actionId]) {
    this.bindings[actionId] = [];
  }

  if (this.bindings[actionId].indexOf(key) < 0) {
    this.bindings[actionId].push(key);
  }

  if (!this.keyToActions[key]) {
    this.keyToActions[key] = [];
  }

  if (this.keyToActions[key].indexOf(actionId) < 0) {
    this.keyToActions[key].push(actionId);
  }

  return true;
};

PS.core.InputManager.prototype.setBindings = function (bindings) {
  var source = bindings && bindings.bindings ? bindings.bindings : bindings;
  var actionIds = source ? Object.keys(source) : [];

  this.clearBindings();

  for (var i = 0; i < actionIds.length; i++) {
    var actionId = actionIds[i];
    var list = Array.isArray(source[actionId]) ? source[actionId] : [source[actionId]];

    for (var j = 0; j < list.length; j++) {
      this.bind(actionId, list[j]);
    }
  }

  return this;
};

PS.core.InputManager.prototype.on = function (action, callback) {
  var actionId = String(action || "").trim();

  if (!actionId || typeof callback !== "function") {
    return false;
  }

  if (!this.handlers[actionId]) {
    this.handlers[actionId] = [];
  }

  this.handlers[actionId].push(callback);
  return true;
};

PS.core.InputManager.prototype.clearHandlers = function () {
  this.handlers = {};
};

PS.core.InputManager.prototype.trigger = function (action, event, meta) {
  var actionId = String(action || "").trim();
  var handlers = this.handlers[actionId] || [];
  var handled = false;

  for (var i = 0; i < handlers.length; i++) {
    handled = handlers[i](event || null, meta || {}) === true || handled;
  }

  return handled;
};

PS.core.InputManager.prototype.getEventKeys = function (event) {
  var keys = [];
  var code = event ? this.normalizeBinding(event.code) : "";
  var key = event ? this.normalizeBinding(event.key) : "";

  if (code) {
    keys.push(code);
  }

  if (key && keys.indexOf(key) < 0) {
    keys.push(key);
  }

  return keys;
};

PS.core.InputManager.prototype.getActionsForEvent = function (event) {
  var keys = this.getEventKeys(event);
  var actions = [];

  for (var i = 0; i < keys.length; i++) {
    var keyActions = this.keyToActions[keys[i]] || [];

    for (var j = 0; j < keyActions.length; j++) {
      if (actions.indexOf(keyActions[j]) < 0) {
        actions.push(keyActions[j]);
      }
    }
  }

  return actions;
};

PS.core.InputManager.prototype.handleKeyDown = function (event) {
  var keys = this.getEventKeys(event);
  var actions = this.getActionsForEvent(event);
  var handled = false;

  for (var i = 0; i < keys.length; i++) {
    this.downKeys[keys[i]] = true;
  }

  for (var j = 0; j < actions.length; j++) {
    handled = this.trigger(actions[j], event, { type: "keydown" }) || handled;
  }

  return handled;
};

PS.core.InputManager.prototype.handleKeyUp = function (event) {
  var keys = this.getEventKeys(event);

  for (var i = 0; i < keys.length; i++) {
    delete this.downKeys[keys[i]];
  }

  return false;
};

PS.core.InputManager.prototype.isDown = function (action) {
  var actionId = String(action || "").trim();
  var bindings = this.bindings[actionId] || [];

  for (var i = 0; i < bindings.length; i++) {
    if (this.downKeys[bindings[i]]) {
      return true;
    }
  }

  return false;
};

PS.core.InputManager.prototype.handlePointer = function (action, event, meta) {
  return this.trigger(action, event, meta || { type: "pointer" });
};

PS.core.InputManager.defaultBindings = {
  close_menu: ["Escape"],
  toggle_performance: ["F3"],
  toggle_overlays: ["F4"],
  toggle_profiler: ["F5"],
  toggle_console: ["Backquote", "`"],
  cycle_observation_overlay: ["KeyO", "o"],
  toggle_menu: ["KeyM", "m"],
  toggle_pause: ["Space", " "],
  step_once: ["KeyN", "n"],
  zoom_in_large: ["BracketRight", "]"],
  zoom_out_large: ["BracketLeft", "["],
  zoom_in: ["Equal", "NumpadAdd", "+", "="],
  zoom_out: ["Minus", "NumpadSubtract", "-", "_"],
  pan_up: ["ArrowUp", "KeyW", "w"],
  pan_down: ["ArrowDown", "KeyS", "s"],
  pan_left: ["ArrowLeft", "KeyA", "a"],
  pan_right: ["ArrowRight", "KeyD", "d"],
  restart: ["KeyR", "r"],
  menu_page_controls: ["Digit1"],
  menu_page_status: ["Digit2"],
  menu_page_ecosystem: ["Digit3"],
  menu_page_log: ["Digit4"]
};

PS.input = PS.input || new PS.core.InputManager();
PS.input.setBindings(PS.core.InputManager.defaultBindings);
