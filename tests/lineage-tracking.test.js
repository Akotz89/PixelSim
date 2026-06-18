const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  console,
  PS: {
    sim: {},
    core: {
      traitSchema: {
        copy(source) {
          return Object.assign({}, source || {});
        }
      }
    }
  },
  WORLD_WIDTH: 32,
  WORLD_HEIGHT: 18,
  world: {
    tick: 50,
    needsRender: false,
    lineages: {
      "7": {
        id: 7,
        parentId: 0,
        activeCount: 12,
        peakPopulation: 30,
        founderTraits: { bodySize: 1.1, carnivory: 0.2 },
        isExtinct: false
      }
    },
    species: [{
      id: 13,
      parentId: 5,
      lineageId: 7,
      traitMean: { bodySize: 1.6, carnivory: 0.7, terrainAffinity: 0.8, intelligence: 0.4 },
      divergence: 0.66,
      activePopulation: 12,
      population: 30,
      range: { minX: 9, maxX: 13, minY: 8, maxY: 10, cells: 4 },
      isExtinct: false
    }],
    speciesById: {},
    biologyPopulations: [{
      id: 17,
      speciesId: 13,
      lineageId: 7,
      count: 12,
      traitMean: { bodySize: 1.5, carnivory: 0.65, waterDependency: 0.2 },
      territoryCells: [{ x: 12, y: 9, density: 3 }],
      representativeIds: [19],
      speciation: { divergence: 0.66 }
    }],
    biologyPopulationById: {},
    biologyRepresentatives: [{
      id: 19,
      populationId: 17,
      speciesId: 13,
      lineageId: 7,
      x: 12,
      y: 9,
      traits: { bodySize: 1.5, carnivory: 0.65, intelligence: 0.4 },
      morphologyPreview: { label: "large terrestrial predator" }
    }],
    biologyRepresentativeById: {},
    organisms: [
      { x: 12, y: 9, lineageId: 7, speciesId: 13 },
      { x: 13, y: 9, lineageId: 7, speciesId: 13 },
      { x: 2, y: 2, lineageId: 2, speciesId: 2 }
    ],
    terrain: new Array(32 * 18).fill(0),
    timelineEvents: [
      { tick: 10, type: "biology.speciation", label: "Speciation", lineageId: 7, speciesId: 13, id: 13 },
      { tick: 20, type: "extinction.event", label: "Extinction", losses: { bySpecies: { "13": 4 } } },
      { tick: 30, type: "civilization.first-city", label: "Other", lineageId: 3, speciesId: 3 }
    ],
    planetTiles: []
  },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  },
  getTileManhattanDistance(fromX, fromY, toX, toY) {
    return Math.abs(fromX - toX) + Math.abs(fromY - toY);
  },
  collectOrganismsInRadius(tileX, tileY, radius, lineageId) {
    return context.world.organisms.filter((organism) => {
      return organism.lineageId === lineageId &&
        Math.abs(organism.x - tileX) <= radius &&
        Math.abs(organism.y - tileY) <= radius;
    });
  }
};

context.world.speciesById["13"] = context.world.species[0];
context.world.biologyPopulationById["17"] = context.world.biologyPopulations[0];
context.world.biologyRepresentativeById["19"] = context.world.biologyRepresentatives[0];

vm.runInNewContext(read("js/sim/lineage-tracking.js"), context);

const tracked = context.PS.sim.lineageTracking.selectFromRepresentative(19, { pinned: true });
assert.strictEqual(tracked.lineageId, 7, "representative selection should track stable lineage id");
assert.strictEqual(tracked.speciesId, 13, "representative selection should track stable species id");
assert.strictEqual(tracked.pinned, true, "tracked lineage should pin to HUD state");
assert.strictEqual(tracked.status, "active", "active population should keep tracked lineage alive");

const summary = context.PS.sim.lineageTracking.getSummary();
assert.strictEqual(summary.label, "S13 / L7", "summary should expose stable species/lineage label");
assert.strictEqual(summary.parentSpeciesId, 5, "summary should expose parent species");
assert.strictEqual(summary.population, 12, "summary should expose current population");
assert.ok(summary.traits.some((entry) => entry.indexOf("carnivory") === 0), "summary should expose dominant traits");
assert.strictEqual(summary.range, "4 cells / barren", "summary should expose bounded range and biome label");
assert.strictEqual(summary.morphology, "large terrestrial predator", "summary should expose representative morphology");
assert.strictEqual(summary.recentEvents.length, 2, "summary should include lineage/species extinction and speciation events");
assert.ok(context.PS.sim.lineageTracking.eventMatches(context.world.timelineEvents[0]), "lineage event filter should match speciation payload");
assert.ok(context.PS.sim.lineageTracking.eventMatches(context.world.timelineEvents[1]), "lineage event filter should match affected extinction species");
assert.strictEqual(context.PS.sim.lineageTracking.eventMatches(context.world.timelineEvents[2]), false, "lineage event filter should reject unrelated events");
assert.ok(context.PS.sim.lineageTracking.getHighlightAt(12, 9) > 0.8, "lineage highlight should mark visible members");
assert.ok(context.PS.sim.lineageTracking.getHighlightAt(11, 9) > 0, "lineage highlight should mark aggregate range");

for (let i = 0; i < 40; i++) {
  context.world.tick++;
  context.world.species[0].activePopulation = Math.max(0, 12 - i);
  context.PS.sim.lineageTracking.update(false);
}

assert.ok(context.world.trackedLineage.history.length <= 24, "lineage history should stay bounded");
assert.strictEqual(context.world.trackedLineage.status, "extinct", "tracked lineage should show extinct state instead of disappearing");

console.log("lineage tracking checks passed");
