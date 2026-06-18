const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
require("../tests/test-esm-helper.js");

const root = path.resolve(__dirname, "..");

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function toAssetPath(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function writeJSONSidecar(filePath, data) {
  fs.writeFileSync(
    filePath + ".js",
    "PS.assets.registerJSON(" + JSON.stringify(toAssetPath(filePath)) + ", " + JSON.stringify(data, null, 2) + ");\n"
  );
}

function makeCRCTable() {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }

  return table;
}

const crcTable = makeCRCTable();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let i = 0; i < buffer.length; i += 1) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  const chunk = Buffer.alloc(12 + data.length);

  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(body), 8 + data.length);
  return chunk;
}

function encodePNG(width, height, rgba) {
  const scanlineLength = width * 4 + 1;
  const raw = Buffer.alloc(scanlineLength * height);
  const source = Buffer.from(rgba);

  for (let y = 0; y < height; y += 1) {
    raw[y * scanlineLength] = 0;
    source.copy(raw, y * scanlineLength + 1, y * width * 4, (y + 1) * width * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function loadSpriteSheetRuntime() {
  const source = fs.readFileSync(path.join(root, "js/assets/sprite-sheet.js"), "utf8");
  const context = {
    PS: { assets: {} },
    Buffer: Buffer,
    Uint8Array: Uint8Array,
    Number: Number,
    Math: Math,
    Object: Object,
    Array: Array,
    String: String,
    Error: Error
  };
  context.window = context;

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "js/assets/sprite-sheet.js" });
  return context.PS.assets;
}

function buildTileSheetAtlas(options) {
  const manifestPath = path.resolve(root, options.manifest || "assets/manifest.json");
  const manifest = readJSON(manifestPath);
  const atlasId = options.id || manifest.defaultTileSheet || Object.keys(manifest.tileSheets || {})[0] || "default";
  const definition = (manifest.tileSheets && manifest.tileSheets[atlasId]) || {};
  const sourceIds = definition.sourceSheets || definition.sheetIds || Object.keys(manifest.sheets || {});
  const assets = loadSpriteSheetRuntime();
  const sources = [];
  const outputDir = path.resolve(root, options.outputDir || definition.outputDir || path.join("assets", "tile-sheets"));
  const pageWidth = Number(options.pageWidth || definition.pageWidth) || 1024;
  const pageHeight = Number(options.pageHeight || definition.pageHeight) || 1024;

  sourceIds.forEach(function (sheetId) {
    const sheetDef = manifest.sheets && manifest.sheets[sheetId];

    if (!sheetDef || !sheetDef.path) {
      return;
    }

    const image = {
      id: sheetId,
      path: sheetDef.path
    };
    const metaPath = path.resolve(root, sheetDef.meta);
    const pixelDataPath = path.resolve(root, sheetDef.pixelData || String(sheetDef.path).replace(/\.png$/, ".rgba.json"));
    const sheet = assets.SpriteSheet.detect(image, readJSON(metaPath));
    const pixelData = fs.existsSync(pixelDataPath) ? readJSON(pixelDataPath) : null;

    sources.push({
      id: sheetId,
      sheet: sheet,
      pixelData: pixelData
    });
  });

  const atlas = assets.TileSheetPacker.pack(sources, {
    pageWidth: pageWidth,
    pageHeight: pageHeight
  });
  atlas.id = atlasId;

  atlas.pages.forEach(function (page) {
    const pageBase = atlasId + ".page" + page.pageIndex;
    const pngPath = path.join(outputDir, pageBase + ".png");
    const rgbaPath = path.join(outputDir, pageBase + ".rgba.json");
    const rgbaJSON = {
      type: "rgba-base64",
      width: page.width,
      height: page.height,
      byteLength: page.data.byteLength,
      data: Buffer.from(page.data).toString("base64"),
      source: toAssetPath(pngPath)
    };

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(pngPath, encodePNG(page.width, page.height, page.data));
    writeJSON(rgbaPath, rgbaJSON);
    writeJSONSidecar(rgbaPath, rgbaJSON);
    page.path = toAssetPath(pngPath);
    page.pixelData = toAssetPath(rgbaPath);
  });

  const atlasManifest = assets.TileSheetPacker.toManifest(atlas);
  const atlasPath = path.join(outputDir, atlasId + ".json");

  writeJSON(atlasPath, atlasManifest);
  writeJSONSidecar(atlasPath, atlasManifest);

  return {
    atlasPath: atlasPath,
    atlas: atlasManifest
  };
}

function parseArgs(argv) {
  const options = {};

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--manifest") {
      options.manifest = next;
      i += 1;
    } else if (arg === "--id") {
      options.id = next;
      i += 1;
    } else if (arg === "--out-dir") {
      options.outputDir = next;
      i += 1;
    } else if (arg === "--page-width") {
      options.pageWidth = Number(next);
      i += 1;
    } else if (arg === "--page-height") {
      options.pageHeight = Number(next);
      i += 1;
    }
  }

  return options;
}

if (require.main === module) {
  const result = buildTileSheetAtlas(parseArgs(process.argv));
  console.log("built " + toAssetPath(result.atlasPath) + " (" + result.atlas.stats.cellCount + " cells)");
}

module.exports = {
  buildTileSheetAtlas,
  encodePNG
};
