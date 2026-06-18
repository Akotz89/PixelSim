import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { normalizeLongitude } from "../render/planet-view.js";
import { clonePersistencePlainValue } from "../systems/persistence-db.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";
import { bookmarkAddButton, bookmarkLabelInput, bookmarkList, bookmarkNoteInput } from "./dom-refs.js";
import { setElementClass, setElementHtml, setElementText } from "./foundation.js";
import { inspectTile } from "./inspect.js";

PS.ui = PS.ui || {};

var bookmarksMaxBookmarks = 100;
var bookmarksMaxLabelLength = 64;
var bookmarksMaxNoteLength = 240;

function escapeBookmarkText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanBookmarkText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getBookmarkCameraSnapshot() {
  var view = PS.camera && typeof PS.camera.getView === "function"
    ? PS.camera.getView()
    : (world.planetView || {});

  return {
    zoomLevel: Number(view.zoomLevel) || 0,
    latitude: clamp(Number(view.latitude) || 0, -90, 90),
    longitude: normalizeLongitude(view.longitude),
    panEastMeters: Number(view.panEastMeters) || 0,
    panNorthMeters: Number(view.panNorthMeters) || 0
  };
}

function getBookmarkDeepTimeYears() {
  if (PS.deepTime && typeof PS.deepTime.getCurrentYears === "function") {
    return Math.max(0, Number(PS.deepTime.getCurrentYears()) || 0);
  }

  return Math.max(0, Number(world.deepTimeYears) || 0);
}

function findBookmarkSelectedTimelineEvent() {
  var selected = world.selectedTimelineEvent;
  var events = Array.isArray(world.timelineEvents) ? world.timelineEvents : [];

  if (!selected) {
    return null;
  }

  for (var i = 0; i < events.length; i++) {
    if (
      String(events[i].type || "event") === String(selected.type || "event") &&
      Math.round(Number(events[i].tick) || 0) === Math.round(Number(selected.tick) || 0)
    ) {
      return events[i];
    }
  }

  return selected;
}

function copyBookmarkEventTarget(event, source) {
  if (!event) {
    return null;
  }

  return {
    type: "event",
    source: source || "timeline",
    eventType: event.type || "event",
    category: event.category || event.type || "event",
    label: cleanBookmarkText(event.label || "Event", bookmarksMaxLabelLength),
    tick: Math.max(0, Math.round(Number(event.tick) || 0)),
    deepTime: event.deepTime || null,
    location: event.location ? clonePersistencePlainValue(event.location) : null,
    inspectTarget: event.inspectTarget ? clonePersistencePlainValue(event.inspectTarget) : null,
    lineageId: Math.max(0, Math.round(Number(event.lineageId) || 0)),
    speciesId: Math.max(0, Math.round(Number(event.speciesId || event.id) || 0)),
    populationId: Math.max(0, Math.round(Number(event.populationId) || 0))
  };
}

function getBookmarkCurrentTarget() {
  var event = findBookmarkSelectedTimelineEvent();
  var tracked = world.trackedLineage || null;

  if (world.spotlightState && world.spotlightState.active && world.spotlightEvent) {
    return copyBookmarkEventTarget(world.spotlightEvent, "spotlight");
  }

  if (event) {
    return copyBookmarkEventTarget(event, "timeline");
  }

  if (tracked) {
    return {
      type: "lineage",
      label: cleanBookmarkText(tracked.label || "Lineage", bookmarksMaxLabelLength),
      lineageId: Math.max(0, Math.round(Number(tracked.lineageId) || 0)),
      speciesId: Math.max(0, Math.round(Number(tracked.speciesId) || 0)),
      populationId: Math.max(0, Math.round(Number(tracked.populationId) || 0)),
      representativeId: Math.max(0, Math.round(Number(tracked.representativeId) || 0))
    };
  }

  if (world.inspectedTile) {
    return {
      type: "tile",
      x: clamp(Math.round(Number(world.inspectedTile.x) || 0), 0, WORLD_WIDTH - 1),
      y: clamp(Math.round(Number(world.inspectedTile.y) || 0), 0, WORLD_HEIGHT - 1),
      surface: world.inspectedSurface ? clonePersistencePlainValue(world.inspectedSurface) : null,
      entity: world.inspectedEntity ? clonePersistencePlainValue(world.inspectedEntity) : null
    };
  }

  return { type: "camera" };
}

