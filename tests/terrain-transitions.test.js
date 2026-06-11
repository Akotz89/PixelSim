const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const root = path.resolve(__dirname, "..");
const registrySource = fs.readFileSync(path.join(root, "js/core/tile-registry.js"), "utf8");
const resolverSource = fs.readFileSync(path.join(root, "js/render/terrain-transitions.js"), "utf8");
const transitionsSidecarSource = fs.readFileSync(path.join(root, "data/transitions.json.js"), "utf8");
const tilesData = JSON.parse(fs.readFileSync(path.join(root, "data/tiles.json"), "utf8"));
const transitionsData = JSON.parse(fs.readFileSync(path.join(root, "data/transitions.json"), "utf8"));

function createGrid(width, height, fill) {
  const tiles = new Array(width * height).fill(fill);
  return {
    width,
    height,
    revision: 1,
    tiles,
    getTileId(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        return null;
      }
      return tiles[y * width + x];
    },
    setTileId(x, y, id) {
      tiles[y * width + x] = id;
      this.revision += 1;
    }
  };
}

const sidecarContext = {
  PS: {
    assets: {
      captured: {},
      registerJSON(url, data) {
        this.captured[url] = data;
      }
    }
  }
};
vm.createContext(sidecarContext);
vm.runInContext(transitionsSidecarSource, sidecarContext, { filename: "data/transitions.json.js" });
assert.strictEqual(
  JSON.stringify(sidecarContext.PS.assets.captured["data/transitions.json"]),
  JSON.stringify(transitionsData),
  "transitions sidecar should match transitions JSON"
);

const context = {
  PS: {
    core: {},
    render: {}
  },
  Map,
  Array,
  Object,
  String,
  Number,
  Error,
  RegExp,
  Math,
  WeakMap,
  Uint8Array
};
vm.createContext(context);
vm.runInContext(registrySource, context, { filename: "js/core/tile-registry.js" });
vm.runInContext(resolverSource, context, { filename: "js/render/terrain-transitions.js" });

const registry = context.PS.core.TileRegistry;
registry.loadFromJSON(tilesData);
const Resolver = context.PS.render.TerrainTransitionResolver;
const resolver = new Resolver(registry, transitionsData);
const bits = Resolver.BITS;
const Autotile = context.PS.render.Autotile;

assert.strictEqual(Autotile.computeAutotileMask(0, 0, null), 0, "missing matchFn should produce empty autotile mask");

function makeOrthogonalMatch(mask) {
  return function(x, y, direction) {
    if (direction === "N") { return (mask & Autotile.ORTHO_BITS.N) !== 0; }
    if (direction === "E") { return (mask & Autotile.ORTHO_BITS.E) !== 0; }
    if (direction === "S") { return (mask & Autotile.ORTHO_BITS.S) !== 0; }
    if (direction === "W") { return (mask & Autotile.ORTHO_BITS.W) !== 0; }
    return true;
  };
}

function makeCornerMatch(cornerMask) {
  return function(x, y, direction) {
    if (direction === "NE") { return (cornerMask & 1) === 0; }
    if (direction === "SE") { return (cornerMask & 2) === 0; }
    if (direction === "SW") { return (cornerMask & 4) === 0; }
    if (direction === "NW") { return (cornerMask & 8) === 0; }
    return true;
  };
}

for (let mask = 0; mask < 16; mask += 1) {
  const computed = Autotile.computeAutotileMask(8, 8, makeOrthogonalMatch(mask));
  assert.strictEqual(Autotile.getOrthogonalMask(computed), mask, "orthogonal autotile mask should preserve config " + mask);
  assert.strictEqual(Autotile.getCornerMask(computed), 0, "matching diagonals should not create corner mask for config " + mask);
}

for (let cornerMask = 0; cornerMask < 16; cornerMask += 1) {
  const computed = Autotile.computeAutotileMask(8, 8, makeCornerMatch(cornerMask));
  assert.strictEqual(Autotile.getOrthogonalMask(computed), 15, "corner fixtures should keep all orthogonal neighbors");
  assert.strictEqual(Autotile.getCornerMask(computed), cornerMask, "corner autotile mask should preserve config " + cornerMask);
}

assert.strictEqual(
  Autotile.computeAutotileMask(0, 0, function(x, y, direction) {
    return direction === "NE";
  }),
  0,
  "diagonal corners should be gated by both adjacent orthogonal neighbors"
);

