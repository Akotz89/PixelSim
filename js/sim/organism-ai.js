import { PS } from "../core/namespace.js";
import { getTraitAdjustedMetabolismCost } from "./organisms-behavior.js";
import { ensureOrganismTraits } from "./organisms-traits.js";

PS.sim = PS.sim || {};

PS.sim.organismAi = (function () {
  var modules = {};
  var orderedModules = [];

  function cloneTarget(target) {
    if (!target) {
      return null;
    }

    return {
      type: String(target.type || "tile"),
      x: Math.max(0, Math.round(Number(target.x) || 0)),
      y: Math.max(0, Math.round(Number(target.y) || 0))
    };
  }

  function makePlan(moduleKey, priority, planKey, steps, target) {
    return {
      moduleKey: moduleKey,
      priority: priority,
      planKey: planKey,
      steps: steps.slice(),
      planStep: steps.length > 0 ? steps[0] : "done",
      subState: steps.length > 0 ? "ready" : "done",
      target: cloneTarget(target),
      timer: 0,
      carryingResource: null
    };
  }

  function normalizeAiState(ai) {
    ai = ai || {};
    return {
      moduleKey: String(ai.moduleKey || "wander"),
      priority: Math.max(0, Math.round(Number(ai.priority) || 0)),
      planKey: String(ai.planKey || ai.moduleKey || "wander"),
      steps: Array.isArray(ai.steps) ? ai.steps.map(String) : [String(ai.planStep || "wander")],
      planStep: String(ai.planStep || "wander"),
      subState: String(ai.subState || "ready"),
      target: cloneTarget(ai.target),
      timer: Math.max(0, Math.round(Number(ai.timer) || 0)),
      carryingResource: ai.carryingResource ? {
        id: String(ai.carryingResource.id || ""),
        amount: Math.max(0, Number(ai.carryingResource.amount) || 0)
      } : null,
      interrupt: ai.interrupt ? normalizeAiState(ai.interrupt) : null
    };
  }

  function ensureState(organism) {
    if (!organism.ai) {
      organism.ai = makePlan("wander", 10, "wander", ["wander"], null);
    } else {
      organism.ai = normalizeAiState(organism.ai);
    }

    return organism.ai;
  }

  function registerModule(module) {
    if (!module || !module.key || typeof module.getPriority !== "function" || typeof module.createPlan !== "function") {
      throw new Error("Organism AI module requires key, getPriority, and createPlan");
    }

    modules[module.key] = module;
    orderedModules = Object.keys(modules).map(function (key) {
      return modules[key];
    }).sort(function (a, b) {
      return String(a.key).localeCompare(String(b.key));
    });
  }

  function selectPlan(organism, context) {
    var bestModule = null;
    var bestPriority = -1;

    for (var i = 0; i < orderedModules.length; i++) {
      var module = orderedModules[i];
      var priority = Math.max(0, Math.round(Number(module.getPriority(organism, context)) || 0));

      if (priority > bestPriority) {
        bestPriority = priority;
        bestModule = module;
      }
    }

    if (!bestModule || bestPriority <= 0) {
      bestModule = modules.wander;
      bestPriority = 10;
    }

    return bestModule.createPlan(organism, context, bestPriority);
  }

  function tick(organism, context) {
    var current = ensureState(organism);
    var next = selectPlan(organism, context || {});

    if (next.moduleKey !== current.moduleKey && next.priority > current.priority) {
      next.interrupt = normalizeAiState(current);
      organism.ai = next;
      return next;
    }

    if (next.moduleKey !== current.moduleKey || current.subState === "done") {
      organism.ai = next;
      return next;
    }

    current.timer++;
    return current;
  }

  function advanceStep(organism, completedStep) {
    var ai = ensureState(organism);
    var index = ai.steps.indexOf(completedStep || ai.planStep);

    if (index < 0) {
      index = ai.steps.indexOf(ai.planStep);
    }

    if (index >= 0 && index + 1 < ai.steps.length) {
      ai.planStep = ai.steps[index + 1];
      ai.subState = "ready";
    } else {
      ai.subState = "done";
    }

    return ai;
  }

  function serialize(ai) {
    return normalizeAiState(ai);
  }

  function restore(ai) {
    return normalizeAiState(ai);
  }

  registerModule({
    key: "flee",
    getPriority: function (organism) {
      return organism && Number(organism.threatLevel) > 0 ? 100 : 0;
    },
    createPlan: function (organism, context, priority) {
      return makePlan("flee", priority, "flee-threat", ["chooseEscape", "moveAway"], null);
    }
  });

  registerModule({
    key: "eat",
    getPriority: function (organism, context) {
      return context && context.nearestFood ? 80 : 0;
    },
    createPlan: function (organism, context, priority) {
      return makePlan("eat", priority, "forage-food", ["walkTo", "pickUp", "consume"], {
        type: "food",
        x: context.nearestFood.x,
        y: context.nearestFood.y
      });
    }
  });

  registerModule({
    key: "reproduce",
    getPriority: function (organism, context) {
      var traits = context && context.traits ? context.traits : ensureOrganismTraits(organism);
      return organism && organism.energy >= traits.reproductionEnergy ? 70 : 0;
    },
    createPlan: function (organism, context, priority) {
      return makePlan("reproduce", priority, "reproduce", ["findMate", "spawnChild"], null);
    }
  });

  registerModule({
    key: "shelter",
    getPriority: function (organism, context) {
      var traits = context && context.traits ? context.traits : ensureOrganismTraits(organism);
      return organism && organism.energy < getTraitAdjustedMetabolismCost(traits) * 3 ? 30 : 0;
    },
    createPlan: function (organism, context, priority) {
      return makePlan("shelter", priority, "seek-shelter", ["chooseShelter", "rest"], null);
    }
  });

  registerModule({
    key: "wander",
    getPriority: function (organism, context) {
      return context && context.shouldWander ? 20 : 10;
    },
    createPlan: function (organism, context, priority) {
      return makePlan("wander", priority, "wander", ["wander"], null);
    }
  });

  return {
    modules: modules,
    registerModule: registerModule,
    ensureState: ensureState,
    tick: tick,
    advanceStep: advanceStep,
    serialize: serialize,
    restore: restore
  };
}());
