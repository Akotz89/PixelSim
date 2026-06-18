const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  console,
  window: {},
  PS: {
    ui: {
      timeline: {
        sync() {
          context.timelineSynced = true;
        }
      }
    },
    sim: {
      lineageTracking: {
        select(species, options) {
          context.selected = { species, options };
          context.world.trackedLineage = {
            speciesId: species.id,
            lineageId: species.lineageId
          };
          return context.world.trackedLineage;
        }
      }
    }
  },
  CONFIG: {
    TERRAIN_FERTILE: 1
  },
  WORLD_WIDTH: 16,
  WORLD_HEIGHT: 10,
  evolutionTreeFilterButtons: [],
  evolutionTreeActionButtons: [],
  evolutionTreeView: null,
  selected: null,
  timelineSynced: false,
  focused: null,
  Math,
  Number,
  String,
  Array,
  Object,
  JSON,
  Boolean,
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  },
  setElementClass(element, className) {
    if (element) {
      element.className = className;
    }
  },
  setElementHtml(element, html) {
    if (element) {
      element.innerHTML = html;
    }
  },
  focusPlanetViewOnLatLon(latitude, longitude) {
    context.focused = { latitude, longitude };
  },
  focusPlanetViewOnTile(x, y) {
    context.focused = { x, y };
  }
};

context.world = {
  tick: 500,
  needsRender: false,
  trackedLineage: {
    speciesId: 3,
    lineageId: 7
  },
  terrain: new Array(16 * 10).fill(0),
  planetTiles: new Array(16 * 10).fill(null).map(function(_, index) {
    return { biome: index % 2 === 0 ? "reef" : "plain" };
  }),
  lineages: {
    "7": { id: 7, isExtinct: false }
  },
  speciesById: {},
  species: [
    {
      id: 1,
      parentId: 0,
      lineageId: 7,
      createdTick: 10,
      activePopulation: 30,
      population: 50,
      traitMean: { bodySize: 0.5, carnivory: 0.1, intelligence: 0.2 },
      range: { minX: 2, maxX: 4, minY: 2, maxY: 4, cells: 4 },
      location: { latitude: 2, longitude: 3 },
      isActive: true,
      isExtinct: false
    },
    {
      id: 2,
      parentId: 1,
      lineageId: 7,
      createdTick: 100,
      activePopulation: 0,
      population: 18,
      traitMean: { bodySize: 0.8, carnivory: 0.4, intelligence: 0.1 },
      range: { minX: 5, maxX: 6, minY: 3, maxY: 5, cells: 3 },
      location: { x: 5, y: 3 },
      isActive: false,
      isExtinct: true
    },
    {
      id: 3,
      parentId: 1,
      lineageId: 7,
      createdTick: 200,
      activePopulation: 2,
      population: 20,
      traitMean: { bodySize: 1.5, carnivory: 0.7, intelligence: 0.5 },
      range: { minX: 7, maxX: 8, minY: 5, maxY: 6, cells: 2 },
      location: { latitude: 8, longitude: 9 },
      isActive: true,
      isExtinct: false
    },
    {
      id: 4,
      parentId: 0,
      lineageId: 9,
      createdTick: 210,
      activePopulation: 12,
      population: 12,
      traitMean: { bodySize: 0.3, sociality: 0.9, intelligence: 0.6 },
      range: { minX: 9, maxX: 10, minY: 5, maxY: 6, cells: 2 },
      location: { x: 9, y: 5 },
      isActive: true,
      isExtinct: false
    }
  ],
  timelineEvents: [
    { type: "biology.speciation", tick: 100, speciesId: 2, id: 2 },
    { type: "biology.speciation", tick: 200, speciesId: 3, id: 3 },
    { type: "extinction.event", tick: 300, affectedSpecies: [{ id: 2, losses: 12 }] }
  ]
};

context.world.species.forEach(function(species) {
  context.world.speciesById[String(species.id)] = species;
});

vm.createContext(context);
vm.runInContext(read("js/ui/evolutionary-tree.js"), context, { filename: "js/ui/evolutionary-tree.js" });

const graph = vm.runInContext("PS.ui.evolutionaryTree.buildGraph()", context);
assert.strictEqual(graph.nodes.length, 4, "tree should expose all species nodes");
assert.strictEqual(graph.links.length, 2, "tree should link child species to parents");
assert.ok(graph.nodes.some(function(node) {
  return node.id === 3 && node.status === "selected" && node.eventCount === 1;
}), "selected species should have selected visual state and event count");
assert.ok(graph.nodes.some(function(node) {
  return node.id === 2 && node.status === "extinct" && node.eventCount === 2;
}), "extinct species should include extinction/speciation event metadata");
assert.ok(graph.nodes.some(function(node) {
  return node.id === 1 && node.childCount === 2 && node.range.indexOf("cells") > 0;
}), "parent node should include child count and range metadata");

const activeGraph = vm.runInContext("PS.ui.evolutionaryTree.setFilter('active')", context);
assert.ok(activeGraph.nodes.every(function(node) {
  return node.status !== "extinct";
}), "active filter should hide extinct branches");

const selectedGraph = vm.runInContext("PS.ui.evolutionaryTree.setFilter('selected')", context);
const selectedIds = Array.from(selectedGraph.nodes.map(function(node) {
  return node.id;
}).sort());
assert.deepStrictEqual(selectedIds, [1, 3], "selected branch filter should show ancestor path");

context.world.trackedLineage = { lineageId: 7 };
const lineageGraph = vm.runInContext("PS.ui.evolutionaryTree.setFilter('selected')", context);
const lineageIds = Array.from(lineageGraph.nodes.map(function(node) {
  return node.id;
}).sort());
assert.deepStrictEqual(lineageIds, [1, 2, 3], "lineage-only selected filter should hide unrelated lineages");

assert.strictEqual(vm.runInContext("PS.ui.evolutionaryTree.selectNode(3)", context), true);
assert.strictEqual(context.selected.species.id, 3, "clicking a node should select lineage/species");
assert.strictEqual(context.selected.options.pinned, true, "node selection should pin lineage tracking");
assert.deepStrictEqual(context.focused, { latitude: 8, longitude: 9 }, "node selection should focus map target");
assert.strictEqual(context.timelineSynced, true, "node selection should sync timeline");
assert.strictEqual(context.world.needsRender, true, "node selection should request render");

context.world.species = [];
context.world.speciesById = {};
context.world.timelineEvents = [];
context.world.trackedLineage = null;
for (let i = 1; i <= 60; i++) {
  const species = {
    id: i,
    parentId: i > 1 ? i - 1 : 0,
    lineageId: i,
    createdTick: i,
    activePopulation: 10,
    population: 10,
    traitMean: { bodySize: 0.1 },
    range: { minX: 1, maxX: 1, minY: 1, maxY: 1, cells: 1 },
    isActive: true,
    isExtinct: false
  };
  context.world.species.push(species);
  context.world.speciesById[String(species.id)] = species;
}
const longGraph = vm.runInContext("PS.ui.evolutionaryTree.setFilter('all')", context);
assert.strictEqual(longGraph.nodes.length, 48, "long simulations should cap visible nodes");
assert.strictEqual(longGraph.hidden, 12, "long simulations should report collapsed branches");

console.log("evolutionary tree checks passed", JSON.stringify({
  nodes: longGraph.nodes.length,
  links: graph.links.length
}));
