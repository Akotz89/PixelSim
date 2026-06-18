import { PS } from "../core/namespace.js";

PS.ui = PS.ui || {};

PS.ui.PanelManager = function() {
  this.panels = {};
  this.stack = [];
  this.baseZIndex = 30;
};

PS.ui.PanelManager.prototype.register = function(id, panel) {
  var panelId = String(id || "").trim();
  var component = panel;

  if (!panelId) {
    return null;
  }

  if (!(component instanceof PS.ui.UIComponent)) {
    component = new PS.ui.UIComponent({
      id: panelId,
      element: panel && panel.element ? panel.element : panel
    });
  }

  component.id = component.id || panelId;
  component.render();
  this.panels[panelId] = component;
  return component;
};

PS.ui.PanelManager.prototype.get = function(id) {
  return this.panels[String(id || "").trim()] || null;
};

PS.ui.PanelManager.prototype.bringToFront = function(id) {
  var panelId = String(id || "").trim();
  var index = this.stack.indexOf(panelId);
  var panel;

  if (index >= 0) {
    this.stack.splice(index, 1);
  }

  this.stack.push(panelId);
  panel = this.get(panelId);

  if (panel && panel.element) {
    panel.element.style.zIndex = String(this.baseZIndex + this.stack.length);
  }

  return panel;
};

PS.ui.PanelManager.prototype.show = function(id) {
  var panel = this.get(id);

  if (!panel) {
    return false;
  }

  panel.show();
  this.bringToFront(id);
  return true;
};

PS.ui.PanelManager.prototype.hide = function(id) {
  var panelId = String(id || "").trim();
  var panel = this.get(panelId);
  var index = this.stack.indexOf(panelId);

  if (!panel) {
    return false;
  }

  panel.hide();

  if (index >= 0) {
    this.stack.splice(index, 1);
  }

  return true;
};

PS.ui.PanelManager.prototype.toggle = function(id) {
  var panel = this.get(id);

  if (!panel) {
    return false;
  }

  return panel.visible ? this.hide(id) : this.show(id);
};

PS.ui.PanelManager.prototype.getState = function() {
  var ids = Object.keys(this.panels);
  var state = {};

  for (var i = 0; i < ids.length; i++) {
    state[ids[i]] = {
      visible: this.panels[ids[i]].visible,
      zIndex: this.panels[ids[i]].element ? Number(this.panels[ids[i]].element.style.zIndex) || 0 : 0
    };
  }

  return {
    panels: state,
    stack: this.stack.slice()
  };
};

PS.ui.panelManager = PS.ui.panelManager || new PS.ui.PanelManager();
