const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const vm = require("vm");
const { performance } = require("perf_hooks");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/assets/sprite-sheet.js"), "utf8");

const context = {
  PS: {
    assets: {},
    events: {
      types: {
        ATLAS_REBUILT: "atlas.rebuilt"
      },
      emitted: [],
      emit: function(name, payload) {
        this.emitted.push({ name, payload });
      }
    }
  },
  Buffer: Buffer,
  Uint8Array: Uint8Array,
  Number: Number,
  Math: Math,
  Object: Object,
  Array: Array,
  String: String,
  Error: Error
};
const image = { id: "sheet" };

vm.createContext(context);
vm.runInContext(source, context, { filename: "js/assets/sprite-sheet.js" });

function plainCell(cell) {
  return {
    name: cell.name,
    x: cell.x,
    y: cell.y,
    w: cell.w,
    h: cell.h,
    image: cell.image
  };
}

const SpriteSheet = context.PS.assets.SpriteSheet;
const TileSheetPacker = context.PS.assets.TileSheetPacker;
const TileSheet = context.PS.assets.TileSheet;

const gridNames = [];
for (let index = 0; index < 32; index += 1) {
  gridNames.push("grass_" + index);
}
const gridSheet = SpriteSheet.fromGrid(image, {
  type: "grid",
  tileWidth: 32,
  tileHeight: 32,
  columns: 8,
  rows: 4,
  names: gridNames
});

assert.strictEqual(gridSheet.format, "grid", "grid parser should label format");
assert.strictEqual(gridSheet.getCells().length, 32, "8x4 grid should produce 32 cells");
assert.deepStrictEqual(
  plainCell(gridSheet.getCell("grass_0")),
  { name: "grass_0", x: 0, y: 0, w: 32, h: 32, image: image },
  "first grid cell should start at origin"
);
assert.deepStrictEqual(
  plainCell(gridSheet.getCell("grass_9")),
  { name: "grass_9", x: 32, y: 32, w: 32, h: 32, image: image },
  "grid cell should use column and row coordinates"
);
assert.deepStrictEqual(
  plainCell(gridSheet.getCell("grass_31")),
  { name: "grass_31", x: 224, y: 96, w: 32, h: 32, image: image },
  "last 8x4 grid cell should be at column 7 row 3"
);

const textureSheet = SpriteSheet.fromTexturePacker(image, {
  frames: {
    grass_0: { frame: { x: 0, y: 0, w: 32, h: 32 } },
    grass_1: { frame: { x: 40, y: 8, w: 16, h: 24 } }
  }
});

assert.strictEqual(textureSheet.format, "texturepacker", "TexturePacker parser should label format");
assert.deepStrictEqual(
  plainCell(textureSheet.getCell("grass_1")),
  { name: "grass_1", x: 40, y: 8, w: 16, h: 24, image: image },
  "TexturePacker frame hash should parse frame coordinates"
);

const asepriteSheet = SpriteSheet.fromAseprite(image, {
  frames: {
    walk_0: { frame: { x: 0, y: 0, w: 16, h: 24 }, duration: 80 },
    walk_1: { frame: { x: 16, y: 0, w: 16, h: 24 }, duration: 100 },
    idle_0: { frame: { x: 32, y: 0, w: 16, h: 24 }, duration: 200 }
  },
  meta: {
    frameTags: [
      { name: "walk", from: 0, to: 1, direction: "forward" },
      { name: "idle", from: 2, to: 2, direction: "forward" }
    ]
  }
});
const walk = asepriteSheet.getAnimation("walk");

assert.strictEqual(asepriteSheet.format, "aseprite", "Aseprite parser should label format");
assert.ok(walk, "Aseprite parser should expose frame tag animation");
assert.strictEqual(walk.frames.length, 2, "walk tag should include frames from tag range");
assert.strictEqual(walk.frames[0].cell.name, "walk_0", "animation frame should reference parsed cell");
assert.strictEqual(walk.frames[0].duration, 80, "animation frame should keep duration");
assert.strictEqual(walk.direction, "forward", "animation should keep frame tag direction");
assert.strictEqual(asepriteSheet.getAnimation("idle").frames[0].cell.name, "idle_0", "single-frame tag should parse");

assert.strictEqual(SpriteSheet.detect(image, { type: "grid", tileWidth: 1, tileHeight: 1, columns: 1, rows: 1 }).format, "grid");
assert.strictEqual(SpriteSheet.detect(image, { frames: { a: { frame: { x: 0, y: 0, w: 1, h: 1 } } } }).format, "texturepacker");
assert.strictEqual(
  SpriteSheet.detect(image, {
    frames: { a: { frame: { x: 0, y: 0, w: 1, h: 1 }, duration: 50 } },
    meta: { frameTags: [{ name: "a", from: 0, to: 0 }] }
  }).format,
  "aseprite"
);
assert.throws(function() {
  SpriteSheet.detect(image, {});
}, /Unknown sprite sheet format/, "unknown format should throw");

function pixelData(width, height, fill) {
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const pixel = fill(x, y);

      data[offset] = pixel[0];
      data[offset + 1] = pixel[1];
      data[offset + 2] = pixel[2];
      data[offset + 3] = pixel[3];
    }
  }

  return {
    width: width,
    height: height,
    data: data
  };
}

