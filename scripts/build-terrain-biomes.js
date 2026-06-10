const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const terrainDir = path.join(root, "assets", "terrain");
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

function encodePng(rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
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
    names: Array.from({ length: columns }, (_, index) => "terrain." + id + "." + index)
  };
}

function manifestSheetFor(id, file) {
  return {
    path: "assets/terrain/" + file,
    meta: "assets/terrain/" + id + ".json",
    pixelData: "assets/terrain/" + id + ".rgba.json",
    tileSize,
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

console.log("terrain biome atlases built", JSON.stringify({
  atlases: atlases.map((entry) => entry.file),
  manifestSheets: Object.keys(sheetAliases)
}));