function getBookmarkTargetLabel(target) {
  if (!target) {
    return "Camera";
  }

  if (target.type === "event") {
    return target.label || "Event";
  }

  if (target.type === "lineage") {
    return target.label || "Lineage";
  }

  if (target.type === "tile") {
    return "Tile " + target.x + "," + target.y;
  }

  return "Camera";
}

/** Normalizes persisted bookmark-like input into the runtime bookmark record shape. */
function normalizeBookmarkRecord(bookmark) {
  var source = bookmark || {};
  var id = cleanBookmarkText(source.id || ("B" + (world.nextBookmarkId || 1)), 24);
  var target = source.target ? clonePersistencePlainValue(source.target) : { type: "camera" };
  var camera = source.camera ? clonePersistencePlainValue(source.camera) : getBookmarkCameraSnapshot();

  return {
    id: id,
    label: cleanBookmarkText(source.label || getBookmarkTargetLabel(target), bookmarksMaxLabelLength),
    note: cleanBookmarkText(source.note || "", bookmarksMaxNoteLength),
    createdTick: Math.max(0, Math.round(Number(source.createdTick) || Number(source.tick) || 0)),
    tick: Math.max(0, Math.round(Number(source.tick) || 0)),
    deepTimeYears: Math.max(0, Number(source.deepTimeYears) || 0),
    epoch: cleanBookmarkText(source.epoch || "-", 40),
    camera: {
      zoomLevel: Number(camera.zoomLevel) || 0,
      latitude: clamp(Number(camera.latitude) || 0, -90, 90),
      longitude: normalizeLongitude(camera.longitude),
      panEastMeters: Number(camera.panEastMeters) || 0,
      panNorthMeters: Number(camera.panNorthMeters) || 0
    },
    target: target,
    screenshotRef: cleanBookmarkText(source.screenshotRef || "", 160)
  };
}

function restoreBookmarkRecords(bookmarks, nextId) {
  var source = Array.isArray(bookmarks) ? bookmarks : [];
  var restored = [];
  var highest = 0;

  for (var i = 0; i < source.length && restored.length < bookmarksMaxBookmarks; i++) {
    var bookmark = normalizeBookmarkRecord(source[i]);
    var numberPart = Number(String(bookmark.id).replace(/^B/, ""));

    if (Number.isFinite(numberPart)) {
      highest = Math.max(highest, Math.round(numberPart));
    }

    restored.push(bookmark);
  }

  world.bookmarks = restored;
  world.nextBookmarkId = Math.max(highest + 1, Math.round(Number(nextId) || 1));
  return world.bookmarks;
}

/** Creates a bookmark for the current target and camera context. */
function createBookmarkRecord(options) {
  options = options || {};

  if (!Array.isArray(world.bookmarks)) {
    world.bookmarks = [];
  }

  if (!Number.isFinite(Number(world.nextBookmarkId)) || world.nextBookmarkId < 1) {
    world.nextBookmarkId = 1;
  }

  var target = options.target ? clonePersistencePlainValue(options.target) : getBookmarkCurrentTarget();
  var id = "B" + Math.max(1, Math.round(Number(world.nextBookmarkId) || 1));
  var bookmark = normalizeBookmarkRecord({
    id: id,
    label: options.label || getBookmarkTargetLabel(target),
    note: options.note || "",
    createdTick: world.tick,
    tick: world.tick,
    deepTimeYears: getBookmarkDeepTimeYears(),
    epoch: world.era || "-",
    camera: getBookmarkCameraSnapshot(),
    target: target,
    screenshotRef: options.screenshotRef || ""
  });

  world.nextBookmarkId++;
  world.bookmarks.unshift(bookmark);

  while (world.bookmarks.length > bookmarksMaxBookmarks) {
    world.bookmarks.pop();
  }

  syncBookmarks();
  return bookmark;
}

