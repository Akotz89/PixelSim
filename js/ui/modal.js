"use strict";
PS.ui = PS.ui || {};

PS.ui.modal = PS.ui.modal || {
  overlay: null,
  dialog: null,
  activeResolver: null,

  setup: function() {
    if (this.overlay || typeof document === "undefined") {
      return;
    }

    this.overlay = document.createElement("div");
    this.overlay.id = "ui-modal-overlay";
    this.overlay.className = "ui-modal-overlay";
    this.overlay.hidden = true;

    this.dialog = document.createElement("section");
    this.dialog.className = "ui-modal";
    this.dialog.setAttribute("role", "dialog");
    this.dialog.setAttribute("aria-modal", "true");
    this.overlay.appendChild(this.dialog);
    document.body.appendChild(this.overlay);
  },

  confirm: function(options) {
    var self = this;
    var title;
    var message;
    var confirmLabel;
    var cancelLabel;

    this.setup();

    if (!this.overlay || !this.dialog) {
      return Promise.resolve(true);
    }

    options = options || {};
    title = String(options.title || "Confirm");
    message = String(options.message || "");
    confirmLabel = String(options.confirmLabel || "Confirm");
    cancelLabel = String(options.cancelLabel || "Cancel");

    this.dialog.innerHTML =
      "<h2>" + escapeSummaryText(title) + "</h2>" +
      "<p>" + escapeSummaryText(message) + "</p>" +
      "<div class=\"ui-modal-actions\">" +
      "<button type=\"button\" data-modal-action=\"cancel\">" + escapeSummaryText(cancelLabel) + "</button>" +
      "<button type=\"button\" data-modal-action=\"confirm\">" + escapeSummaryText(confirmLabel) + "</button>" +
      "</div>";
    this.overlay.hidden = false;

    return new Promise(function(resolve) {
      var finish = function(result) {
        self.close();
        resolve(result);
      };
      var confirmButton = self.dialog.querySelector("[data-modal-action='confirm']");
      var cancelButton = self.dialog.querySelector("[data-modal-action='cancel']");

      self.activeResolver = finish;
      confirmButton.addEventListener("click", function() {
        finish(true);
      }, { once: true });
      cancelButton.addEventListener("click", function() {
        finish(false);
      }, { once: true });
      self.overlay.addEventListener("click", function(event) {
        if (event.target === self.overlay) {
          finish(false);
        }
      }, { once: true });
    });
  },

  close: function() {
    if (this.overlay) {
      this.overlay.hidden = true;
    }
    this.activeResolver = null;
  }
};
