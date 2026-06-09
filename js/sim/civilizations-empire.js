// SCAFFOLDING: This file is a progress bar, not a game system. Redesign required.
// Freeze new features here until intelligence, predation/body traits, and real technology progression exist.

function updateInterstellarFleetReadiness() {
  ensureInterstellarFleetState();
  updateInterstellarFleetTravel();

  var maxMissions = Math.max(1, Math.round(Number(CONFIG.INTERSTELLAR_FLEET_MAX_MISSIONS) || 1));
  world.interstellarFleetReady = Boolean(
    getClaimedStarSystemCount() >= CONFIG.INTERSTELLAR_FLEET_MIN_CLAIMED_SYSTEMS &&
    world.interstellarFleets.length < maxMissions &&
    getInterstellarFleetEndpoints()
  );

  updateInterstellarFleetEra();
  return world.interstellarFleetReady;
}

function updateInterstellarFleetState() {
  if (!updateInterstellarFleetReadiness()) {
    return;
  }

  var buildInterval = Math.max(1, Math.round(Number(CONFIG.INTERSTELLAR_FLEET_BUILD_INTERVAL) || 1));

  if (world.tick - world.lastInterstellarFleetTick < buildInterval) {
    return;
  }

  world.lastInterstellarFleetTick = world.tick;
  world.interstellarFleetProgress +=
    getClaimedStarSystemCount() * CONFIG.INTERSTELLAR_FLEET_PROGRESS_PER_CLAIMED_SYSTEM +
    getCompletedProbeMissionCount() * CONFIG.INTERSTELLAR_FLEET_PROGRESS_PER_COMPLETED_PROBE +
    world.orbitalInfrastructureScore * CONFIG.INTERSTELLAR_FLEET_PROGRESS_PER_INFRASTRUCTURE;

  var buildThreshold = Math.max(1, Number(CONFIG.INTERSTELLAR_FLEET_BUILD_THRESHOLD) || 1);
  var maxMissions = Math.max(1, Math.round(Number(CONFIG.INTERSTELLAR_FLEET_MAX_MISSIONS) || 1));

  while (world.interstellarFleetProgress >= buildThreshold && world.interstellarFleets.length < maxMissions) {
    var fleet = makeInterstellarFleet();

    if (!fleet) {
      break;
    }

    world.interstellarFleets.push(fleet);
    world.interstellarFleetProgress -= buildThreshold;
  }

  updateInterstellarFleetReadiness();
}

function ensureEmpireSectorState() {
  if (!Array.isArray(world.empireSectors)) {
    world.empireSectors = [];
  }

  if (!world.empireSectorBySystemId) {
    rebuildEmpireSectorIndexes();
  }

  if (typeof world.nextEmpireSectorId !== "number" || world.nextEmpireSectorId < 1) {
    world.nextEmpireSectorId = 1;
  }

  world.empireSectorProgress = Math.max(0, restoreSettlementGrowthNumber(world.empireSectorProgress, 0));
  world.empireSectorReady = Boolean(world.empireSectorReady);
  world.empireSectorCount = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.empireSectorCount, 0)));
  world.lastEmpireSectorTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.lastEmpireSectorTick, 0)));
}

function allocateEmpireSectorId() {
  ensureEmpireSectorState();

  var sectorId = world.nextEmpireSectorId;
  world.nextEmpireSectorId++;
  return sectorId;
}

function normalizeEmpireSector(sector) {
  sector.id = Math.max(1, Math.round(restoreSettlementGrowthNumber(sector.id, world.nextEmpireSectorId)));
  sector.systemId = Math.max(1, Math.round(restoreSettlementGrowthNumber(sector.systemId, 1)));
  sector.foundedTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(sector.foundedTick, world.tick)));
  sector.controlValue = Math.max(1, Math.round(restoreSettlementGrowthNumber(sector.controlValue, 40 + sector.id * 9)));
  sector.controlRadius = Math.max(0.08, restoreSettlementGrowthNumber(sector.controlRadius, 0.18 + (sector.id % 3) * 0.04));
  sector.isActive = sector.isActive !== false;

  if (sector.id >= world.nextEmpireSectorId) {
    world.nextEmpireSectorId = sector.id + 1;
  }
}

