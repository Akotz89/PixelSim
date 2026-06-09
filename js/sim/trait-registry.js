// ── Trait Registry (AZR-493) ───────────────────────────────────────
// Data-driven trait definitions replacing the 48 CONFIG.TRAIT_* entries.
// Each trait is declared once; the registry provides defaults, ranges,
// mutation behavior, and modifier stat registration.
//
// Adding a new trait requires only a single entry in TRAIT_DEFINITIONS.

PS.sim = PS.sim || {};

var TRAIT_DEFINITIONS = [
  // ── Core evolvable traits ──
  {
    id: "vision",
    label: "Vision Range",
    category: "sensory",
    min: CONFIG.TRAIT_VISION_MIN,
    max: CONFIG.TRAIT_VISION_MAX,
    defaultValue: CONFIG.TRAIT_VISION_DEFAULT,
    mutationStep: CONFIG.TRAIT_VISION_MUTATION_STEP,
    evolvable: true,
    integer: true
  },
  {
    id: "metabolism",
    label: "Metabolism Rate",
    category: "physiology",
    min: CONFIG.TRAIT_METABOLISM_MIN,
    max: CONFIG.TRAIT_METABOLISM_MAX,
    defaultValue: CONFIG.TRAIT_METABOLISM_DEFAULT,
    mutationStep: CONFIG.TRAIT_METABOLISM_MUTATION_STEP,
    evolvable: true,
    integer: true
  },
  {
    id: "reproductionEnergy",
    label: "Reproduction Energy",
    category: "reproduction",
    min: CONFIG.TRAIT_REPRODUCTION_ENERGY_MIN,
    max: CONFIG.TRAIT_REPRODUCTION_ENERGY_MAX,
    defaultValue: CONFIG.TRAIT_REPRODUCTION_ENERGY_DEFAULT,
    mutationStep: CONFIG.TRAIT_REPRODUCTION_ENERGY_MUTATION_STEP,
    evolvable: true,
    integer: true
  },
  {
    id: "movementTendency",
    label: "Movement Tendency",
    category: "behavior",
    min: CONFIG.TRAIT_MOVEMENT_TENDENCY_MIN,
    max: CONFIG.TRAIT_MOVEMENT_TENDENCY_MAX,
    defaultValue: CONFIG.TRAIT_MOVEMENT_TENDENCY_DEFAULT,
    mutationStep: CONFIG.TRAIT_MOVEMENT_TENDENCY_MUTATION_STEP,
    evolvable: true,
    integer: false
  },
  {
    id: "terrainAffinity",
    label: "Terrain Affinity",
    category: "adaptation",
    min: CONFIG.TRAIT_TERRAIN_AFFINITY_MIN,
    max: CONFIG.TRAIT_TERRAIN_AFFINITY_MAX,
    defaultValue: CONFIG.TRAIT_TERRAIN_AFFINITY_DEFAULT,
    mutationStep: CONFIG.TRAIT_TERRAIN_AFFINITY_MUTATION_STEP,
    evolvable: true,
    integer: false
  },
  {
    id: "intelligence",
    label: "Intelligence",
    category: "cognition",
    min: CONFIG.TRAIT_INTELLIGENCE_MIN,
    max: CONFIG.TRAIT_INTELLIGENCE_MAX,
    defaultValue: CONFIG.TRAIT_INTELLIGENCE_DEFAULT,
    mutationStep: CONFIG.TRAIT_INTELLIGENCE_MUTATION_STEP,
    evolvable: true,
    integer: false
  },
  {
    id: "sociality",
    label: "Sociality",
    category: "behavior",
    min: CONFIG.TRAIT_SOCIALITY_MIN,
    max: CONFIG.TRAIT_SOCIALITY_MAX,
    defaultValue: CONFIG.TRAIT_SOCIALITY_DEFAULT,
    mutationStep: CONFIG.TRAIT_SOCIALITY_MUTATION_STEP,
    evolvable: true,
    integer: false
  },

  // ── Morphology traits (not evolvable yet, set at creation) ──
  {
    id: "bodySize",
    label: "Body Size",
    category: "morphology",
    min: CONFIG.TRAIT_BODY_SIZE_MIN,
    max: CONFIG.TRAIT_BODY_SIZE_MAX,
    defaultValue: CONFIG.TRAIT_BODY_SIZE_DEFAULT,
    mutationStep: 0,
    evolvable: false,
    integer: false
  },
  {
    id: "limbCount",
    label: "Limb Count",
    category: "morphology",
    min: CONFIG.TRAIT_LIMB_COUNT_MIN,
    max: CONFIG.TRAIT_LIMB_COUNT_MAX,
    defaultValue: CONFIG.TRAIT_LIMB_COUNT_DEFAULT,
    mutationStep: 0,
    evolvable: false,
    integer: true
  },
  {
    id: "bodyShape",
    label: "Body Shape",
    category: "morphology",
    min: CONFIG.TRAIT_BODY_SHAPE_MIN,
    max: CONFIG.TRAIT_BODY_SHAPE_MAX,
    defaultValue: CONFIG.TRAIT_BODY_SHAPE_DEFAULT,
    mutationStep: 0,
    evolvable: false,
    integer: true
  },
  {
    id: "appendageType",
    label: "Appendage Type",
    category: "morphology",
    min: CONFIG.TRAIT_APPENDAGE_TYPE_MIN,
    max: CONFIG.TRAIT_APPENDAGE_TYPE_MAX,
    defaultValue: CONFIG.TRAIT_APPENDAGE_TYPE_DEFAULT,
    mutationStep: 0,
    evolvable: false,
    integer: true
  },
  {
    id: "camouflage",
    label: "Camouflage",
    category: "adaptation",
    min: CONFIG.TRAIT_CAMOUFLAGE_MIN,
    max: CONFIG.TRAIT_CAMOUFLAGE_MAX,
    defaultValue: CONFIG.TRAIT_CAMOUFLAGE_DEFAULT,
    mutationStep: 0,
    evolvable: false,
    integer: false
  },
  {
    id: "thermalTolerance",
    label: "Thermal Tolerance",
    category: "adaptation",
    min: CONFIG.TRAIT_THERMAL_TOLERANCE_MIN,
    max: CONFIG.TRAIT_THERMAL_TOLERANCE_MAX,
    defaultValue: CONFIG.TRAIT_THERMAL_TOLERANCE_DEFAULT,
    mutationStep: 0,
    evolvable: false,
    integer: false
  },
  {
    id: "waterDependency",
    label: "Water Dependency",
    category: "adaptation",
    min: CONFIG.TRAIT_WATER_DEPENDENCY_MIN,
    max: CONFIG.TRAIT_WATER_DEPENDENCY_MAX,
    defaultValue: CONFIG.TRAIT_WATER_DEPENDENCY_DEFAULT,
    mutationStep: 0,
    evolvable: false,
    integer: false
  }
];

