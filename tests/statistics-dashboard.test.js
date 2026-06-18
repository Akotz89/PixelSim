const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  console,
  Math,
  Number,
  Object,
  String,
  Array,
  window: {},
  CONFIG: {
    SIM_SUMMARY_UPDATE_INTERVAL: 12,
    TERRAIN_FERTILE: 1
  },
  WORLD_WIDTH: 4,
  WORLD_HEIGHT: 3,
  clamp: function(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
};

context.PS = {
  deepTime: {
    formatYears: function(years) {
      return Math.round(years) + " y";
    }
  },
  time: {
    getTimeScaleLabel: function() {
      return "epoch-scale";
    }
  },
  render: {
    overlays: {
      get: function(id) {
        return id === "observation.atmosphere" ? { semantic: "Atmosphere" } : null;
      }
    }
  }
};

context.world = {
  tick: 44,
  era: "Microbial",
  deepTimeYears: 123456,
  speed: 2,
  activeObservationOverlay: "observation.atmosphere",
  organisms: [{}, {}, {}],
  food: [{}, {}, {}, {}, {}],
  biologyPopulations: [
    { id: 1, speciesId: 1, lineageId: 1, count: 30, territoryCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
    { id: 2, speciesId: 2, lineageId: 2, count: 10, territoryCells: [{ x: 2, y: 1 }] },
    { id: 3, speciesId: 3, lineageId: 3, count: 5, territoryCells: [{ x: 3, y: 2 }] }
  ],
  speciesSummary: {
    activeCount: 3,
    totalCount: 5,
    extinctCount: 2,
    recentSpeciationCount: 1,
    topSpecies: [{ id: 1, activeCount: 30 }]
  },
  populationTraitSummary: {
    bodySize: 0.62,
    carnivory: 0.21,
    intelligence: 0.18,
    sociality: 0.44,
    thermalTolerance: 0.73
  },
  foodWebSummary: {
    predatorPressure: 0.36,
    trophicBalance: 74
  },
  terrainPressureSummary: {
    pressure: 0.31
  },
  atmosphere: {
    oxygenPercent: 3.5,
    carbonDioxidePpm: 8200,
    temperatureC: 31.2,
    ozoneIndex: 0.42,
    anomaly: "greenhouse pulse"
  },
  geology: {
    volcanicActivity: 0.67,
    hydrothermalVentCount: 9
  },
  abiogenesis: {
    maxComplexity: 0.58
  },
  microbial: {
    totalDensity: 0.27
  },
  microbialReady: true,
  terrain: [
    1, 1, 0, 0,
    1, 0, 0, 0,
    0, 0, 0, 1
  ],
  planetTiles: [
    { biome: "reef" }, { biome: "reef" }, { biome: "basalt" }, { biome: "basalt" },
    { biome: "plain" }, { biome: "basalt" }, { biome: "plain" }, { biome: "plain" },
    { biome: "ice" }, { biome: "ice" }, { biome: "plain" }, { biome: "ice" }
  ],
  statisticsDashboard: null
};

vm.createContext(context);
vm.runInContext(read("js/ui/statistics-dashboard.js"), context, { filename: "js/ui/statistics-dashboard.js" });

const summary = {
  population: 3,
  food: 5,
  foodRunwayTicks: 20,
  resourceBalance: "gaining"
};
const snapshot = vm.runInContext("getStatisticsDashboardSnapshot(summary)", Object.assign(context, { summary }));

assert.strictEqual(snapshot.tick, 44);
assert.strictEqual(snapshot.epoch, "Microbial");
assert.strictEqual(snapshot.deepTime, "123456 y");
assert.strictEqual(snapshot.timeScale, "epoch-scale");
assert.strictEqual(snapshot.overlay, "Atmosphere");
assert.strictEqual(snapshot.microbialStatus, "microbial 0.27");
assert.strictEqual(snapshot.totalOrganisms, 3);
assert.strictEqual(snapshot.estimatedIndividuals, 45);
assert.deepStrictEqual(JSON.parse(JSON.stringify(snapshot.species)), {
  active: 3,
  total: 5,
  extinct: 2,
  recent: 1
});
assert.strictEqual(snapshot.extinctionCount, 2);
assert.ok(snapshot.biodiversity.index > 0, "biodiversity index should use population distribution");
assert.strictEqual(snapshot.biodiversity.activeGroups, 3);
assert.strictEqual(Math.round(snapshot.biodiversity.topShare * 100), 67);
assert.strictEqual(snapshot.biomeMix.topBiome, "reef");
assert.strictEqual(snapshot.biomeMix.biomeCount, 3);
assert.strictEqual(snapshot.food, 5);
assert.strictEqual(snapshot.foodRunwayTicks, 20);
assert.strictEqual(snapshot.resourceBalance, "gaining");
assert.strictEqual(snapshot.energyPressure, 0.36);
assert.strictEqual(snapshot.trophicBalance, 74);
assert.strictEqual(snapshot.traitDistribution.length, 5);
assert.strictEqual(snapshot.traitDistribution[0].key, "bodySize");
assert.strictEqual(snapshot.environment.oxygen, 3.5);
assert.strictEqual(snapshot.environment.carbonDioxide, 8200);
assert.strictEqual(snapshot.environment.temperature, 31.2);
assert.strictEqual(snapshot.environment.ozone, 0.42);
assert.strictEqual(snapshot.environment.volcanic, 0.67);
assert.strictEqual(snapshot.environment.hydrothermalVents, 9);
assert.strictEqual(snapshot.environment.anomaly, "greenhouse pulse");
assert.strictEqual(snapshot.updatedEveryTicks, 12);
assert.strictEqual(context.world.statisticsDashboard, snapshot);

console.log("statistics dashboard checks passed", JSON.stringify({
  biodiversity: snapshot.biodiversity.index,
  traits: snapshot.traitDistribution.length
}));
