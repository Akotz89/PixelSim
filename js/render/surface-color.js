PS.render = PS.render || {};
PS.render.surfaceColor = PS.render.surfaceColor || {};

PS.render.surfaceColor.getTileBlendRgb = function (tileBlend) {
  var tiles = tileBlend && Array.isArray(tileBlend.tiles) ? tileBlend.tiles : [];
  var red = 0;
  var green = 0;
  var blue = 0;
  var totalWeight = 0;

  for (var i = 0; i < tiles.length; i++) {
    var item = tiles[i];
    var weight = clamp(Number(item.weight) || 0, 0, 1);
    var tile = item.tile || getPlanetTile(item.x, item.y);

    if (!tile || weight <= 0) {
      continue;
    }

    var rgb = getRgbFromHex(getPlanetTileCompositedColor(tile));

    red += rgb.red * weight;
    green += rgb.green * weight;
    blue += rgb.blue * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    return null;
  }

  return clampRgb({
    red: red / totalWeight,
    green: green / totalWeight,
    blue: blue / totalWeight
  });
};

PS.render.surfaceColor.getBiomeTransitionStrength = function (sample) {
  var tileBlend = sample && sample.tileBlend ? sample.tileBlend : null;
  var biomeWeights = tileBlend && tileBlend.biomeWeights ? tileBlend.biomeWeights : null;
  var sampleBiome = sample && sample.biome ? sample.biome : "unknown";

  if (!biomeWeights) {
    return 0;
  }

  return clamp(1 - (Number(biomeWeights[sampleBiome]) || 0), 0, 1);
};

PS.render.surfaceColor.blendWithTileBlend = function (sample, localColor) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = detail.surface || "";
  var transitionStrength = PS.render.surfaceColor.getBiomeTransitionStrength(sample);
  var targetRgb;
  var strongSurfaceScale = 1;

  if (transitionStrength <= 0.01) {
    return localColor;
  }

  targetRgb = PS.render.surfaceColor.getTileBlendRgb(sample.tileBlend);

  if (!targetRgb) {
    return localColor;
  }

  if (surface === "whitecap" || surface === "deep water" || surface === "ridge ice" || surface === "snow") {
    strongSurfaceScale = 0.18;
  } else if (surface === "open water" || surface === "rock" || surface === "stone") {
    strongSurfaceScale = 0.62;
  }

  return blendHexColorWithRgb(localColor, targetRgb, clamp(transitionStrength * 0.34 * strongSurfaceScale, 0, 0.34));
};

PS.render.surfaceColor.getLocalTerrainBandTint = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var materialSignals = detail.materialSignals || {};
  var tile = sample && sample.tile ? sample.tile : {};
  var biome = sample && sample.biome ? sample.biome : "unknown";
  var surface = detail.surface || "ground";
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var elevationSignal = tile && Number.isFinite(Number(tile.elevation))
    ? Number(tile.elevation)
    : ((Number.isFinite(Number(detail.elevation)) ? Number(detail.elevation) : 0.5) - 0.5) * 2;
  var signals = {
    elevation: elevationSignal,
    moisture: tile && Number.isFinite(Number(tile.moisture))
      ? Number(tile.moisture)
      : clamp(Number.isFinite(Number(materialSignals.moisture)) ? Number(materialSignals.moisture) : 0.35, 0, 1) * 1.8,
    ridgeStrength: Number.isFinite(Number(materialSignals.ridge))
      ? Number(materialSignals.ridge)
      : (tile && Number.isFinite(Number(tile.ridgeStrength)) ? Number(tile.ridgeStrength) : 0),
    roughness: Number.isFinite(Number(materialSignals.surfaceRoughness))
      ? Number(materialSignals.surfaceRoughness)
      : (Number.isFinite(Number(detail.roughness)) ? Number(detail.roughness) : 0),
    terrainSlope: Number.isFinite(Number(detail.slope)) ? Number(detail.slope) : 0,
    terrainHillshade: Number.isFinite(Number(detail.hillshade)) ? Number(detail.hillshade) : 0.55,
    coastFactor: Number.isFinite(Number(materialSignals.coast))
      ? Number(materialSignals.coast)
      : (tile && Number.isFinite(Number(tile.coastFactor)) ? Number(tile.coastFactor) : 0),
    shallowWater: Number.isFinite(Number(materialSignals.shallowWater))
      ? Number(materialSignals.shallowWater)
      : (tile && Number.isFinite(Number(tile.shallowWater)) ? Number(tile.shallowWater) : 0),
    shelfStrength: Number.isFinite(Number(materialSignals.shelfStrength))
      ? Number(materialSignals.shelfStrength)
      : (tile && Number.isFinite(Number(tile.shelfStrength)) ? Number(tile.shelfStrength) : 0),
    riverStrength: Number.isFinite(Number(materialSignals.river))
      ? Number(materialSignals.river)
      : (tile && Number.isFinite(Number(tile.riverStrength)) ? Number(tile.riverStrength) : 0)
  };
  var noise = {
    regional: Number.isFinite(Number(detail.meterNoise))
      ? Number(detail.meterNoise)
      : (Number.isFinite(Number(detail.elevation)) ? Number(detail.elevation) : 0.5),
    fine: Number.isFinite(Number(detail.microNoise))
      ? Number(detail.microNoise)
      : (Number.isFinite(Number(detail.roughness)) ? Number(detail.roughness) : 0.5)
  };
  var band = getPlanetLandformTerrainBand(biome, signals, noise, Number(sample && sample.latitude) || Number(tile.latitude) || 0);
  var strongSurfaceScale = 1;
  var scaleAmount = sampleMeters <= 1 ? 0.68 : (sampleMeters <= 5 ? 0.54 : 0.38);

  if (surface === "whitecap" || surface === "deep water" || surface === "ridge ice" || surface === "snow") {
    strongSurfaceScale = 0.18;
  } else if (surface === "open water" || surface === "rock" || surface === "stone" || surface === "ice") {
    strongSurfaceScale = 0.46;
  } else if (surface === "sand" || surface === "dune") {
    strongSurfaceScale = 0.78;
  }

  return {
    color: band.color,
    amount: clamp(band.amount * scaleAmount * strongSurfaceScale, 0, 0.18),
    relief: band.relief,
    bandNoise: band.bandNoise,
    surfaceScale: strongSurfaceScale
  };
};

