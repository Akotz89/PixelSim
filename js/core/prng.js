"use strict";
PS.core = PS.core || {};

PS.core.PRNG_MASK_64 = (1n << 64n) - 1n;
PS.core.PRNG_FLOAT_DENOMINATOR = 9007199254740992;

PS.core.PRNG = function (seedValue) {
  this.setSeed(seedValue);
};

PS.core.PRNG.prototype.mix32 = function (value) {
  var mixed = (Number(value) || 0) >>> 0;

  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7FEB352D);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846CA68B);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
};

PS.core.PRNG.prototype.stateFromSeed = function (seedValue, salt) {
  var text = String(seedValue == null ? "PIXELDARIUM" : seedValue) + ":" + String(salt || 0);
  var hi = this.mix32(PS.math.hashSeedText(text + ":hi"));
  var lo = this.mix32(PS.math.hashSeedText(text + ":lo"));
  var state = (BigInt(hi) << 32n) | BigInt(lo);

  return state & PS.core.PRNG_MASK_64;
};

PS.core.PRNG.prototype.setSeed = function (seedValue) {
  this.seedText = String(seedValue == null ? "PIXELDARIUM" : seedValue);
  this.state0 = this.stateFromSeed(this.seedText, 0);
  this.state1 = this.stateFromSeed(this.seedText, 1);

  if (this.state0 === 0n && this.state1 === 0n) {
    this.state1 = 0x9E3779B97F4A7C15n;
  }

  return this;
};

PS.core.PRNG.prototype.nextUint64 = function () {
  var x = this.state0;
  var y = this.state1;

  this.state0 = y;
  x ^= (x << 23n) & PS.core.PRNG_MASK_64;
  x ^= x >> 17n;
  x ^= y ^ (y >> 26n);
  this.state1 = x & PS.core.PRNG_MASK_64;
  return (this.state1 + y) & PS.core.PRNG_MASK_64;
};

PS.core.PRNG.prototype.nextUint32 = function () {
  return Number(this.nextUint64() & 0xFFFFFFFFn) >>> 0;
};

PS.core.PRNG.prototype.next = function () {
  return Number(this.nextUint64() >> 11n) / PS.core.PRNG_FLOAT_DENOMINATOR;
};

PS.core.PRNG.prototype.nextInt = function (min, max) {
  var low;
  var high;

  if (max === undefined) {
    low = 0;
    high = Math.max(0, Math.floor(Number(min) || 0));
  } else {
    low = Math.floor(Number(min) || 0);
    high = Math.floor(Number(max) || 0);
  }

  if (high < low) {
    var swap = high;
    high = low;
    low = swap;
  }

  return low + Math.floor(this.next() * (high - low + 1));
};

PS.core.PRNG.prototype.nextIndex = function (max) {
  var normalizedMax = Math.max(1, Math.floor(Number(max) || 1));

  return Math.floor(this.next() * normalizedMax);
};

PS.core.PRNG.prototype.nextBool = function (probability) {
  return this.next() < PS.math.clamp(Number(probability) || 0, 0, 1);
};

PS.core.PRNG.prototype.pick = function (array) {
  if (!Array.isArray(array) || array.length === 0) {
    return undefined;
  }

  return array[this.nextIndex(array.length)];
};

PS.core.PRNG.prototype.shuffle = function (array) {
  if (!Array.isArray(array)) {
    return array;
  }

  for (var i = array.length - 1; i > 0; i--) {
    var j = this.nextInt(0, i);
    var swap = array[i];
    array[i] = array[j];
    array[j] = swap;
  }

  return array;
};

PS.core.PRNG.prototype.fork = function (subseed) {
  return new PS.core.PRNG(this.seedText + ":" + this.state0.toString(16) + ":" + this.state1.toString(16) + ":" + String(subseed || "fork"));
};

PS.core.PRNG.prototype.getState32 = function () {
  return Number((this.state0 ^ this.state1) & 0xFFFFFFFFn) >>> 0 || 1;
};

PS.core.createPRNG = function (seedValue) {
  return new PS.core.PRNG(seedValue);
};
