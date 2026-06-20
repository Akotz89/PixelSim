const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

function createElement(tagName) {
  const listeners = {};
  const element = {
    tagName: tagName.toUpperCase(),
    id: "",
    className: "",
    hidden: false,
    parentNode: null,
    children: [],
    style: {},
    attributes: {},
    textContent: "",
    _innerHTML: "",
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) {
        this.children.splice(index, 1);
      }
      child.parentNode = null;
      return child;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name] || null;
    },
    addEventListener(name, handler) {
      listeners[name] = listeners[name] || [];
      listeners[name].push(handler);
    },
    removeEventListener(name, handler) {
      listeners[name] = (listeners[name] || []).filter((item) => item !== handler);
    },
    dispatch(name, event) {
      (listeners[name] || []).slice().forEach((handler) => handler(event || { target: this }));
    },
    querySelector(selector) {
      if (selector === "[data-modal-action='confirm']") {
        return this.children.find((child) => child.attributes["data-modal-action"] === "confirm") || null;
      }
      if (selector === "[data-modal-action='cancel']") {
        return this.children.find((child) => child.attributes["data-modal-action"] === "cancel") || null;
      }
      return null;
    }
  };

  Object.defineProperty(element, "innerHTML", {
    get() {
      return this._innerHTML;
    },
    set(value) {
      this._innerHTML = String(value || "");
      if (this._innerHTML.indexOf("data-modal-action") >= 0) {
        const cancel = createElement("button");
        const confirm = createElement("button");
        cancel.setAttribute("data-modal-action", "cancel");
        confirm.setAttribute("data-modal-action", "confirm");
        this.children = [];
        this.appendChild(cancel);
        this.appendChild(confirm);
      }
    }
  });

  Object.defineProperty(element, "_listeners", { value: listeners });
  return element;
}

const body = createElement("body");
const document = {
  body,
  createElement(tagName) {
    return createElement(tagName);
  }
};

const context = {
  assert,
  console,
  document,
  window: {
    addEventListener() {}
  },
  setTimeout(callback) {
    callback();
    return 1;
  },
  clearTimeout() {},
  escapeSummaryText(value) {
    return String(value == null ? "" : value);
  }
};

vm.runInNewContext([
  read("js/core/namespace.js"),
  read("js/ui/component.js"),
  read("js/ui/panel-manager.js"),
  read("js/ui/tooltip.js"),
  read("js/ui/modal.js")
].join("\n"), context);

const tooltip = context.tooltip;
const modal = context.modal;
assert.ok(tooltip, "tooltip should be available as a direct module export");
assert.ok(modal, "modal should be available as a direct module export");

const parent = createElement("div");
const component = new context.PS.ui.UIComponent({ id: "test-panel", parent });
let clicks = 0;
component.render();
component.on(component.element, "click", () => { clicks++; });
component.element.dispatch("click");
assert.strictEqual(clicks, 1, "component should bind events");
component.hide();
assert.strictEqual(component.element.hidden, true, "component hide should hide its element");
component.show();
assert.strictEqual(component.element.hidden, false, "component show should reveal its element");
component.destroy();
component.element = createElement("section");
component.element.dispatch("click");
assert.strictEqual(clicks, 1, "component destroy should clean event bindings");

const panelA = createElement("section");
const panelB = createElement("section");
context.PS.ui.panelManager.register("ecosystem", panelA);
context.PS.ui.panelManager.register("inspect", panelB);
assert.strictEqual(context.PS.ui.panelManager.show("ecosystem"), true, "panel manager should show registered panels");
assert.strictEqual(panelA.hidden, false, "shown panel should be visible");
assert.strictEqual(context.PS.ui.panelManager.hide("ecosystem"), true, "panel manager should hide registered panels");
assert.strictEqual(panelA.hidden, true, "hidden panel should be hidden");
context.PS.ui.panelManager.show("ecosystem");
context.PS.ui.panelManager.show("inspect");
assert.strictEqual(
  JSON.stringify(context.PS.ui.panelManager.getState().stack),
  JSON.stringify(["ecosystem", "inspect"]),
  "panel manager should track z-order stack"
);

tooltip.show({ title: "Organism", detail: "Tile 1, 2" }, { clientX: 4, clientY: 8 });
assert.strictEqual(tooltip.element.hidden, false, "tooltip should appear after delay");
assert.ok(tooltip.element.innerHTML.indexOf("Organism") >= 0, "tooltip should support rich content");
tooltip.hide();
assert.strictEqual(tooltip.element.hidden, true, "tooltip hide should hide tooltip");

const hoverTarget = createElement("canvas");
tooltip.bindEntityHover(hoverTarget, () => ({ title: "Food", detail: "Tile 3, 4" }));
hoverTarget.dispatch("pointermove", { clientX: 12, clientY: 14, target: hoverTarget });
assert.strictEqual(tooltip.element.hidden, false, "tooltip should appear from hover resolver");
assert.ok(tooltip.element.innerHTML.indexOf("Food") >= 0, "hover tooltip should use resolver content");
hoverTarget.dispatch("pointerleave", { target: hoverTarget });
assert.strictEqual(tooltip.element.hidden, true, "tooltip should hide on pointer leave");

modal.confirm({ title: "Save", message: "Save now?", confirmLabel: "Save" }).then((confirmed) => {
  assert.strictEqual(confirmed, true, "modal confirm should resolve true when confirmed");
  console.log("ui component system checks passed");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});

const modalConfirm = modal.dialog.querySelector("[data-modal-action='confirm']");
modalConfirm.dispatch("click", { target: modalConfirm });