function registerEmpireSectorInIndex(sector) {
  if (!sector) {
    return;
  }

  if (!world.empireSectorBySystemId) {
    world.empireSectorBySystemId = {};
  }

  world.empireSectorBySystemId[String(sector.systemId)] = sector;
}

function rebuildEmpireSectorIndexes() {
  world.empireSectorBySystemId = {};

  if (!Array.isArray(world.empireSectors)) {
    return world.empireSectorBySystemId;
  }

  for (var i = 0; i < world.empireSectors.length; i++) {
    registerEmpireSectorInIndex(world.empireSectors[i]);
  }

  return world.empireSectorBySystemId;
}

function normalizeEmpireSectors() {
  ensureEmpireSectorState();
  world.empireSectorBySystemId = {};

  for (var i = 0; i < world.empireSectors.length; i++) {
    normalizeEmpireSector(world.empireSectors[i]);
    registerEmpireSectorInIndex(world.empireSectors[i]);
  }

  world.empireSectorCount = world.empireSectors.length;
}

function getEmpireSectorCount() {
  normalizeEmpireSectors();
  return world.empireSectorCount;
}

function hasEmpireSectorForSystem(systemId) {
  ensureEmpireSectorState();
  var systemKey = String(systemId);

  if (world.empireSectorBySystemId[systemKey]) {
    return true;
  }

  rebuildEmpireSectorIndexes();
  return Boolean(world.empireSectorBySystemId[systemKey]);
}

function getNextSectorSystem() {
  var claimedSystems = getClaimedStarSystems();
  var bestSystem = null;

  for (var i = 0; i < claimedSystems.length; i++) {
    var system = claimedSystems[i];

    if (hasEmpireSectorForSystem(system.id)) {
      continue;
    }

    if (!bestSystem || system.influenceValue > bestSystem.influenceValue || (system.influenceValue === bestSystem.influenceValue && system.id < bestSystem.id)) {
      bestSystem = system;
    }
  }

  return bestSystem;
}

function makeEmpireSector(system) {
  var sectorId = allocateEmpireSectorId();

  return {
    id: sectorId,
    systemId: system.id,
    foundedTick: world.tick,
    controlValue: Math.max(1, Math.round(Number(system.influenceValue || system.mapValue) || 1)),
    controlRadius: 0.18 + (sectorId % 3) * 0.04,
    isActive: true
  };
}

function updateEmpireSectorEra() {
  normalizeEmpireSectors();

  if (getEmpireLegacyLevel() >= CONFIG.ASCENDANT_EMPIRE_LEGACY_LEVEL) {
    world.era = "Ascendant Empire";
  } else if (world.empireSectorCount >= CONFIG.GALACTIC_EMPIRE_SECTOR_COUNT) {
    world.era = "Galactic Empire";
  } else if (world.empireSectorCount > 0) {
    world.era = "Empire Sectors";
  } else {
    updateInterstellarFleetEra();
  }
}

function updateEmpireSectorReadiness() {
  normalizeEmpireSectors();

  var maxSectors = Math.max(1, Math.round(Number(CONFIG.EMPIRE_SECTOR_MAX_SECTORS) || 1));
  world.empireSectorReady = Boolean(
    getCompletedInterstellarFleetCount() >= CONFIG.EMPIRE_SECTOR_MIN_COMPLETED_FLEETS &&
    world.empireSectors.length < maxSectors &&
    getNextSectorSystem()
  );

  updateEmpireSectorEra();
  return world.empireSectorReady;
}

