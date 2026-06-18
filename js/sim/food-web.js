import { CONFIG } from "../../config.js";
import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { getTileManhattanDistance } from "../render/planet-grid.js";
import { findNearestPrey, getTerrainMismatchForTraits } from "./organisms-behavior.js";
import { collectOrganismsInRadius } from "./organisms-indexes.js";
import { ensureOrganismTraits } from "./organisms-traits.js";
import { world } from "../systems/state.js";

PS.sim = PS.sim || {};

PS.sim.foodWeb = (function() {
  var spatialSignature = "";

  function normalize01(value, fallback) {
    var numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      numberValue = Number(fallback) || 0;
    }

    return clamp(numberValue, 0, 1);
  }

  function normalizeMovement(value) {
    var min = Number(CONFIG && CONFIG.TRAIT_MOVEMENT_TENDENCY_MIN);
    var max = Number(CONFIG && CONFIG.TRAIT_MOVEMENT_TENDENCY_MAX);

    if (Number.isFinite(max - min) && max > min) {
      return clamp((Number(value) - min) / (max - min), 0, 1);
    }

    return normalize01(value, 0);
  }

  function getRole(traits) {
    var carnivory = normalize01(traits && traits.carnivory, 0);
    var metabolism = Number(traits && traits.metabolism) || CONFIG.TRAIT_METABOLISM_DEFAULT;
    var mobility = normalizeMovement(traits && traits.movementTendency);

    if (carnivory > CONFIG.PREDATION_CARNIVORY_THRESHOLD) {
      return "predator";
    }

    if (carnivory >= CONFIG.PREDATION_CARNIVORY_THRESHOLD * 0.55) {
      return mobility <= 0.35 || metabolism <= CONFIG.TRAIT_METABOLISM_DEFAULT ? "scavenger" : "omnivore";
    }

    if (metabolism <= CONFIG.TRAIT_METABOLISM_MIN + 0.2 && mobility <= 0.25) {
      return "decomposer";
    }

    return "herbivore";
  }

  function getOrganismId(organism, index) {
    var stableId = organism && (organism.representativeId || organism.id || organism.poolIndex);

    if (!stableId) {
      stableId = index + 1;
    }

    return "organism:" + stableId;
  }

  function getSpatialSignature() {
    return [
      Array.isArray(world.organisms) ? world.organisms.length : 0,
      Math.max(0, Math.round(Number(world.tick) || 0)),
      Math.max(0, Math.round(Number(world.totalBirths) || 0)),
      Math.max(0, Math.round(Number(world.totalDeaths) || 0))
    ].join(":");
  }

  function rebuildSpatialIndex() {
    if (!PS.spatial || typeof PS.spatial.clear !== "function" || typeof PS.spatial.insert !== "function") {
      return false;
    }

    PS.spatial.clear();

    for (var i = 0; i < world.organisms.length; i++) {
      var organism = world.organisms[i];

      if (organism && Number(organism.energy) > 0) {
        PS.spatial.insert(getOrganismId(organism, i), organism.x, organism.y, {
          kind: "organism",
          organism: organism
        });
      }
    }

    spatialSignature = getSpatialSignature();
    return true;
  }

  function ensureSpatialIndex() {
    if (spatialSignature !== getSpatialSignature()) {
      return rebuildSpatialIndex();
    }

    return Boolean(PS.spatial && PS.spatial.index);
  }

  function getSpatialOrganismsInRadius(x, y, radius) {
    if (!ensureSpatialIndex() || !PS.spatial || typeof PS.spatial.queryRadius !== "function") {
      return null;
    }

    var ids = PS.spatial.queryRadius(x, y, radius);
    var organisms = [];

    for (var i = 0; i < ids.length; i++) {
      var record = PS.spatial.index.entities[String(ids[i])];
      var organism = record && record.metadata ? record.metadata.organism : null;

      if (organism) {
        organisms.push(organism);
      }
    }

    return organisms;
  }

  function getPreyCandidateScore(attacker, prey, attackerTraits, preyTraits) {
    var distance = getTileManhattanDistance(attacker.x, attacker.y, prey.x, prey.y);
    var preyCamouflage = normalize01(preyTraits && preyTraits.camouflage, 0);
    var preyMobility = normalizeMovement(preyTraits && preyTraits.movementTendency);
    var attackerMobility = normalizeMovement(attackerTraits && attackerTraits.movementTendency);
    var terrainPenalty = typeof getTerrainMismatchForTraits === "function"
      ? getTerrainMismatchForTraits(attackerTraits, prey.x, prey.y)
      : 0;

    return distance + preyCamouflage * 3 + preyMobility * 2 + terrainPenalty * 2 - attackerMobility;
  }

  function isPrey(candidate, attacker) {
    if (!candidate || candidate === attacker || candidate.energy <= 0) {
      return false;
    }

    return getRole(ensureOrganismTraits(candidate)) !== "predator";
  }

  function findNearestPrey(attacker, attackerTraits, radius) {
    var candidates = getSpatialOrganismsInRadius(attacker.x, attacker.y, radius);
    var fallbackCandidates = null;
    var bestPrey = null;
    var bestScore = Infinity;

    if (!candidates && typeof collectOrganismsInRadius === "function") {
      fallbackCandidates = collectOrganismsInRadius(attacker.x, attacker.y, radius, 0);
      candidates = fallbackCandidates;
    }

    if (!Array.isArray(candidates)) {
      candidates = world.organisms;
    }

    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];

      if (!isPrey(candidate, attacker)) {
        continue;
      }

      var candidateTraits = ensureOrganismTraits(candidate);
      var score = getPreyCandidateScore(attacker, candidate, attackerTraits, candidateTraits);

      if (score < bestScore) {
        bestScore = score;
        bestPrey = candidate;
      }
    }

    return bestPrey;
  }

  function getAttackAdvantage(attackerTraits, victimTraits, attacker, victim) {
    var attackerSize = Number(attackerTraits.bodySize) || CONFIG.TRAIT_BODY_SIZE_DEFAULT;
    var victimSize = Number(victimTraits.bodySize) || CONFIG.TRAIT_BODY_SIZE_DEFAULT;
    var attackerLimbs = Number(attackerTraits.limbCount) || CONFIG.TRAIT_LIMB_COUNT_DEFAULT;
    var victimLimbs = Number(victimTraits.limbCount) || CONFIG.TRAIT_LIMB_COUNT_DEFAULT;
    var attackerMobility = normalizeMovement(attackerTraits.movementTendency);
    var victimMobility = normalizeMovement(victimTraits.movementTendency);
    var victimCamouflage = normalize01(victimTraits.camouflage, 0);
    var terrainPenalty = attacker && victim && typeof getTerrainMismatchForTraits === "function"
      ? getTerrainMismatchForTraits(attackerTraits, victim.x, victim.y) * 0.35
      : 0;

    return (
      attackerSize - victimSize +
      (attackerLimbs - victimLimbs) * 0.05 +
      (Number(attackerTraits.carnivory) - Number(victimTraits.carnivory)) * 0.25 +
      (attackerMobility - victimMobility) * 0.4 -
      victimCamouflage * 0.35 -
      terrainPenalty
    );
  }

  function recordPredation(attacker, prey, transferredEnergy) {
    world.foodWebStats = world.foodWebStats || {
      predationEvents: 0,
      energyTransferred: 0,
      lastPredationTick: 0
    };
    world.foodWebStats.predationEvents++;
    world.foodWebStats.energyTransferred += Math.max(0, Number(transferredEnergy) || 0);
    world.foodWebStats.lastPredationTick = Math.max(0, Math.round(Number(world.tick) || 0));
    world.foodWebStats.lastPredatorId = attacker ? attacker.representativeId || attacker.id || null : null;
    world.foodWebStats.lastPreyId = prey ? prey.representativeId || prey.id || null : null;
  }

  function getPopulationMetrics(organisms, traitsList, pressure) {
    var metrics = {
      role: "empty",
      roles: {
        producer: Math.max(0, Math.round(Number(pressure && pressure.food) || 0)),
        herbivore: 0,
        predator: 0,
        scavenger: 0,
        decomposer: 0,
        omnivore: 0
      },
      trophicBalance: 0,
      scarcity: clamp(Number(pressure && pressure.scarcity) || 0, 0, 1),
      predatorPressure: 0,
      recoveryTrend: "unknown"
    };

    if (!Array.isArray(organisms) || organisms.length <= 0) {
      return metrics;
    }

    for (var i = 0; i < organisms.length; i++) {
      var traits = traitsList && traitsList[i] ? traitsList[i] : ensureOrganismTraits(organisms[i]);
      var role = getRole(traits);

      metrics.roles[role] = (metrics.roles[role] || 0) + 1;
    }

    var consumers = metrics.roles.herbivore + metrics.roles.omnivore + metrics.roles.scavenger + metrics.roles.decomposer;
    var predators = metrics.roles.predator;
    var predatorRatio = predators / Math.max(1, organisms.length);
    var consumerRatio = consumers / Math.max(1, organisms.length);
    var targetPredatorRatio = clamp(consumerRatio * 0.28, 0.05, 0.35);
    var dominantRole = "herbivore";
    var dominantCount = -1;

    ["predator", "herbivore", "scavenger", "decomposer", "omnivore"].forEach(function(roleName) {
      if (metrics.roles[roleName] > dominantCount) {
        dominantRole = roleName;
        dominantCount = metrics.roles[roleName];
      }
    });

    metrics.role = dominantRole;
    metrics.predatorPressure = clamp(predators / Math.max(1, consumers), 0, 1);
    metrics.trophicBalance = Math.round(clamp(1 - Math.abs(predatorRatio - targetPredatorRatio) / Math.max(0.05, targetPredatorRatio), 0, 1) * 100);
    metrics.recoveryTrend = metrics.scarcity > 0.7
      ? "collapsing"
      : (metrics.roles.decomposer + metrics.roles.scavenger > 0 && metrics.roles.producer > 0 ? "recovering" : "stable");
    return metrics;
  }

  function refreshSummary(populations) {
    var source = Array.isArray(populations) ? populations : (Array.isArray(world.biologyPopulations) ? world.biologyPopulations : []);
    var summary = {
      populations: source.length,
      roles: {
        producer: Math.max(0, Array.isArray(world.food) ? world.food.length : 0),
        herbivore: 0,
        predator: 0,
        scavenger: 0,
        decomposer: 0,
        omnivore: 0
      },
      trophicBalance: 0,
      scarcity: 0,
      predatorPressure: 0,
      recoveryTrend: "unknown"
    };
    var balanceTotal = 0;

    for (var i = 0; i < source.length; i++) {
      var foodWeb = source[i] && source[i].foodWeb ? source[i].foodWeb : null;

      if (!foodWeb) {
        continue;
      }

      for (var role in summary.roles) {
        if (Object.prototype.hasOwnProperty.call(summary.roles, role)) {
          summary.roles[role] += Math.max(0, Math.round(Number(foodWeb.roles && foodWeb.roles[role]) || 0));
        }
      }

      balanceTotal += Number(foodWeb.trophicBalance) || 0;
      summary.scarcity = Math.max(summary.scarcity, Number(foodWeb.scarcity) || 0);
      summary.predatorPressure = Math.max(summary.predatorPressure, Number(foodWeb.predatorPressure) || 0);
    }

    summary.trophicBalance = source.length > 0 ? Math.round(balanceTotal / source.length) : 0;
    summary.recoveryTrend = summary.scarcity > 0.7
      ? "collapsing"
      : (summary.roles.scavenger + summary.roles.decomposer > 0 ? "recovering" : "stable");
    world.foodWebSummary = summary;
    return summary;
  }

  function emitMilestones(summary) {
    summary = summary || world.foodWebSummary || refreshSummary();
    world.foodWebMilestones = world.foodWebMilestones || {};

    if (summary.roles.predator > 0 && !world.foodWebMilestones.firstPredator) {
      world.foodWebMilestones.firstPredator = true;
      if (PS.events && typeof PS.events.emitMilestone === "function") {
        PS.events.emitMilestone({
          type: "biology.first-predator",
          label: "First predator",
          detail: summary.roles.predator + " predator organisms",
          source: "biology",
          category: "biology",
          severity: "info"
        });
      }
    }

    if (summary.recoveryTrend === "collapsing" && !world.foodWebMilestones.trophicCollapse) {
      world.foodWebMilestones.trophicCollapse = true;
      if (PS.events && typeof PS.events.emitMilestone === "function") {
        PS.events.emitMilestone({
          type: "biology.trophic-collapse",
          label: "Trophic collapse",
          detail: "scarcity " + summary.scarcity.toFixed(2),
          source: "biology",
          category: "biology",
          severity: "warning"
        });
      }
    }

    if (summary.recoveryTrend === "recovering" && world.foodWebMilestones.trophicCollapse && !world.foodWebMilestones.trophicRecovery) {
      world.foodWebMilestones.trophicRecovery = true;
      if (PS.events && typeof PS.events.emitMilestone === "function") {
        PS.events.emitMilestone({
          type: "biology.trophic-recovery",
          label: "Food web recovery",
          detail: "scavenger/decomposer recovery active",
          source: "biology",
          category: "biology",
          severity: "info"
        });
      }
    }
  }

  return {
    getRole: getRole,
    rebuildSpatialIndex: rebuildSpatialIndex,
    ensureSpatialIndex: ensureSpatialIndex,
    findNearestPrey: findNearestPrey,
    getAttackAdvantage: getAttackAdvantage,
    recordPredation: recordPredation,
    getPopulationMetrics: getPopulationMetrics,
    refreshSummary: refreshSummary,
    emitMilestones: emitMilestones
  };
})();
