const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const lineageTrackingStub = {
  select: function(target, options) {
    context.selectedLineage = { target, options };
    return true;
  }
};

const context = {
  console,
  window: {
    prompt: function() {
      return "edited note";
    },
    lineageTracking: lineageTrackingStub
  },
  PS: {
    ui: {
      timeline: {
        focusEvent: function(event) {
          context.focusedEvent = event;
          return true;
        }
      }
    },
    sim: {
      lineageTracking: lineageTrackingStub
    },
    camera: {
      getView: function() {
        return context.world.planetView;
      },
      stopInertia: function() {
        context.stoppedInertia = true;
      }
    },
    deepTime: {
      getCurrentYears: function() {
        return context.world.deepTimeYears;
      },
      formatYears: function(years) {
        return Math.round(years) + " years";
      }
    }
  },
  WORLD_WIDTH: 10,
  WORLD_HEIGHT: 8,
  bookmarkLabelInput: null,
  bookmarkNoteInput: null,
  bookmarkAddButton: null,
  bookmarkList: null,
  focusedEvent: null,
  selectedLineage: null,
  inspected: null,
  stoppedInertia: false,
  Math,
  Number,
  String,
  Array,
  Object,
  JSON,
  Boolean,
  RegExp,
  Date,
  clamp: function(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },
  normalizeLongitude: function(value) {
    return ((Number(value) || 0) + 540) % 360 - 180;
  },
  clonePersistencePlainValue: function(value) {
    if (value === null || value === undefined) {
      return value;
    }

    return JSON.parse(JSON.stringify(value));
  },
  setElementClass: function(element, className) {
    if (element) {
      element.className = className;
    }
  },
  setElementText: function(element, text) {
    if (element) {
      element.textContent = text;
    }
  },
  setElementHtml: function(element, html) {
    if (element) {
      element.innerHTML = html;
    }
  },
  inspectTile: function(x, y, shouldFocus, surface, entity) {
    context.inspected = { x, y, shouldFocus, surface, entity };
  }
};

context.window.window = context.window;
context.world = {
  tick: 321,
  era: "Microbial",
  deepTimeYears: 456789,
  planetView: {
    zoomLevel: 3,
    latitude: 12.5,
    longitude: -33.25,
    panEastMeters: 10,
    panNorthMeters: -20
  },
  bookmarks: [],
  nextBookmarkId: 1,
  timelineEvents: [{
    type: "speciation",
    tick: 300,
    label: "Split",
    category: "speciation",
    lineageId: 7,
    speciesId: 13,
    populationId: 17,
    location: { latitude: 9, longitude: 11 },
    inspectTarget: { type: "tile", x: 2, y: 3 }
  }],
  selectedTimelineEvent: {
    type: "speciation",
    tick: 300
  },
  spotlightState: {
    active: false
  },
  spotlightEvent: null,
  trackedLineage: null,
  inspectedTile: null,
  inspectedSurface: null,
  inspectedEntity: null,
  lineages: {
    "7": { id: 7, isExtinct: false }
  },
  needsRender: false
};

vm.createContext(context);
vm.runInContext(read("js/ui/bookmarks.js"), context, { filename: "js/ui/bookmarks.js" });

const eventBookmark = vm.runInContext("PS.ui.bookmarks.create({ note: '  first split\\ntracked  ' })", context);
assert.strictEqual(eventBookmark.id, "B1");
assert.strictEqual(eventBookmark.label, "Split");
assert.strictEqual(eventBookmark.note, "first split tracked");
assert.strictEqual(eventBookmark.epoch, "Microbial");
assert.strictEqual(eventBookmark.tick, 321);
assert.strictEqual(eventBookmark.deepTimeYears, 456789);
assert.strictEqual(eventBookmark.camera.zoomLevel, 3);
assert.strictEqual(eventBookmark.target.type, "event");
assert.strictEqual(eventBookmark.target.eventType, "speciation");
assert.strictEqual(eventBookmark.target.lineageId, 7);
assert.strictEqual(context.world.nextBookmarkId, 2);
assert.strictEqual(vm.runInContext("PS.ui.bookmarks.getStatus(world.bookmarks[0])", context), "active");

