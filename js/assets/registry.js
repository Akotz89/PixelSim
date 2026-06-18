import { PS } from "../core/namespace.js";
import { world } from "../systems/state.js";

PS.assets = PS.assets || {};

PS.assets.families = PS.assets.families || {
  terrain: { kind: "palette", purpose: "terrain materials" },
  world: { kind: "atlas", purpose: "planet and world symbols" },
  settlement: { kind: "atlas", purpose: "structures and routes" },
  entities: { kind: "atlas", purpose: "organisms and citizens" },
  resources: { kind: "atlas", purpose: "food and objects" },
  icons: { kind: "atlas", purpose: "status symbols" },
  ui: { kind: "atlas", purpose: "HUD and controls" },
  overlays: { kind: "palette", purpose: "maps and debug views" },
  atmosphere: { kind: "palette", purpose: "sky, clouds, and glow" }
};
PS.assets.atlases = PS.assets.atlases || {};
PS.assets.palettes = PS.assets.palettes || {};
PS.assets.paletteVersions = PS.assets.paletteVersions || {};

PS.assets.registerFamily = function (id, family) {
  var familyId = String(id || "").trim();

  if (!familyId) {
    throw new Error("Asset family id is required");
  }

  PS.assets.families[familyId] = family || {};
  return PS.assets.families[familyId];
};

PS.assets.registerAtlas = function (id, atlas) {
  var atlasId = String(id || "").trim();

  if (!atlasId) {
    throw new Error("Atlas id is required");
  }

  PS.assets.atlases[atlasId] = atlas || {};
  return PS.assets.atlases[atlasId];
};

PS.assets.getAtlas = function (id) {
  return PS.assets.atlases[String(id || "")] || null;
};

PS.assets.registerPalette = function (id, palette) {
  var paletteId = String(id || "").trim();

  if (!paletteId) {
    throw new Error("Palette id is required");
  }

  PS.assets.palettes[paletteId] = palette || {};
  PS.assets.paletteVersions[paletteId] = (Number(PS.assets.paletteVersions[paletteId]) || 0) + 1;
  return PS.assets.palettes[paletteId];
};

PS.assets.getPalette = function (id) {
  return PS.assets.palettes[String(id || "")] || null;
};

PS.assets.getPaletteVersion = function (id) {
  return Number(PS.assets.paletteVersions[String(id || "")]) || 0;
};

PS.assets.getPaletteColor = function (paletteId, key, fallback) {
  var palette = PS.assets.getPalette(paletteId);
  var colorKey = String(key || "");
  var color = palette && palette[colorKey];

  return typeof color === "string" && color.charAt(0) === "#" ? color : fallback;
};

PS.assets.getManifest = function () {
  return {
    families: PS.assets.families,
    atlases: PS.assets.atlases,
    palettes: PS.assets.palettes
  };
};

PS.assets.registerPalette("pixeldarium-base", {
  terrainMuted: "#3f4f31",
  waterMuted: "#1a3a6a",
  entityContrast: "#fff26b",
  statusWarning: "#ff9c69",
  overlayInfo: "#70f0d0"
});

PS.assets.registerPalette("terrain", {
  forest: "#0f351d",
  grassland: "#2e6010",
  wetland: "#173f34",
  mountain: "#3a3a3a",
  barren: "#323126",
  desert: "#8a6a30",
  tundra: "#243133",
  ice: "#b8ddea",
  ocean: "#1a3a6a"
});

PS.assets.registerPalette("status", {
  healthy: "#70f0d0",
  active: "#fff26b",
  hungry: "#ff9c69",
  inspect: "#ffffff"
});

["terrain", "world", "settlement", "entities", "resources", "icons", "ui", "overlays", "atmosphere"].forEach(function (family) {
  PS.assets.registerAtlas(family, {
    family: family,
    procedural: true,
    source: "pixeldarium-runtime"
  });
});
