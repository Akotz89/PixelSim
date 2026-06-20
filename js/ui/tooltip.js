import { escapeSummaryText } from "./summary.js";

export const tooltip = {
  element: null,
  delayMs: 200,
  showTimer: null,
  visible: false,

  setup: function() {
    if (this.element || typeof document === "undefined") {
      return this.element;
    }

    this.element = document.createElement("div");
    this.element.id = "ui-tooltip";
    this.element.className = "ui-tooltip";
    this.element.setAttribute("role", "tooltip");
    this.element.hidden = true;
    document.body.appendChild(this.element);
    return this.element;
  },

  setContent: function(content) {
    this.setup();

    if (!this.element) {
      return;
    }

    if (content && typeof content === "object") {
      this.element.innerHTML =
        "<b>" + escapeSummaryText(content.title || "") + "</b>" +
        (content.detail ? "<span>" + escapeSummaryText(content.detail) + "</span>" : "");
    } else {
      this.element.textContent = String(content || "");
    }
  },

  moveTo: function(clientX, clientY) {
    if (!this.element) {
      return;
    }

    this.element.style.left = Math.round(Number(clientX) || 0) + 14 + "px";
    this.element.style.top = Math.round(Number(clientY) || 0) + 14 + "px";
  },

  show: function(content, event) {
    var self = this;

    this.setup();
    this.hide(false);
    this.setContent(content);

    if (event) {
      this.moveTo(event.clientX, event.clientY);
    }

    this.showTimer = setTimeout(function() {
      if (!self.element) {
        return;
      }

      self.element.hidden = false;
      self.visible = true;
    }, this.delayMs);
  },

  hide: function(clearContent) {
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }

    if (this.element) {
      this.element.hidden = true;
      if (clearContent !== false) {
        this.element.textContent = "";
      }
    }

    this.visible = false;
  },

  bindEntityHover: function(target, resolver) {
    var self = this;

    if (!target || typeof target.addEventListener !== "function" || typeof resolver !== "function") {
      return false;
    }

    target.addEventListener("pointermove", function(event) {
      var content = resolver(event);

      if (!content) {
        self.hide();
        return;
      }

      if (self.visible) {
        self.setContent(content);
        self.moveTo(event.clientX, event.clientY);
      } else {
        self.show(content, event);
      }
    });
    target.addEventListener("pointerleave", function() {
      self.hide();
    });
    return true;
  }
};
