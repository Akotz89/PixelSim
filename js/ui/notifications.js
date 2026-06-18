import { PS } from "../core/namespace.js";

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
    var title;
    var message;

    if (!toast) {
      return null;
    }

    toast.hidden = false;
    toast.className = "notification-toast toast-" + (level || "info");
    title = document.createElement("b");
    title.textContent = label || "Notice";
    message = document.createElement("span");
    message.textContent = detail || "";
    if (typeof toast.replaceChildren === "function") {
      toast.replaceChildren(title, message);
    } else {
      toast.textContent = "";
      toast.appendChild(title);
      toast.appendChild(message);
    }

    if (this.timeoutId && typeof window.clearTimeout === "function") {
      window.clearTimeout(this.timeoutId);
    }

    this.timeoutId = window.setTimeout(function() {
      toast.hidden = true;
    }, 1800);

    return toast;
  }
};