const packSheet = SpriteSheet.fromGrid({ id: "source" }, {
  type: "grid",
  tileWidth: 2,
  tileHeight: 2,
  columns: 2,
  rows: 1,
  names: ["b", "a"]
});
const packPixels = pixelData(4, 2, function(x, y) {
  return [x + 1, y + 10, x + y + 20, 255];
});
const atlas = TileSheetPacker.pack([
  { id: "src", sheet: packSheet, pixelData: packPixels }
], {
  pageWidth: 4,
  pageHeight: 2
});

assert.deepStrictEqual(Array.from(atlas.order), ["src.a", "src.b"], "packer should produce deterministic sorted tile IDs");
assert.strictEqual(atlas.pages.length, 1, "two 2x2 cells should fit in one 4x2 page");
assert.deepStrictEqual(
  [atlas.cells["src.a"].x, atlas.cells["src.a"].y, atlas.cells["src.a"].w, atlas.cells["src.a"].h],
  [0, 0, 2, 2],
  "first sorted cell should be packed at integer origin"
);
assert.deepStrictEqual(
  [atlas.cells["src.b"].x, atlas.cells["src.b"].y, atlas.cells["src.b"].w, atlas.cells["src.b"].h],
  [2, 0, 2, 2],
  "second sorted cell should be packed tightly after first cell"
);
assert.deepStrictEqual(
  Array.from(atlas.pages[0].data.slice(0, 4)),
  [3, 10, 22, 255],
  "packer should copy source pixels into atlas page at integer coordinates"
);
assert.strictEqual(atlas.filter, "nearest", "atlas should request nearest filtering");

const multipageAtlas = TileSheetPacker.pack([
  { id: "src", sheet: packSheet, pixelData: packPixels }
], {
  pageWidth: 3,
  pageHeight: 2
});

assert.strictEqual(multipageAtlas.pages.length, 2, "packer should spill cells onto additional pages");
assert.strictEqual(multipageAtlas.cells["src.b"].pageIndex, 1, "spilled cells should record their page index");

const manifest = TileSheetPacker.toManifest(atlas);
const restored = TileSheetPacker.fromManifest(manifest, atlas.pages);

assert.deepStrictEqual(
  Array.from(manifest.cells["src.a"].rect),
  [0, 0, 2, 2],
  "manifest should expose JSON-safe pixel rects by tile ID"
);
assert.strictEqual(restored.cells["src.a"].x, 0, "manifest restoration should recover source x");
assert.strictEqual(restored.pages[0], atlas.pages[0], "manifest restoration should attach runtime pages");

const tileSheet = new TileSheet(restored);
const rendererCalls = [];
const renderer = {
  drawTileSheetCell: function(sheet, command) {
    rendererCalls.push({ sheet: sheet, command: Object.assign({}, command) });
  }
};
const command = tileSheet.render(renderer, "src.a", 12.4, 9.6, 2);
const secondCommand = tileSheet.render(renderer, "src.b", 1.2, 2.8, 1);

assert.strictEqual(command, secondCommand, "TileSheet.render should reuse one command object");
assert.deepStrictEqual(
  rendererCalls[0].command,
  {
    tileId: "src.a",
    pageIndex: 0,
    sourceX: 0,
    sourceY: 0,
    sourceW: 2,
    sourceH: 2,
    screenX: 12,
    screenY: 10,
    width: 4,
    height: 4,
    filter: "nearest"
  },
  "TileSheet.render should emit integer source and screen rects"
);
assert.strictEqual(tileSheet.getCell("missing"), null, "missing tile IDs should return null");
assert.strictEqual(tileSheet.render(renderer, "missing", 0, 0, 1), null, "missing tile IDs should not draw");

const previousVersion = tileSheet.version;
tileSheet.reload(multipageAtlas);
assert.strictEqual(tileSheet.version, previousVersion + 1, "reload should bump version for hot reload paths");
assert.strictEqual(
  context.PS.events.emitted.some(function(entry) {
    return entry.name === "atlas.rebuilt" && entry.payload.entryCount === 2;
  }),
  true,
  "reload should emit atlas rebuilt event when events are installed"
);

const start = performance.now();
for (let i = 0; i < 10000; i += 1) {
  tileSheet.render(null, i % 2 === 0 ? "src.a" : "src.b", i, i, 1);
}
const elapsed = performance.now() - start;
assert.ok(elapsed < 20, "10K TileSheet.render lookups should stay comfortably below one frame");

const { buildTileSheetAtlas } = require(path.join(root, "scripts/build-tile-sheet-atlas.js"));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixeldarium-tile-sheet-"));

try {
  const built = buildTileSheetAtlas({
    id: "terrain_tiles",
    outputDir: tempDir,
    pageWidth: 64,
    pageHeight: 64
  });

  assert.ok(fs.existsSync(path.join(tempDir, "terrain_tiles.json")), "build script should write atlas JSON manifest");
  assert.ok(fs.existsSync(path.join(tempDir, "terrain_tiles.json.js")), "build script should write JSON sidecar");
  assert.ok(fs.existsSync(path.join(tempDir, "terrain_tiles.page0.png")), "build script should write atlas PNG page");
  assert.ok(fs.existsSync(path.join(tempDir, "terrain_tiles.page0.rgba.json")), "build script should write atlas RGBA sidecar");
  assert.ok(built.atlas.stats.cellCount > 0, "build script should pack source sheet cells");
  assert.strictEqual(built.atlas.filter, "nearest", "build script manifest should preserve nearest filtering");
  assert.ok(built.atlas.cells["terrain_grass.terrain.grass.0"], "build script should index cells by tile ID");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("sprite sheet checks passed");
