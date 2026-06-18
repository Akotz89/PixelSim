import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { chance, clamp, randomInt } from "../core/utils.js";
import { getClampedWorldY, getWrappedWorldX } from "../render/planet-grid.js";
import { getRandomLatLonInTile } from "../render/planet-view.js";
import { world } from "../systems/state.js";

export function varyTraitValue(defaultValue, minValue, maxValue, stepValue) {
  return clamp(defaultValue + (randomInt(3) - 1) * stepValue, minValue, maxValue);
}

export function inheritTraitValue(parentValue, minValue, maxValue, stepValue) {
  var nextValue = parentValue;

  if (chance(CONFIG.TRAIT_MUTATION_CHANCE)) {
    nextValue += (randomInt(3) - 1) * stepValue;
  }

  return clamp(nextValue, minValue, maxValue);
}

export function makeInitialOrganismTraits(typeId) {
  // Use trait registry when available (AZR-493)
  var typeDefaults = PS.core && PS.core.EntityRegistry && typeof PS.core.EntityRegistry.getTraitDefaults === "function"
    ? PS.core.EntityRegistry.getTraitDefaults(typeId || "herbivore_basic")
    : {};
  var traits;

  if (PS.traitRegistry && PS.traitRegistry.definitionOrder.length > 0) {
    traits = PS.traitRegistry.makeInitial();
    return normalizeOrganismTraits(Object.assign(traits, typeDefaults));
  }

  // Fallback: original CONFIG-based generation
  traits = {
    vision: varyTraitValue(
      CONFIG.TRAIT_VISION_DEFAULT,
      CONFIG.TRAIT_VISION_MIN,
      CONFIG.TRAIT_VISION_MAX,
      CONFIG.TRAIT_VISION_MUTATION_STEP
    ),
    metabolism: varyTraitValue(
      CONFIG.TRAIT_METABOLISM_DEFAULT,
      CONFIG.TRAIT_METABOLISM_MIN,
      CONFIG.TRAIT_METABOLISM_MAX,
      CONFIG.TRAIT_METABOLISM_MUTATION_STEP
    ),
    reproductionEnergy: varyTraitValue(
      CONFIG.TRAIT_REPRODUCTION_ENERGY_DEFAULT,
      CONFIG.TRAIT_REPRODUCTION_ENERGY_MIN,
      CONFIG.TRAIT_REPRODUCTION_ENERGY_MAX,
      CONFIG.TRAIT_REPRODUCTION_ENERGY_MUTATION_STEP
    ),
    movementTendency: varyTraitValue(
      CONFIG.TRAIT_MOVEMENT_TENDENCY_DEFAULT,
      CONFIG.TRAIT_MOVEMENT_TENDENCY_MIN,
      CONFIG.TRAIT_MOVEMENT_TENDENCY_MAX,
      CONFIG.TRAIT_MOVEMENT_TENDENCY_MUTATION_STEP
    ),
    terrainAffinity: varyTraitValue(
      CONFIG.TRAIT_TERRAIN_AFFINITY_DEFAULT,
      CONFIG.TRAIT_TERRAIN_AFFINITY_MIN,
      CONFIG.TRAIT_TERRAIN_AFFINITY_MAX,
      CONFIG.TRAIT_TERRAIN_AFFINITY_MUTATION_STEP
    ),
    intelligence: varyTraitValue(
      CONFIG.TRAIT_INTELLIGENCE_DEFAULT,
      CONFIG.TRAIT_INTELLIGENCE_MIN,
      CONFIG.TRAIT_INTELLIGENCE_MAX,
      CONFIG.TRAIT_INTELLIGENCE_MUTATION_STEP
    ),
    sociality: varyTraitValue(
      CONFIG.TRAIT_SOCIALITY_DEFAULT,
      CONFIG.TRAIT_SOCIALITY_MIN,
      CONFIG.TRAIT_SOCIALITY_MAX,
      CONFIG.TRAIT_SOCIALITY_MUTATION_STEP
    ),
    carnivory: varyTraitValue(
      CONFIG.TRAIT_CARNIVORY_DEFAULT,
      CONFIG.TRAIT_CARNIVORY_MIN,
      CONFIG.TRAIT_CARNIVORY_MAX,
      CONFIG.TRAIT_CARNIVORY_MUTATION_STEP
    ),
    bodySize: CONFIG.TRAIT_BODY_SIZE_DEFAULT,
    limbCount: CONFIG.TRAIT_LIMB_COUNT_DEFAULT,
    bodyShape: CONFIG.TRAIT_BODY_SHAPE_DEFAULT,
    appendageType: CONFIG.TRAIT_APPENDAGE_TYPE_DEFAULT,
    camouflage: CONFIG.TRAIT_CAMOUFLAGE_DEFAULT,
    thermalTolerance: CONFIG.TRAIT_THERMAL_TOLERANCE_DEFAULT,
    waterDependency: CONFIG.TRAIT_WATER_DEPENDENCY_DEFAULT
  };

  return normalizeOrganismTraits(Object.assign(traits, typeDefaults));
}

