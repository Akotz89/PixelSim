export function Bitsmap(bits, length, data) {
  this.bits = Math.round(Number(bits) || 0);
  this.length = Math.max(0, Math.round(Number(length) || 0));

  if (this.bits < 1 || this.bits > 16) {
    throw new RangeError("Bitsmap width must be between 1 and 16 bits");
  }

  this.mask = (1 << this.bits) - 1;
  this.wordCount = Math.ceil((this.bits * this.length) / 32);
  this.data = data instanceof Uint32Array ? data : new Uint32Array(this.wordCount);

  if (this.data.length < this.wordCount) {
    throw new RangeError("Bitsmap backing data is smaller than required");
  }
}

Bitsmap.prototype.checkIndex = function (index) {
  var i = Math.round(Number(index));

  if (!Number.isFinite(i) || i < 0 || i >= this.length) {
    throw new RangeError("Bitsmap index out of bounds: " + index);
  }

  return i;
};

Bitsmap.prototype.clampValue = function (value) {
  return Math.max(0, Math.min(this.mask, Math.round(Number(value) || 0)));
};

Bitsmap.prototype.get = function (index) {
  var i = this.checkIndex(index);
  var bitIndex = i * this.bits;
  var wordIndex = bitIndex >>> 5;
  var shift = bitIndex & 31;
  var value = this.data[wordIndex] >>> shift;
  var overflow = shift + this.bits - 32;

  if (overflow > 0) {
    value |= this.data[wordIndex + 1] << (this.bits - overflow);
  }

  return value & this.mask;
};

Bitsmap.prototype.set = function (index, value) {
  var i = this.checkIndex(index);
  var next = this.clampValue(value);
  var bitIndex = i * this.bits;
  var wordIndex = bitIndex >>> 5;
  var shift = bitIndex & 31;
  var lowMask = (this.mask << shift) >>> 0;
  var overflow = shift + this.bits - 32;

  this.data[wordIndex] = ((this.data[wordIndex] & ~lowMask) | ((next << shift) >>> 0)) >>> 0;

  if (overflow > 0) {
    var highMask = (1 << overflow) - 1;
    this.data[wordIndex + 1] = ((this.data[wordIndex + 1] & ~highMask) | (next >>> (this.bits - overflow))) >>> 0;
  }

  return next;
};

Bitsmap.prototype.clear = function () {
  this.data.fill(0);
  return this;
};

Bitsmap.prototype.setAll = function (value) {
  var next = this.clampValue(value);

  this.clear();
  for (var i = 0; i < this.length; i += 1) {
    this.set(i, next);
  }

  return this;
};

Bitsmap.prototype.inc = function (index, delta) {
  var next = this.get(index) + Math.round(Number(delta) || 0);
  return this.set(index, next);
};

Bitsmap.prototype.serialize = function () {
  return {
    bits: this.bits,
    length: this.length,
    data: Array.from(this.data.slice(0, this.wordCount))
  };
};

Bitsmap.deserialize = function (payload) {
  var source = payload || {};
  return new Bitsmap(
    source.bits,
    source.length,
    new Uint32Array(Array.isArray(source.data) ? source.data : [])
  );
};
