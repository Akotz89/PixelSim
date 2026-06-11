"use strict";
PS.sim = PS.sim || {};

PS.sim.massExtinction = (function() {
  var EVENT_TYPES = [
    "volcanic-winter",
    "asteroid-impact",
    "rapid-climate-shift",
    "disease-pandemic",
    "ocean-oxygen-crisis",
    "resource-collapse"
  ];

  function normalize01(value, fallback) {
    var numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      numberValue = Number(fallback) || 0;
    }

    return clamp(numberValue, 0, 1);
  }

  function normalizeMovement(value) {
    var min = Number(CONFIG.TRAIT_MOVEMENT_TENDENCY_MIN);
    var max = Number(CONFIG.TRAIT_MOVEMENT_TENDENCY_MAX);

    if (Number.isFinite(max - min) && max > min) {
      return clamp((Number(value) - min) / (max - min), 0, 1);
    }

    return normalize01(value, 0);
  }

  function normalizeReproduction(value) {
    var min = Number(CONFIG.TRAIT_REPRODUCTION_ENERGY_MIN);
    var max = Number(CONFIG.TRAIT_REPRODUCTION_ENERGY_MAX);

    if (Number.isFinite(max - min) && max > min) {
      return 1 - clamp((Number(value) - min) / (max - min), 0, 1);
    }

    return normalize01(value, 0);
  }

  function normalizeBodySize(value) {
    var min = Number(CONFIG.TRAIT_BODY_SIZE_MIN);
    var max = Number(CONFIG.TRAIT_BODY_SIZE_MAX);

    if (Number.isFinite(max - min) && max > min) {
      return clamp((Number(value) - min) / (max - min), 0, 1);
    }

    return normalize01(value, 0.5);
  }

  function hashUnit(text) {
    var hash = 2166136261;
    var source = String(text || "");

    for (var i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return ((hash >>> 0) % 100000) / 100000;
  }

  function ensureState() {
    world.massExtinction = world.massExtinction || {
      activeEvent: null,
      recoveryWindow: null,
      lastEventTick: -1,
      pressureSummary: null
    };
    world.extinctionEvents = Array.isArray(world.extinctionEvents) ? world.extinctionEvents : [];
    return world.massExtinction;
  }

  function getTick() {
    return Math.max(0, Math.round(Number(world.tick) || 0));
  }

  function getHistoryLimit() {
    return Math.max(1, Math.round(Number(CONFIG.MASS_EXTINCTION_HISTORY_LIMIT) || 12));
  }

  function boundSeverity(value) {
    var minKill = clamp(Number(CONFIG.MASS_EXTINCTION_MIN_KILL_RATE) || 0.12, 0.01, 0.95);
    var maxKill = clamp(Number(CONFIG.MASS_EXTINCTION_MAX_KILL_RATE) || 0.78, minKill, 0.95);

    return clamp(Number(value) || minKill, minKill, maxKill);
  }

  function getFoodWebSummary() {
    if (world.foodWebSummary) {
      return world.foodWebSummary;
    }

    if (PS.sim.foodWeb && typeof PS.sim.foodWeb.refreshSummary === "function") {
      return PS.sim.foodWeb.refreshSummary(world.biologyPopulations || []);
    }

    return null;
  }

  function evaluatePressure() {
    var geology = world.geology || {};
    var atmosphere = world.atmosphere || {};
    var gases = atmosphere.gases || {};
    var foodWeb = getFoodWebSummary() || {};
    var roles = foodWeb.roles || {};
    var population = Array.isArray(world.organisms) ? world.organisms.length : 0;
    var maxPopulation = Math.max(1, Math.round(Number(CONFIG.MAX_ORGANISMS) || 1));
    var volcanic = normalize01(geology.volcanicActivity, 0);
    var tectonic = normalize01(geology.tectonicActivity || geology.tectonicStress, 0);
    var oxygenStress = normalize01(atmosphere.oxygenStress, 0);
    var sulfur = normalize01(gases.sulfur, 0);
    var carbon = normalize01(gases.co2, 0);
    var methane = normalize01(gases.ch4, 0);
    var climateHeat = clamp(Math.abs((Number(atmosphere.temperatureC) || 15) - 15) / 45, 0, 1);
    var scarcity = normalize01(foodWeb.scarcity, world.reproductionScarcityPressure || 0);
    var trophicCollapse = foodWeb.recoveryTrend === "collapsing"
      ? 0.9
      : clamp(1 - (Number(foodWeb.trophicBalance) || 100) / 100, 0, 1);
    var predatorPressure = normalize01(foodWeb.predatorPressure, 0);
    var density = clamp(population / maxPopulation, 0, 1);
    var impactRoll = hashUnit([world.seedText, getTick(), "impact"].join(":"));
    var impactPressure = impactRoll <= clamp(Number(CONFIG.MASS_EXTINCTION_RARE_IMPACT_CHANCE) || 0.015, 0, 1)
      ? 0.95
      : impactRoll * 0.08;
    var producerGap = roles.producer <= 0 && population > 0 ? 0.35 : 0;
    var scores = {
      "volcanic-winter": clamp(volcanic * 0.62 + tectonic * 0.18 + sulfur * 0.25, 0, 1),
      "asteroid-impact": impactPressure,
      "rapid-climate-shift": clamp(climateHeat * 0.55 + carbon * 0.22 + methane * 0.18 + oxygenStress * 0.12, 0, 1),
      "disease-pandemic": clamp(density * 0.56 + predatorPressure * 0.12 + normalize01(world.foodRecoveryPressure, 0) * 0.08, 0, 1),
      "ocean-oxygen-crisis": clamp(oxygenStress * 0.68 + sulfur * 0.18 + climateHeat * 0.12, 0, 1),
      "resource-collapse": clamp(scarcity * 0.5 + trophicCollapse * 0.36 + producerGap, 0, 1)
    };
    var eventType = EVENT_TYPES[0];

    for (var i = 1; i < EVENT_TYPES.length; i++) {
      if (scores[EVENT_TYPES[i]] > scores[eventType]) {
        eventType = EVENT_TYPES[i];
      }
    }

    var severity = boundSeverity(scores[eventType] * 0.78 + 0.08);
    var summary = {
      eventType: eventType,
      cause: eventType,
      pressure: scores[eventType],
      severityScore: severity,
      scores: scores,
      context: {
        volcanic: volcanic,
        tectonic: tectonic,
        oxygenStress: oxygenStress,
        sulfur: sulfur,
        climateHeat: climateHeat,
        scarcity: scarcity,
        trophicCollapse: trophicCollapse,
        density: density,
        impactPressure: impactPressure,
        population: population
      }
    };

    ensureState().pressureSummary = summary;
    return summary;
  }

  function getHabitatBreadth(traits) {
    var terrain = normalize01(traits && traits.terrainAffinity, 0.5);
    var water = normalize01(traits && traits.waterDependency, 0.5);

    return 1 - (Math.abs(terrain - 0.5) + Math.abs(water - 0.5));
  }

  function getDietFlexibility(traits) {
    var carnivory = normalize01(traits && traits.carnivory, 0);

    return 1 - Math.abs(carnivory - 0.45) * 1.7;
  }

  function getSurvivalScore(traits, eventType) {
    var thermal = normalize01(traits && traits.thermalTolerance, 0.5);
    var water = normalize01(traits && traits.waterDependency, 0.5);
    var mobility = normalizeMovement(traits && traits.movementTendency);
    var camouflage = normalize01(traits && traits.camouflage, 0.25);
    var sociality = normalize01(traits && traits.sociality, 0.1);
    var intelligence = normalize01(traits && traits.intelligence, 0.1);
    var carnivory = normalize01(traits && traits.carnivory, 0);
    var bodySize = normalizeBodySize(traits && traits.bodySize);
    var limbs = clamp((Number(traits && traits.limbCount) || 0) / Math.max(1, CONFIG.TRAIT_LIMB_COUNT_MAX), 0, 1);
    var reproduction = normalizeReproduction(traits && traits.reproductionEnergy);
    var lowMetabolism = 1 - clamp(((Number(traits && traits.metabolism) || CONFIG.TRAIT_METABOLISM_DEFAULT) - CONFIG.TRAIT_METABOLISM_MIN) / Math.max(1, CONFIG.TRAIT_METABOLISM_MAX - CONFIG.TRAIT_METABOLISM_MIN), 0, 1);
    var dormancy = (lowMetabolism + reproduction) * 0.5;
    var habitatBreadth = getHabitatBreadth(traits);
    var dietFlexibility = getDietFlexibility(traits);

    if (eventType === "volcanic-winter") {
      return clamp(thermal * 0.3 + dormancy * 0.24 + mobility * 0.18 + bodySize * 0.12 + habitatBreadth * 0.16, 0, 1);
    }

    if (eventType === "asteroid-impact") {
      return clamp(dormancy * 0.28 + mobility * 0.22 + camouflage * 0.14 + limbs * 0.1 + (1 - bodySize) * 0.14 + habitatBreadth * 0.12, 0, 1);
    }

    if (eventType === "rapid-climate-shift") {
      return clamp(thermal * 0.36 + mobility * 0.24 + habitatBreadth * 0.22 + reproduction * 0.12 + intelligence * 0.06, 0, 1);
    }

    if (eventType === "disease-pandemic") {
      return clamp((1 - sociality) * 0.3 + reproduction * 0.22 + camouflage * 0.12 + intelligence * 0.12 + habitatBreadth * 0.14 + lowMetabolism * 0.1, 0, 1);
    }

    if (eventType === "ocean-oxygen-crisis") {
      return clamp((1 - water) * 0.28 + lowMetabolism * 0.24 + thermal * 0.18 + mobility * 0.12 + habitatBreadth * 0.18, 0, 1);
    }

    if (eventType === "resource-collapse") {
      return clamp(dietFlexibility * 0.34 + mobility * 0.2 + lowMetabolism * 0.18 + reproduction * 0.14 + carnivory * 0.06 + habitatBreadth * 0.08, 0, 1);
    }

    return clamp((thermal + mobility + reproduction + habitatBreadth) / 4, 0, 1);
  }

  function getOrganismSortKey(organism, index, eventType) {
    var traits = typeof ensureOrganismTraits === "function" ? ensureOrganismTraits(organism) : organism.traits || {};
    var survival = getSurvivalScore(traits, eventType);
    var tieBreak = hashUnit([
      world.seedText,
      getTick(),
      eventType,
      organism.representativeId || organism.id || organism.poolIndex || index
    ].join(":"));

    return survival + tieBreak * 0.0001;
  }

  function tallyLoss(target, organism) {
    var speciesId = Math.max(1, Math.round(Number(organism.speciesId) || organism.lineageId || 1));
    var populationId = Math.max(1, Math.round(Number(organism.populationId) || organism.lineageId || 1));

    target.bySpecies[String(speciesId)] = (target.bySpecies[String(speciesId)] || 0) + 1;
    target.byPopulation[String(populationId)] = (target.byPopulation[String(populationId)] || 0) + 1;
    target.total++;
  }

  function summarizeAffected(losses, survivors) {
    var affectedSpecies = Object.keys(losses.bySpecies).map(function(id) {
      return {
        id: Math.max(1, Math.round(Number(id) || 1)),
        losses: losses.bySpecies[id] || 0,
        survivors: survivors.bySpecies[id] || 0
      };
    });
    var affectedPopulations = Object.keys(losses.byPopulation).map(function(id) {
      return {
        id: Math.max(1, Math.round(Number(id) || 1)),
        losses: losses.byPopulation[id] || 0,
        survivors: survivors.byPopulation[id] || 0
      };
    });

    affectedSpecies.sort(function(a, b) { return b.losses - a.losses || a.id - b.id; });
    affectedPopulations.sort(function(a, b) { return b.losses - a.losses || a.id - b.id; });

    return {
      affectedSpecies: affectedSpecies,
      affectedPopulations: affectedPopulations
    };
  }

  function getEventLocation(organisms) {
    if (!Array.isArray(organisms) || organisms.length <= 0) {
      return null;
    }

    var xSum = 0;
    var ySum = 0;
    var latSum = 0;
    var lonSum = 0;
    var latLonCount = 0;

    for (var i = 0; i < organisms.length; i++) {
      xSum += Number(organisms[i].x) || 0;
      ySum += Number(organisms[i].y) || 0;

      if (Number.isFinite(Number(organisms[i].latitude)) && Number.isFinite(Number(organisms[i].longitude))) {
        latSum += Number(organisms[i].latitude);
        lonSum += Number(organisms[i].longitude);
        latLonCount++;
      }
    }

    var x = clamp(Math.round(xSum / organisms.length), 0, WORLD_WIDTH - 1);
    var y = clamp(Math.round(ySum / organisms.length), 0, WORLD_HEIGHT - 1);

    return {
      x: x,
      y: y,
      latitude: latLonCount > 0 ? latSum / latLonCount : (typeof getPlanetLatitudeForTile === "function" ? getPlanetLatitudeForTile(y) : null),
      longitude: latLonCount > 0 ? lonSum / latLonCount : (typeof getPlanetLongitudeForTile === "function" ? getPlanetLongitudeForTile(x) : null)
    };
  }

  function makeRecoveryWindow(eventId, eventType, survivors, severityScore) {
    var tick = getTick();
    var duration = Math.max(1, Math.round(Number(CONFIG.MASS_EXTINCTION_RECOVERY_WINDOW_TICKS) || 900));
    var survivorPopulationIds = Object.keys(survivors.byPopulation).map(function(id) {
      return Math.max(1, Math.round(Number(id) || 1));
    }).sort(function(a, b) { return a - b; });

    return {
      id: eventId,
      cause: eventType,
      startTick: tick,
      endTick: tick + duration,
      durationTicks: duration,
      severityScore: severityScore,
      survivorPopulationIds: survivorPopulationIds,
      radiationCandidateIds: survivorPopulationIds.slice(0, 12),
      reproductionMultiplier: clamp(Number(CONFIG.MASS_EXTINCTION_RECOVERY_REPRODUCTION_MULTIPLIER) || 0.72, 0.25, 1),
      openNiches: Math.max(0, Math.round((Number(CONFIG.MAX_ORGANISMS) || 1) - (Array.isArray(world.organisms) ? world.organisms.length : 0)))
    };
  }

  function emitEventRecords(eventRecord) {
    if (!PS.events || typeof PS.events.emitMilestone !== "function") {
      return;
    }

    var location = eventRecord.location || null;
    var inspectTarget = location ? { type: "tile", x: location.x, y: location.y } : null;

    PS.events.emitMilestone({
      type: PS.eventTypes && PS.eventTypes.EXTINCTION_EVENT ? PS.eventTypes.EXTINCTION_EVENT : "extinction.event",
      label: "Mass extinction",
      detail: eventRecord.eventType + " killed " + eventRecord.losses.total + " of " + eventRecord.prePopulation,
      details: eventRecord,
      tick: eventRecord.tick,
      deepTime: { years: Math.max(0, Number(world.deepTimeYears) || 0) },
      location: location,
      inspectTarget: inspectTarget,
      source: "extinction",
      category: "extinction",
      severity: eventRecord.severityScore >= 0.6 ? "danger" : "major",
      id: eventRecord.id,
      eventType: eventRecord.eventType,
      cause: eventRecord.cause,
      pressure: eventRecord.pressure,
      severityScore: eventRecord.severityScore,
      killRate: eventRecord.killRate,
      prePopulation: eventRecord.prePopulation,
      postPopulation: eventRecord.postPopulation,
      affectedSpecies: eventRecord.affectedSpecies,
      affectedPopulations: eventRecord.affectedPopulations,
      survivors: eventRecord.survivors,
      losses: eventRecord.losses,
      recoveryWindow: eventRecord.recoveryWindow,
      survivorPopulationIds: eventRecord.recoveryWindow.survivorPopulationIds,
      radiationCandidateIds: eventRecord.recoveryWindow.radiationCandidateIds,
      durationTicks: eventRecord.recoveryWindow.durationTicks,
      watcher: {
        eventLog: true,
        timeline: true,
        notification: true,
        spotlight: true,
        overlays: ["observation.extinction"]
      }
    });

    PS.events.emitMilestone({
      type: PS.eventTypes && PS.eventTypes.EXTINCTION_RECOVERY ? PS.eventTypes.EXTINCTION_RECOVERY : "extinction.recovery",
      label: "Adaptive radiation",
      detail: eventRecord.recoveryWindow.radiationCandidateIds.length + " survivor populations enter recovery",
      details: eventRecord.recoveryWindow,
      tick: eventRecord.tick,
      deepTime: { years: Math.max(0, Number(world.deepTimeYears) || 0) },
      location: location,
      inspectTarget: inspectTarget,
      source: "extinction",
      category: "extinction",
      severity: "ready",
      id: eventRecord.id,
      eventType: eventRecord.eventType,
      cause: eventRecord.cause,
      recoveryWindow: eventRecord.recoveryWindow,
      survivorPopulationIds: eventRecord.recoveryWindow.survivorPopulationIds,
      radiationCandidateIds: eventRecord.recoveryWindow.radiationCandidateIds,
      durationTicks: eventRecord.recoveryWindow.durationTicks,
      watcher: {
        eventLog: true,
        timeline: true,
        notification: false,
        spotlight: false,
        overlays: ["observation.extinction"]
      }
    });
  }

  function trigger(options) {
    var state = ensureState();
    var pressure = options && options.pressureSummary ? options.pressureSummary : evaluatePressure();
    var eventType = String(options && options.eventType || pressure.eventType || "resource-collapse");
    var severityScore = boundSeverity(options && options.severityScore != null ? options.severityScore : pressure.severityScore);
    var organisms = Array.isArray(world.organisms) ? world.organisms.slice() : [];
    var prePopulation = organisms.length;

    if (prePopulation <= 1) {
      return null;
    }

    var sorted = organisms.map(function(organism, index) {
      return {
        organism: organism,
        sortKey: getOrganismSortKey(organism, index, eventType)
      };
    }).sort(function(a, b) {
      return a.sortKey - b.sortKey;
    });
    var refugia = Math.max(1, Math.ceil(prePopulation * clamp(Number(CONFIG.MASS_EXTINCTION_REFUGIA_RATIO) || 0.12, 0.01, 0.5)));
    var killCount = clamp(Math.round(prePopulation * severityScore), 1, Math.max(1, prePopulation - refugia));
    var killed = [];
    var survivors = { total: 0, bySpecies: {}, byPopulation: {} };
    var losses = { total: 0, bySpecies: {}, byPopulation: {} };

    for (var i = 0; i < sorted.length; i++) {
      var organism = sorted[i].organism;

      if (i < killCount) {
        killed.push(organism);
        tallyLoss(losses, organism);
      } else {
        tallyLoss(survivors, organism);
      }
    }

    if (killed.length <= 0) {
      return null;
    }

    for (var killIndex = 0; killIndex < killed.length; killIndex++) {
      var victim = killed[killIndex];
      victim.deathCause = eventType;
      victim.energy = 0;

      if (PS.pools && PS.pools.organism && PS.pools.organism.arrays && Number.isFinite(Number(victim.poolIndex))) {
        PS.pools.organism.arrays.energy[Math.round(victim.poolIndex)] = 0;
      }
    }

    if (typeof removeDeadOrganisms === "function") {
      removeDeadOrganisms();
    } else {
      world.organisms = world.organisms.filter(function(organism) {
        return Number(organism.energy) > 0;
      });
    }

    var postPopulation = Array.isArray(world.organisms) ? world.organisms.length : Math.max(0, prePopulation - killed.length);
    var affected = summarizeAffected(losses, survivors);
    var eventId = world.extinctionEvents.length > 0
      ? Math.max(1, Math.round(Number(world.extinctionEvents[world.extinctionEvents.length - 1].id) || 0) + 1)
      : 1;
    var recoveryWindow = makeRecoveryWindow(eventId, eventType, survivors, severityScore);
    var location = getEventLocation(killed);
    var eventRecord = {
      id: eventId,
      type: "extinction.event",
      eventType: eventType,
      cause: String(options && options.cause || pressure.cause || eventType),
      pressure: normalize01(pressure.pressure, severityScore),
      severityScore: severityScore,
      killRate: killed.length / Math.max(1, prePopulation),
      prePopulation: prePopulation,
      postPopulation: postPopulation,
      affectedSpecies: affected.affectedSpecies,
      affectedPopulations: affected.affectedPopulations,
      survivors: survivors,
      losses: losses,
      recoveryWindow: recoveryWindow,
      location: location,
      tick: getTick()
    };

    world.extinctionEvents.push(eventRecord);
    while (world.extinctionEvents.length > getHistoryLimit()) {
      world.extinctionEvents.shift();
    }

    state.activeEvent = eventRecord;
    state.recoveryWindow = recoveryWindow;
    state.lastEventTick = getTick();
    state.pressureSummary = pressure;

    if (typeof refreshLineageRegistry === "function") {
      refreshLineageRegistry();
    }

    if (PS.sim.representatives && typeof PS.sim.representatives.refresh === "function") {
      PS.sim.representatives.refresh();
    }

    emitEventRecords(eventRecord);
    world.needsRender = true;
    return eventRecord;
  }

  function shouldCheckThisTick() {
    var interval = Math.max(1, Math.round(Number(CONFIG.MASS_EXTINCTION_CHECK_INTERVAL_TICKS) || 240));

    return getTick() > 0 && getTick() % interval === 0;
  }

  function maybeTrigger() {
    if (CONFIG.MASS_EXTINCTION_ENABLED === false || !shouldCheckThisTick()) {
      updateRecovery();
      return null;
    }

    var state = ensureState();
    var minInterval = Math.max(1, Math.round(Number(CONFIG.MASS_EXTINCTION_MIN_INTERVAL_TICKS) || 1200));

    if (Number.isFinite(Number(state.lastEventTick)) && getTick() - Number(state.lastEventTick) < minInterval) {
      updateRecovery();
      return null;
    }

    var pressure = evaluatePressure();
    var threshold = clamp(Number(CONFIG.MASS_EXTINCTION_PRESSURE_THRESHOLD) || 0.82, 0, 1);

    if (pressure.pressure < threshold) {
      updateRecovery();
      return null;
    }

    return trigger({ pressureSummary: pressure });
  }

  function updateRecovery() {
    var state = ensureState();
    var recovery = state.recoveryWindow;

    if (recovery && getTick() > Math.max(0, Math.round(Number(recovery.endTick) || 0))) {
      state.recoveryWindow = null;
      state.activeEvent = null;
    }

    return state.recoveryWindow;
  }

  function getRecoveryReproductionMultiplier(organism) {
    var state = ensureState();
    var recovery = state.recoveryWindow;

    if (!recovery || getTick() < recovery.startTick || getTick() > recovery.endTick) {
      return 1;
    }

    var populationId = Math.max(1, Math.round(Number(organism && organism.populationId) || organism && organism.lineageId || 1));

    if (recovery.survivorPopulationIds.indexOf(populationId) < 0) {
      return 1;
    }

    return clamp(Number(recovery.reproductionMultiplier) || 1, 0.25, 1);
  }

  function getSummary() {
    var state = ensureState();
    var latest = world.extinctionEvents.length > 0 ? world.extinctionEvents[world.extinctionEvents.length - 1] : null;

    return {
      latest: latest,
      activeEvent: state.activeEvent,
      recoveryWindow: updateRecovery(),
      pressureSummary: state.pressureSummary,
      totalEvents: world.extinctionEvents.length
    };
  }

  return {
    ensureState: ensureState,
    evaluatePressure: evaluatePressure,
    trigger: trigger,
    maybeTrigger: maybeTrigger,
    updateRecovery: updateRecovery,
    getRecoveryReproductionMultiplier: getRecoveryReproductionMultiplier,
    getSurvivalScore: getSurvivalScore,
    getSummary: getSummary
  };
})();
