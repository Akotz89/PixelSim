"use strict";
PS.ui = PS.ui || {};

PS.ui.notifications = {
  timeoutId: null,
  getElement: function() {
    return document.getElementById("notification-toast");
  },
  setup: function() {
    var toast = this.getElement();

    if (toast) {
      toast.hidden = true;
    }
  },
  show: function(label, detail, level) {
    var toast = this.getElement();

    if (!toast) {
      return null;
    }

    toast.hidden = false;
    toast.className = "notification-toast toast-" + (level || "info");
    toast.innerHTML = "<b>" + escapeSummaryText(label || "Notice") + "</b><span>" + escapeSummaryText(detail || "") + "</span>";

    if (this.timeoutId && typeof window.clearTimeout === "function") {
      window.clearTimeout(this.timeoutId);
    }

    this.timeoutId = window.setTimeout(function() {
      toast.hidden = true;
    }, 1800);

    return toast;
  }
};