function getBookmarkRecord(id) {
  var bookmarks = Array.isArray(world.bookmarks) ? world.bookmarks : [];

  for (var i = 0; i < bookmarks.length; i++) {
    if (bookmarks[i].id === id) {
      return bookmarks[i];
    }
  }

  return null;
}

function updateBookmarkRecord(id, patch) {
  var bookmark = getBookmarkRecord(id);

  if (!bookmark) {
    return null;
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, "label")) {
    bookmark.label = cleanBookmarkText(patch.label, bookmarksMaxLabelLength) || bookmark.label;
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, "note")) {
    bookmark.note = cleanBookmarkText(patch.note, bookmarksMaxNoteLength);
  }

  syncBookmarks();
  return bookmark;
}

function deleteBookmarkRecord(id) {
  var bookmarks = Array.isArray(world.bookmarks) ? world.bookmarks : [];

  for (var i = 0; i < bookmarks.length; i++) {
    if (bookmarks[i].id === id) {
      bookmarks.splice(i, 1);
      syncBookmarks();
      return true;
    }
  }

  return false;
}

function findBookmarkMatchingEvent(target) {
  var events = Array.isArray(world.timelineEvents) ? world.timelineEvents : [];

  for (var i = 0; i < events.length; i++) {
    if (
      String(events[i].type || "event") === String(target.eventType || "event") &&
      Math.round(Number(events[i].tick) || 0) === Math.round(Number(target.tick) || 0)
    ) {
      return events[i];
    }
  }

  return null;
}

function getBookmarkStatus(bookmark) {
  var target = bookmark && bookmark.target ? bookmark.target : {};

  if (target.type === "event") {
    return findBookmarkMatchingEvent(target) ? "active" : "stale event";
  }

  if (target.type === "lineage") {
    if (target.lineageId && world.lineages && world.lineages[String(target.lineageId)]) {
      return world.lineages[String(target.lineageId)].isExtinct ? "extinct lineage" : "active";
    }

    return "stale lineage";
  }

  if (target.type === "tile") {
    return target.x >= 0 && target.x < WORLD_WIDTH && target.y >= 0 && target.y < WORLD_HEIGHT ? "active" : "stale tile";
  }

  return "camera";
}

function applyBookmarkCamera(camera) {
  if (!camera) {
    return;
  }

  world.planetView = {
    zoomLevel: Number(camera.zoomLevel) || 0,
    latitude: clamp(Number(camera.latitude) || 0, -90, 90),
    longitude: normalizeLongitude(camera.longitude),
    panEastMeters: Number(camera.panEastMeters) || 0,
    panNorthMeters: Number(camera.panNorthMeters) || 0
  };

  if (PS.camera && typeof PS.camera.stopInertia === "function") {
    PS.camera.stopInertia();
  }
}

/** Restores a bookmark camera and focuses its associated target. */
function jumpToBookmarkRecord(id) {
  var bookmark = getBookmarkRecord(id);
  var target;
  var event;

  if (!bookmark) {
    return false;
  }

  applyBookmarkCamera(bookmark.camera);
  target = bookmark.target || {};

  if (target.type === "event") {
    event = findBookmarkMatchingEvent(target) || target;
    if (PS.ui.timeline && typeof PS.ui.timeline.focusEvent === "function") {
      PS.ui.timeline.focusEvent(event);
    }
  } else if (target.type === "lineage" && PS.sim && PS.sim.lineageTracking && typeof PS.sim.lineageTracking.select === "function") {
    PS.sim.lineageTracking.select(target, { pinned: true });
  } else if (target.type === "tile" && typeof inspectTile === "function") {
    inspectTile(target.x, target.y, false, target.surface || null, target.entity || null);
  }

  world.needsRender = true;
  syncBookmarks();
  return true;
}

