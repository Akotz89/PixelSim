// ── RANMAP: Deterministic Per-Tile Random (AZR-499) ────────────────
// Precomputed random value per tile for visual variety.
// Used for sprite variant selection, sub-pixel jitter, rotation/flip, and
// particle seeding.
//
// Usage:
//   PS.ranmap.init(WORLD_WIDTH, WORLD_HEIGHT, seed);
//   var rand = PS.ranmap.get(x, y);         // full uint32
//   var variant = PS.ranmap.variant(x, y, maxVariants); // 0..maxVariants-1
//   var jitterX = PS.ranmap.jitterX(x, y);  // -0.5..0.5
//   var jitterY = PS.ranmap.jitterY(x, y);  // -0.5..0.5
//   var flip = PS.ranmap.flipH(x, y);       // true/false

PS.render = PS.render || {};

PS.ranmap = {
  data: null,
  width: 0,
  height: 0,
  seed: 0,

  // ── Initialize RANMAP ──

  init: function (width, height, seed) {
    PS.ranmap.width = Math.max(1, Math.round(Number(width) || WORLD_WIDTH));
    PS.ranmap.height = Math.max(1, Math.round(Number(height) || WORLD_HEIGHT));
    PS.ranmap.seed = Math.abs(Math.round(Number(seed) || 0x9E3779B9)) | 1;

    var total = PS.ranmap.width * PS.ranmap.height;
    PS.ranmap.data = new Uint32Array(total);

    var noise = PS.core.createNoise2D("ranmap:" + PS.ranmap.seed);
    for (var i = 0; i < total; i++) {
      var x = i % PS.ranmap.width;
      var y = Math.floor(i / PS.ranmap.width);

      PS.ranmap.data[i] = noise.hash(x, y, PS.ranmap.seed);
    }

    return PS.ranmap;
  },

  // ── Get raw random value for tile ──

  get: function (x, y) {
    if (!PS.ranmap.data) { return 0; }

    var ix = Math.round(Number(x) || 0) % PS.ranmap.width;
    if (ix < 0) { ix += PS.ranmap.width; }

    var iy = Math.round(Number(y) || 0);
    if (iy < 0) { iy = 0; }
    if (iy >= PS.ranmap.height) { iy = PS.ranmap.height - 1; }

    return PS.ranmap.data[iy * PS.ranmap.width + ix];
  },

  // ── Get sprite variant index (0 to maxVariants-1) ──

  variant: function (x, y, maxVariants) {
    var max = Math.max(1, Math.round(Number(maxVariants) || 1));
    return (PS.ranmap.get(x, y) >>> 0) % max;
  },

  // ── Get sub-pixel jitter X (-0.5 to 0.5) ──

  jitterX: function (x, y) {
    var raw = PS.ranmap.get(x, y);
    return ((raw & 0xFF) / 255) - 0.5;
  },

  // ── Get sub-pixel jitter Y (-0.5 to 0.5) ──

  jitterY: function (x, y) {
    var raw = PS.ranmap.get(x, y);
    return (((raw >>> 8) & 0xFF) / 255) - 0.5;
  },

  // ── Get horizontal flip flag ──

  flipH: function (x, y) {
    return (PS.ranmap.get(x, y) & 0x10000) !== 0;
  },

  // ── Get vertical flip flag ──

  flipV: function (x, y) {
    return (PS.ranmap.get(x, y) & 0x20000) !== 0;
  },

  // ── Get rotation (0, 90, 180, 270) ──

  rotation: function (x, y) {
    return ((PS.ranmap.get(x, y) >>> 18) & 0x3) * 90;
  },

  // ── Get a normalized float 0..1 from a specific bit range ──

  normalizedBits: function (x, y, startBit, bitCount) {
    var raw = PS.ranmap.get(x, y);
    var mask = (1 << bitCount) - 1;
    var value = (raw >>> startBit) & mask;
    return value / mask;
  },

  // ── Debug stats ──

  getStats: function () {
    if (!PS.ranmap.data) {
      return { initialized: false };
    }

    // Quick uniformity check: count even vs odd
    var even = 0;
    var odd = 0;
    var sampleSize = Math.min(PS.ranmap.data.length, 10000);

    for (var i = 0; i < sampleSize; i++) {
      if (PS.ranmap.data[i] & 1) {
        odd++;
      } else {
        even++;
      }
    }

    return {
      initialized: true,
      width: PS.ranmap.width,
      height: PS.ranmap.height,
      totalTiles: PS.ranmap.data.length,
      seed: PS.ranmap.seed,
      uniformityCheck: {
        sampleSize: sampleSize,
        even: even,
        odd: odd,
        ratio: (even / Math.max(1, odd)).toFixed(3)
      }
    };
  }
};

PS.render.ranmap = PS.ranmap;
