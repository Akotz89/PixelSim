require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/assets/sprite-sheet.js"), "utf8");
const context = {
  PS: { assets: {} },
  Number,
  Boolean,
  String,
  Array,
  Object,
  Math
};

vm.createContext(context);
vm.runInContext(source, context, { filename: "js/assets/sprite-sheet.js" });

const sheet = context.PS.assets.SpriteSheet.fromTexturePacker({ width: 96, height: 32 }, {
  frames: [{
    filename: "grass",
    frame: { x: 0, y: 0, w: 32, h: 32 },
    normalFrame: { x: 32, y: 0, w: 32, h: 32 },
    materialFrame: { x: 64, y: 0, w: 32, h: 32 },
    normalOffset: [32, 0],
    materialOffset: [64, 0]
  }],
  meta: {
    splitAtlas: true,
    normalOffsetX: 32,
    materialOffsetX: 64,
    materialChannels: {
      r: "height",
      g: "roughness",
      b: "emissive",
      a: "coverage"
    }
  }
});

const cell = sheet.getCell("grass");
assert.ok(cell, "sprite sheet should expose the packed material cell");
assert.strictEqual(cell.splitAtlas, true, "cell should preserve split normal atlas status");
assert.strictEqual(cell.normalX, 32, "cell should preserve explicit normal rect x");
assert.strictEqual(cell.normalW, 32, "cell should preserve explicit normal rect width");
assert.strictEqual(cell.materialX, 64, "cell should preserve explicit material rect x");
assert.strictEqual(cell.materialW, 32, "cell should preserve explicit material rect width");
assert.deepStrictEqual(cell.materialChannels, {
  r: "height",
  g: "roughness",
  b: "emissive",
  a: "coverage"
}, "cell should preserve packed material channel semantics");

console.log("sprite sheet material metadata checks passed");
