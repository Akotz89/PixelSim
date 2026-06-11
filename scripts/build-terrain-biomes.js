const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const terrainDir = path.join(root, "assets", "terrain");
const terrainExportDir = path.join(root, "exports", "terrain");
const manifestPath = path.join(root, "assets", "manifest.json");
const manifestSidecarPath = path.join(root, "assets", "manifest.json.js");
const tileSize = 32;
const columns = 8;
const albedoWidth = tileSize * columns;
const width = albedoWidth * 2;
const height = tileSize;

const atlases = [
  { id: "grass", file: "grass.png", base: [88, 138, 66], high: [128, 172, 88], low: [54, 91, 49], accent: [153, 183, 95], pattern: "grass" },
  { id: "stone", file: "stone.png", base: [72, 72, 72], high: [128, 126, 118], low: [45, 47, 50], accent: [92, 96, 98], pattern: "cobble" },
  { id: "dirt", file: "dirt.png", base: [82, 58, 36], high: [120, 87, 55], low: [42, 31, 24], accent: [63, 44, 30], pattern: "roots" },
  { id: "sand", file: "sand.png", base: [138, 106, 48], high: [173, 135, 65], low: [98, 74, 38], accent: [160, 124, 58], pattern: "dune" },
  { id: "forest", file: "forest.png", base: [49, 96, 43], high: [81, 137, 61], low: [26, 57, 33], accent: [100, 151, 72], pattern: "canopy" },
  { id: "desert", file: "desert.png", base: [188, 151, 82], high: [216, 184, 108], low: [139, 103, 58], accent: [207, 171, 96], pattern: "dune" },
  { id: "water", file: "water.png", base: [69, 127, 148], high: [112, 172, 190], low: [38, 82, 111], accent: [153, 199, 199], pattern: "water" },
  { id: "ice", file: "ice.png", base: [184, 221, 234], high: [228, 244, 247], low: [124, 168, 188], accent: [198, 235, 242], pattern: "cracked-ice" },
  { id: "rock", file: "rock.png", base: [55, 55, 58], high: [94, 92, 88], low: [28, 29, 34], accent: [78, 80, 85], pattern: "basalt" },
  { id: "snow", file: "snow.png", base: [224, 232, 236], high: [246, 249, 250], low: [172, 190, 198], accent: [237, 243, 245], pattern: "snow" },
  { id: "ocean", file: "ocean.png", base: [35, 61, 103], high: [56, 92, 139], low: [17, 34, 67], accent: [81, 129, 166], pattern: "deep-water" },
  { id: "mountain", file: "mountain.png", base: [93, 96, 101], high: [139, 141, 137], low: [58, 62, 70], accent: [118, 122, 122], pattern: "ridge" },
  { id: "tundra", file: "tundra.png", base: [143, 153, 134], high: [184, 193, 174], low: [96, 112, 107], accent: [212, 224, 222], pattern: "frost" },
  { id: "wetland", file: "wetland.png", base: [70, 96, 62], high: [94, 124, 76], low: [42, 61, 42], accent: [123, 145, 82], pattern: "reed" }
];

const sheetAliases = {
  terrain_grass: "grass",
  terrain_stone: "stone",
  terrain_dirt: "dirt",
  terrain_sand: "sand",
  terrain_forest: "forest",
  terrain_desert: "desert",
  terrain_water: "water",
  terrain_ice: "ice",
  terrain_rock: "rock",
  terrain_snow: "snow",
  terrain_ocean: "ocean",
  terrain_mountain: "mountain",
  terrain_tundra: "tundra",
  terrain_wetland: "wetland"
};

