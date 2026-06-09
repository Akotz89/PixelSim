PS.core = PS.core || {};

PS.core.createNoisePrng = function (seedValue) {
  var prng = PS.core.createPRNG("noise:" + String(seedValue == null ? "PIXELDARIUM" : seedValue));

  return function () {
    return prng.next();
  };
};

PS.core.Noise2D = function (seedValue) {
  this.seed = PS.math.hashSeedText(String(seedValue == null ? "PIXELDARIUM" : seedValue)) >>> 0;
  this.permutation = new Uint8Array(512);
  this.buildPermutation(seedValue);
};

PS.core.Noise2D.prototype.buildPermutation = function (seedValue) {
  var base = new Uint8Array(256);
  var random = PS.core.createNoisePrng(seedValue);
  var i;
  var j;
  var swap;

  for (i = 0; i < 256; i++) {
    base[i] = i;
  }

  for (i = 255; i > 0; i--) {
    j = Math.floor(random() * (i + 1));
    swap = base[i];
    base[i] = base[j];
    base[j] = swap;
  }

  for (i = 0; i < 512; i++) {
    this.permutation[i] = base[i & 255];
  }
};

PS.core.Noise2D.prototype.fade = function (amount) {
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
};

PS.core.Noise2D.prototype.lerp = function (a, b, amount) {
  return a + (b - a) * amount;
};

PS.core.Noise2D.prototype.hash = function (x, y, salt) {
  var value = (Math.floor(Number(x) || 0) * 374761393) ^
    (Math.floor(Number(y) || 0) * 668265263) ^
    ((Number(salt) || 0) * 2246822519) ^
    this.seed;

  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
};

PS.core.Noise2D.prototype.unitHash = function (x, y, salt) {
  return this.hash(x, y, salt) / 4294967295;
};

PS.core.Noise2D.prototype.gradient = function (hash, x, y) {
  var h = hash & 7;
  var u = h < 4 ? x : y;
  var v = h < 4 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
};

PS.core.Noise2D.prototype.perlin = function (x, y) {
  var px = Number(x) || 0;
  var py = Number(y) || 0;
  var x0 = Math.floor(px);
  var y0 = Math.floor(py);
  var xi = x0 & 255;
  var yi = y0 & 255;
  var xf = px - x0;
  var yf = py - y0;
  var u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  var v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  var permutation = this.permutation;
  var aa = permutation[permutation[xi] + yi];
  var ab = permutation[permutation[xi] + yi + 1];
  var ba = permutation[permutation[xi + 1] + yi];
  var bb = permutation[permutation[xi + 1] + yi + 1];
  var xf1 = xf - 1;
  var yf1 = yf - 1;
  var gaaH = aa & 7;
  var gabH = ab & 7;
  var gbaH = ba & 7;
  var gbbH = bb & 7;
  var gaa = ((gaaH & 1) ? -(gaaH < 4 ? xf : yf) : (gaaH < 4 ? xf : yf)) +
    ((gaaH & 2) ? -2 * (gaaH < 4 ? yf : xf) : 2 * (gaaH < 4 ? yf : xf));
  var gba = ((gbaH & 1) ? -(gbaH < 4 ? xf1 : yf) : (gbaH < 4 ? xf1 : yf)) +
    ((gbaH & 2) ? -2 * (gbaH < 4 ? yf : xf1) : 2 * (gbaH < 4 ? yf : xf1));
  var gab = ((gabH & 1) ? -(gabH < 4 ? xf : yf1) : (gabH < 4 ? xf : yf1)) +
    ((gabH & 2) ? -2 * (gabH < 4 ? yf1 : xf) : 2 * (gabH < 4 ? yf1 : xf));
  var gbb = ((gbbH & 1) ? -(gbbH < 4 ? xf1 : yf1) : (gbbH < 4 ? xf1 : yf1)) +
    ((gbbH & 2) ? -2 * (gbbH < 4 ? yf1 : xf1) : 2 * (gbbH < 4 ? yf1 : xf1));
  var top = gaa + (gba - gaa) * u;
  var bottom = gab + (gbb - gab) * u;
  var value = (top + (bottom - top) * v) * 0.5;

  return value < -1 ? -1 : (value > 1 ? 1 : value);
};

PS.core.Noise2D.prototype.simplex = function (x, y) {
  var xin = Number(x) || 0;
  var yin = Number(y) || 0;
  var f2 = 0.5 * (Math.sqrt(3) - 1);
  var g2 = (3 - Math.sqrt(3)) / 6;
  var s = (xin + yin) * f2;
  var i = Math.floor(xin + s);
  var j = Math.floor(yin + s);
  var t = (i + j) * g2;
  var x0 = xin - (i - t);
  var y0 = yin - (j - t);
  var i1 = x0 > y0 ? 1 : 0;
  var j1 = x0 > y0 ? 0 : 1;
  var x1 = x0 - i1 + g2;
  var y1 = y0 - j1 + g2;
  var x2 = x0 - 1 + 2 * g2;
  var y2 = y0 - 1 + 2 * g2;
  var ii = i & 255;
  var jj = j & 255;
  var gi0 = this.permutation[ii + this.permutation[jj]] & 7;
  var gi1 = this.permutation[ii + i1 + this.permutation[jj + j1]] & 7;
  var gi2 = this.permutation[ii + 1 + this.permutation[jj + 1]] & 7;

  return PS.math.clamp(
    70 * (
      this.simplexCorner(gi0, x0, y0) +
      this.simplexCorner(gi1, x1, y1) +
      this.simplexCorner(gi2, x2, y2)
    ),
    -1,
    1
  );
};

