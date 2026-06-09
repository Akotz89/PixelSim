"use strict";
PS.ui = PS.ui || {};

PS.ui.panels = {
  setup: function() {
    this.registerMenuPanels();
    this.sync();
  },
  registerMenuPanels: function() {
    var manager = PS.ui.panelManager;
    var panelElements;

    if (!manager || typeof document === "undefined" || !uiMenu || typeof uiMenu.querySelectorAll !== "function") {
      return false;
    }

    panelElements = uiMenu.querySelectorAll("[data-menu-page]");

    for (var i = 0; i < panelElements.length; i++) {
      var element = panelElements[i];
      var panelId = element.id || "menu-panel-" + i;

      manager.register(panelId, new PS.ui.UIComponent({
        id: panelId,
        element: element,
        visible: !element.hidden
      }));
    }

    return true;
  },
  sync: function() {
    if (typeof syncMenuState === "function") {
      syncMenuState();
    }

    if (typeof syncMenuPage === "function") {
      syncMenuPage();
    }
  },
  open: function() {
    return setMenuOpen(true);
  },
  close: function() {
    return setMenuOpen(false);
  },
  toggle: function() {
    return toggleMenuOpen();
  },
  setPage: function(pageName) {
    return setMenuPage(pageName);
  },
  getState: function() {
    return PS.ui.panelManager ? PS.ui.panelManager.getState() : { panels: {}, stack: [] };
  },
  updateInspect: function() {
    return updateInspectPanel();
  },
  updateEcosystem: function() {
    return updateEcosystemSummary();
  },
  updateSettlements: function() {
    return updateSettlementSummary();
  }
};