PS.render.surfaceColor.getMaterialStrataTint = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var strata = detail.materialStrata || null;
  var surface = detail.surface || "ground";
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var closeScale = sampleMeters <= 1 ? 1 : (sampleMeters <= 5 ? 0.72 : (sampleMeters <= 25 ? 0.34 : 0));
  var strongSurfaceScale = 1;
  var amount;

  if (!strata || closeScale <= 0) {
    return {
      color: "#000000",
      amount: 0
    };
  }

  if (surface === "whitecap" || surface === "deep water" || surface === "snow" || surface === "ice") {
    strongSurfaceScale = 0.38;
  } else if (surface === "open water" || surface === "ridge ice") {
    strongSurfaceScale = 0.58;
  } else if (surface === "rock" || surface === "stone" || surface === "sand" || surface === "dune") {
    strongSurfaceScale = 0.86;
  }

  amount = clamp(
    (
      0.05 +
        (Number(strata.granularity) || 0) * 0.05 +
        (Number(strata.organicCover) || 0) * 0.04 +
        (Number(strata.rockExposure) || 0) * 0.04 +
        (Number(strata.depthMix) || 0) * 0.03
    ) * closeScale * strongSurfaceScale,
    0,
    0.18
  );

  return {
    color: strata.tintColor || "#6c6552",
    amount: amount
  };
};

