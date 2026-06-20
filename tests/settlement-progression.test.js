const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

const context = {
  assert,
  console,
  window: {
    addEventListener() {}
  },
  document: {
    getElementById() {
      return {
        getContext() {
          return {};
        },
        querySelector() {
          return {};
        }
      };
    },
    querySelectorAll() {
      return [];
    }
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "js/ui/dom-refs.js",
  "js/systems/state.js",
  "js/core/utils.js",
  "js/core/config.js",
  "js/core/world-grid.js",
  "js/sim/settlements-state.js",
  "js/sim/resource-registry.js",
  "js/sim/settlements-growth.js",
  "js/sim/civilizations-orbital.js",
  "js/sim/civilizations-probes.js",
  "js/sim/civilizations-stars.js",
  "js/sim/civilizations-empire.js",
  "js/sim/settlements-founding.js",
  "js/sim/settlements-routes.js",
  "js/sim/settlements-runtime.js",
  "js/sim/settlements.js",
  "js/sim/civilizations.js"
].map(read).join("\n");

vm.runInNewContext(`${source}

function countFoodInRadius() {
  return 0;
}

function removeFoodInRadius() {
  return 0;
}

var settlementPopulation = 12;

function countOrganismsInRadiusForLineage() {
  return settlementPopulation;
}

var indexedOrganismsByLineage = {};

function getIndexedOrganismsForLineage(lineageId) {
  return indexedOrganismsByLineage[String(lineageId)] || [];
}

function ensureOrganismTraits(organism) {
  organism.traits = organism.traits || {};
  organism.traits.intelligence = Number.isFinite(Number(organism.traits.intelligence))
    ? organism.traits.intelligence
    : CONFIG.TRAIT_INTELLIGENCE_DEFAULT;
  organism.traits.sociality = Number.isFinite(Number(organism.traits.sociality))
    ? organism.traits.sociality
    : CONFIG.TRAIT_SOCIALITY_DEFAULT;
  return organism.traits;
}

function isFertile() {
  return true;
}

world.tick = 10000;
world.settlements = [];
world.settlementRoutes = [];
settlements.ensureState();

var lowReadinessLineage = {
  id: 7,
  activeCount: CONFIG.SETTLEMENT_MIN_LINEAGE_POPULATION,
  peakPopulation: CONFIG.SETTLEMENT_MIN_LINEAGE_PEAK_POPULATION,
  isExtinct: false
};
indexedOrganismsByLineage[String(lowReadinessLineage.id)] = [];
for (var lowIndex = 0; lowIndex < CONFIG.SETTLEMENT_MIN_LINEAGE_POPULATION; lowIndex++) {
  indexedOrganismsByLineage[String(lowReadinessLineage.id)].push({
    x: 10 + lowIndex,
    y: 10,
    lineageId: lowReadinessLineage.id,
    traits: {
      intelligence: CONFIG.SETTLEMENT_MIN_LINEAGE_INTELLIGENCE - 0.1,
      sociality: CONFIG.SETTLEMENT_MIN_LINEAGE_SOCIALITY + 0.1
    }
  });
}
assert.strictEqual(canFoundSettlement(lowReadinessLineage), false, "low-intelligence lineage should not found settlements");
assert.ok(
  lowReadinessLineage.settlementReadiness.intelligence < CONFIG.SETTLEMENT_MIN_LINEAGE_INTELLIGENCE,
  "low-intelligence lineage should record readiness evidence"
);

var highReadinessLineage = {
  id: 8,
  activeCount: CONFIG.SETTLEMENT_MIN_LINEAGE_POPULATION,
  peakPopulation: CONFIG.SETTLEMENT_MIN_LINEAGE_PEAK_POPULATION,
  isExtinct: false
};
indexedOrganismsByLineage[String(highReadinessLineage.id)] = [];
for (var highIndex = 0; highIndex < CONFIG.SETTLEMENT_MIN_LINEAGE_POPULATION; highIndex++) {
  indexedOrganismsByLineage[String(highReadinessLineage.id)].push({
    x: 30 + highIndex,
    y: 12,
    lineageId: highReadinessLineage.id,
    traits: {
      intelligence: CONFIG.SETTLEMENT_MIN_LINEAGE_INTELLIGENCE + 0.1,
      sociality: CONFIG.SETTLEMENT_MIN_LINEAGE_SOCIALITY + 0.1
    }
  });
}
assert.strictEqual(canFoundSettlement(highReadinessLineage), true, "high-intelligence social lineage should found settlements");
assert.ok(foundSettlementForLineage(highReadinessLineage), "high-readiness lineage should create a settlement");
assert.strictEqual(world.settlements.length, 1, "only high-readiness lineage should found a settlement");

world.settlements = [];
world.settlementRoutes = [];
settlements.rebuildIndexes();

var seamLineage = {
  id: 99,
  activeCount: CONFIG.SETTLEMENT_MIN_LINEAGE_POPULATION,
  peakPopulation: CONFIG.SETTLEMENT_MIN_LINEAGE_PEAK_POPULATION,
  isExtinct: false
};

var seamOrganisms = [];
for (var seamIndex = 0; seamIndex < CONFIG.SETTLEMENT_MIN_LINEAGE_POPULATION; seamIndex++) {
  seamOrganisms.push({
    x: seamIndex % 3 === 0 ? 0 : (seamIndex % 3 === 1 ? 1 : WORLD_WIDTH - 1),
    y: 20,
    lineageId: seamLineage.id
  });
}
world.organisms = seamOrganisms;

var seamSettlement = makeSettlement(seamLineage, seamOrganisms);
assert.ok(seamSettlement, "wrap seam lineage should found a settlement");
assert.ok(
  seamSettlement.x <= 1 || seamSettlement.x >= WORLD_WIDTH - 1,
  "wrap seam settlement should be founded near the actual cluster center"
);

var westSettlement = settlements.makeAt(1, 0, 20, { isColony: true });
var eastSettlement = settlements.makeAt(1, WORLD_WIDTH - 1, 20, { isColony: true });
assert.strictEqual(
  getDistanceBetweenSettlements(westSettlement, eastSettlement),
  1,
  "settlement distance should use wrapped horizontal distance"
);

world.organisms = [];
world.settlements = [];
world.settlementRoutes = [];
settlements.rebuildIndexes();

var capital = settlements.makeAt(1, 20, 20, { isColony: true });
capital.storedFood = 500;
capital.development = 600;
capital.claimedTiles = 80;
capital.isActive = true;
settlements.updateMetrics(capital);

var outpost = settlements.makeAt(1, 45, 20, {
  parentSettlementId: capital.id,
  isOutpost: true,
  isColony: true
});
outpost.storedFood = 180;
outpost.development = 260;
outpost.claimedTiles = 40;
outpost.isActive = true;
settlements.updateMetrics(outpost);

world.settlements.push(capital, outpost);
settlements.rebuildIndexes();

var route = ensureSettlementRoute(capital, outpost);
route.isActive = true;
route.foodTransferred = 24;
rebuildSettlementRouteStats();

var routeStats = getSettlementRouteStats(capital.id);
assert.strictEqual(routeStats.routeCount, 1, "route stats should index settlement routes");
assert.strictEqual(routeStats.activeRoutes, 1, "route stats should count active routes");

var colonySummary = civilizations.updateColonyNetwork();
assert.ok(colonySummary.score >= CONFIG.SPACE_PROGRAM_MIN_NETWORK_SCORE, "colony network should reach space readiness score");
assert.strictEqual(world.colonyNetworkActiveRoutes, 1, "colony network should record active routes");

world.spaceProgramProgress = CONFIG.SPACE_PROGRAM_LAUNCH_THRESHOLD - 1;
civilizations.updateSpaceProgram(colonySummary);
assert.ok(world.orbitalLaunches > 0, "space progression should create orbital launches");

world.orbitalLaunches = Math.max(world.orbitalLaunches, 4);
civilizations.updateSpaceProgram(colonySummary);
civilizations.updatePlanetarySurvey();
assert.strictEqual(world.orbitalPlatformReady, true, "orbital infrastructure should unlock platform readiness");

world.planetarySurveyProgress = CONFIG.PLANETARY_DISCOVERY_THRESHOLD - 1;
world.lastPlanetarySurveyTick = 0;
civilizations.updatePlanetarySurvey();
assert.ok(world.planetaryBodies.length > 0, "planetary survey should discover bodies");

while (world.planetaryBodies.length < CONFIG.PROBE_MISSION_MIN_BODIES) {
  world.planetaryBodies.push(makePlanetaryBody());
}
world.probeMissionProgress = CONFIG.PROBE_MISSION_THRESHOLD - 1;
world.lastProbeMissionTick = 0;
civilizations.updateProbeMissions();
assert.ok(world.probeMissions.length > 0, "probe progression should launch missions");

while (world.probeMissions.length < CONFIG.STAR_MAP_MIN_COMPLETED_PROBES) {
  world.probeMissions.push(makeProbeMission());
}
for (var probeIndex = 0; probeIndex < world.probeMissions.length; probeIndex++) {
  world.probeMissions[probeIndex].isComplete = true;
}
world.starMapProgress = CONFIG.STAR_SYSTEM_DISCOVERY_THRESHOLD - 1;
world.lastStarMapTick = 0;
civilizations.updateStarMap();
assert.ok(world.starSystems.length > 0, "star map progression should discover systems");

while (world.starSystems.length < CONFIG.GALACTIC_INFLUENCE_MIN_SYSTEMS) {
  world.starSystems.push(makeStarSystem());
}
world.galacticInfluenceProgress = CONFIG.GALACTIC_SYSTEM_CLAIM_THRESHOLD - 1;
world.lastGalacticInfluenceTick = 0;
civilizations.updateGalacticInfluence();
assert.ok(getClaimedStarSystemCount() > 0, "galactic influence should claim star systems");

for (var systemIndex = 0; systemIndex < world.starSystems.length; systemIndex++) {
  world.starSystems[systemIndex].isClaimed = true;
}
world.interstellarFleetProgress = CONFIG.INTERSTELLAR_FLEET_BUILD_THRESHOLD - 1;
world.lastInterstellarFleetTick = 0;
civilizations.updateInterstellarFleets();
assert.ok(world.interstellarFleets.length > 0, "fleet progression should launch interstellar fleets");

while (world.interstellarFleets.length < CONFIG.EMPIRE_SECTOR_MIN_COMPLETED_FLEETS) {
  world.interstellarFleets.push(makeInterstellarFleet());
}
for (var fleetIndex = 0; fleetIndex < world.interstellarFleets.length; fleetIndex++) {
  world.interstellarFleets[fleetIndex].isComplete = true;
}
world.empireSectorProgress = CONFIG.EMPIRE_SECTOR_BUILD_THRESHOLD - 1;
world.lastEmpireSectorTick = 0;
civilizations.updateEmpireSectors();
assert.ok(world.empireSectors.length > 0, "sector progression should found empire sectors");

while (world.empireSectors.length < CONFIG.EMPIRE_LEGACY_MIN_SECTORS) {
  world.empireSectors.push(makeEmpireSector(world.starSystems[world.empireSectors.length]));
}
world.empireLegacyProgress = CONFIG.EMPIRE_LEGACY_THRESHOLD - 1;
world.lastEmpireLegacyTick = 0;
civilizations.updateEmpireLegacy();
assert.ok(world.empireLegacyLevel > 0, "legacy progression should advance empire legacy level");

settlementPopulation = 0;
var ghostTown = settlements.makeAt(1, 55, 25, {});
ghostTown.development = CONFIG.SETTLEMENT_LEVEL_DEVELOPMENT * 2 + 2;
ghostTown.storedFood = 0;
ghostTown.lastGrowthTick = world.tick;
settlements.updateMetrics(ghostTown);
assert.strictEqual(ghostTown.isActive, false, "test settlement should be empty before decay");
var ghostDevelopmentBeforeDecay = ghostTown.development;
for (var decayTick = 1; decayTick <= 100; decayTick++) {
  world.tick += 1;
  settlements.updateMetrics(ghostTown);
  runSettlementGrowth(ghostTown);
}
assert.ok(ghostTown.development < ghostDevelopmentBeforeDecay, "empty settlement should lose development over 100 ticks");
assert.ok(ghostTown.declineTicks > 0, "empty settlement should record decline intervals");
assert.strictEqual(ghostTown.isActive, false, "empty settlement should not become active from preserved development");

settlementPopulation = 0;
var regressingTown = settlements.makeAt(1, 65, 25, {});
regressingTown.development = CONFIG.SETTLEMENT_LEVEL_DEVELOPMENT * 2 + 2;
regressingTown.storedFood = 0;
regressingTown.lastGrowthTick = world.tick;
settlements.updateMetrics(regressingTown);
assert.strictEqual(regressingTown.level, 3, "regression fixture should start at level 3");
for (var regressionTick = 1; regressionTick <= 100; regressionTick++) {
  world.tick += 1;
  settlements.updateMetrics(regressingTown);
  runSettlementGrowth(regressingTown);
}
assert.strictEqual(regressingTown.level, 2, "settlement development decay should allow level 3 to regress to level 2");

console.log("settlement progression checks passed");
`, context);