const variant = Autotile.getVariant(3, 4, function(x, y) {
  return (x * 17 + y * 31) >>> 0;
});
assert.strictEqual(variant, Autotile.getVariant(3, 4, function(x, y) {
  return (x * 17 + y * 31) >>> 0;
}), "autotile variant should be stable for the same RANMAP value");
assert.strictEqual(Autotile.getAtlasOffset(Autotile.ORTHO_BITS.N | Autotile.ORTHO_BITS.E, variant), variant * 16 + 3, "atlas offset should use 2-bit variant and 4-bit orthogonal mask");

context.PS.ranmap = {
  get(x, y) {
    return (x * 101 + y * 17 + 2) >>> 0;
  }
};
assert.strictEqual(Autotile.getVariant(5, 7), Autotile.getVariant(5, 7), "RANMAP-backed variant should be stable");
assert.ok(Autotile.getVariant(5, 7) >= 0 && Autotile.getVariant(5, 7) <= 3, "RANMAP-backed variant should be constrained to 2 bits");

const storeGrid = createGrid(5, 5, "grass_lush");
const storeMatch = Autotile.createMatchFn(storeGrid, "same-terrain", { tileRegistry: registry });
const store = new Autotile.MaskStore(5, 5, storeMatch, {
  ranFn: function(x, y) {
    return (x * 13 + y * 29) >>> 0;
  }
});
store.recomputeAll();
assert.strictEqual(store.recomputeCount, 25, "full precompute should visit each tile once");
assert.strictEqual(store.getMask(2, 2), 15, "uniform center tile should match all orthogonal neighbors");
storeGrid.setTileId(2, 2, "water_shallow");
const beforePartial = store.recomputeCount;
const updates = store.recomputeChanged(2, 2);
assert.strictEqual(store.recomputeCount - beforePartial, 9, "tile change should recompute only the 3x3 affected neighborhood");
assert.strictEqual(updates.length, 9, "interior tile change should report 9 affected masks");
assert.strictEqual(store.getMask(2, 2), 0, "changed center tile should no longer match grass neighbors");
assert.strictEqual(store.getVariant(2, 2), ((2 * 13 + 2 * 29) & 3), "store should keep stable 2-bit variants");
assert.strictEqual(store.getAtlasOffset(2, 2), store.getVariant(2, 2) * 16, "store atlas offset should use saved mask and variant");

const beforeCornerPartial = store.recomputeCount;
const edgeUpdates = store.recomputeChanged(0, 0);
assert.strictEqual(store.recomputeCount - beforeCornerPartial, 4, "corner tile change should only recompute in-bounds affected masks");
assert.strictEqual(edgeUpdates.length, 4, "corner tile change should report only in-bounds masks");

const presetRegistry = {
  get(id) {
    return {
      grass_lush: { category: "terrain", waterDepth: 0 },
      water_shallow: { category: "terrain", waterDepth: 0.4 },
      ice_sheet: { category: "terrain", biome: "ice", waterDepth: 0 },
      stone_wall: { category: "wall", waterDepth: 0 },
      room_floor: { category: "floor", waterDepth: 0 }
    }[id] || null;
  }
};
const presetGrid = createGrid(5, 1, "grass_lush");
presetGrid.setTileId(0, 0, "water_shallow");
presetGrid.setTileId(1, 0, "ice_sheet");
presetGrid.setTileId(2, 0, "stone_wall");
presetGrid.setTileId(3, 0, "room_floor");
presetGrid.setTileId(4, 0, "grass_lush");
assert.strictEqual(Autotile.createMatchFn(presetGrid, "water", { tileRegistry: presetRegistry })(0, 0, "N", 4, 0), true, "water preset should match water tiles");
assert.strictEqual(Autotile.createMatchFn(presetGrid, "ice", { tileRegistry: presetRegistry })(1, 0, "N", 4, 0), true, "ice preset should match ice tiles");
assert.strictEqual(Autotile.createMatchFn(presetGrid, "wall", { tileRegistry: presetRegistry })(2, 0, "N", 4, 0), true, "wall preset should match wall tiles");
assert.strictEqual(Autotile.createMatchFn(presetGrid, "floor", { tileRegistry: presetRegistry })(3, 0, "N", 4, 0), true, "floor preset should match floor tiles");
assert.strictEqual(Autotile.createMatchFn(presetGrid, "same-terrain", { tileRegistry: presetRegistry })(4, 0, "N", 4, 0), true, "same-terrain preset should match identical tile IDs");