PS.render.surfaceColor.getSurfaceColor = function (sample) {
  var biome = sample && sample.biome ? sample.biome : "unknown";
  var detail = sample && sample.detail ? sample.detail : null;
  var baseColor = PS.render.terrain.getBiomeColor(biome);

  if (!detail) {
    return baseColor;
  }

  var shade = clamp(
    (Number(detail.shade) || 0.5) * 0.54 +
      (Number(detail.elevation) || 0.5) * 0.12 +
      (Number(detail.roughness) || 0) * 0.08 +
      (Number(detail.hillshade) || 0.5) * 0.26,
    0,
    1
  );
  var heightMeters = Number(detail.heightMeters) || 0;
  var slope = clamp(Number(detail.slope) || 0, 0, 1);
  var highland = clamp((heightMeters - 900) / 2600, 0, 1);
  var materialSignals = detail.materialSignals || {};
  var snowLine = Number.isFinite(Number(materialSignals.snow))
    ? clamp(Number(materialSignals.snow), 0, 1)
    : (biome === "ice" ? 0.35 : clamp((heightMeters - 1800) / 2200, 0, 1));
  var shadow = clamp(1 - (Number(detail.hillshade) || 0.5), 0, 1);
  var river = sample && sample.tile ? clamp(Number(sample.tile.riverStrength) || 0, 0, 1) : 0;
  var coast = sample && sample.tile ? clamp(Number(sample.tile.coastFactor) || 0, 0, 1) : 0;
  var shallowWater = sample && sample.tile ? clamp(Number(sample.tile.shallowWater) || 0, 0, 1) : 0;
  var reliefShade = clamp(shade + highland * 0.08 - shadow * 0.10, 0, 1);
  var color;

  if (detail.surface === "whitecap") {
    color = "#b7e9f4";
  } else if (detail.surface === "open water") {
    color = blendHexColors("#08365f", "#16658a", clamp((heightMeters + 4200) / 4200, 0, 1));
  } else if (detail.surface === "deep water") {
    color = "#020b1f";
  } else if (detail.surface === "clearing" || detail.surface === "meadow") {
    color = blendHexColors(PS.render.terrain.getBaseBiomeColor("forest"), "#7c8f3e", clamp(Number(detail.roughness) || 0, 0, 1) * 0.22);
  } else if (detail.surface === "dense canopy") {
    color = blendHexColors(PS.render.terrain.getBaseBiomeColor("forest"), "#000000", 0.38);
  } else if (detail.surface === "woodland") {
    color = PS.render.terrain.getBaseBiomeColor("forest");
  } else if (detail.surface === "brush") {
    color = "#346337";
  } else if (detail.surface === "grass") {
    color = PS.render.terrain.getBaseBiomeColor("grassland");
  } else if (detail.surface === "rock" || detail.surface === "stone") {
    color = blendHexColors("#454640", "#7c7b6f", slope * 0.55);
  } else if (detail.surface === "dune" || detail.surface === "sand") {
    color = blendHexColors("#755f2d", "#b9964e", clamp(1 - slope, 0, 1) * 0.35);
  } else if (detail.surface === "scrub" || detail.surface === "moss") {
    color = "#334739";
  } else if (detail.surface === "ridge ice" || detail.surface === "ice") {
    color = blendHexColors("#9cc8d8", "#eaf6f8", slope * 0.32);
  } else if (detail.surface === "snow") {
    color = "#e5f3f7";
  } else {
    color = baseColor;
  }

  if (biome === "ocean") {
    color = blendHexColors(color, "#7fb7a7", shallowWater * 0.34);
  } else {
    color = blendHexColors(color, "#1d5265", river * 0.46);
    color = blendHexColors(color, "#aaa05e", coast * 0.16);
  }

  color = blendHexColors(color, "#56544c", slope * 0.26);
  color = blendHexColors(color, "#f1f6f4", snowLine * 0.48);
  var terrainBandTint = PS.render.surfaceColor.getLocalTerrainBandTint(sample);
  color = blendHexColors(color, terrainBandTint.color, terrainBandTint.amount);
  var strataTint = PS.render.surfaceColor.getMaterialStrataTint(sample);
  color = blendHexColors(color, strataTint.color, strataTint.amount);
  color = PS.render.surfaceColor.blendWithTileBlend(sample, color);
  return shadeHexColor(color, reliefShade);
};

// ── Packed-color fast path ─────────────────────────────────────────
// All hex constants pre-parsed to uint32. Zero string allocation in the
// entire getSurfaceColorPacked() call chain.

// Pre-parsed surface color constants — MUST match terrain.js defaultBiomeColors.
// Pixeldarium-original terrain palette for runtime rendering.
PS.render.surfaceColor._pc = {
  // Water surfaces
  whitecap:      0xd0e8f0,   // bright sea foam
  deepOcean:     0x263d61,   // deep blue water
  shallowOcean:  0x4a7f91,   // shallow blue-green water
  deepWater:     0x2a3855,   // very deep ocean shadow
  // Vegetation surfaces
  clearingDark:  0x3f7138,   // cool forest clearing
  clearingLight: 0x5a8830,   // lighter forest clearing
  denseCanopy:   0x1e3a0a,   // very dark forest interior
  woodland:      0x3f7138,   // woodland canopy
  brush:         0x557820,   // mid scrub
  grass:         0x5f8a45,   // open grassland
  // Rock surfaces
  rockDark:      0x4e545b,   // cool basalt shadow
  rockLight:     0x706a5a,   // lighter rock face
  // Sand surfaces
  sandDark:      0x7b6038,   // dry soil shadow
  sandLight:     0xc6aa68,   // sunlit dry soil
  // Cold surfaces
  scrub:         0x4a5545,   // cold scrub tundra
  iceDark:       0x8eb5c8,   // ice shadow
  iceLight:      0xd6edf3,   // snow peak
  snow:          0xe8edf5,   // bright snow
  // Overlay tints
  slopeGray:     0x505762,   // steep slope gray
  snowWhite:     0xf2f5f8,   // snow blend white
  riverBlue:     0x347b88,   // river blue-green
  coastYellow:   0xb7ad6e,   // shoreline reed tint
  shallowTeal:   0x648c8c    // lake teal
};
PS.render.surfaceColor._surfacePaletteVersion = -1;

