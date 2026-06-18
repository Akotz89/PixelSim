"use strict";
import { PS } from "../core/namespace.js";

PS.ui = PS.ui || {};

PS.ui.UIComponent = function(options) {
  options = options || {};
  this.id = String(options.id || "");
  this.element = options.element || null;
  this.parent = options.parent || null;
  this.className = String(options.className || "");
  this.visible = options.visible !== false;
  this.bindings = [];
};

PS.ui.UIComponent.prototype.render = function() {
  if (!this.element && typeof document !== "undefined") {
    this.element = document.createElement("section");
    if (this.id) {
      this.element.id = this.id;
    }
    if (this.className) {
      this.element.className = this.className;
    }
  }

  if (this.parent && this.element && !this.element.parentNode && typeof this.parent.appendChild === "function") {
    this.parent.appendChild(this.element);
  }

  this.visible = this.element ? !this.element.hidden : this.visible;
  return this.element;
};

PS.ui.UIComponent.prototype.update = function(state) {
  return state || null;
};

PS.ui.UIComponent.prototype.show = function() {
  if (this.element) {
    this.element.hidden = false;
    this.element.setAttribute("aria-hidden", "false");
  }
  this.visible = true;
  return true;
};

PS.ui.UIComponent.prototype.hide = function() {
  if (this.element) {
    this.element.hidden = true;
    this.element.setAttribute("aria-hidden", "true");
  }
  this.visible = false;
  return true;
};

PS.ui.UIComponent.prototype.toggle = function() {
  return this.visible ? this.hide() : this.show();
};

PS.ui.UIComponent.prototype.on = function(target, eventName, handler, options) {
  if (!target || typeof target.addEventListener !== "function" || typeof handler !== "function") {
    return false;
  }

  target.addEventListener(eventName, handler, options || false);
  this.bindings.push({
    target: target,
    eventName: eventName,
    handler: handler,
    options: options || false
  });
  return true;
};

PS.ui.UIComponent.prototype.destroy = function() {
  for (var i = this.bindings.length - 1; i >= 0; i--) {
    var binding = this.bindings[i];

    if (binding.target && typeof binding.target.removeEventListener === "function") {
      binding.target.removeEventListener(binding.eventName, binding.handler, binding.options);
    }
  }

  this.bindings.length = 0;

  if (this.element && this.element.parentNode && typeof this.element.parentNode.removeChild === "function") {
    this.element.parentNode.removeChild(this.element);
  }

  this.element = null;
  this.visible = false;
  return true;
};
