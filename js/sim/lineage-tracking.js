import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getTileManhattanDistance } from "../render/planet-grid.js";
import { collectOrganismsInRadius } from "./organisms-indexes.js";
import { world, WORLD_HEIGHT, WORLD_WIDTH } from "../systems/state.js";

PS.sim = PS.sim || {};

export var LINEAGE_TRACK_HISTORY_LIMIT = 24;
export var LINEAGE_TRACK_EVENT_LIMIT = 12;
export var LINEAGE_TRACK_TRAIT_KEYS = [
  "bodySize",
  "limbCount",
  "carnivory",
  "terrainAffinity",
  "waterDependency",
  "thermalTolerance",
  "intelligence",
  "sociality"
];

export function ensureLineageTrackingState() {
  if (!world.trackedLineage) {
    world.trackedLineage = null;
  }

  return world.trackedLineage;
}

export function normalizeTrackedLineageId(value) {
  return Math.max(1, Math.round(Number(value) || 1));
}

export function getTrackedSpecies(speciesId) {
  if (PS.sim && PS.sim.speciation && typeof PS.sim.speciation.getSpecies === "function") {
    return PS.sim.speciation.getSpecies(speciesId);
  }

  return world.speciesById ? world.speciesById[String(normalizeTrackedLineageId(speciesId))] || null : null;
}

export function getTrackedPopulation(populationId) {
  if (PS.sim && PS.sim.representatives && typeof PS.sim.representatives.getPopulation === "function") {
    return PS.sim.representatives.getPopulation(populationId);
  }

  return world.biologyPopulationById ? world.biologyPopulationById[String(normalizeTrackedLineageId(populationId))] || null : null;
}

export function getTrackedRepresentative(representativeId) {
  if (PS.sim && PS.sim.representatives && typeof PS.sim.representatives.getRepresentative === "function") {
    return PS.sim.representatives.getRepresentative(representativeId);
  }

  return world.biologyRepresentativeById ? world.biologyRepresentativeById[String(normalizeTrackedLineageId(representativeId))] || null : null;
}

export function getTrackedLineageRecord(lineageId) {
  var lineages = world.lineages || {};
  return lineages[String(normalizeTrackedLineageId(lineageId))] || null;
}

export function copyTrackedTraits(traits) {
  var copy = {};

  for (var i = 0; i < LINEAGE_TRACK_TRAIT_KEYS.length; i++) {
    var key = LINEAGE_TRACK_TRAIT_KEYS[i];
    copy[key] = Number(traits && traits[key]) || 0;
  }

  return copy;
}

export function getDominantTraitLabels(traits) {
  var scored = [];

  for (var i = 0; i < LINEAGE_TRACK_TRAIT_KEYS.length; i++) {
    var key = LINEAGE_TRACK_TRAIT_KEYS[i];
    scored.push({
      key: key,
      value: Number(traits && traits[key]) || 0
    });
  }

  scored.sort(function(a, b) {
    return b.value - a.value || a.key.localeCompare(b.key);
  });

  return scored.slice(0, 4).map(function(item) {
    return item.key + " " + item.value.toFixed(2);
  });
}

export function getRangeFromTarget(species, population, representative) {
  if (species && species.range) {
    return species.range;
  }

  if (population && Array.isArray(population.territoryCells) && population.territoryCells.length > 0) {
    var minX = population.territoryCells[0].x;
    var maxX = population.territoryCells[0].x;
    var minY = population.territoryCells[0].y;
    var maxY = population.territoryCells[0].y;

    for (var i = 1; i < population.territoryCells.length; i++) {
      minX = Math.min(minX, population.territoryCells[i].x);
      maxX = Math.max(maxX, population.territoryCells[i].x);
      minY = Math.min(minY, population.territoryCells[i].y);
      maxY = Math.max(maxY, population.territoryCells[i].y);
    }

    return {
      minX: minX,
      maxX: maxX,
      minY: minY,
      maxY: maxY,
      cells: population.territoryCells.length
    };
  }

  if (representative) {
    return {
      minX: representative.x,
      maxX: representative.x,
      minY: representative.y,
      maxY: representative.y,
      cells: 1
    };
  }

  return null;
}

