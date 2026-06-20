const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

function makeButton(filter) {
  return {
    className: "",
    listeners: {},
    attributes: {
      "data-timeline-filter": filter
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
}

const allButton = makeButton("all");
const extinctionButton = makeButton("extinction");
const speciationButton = makeButton("speciation");
const lineageButton = makeButton("lineage");
const civilizationButton = makeButton("civilization");

const lineageTrackingStub = {
  selected: [],
  eventMatches(event) {
    return event.lineageId === 7 || event.speciesId === 13;
  },
  select(event) {
    this.selected.push(event);
    return event;
  }
};

const context = {
  console,
  focusedTiles: [],
  focusedLocations: [],
  inspectedTiles: [],
  lineageTracking: lineageTrackingStub,
  PS: {
    ui: {},
    sim: {
      lineageTracking: lineageTrackingStub
    }
  },
  world: {
    timelineFilter: "all",
    selectedTimelineEvent: null,
    needsRender: false,
    timelineEvents: [
      {
        type: "civilization.first-city",
        label: "First city",
        detail: "settlement level 4",
        tick: 30,
        deepTime: 12000,
        category: "civilization",
        inspectTarget: { type: "tile", x: 5, y: 6 }
      },
      {
        type: "biology.speciation",
        label: "Speciation",
        detail: "lineage branch",
        tick: 10,
        deepTime: 3000,
        category: "biology",
        lineageId: 7,
        speciesId: 13,
        location: { latitude: 12.5, longitude: -44 }
      },
      {
        type: "extinction.mass",
        label: "Mass extinction",
        detail: "catastrophe",
        tick: 20,
        deepTime: 6000,
        category: "extinction"
      }
    ]
  },
  timelineFilterButtons: [allButton, extinctionButton, speciationButton, lineageButton, civilizationButton],
  timelineList: {
    className: "",
    textContent: "",
    innerHTML: "",
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
  },
  escapeSummaryText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
  setElementText(element, text) {
    element.textContent = text;
  },
  setElementHtml(element, html) {
    element.innerHTML = html;
  },
  setElementClass(element, className) {
    element.className = className;
  },
  inspectTile(x, y) {
    context.inspectedTiles.push({ x, y });
  },
  focusPlanetViewOnLatLon(latitude, longitude) {
    context.focusedLocations.push({ latitude, longitude });
  }
};

vm.runInNewContext(read("js/ui/timeline.js"), context);

context.PS.ui.timeline.setup();

let events = context.PS.ui.timeline.getFilteredEvents();
assert.strictEqual(events[0].type, "biology.speciation", "timeline should sort events chronologically");
assert.strictEqual(events[2].type, "civilization.first-city", "timeline should keep later events last");
assert.ok(context.timelineList.innerHTML.indexOf("First city") >= 0, "timeline should render event labels");

context.world.timelineFilter = "speciation";
events = context.PS.ui.timeline.getFilteredEvents();
assert.strictEqual(events.length, 1, "speciation filter should match event type");
assert.strictEqual(events[0].type, "biology.speciation", "speciation filter should keep speciation event");

context.world.timelineFilter = "civilization";
events = context.PS.ui.timeline.getFilteredEvents();
assert.strictEqual(events.length, 1, "civilization filter should match event category");
assert.strictEqual(events[0].type, "civilization.first-city", "civilization filter should keep city event");

context.world.timelineFilter = "lineage";
events = context.PS.ui.timeline.getFilteredEvents();
assert.strictEqual(events.length, 1, "lineage filter should use selected lineage matcher");
assert.strictEqual(events[0].type, "biology.speciation", "lineage filter should keep matching species event");

context.world.timelineFilter = "civilization";
context.PS.ui.timeline.focusEvent(context.PS.ui.timeline.getFilteredEvents()[0]);
assert.deepStrictEqual(context.inspectedTiles[0], { x: 5, y: 6 }, "tile event should inspect and focus target tile");
assert.strictEqual(context.world.selectedTimelineEvent.tick, 30, "selected event should retain event time");

context.world.timelineFilter = "speciation";
context.PS.ui.timeline.focusEvent(context.PS.ui.timeline.getFilteredEvents()[0]);
assert.deepStrictEqual(context.focusedLocations[0], { latitude: 12.5, longitude: -44 }, "location event should focus lat/lon");
assert.strictEqual(context.world.needsRender, true, "location focus should request render");
assert.strictEqual(context.lineageTracking.selected.length, 1, "timeline focus should select matching lineage target");

console.log("timeline viewer checks passed");
