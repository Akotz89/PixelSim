import { PS } from "../core/namespace.js";
import { clamp } from "../core/utils.js";
import { world } from "../systems/state.js";

PS.render = PS.render || {};

PS.render.shadows = PS.render.shadows || (function () {
  var MAX_HEIGHT = 31;
  var FALLBACK_DIRECTION = { x: 0.72, y: 0.48 };
  var LOOKUP = buildHeightLookup();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function normalize2(x, y) {
    var length = Math.sqrt(x * x + y * y) || 1;
    return { x: x / length, y: y / length };
  }

  function readVector(value) {
    if (value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))) {
      return { x: Number(value.x), y: Number(value.y) };
    }

    if (Array.isArray(value) && value.length >= 2) {
      return { x: Number(value[0]) || 0, y: Number(value[1]) || 0 };
    }

    return null;
  }

  function readSunVector(value) {
    if (value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) && Number.isFinite(Number(value.z))) {
      return {
        x: Number(value.x),
        y: Number(value.y),
        z: Number(value.z)
      };
    }

    if (Array.isArray(value) && value.length >= 3) {
      return {
        x: Number(value[0]) || 0,
        y: Number(value[1]) || 0,
        z: Number(value[2]) || 0
      };
    }

    return null;
  }

  function buildHeightLookup() {
    var table = [];
    var height;

    for (height = 0; height <= MAX_HEIGHT; height += 1) {
      table.push({
        height: height,
        iterations: height <= 0 ? 0 : Math.max(1, Math.min(8, Math.ceil(height / 4))),
        stepPixels: 0.55 + height * 0.045
      });
    }

    return table;
  }

  function getHeightLookup(height) {
    var key = Math.max(0, Math.min(MAX_HEIGHT, Math.round(Number(height) || 0)));
    return LOOKUP[key];
  }

  function getDirection(options, cycleState) {
    var spec = options || {};
    var explicit = readVector(spec.direction || spec.shadowDirection);
    var currentWorld = typeof world !== "undefined" ? world : null;
    var cycle = cycleState || null;
    var sun = readSunVector(spec.sunDirection || (currentWorld && currentWorld.sunDirection ? currentWorld.sunDirection : null) || (cycle ? cycle.sunDirection : null));
    var tick;
    var angle;

    if (explicit) {
      return normalize2(explicit.x, explicit.y);
    }

    if (sun) {
      return normalize2(-sun.x, Math.max(0.16, Math.abs(sun.y || sun.z) * 0.72));
    }

    tick = currentWorld && Number.isFinite(Number(currentWorld.tick)) ? Number(currentWorld.tick) : 0;
    angle = tick * 0.00024;
    return normalize2(
      Math.cos(angle) * FALLBACK_DIRECTION.x,
      Math.sin(angle) * 0.24 + FALLBACK_DIRECTION.y
    );
  }

  function getModeStrength(mode) {
    if (mode === "soft") {
      return 0.72;
    }

    if (mode === "hard") {
      return 1.18;
    }

    return 1;
  }

  function appendStampedRects(target, spec) {
    var options = spec || {};
    var lookup = getHeightLookup(options.heightUnits !== undefined ? options.heightUnits : options.height);
    var iterations = lookup.iterations;
    var cycle = PS.render.lightingCycle && typeof PS.render.lightingCycle.getState === "function"
      ? PS.render.lightingCycle.getState(options)
      : null;
    var direction = getDirection(options, cycle);
    var alpha = clamp(options.alpha === undefined ? 0.35 : options.alpha, 0, 1);
    var modeStrength = getModeStrength(options.mode);
    var distance2Ground = Math.max(0, Number(options.distance2Ground) || 0);
    var baseX = Number(options.x) || 0;
    var baseY = Number(options.y) || 0;
    var width = Math.max(0, Number(options.width) || 0);
    var height = Math.max(0, Number(options.rectHeight !== undefined ? options.rectHeight : options.heightPixels) || Number(options.height) || 0);
    var color = Array.isArray(options.color) ? options.color : [0.018, 0.028, 0.045];
    var written = 0;
    var i;
    var stamp;
    var falloff;
    var offset;

    if (options.maxIterations !== undefined) {
      iterations = Math.max(0, Math.min(iterations, Math.round(Number(options.maxIterations) || 0)));
    }

    if (!target || iterations <= 0 || alpha <= 0 || width <= 0 || height <= 0) {
      return 0;
    }

    for (i = 0; i < iterations; i += 1) {
      stamp = i + 1;
      falloff = 1 - (i / Math.max(1, iterations)) * 0.58;
      offset = distance2Ground + lookup.stepPixels * (cycle ? cycle.shadowStepScale : 1) * stamp;
      target.push(
        baseX + direction.x * offset,
        baseY + direction.y * offset,
        width,
        height,
        clamp(color[0], 0, 1),
        clamp(color[1], 0, 1),
        clamp(color[2], 0, 1),
        clamp(alpha * (cycle ? cycle.shadowAlphaScale : 1) * modeStrength * falloff, 0, 1)
      );
      written += 1;
    }

    return written;
  }

  function makeStampedRects(spec) {
    var rects = [];
    appendStampedRects(rects, spec);
    return rects;
  }

  return {
    MAX_HEIGHT: MAX_HEIGHT,
    heightLookup: LOOKUP,
    buildHeightLookup: buildHeightLookup,
    getHeightLookup: getHeightLookup,
    getDirection: getDirection,
    appendStampedRects: appendStampedRects,
    makeStampedRects: makeStampedRects
  };
}());