PS.render.surfaceColor.refreshSurfacePaletteCache = function () {
  var version = PS.assets && typeof PS.assets.getPaletteVersion === "function"
    ? PS.assets.getPaletteVersion("terrain")
    : 0;
  var pc = PS.render.surfaceColor._pc;
  var terrain = PS.render.terrain;

  if (PS.render.surfaceColor._surfacePaletteVersion === version) {
    return;
  }

  pc.woodland = terrain.getBiomePackedColor("forest");
  pc.denseCanopy = terrain.blendPacked(pc.woodland, 0x000000, 0.38);
  pc.clearingDark = pc.woodland;
  pc.grass = terrain.getBiomePackedColor("grassland");
  pc.deepOcean = terrain.getBiomePackedColor("ocean");
  PS.render.surfaceColor._surfacePaletteVersion = version;
};

PS.render.surfaceColor.getSurfaceColorPacked = function (sample) {
  PS.render.surfaceColor.refreshSurfacePaletteCache();

  var pc = PS.render.surfaceColor._pc;
  var blend = PS.render.terrain.blendPacked;
  var shade = PS.render.terrain.shadePacked;
  var hexToPacked = PS.render.terrain.hexToPacked;
  var biome = sample && sample.biome ? sample.biome : "unknown";
  var detail = sample && sample.detail ? sample.detail : null;
  var baseColor = PS.render.terrain.getBiomePackedColorTinted(biome);

  if (!detail) {
    return baseColor;
  }

  var reliefShade = clamp(
    (Number(detail.shade) || 0.5) * 0.54 +
      (Number(detail.elevation) || 0.5) * 0.12 +
      (Number(detail.roughness) || 0) * 0.08 +
      (Number(detail.hillshade) || 0.5) * 0.26,
    0, 1
  );
  var heightMeters = Number(detail.heightMeters) || 0;
  var slope = clamp(Number(detail.slope) || 0, 0, 1);
  var materialSignals = detail.materialSignals || {};
  var snowLine = Number.isFinite(Number(materialSignals.snow))
    ? clamp(Number(materialSignals.snow), 0, 1)
    : (biome === "ice" ? 0.35 : clamp((heightMeters - 1800) / 2200, 0, 1));
  var shadow = clamp(1 - (Number(detail.hillshade) || 0.5), 0, 1);
  var river = sample && sample.tile ? clamp(Number(sample.tile.riverStrength) || 0, 0, 1) : 0;
  var coast = sample && sample.tile ? clamp(Number(sample.tile.coastFactor) || 0, 0, 1) : 0;
  var shallowWater = sample && sample.tile ? clamp(Number(sample.tile.shallowWater) || 0, 0, 1) : 0;
  var highland = clamp((heightMeters - 900) / 2600, 0, 1);
  var finalShade = clamp(reliefShade + highland * 0.08 - shadow * 0.10, 0, 1);
  var color;
  var surface = detail.surface;

  if (surface === "whitecap") {
    color = pc.whitecap;
  } else if (surface === "open water") {
    color = blend(pc.deepOcean, pc.shallowOcean, clamp((heightMeters + 4200) / 4200, 0, 1));
  } else if (surface === "deep water") {
    color = pc.deepWater;
  } else if (surface === "clearing" || surface === "meadow") {
    color = blend(pc.clearingDark, pc.clearingLight, clamp(Number(detail.roughness) || 0, 0, 1) * 0.22);
  } else if (surface === "dense canopy") {
    color = pc.denseCanopy;
  } else if (surface === "woodland") {
    color = pc.woodland;
  } else if (surface === "brush") {
    color = pc.brush;
  } else if (surface === "grass") {
    color = pc.grass;
  } else if (surface === "rock" || surface === "stone") {
    color = blend(pc.rockDark, pc.rockLight, slope * 0.55);
  } else if (surface === "dune" || surface === "sand") {
    color = blend(pc.sandDark, pc.sandLight, clamp(1 - slope, 0, 1) * 0.35);
  } else if (surface === "scrub" || surface === "moss") {
    color = pc.scrub;
  } else if (surface === "ridge ice" || surface === "ice") {
    color = blend(pc.iceDark, pc.iceLight, slope * 0.32);
  } else if (surface === "snow") {
    color = pc.snow;
  } else {
    color = baseColor;
  }

  if (biome === "ocean") {
    color = blend(color, pc.shallowTeal, shallowWater * 0.34);
  } else {
    color = blend(color, pc.riverBlue, river * 0.46);
    color = blend(color, pc.coastYellow, coast * 0.16);
  }

  color = blend(color, pc.slopeGray, slope * 0.26);
  color = blend(color, pc.snowWhite, snowLine * 0.48);

  // Terrain band tint (packed path)
  var terrainBand = PS.render.surfaceColor.getLocalTerrainBandTintPacked(sample);
  if (terrainBand.amount > 0.001) {
    color = blend(color, terrainBand.color, terrainBand.amount);
  }

  // Material strata tint (packed path)
  var strata = PS.render.surfaceColor.getMaterialStrataTintPacked(sample);
  if (strata.amount > 0.001) {
    color = blend(color, strata.color, strata.amount);
  }

  // Tile blend transition (packed path)
  color = PS.render.surfaceColor.blendWithTileBlendPacked(sample, color);

  return shade(color, finalShade);
};

