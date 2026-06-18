const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "assets", "biome-lut.png");
const width = 256;
const height = 256;
const temperatureRangeC = [-40, 40];
const precipitationRangeMm = [0, 4000];
const seaLevelM = 0;
const biomes = [
  { id: "polar_ice", color: "#ffffff" },
  { id: "tundra", color: "#a0b090" },
  { id: "boreal_forest", color: "#2d6b30" },
  { id: "temperate_rainforest", color: "#3d8b3d" },
  { id: "temperate_deciduous", color: "#5ca040" },
  { id: "tropical_rainforest", color: "#1a6b1a" },
  { id: "savanna", color: "#c8a050" },
  { id: "grassland", color: "#8bb040" },
  { id: "desert", color: "#d4a060" },
  { id: "hot_desert", color: "#e8b850" },
  { id: "ocean_shallow", color: "#2060a0" },
  { id: "ocean_deep", color: "#102040" },
  { id: "wetlands", color: "#507050" }
];

function hexToRgb(hex) {
  const value = String(hex || "#000000").replace("#", "");
  const intValue = parseInt(value.length === 3 ? value.replace(/(.)/g, "$1$1") : value, 16) || 0;
  return [(intValue >> 16) & 255, (intValue >> 8) & 255, intValue & 255];
}

function classifyBiome(temperatureC, precipitationMm, elevationM) {
  if (elevationM < seaLevelM) {
    return elevationM < -1400 ? "ocean_deep" : "ocean_shallow";
  }
  if (temperatureC <= -12) { return "polar_ice"; }
  if (temperatureC <= 2) { return precipitationMm > 600 ? "tundra" : "polar_ice"; }
  if (temperatureC <= 8) { return precipitationMm > 900 ? "boreal_forest" : "tundra"; }
  if (precipitationMm >= 3500 && temperatureC >= 4 && temperatureC < 22) { return "wetlands"; }
  if (precipitationMm >= 3200 && temperatureC >= 22) { return "tropical_rainforest"; }
  if (precipitationMm >= 2600 && temperatureC >= 8) { return "temperate_rainforest"; }
  if (precipitationMm >= 1700 && temperatureC >= 12) { return temperatureC >= 24 ? "tropical_rainforest" : "temperate_deciduous"; }
  if (precipitationMm >= 1100) { return temperatureC >= 20 ? "savanna" : "temperate_deciduous"; }
  if (precipitationMm >= 650) { return temperatureC >= 24 ? "savanna" : "grassland"; }
  if (precipitationMm >= 250) { return temperatureC >= 30 ? "hot_desert" : "grassland"; }
  if (precipitationMm >= 120 && temperatureC < 14) { return "grassland"; }
  return temperatureC >= 28 ? "hot_desert" : "desert";
}

function makePixels() {
  const pixels = Buffer.alloc(width * height * 4);
  const colorByBiome = new Map(biomes.map((biome) => [biome.id, hexToRgb(biome.color)]));

  for (let y = 0; y < height; y += 1) {
    const precipitation = (y / Math.max(1, height - 1)) * precipitationRangeMm[1];
    for (let x = 0; x < width; x += 1) {
      const temperature = temperatureRangeC[0] + (x / Math.max(1, width - 1)) * (temperatureRangeC[1] - temperatureRangeC[0]);
      let elevation = 100;
      if (y === 0) {
        elevation = -2000;
      } else if (y === 1) {
        elevation = -200;
      }
      const rgb = colorByBiome.get(classifyBiome(temperature, precipitation, elevation));
      const offset = (y * width + x) * 4;
      pixels[offset] = rgb[0];
      pixels[offset + 1] = rgb[1];
      pixels[offset + 2] = rgb[2];
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

function writePng(pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0;
    pixels.copy(raw, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);

  fs.writeFileSync(outputPath, png);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
writePng(makePixels());
console.log("wrote " + path.relative(root, outputPath));
