"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "exports", "transitions");
const tileSize = 32;
const columns = 4;
const rows = 4;
const sandBankPx = 5;
const imageWidth = columns * tileSize;
const imageHeight = rows * tileSize;

const colors = {
  water: [58, 107, 140, 255],
  waterDeep: [26, 58, 92, 255],
  waterFoam: [90, 155, 184, 255],
  sand: [184, 151, 106, 255],
  wetSand: [139, 115, 85, 255],
  grass: [74, 140, 42, 255],
  grassDark: [45, 90, 30, 255]
};

const variants = [
  { id: "grass-water.edge.n", label: "North straight shore", kind: "edge", mask: "north" },
  { id: "grass-water.edge.e", label: "East straight shore", kind: "edge", mask: "east" },
  { id: "grass-water.edge.s", label: "South straight shore", kind: "edge", mask: "south" },
  { id: "grass-water.edge.w", label: "West straight shore", kind: "edge", mask: "west" },
  { id: "grass-water.corner.ne", label: "Outer corner northeast", kind: "outer-corner", mask: "outer_ne" },
  { id: "grass-water.corner.se", label: "Outer corner southeast", kind: "outer-corner", mask: "outer_se" },
  { id: "grass-water.corner.sw", label: "Outer corner southwest", kind: "outer-corner", mask: "outer_sw" },
  { id: "grass-water.corner.nw", label: "Outer corner northwest", kind: "outer-corner", mask: "outer_nw" },
  { id: "grass-water.inner-corner.ne", label: "Inner corner northeast", kind: "inner-corner", mask: "inner_ne" },
  { id: "grass-water.inner-corner.se", label: "Inner corner southeast", kind: "inner-corner", mask: "inner_se" },
  { id: "grass-water.inner-corner.sw", label: "Inner corner southwest", kind: "inner-corner", mask: "inner_sw" },
  { id: "grass-water.inner-corner.nw", label: "Inner corner northwest", kind: "inner-corner", mask: "inner_nw" },
  { id: "grass-water.special.narrow-channel", label: "Narrow water channel", kind: "special", mask: "narrow_channel" },
  { id: "grass-water.special.peninsula-tip", label: "Grass peninsula tip", kind: "special", mask: "peninsula_tip" },
  { id: "grass-water.special.island-nub", label: "Small grass island nub", kind: "special", mask: "island_nub" },
  { id: "grass-water.special.full-surrounded", label: "Grass island fully surrounded", kind: "special", mask: "full_surrounded" }
];

function makeCRCTable() {
  const table = [];
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const crcTable = makeCRCTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = crcTable[(crc ^ buffer[i]) & 255] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  const payload = Buffer.concat([typeBuffer, data]);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([length, payload, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  const header = Buffer.alloc(13);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, row + 1);
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function jitter(x, y, seed) {
  const value = (x * 1103515245 + y * 12345 + seed * 2654435761) >>> 0;
  return value % 17;
}

function waterDistance(x, y, mask) {
  const t = tileSize;
  if (mask === "north") { return y - 11; }
  if (mask === "south") { return t - 12 - y; }
  if (mask === "east") { return t - 12 - x; }
  if (mask === "west") { return x - 11; }
  if (mask === "outer_ne") { return Math.min(y - 11, t - 12 - x); }
  if (mask === "outer_se") { return Math.min(t - 12 - y, t - 12 - x); }
  if (mask === "outer_sw") { return Math.min(t - 12 - y, x - 11); }
  if (mask === "outer_nw") { return Math.min(y - 11, x - 11); }
  if (mask === "inner_ne") { return Math.max(y - 11, t - 12 - x); }
  if (mask === "inner_se") { return Math.max(t - 12 - y, t - 12 - x); }
  if (mask === "inner_sw") { return Math.max(t - 12 - y, x - 11); }
  if (mask === "inner_nw") { return Math.max(y - 11, x - 11); }
  if (mask === "narrow_channel") { return Math.abs(x - 15.5) - 4; }
  if (mask === "peninsula_tip") { return Math.max(Math.abs(x - 15.5) - (5 + y * 0.18), y - 24); }
  if (mask === "island_nub") { return 7 - Math.sqrt((x - 15.5) * (x - 15.5) + (y - 15.5) * (y - 15.5)); }
  if (mask === "full_surrounded") { return 11 - Math.sqrt((x - 15.5) * (x - 15.5) + (y - 15.5) * (y - 15.5)); }
  return y - 11;
}

function mix(a, b, amount) {
  const out = [];
  for (let i = 0; i < 4; i += 1) {
    out[i] = Math.round(a[i] + (b[i] - a[i]) * amount);
  }
  return out;
}

function sampleColor(x, y, variant, index) {
  const edge = waterDistance(x, y, variant.mask);
  const n = jitter(x, y, index);
  if (edge < -1) {
    return n < 3 ? colors.waterDeep : colors.water;
  }
  if (edge < 1) {
    return n < 7 ? colors.waterFoam : colors.wetSand;
  }
  if (edge <= sandBankPx + 1) {
    return mix(colors.wetSand, colors.sand, Math.min(1, Math.max(0, edge / sandBankPx)));
  }
  return n < 5 ? colors.grassDark : colors.grass;
}

function writePixel(rgba, x, y, color) {
  const offset = (y * imageWidth + x) * 4;
  rgba[offset] = color[0];
  rgba[offset + 1] = color[1];
  rgba[offset + 2] = color[2];
  rgba[offset + 3] = color[3];
}

function buildAtlas() {
  const rgba = new Uint8Array(imageWidth * imageHeight * 4);
  const atlasVariants = [];
  variants.forEach((variant, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    for (let y = 0; y < tileSize; y += 1) {
      for (let x = 0; x < tileSize; x += 1) {
        writePixel(rgba, col * tileSize + x, row * tileSize + y, sampleColor(x, y, variant, index));
      }
    }
    atlasVariants.push(Object.assign({}, variant, {
      rect: [col * tileSize, row * tileSize, tileSize, tileSize],
      sandBankPx: sandBankPx
    }));
  });
  return { rgba, atlasVariants };
}

function main() {
  const built = buildAtlas();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "shore-tiles.png"), encodePng(imageWidth, imageHeight, built.rgba));
  fs.writeFileSync(path.join(outDir, "shore-tiles-atlas.json"), JSON.stringify({
    type: "grid",
    tileWidth: tileSize,
    tileHeight: tileSize,
    columns: columns,
    rows: rows,
    image: "shore-tiles.png",
    names: built.atlasVariants.map((variant) => variant.id),
    variants: built.atlasVariants,
    palette: colors,
    sourceIssue: "AZR-531",
    notes: "Standalone candidate export for 16 grass-to-water shore transition tiles. Runtime integration remains separate."
  }, null, 2) + "\n");
  console.log("shore transition atlas built", JSON.stringify({ png: "exports/transitions/shore-tiles.png", variants: variants.length }));
}

if (require.main === module) {
  main();
}

module.exports = { buildAtlas };
