// ── Modifier Engine (AZR-493) ──────────────────────────────────────
// Composable additive/multiplicative stat modifier system.
//
// Formula: finalValue = clamp((base + positiveAdds) × multiplier + negativeAdds, min, max)
//
// Usage:
//   var stat = PS.modifiers.createStat("vision", { base: 20, min: 8, max: 36 });
//   var mod  = PS.modifiers.addModifier("vision", { id: "clear_sky", add: 4 });
//   PS.modifiers.compute("vision");  // → 24
//   PS.modifiers.removeModifier("vision", "clear_sky");

PS.sim = PS.sim || {};

PS.modifiers = {
  stats: {},
  modifierCount: 0,

  // ── Register a stat ──

  createStat: function (id, options) {
    var opts = options || {};
    var stat = {
      id: String(id),
      base: Number(opts.base) || 0,
      min: Number.isFinite(Number(opts.min)) ? Number(opts.min) : -Infinity,
      max: Number.isFinite(Number(opts.max)) ? Number(opts.max) : Infinity,
      modifiers: {},
      modifierOrder: [],
      cachedValue: null,
      dirty: true
    };

    stat.cachedValue = stat.base;
    PS.modifiers.stats[id] = stat;
    return stat;
  },

  // ── Add a modifier to a stat ──

  addModifier: function (statId, options) {
    var stat = PS.modifiers.stats[statId];
    if (!stat) { return null; }

    var opts = options || {};
    var modId = String(opts.id || ("mod_" + (++PS.modifiers.modifierCount)));
    var modifier = {
      id: modId,
      add: Number(opts.add) || 0,        // Additive bonus (positive or negative)
      mul: Number(opts.mul) || 0,         // Multiplicative bonus (0.1 = +10%, -0.2 = -20%)
      priority: Number(opts.priority) || 0,
      source: opts.source || null,
      label: opts.label || modId,
      enabled: opts.enabled !== false
    };

    stat.modifiers[modId] = modifier;
    stat.modifierOrder.push(modId);
    stat.dirty = true;
    return modifier;
  },

  // ── Remove a modifier from a stat ──

  removeModifier: function (statId, modifierId) {
    var stat = PS.modifiers.stats[statId];
    if (!stat || !stat.modifiers[modifierId]) { return false; }

    delete stat.modifiers[modifierId];

    for (var i = 0; i < stat.modifierOrder.length; i++) {
      if (stat.modifierOrder[i] === modifierId) {
        stat.modifierOrder.splice(i, 1);
        break;
      }
    }

    stat.dirty = true;
    return true;
  },

  // ── Compute final value for a stat ──
  // Positive additions are multiplied before negative additions are applied.

  compute: function (statId) {
    var stat = PS.modifiers.stats[statId];
    if (!stat) { return 0; }

    if (!stat.dirty && stat.cachedValue !== null) {
      return stat.cachedValue;
    }

    var positiveAdds = 0;
    var negativeAdds = 0;
    var totalMul = 0;

    for (var i = 0; i < stat.modifierOrder.length; i++) {
      var mod = stat.modifiers[stat.modifierOrder[i]];
      if (!mod || !mod.enabled) { continue; }

      if (mod.add > 0) {
        positiveAdds += mod.add;
      } else if (mod.add < 0) {
        negativeAdds += mod.add;
      }

      totalMul += mod.mul;
    }

    var rawValue = (stat.base + positiveAdds) * (1 + totalMul) + negativeAdds;
    stat.cachedValue = Math.max(stat.min, Math.min(stat.max, rawValue));
    stat.dirty = false;
    return stat.cachedValue;
  },

  // ── Compute with a temporary base override (for per-entity evaluation) ──

  computeWithBase: function (statId, baseValue) {
    var stat = PS.modifiers.stats[statId];
    if (!stat) { return Number(baseValue) || 0; }

    var positiveAdds = 0;
    var negativeAdds = 0;
    var totalMul = 0;

    for (var i = 0; i < stat.modifierOrder.length; i++) {
      var mod = stat.modifiers[stat.modifierOrder[i]];
      if (!mod || !mod.enabled) { continue; }

      if (mod.add > 0) {
        positiveAdds += mod.add;
      } else if (mod.add < 0) {
        negativeAdds += mod.add;
      }

      totalMul += mod.mul;
    }

    var rawValue = (Number(baseValue) + positiveAdds) * (1 + totalMul) + negativeAdds;
    return Math.max(stat.min, Math.min(stat.max, rawValue));
  },

  // ── Get all active modifiers for a stat ──

  getModifiers: function (statId) {
    var stat = PS.modifiers.stats[statId];
    if (!stat) { return []; }

    var result = [];
    for (var i = 0; i < stat.modifierOrder.length; i++) {
      var mod = stat.modifiers[stat.modifierOrder[i]];
      if (mod) {
        result.push({
          id: mod.id,
          add: mod.add,
          mul: mod.mul,
          source: mod.source,
          label: mod.label,
          enabled: mod.enabled
        });
      }
    }

    return result;
  },

  // ── Mark all stats as dirty (force recompute) ──

  invalidateAll: function () {
    for (var id in PS.modifiers.stats) {
      if (Object.prototype.hasOwnProperty.call(PS.modifiers.stats, id)) {
        PS.modifiers.stats[id].dirty = true;
      }
    }
  },

  // ── Clear all modifiers from all stats ──

  clearAll: function () {
    for (var id in PS.modifiers.stats) {
      if (Object.prototype.hasOwnProperty.call(PS.modifiers.stats, id)) {
        PS.modifiers.stats[id].modifiers = {};
        PS.modifiers.stats[id].modifierOrder = [];
        PS.modifiers.stats[id].dirty = true;
      }
    }
  },

  // ── Get debug summary ──

  getStats: function () {
    var summary = {};
    for (var id in PS.modifiers.stats) {
      if (Object.prototype.hasOwnProperty.call(PS.modifiers.stats, id)) {
        var stat = PS.modifiers.stats[id];
        summary[id] = {
          base: stat.base,
          computed: PS.modifiers.compute(id),
          modifierCount: stat.modifierOrder.length,
          range: [stat.min, stat.max]
        };
      }
    }
    return summary;
  }
};

PS.sim.modifiers = PS.modifiers;