export function inheritOrganismTraits(parentTraits) {
  parentTraits = normalizeOrganismTraits(parentTraits);
  var definitions;
  var traits;
  var i;

  // Use trait registry when available (AZR-493)
  if (PS.traitRegistry && PS.traitRegistry.definitionOrder.length > 0) {
    return PS.traitRegistry.inherit(parentTraits);
  }

  definitions = PS.core.traitSchema.getDefinitions();
  traits = {};

  for (i = 0; i < definitions.length; i++) {
    traits[definitions[i].key] = inheritTraitValue(
      parentTraits[definitions[i].key],
      CONFIG[definitions[i].configPrefix + "_MIN"],
      CONFIG[definitions[i].configPrefix + "_MAX"],
      Number(CONFIG[definitions[i].configPrefix + "_MUTATION_STEP"]) || 0
    );
  }

  return normalizeOrganismTraits(traits);
}

export function copyTraitsForLineage(traits) {
  return PS.core.traitSchema.copy(traits);
}

export function allocateLineageId() {
  var lineageId = world.nextLineageId;
  world.nextLineageId++;
  return lineageId;
}

export function allocateSpeciesId() {
  var speciesId = Math.max(1, Math.round(Number(world.nextSpeciesId) || 1));
  world.nextSpeciesId = speciesId + 1;
  return speciesId;
}

export function allocateBiologyPopulationId() {
  var populationId = Math.max(1, Math.round(Number(world.nextBiologyPopulationId) || 1));
  world.nextBiologyPopulationId = populationId + 1;
  return populationId;
}

export function allocateBiologyRepresentativeId() {
  var representativeId = Math.max(1, Math.round(Number(world.nextBiologyRepresentativeId) || 1));
  world.nextBiologyRepresentativeId = representativeId + 1;
  return representativeId;
}

export function ensureLineageRegistry() {
  if (!world.lineages) {
    world.lineages = {};
  }

  return world.lineages;
}

export function makeLineageRecord(lineageId, parentId, founderGeneration, founderTraits, createdTick) {
  return {
    id: lineageId,
    parentId: Math.max(0, Math.round(parentId || 0)),
    createdTick: Math.max(0, Math.round(createdTick || 0)),
    founderGeneration: Math.max(0, Math.round(founderGeneration || 0)),
    founderTraits: copyTraitsForLineage(founderTraits || makeInitialOrganismTraits()),
    activeCount: 0,
    lastSeenTick: Math.max(0, Math.round(createdTick || 0)),
    peakPopulation: 0,
    isExtinct: true
  };
}

export function registerLineage(lineageId, parentId, founderGeneration, founderTraits, createdTick) {
  var lineages = ensureLineageRegistry();
  var lineageKey = String(lineageId);
  var record = lineages[lineageKey];

  if (!record) {
    record = makeLineageRecord(
      lineageId,
      parentId,
      founderGeneration,
      founderTraits,
      createdTick
    );
    lineages[lineageKey] = record;
  } else {
    if (typeof record.parentId !== "number") {
      record.parentId = Math.max(0, Math.round(parentId || 0));
    }

    if (typeof record.createdTick !== "number") {
      record.createdTick = Math.max(0, Math.round(createdTick || 0));
    }

    if (typeof record.founderGeneration !== "number") {
      record.founderGeneration = Math.max(0, Math.round(founderGeneration || 0));
    }

    if (!record.founderTraits) {
      record.founderTraits = copyTraitsForLineage(founderTraits || makeInitialOrganismTraits());
    } else {
      record.founderTraits = copyTraitsForLineage(record.founderTraits);
    }

    record.activeCount = Math.max(0, Math.round(record.activeCount || 0));
    record.lastSeenTick = Math.max(0, Math.round(record.lastSeenTick || record.createdTick || 0));
    record.peakPopulation = Math.max(0, Math.round(record.peakPopulation || 0));
    record.isExtinct = Boolean(record.isExtinct);
  }

  if (lineageId >= world.nextLineageId) {
    world.nextLineageId = lineageId + 1;
  }

  return record;
}

export function ensureOrganismLineage(organism) {
  if (typeof organism.lineageId !== "number" || organism.lineageId < 1) {
    organism.lineageId = allocateLineageId();
  }

  if (typeof organism.lineageParentId !== "number") {
    organism.lineageParentId = 0;
  }

  if (typeof organism.generation !== "number") {
    organism.generation = 0;
  }

  if (typeof organism.speciesId !== "number" || organism.speciesId < 1) {
    organism.speciesId = organism.lineageId;
  }

  if (typeof organism.populationId !== "number" || organism.populationId < 1) {
    organism.populationId = organism.lineageId;
  }

  if (typeof organism.representativeId !== "number" || organism.representativeId < 1) {
    organism.representativeId = allocateBiologyRepresentativeId();
  }

  if (organism.lineageId >= world.nextLineageId) {
    world.nextLineageId = organism.lineageId + 1;
  }

  if (organism.speciesId >= world.nextSpeciesId) {
    world.nextSpeciesId = organism.speciesId + 1;
  }

  if (organism.populationId >= world.nextBiologyPopulationId) {
    world.nextBiologyPopulationId = organism.populationId + 1;
  }

  if (organism.representativeId >= world.nextBiologyRepresentativeId) {
    world.nextBiologyRepresentativeId = organism.representativeId + 1;
  }

  registerLineage(
    organism.lineageId,
    organism.lineageParentId,
    organism.generation,
    ensureOrganismTraits(organism),
    world.tick
  );

  return organism.lineageId;
}