const authoredVariantRoles = {
  grass: ["lush-1", "lush-2", "lush-3", "lush-4", "dry-1", "dry-2", "dead-1", "winter-1"],
  stone: ["bare-1", "bare-2", "bare-3", "snow-1", "snow-2", "moss-1", "scree-1", "ledge-1"],
  dirt: ["dark-soil-1", "dark-soil-2", "roots-1", "roots-2", "leaf-litter-1", "leaf-litter-2", "dry-soil-1", "dry-soil-2"],
  sand: ["dune-1", "dune-2", "pebble-1", "dry-veg-1", "dune-3", "dune-4", "pebble-2", "dry-veg-2"],
  forest: ["leaf-litter-1", "roots-1", "mushroom-1", "dark-soil-1", "leaf-litter-2", "roots-2", "mushroom-2", "dark-soil-2"],
  desert: ["dune-1", "dune-2", "pebble-1", "dry-veg-1", "dune-3", "dune-4", "pebble-2", "dry-veg-2"],
  water: ["deep-1", "deep-2", "shallow-1", "shore-1", "deep-3", "deep-4", "shallow-2", "shore-2"],
  ice: ["snow-1", "frozen-soil-1", "cracked-ice-1", "winter-1", "snow-2", "frozen-soil-2", "cracked-ice-2", "winter-2"],
  rock: ["bare-1", "bare-2", "bare-3", "snow-1", "snow-2", "moss-1", "scree-1", "ledge-1"],
  snow: ["snow-1", "frozen-soil-1", "cracked-ice-1", "winter-1", "snow-2", "frozen-soil-2", "cracked-ice-2", "winter-2"],
  ocean: ["deep-1", "deep-2", "shallow-1", "shore-1", "deep-3", "deep-4", "shallow-2", "shore-2"],
  mountain: ["bare-1", "bare-2", "bare-3", "snow-1", "snow-2", "moss-1", "scree-1", "ledge-1"],
  tundra: ["snow-1", "frozen-soil-1", "cracked-ice-1", "winter-1", "snow-2", "frozen-soil-2", "cracked-ice-2", "winter-2"],
  wetland: ["pool-1", "reed-1", "mud-1", "marsh-1", "pool-2", "reed-2", "mud-2", "marsh-2"]
};