PS.render.surfaceColor._defaultStrataPacked = { color: 0x6c6552, amount: 0 };

PS.render.surfaceColor.getMaterialStrataTintPacked = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var strata = detail.materialStrata || null;
  var surface = detail.surface || "ground";
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var closeScale = sampleMeters <= 1 ? 1 : (sampleMeters <= 5 ? 0.72 : (sampleMeters <= 25 ? 0.34 : 0));
  var strongSurfaceScale = 1;
  var amount;

  if (!strata || closeScale <= 0) {
    return PS.render.surfaceColor._defaultStrataPacked;
  }

  if (surface === "whitecap" || surface === "deep water" || surface === "snow" || surface === "ice") {
    strongSurfaceScale = 0.38;
  } else if (surface === "open water" || surface === "ridge ice") {
    strongSurfaceScale = 0.58;
  } else if (surface === "rock" || surface === "stone" || surface === "sand" || surface === "dune") {
    strongSurfaceScale = 0.86;
  }

  amount = clamp(
    (0.05 + (Number(strata.granularity) || 0) * 0.05 +
      (Number(strata.organicCover) || 0) * 0.04 +
      (Number(strata.rockExposure) || 0) * 0.04 +
      (Number(strata.depthMix) || 0) * 0.03
    ) * closeScale * strongSurfaceScale, 0, 0.18
  );

  var tintColor = strata._tintPacked;
  if (typeof tintColor !== "number") {
    tintColor = strata.tintColor ? PS.render.terrain.hexToPacked(strata.tintColor) : 0x6c6552;
    strata._tintPacked = tintColor;
  }

  return { color: tintColor, amount: amount };
};

