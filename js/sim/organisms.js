import { PS } from "../core/namespace.js";
import { removeDeadOrganisms, trimOrganismPopulation, updateOrganism } from "./organisms-behavior.js";
import { collectOrganismsInRadius, countOrganismsInRadiusForLineage, ensureOrganismIndexes, getIndexedOrganismsForLineage, getNearestOrganismInRadius, rebuildOrganismIndexes } from "./organisms-indexes.js";
import { createOrganism, ensureOrganismLineage, ensureOrganismTraits, makeOrganism, registerLineage } from "./organisms-traits.js";

PS.sim = PS.sim || {};

PS.sim.organisms = {
  make: function(x, y, lineageId, typeId) {
    return makeOrganism(x, y, lineageId, typeId);
  },
  create: function(typeId, position) {
    return createOrganism(typeId, position);
  },
  ensureTraits: function(organism) {
    return ensureOrganismTraits(organism);
  },
  ensureLineage: function(organism) {
    return ensureOrganismLineage(organism);
  },
  registerLineage: function(lineageId, parentId, founderGeneration, founderTraits, createdTick) {
    return registerLineage(lineageId, parentId, founderGeneration, founderTraits, createdTick);
  },
  rebuildIndexes: function() {
    return rebuildOrganismIndexes();
  },
  ensureIndexes: function() {
    return ensureOrganismIndexes();
  },
  byLineage: function(lineageId) {
    return getIndexedOrganismsForLineage(lineageId);
  },
  collectInRadius: function(x, y, radius, lineageId, limit) {
    return collectOrganismsInRadius(x, y, radius, lineageId, limit);
  },
  countInRadiusForLineage: function(x, y, radius, lineageId) {
    return countOrganismsInRadiusForLineage(x, y, radius, lineageId);
  },
  nearestInRadius: function(x, y, radius) {
    return getNearestOrganismInRadius(x, y, radius);
  },
  update: function(organism) {
    return updateOrganism(organism);
  },
  removeDead: function() {
    return removeDeadOrganisms();
  },
  trimPopulation: function() {
    return trimOrganismPopulation();
  }
};