function formatBookmarkTime(bookmark) {
  if (PS.deepTime && typeof PS.deepTime.formatYears === "function" && bookmark.deepTimeYears > 0) {
    return PS.deepTime.formatYears(bookmark.deepTimeYears);
  }

  return "T" + Math.max(0, Math.round(Number(bookmark.tick) || 0));
}

function makeBookmarkItemHtml(bookmark) {
  var status = getBookmarkStatus(bookmark);
  var captureRef = bookmark.screenshotRef
    ? "<small>" + escapeBookmarkText("Capture: " + bookmark.screenshotRef) + "</small>"
    : "";

  return (
    "<article class=\"bookmark-item bookmark-" + escapeBookmarkText(status.split(" ")[0]) + "\" data-bookmark-id=\"" + escapeBookmarkText(bookmark.id) + "\">" +
    "<button class=\"bookmark-jump\" type=\"button\" data-bookmark-action=\"jump\">" +
    "<b>" + escapeBookmarkText(bookmark.label) + "</b>" +
    "<span>" + escapeBookmarkText(formatBookmarkTime(bookmark) + " / " + status) + "</span>" +
    "</button>" +
    "<p>" + escapeBookmarkText(bookmark.note || getBookmarkTargetLabel(bookmark.target)) + "</p>" +
    captureRef +
    "<div class=\"bookmark-actions\">" +
    "<button type=\"button\" data-bookmark-action=\"edit\">Note</button>" +
    "<button type=\"button\" data-bookmark-action=\"delete\">Delete</button>" +
    "</div>" +
    "</article>"
  );
}

/** Synchronizes the bookmark list UI with current world state. */
function syncBookmarks() {
  if (!bookmarkList) {
    return;
  }

  var bookmarks = Array.isArray(world.bookmarks) ? world.bookmarks : [];

  if (bookmarks.length === 0) {
    setElementClass(bookmarkList, "bookmark-list empty");
    setElementText(bookmarkList, "BOOKMARKS: -");
    return;
  }

  setElementClass(bookmarkList, "bookmark-list");
  setElementHtml(bookmarkList, bookmarks.map(makeBookmarkItemHtml).join(""));
}

function setupBookmarks() {
  if (bookmarkAddButton) {
    bookmarkAddButton.addEventListener("click", function() {
      createBookmarkRecord({
        label: bookmarkLabelInput ? bookmarkLabelInput.value : "",
        note: bookmarkNoteInput ? bookmarkNoteInput.value : ""
      });

      if (bookmarkLabelInput) {
        bookmarkLabelInput.value = "";
      }

      if (bookmarkNoteInput) {
        bookmarkNoteInput.value = "";
      }
    });
  }

  if (bookmarkList) {
    bookmarkList.addEventListener("click", function(event) {
      var actionTarget = event.target.closest("[data-bookmark-action]");
      var item = event.target.closest("[data-bookmark-id]");
      var id = item ? item.getAttribute("data-bookmark-id") : "";
      var action = actionTarget ? actionTarget.getAttribute("data-bookmark-action") : "";
      var bookmark = getBookmarkRecord(id);

      if (!bookmark) {
        return;
      }

      if (action === "jump") {
        jumpToBookmarkRecord(id);
      } else if (action === "delete") {
        deleteBookmarkRecord(id);
      } else if (action === "edit") {
        updateBookmarkRecord(id, {
          note: window.prompt ? window.prompt("Note", bookmark.note || "") : bookmark.note
        });
      }
    });
  }

  syncBookmarks();
}

/**
 * Builds the public bookmarks UI API from module-scoped helpers.
 */
function createBookmarksApi() {
  return {
    setup: setupBookmarks,
    sync: syncBookmarks,
    create: createBookmarkRecord,
    createFromCurrentContext: createBookmarkRecord,
    update: updateBookmarkRecord,
    delete: deleteBookmarkRecord,
    get: getBookmarkRecord,
    getStatus: getBookmarkStatus,
    jumpTo: jumpToBookmarkRecord,
    restore: restoreBookmarkRecords,
    cleanText: cleanBookmarkText
  };
}

PS.ui.bookmarks = createBookmarksApi();