export function getTraitDivergenceScore(parentTraits, childTraits) {
  parentTraits = normalizeOrganismTraits(parentTraits);
  childTraits = normalizeOrganismTraits(childTraits);
  var definitions = PS.core.traitSchema.getDefinitions();
  var score = 0;

  for (var i = 0; i < definitions.length; i++) {
    var definition = definitions[i];
    var mutationStep = Number(CONFIG[definition.configPrefix + "_MUTATION_STEP"]) || 0;

    if (mutationStep <= 0) {
      continue;
    }

    score += Math.abs(childTraits[definition.key] - parentTraits[definition.key]) / mutationStep;
  }

  return score;
}

export function assignChildLineage(child, parent, parentTraits) {
  var childTraits = ensureOrganismTraits(child);
  var divergenceScore = getTraitDivergenceScore(parentTraits, childTraits);
  var parentLineageId = ensureOrganismLineage(parent);

  child.generation = parent.generation + 1;

  if (divergenceScore >= CONFIG.LINEAGE_DIVERGENCE_SCORE_FOR_NEW_LINEAGE) {
    child.lineageId = allocateLineageId();
    child.lineageParentId = parentLineageId;
    registerLineage(child.lineageId, parentLineageId, child.generation, childTraits, world.tick);
  } else {
    child.lineageId = parentLineageId;
    child.lineageParentId = parent.lineageParentId;
  }
}

export function ensureOrganismTraits(organism) {
  if (!organism.traits) {
    organism.traits = makeInitialOrganismTraits();
    organism.traitsNormalized = true;
  }

  if (organism.traitsNormalized !== true) {
    organism.traits = normalizeOrganismTraits(organism.traits);
    organism.traitsNormalized = true;
  }

  return organism.traits;
}

export function normalizeOrganismTraits(traits) {
  return PS.core.traitSchema.normalize(traits);
}

export function makeOrganism(x, y, lineageId, typeId) {
  var tileX = getWrappedWorldX(x);
  var tileY = getClampedWorldY(y);
  var surfacePosition = getRandomLatLonInTile(tileX, tileY);
  var organism = PS.pools && PS.pools.ensure() && PS.poolManager.acquire("organisms");
  var entityTypeId = typeId || "herbivore_basic";
  var entityType = PS.core && PS.core.EntityRegistry ? PS.core.EntityRegistry.get(entityTypeId) : null;

  if (!organism) {
    return null;
  }

  organism.x = tileX;
  organism.y = tileY;
  organism.prevX = tileX;
  organism.prevY = tileY;
  organism.latitude = surfacePosition.latitude;
  organism.longitude = surfacePosition.longitude;
  organism.prevLatitude = surfacePosition.latitude;
  organism.prevLongitude = surfacePosition.longitude;
  organism.energy = entityType && Number.isFinite(Number(entityType.baseEnergy))
    ? Number(entityType.baseEnergy)
    : CONFIG.STARTING_ORGANISM_ENERGY;
  organism.age = 0;
  organism.directionX = randomInt(3) - 1;
  organism.directionY = randomInt(3) - 1;
  organism.facing = organism.directionY < 0 ? 3 : (organism.directionY > 0 ? 0 : (organism.directionX < 0 ? 1 : 2));
  organism.animFrame = 0;
  organism.velocityX = 0;
  organism.velocityY = 0;
  organism.travelKm = 0;
  organism.typeId = entityType ? entityType.id : entityTypeId;
  organism.entityType = organism.typeId;
  organism.spriteSheet = entityType ? entityType.spriteSheet : "";
  organism.diet = entityType && entityType.diet ? entityType.diet : "herbivore";
  organism.maxAge = entityType && Number.isFinite(Number(entityType.maxAge)) ? Number(entityType.maxAge) : CONFIG.ORGANISM_MAX_AGE;
  organism.traits = makeInitialOrganismTraits(organism.typeId);
  organism.traitsNormalized = true;
  organism.lineageId = lineageId || allocateLineageId();
  organism.lineageParentId = 0;
  organism.generation = 0;
  organism.speciesId = organism.lineageId;
  organism.populationId = organism.lineageId;
  organism.representativeId = allocateBiologyRepresentativeId();

  registerLineage(organism.lineageId, 0, 0, organism.traits, world.tick);
  return organism;
}

export function createOrganism(typeId, position) {
  position = position || {};
  return makeOrganism(
    Number(position.x) || 0,
    Number(position.y) || 0,
    position.lineageId,
    typeId
  );
}
