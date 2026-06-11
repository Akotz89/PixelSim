const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const terrainContract = {
  grass: { minVariants: 8, labels: ["lush", "lush", "lush", "lush", "dry", "dry", "dead", "winter"] },
  mountain: { minVariants: 6, labels: ["bare", "bare", "bare", "snow", "snow", "moss"] },
  water: { minVariants: 4, labels: ["deep", "deep", "shallow", "shore"] },
  desert: { minVariants: 4, labels: ["dune", "dune", "pebble", "dry-veg"] },
  sand: { minVariants: 4, labels: ["dune", "dune", "pebble", "dry-veg"] },
  tundra: { minVariants: 4, labels: ["snow", "frozen-soil", "cracked-ice", "winter"] },
  ice: { minVariants: 4, labels: ["snow", "frozen-soil", "cracked-ice", "winter"] },
  wetland: { minVariants: 4, labels: ["pool", "reed", "mud", "marsh"] },
  forest: { minVariants: 4, labels: ["leaf-litter", "roots", "mushroom", "dark-soil"] },
  rock: { minVariants: 6, labels: ["bare", "bare", "bare", "snow", "snow", "moss"] },
  ocean: { minVariants: 4, labels: ["deep", "deep", "shallow", "shore"] },
  snow: { minVariants: 4, labels: ["snow", "frozen-soil", "cracked-ice", "winter"] },
  stone: { minVariants: 6, labels: ["bare", "bare", "bare", "snow", "snow", "moss"] },
  dirt: { minVariants: 4, labels: ["dark-soil", "dark-soil", "roots", "roots"] }
};

function readJSON(assetPath) {
  return JSON.parse(fs.readFileSync(path.join(root, assetPath), "utf8"));
}

