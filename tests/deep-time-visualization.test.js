const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function makeButton(filter) {
  return {
    className: "",
    attributes: { "data-timeline-filter": filter },
    addEventListener() {},
    getAttribute(name) { return this.attributes[name]; },
    setAttribute(name, value) { this.attributes[name] = value; }
  };
}

const context = {
  console,
  PS: {
    systems: {},
    ui: {},
    render: {
      surfaceRender: {
        invalidateTerrainCache() {
          context.cacheInvalidated = true;
        }
      },
      terrain: {
        invalidateCache() {
          context.cacheInvalidated = true;
        }
      }
    },
    epochs: {
      current() {
        return context.world.era;
      },
      setEra(era) {
        context.world.era = era;
      }
    },
    time: {
      clearedManualScale: false,
      clearManualTimeScale() {
        this.clearedManualScale = true;
      },
      updateAdaptiveTimeScale(force) {
        this.forceUpdated = force;
      }
    }
  },
  world: {
    deepTimeYears: 650000000,
    era: "microbial",
    timelineFilter: "all",
    timelineEvents: [
      { type: "planet.cooling", label: "Crust cooled", tick: 1, deepTime: 250000000, category: "geology" },
      { type: "biology.bloom", label: "First bloom", tick: 2, deepTime: { years: 700000000 }, category: "biology" }
    ],
    needsRender: false
  },
  cacheInvalidated: false,
  timelineFilterButtons: [makeButton("all")],
  timelineList: {
    className: "",
    innerHTML: "",
    addEventListener(type, handler) {
      this.listener = handler;
    }
  },
  escapeSummaryText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
  setElementHtml(element, html) {
    element.innerHTML = html;
  },
  setElementText(element, text) {
    element.textContent = text;
  },
  setElementClass(element, className) {
    element.className = className;
  },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
};

vm.runInNewContext(read("js/systems/deep-time.js"), context);
vm.runInNewContext(read("js/ui/timeline.js"), context);
vm.runInNewContext(read("js/render/terrain.js"), context);

const segments = context.PS.deepTime.getTimelineSegments();
assert.ok(segments.some(segment => segment.name === "Hadean"), "timeline should include Hadean era marker");
assert.ok(segments.some(segment => segment.name === "Archean"), "timeline should include Archean era marker");
assert.ok(segments.some(segment => segment.label.indexOf("First bloom") >= 0), "era labels should include simulation events");

context.PS.ui.timeline.setup();
assert.ok(context.timelineList.innerHTML.indexOf("deep-time-bar") >= 0, "timeline should render deep-time bar");
assert.ok(context.timelineList.innerHTML.indexOf("First bloom") >= 0, "timeline should keep event labels");

context.timelineList.listener({
  target: {
    closest(selector) {
      if (selector === "[data-deep-time-era]") {
        return {
          getAttribute() {
            return "hadean";
          }
        };
      }
      return null;
    }
  }
});

assert.strictEqual(context.world.deepTimeYears, 0, "era click should jump deep-time position");
assert.strictEqual(context.world.era, "primordial", "era click should set matching epoch");
assert.strictEqual(context.world.needsRender, true, "era click should request render");
assert.strictEqual(context.cacheInvalidated, true, "era click should invalidate terrain cache");
assert.strictEqual(context.PS.time.clearedManualScale, true, "era click should restore adaptive time scale");

const earlyForest = context.PS.render.terrain.getBiomeColor("forest");
context.world.deepTimeYears = 4300000000;
const lateForest = context.PS.render.terrain.getBiomeColor("forest");
assert.notStrictEqual(earlyForest, lateForest, "terrain colors should shift across geological time");

console.log("deep-time visualization checks passed");