function hash(x, y, salt) {
  let value = (x * 374761393 + y * 668265263 + salt * 2246822519) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function mix(a, b, amount) {
  return Math.round(a + (b - a) * amount);
}

function patternAmount(pattern, x, y, variant, bits) {
  if (pattern === "water") {
    return ((x + Math.floor(y / 2) + variant * 2) % 9 < 2) ? 0.48 : (bits < 42 ? -0.18 : 0);
  }
  if (pattern === "deep-water") {
    return ((x * 2 + y + variant * 3) % 13 < 2) ? 0.34 : (bits < 72 ? -0.28 : 0);
  }
  if (pattern === "dune") {
    return ((x + Math.floor(y / 3) + variant * 3) % 10 < 2) ? 0.38 : (bits < 45 ? -0.16 : 0);
  }
  if (pattern === "cobble") {
    return ((Math.floor(x / 8) + Math.floor(y / 8) + variant) % 2 === 0) ? 0.30 : (bits < 70 ? -0.18 : 0);
  }
  if (pattern === "roots") {
    return ((x + y * 2 + variant * 5) % 17 < 2) ? -0.36 : (bits > 218 ? 0.18 : 0);
  }
  if (pattern === "basalt") {
    return (Math.abs(x - 15 + variant) + Math.abs(y - 15)) % 11 < 3 ? 0.36 : (bits < 74 ? -0.30 : 0);
  }
  if (pattern === "cracked-ice") {
    return ((x * 3 + y + variant * 7) % 19 < 2 || (y * 4 - x + variant * 3) % 23 === 0) ? -0.24 : (bits > 226 ? 0.16 : 0);
  }
  if (pattern === "snow") {
    return bits > 210 ? 0.18 : (bits < 42 ? -0.12 : 0);
  }
  if (pattern === "ridge") {
    return (Math.abs(x - 12 + variant) + Math.floor(y / 4)) % 12 < 2 ? 0.42 : (bits < 56 ? -0.24 : 0);
  }
  if (pattern === "frost") {
    return (x + y + variant) % 6 === 0 ? 0.48 : (bits < 48 ? -0.20 : 0);
  }
  if (pattern === "reed") {
    return x % 6 === variant % 6 ? 0.36 : (y % 8 === 0 ? -0.24 : 0);
  }
  if (pattern === "canopy") {
    return bits < 72 ? 0.30 : (bits > 220 ? -0.26 : 0);
  }
  return bits < 64 ? 0.26 : (bits > 220 ? -0.18 : 0);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function heightAmount(pattern, x, y, variant, bits) {
  const base = 0.45 + (((bits >>> 3) & 63) / 255);
  const line = patternAmount(pattern, x, y, variant, bits);
  const wave = pattern === "water" || pattern === "deep-water"
    ? Math.sin((x + variant * 5) * 0.65 + y * 0.22) * 0.08
    : 0;
  const ridge = pattern === "ridge" || pattern === "basalt"
    ? (Math.abs(x - 16) < 4 ? 0.16 : 0)
    : 0;

  return Math.max(0.05, Math.min(0.95, base + line * 0.24 + wave + ridge));
}

function normalFromHeight(heights, variant, x, y) {
  function h(sampleX, sampleY) {
    const clampedX = Math.max(0, Math.min(tileSize - 1, sampleX));
    const clampedY = Math.max(0, Math.min(tileSize - 1, sampleY));
    return heights[variant * tileSize * tileSize + clampedY * tileSize + clampedX];
  }

  const hL = h(x - 1, y);
  const hR = h(x + 1, y);
  const hD = h(x, y - 1);
  const hU = h(x, y + 1);
  let nx = (hL - hR) * 2.4;
  let ny = (hD - hU) * 2.4;
  let nz = 1.0;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  nx /= length;
  ny /= length;
  nz /= length;

  return [
    clampByte((nx * 0.5 + 0.5) * 255),
    clampByte((ny * 0.5 + 0.5) * 255),
    clampByte((nz * 0.5 + 0.5) * 255)
  ];
}

function renderAtlas(definition) {
  const pixels = Buffer.alloc(width * height * 4);
  const heights = new Float32Array(columns * tileSize * tileSize);

  for (let variant = 0; variant < columns; variant++) {
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const pixelX = variant * tileSize + x;
        const offset = (y * width + pixelX) * 4;
        const noise = hash(x, y, variant + definition.id.length * 17);
        const grain = (noise & 255) / 255;
        const amount = 0.18 + ((noise >>> 8) & 31) / 255;
        const heightValue = heightAmount(definition.pattern, x, y, variant, noise);
        let target = grain > 0.55 ? definition.high : definition.low;
        let r = mix(definition.base[0], target[0], amount);
        let g = mix(definition.base[1], target[1], amount);
        let b = mix(definition.base[2], target[2], amount);
        const pattern = patternAmount(definition.pattern, x, y, variant, (noise >>> 16) & 255);

        if (pattern !== 0) {
          const patternTarget = pattern > 0 ? definition.accent : definition.low;
          r = mix(r, patternTarget[0], Math.abs(pattern));
          g = mix(g, patternTarget[1], Math.abs(pattern));
          b = mix(b, patternTarget[2], Math.abs(pattern));
        }

        if (x === 0 || y === 0 || x === tileSize - 1 || y === tileSize - 1) {
          r = mix(r, definition.low[0], 0.18);
          g = mix(g, definition.low[1], 0.18);
          b = mix(b, definition.low[2], 0.18);
        }

        pixels[offset] = r;
        pixels[offset + 1] = g;
        pixels[offset + 2] = b;
        pixels[offset + 3] = clampByte(heightValue * 255);
        heights[variant * tileSize * tileSize + y * tileSize + x] = heightValue;
      }
    }
  }

  const centerOffset = (16 * width + 16) * 4;
  pixels[centerOffset] = definition.base[0];
  pixels[centerOffset + 1] = definition.base[1];
  pixels[centerOffset + 2] = definition.base[2];
  pixels[centerOffset + 3] = clampByte(heights[16 * tileSize + 16] * 255);

  for (let variant = 0; variant < columns; variant++) {
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const normalX = albedoWidth + variant * tileSize + x;
        const offset = (y * width + normalX) * 4;
        const normal = normalFromHeight(heights, variant, x, y);

        pixels[offset] = normal[0];
        pixels[offset + 1] = normal[1];
        pixels[offset + 2] = normal[2];
        pixels[offset + 3] = clampByte(heights[variant * tileSize * tileSize + y * tileSize + x] * 255);
      }
    }
  }

  return pixels;
}

const rockMountainVariants = [
  { id: "bare-ledge", label: "Bare ledge", snow: 0, moss: 0, crackBias: 0.12, ledges: true, base: [82, 84, 86], high: [132, 132, 126], low: [43, 45, 49] },
  { id: "bare-cracked", label: "Bare cracked", snow: 0, moss: 0, crackBias: 0.38, ledges: false, base: [74, 75, 78], high: [121, 122, 119], low: [35, 37, 42] },
  { id: "bare-scree", label: "Bare scree", snow: 0, moss: 0, crackBias: 0.22, ledges: true, base: [91, 90, 86], high: [147, 144, 134], low: [50, 51, 54] },
  { id: "snow-ledge", label: "Snow-capped ledge", snow: 0.78, moss: 0, crackBias: 0.18, ledges: true, base: [82, 86, 91], high: [135, 138, 135], low: [45, 49, 56] },
  { id: "snow-cracked", label: "Snow-capped cracked", snow: 0.68, moss: 0, crackBias: 0.42, ledges: false, base: [70, 74, 82], high: [122, 126, 128], low: [35, 39, 48] },
  { id: "mossy-lichen", label: "Mossy lichen", snow: 0, moss: 0.52, crackBias: 0.26, ledges: true, base: [76, 78, 73], high: [126, 126, 116], low: [39, 43, 40] }
];