export function getBiomeLabelForRange(range) {
  if (!range || !Array.isArray(world.terrain) || world.terrain.length === 0) {
    return "-";
  }

  var x = clamp(Math.round((Number(range.minX) + Number(range.maxX)) / 2), 0, WORLD_WIDTH - 1);
  var y = clamp(Math.round((Number(range.minY) + Number(range.maxY)) / 2), 0, WORLD_HEIGHT - 1);
  var tile = world.planetTiles && world.planetTiles[y * WORLD_WIDTH + x];

  if (tile && tile.biome) {
    return String(tile.biome);
  }

  return world.terrain[y * WORLD_WIDTH + x] === 1 ? "fertile" : "barren";
}

export function firstFiniteNumber(values, fallback) {
  for (var i = 0; i < values.length; i++) {
    var value = Number(values[i]);

    if (Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

export function getTargetFromInput(target) {
  if (!target) {
    return null;
  }

  if (target.representativeId) {
    var representative = getTrackedRepresentative(target.representativeId);
    return {
      type: "representative",
      representative: representative || target,
      representativeId: normalizeTrackedLineageId(target.representativeId),
      populationId: normalizeTrackedLineageId(target.populationId || representative && representative.populationId || target.representativeId),
      speciesId: normalizeTrackedLineageId(target.speciesId || representative && representative.speciesId || target.lineageId),
      lineageId: normalizeTrackedLineageId(target.lineageId || representative && representative.lineageId || target.speciesId)
    };
  }

  if (target.populationId || target.id && target.count !== undefined) {
    var populationId = normalizeTrackedLineageId(target.populationId || target.id);
    var population = getTrackedPopulation(populationId) || target;
    return {
      type: "population",
      population: population,
      populationId: populationId,
      speciesId: normalizeTrackedLineageId(population.speciesId || target.speciesId || populationId),
      lineageId: normalizeTrackedLineageId(population.lineageId || target.lineageId || populationId)
    };
  }

  if (target.speciesId || target.id && target.parentId !== undefined) {
    var speciesId = normalizeTrackedLineageId(target.speciesId || target.id);
    var species = getTrackedSpecies(speciesId) || target;
    return {
      type: "species",
      species: species,
      speciesId: speciesId,
      lineageId: normalizeTrackedLineageId(species.lineageId || target.lineageId || speciesId)
    };
  }

  if (target.lineageId || target.id) {
    var lineageId = normalizeTrackedLineageId(target.lineageId || target.id);
    return {
      type: "lineage",
      lineageId: lineageId,
      speciesId: normalizeTrackedLineageId(target.speciesId || lineageId)
    };
  }

  return null;
}

export function makeTrackedLineage(target, options) {
  var resolved = getTargetFromInput(target);

  if (!resolved) {
    return null;
  }

  var tick = Math.max(0, Math.round(Number(world.tick) || 0));
  var species = resolved.species || getTrackedSpecies(resolved.speciesId);
  var population = resolved.population || getTrackedPopulation(resolved.populationId || (species && species.parentPopulationId));
  var representative = resolved.representative || getTrackedRepresentative(resolved.representativeId || (population && population.representativeIds && population.representativeIds[0]));
  var tracked = {
    type: resolved.type,
    lineageId: resolved.lineageId,
    speciesId: resolved.speciesId,
    parentSpeciesId: Math.max(0, Math.round(Number(species && species.parentId || population && population.parentSpeciesId) || 0)),
    populationId: Math.max(0, Math.round(Number(resolved.populationId || population && population.id) || 0)),
    representativeId: Math.max(0, Math.round(Number(resolved.representativeId || representative && representative.id) || 0)),
    label: "S" + resolved.speciesId + " / L" + resolved.lineageId,
    selectedTick: tick,
    lastUpdatedTick: tick,
    pinned: Boolean(options && options.pinned),
    stale: false,
    extinct: false,
    history: [],
    recentEvents: []
  };

  world.trackedLineage = tracked;
  updateTrackedLineage(true);
  world.needsRender = true;
  return world.trackedLineage;
}

export function pinTrackedLineage(pinned) {
  var tracked = ensureLineageTrackingState();

  if (!tracked) {
    return null;
  }

  tracked.pinned = pinned !== false;
  world.needsRender = true;
  return tracked;
}

export function eventMatchesTrackedLineage(event, tracked) {
  var active = tracked || world.trackedLineage;

  if (!event || !active) {
    return false;
  }

  if (Number(event.lineageId) && normalizeTrackedLineageId(event.lineageId) === active.lineageId) {
    return true;
  }

  if (Number(event.speciesId) && normalizeTrackedLineageId(event.speciesId) === active.speciesId) {
    return true;
  }

  if (Number(event.id) && String(event.type || "").indexOf("speciation") >= 0 && normalizeTrackedLineageId(event.id) === active.speciesId) {
    return true;
  }

  if (event.losses && event.losses.bySpecies && event.losses.bySpecies[String(active.speciesId)] > 0) {
    return true;
  }

  if (Array.isArray(event.affectedSpecies)) {
    for (var i = 0; i < event.affectedSpecies.length; i++) {
      var affected = event.affectedSpecies[i];
      var affectedId = typeof affected === "object" ? affected.speciesId || affected.id : affected;
      if (normalizeTrackedLineageId(affectedId) === active.speciesId) {
        return true;
      }
    }
  }

  return false;
}

export function getTrackedEvents(tracked) {
  var active = tracked || world.trackedLineage;
  var events = Array.isArray(world.timelineEvents) ? world.timelineEvents : [];
  var matches = [];

  if (!active) {
    return matches;
  }

  for (var i = events.length - 1; i >= 0; i--) {
    if (eventMatchesTrackedLineage(events[i], active)) {
      matches.push(events[i]);
      if (matches.length >= LINEAGE_TRACK_EVENT_LIMIT) {
        break;
      }
    }
  }

  return matches.reverse();
}

export function appendTrackedHistory(tracked, sample, force) {
  var last = tracked.history.length > 0 ? tracked.history[tracked.history.length - 1] : null;

  if (!force && last && last.tick === sample.tick) {
    tracked.history[tracked.history.length - 1] = sample;
    return;
  }

  tracked.history.push(sample);

  while (tracked.history.length > LINEAGE_TRACK_HISTORY_LIMIT) {
    tracked.history.shift();
  }
}

export function updateTrackedLineage(force) {
  var tracked = ensureLineageTrackingState();

  if (!tracked) {
    return null;
  }

  var species = getTrackedSpecies(tracked.speciesId);
  var population = getTrackedPopulation(tracked.populationId);
  var representative = getTrackedRepresentative(tracked.representativeId);
  var lineage = getTrackedLineageRecord(tracked.lineageId);
  var traits = species && species.traitMean || population && population.traitMean || representative && representative.traits || lineage && lineage.founderTraits || {};
  var range = getRangeFromTarget(species, population, representative);
  var activePopulation = Math.max(0, Math.round(firstFiniteNumber([
    species && species.activePopulation,
    population && population.count,
    lineage && lineage.activeCount
  ], 0)));
  var tick = Math.max(0, Math.round(Number(world.tick) || 0));

  tracked.parentSpeciesId = Math.max(0, Math.round(Number(species && species.parentId || tracked.parentSpeciesId) || 0));
  tracked.populationId = Math.max(0, Math.round(Number(population && population.id || tracked.populationId) || 0));
  tracked.representativeId = Math.max(0, Math.round(Number(representative && representative.id || tracked.representativeId) || 0));
  tracked.label = "S" + tracked.speciesId + " / L" + tracked.lineageId;
  tracked.activePopulation = activePopulation;
  tracked.status = activePopulation > 0 && !(species && species.isExtinct) && !(lineage && lineage.isExtinct) ? "active" : "extinct";
  tracked.extinct = tracked.status === "extinct";
  tracked.stale = !species && !population && !representative && !lineage;
  tracked.range = range;
  tracked.rangeLabel = range ? (range.cells || 1) + " cells / " + getBiomeLabelForRange(range) : "-";
  tracked.traits = copyTrackedTraits(traits);
  tracked.dominantTraits = getDominantTraitLabels(traits);
  tracked.morphology = representative && representative.morphologyPreview ? representative.morphologyPreview.label : "-";
  tracked.divergenceRisk = species && Number(species.divergence) ? clamp(Number(species.divergence), 0, 1) : clamp(Number(population && population.speciation && population.speciation.divergence) || 0, 0, 1);
  tracked.extinctionRisk = tracked.extinct ? 1 : clamp(1 - activePopulation / Math.max(1, Number(species && species.population) || activePopulation || 1), 0, 1);
  tracked.recentEvents = getTrackedEvents(tracked).map(function(event) {
    return {
      tick: Math.max(0, Math.round(Number(event.tick) || 0)),
      type: String(event.type || "event"),
      label: String(event.label || event.type || "Event"),
      detail: String(event.detail || event.details || "")
    };
  });
  tracked.lastUpdatedTick = tick;

  appendTrackedHistory(tracked, {
    tick: tick,
    population: activePopulation,
    traits: copyTrackedTraits(traits),
    rangeCells: range ? Math.max(1, Math.round(Number(range.cells) || 1)) : 0,
    status: tracked.status
  }, force === true);

  return tracked;
}

export function getTrackedLineageSummary() {
  var tracked = updateTrackedLineage(false);

  if (!tracked) {
    return null;
  }

  return {
    label: tracked.label,
    parentSpeciesId: tracked.parentSpeciesId,
    status: tracked.stale ? "stale" : tracked.status,
    population: tracked.activePopulation || 0,
    trend: getTrackedPopulationTrend(tracked),
    traits: tracked.dominantTraits || [],
    range: tracked.rangeLabel || "-",
    morphology: tracked.morphology || "-",
    recentEvents: tracked.recentEvents || [],
    divergenceRisk: tracked.divergenceRisk || 0,
    extinctionRisk: tracked.extinctionRisk || 0,
    pinned: Boolean(tracked.pinned)
  };
}

export function getTrackedPopulationTrend(tracked) {
  var history = tracked && tracked.history ? tracked.history : [];

  if (history.length < 2) {
    return "new";
  }

  var first = Number(history[0].population) || 0;
  var last = Number(history[history.length - 1].population) || 0;
  var delta = last - first;

  if (delta > Math.max(1, first * 0.1)) {
    return "rising";
  }

  if (delta < -Math.max(1, first * 0.1)) {
    return "falling";
  }

  return "steady";
}

export function getTrackedHighlightAt(tileX, tileY) {
  var tracked = world.trackedLineage;

  if (!tracked) {
    return 0;
  }

  var sample = 0;
  var nearby = typeof collectOrganismsInRadius === "function"
    ? collectOrganismsInRadius(tileX, tileY, 2, tracked.lineageId, 16)
    : [];

  for (var i = 0; i < nearby.length; i++) {
    if (
      Math.max(1, Math.round(Number(nearby[i].speciesId) || tracked.speciesId)) === tracked.speciesId ||
      Math.max(1, Math.round(Number(nearby[i].lineageId) || tracked.lineageId)) === tracked.lineageId
    ) {
      sample = Math.max(sample, 0.85);
      break;
    }
  }

  var population = getTrackedPopulation(tracked.populationId);
  var cells = population && Array.isArray(population.territoryCells) ? population.territoryCells : [];

  for (var cellIndex = 0; cellIndex < cells.length; cellIndex++) {
    var distance = getTileManhattanDistance(tileX, tileY, cells[cellIndex].x, cells[cellIndex].y);
    sample = Math.max(sample, clamp(1 - distance / 4, 0, 1) * 0.72);
  }

  if (tracked.range) {
    var inRange = tileX >= tracked.range.minX && tileX <= tracked.range.maxX && tileY >= tracked.range.minY && tileY <= tracked.range.maxY;
    if (inRange) {
      sample = Math.max(sample, 0.28);
    }
  }

  return clamp(sample, 0, 1);
}

PS.sim.lineageTracking = {
  ensureState: ensureLineageTrackingState,
  select: makeTrackedLineage,
  selectFromRepresentative: function(representativeOrId, options) {
    var representative = typeof representativeOrId === "object"
      ? representativeOrId
      : getTrackedRepresentative(representativeOrId);
    return makeTrackedLineage(representative, options);
  },
  pin: pinTrackedLineage,
  update: updateTrackedLineage,
  get: function() {
    return ensureLineageTrackingState();
  },
  getSummary: getTrackedLineageSummary,
  eventMatches: eventMatchesTrackedLineage,
  getEvents: getTrackedEvents,
  getHighlightAt: getTrackedHighlightAt
};
