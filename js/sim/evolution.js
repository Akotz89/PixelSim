import { refreshLineageRegistry } from "./organisms-indexes.js";
import { assignChildLineage, getTraitDivergenceScore, inheritOrganismTraits, inheritTraitValue, makeInitialOrganismTraits, normalizeOrganismTraits, varyTraitValue } from "./organisms-traits.js";

export const evolution = {
  varyTraitValue: function(defaultValue, minValue, maxValue, stepValue) {
    return varyTraitValue(defaultValue, minValue, maxValue, stepValue);
  },
  inheritTraitValue: function(parentValue, minValue, maxValue, stepValue) {
    return inheritTraitValue(parentValue, minValue, maxValue, stepValue);
  },
  makeInitialTraits: function() {
    return makeInitialOrganismTraits();
  },
  inheritTraits: function(parentTraits) {
    return inheritOrganismTraits(parentTraits);
  },
  normalizeTraits: function(traits) {
    return normalizeOrganismTraits(traits);
  },
  divergenceScore: function(parentTraits, childTraits) {
    return getTraitDivergenceScore(parentTraits, childTraits);
  },
  assignChildLineage: function(child, parent, parentTraits) {
    return assignChildLineage(child, parent, parentTraits);
  },
  refreshLineages: function() {
    return refreshLineageRegistry();
  }
};