assert.ok(transitionsData.pairs.length >= 5, "transitions data should define required transition pairs");
assert.strictEqual(resolver.lookup.size, transitionsData.pairs.length * 2, "lookup should include forward and reverse pairs");
assert.ok(resolver.getPair("grass_lush", "sand"), "lookup should include grass to sand pair");
assert.ok(resolver.getPair("sand", "grass_lush"), "lookup should include reverse sand to grass pair");

const edgeGrid = createGrid(3, 3, "sand");
edgeGrid.setTileId(1, 1, "sand");
edgeGrid.setTileId(1, 0, "grass_lush");
let resolved = resolver.resolve(1, 1, edgeGrid);
assert.strictEqual(resolver.getNeighborMask(1, 1, "sand", edgeGrid), bits.N, "north neighbor should set N bit");
assert.strictEqual(resolver.maskToSpriteIndex(bits.N), 0, "N mask should map to north edge sprite");
assert.strictEqual(resolved.baseTile, "sand", "resolved base tile should match grid tile");
assert.ok(resolved.overlays.some((overlay) => overlay.spriteId === "transitions.grass_sand.0" && overlay.edge === "N"), "grass-sand north edge should produce transition overlay");

const cornerGrid = createGrid(3, 3, "sand");
cornerGrid.setTileId(1, 1, "sand");
cornerGrid.setTileId(2, 0, "grass_lush");
resolved = resolver.resolve(1, 1, cornerGrid);
assert.strictEqual(resolver.getNeighborMask(1, 1, "sand", cornerGrid), bits.NE, "diagonal neighbor should set NE bit");
assert.strictEqual(resolver.maskToSpriteIndex(bits.NE), 4, "NE diagonal should map to outer corner sprite");
assert.ok(resolved.overlays.some((overlay) => overlay.spriteIndex === 4 && overlay.edge === "NE"), "NE diagonal should produce outer corner overlay");

const innerGrid = createGrid(3, 3, "sand");
innerGrid.setTileId(1, 1, "sand");
innerGrid.setTileId(1, 0, "grass_lush");
innerGrid.setTileId(2, 1, "grass_lush");
resolved = resolver.resolve(1, 1, innerGrid);
assert.strictEqual(
  resolver.getNeighborMask(1, 1, "sand", innerGrid) & (bits.N | bits.E | bits.NE),
  bits.N | bits.E,
  "missing diagonal with N/E neighbors should form inner corner mask"
);
assert.ok(resolved.overlays.some((overlay) => overlay.spriteIndex === 8 && overlay.edge === "innerNE"), "N+E without NE should produce inner corner overlay");

const noOverlay = resolver.resolve(1, 1, createGrid(3, 3, "grass_lush"));
assert.strictEqual(noOverlay.overlays.length, 0, "uniform terrain should produce no transition overlays");

const cacheGrid = createGrid(3, 3, "sand");
cacheGrid.setTileId(1, 0, "grass_lush");
const beforeChange = resolver.resolve(1, 1, cacheGrid);
cacheGrid.setTileId(1, 0, "water_shallow");
const afterChange = resolver.resolve(1, 1, cacheGrid);
assert.notStrictEqual(beforeChange.overlays[0].to, afterChange.overlays[0].to, "revision change should invalidate cached transition result");

const largeGrid = createGrid(40, 25, "sand");
for (let y = 0; y < 25; y += 1) {
  for (let x = 0; x < 40; x += 1) {
    if ((x + y) % 7 === 0) {
      largeGrid.setTileId(x, y, "grass_lush");
    } else if ((x * 3 + y) % 11 === 0) {
      largeGrid.setTileId(x, y, "water_shallow");
    }
  }
}
resolver.invalidate();
resolver.resolveChunk(largeGrid, 40, 25);
const start = performance.now();
resolver.resolveChunk(largeGrid, 40, 25);
const elapsed = performance.now() - start;
assert.ok(elapsed < 1, "cached transition resolution for 1000 tiles should be under 1ms; got " + elapsed.toFixed(3) + "ms");
assert.ok(resolver.cacheHits >= 1000, "second chunk pass should use cached transition resolutions");

console.log("terrain transition checks passed", JSON.stringify({ elapsedMs: Number(elapsed.toFixed(3)), cacheHits: resolver.cacheHits }));
