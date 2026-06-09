"use strict";
PS.epochs = {
  entries: {},
  order: [],
  activeId: "",
  current: function() {
    return this.activeId || world.era;
  },
  register: function(id, definition) {
    var epochId = String(id || "").trim();

    if (!epochId) {
      throw new Error("Epoch id is required");
    }

    this.entries[epochId] = definition || {};

    if (this.order.indexOf(epochId) < 0) {
      this.order.push(epochId);
    }

    return this.entries[epochId];
  },
  get: function(id) {
    return this.entries[String(id || "")] || null;
  },
  detectTransition: function() {
    for (var i = 0; i < this.order.length; i++) {
      var entry = this.entries[this.order[i]];

      if (entry && typeof entry.detect === "function" && entry.detect(world)) {
        return this.order[i];
      }
    }

    return this.current();
  },
  setEra: function(era) {
    var nextEra = String(era || world.era || "Organisms");
    var previousEra = this.current();
    var previousEntry = this.get(previousEra);
    var nextEntry = this.get(nextEra);

    if (previousEntry && previousEra !== nextEra && typeof previousEntry.exit === "function") {
      previousEntry.exit(nextEra);
    }

    world.era = nextEra;
    this.activeId = nextEra;

    if (nextEntry && previousEra !== nextEra && typeof nextEntry.enter === "function") {
      nextEntry.enter(previousEra);
    }

    return world.era;
  },
  updateCurrent: function(dt) {
    var epochId = this.current();
    var entry = this.get(epochId);

    if (entry && typeof entry.update === "function") {
      entry.update(dt);
      return epochId;
    }

    return "";
  }
};