PS.traitRegistry = {
  definitions: {},
  definitionOrder: [],
  evolvableIds: [],
  allIds: [],

  // ── Initialize from TRAIT_DEFINITIONS ──

  init: function () {
    PS.traitRegistry.definitions = {};
    PS.traitRegistry.definitionOrder = [];
    PS.traitRegistry.evolvableIds = [];
    PS.traitRegistry.allIds = [];

    for (var i = 0; i < TRAIT_DEFINITIONS.length; i++) {
      var def = TRAIT_DEFINITIONS[i];
      var traitDef = {
        id: def.id,
        label: def.label || def.id,
        category: def.category || "general",
        min: Number(def.min) || 0,
        max: Number(def.max) || 1,
        defaultValue: Number(def.defaultValue) || 0,
        mutationStep: Number(def.mutationStep) || 0,
        evolvable: def.evolvable === true,
        integer: def.integer === true
      };

      PS.traitRegistry.definitions[traitDef.id] = traitDef;
      PS.traitRegistry.definitionOrder.push(traitDef.id);
      PS.traitRegistry.allIds.push(traitDef.id);

      if (traitDef.evolvable) {
        PS.traitRegistry.evolvableIds.push(traitDef.id);
      }

      // Register modifier stat for each trait
      if (PS.modifiers && typeof PS.modifiers.createStat === "function") {
        PS.modifiers.createStat(traitDef.id, {
          base: traitDef.defaultValue,
          min: traitDef.min,
          max: traitDef.max
        });
      }
    }

    // Register environmental modifier stats (AZR-493)
    PS.traitRegistry.registerEnvironmentalModifiers();

    return PS.traitRegistry;
  },

  // ── Get a trait definition by id ──

  get: function (traitId) {
    return PS.traitRegistry.definitions[traitId] || null;
  },

  // ── Generate initial traits using the registry ──

  makeInitial: function () {
    var traits = {};

    for (var i = 0; i < PS.traitRegistry.definitionOrder.length; i++) {
      var id = PS.traitRegistry.definitionOrder[i];
      var def = PS.traitRegistry.definitions[id];

      if (def.evolvable && def.mutationStep > 0) {
        traits[id] = clamp(
          def.defaultValue + (randomInt(3) - 1) * def.mutationStep,
          def.min,
          def.max
        );
      } else {
        traits[id] = def.defaultValue;
      }

      if (def.integer) {
        traits[id] = Math.round(traits[id]);
      }
    }

    return traits;
  },

  // ── Inherit traits from parent with mutation ──

  inherit: function (parentTraits) {
    var traits = {};

    for (var i = 0; i < PS.traitRegistry.definitionOrder.length; i++) {
      var id = PS.traitRegistry.definitionOrder[i];
      var def = PS.traitRegistry.definitions[id];
      var parentValue = Number(parentTraits[id]);

      if (!Number.isFinite(parentValue)) {
        parentValue = def.defaultValue;
      }

      if (def.evolvable && def.mutationStep > 0 && chance(CONFIG.TRAIT_MUTATION_CHANCE)) {
        parentValue += (randomInt(3) - 1) * def.mutationStep;
      }

      traits[id] = clamp(parentValue, def.min, def.max);

      if (def.integer) {
        traits[id] = Math.round(traits[id]);
      }
    }

    return traits;
  },

  // ── Apply environmental modifiers to a trait value ──
  // Returns the modified value for an organism at a given position.

  applyEnvironmentalModifiers: function (traitId, baseValue, x, y) {
    if (!PS.modifiers) { return baseValue; }
    return PS.modifiers.computeWithBase(traitId, baseValue);
  },

  // ── Register environment-driven modifiers ──
  // These demonstrate the composable modifier system connecting
  // environmental conditions to organism stats.

  registerEnvironmentalModifiers: function () {
    if (!PS.modifiers) { return; }

    // Forest/dense vegetation reduces vision (obstruction)
    PS.modifiers.addModifier("vision", {
      id: "terrain_obstruction",
      add: 0,  // Base obstruction is 0; will be updated per-tick based on terrain
      source: "environment",
      label: "Terrain Obstruction",
      enabled: true
    });

    // Cold conditions increase metabolism (need more energy to stay warm)
    PS.modifiers.addModifier("metabolism", {
      id: "cold_stress",
      add: 0,  // Updated per-tick based on temperature
      source: "environment",
      label: "Cold Stress",
      enabled: true
    });
  },

  // ── Update environmental modifiers based on current conditions ──
  // Called periodically (not every tick) to update global modifiers.

  updateEnvironmentalModifiers: function () {
    if (!PS.modifiers) { return; }

    // Example: at high population density, vision is slightly reduced
    // (crowding/obstruction effect)
    var pop = world && world.organisms ? world.organisms.length : 0;
    var maxPop = CONFIG.MAX_ORGANISMS || 1000;
    var densityPenalty = -Math.round(clamp(pop / maxPop, 0, 1) * 4);

    var visionMod = PS.modifiers.stats.vision &&
      PS.modifiers.stats.vision.modifiers.terrain_obstruction;
    if (visionMod) {
      visionMod.add = densityPenalty;
      PS.modifiers.stats.vision.dirty = true;
    }

    // Example: low food availability increases metabolic stress
    var foodCount = world && world.food ? world.food.length : 0;
    var maxFood = CONFIG.MAX_FOOD || 1;
    var scarcityStress = Math.round(clamp(1 - foodCount / maxFood, 0, 1));

    var metabMod = PS.modifiers.stats.metabolism &&
      PS.modifiers.stats.metabolism.modifiers.cold_stress;
    if (metabMod) {
      metabMod.add = scarcityStress;
      PS.modifiers.stats.metabolism.dirty = true;
    }
  },

  // ── Get stats for debugging ──

  getStats: function () {
    return {
      traitCount: PS.traitRegistry.definitionOrder.length,
      evolvableCount: PS.traitRegistry.evolvableIds.length,
      categories: PS.traitRegistry.definitionOrder.reduce(function (cats, id) {
        var cat = PS.traitRegistry.definitions[id].category;
        cats[cat] = (cats[cat] || 0) + 1;
        return cats;
      }, {})
    };
  }
};

// Auto-initialize on load
PS.traitRegistry.init();

PS.sim.traitRegistry = PS.traitRegistry;