const waterTileVariants = [
  { id: "deep-swell", label: "Deep water swell", depth: "deep", base: [29, 63, 101], high: [68, 116, 151], low: [12, 31, 67], foam: 0.02, glint: 0.12, waveBend: 0 },
  { id: "deep-glint", label: "Deep water glint", depth: "deep", base: [34, 75, 116], high: [84, 134, 164], low: [17, 39, 78], foam: 0.03, glint: 0.22, waveBend: 3 },
  { id: "shallow-gradient", label: "Shallow depth gradient", depth: "shallow", base: [62, 128, 151], high: [117, 179, 190], low: [35, 88, 124], foam: 0.11, glint: 0.12, waveBend: 5 },
  { id: "shore-foam", label: "Shore foam", depth: "shallow", base: [76, 145, 160], high: [151, 204, 204], low: [42, 99, 128], foam: 0.22, glint: 0.16, waveBend: 8 }
];

function renderRockMountainExport() {
  const exportColumns = rockMountainVariants.length;
  const exportWidth = tileSize * exportColumns;
  const exportHeight = tileSize;
  const pixels = Buffer.alloc(exportWidth * exportHeight * 4);

  rockMountainVariants.forEach((variant, variantIndex) => {
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const noise = hash(x, y, 700 + variantIndex * 97);
        const grain = (noise & 255) / 255;
        const chip = ((noise >>> 8) & 255) / 255;
        const px = variantIndex * tileSize + x;
        const offset = (y * exportWidth + px) * 4;
        let target = grain > 0.52 ? variant.high : variant.low;
        let amount = 0.18 + chip * 0.24;
        let r = mix(variant.base[0], target[0], amount);
        let g = mix(variant.base[1], target[1], amount);
        let b = mix(variant.base[2], target[2], amount);
        const ledge = variant.ledges && (y === 8 || y === 15 || y === 23 || (y + variantIndex) % 11 === 0);
        const verticalCrack = ((x + variantIndex * 3) % 13 === 0 && y > 5) || ((x * 3 + y + variantIndex) % 29 === 0);
        const diagonalCrack = Math.abs((x + variantIndex * 4) - (y + 5)) % 17 === 0;
        const scree = chip > 0.78 && y > 14;

        if (ledge) {
          r = mix(r, variant.low[0], 0.52);
          g = mix(g, variant.low[1], 0.52);
          b = mix(b, variant.low[2], 0.52);
        }

        if (verticalCrack || (diagonalCrack && grain < variant.crackBias)) {
          r = mix(r, variant.low[0], 0.72);
          g = mix(g, variant.low[1], 0.72);
          b = mix(b, variant.low[2], 0.72);
        }

        if (scree) {
          r = mix(r, variant.high[0], 0.28);
          g = mix(g, variant.high[1], 0.28);
          b = mix(b, variant.high[2], 0.28);
        }

        if (variant.snow && y < 11 + Math.floor(((noise >>> 18) & 7) * variant.snow)) {
          const snowAccent = chip > 0.48 ? [242, 247, 248] : [183, 205, 214];
          r = mix(r, snowAccent[0], variant.snow);
          g = mix(g, snowAccent[1], variant.snow);
          b = mix(b, snowAccent[2], variant.snow);
        }

        if (variant.moss && (grain > 0.66 || ((x + y * 2) % 19 < 3 && y > 7))) {
          r = mix(r, 72, variant.moss);
          g = mix(g, 104, variant.moss);
          b = mix(b, 61, variant.moss);
        }

        if (x === 0 || y === 0 || x === tileSize - 1 || y === tileSize - 1) {
          r = mix(r, variant.low[0], 0.18);
          g = mix(g, variant.low[1], 0.18);
          b = mix(b, variant.low[2], 0.18);
        }

        pixels[offset] = clampByte(r);
        pixels[offset + 1] = clampByte(g);
        pixels[offset + 2] = clampByte(b);
        pixels[offset + 3] = 255;
      }
    }
  });

  return {
    width: exportWidth,
    height: exportHeight,
    pixels
  };
}