PS.core.Noise2D.prototype.simplexCorner = function (gradientIndex, x, y) {
  var t = 0.5 - x * x - y * y;

  if (t < 0) {
    return 0;
  }

  t *= t;
  return t * t * this.gradient(gradientIndex, x, y);
};

PS.core.Noise2D.prototype.worley = function (x, y) {
  var px = Number(x) || 0;
  var py = Number(y) || 0;
  var cellX = Math.floor(px);
  var cellY = Math.floor(py);
  var best = 99;

  for (var oy = -1; oy <= 1; oy++) {
    for (var ox = -1; ox <= 1; ox++) {
      var cx = cellX + ox;
      var cy = cellY + oy;
      var fx = cx + this.unitHash(cx, cy, 11);
      var fy = cy + this.unitHash(cx, cy, 29);
      var dx = fx - px;
      var dy = fy - py;
      var distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < best) {
        best = distance;
      }
    }
  }

  return PS.math.clamp(best / Math.SQRT2, 0, 1);
};

PS.core.Noise2D.prototype.fbm = function (x, y, octaves, lacunarity, gain) {
  var total = 0;
  var amplitude = 1;
  var frequency = 1;
  var amplitudeTotal = 0;
  var count = Math.max(1, Math.round(Number(octaves) || 1));
  var lac = Math.max(1.01, Number(lacunarity) || 2);
  var normalizedGain = PS.math.clamp(Number(gain) || 0.5, 0.05, 0.95);

  for (var i = 0; i < count; i++) {
    total += this.perlin(x * frequency, y * frequency) * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= normalizedGain;
    frequency *= lac;
  }

  return amplitudeTotal > 0 ? total / amplitudeTotal : 0;
};

PS.core.Noise2D.prototype.ridged = function (x, y, octaves) {
  var value = this.fbm(x, y, octaves || 4, 2, 0.52);
  var ridge = 1 - Math.abs(value);

  return PS.math.clamp(ridge * ridge * 1.15, 0, 1);
};

PS.core.Noise2D.prototype.turbulence = function (x, y, octaves) {
  return PS.math.clamp(Math.abs(this.fbm(x, y, octaves || 4, 2, 0.5)) * 1.25, 0, 1);
};

PS.core.Noise2D.prototype.warp = function (x, y, warpFn, strength) {
  var amount = Number(strength) || 0;
  var fn = typeof warpFn === "function" ? warpFn : this.fbm.bind(this);
  var dx = fn(x + 31.17, y - 19.73, 3, 2, 0.5);
  var dy = fn(x - 47.29, y + 11.53, 3, 2, 0.5);

  return {
    x: x + dx * amount,
    y: y + dy * amount
  };
};

PS.core.Noise2D.prototype.normalize = function (value) {
  return PS.math.clamp((Number(value) || 0) * 0.5 + 0.5, 0, 1);
};

PS.core.Noise2D.prototype.threshold = function (value, edge) {
  return (Number(value) || 0) >= (Number(edge) || 0) ? 1 : 0;
};

PS.core.Noise2D.prototype.value = function (x, y) {
  var x0 = Math.floor(Number(x) || 0);
  var y0 = Math.floor(Number(y) || 0);
  var xf = (Number(x) || 0) - x0;
  var yf = (Number(y) || 0) - y0;
  var u = this.fade(xf);
  var v = this.fade(yf);
  var top = this.lerp(this.unitHash(x0, y0, 0), this.unitHash(x0 + 1, y0, 0), u);
  var bottom = this.lerp(this.unitHash(x0, y0 + 1, 0), this.unitHash(x0 + 1, y0 + 1, 0), u);

  return this.lerp(top, bottom, v);
};

PS.core.Noise2D.prototype.valueFbm = function (x, y, octaves, lacunarity, gain) {
  var total = 0;
  var amplitude = 1;
  var frequency = 1;
  var amplitudeTotal = 0;
  var count = Math.max(1, Math.round(Number(octaves) || 1));
  var lac = Math.max(1.01, Number(lacunarity) || 2);
  var normalizedGain = PS.math.clamp(Number(gain) || 0.5, 0.05, 0.95);

  for (var i = 0; i < count; i++) {
    total += this.value(x * frequency, y * frequency) * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= normalizedGain;
    frequency *= lac;
  }

  return amplitudeTotal > 0 ? total / amplitudeTotal : 0.5;
};

PS.core.Noise2D.prototype.continents = function (x, y) {
  var warped = this.warp(x * 0.018, y * 0.018, this.fbm.bind(this), 0.85);
  return PS.math.clamp(this.normalize(this.fbm(warped.x, warped.y, 6, 2, 0.55)) * 0.74 + this.worley(x * 0.012, y * 0.012) * 0.26, 0, 1);
};

PS.core.Noise2D.prototype.mountains = function (x, y) {
  return this.ridged(x * 0.036, y * 0.036, 5);
};

PS.core.Noise2D.prototype.coastline = function (x, y) {
  var warped = this.warp(x * 0.026, y * 0.026, this.fbm.bind(this), 0.55);
  return PS.math.clamp(Math.abs(this.fbm(warped.x, warped.y, 5, 2, 0.52)) * 1.8, 0, 1);
};

PS.core.Noise2D.prototype.rivers = function (x, y) {
  return PS.math.clamp(1 - this.ridged(x * 0.052, y * 0.052, 4), 0, 1);
};

PS.core.createNoise2D = function (seedValue) {
  return new PS.core.Noise2D(seedValue);
};

PS.noise = PS.core;
