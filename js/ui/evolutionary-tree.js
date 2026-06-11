"use strict";
PS.ui = PS.ui || {};

PS.ui.evolutionaryTree = (function() {
  var state = {
    filter: "all",
    zoom: 1,
    panX: 0,
    panY: 0,
    maxNodes: 48
  };
  var traitKeys = ["bodySize", "carnivory", "intelligence", "sociality", "thermalTolerance", "waterDependency"];

  function escapeText(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getSpeciesRecords() {
    var species = Array.isArray(world.species) ? world.species.slice() : [];

    species.sort(function(a, b) {
      return (Number(a.createdTick) || 0) - (Number(b.createdTick) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    return species;
  }

  function eventMatchesSpecies(event, species) {
    if (!event || !species) {
      return false;
    }

    if (
      Number(event.speciesId) === Number(species.id) ||
      String(event.type || "").indexOf("speciation") >= 0 && Number(event.id) === Number(species.id)
    ) {
      return true;
    }

    if (Array.isArray(event.affectedSpecies)) {
      for (var i = 0; i < event.affectedSpecies.length; i++) {
        if (Number(event.affectedSpecies[i].id) === Number(species.id)) {
          return true;
        }
      }
    }

    return event.losses && event.losses.bySpecies && event.losses.bySpecies[String(species.id)] !== undefined;
  }

  function getEventCount(species) {
    var events = Array.isArray(world.timelineEvents) ? world.timelineEvents : [];
    var count = 0;

    for (var i = 0; i < events.length; i++) {
      if (eventMatchesSpecies(events[i], species)) {
        count++;
      }
    }

    return count;
  }

  function getDominantTraits(traits) {
    var scored = [];

    for (var i = 0; i < traitKeys.length; i++) {
      var key = traitKeys[i];
      var value = Number(traits && traits[key]);

      if (Number.isFinite(value)) {
        scored.push({ key: key, value: value });
      }
    }

    scored.sort(function(a, b) {
      return b.value - a.value || a.key.localeCompare(b.key);
    });

    return scored.slice(0, 3).map(function(item) {
      return item.key + " " + item.value.toFixed(2);
    });
  }

  function getBiomeForRange(range) {
    if (!range) {
      return "-";
    }

    var x = clamp(Math.round((Number(range.minX) + Number(range.maxX)) / 2), 0, WORLD_WIDTH - 1);
    var y = clamp(Math.round((Number(range.minY) + Number(range.maxY)) / 2), 0, WORLD_HEIGHT - 1);
    var tile = world.planetTiles && world.planetTiles[y * WORLD_WIDTH + x];

    if (tile && tile.biome) {
      return String(tile.biome);
    }

    return world.terrain && world.terrain[y * WORLD_WIDTH + x] === CONFIG.TERRAIN_FERTILE ? "fertile" : "barren";
  }

  function isSelectedSpecies(species) {
    var tracked = world.trackedLineage || null;

    if (!tracked) {
      return false;
    }

    if (Number(tracked.speciesId) > 0) {
      return Number(tracked.speciesId) === Number(species.id);
    }

    return Number(tracked.lineageId) === Number(species.lineageId);
  }

  function getNodeStatus(species) {
    if (isSelectedSpecies(species)) {
      return "selected";
    }

    if (species.isExtinct || species.isActive === false || Number(species.activePopulation) <= 0) {
      return "extinct";
    }

    var activePopulation = Math.max(0, Math.round(Number(species.activePopulation) || Number(species.population) || 0));
    var peakPopulation = Math.max(activePopulation, Math.round(Number(species.population) || activePopulation || 1));
    var risk = activePopulation / Math.max(1, peakPopulation);

    return risk <= 0.25 ? "endangered" : "active";
  }

  function makeNode(species, index, childCounts) {
    var status = getNodeStatus(species);
    var traits = getDominantTraits(species.traitMean || species.founderTraits);
    var range = species.range || null;

    return {
      id: Math.max(1, Math.round(Number(species.id) || index + 1)),
      parentId: Math.max(0, Math.round(Number(species.parentId) || 0)),
      lineageId: Math.max(1, Math.round(Number(species.lineageId) || species.id || 1)),
      label: "S" + Math.max(1, Math.round(Number(species.id) || index + 1)),
      status: status,
      selected: status === "selected",
      createdTick: Math.max(0, Math.round(Number(species.createdTick) || 0)),
      ageTicks: Math.max(0, Math.round(Number(world.tick) || 0) - Math.max(0, Math.round(Number(species.createdTick) || 0))),
      population: Math.max(0, Math.round(Number(species.activePopulation) || Number(species.population) || 0)),
      parentLabel: species.parentId ? "S" + species.parentId : "founder",
      traits: traits,
      range: range ? Math.max(0, Math.round(Number(range.cells) || 0)) + " cells / " + getBiomeForRange(range) : "-",
      eventCount: getEventCount(species),
      childCount: childCounts[String(species.id)] || 0
    };
  }

  function isAncestorOfSelected(speciesById, species, selectedId) {
    var cursor = species;

    while (cursor) {
      if (Number(cursor.id) === Number(selectedId)) {
        return true;
      }

      cursor = speciesById[String(cursor.parentId)] || null;
    }

    return false;
  }

  function filterSpeciesRecords(species, speciesById) {
    var tracked = world.trackedLineage || null;
    var selectedSpeciesId = tracked ? Number(tracked.speciesId) || 0 : 0;
    var selectedLineageId = tracked ? Number(tracked.lineageId) || 0 : 0;
    var filtered = species.filter(function(record) {
      if (state.filter === "active") {
        var status = getNodeStatus(record);
        return status === "active" || status === "endangered" || status === "selected";
      }

      if (state.filter === "extinct") {
        return getNodeStatus(record) === "extinct";
      }

      if (state.filter === "selected" && selectedSpeciesId > 0) {
        return isAncestorOfSelected(speciesById, record, selectedSpeciesId) ||
          isAncestorOfSelected(speciesById, speciesById[String(selectedSpeciesId)], record.id);
      }

      if (state.filter === "selected" && selectedLineageId > 0) {
        return Number(record.lineageId) === selectedLineageId;
      }

      return true;
    });
    var hidden = Math.max(0, filtered.length - state.maxNodes);

    if (hidden > 0) {
      filtered = filtered.slice(filtered.length - state.maxNodes);
    }

    return { nodes: filtered, hidden: hidden };
  }

  function buildGraph() {
    var species = getSpeciesRecords();
    var speciesById = {};
    var childCounts = {};
    var bounded;
    var nodes = [];

    for (var i = 0; i < species.length; i++) {
      speciesById[String(species[i].id)] = species[i];
      if (species[i].parentId) {
        childCounts[String(species[i].parentId)] = (childCounts[String(species[i].parentId)] || 0) + 1;
      }
    }

    bounded = filterSpeciesRecords(species, speciesById);

    for (var n = 0; n < bounded.nodes.length; n++) {
      nodes.push(makeNode(bounded.nodes[n], n, childCounts));
    }

    var visibleIds = {};
    var links = [];

    for (var v = 0; v < nodes.length; v++) {
      visibleIds[String(nodes[v].id)] = true;
    }

    for (var l = 0; l < nodes.length; l++) {
      if (nodes[l].parentId && visibleIds[String(nodes[l].parentId)]) {
        links.push({ from: nodes[l].parentId, to: nodes[l].id });
      }
    }

    return { nodes: layoutNodes(nodes), links: links, hidden: bounded.hidden };
  }

  function layoutNodes(nodes) {
    var depthById = {};
    var rowsByDepth = {};

    function getDepth(node) {
      if (!node || !node.parentId) {
        return 0;
      }

      if (depthById[String(node.id)] !== undefined) {
        return depthById[String(node.id)];
      }

      var parent = null;
      for (var i = 0; i < nodes.length; i++) {
        if (Number(nodes[i].id) === Number(node.parentId)) {
          parent = nodes[i];
          break;
        }
      }

      depthById[String(node.id)] = parent ? getDepth(parent) + 1 : 0;
      return depthById[String(node.id)];
    }

    for (var n = 0; n < nodes.length; n++) {
      var depth = getDepth(nodes[n]);
      rowsByDepth[String(depth)] = rowsByDepth[String(depth)] || 0;
      nodes[n].x = depth * 178;
      nodes[n].y = rowsByDepth[String(depth)] * 92;
      rowsByDepth[String(depth)]++;
    }

    return nodes;
  }

  function makeLinks(graph) {
    var byId = {};
    var html = [];

    for (var i = 0; i < graph.nodes.length; i++) {
      byId[String(graph.nodes[i].id)] = graph.nodes[i];
    }

    for (var l = 0; l < graph.links.length; l++) {
      var from = byId[String(graph.links[l].from)];
      var to = byId[String(graph.links[l].to)];

      if (from && to) {
        html.push("<line x1=\"" + (from.x + 132) + "\" y1=\"" + (from.y + 36) + "\" x2=\"" + to.x + "\" y2=\"" + (to.y + 36) + "\" />");
      }
    }

    return html.join("");
  }

  function makeNodeHtml(node) {
    return (
      "<button class=\"evolution-node evolution-" + escapeText(node.status) + "\" type=\"button\" data-evolution-species=\"" + node.id + "\" style=\"left:" + node.x + "px;top:" + node.y + "px\">" +
      "<b>" + escapeText(node.label + " / L" + node.lineageId) + "</b>" +
      "<span>" + escapeText(node.parentLabel + " / " + node.status) + "</span>" +
      "<small>" + escapeText("age " + node.ageTicks + " pop " + node.population + " events " + node.eventCount) + "</small>" +
      "<small>" + escapeText(node.range) + "</small>" +
      "<small>" + escapeText(node.traits.length ? node.traits.join(", ") : "-") + "</small>" +
      "</button>"
    );
  }

  function render() {
    if (!evolutionTreeView) {
      return null;
    }

    var graph = buildGraph();
    var width = 360;
    var height = 180;
    var html = [];

    for (var i = 0; i < graph.nodes.length; i++) {
      width = Math.max(width, graph.nodes[i].x + 168);
      height = Math.max(height, graph.nodes[i].y + 92);
    }

    html.push(
      "<div class=\"evolution-tree-canvas\" style=\"width:" + width + "px;height:" + height + "px;transform:translate(" + state.panX + "px," + state.panY + "px) scale(" + state.zoom.toFixed(2) + ")\">",
      "<svg class=\"evolution-links\" viewBox=\"0 0 " + width + " " + height + "\" aria-hidden=\"true\">" + makeLinks(graph) + "</svg>"
    );

    for (var n = 0; n < graph.nodes.length; n++) {
      html.push(makeNodeHtml(graph.nodes[n]));
    }

    if (graph.hidden > 0) {
      html.push("<span class=\"evolution-hidden\">+" + graph.hidden + " older branches collapsed</span>");
    }

    html.push("</div>");
    setElementClass(evolutionTreeView, "evolution-tree-view");
    setElementHtml(evolutionTreeView, html.join(""));
    syncFilters();
    return graph;
  }

  function syncFilters() {
    for (var i = 0; i < evolutionTreeFilterButtons.length; i++) {
      var button = evolutionTreeFilterButtons[i];
      var active = button.getAttribute("data-evolution-tree-filter") === state.filter;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.className = active ? "active" : "";
    }
  }

  function selectNode(speciesId) {
    var species = world.speciesById && world.speciesById[String(speciesId)] || null;
    var location;

    if (!species) {
      var speciesRecords = getSpeciesRecords();
      for (var i = 0; i < speciesRecords.length; i++) {
        if (Number(speciesRecords[i].id) === Number(speciesId)) {
          species = speciesRecords[i];
          break;
        }
      }
    }

    if (!species) {
      return false;
    }

    if (PS.sim && PS.sim.lineageTracking && typeof PS.sim.lineageTracking.select === "function") {
      PS.sim.lineageTracking.select(species, { pinned: true });
    }

    location = species.location || null;
    if (
      location &&
      Number.isFinite(Number(location.latitude)) &&
      Number.isFinite(Number(location.longitude)) &&
      typeof focusPlanetViewOnLatLon === "function"
    ) {
      focusPlanetViewOnLatLon(location.latitude, location.longitude);
    } else if (
      location &&
      Number.isFinite(Number(location.x)) &&
      Number.isFinite(Number(location.y)) &&
      typeof focusPlanetViewOnTile === "function"
    ) {
      focusPlanetViewOnTile(location.x, location.y);
    }

    if (PS.ui.timeline && typeof PS.ui.timeline.sync === "function") {
      PS.ui.timeline.sync();
    }

    world.needsRender = true;
    render();
    return true;
  }

  function adjustView(action) {
    if (action === "zoom-in") {
      state.zoom = clamp(state.zoom + 0.15, 0.55, 1.8);
    } else if (action === "zoom-out") {
      state.zoom = clamp(state.zoom - 0.15, 0.55, 1.8);
    } else {
      state.zoom = 1;
      state.panX = 0;
      state.panY = 0;
    }

    render();
  }

  function setup() {
    for (var i = 0; i < evolutionTreeFilterButtons.length; i++) {
      evolutionTreeFilterButtons[i].addEventListener("click", function(event) {
        state.filter = event.currentTarget.getAttribute("data-evolution-tree-filter") || "all";
        render();
      });
    }

    for (var a = 0; a < evolutionTreeActionButtons.length; a++) {
      evolutionTreeActionButtons[a].addEventListener("click", function(event) {
        adjustView(event.currentTarget.getAttribute("data-evolution-tree-action") || "reset");
      });
    }

    if (evolutionTreeView) {
      evolutionTreeView.addEventListener("click", function(event) {
        var node = event.target.closest("[data-evolution-species]");
        if (node) {
          selectNode(Number(node.getAttribute("data-evolution-species")) || 0);
        }
      });
      evolutionTreeView.addEventListener("wheel", function(event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.ctrlKey || event.metaKey) {
          state.zoom = clamp(state.zoom + (event.deltaY < 0 ? 0.08 : -0.08), 0.55, 1.8);
        } else {
          state.panX -= event.deltaX || 0;
          state.panY -= event.deltaY || 0;
        }
        render();
      }, { passive: false });
    }

    render();
  }

  return {
    setup: setup,
    sync: render,
    buildGraph: buildGraph,
    selectNode: selectNode,
    getState: function() {
      return { filter: state.filter, zoom: state.zoom, panX: state.panX, panY: state.panY };
    },
    setFilter: function(filter) {
      state.filter = filter || "all";
      return render() || buildGraph();
    }
  };
})();