function renderWaterExport() {
  const exportColumns = waterTileVariants.length;
  const exportWidth = tileSize * exportColumns;
  const exportHeight = tileSize;
  const pixels = Buffer.alloc(exportWidth * exportHeight * 4);

  waterTileVariants.forEach((variant, variantIndex) => {
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const noise = hash(x, y, 1300 + variantIndex * 131);
        const px = variantIndex * tileSize + x;
        const offset = (y * exportWidth + px) * 4;
        const gradient = variant.depth === "shallow" ? y / (tileSize - 1) : 0.15;
        const wave = Math.sin((x + variant.waveBend) * 0.62 + y * 0.28) + Math.sin(x * 0.18 - y * 0.43 + variantIndex);
        const crest = wave > 1.15 || ((x + Math.floor(y / 2) + variantIndex * 3) % 13 < 2 && wave > 0.4);
        const glint = ((noise >>> 8) & 255) / 255 < variant.glint && wave > 0.75;
        const foam = variant.depth === "shallow" && (
          y < 6 + variantIndex ||
          ((x + y * 3 + variantIndex * 5) % 17 < 2 && y < 18) ||
          ((noise & 255) / 255 < variant.foam && wave > 0.2)
        );
        let amount = 0.22 + (((noise >>> 16) & 63) / 255);
        let target = wave > 0.25 ? variant.high : variant.low;
        let r = mix(variant.base[0], target[0], amount);
        let g = mix(variant.base[1], target[1], amount);
        let b = mix(variant.base[2], target[2], amount);

        if (gradient) {
          r = mix(r, variant.high[0], gradient * 0.28);
          g = mix(g, variant.high[1], gradient * 0.28);
          b = mix(b, variant.high[2], gradient * 0.28);
        }

        if (crest) {
          r = mix(r, variant.high[0], 0.36);
          g = mix(g, variant.high[1], 0.36);
          b = mix(b, variant.high[2], 0.36);
        }

        if (glint) {
          r = mix(r, 181, 0.42);
          g = mix(g, 218, 0.42);
          b = mix(b, 220, 0.42);
        }

        if (foam) {
          r = mix(r, 220, 0.58);
          g = mix(g, 238, 0.58);
          b = mix(b, 232, 0.58);
        }

        if (x === 0 || y === 0 || x === tileSize - 1 || y === tileSize - 1) {
          r = mix(r, variant.low[0], 0.12);
          g = mix(g, variant.low[1], 0.12);
          b = mix(b, variant.low[2], 0.12);
        }

        pixels[offset] = clampByte(r);
        pixels[offset + 1] = clampByte(g);
        pixels[offset + 2] = clampByte(b);
        pixels[offset + 3] = 255;
      }
    }
  });

  return {
    width: exportWidth,
    height: exportHeight,
    pixels
  };
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = crcTable[(crc ^ buffer[i]) & 255] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function encodePng(rgba, imageWidth = width, imageHeight = height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(imageWidth, 0);
  ihdr.writeUInt32BE(imageHeight, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = imageWidth * 4;
  const raw = Buffer.alloc((stride + 1) * imageHeight);
  for (let y = 0; y < imageHeight; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function rgbaSidecarFor(id, rgba) {
  return {
    type: "rgba-base64",
    width: width,
    height: height,
    byteLength: rgba.length,
    data: rgba.toString("base64"),
    source: "assets/terrain/" + id + ".png"
  };
}

function metadataFor(id) {
  return {
    type: "grid",
    tileWidth: tileSize,
    tileHeight: tileSize,
    columns,
    splitAtlas: true,
    albedoColumns: columns,
    normalColumns: columns,
    normalOffsetX: albedoWidth,
    rows: 1,
    names: Array.from({ length: columns }, (_, index) => "terrain." + id + "." + index),
    authored: true,
    sourceIssue: "AZR-511",
    sourceKind: "accepted-runtime-art",
    fallback: "Regenerate with scripts/build-terrain-biomes.js if an accepted PNG is missing.",
    variantRoles: Array.from({ length: columns }, (_, index) => ({
      id: "terrain." + id + "." + index,
      role: (authoredVariantRoles[id] && authoredVariantRoles[id][index]) || "variant-" + index
    }))
  };
}

function manifestSheetFor(id, file) {
  return {
    path: "assets/terrain/" + file,
    meta: "assets/terrain/" + id + ".json",
    pixelData: "assets/terrain/" + id + ".rgba.json",
    tileSize,
    authored: true,
    sourceIssue: "AZR-511",
    splitAtlas: {
      albedoRect: [0, 0, albedoWidth, height],
      normalRect: [albedoWidth, 0, albedoWidth, height],
      normalOffset: [albedoWidth, 0]
    },
    sprites: Array.from({ length: columns }, (_, index) => ({
      id: "terrain." + id + "." + index,
      rect: [index * tileSize, 0, tileSize, tileSize]
    }))
  };
}

fs.mkdirSync(terrainDir, { recursive: true });
fs.mkdirSync(terrainExportDir, { recursive: true });

atlases.forEach((definition) => {
  const rgba = renderAtlas(definition);
  const meta = metadataFor(definition.id);
  const rgbaSidecar = rgbaSidecarFor(definition.id, rgba);

  fs.writeFileSync(path.join(terrainDir, definition.file), encodePng(rgba));
  fs.writeFileSync(path.join(terrainDir, definition.id + ".json"), JSON.stringify(meta, null, 2) + "\n");
  fs.writeFileSync(
    path.join(terrainDir, definition.id + ".json.js"),
    "PS.assets.registerJSON(\"assets/terrain/" + definition.id + ".json\", " + JSON.stringify(meta, null, 2) + ");\n"
  );
  fs.writeFileSync(path.join(terrainDir, definition.id + ".rgba.json"), JSON.stringify(rgbaSidecar) + "\n");
  fs.writeFileSync(
    path.join(terrainDir, definition.id + ".rgba.json.js"),
    "PS.assets.registerJSON(\"assets/terrain/" + definition.id + ".rgba.json\", " + JSON.stringify(rgbaSidecar) + ");\n"
  );
});

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.sheets = manifest.sheets || {};
Object.keys(sheetAliases).forEach((sheetId) => {
  const atlasId = sheetAliases[sheetId];
  const definition = atlases.find((entry) => entry.id === atlasId);
  manifest.sheets[sheetId] = manifestSheetFor(atlasId, definition.file);
});

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync(
  manifestSidecarPath,
  "PS.assets.registerJSON(\"assets/manifest.json\", " + JSON.stringify(manifest, null, 2) + ");\n"
);

const rockMountainExport = renderRockMountainExport();
const waterTileExport = renderWaterExport();
const rockMountainMeta = {
  type: "grid",
  tileWidth: tileSize,
  tileHeight: tileSize,
  columns: rockMountainVariants.length,
  rows: 1,
  names: rockMountainVariants.map((variant) => "terrain.rock_mountain." + variant.id),
  variants: rockMountainVariants.map((variant, index) => ({
    id: "terrain.rock_mountain." + variant.id,
    label: variant.label,
    rect: [index * tileSize, 0, tileSize, tileSize]
  })),
  sourceIssue: "AZR-522",
  notes: "Standalone candidate export for rock/mountain terrain tiles. Runtime split-atlas terrain sheets remain under assets/terrain/."
};
const waterTileMeta = {
  type: "grid",
  tileWidth: tileSize,
  tileHeight: tileSize,
  columns: waterTileVariants.length,
  rows: 1,
  names: waterTileVariants.map((variant) => "terrain.water." + variant.id),
  variants: waterTileVariants.map((variant, index) => ({
    id: "terrain.water." + variant.id,
    label: variant.label,
    depth: variant.depth,
    rect: [index * tileSize, 0, tileSize, tileSize]
  })),
  sourceIssue: "AZR-523",
  notes: "Standalone candidate export for water terrain tiles. Runtime split-atlas terrain sheets remain under assets/terrain/."
};

fs.writeFileSync(
  path.join(terrainExportDir, "rock-tiles.png"),
  encodePng(rockMountainExport.pixels, rockMountainExport.width, rockMountainExport.height)
);
fs.writeFileSync(
  path.join(terrainExportDir, "rock-tiles-atlas.json"),
  JSON.stringify(rockMountainMeta, null, 2) + "\n"
);
fs.writeFileSync(
  path.join(terrainExportDir, "water-tiles.png"),
  encodePng(waterTileExport.pixels, waterTileExport.width, waterTileExport.height)
);
fs.writeFileSync(
  path.join(terrainExportDir, "water-tiles-atlas.json"),
  JSON.stringify(waterTileMeta, null, 2) + "\n"
);

console.log("terrain biome atlases built", JSON.stringify({
  atlases: atlases.map((entry) => entry.file),
  manifestSheets: Object.keys(sheetAliases),
  exports: [
    "exports/terrain/rock-tiles.png",
    "exports/terrain/rock-tiles-atlas.json",
    "exports/terrain/water-tiles.png",
    "exports/terrain/water-tiles-atlas.json"
  ]
}));