function updateEmpireSectorState() {
  if (!updateEmpireSectorReadiness()) {
    return;
  }

  var sectorInterval = Math.max(1, Math.round(Number(CONFIG.EMPIRE_SECTOR_BUILD_INTERVAL) || 1));

  if (world.tick - world.lastEmpireSectorTick < sectorInterval) {
    return;
  }

  world.lastEmpireSectorTick = world.tick;
  world.empireSectorProgress +=
    getCompletedInterstellarFleetCount() * CONFIG.EMPIRE_SECTOR_PROGRESS_PER_COMPLETED_FLEET +
    getClaimedStarSystemCount() * CONFIG.EMPIRE_SECTOR_PROGRESS_PER_CLAIMED_SYSTEM +
    world.orbitalInfrastructureScore * CONFIG.EMPIRE_SECTOR_PROGRESS_PER_INFRASTRUCTURE;

  var sectorThreshold = Math.max(1, Number(CONFIG.EMPIRE_SECTOR_BUILD_THRESHOLD) || 1);
  var maxSectors = Math.max(1, Math.round(Number(CONFIG.EMPIRE_SECTOR_MAX_SECTORS) || 1));

  while (world.empireSectorProgress >= sectorThreshold && world.empireSectors.length < maxSectors) {
    var system = getNextSectorSystem();

    if (!system) {
      break;
    }

    var sector = makeEmpireSector(system);
    world.empireSectors.push(sector);
    registerEmpireSectorInIndex(sector);
    world.empireSectorProgress -= sectorThreshold;
  }

  updateEmpireSectorReadiness();
}

function ensureEmpireLegacyState() {
  world.empireLegacyProgress = Math.max(0, restoreSettlementGrowthNumber(world.empireLegacyProgress, 0));
  world.empireLegacyLevel = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.empireLegacyLevel, 0)));
  world.empireLegacyReady = Boolean(world.empireLegacyReady);
  world.empireLegacyComplete = Boolean(world.empireLegacyComplete);
  world.lastEmpireLegacyTick = Math.max(0, Math.round(restoreSettlementGrowthNumber(world.lastEmpireLegacyTick, 0)));

  if (world.empireLegacyLevel >= CONFIG.ASCENDANT_EMPIRE_LEGACY_LEVEL) {
    world.empireLegacyComplete = true;
    world.era = "Ascendant Empire";
  }
}

function getEmpireLegacyLevel() {
  ensureEmpireLegacyState();
  return world.empireLegacyLevel;
}

function updateEmpireLegacyEra() {
  ensureEmpireLegacyState();

  if (world.empireLegacyLevel >= CONFIG.ASCENDANT_EMPIRE_LEGACY_LEVEL) {
    world.empireLegacyComplete = true;
    world.era = "Ascendant Empire";
  } else {
    updateEmpireSectorEra();
  }
}

function updateEmpireLegacyReadiness() {
  ensureEmpireLegacyState();

  world.empireLegacyReady = Boolean(
    getEmpireSectorCount() >= CONFIG.EMPIRE_LEGACY_MIN_SECTORS &&
    !world.empireLegacyComplete
  );

  updateEmpireLegacyEra();
  return world.empireLegacyReady;
}

function updateEmpireLegacyState() {
  if (!updateEmpireLegacyReadiness()) {
    return;
  }

  var legacyInterval = Math.max(1, Math.round(Number(CONFIG.EMPIRE_LEGACY_INTERVAL) || 1));

  if (world.tick - world.lastEmpireLegacyTick < legacyInterval) {
    return;
  }

  world.lastEmpireLegacyTick = world.tick;
  world.empireLegacyProgress +=
    getEmpireSectorCount() * CONFIG.EMPIRE_LEGACY_PROGRESS_PER_SECTOR +
    getCompletedInterstellarFleetCount() * CONFIG.EMPIRE_LEGACY_PROGRESS_PER_COMPLETED_FLEET +
    getClaimedStarSystemCount() * CONFIG.EMPIRE_LEGACY_PROGRESS_PER_CLAIMED_SYSTEM;

  var legacyThreshold = Math.max(1, Number(CONFIG.EMPIRE_LEGACY_THRESHOLD) || 1);

  while (
    world.empireLegacyProgress >= legacyThreshold &&
    world.empireLegacyLevel < CONFIG.ASCENDANT_EMPIRE_LEGACY_LEVEL
  ) {
    world.empireLegacyLevel++;
    world.empireLegacyProgress -= legacyThreshold;
  }

  updateEmpireLegacyReadiness();
}
