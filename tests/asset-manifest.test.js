const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "assets/manifest.json");
const grassMetaPath = path.join(root, "assets/terrain/grass.json");
const grassPngPath = path.join(root, "assets/terrain/grass.png");
const handoffManifestPath = path.join(root, "assets/pixeldarium-equivalence/handoff-manifest.json");
const loaderSource = fs.readFileSync(path.join(root, "js/assets/loader.js"), "utf8");
const spriteSheetSource = fs.readFileSync(path.join(root, "js/assets/sprite-sheet.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const grassMeta = JSON.parse(fs.readFileSync(grassMetaPath, "utf8"));
const handoffManifest = JSON.parse(fs.readFileSync(handoffManifestPath, "utf8"));
const png = fs.readFileSync(grassPngPath);
const terrainAtlasExpectations = {
  grass: [88, 138, 66],
  stone: [72, 72, 72],
  dirt: [82, 58, 36],
  sand: [138, 106, 48],
  forest: [49, 96, 43],
  desert: [188, 151, 82],
  water: [69, 127, 148],
  ice: [184, 221, 234],
  rock: [55, 55, 58],
  snow: [224, 232, 236],
  ocean: [35, 61, 103],
  mountain: [93, 96, 101],
  tundra: [143, 153, 134],
  wetland: [70, 96, 62]
};

function pngSize(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function inflatePng(buffer) {
  const zlib = require("zlib");
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

function centerRgb(buffer) {
  const size = pngSize(buffer);
  const bytesPerPixel = 4;
  const rowLength = size.width * bytesPerPixel + 1;
  const raw = inflatePng(buffer);

  return pixelRgb(raw, size, 16, 16);
}

function pixelRgb(raw, size, x, y) {
  const bytesPerPixel = 4;
  const rowLength = size.width * bytesPerPixel + 1;
  const offset = y * rowLength + 1 + x * bytesPerPixel;

  assert.strictEqual(raw[y * rowLength], 0, "terrain atlas PNG should use unfiltered rows");
  return [raw[offset], raw[offset + 1], raw[offset + 2]];
}

function assertNearRgb(actual, expected, label) {
  actual.forEach((channel, index) => {
    assert.ok(
      Math.abs(channel - expected[index]) <= 10,
      label + " center channel " + index + " expected near " + expected[index] + " but got " + channel
    );
  });
  actual.forEach((channel) => {
    assert.ok(channel > 8 && channel < 248, label + " should avoid pure/neon channel values");
  });
}

["terrain", "vegetation", "creatures", "transitions", "effects", "ui"].forEach((directory) => {
  assert.ok(fs.existsSync(path.join(root, "assets", directory)), "asset subdirectory should exist: " + directory);
  assert.ok(fs.existsSync(path.join(root, "assets", directory, ".gitkeep")), "asset subdirectory should include .gitkeep: " + directory);
});

assert.strictEqual(manifest.version, 1, "manifest should declare schema version");
assert.ok(manifest.sheets.terrain_grass, "manifest should include terrain_grass sheet");
assert.strictEqual(manifest.sheets.terrain_grass.path, "assets/terrain/grass.png", "terrain grass path should match split-atlas PNG");
assert.strictEqual(manifest.sheets.terrain_grass.tileSize, 32, "terrain grass tile size should be 32");
assert.strictEqual(manifest.sheets.terrain_grass.sprites.length, 8, "terrain grass should declare 8 sprite rects");
assert.deepStrictEqual(manifest.sheets.terrain_grass.sprites[7], { id: "terrain.grass.7", rect: [224, 0, 32, 32] }, "last grass sprite rect should match 8th tile");
assert.deepStrictEqual(grassMeta.names, manifest.sheets.terrain_grass.sprites.map((sprite) => sprite.id), "grass grid metadata should match manifest sprite IDs");
assert.deepStrictEqual(pngSize(png), { width: 512, height: 32 }, "grass PNG should be 512x32 split atlas");
assert.deepStrictEqual(manifest.sheets.terrain_grass.splitAtlas.normalOffset, [256, 0], "terrain grass should declare right-half normal offset");

Object.keys(terrainAtlasExpectations).forEach((atlasId) => {
  const sheetId = "terrain_" + atlasId;
  const sheet = manifest.sheets[sheetId];
  const metaPath = path.join(root, "assets", "terrain", atlasId + ".json");
  const pngPath = path.join(root, "assets", "terrain", atlasId + ".png");
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const atlasPng = fs.readFileSync(pngPath);
  const atlasSize = pngSize(atlasPng);
  const raw = inflatePng(atlasPng);
  const normalRgb = pixelRgb(raw, atlasSize, 256 + 16, 16);

  assert.ok(sheet, "manifest should include " + sheetId + " sheet");
  assert.strictEqual(sheet.path, "assets/terrain/" + atlasId + ".png", sheetId + " path should match terrain atlas PNG");
  assert.strictEqual(sheet.meta, "assets/terrain/" + atlasId + ".json", sheetId + " metadata path should match terrain atlas JSON");
  assert.strictEqual(sheet.pixelData, "assets/terrain/" + atlasId + ".rgba.json", sheetId + " should expose file-safe RGBA pixel sidecar");
  assert.strictEqual(sheet.tileSize, 32, sheetId + " tile size should be 32");
  assert.deepStrictEqual(sheet.splitAtlas.normalRect, [256, 0, 256, 32], sheetId + " should declare right-half normals");
  assert.strictEqual(sheet.sprites.length, 8, sheetId + " should declare 8 sprite rects");
  assert.deepStrictEqual(sheet.sprites[7], { id: "terrain." + atlasId + ".7", rect: [224, 0, 32, 32] }, sheetId + " last sprite rect should match 8th tile");
  assert.deepStrictEqual(meta.names, sheet.sprites.map((sprite) => sprite.id), sheetId + " metadata should match manifest sprite IDs");
  assert.strictEqual(meta.splitAtlas, true, sheetId + " metadata should mark split atlas format");
  assert.strictEqual(meta.normalOffsetX, 256, sheetId + " metadata should locate the normal half");
  assert.deepStrictEqual(atlasSize, { width: 512, height: 32 }, sheetId + " PNG should be 512x32 split atlas");
  assertNearRgb(centerRgb(atlasPng), terrainAtlasExpectations[atlasId], sheetId);
  assert.ok(normalRgb[2] >= 190, sheetId + " normal sample should face predominantly upward");
  assert.notDeepStrictEqual(normalRgb, terrainAtlasExpectations[atlasId], sheetId + " normal half should not duplicate albedo colors");
  assert.ok(fs.existsSync(path.join(root, sheet.pixelData)), sheetId + " RGBA sidecar should exist");
  assert.ok(fs.existsSync(path.join(root, sheet.pixelData + ".js")), sheetId + " RGBA sidecar should support file:// loading");
});

assert.strictEqual(handoffManifest.runtimeUse, true, "accepted visual handoff should be runtime-owned");
assert.strictEqual(handoffManifest.acceptedSheetCount, 15, "visual handoff should include accepted sheets only");
assert.ok(handoffManifest.rejected.includes("creature_npc_original_v0"), "visual handoff should record rejected/superseded creature v0");
assert.ok(!manifest.sheets.equivalence_creature_npc_original_v0, "runtime manifest should not include rejected creature v0");

Object.values(manifest.sheets).forEach((sheet) => {
  if (sheet.meta) {
    assert.ok(fs.existsSync(path.join(root, sheet.meta + ".js")), sheet.meta + " should include a file:// JSON sidecar");
  }
});

function createContext() {
  const fetchCalls = [];
  const imageLoads = [];

  function TestImage() {
    this.onload = null;
    this.onerror = null;
    this.width = 0;
    this.height = 0;
  }

  Object.defineProperty(TestImage.prototype, "src", {
    set(url) {
      this._src = url;
      imageLoads.push(url);
      this.width = String(url).startsWith("assets/terrain/") ? 512 : 1;
      this.height = String(url).startsWith("assets/terrain/") ? 32 : 1;
      this.onload();
    },
    get() {
      return this._src;
    }
  });

  const context = {
    PS: {
      assets: {},
      runtime: {
        recordError() {}
      }
    },
    Map: Map,
    Promise: Promise,
    Error: Error,
    Image: TestImage,
    Number: Number,
    Math: Math,
    Object: Object,
    Array: Array,
    String: String,
    window: { location: { protocol: "http:" } },
    fetch(url) {
      fetchCalls.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        json() {
          if (url === "assets/manifest.json") {
            return Promise.resolve(manifest);
          }
          if (url === "assets/terrain/grass.json") {
            return Promise.resolve(grassMeta);
          }
          if (url.startsWith("assets/terrain/") && url.endsWith(".json")) {
            return Promise.resolve(JSON.parse(fs.readFileSync(path.join(root, url), "utf8")));
          }
          if (url.startsWith("assets/pixeldarium-equivalence/") && url.endsWith(".json")) {
            return Promise.resolve(JSON.parse(fs.readFileSync(path.join(root, url), "utf8")));
          }
          return Promise.resolve({});
        }
      });
    },
    fetchCalls: fetchCalls,
    imageLoads: imageLoads
  };

  vm.createContext(context);
  vm.runInContext(spriteSheetSource, context, { filename: "js/assets/sprite-sheet.js" });
  vm.runInContext(loaderSource, context, { filename: "js/assets/loader.js" });
  return context;
}

(async function() {
  const context = createContext();
  const loader = new context.PS.assets.AssetLoader();
  const loadedManifest = await loader.loadManifest("assets/manifest.json");
  const loadedGrass = context.PS.assets.loadedSheets.terrain_grass;
  const grassCell = loadedGrass.sheet.getCell("terrain.grass.7");
  const expectedSheetFetches = [];
  Object.values(manifest.sheets).forEach((sheet) => {
    if (sheet.meta) {
      expectedSheetFetches.push(sheet.meta);
    }
    if (sheet.pixelData) {
      expectedSheetFetches.push(sheet.pixelData);
      return;
    }
    if (String(sheet.path || "").startsWith("assets/pixeldarium-equivalence/")) {
      expectedSheetFetches.push(String(sheet.path).replace(/\.png$/, ".rgba.json"));
    }
  });
  const expectedImageLoads = Object.values(manifest.sheets).map((sheet) => sheet.path).filter(Boolean);
  const handoffSheet = context.PS.assets.loadedSheets.equivalence_creature_npc_refined_v1;

  assert.strictEqual(loadedManifest, manifest, "loadManifest should resolve the parsed manifest");
  assert.deepStrictEqual(context.fetchCalls, ["assets/manifest.json"].concat(expectedSheetFetches), "loadManifest should fetch manifest, sheet metadata, and equivalence pixel sidecars");
  assert.deepStrictEqual(context.imageLoads, expectedImageLoads, "loadManifest should load every manifest PNG");
  assert.ok(loadedGrass.sheet, "loadManifest should populate loaded sprite sheet dictionary");
  assert.ok(handoffSheet && handoffSheet.sheet, "loadManifest should populate accepted visual handoff sheets");
  assert.strictEqual(
    Object.keys(context.PS.assets.loadedSheets).length,
    Object.keys(manifest.sheets).length,
    "loaded sheet dictionary should match manifest sheet count"
  );
  assert.deepStrictEqual(
    { x: grassCell.x, y: grassCell.y, w: grassCell.w, h: grassCell.h },
    { x: 224, y: 0, w: 32, h: 32 },
    "loaded sprite sheet should expose grass coordinates"
  );

  console.log("asset manifest checks passed");
}()).catch((error) => {
  console.error(error);
  process.exit(1);
});