PS.render.surfaceColor.getLocalTerrainBandTintPacked = function (sample) {
  var detail = sample && sample.detail ? sample.detail : {};
  var materialSignals = detail.materialSignals || {};
  var tile = sample && sample.tile ? sample.tile : {};
  var biome = sample && sample.biome ? sample.biome : "unknown";
  var surface = detail.surface || "ground";
  var sampleMeters = Math.max(1, Number(sample && sample.surfaceSampleMeters) || Number(detail.sampleMeters) || 1);
  var elevationSignal = tile && Number.isFinite(Number(tile.elevation))
    ? Number(tile.elevation)
    : ((Number.isFinite(Number(detail.elevation)) ? Number(detail.elevation) : 0.5) - 0.5) * 2;
  var signals = {
    elevation: elevationSignal,
    moisture: tile && Number.isFinite(Number(tile.moisture))
      ? Number(tile.moisture)
      : clamp(Number.isFinite(Number(materialSignals.moisture)) ? Number(materialSignals.moisture) : 0.35, 0, 1) * 1.8,
    ridgeStrength: Number.isFinite(Number(materialSignals.ridge))
      ? Number(materialSignals.ridge)
      : (tile && Number.isFinite(Number(tile.ridgeStrength)) ? Number(tile.ridgeStrength) : 0),
    roughness: Number.isFinite(Number(materialSignals.surfaceRoughness))
      ? Number(materialSignals.surfaceRoughness)
      : (Number.isFinite(Number(detail.roughness)) ? Number(detail.roughness) : 0),
    terrainSlope: Number.isFinite(Number(detail.slope)) ? Number(detail.slope) : 0,
    terrainHillshade: Number.isFinite(Number(detail.hillshade)) ? Number(detail.hillshade) : 0.55,
    coastFactor: Number.isFinite(Number(materialSignals.coast))
      ? Number(materialSignals.coast)
      : (tile && Number.isFinite(Number(tile.coastFactor)) ? Number(tile.coastFactor) : 0),
    shallowWater: Number.isFinite(Number(materialSignals.shallowWater))
      ? Number(materialSignals.shallowWater)
      : (tile && Number.isFinite(Number(tile.shallowWater)) ? Number(tile.shallowWater) : 0),
    shelfStrength: Number.isFinite(Number(materialSignals.shelfStrength))
      ? Number(materialSignals.shelfStrength)
      : (tile && Number.isFinite(Number(tile.shelfStrength)) ? Number(tile.shelfStrength) : 0),
    riverStrength: Number.isFinite(Number(materialSignals.river))
      ? Number(materialSignals.river)
      : (tile && Number.isFinite(Number(tile.riverStrength)) ? Number(tile.riverStrength) : 0)
  };
  var noise = {
    regional: Number.isFinite(Number(detail.meterNoise))
      ? Number(detail.meterNoise)
      : (Number.isFinite(Number(detail.elevation)) ? Number(detail.elevation) : 0.5),
    fine: Number.isFinite(Number(detail.microNoise))
      ? Number(detail.microNoise)
      : (Number.isFinite(Number(detail.roughness)) ? Number(detail.roughness) : 0.5)
  };
  var band = getPlanetLandformTerrainBand(biome, signals, noise, Number(sample && sample.latitude) || Number(tile.latitude) || 0);
  var strongSurfaceScale = 1;
  var scaleAmount = sampleMeters <= 1 ? 0.68 : (sampleMeters <= 5 ? 0.54 : 0.38);

  if (surface === "whitecap" || surface === "deep water" || surface === "ridge ice" || surface === "snow") {
    strongSurfaceScale = 0.18;
  } else if (surface === "open water" || surface === "rock" || surface === "stone" || surface === "ice") {
    strongSurfaceScale = 0.46;
  } else if (surface === "sand" || surface === "dune") {
    strongSurfaceScale = 0.78;
  }

  var bandColorPacked = band._colorPacked;
  if (typeof bandColorPacked !== "number") {
    bandColorPacked = PS.render.terrain.hexToPacked(band.color);
    band._colorPacked = bandColorPacked;
  }

  return {
    color: bandColorPacked,
    amount: clamp(band.amount * scaleAmount * strongSurfaceScale, 0, 0.18),
    relief: band.relief,
    bandNoise: band.bandNoise,
    surfaceScale: strongSurfaceScale
  };
};

PS.render.surfaceColor.blendWithTileBlendPacked = function (sample, packedColor) {
  var detail = sample && sample.detail ? sample.detail : {};
  var surface = detail.surface || "";
  var transitionStrength = PS.render.surfaceColor.getBiomeTransitionStrength(sample);
  var strongSurfaceScale = 1;

  if (transitionStrength <= 0.01) {
    return packedColor;
  }

  var targetRgb = PS.render.surfaceColor.getTileBlendRgb(sample.tileBlend);
  if (!targetRgb) {
    return packedColor;
  }

  if (surface === "whitecap" || surface === "deep water" || surface === "ridge ice" || surface === "snow") {
    strongSurfaceScale = 0.18;
  } else if (surface === "open water" || surface === "rock" || surface === "stone") {
    strongSurfaceScale = 0.62;
  }

  var targetPacked = PS.render.terrain.packRgb(
    clamp(Math.round(targetRgb.red), 0, 255),
    clamp(Math.round(targetRgb.green), 0, 255),
    clamp(Math.round(targetRgb.blue), 0, 255)
  );

  return PS.render.terrain.blendPacked(
    packedColor, targetPacked,
    clamp(transitionStrength * 0.34 * strongSurfaceScale, 0, 0.34)
  );
};
