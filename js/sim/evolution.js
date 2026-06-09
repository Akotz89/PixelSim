"use strict";
PS.sim = PS.sim || {};

PS.sim.evolution = {
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
