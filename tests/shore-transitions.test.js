const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const generator = require("../scripts/build-shore-transitions.js");
const pngPath = path.join(root, "exports/transitions/shore-tiles.png");
const atlasPath = path.join(root, "exports/transitions/shore-tiles-atlas.json");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const atlas = JSON.parse(fs.readFileSync(atlasPath, "utf8"));
const png = fs.readFileSync(pngPath);

function pngSize(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function inflatePng(buffer) {
  let offset = 8;
  const chunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") {
      chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    }
    if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }
  return zlib.inflateSync(Buffer.concat(chunks));
}

function colorKeyAt(raw, size, x, y) {
  const stride = size.width * 4 + 1;
  const offset = y * stride + 1 + x * 4;
  assert.strictEqual(raw[y * stride], 0, "shore transition PNG should use deterministic filter 0 rows");
  return [raw[offset], raw[offset + 1], raw[offset + 2], raw[offset + 3]].join(",");
}

assert.ok(packageJson.scripts.test.includes("tests/shore-transitions.test.js"), "npm test should include shore transition checks");
assert.deepStrictEqual(pngSize(png), { width: 128, height: 128 }, "shore transition atlas should be 4x4 32px cells");
assert.strictEqual(atlas.sourceIssue, "AZR-531", "atlas should keep Linear source issue");
assert.strictEqual(atlas.tileWidth, 32, "shore tiles should be 32px wide");
assert.strictEqual(atlas.tileHeight, 32, "shore tiles should be 32px high");
assert.strictEqual(atlas.variants.length, 16, "shore atlas should contain all 16 requested variants");
assert.deepStrictEqual(atlas.names, atlas.variants.map((variant) => variant.id), "atlas names should mirror variant order");

[
  "grass-water.edge.n",
  "grass-water.edge.e",
  "grass-water.edge.s",
  "grass-water.edge.w",
  "grass-water.corner.ne",
  "grass-water.corner.se",
  "grass-water.corner.sw",
  "grass-water.corner.nw",
  "grass-water.inner-corner.ne",
  "grass-water.inner-corner.se",
  "grass-water.inner-corner.sw",
  "grass-water.inner-corner.nw",
  "grass-water.special.narrow-channel",
  "grass-water.special.peninsula-tip",
  "grass-water.special.island-nub",
  "grass-water.special.full-surrounded"
].forEach((id, index) => {
  const variant = atlas.variants[index];
  assert.strictEqual(variant.id, id, "variant order should match transition layout for " + id);
  assert.deepStrictEqual(variant.rect, [(index % 4) * 32, Math.floor(index / 4) * 32, 32, 32], id + " should declare grid rect");
  assert.ok(variant.sandBankPx >= 4 && variant.sandBankPx <= 6, id + " should keep a 4-6px sand bank");
});

const raw = inflatePng(png);
const size = pngSize(png);
const palette = atlas.palette;
const keys = {
  water: palette.water.join(","),
  sand: palette.sand.join(","),
  grass: palette.grass.join(",")
};

assert.strictEqual(colorKeyAt(raw, size, 16, 2), keys.water, "north edge should place water on north side");
assert.strictEqual(colorKeyAt(raw, size, 16, 30), keys.grass, "north edge should leave grass on south side");
assert.strictEqual(colorKeyAt(raw, size, 62, 16), keys.water, "east edge should place water on east side");
assert.strictEqual(colorKeyAt(raw, size, 34, 16), keys.grass, "east edge should leave grass on west side");

atlas.variants.forEach((variant) => {
  const colors = new Set();
  const rect = variant.rect;
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      colors.add(colorKeyAt(raw, size, rect[0] + x, rect[1] + y));
    }
  }
  assert.ok(colors.has(keys.water), variant.id + " should include water pixels");
  assert.ok(colors.has(keys.sand), variant.id + " should include dry sand pixels");
  assert.ok(colors.has(keys.grass), variant.id + " should include grass pixels");
});

const generated = generator.buildAtlas();
assert.strictEqual(generated.atlasVariants.length, 16, "generator should produce 16 variants");
assert.deepStrictEqual(generated.atlasVariants.map((variant) => variant.id), atlas.names, "generator variant order should match checked-in atlas");

console.log("shore transition checks passed");