context.world.selectedTimelineEvent = null;
context.world.trackedLineage = {
  label: "S13 / L7",
  lineageId: 7,
  speciesId: 13,
  populationId: 17,
  representativeId: 19
};
const lineageBookmark = vm.runInContext("PS.ui.bookmarks.create({ label: 'Lineage watch', note: 'survived' })", context);
assert.strictEqual(lineageBookmark.id, "B2");
assert.strictEqual(lineageBookmark.target.type, "lineage");
assert.strictEqual(lineageBookmark.target.speciesId, 13);
assert.strictEqual(vm.runInContext("PS.ui.bookmarks.getStatus(world.bookmarks[0])", context), "active");

const captureBookmark = vm.runInContext("PS.ui.bookmarks.create({ label: 'Capture', screenshotRef: 'pixeldarium-seed-microbial.png' })", context);
assert.strictEqual(captureBookmark.screenshotRef, "pixeldarium-seed-microbial.png");
assert.ok(vm.runInContext("PS.ui.bookmarks.get('B3').screenshotRef", context).indexOf("pixeldarium") >= 0);

context.world.lineages["7"].isExtinct = true;
assert.strictEqual(vm.runInContext("PS.ui.bookmarks.getStatus(world.bookmarks[0])", context), "extinct lineage");

context.world.lineages = {};
assert.strictEqual(vm.runInContext("PS.ui.bookmarks.getStatus(world.bookmarks[0])", context), "stale lineage");

const updated = vm.runInContext("PS.ui.bookmarks.update('B2', { note: 'updated note', label: '' })", context);
assert.strictEqual(updated.label, "Lineage watch");
assert.strictEqual(updated.note, "updated note");

context.world.planetView = {
  zoomLevel: 0,
  latitude: 0,
  longitude: 0,
  panEastMeters: 0,
  panNorthMeters: 0
};
assert.strictEqual(vm.runInContext("PS.ui.bookmarks.jumpTo('B1')", context), true);
assert.strictEqual(context.focusedEvent.type, "speciation");
assert.strictEqual(context.world.planetView.latitude, 12.5);
assert.strictEqual(context.stoppedInertia, true);
assert.strictEqual(context.world.needsRender, true);

context.world.inspectedTile = { x: 4, y: 5 };
context.world.inspectedSurface = { latitude: 1.5, longitude: 2.5 };
context.world.inspectedEntity = { type: "food", x: 4, y: 5 };
context.world.trackedLineage = null;
const tileBookmark = vm.runInContext("PS.ui.bookmarks.create({})", context);
assert.strictEqual(tileBookmark.target.type, "tile");
assert.strictEqual(tileBookmark.target.entity.type, "food");
assert.strictEqual(vm.runInContext("PS.ui.bookmarks.jumpTo('" + tileBookmark.id + "')", context), true);
assert.deepStrictEqual(context.inspected, {
  x: 4,
  y: 5,
  shouldFocus: false,
  surface: { latitude: 1.5, longitude: 2.5 },
  entity: { type: "food", x: 4, y: 5 }
});

vm.runInContext("PS.ui.bookmarks.restore([{ id: 'B9', label: 'Old', note: 'Restored', tick: 9, target: { type: 'camera' }, camera: { zoomLevel: 1, latitude: 2, longitude: 3 } }], 4)", context);
assert.strictEqual(context.world.bookmarks.length, 1);
assert.strictEqual(context.world.bookmarks[0].id, "B9");
assert.strictEqual(context.world.nextBookmarkId, 10);

assert.strictEqual(vm.runInContext("PS.ui.bookmarks.delete('B9')", context), true);
assert.strictEqual(context.world.bookmarks.length, 0);

console.log("bookmark checks passed", JSON.stringify({
  created: 4,
  nextBookmarkId: context.world.nextBookmarkId
}));