function pngSize(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function inflatePng(buffer) {
  var offset = 8;
  var chunks = [];

  while (offset < buffer.length) {
    var length = buffer.readUInt32BE(offset);
    var type = buffer.toString("ascii", offset + 4, offset + 8);

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

function pixel(raw, size, x, y) {
  var stride = size.width * 4 + 1;
  var offset = y * stride + 1 + x * 4;

  assert.strictEqual(raw[y * stride], 0, "PNG rows must use filter 0 for deterministic verification");
  return [raw[offset], raw[offset + 1], raw[offset + 2], raw[offset + 3]];
}

function tileStats(raw, size, rect) {
  var colors = new Set();
  var alpha = 0;
  var minAlpha = 255;
  var maxAlpha = 0;
  var lumaTotal = 0;
  var samples = 0;
  var x;
  var y;
  var p;
  var luma;

  for (y = rect[1]; y < rect[1] + rect[3]; y += 1) {
    for (x = rect[0]; x < rect[0] + rect[2]; x += 1) {
      p = pixel(raw, size, x, y);
      alpha += p[3];
      minAlpha = Math.min(minAlpha, p[3]);
      maxAlpha = Math.max(maxAlpha, p[3]);
      luma = p[0] * 0.2126 + p[1] * 0.7152 + p[2] * 0.0722;
      lumaTotal += luma;
      samples += 1;
      if ((x + y) % 3 === 0) {
        colors.add(p[0] + "," + p[1] + "," + p[2] + "," + p[3]);
      }
    }
  }

  return {
    colorSamples: colors.size,
    averageAlpha: alpha / Math.max(1, samples),
    alphaRange: maxAlpha - minAlpha,
    averageLuma: lumaTotal / Math.max(1, samples)
  };
}

function assertFile(assetPath, label) {
  assert.ok(fs.existsSync(path.join(root, assetPath)), label + " should exist: " + assetPath);
}

function verifySheet(manifest, sheetId, summary) {
  var sheet = manifest.sheets[sheetId];
  var atlasId = sheetId.replace(/^terrain_/, "");
  var contract = terrainContract[atlasId];
  var pngPath;
  var png;
  var size;
  var raw;
  var meta;
  var expectedNames;
  var sourceIssue;

  assert.ok(sheet, "manifest should include " + sheetId);
  assert.ok(contract, sheetId + " should have a terrain authoring contract");
  assert.strictEqual(sheet.tileSize, 32, sheetId + " should use 32x32 terrain tiles");
  assert.ok(sheet.sprites.length >= contract.minVariants, sheetId + " should expose at least " + contract.minVariants + " variants");
  assert.ok(sheet.path.indexOf("agent-studio") === -1, sheetId + " runtime path must not depend on Agent Studio");
  assert.ok(sheet.path.indexOf("tools/") === -1, sheetId + " runtime path must not depend on tools/");

  assertFile(sheet.path, sheetId + " PNG");
  assertFile(sheet.meta, sheetId + " metadata");
  assertFile(sheet.meta + ".js", sheetId + " metadata sidecar");
  assertFile(sheet.pixelData, sheetId + " RGBA sidecar");
  assertFile(sheet.pixelData + ".js", sheetId + " RGBA JS sidecar");

  meta = readJSON(sheet.meta);
  expectedNames = sheet.sprites.map(function (sprite) { return sprite.id; });
  assert.deepStrictEqual(meta.names, expectedNames, sheetId + " metadata names should match manifest sprite IDs");
  assert.strictEqual(meta.splitAtlas, true, sheetId + " should be a split albedo/normal atlas");
  assert.strictEqual(meta.normalOffsetX, 256, sheetId + " should locate normals in the right half");
  assert.ok(meta.authored === true, sheetId + " metadata should mark the sheet as authored runtime art");
  assert.strictEqual(meta.sourceIssue, "AZR-511", sheetId + " metadata should identify AZR-511");
  assert.ok(Array.isArray(meta.variantRoles), sheetId + " should document authored variant roles");
  assert.ok(meta.variantRoles.length >= contract.minVariants, sheetId + " variant roles should cover required variants");

  pngPath = path.join(root, sheet.path);
  png = fs.readFileSync(pngPath);
  size = pngSize(png);
  raw = inflatePng(png);
  assert.deepStrictEqual(size, { width: 512, height: 32 }, sheetId + " PNG should be 512x32 split atlas");

  sheet.sprites.slice(0, contract.minVariants).forEach(function (sprite, index) {
    var stats = tileStats(raw, size, sprite.rect);
    var role = meta.variantRoles[index] || {};

    assert.deepStrictEqual(sprite.rect, [index * 32, 0, 32, 32], sheetId + " sprite " + index + " rect should be grid-aligned");
    assert.ok(stats.averageAlpha > 8 && stats.averageAlpha < 248, sprite.id + " should encode usable terrain height in alpha");
    assert.ok(stats.alphaRange >= 8, sprite.id + " height channel should vary across the tile");
    assert.ok(stats.colorSamples >= 8, sprite.id + " should have visible pixel-art detail variation");
    assert.ok(role.role, sprite.id + " should have an authored role label");
    if (contract.labels[index]) {
      assert.ok(String(role.role).indexOf(contract.labels[index]) >= 0, sprite.id + " role should include " + contract.labels[index]);
    }
  });

  sourceIssue = meta.sourceIssue || sheet.sourceIssue;
  summary.sheets += 1;
  summary.variants += sheet.sprites.length;
  summary.sourceIssues[sourceIssue] = true;
}

function verifySpriteSheet(options) {
  var manifestPath = options && options.manifest ? options.manifest : "assets/manifest.json";
  var manifest = readJSON(manifestPath);
  var tileSheetId = manifest.defaultTileSheet;
  var tileSheetDefinition = manifest.tileSheets && manifest.tileSheets[tileSheetId];
  var tileSheetManifest;
  var summary = {
    manifest: manifestPath,
    tileSheet: tileSheetId,
    sheets: 0,
    variants: 0,
    cells: 0,
    sourceIssues: {}
  };

  assert.strictEqual(manifest.version, 1, "asset manifest schema version should be 1");
  assert.ok(tileSheetDefinition, "manifest should define default tile sheet");
  assertFile(tileSheetDefinition.manifest, "default tile-sheet manifest");
  assertFile(tileSheetDefinition.manifest + ".js", "default tile-sheet manifest sidecar");
  assert.ok(Array.isArray(tileSheetDefinition.sourceSheets), "default tile sheet should declare source sheets");

  tileSheetDefinition.sourceSheets.forEach(function (sheetId) {
    if (String(sheetId).indexOf("terrain_") === 0) {
      verifySheet(manifest, sheetId, summary);
    }
  });

  tileSheetManifest = readJSON(tileSheetDefinition.manifest);
  assert.strictEqual(tileSheetManifest.type, "tile-sheet-atlas", "default tile sheet should be a packed atlas");
  assert.strictEqual(tileSheetManifest.filter, "nearest", "packed tile sheet should preserve nearest filtering");
  assert.ok(tileSheetManifest.pages.length >= 1, "packed tile sheet should include at least one page");
  tileSheetManifest.pages.forEach(function (page) {
    assertFile(page.path, "tile-sheet page PNG");
    assertFile(page.pixelData, "tile-sheet page RGBA sidecar");
    assertFile(page.pixelData + ".js", "tile-sheet page RGBA JS sidecar");
  });
  summary.cells = Object.keys(tileSheetManifest.cells || {}).length;
  assert.ok(summary.cells >= 30, "packed tile sheet should contain at least 30 terrain cells");
  assert.ok(summary.variants >= 30, "terrain manifest should expose at least 30 authored terrain variants");

  return summary;
}

function parseArgs(argv) {
  var options = {};
  var i;

  for (i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--manifest") {
      options.manifest = argv[i + 1];
      i += 1;
    }
  }

  return options;
}

if (require.main === module) {
  var summary = verifySpriteSheet(parseArgs(process.argv));
  console.log("sprite sheet verification passed " + JSON.stringify(summary));
}

module.exports = {
  verifySpriteSheet: verifySpriteSheet,
  terrainContract: terrainContract
};
