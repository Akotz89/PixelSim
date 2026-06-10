const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const spatialSource = fs.readFileSync(path.join(root, "js/systems/spatial.js"), "utf8");

[
  "return getWrappedWorldX(",
  "return getClampedWorldY(",
  "return getTileManhattanDistance(",
  "return getWrappedBucketIndexes(",
  "return getClampedBucketIndexes("
].forEach(function(legacyHelperCall) {
  assert.strictEqual(
    spatialSource.indexOf(legacyHelperCall),
    -1,
    "PS.spatial should route world-grid math through PS.worldGrid instead of legacy helper call " + legacyHelperCall
  );
});

const context = {
  assert,
  console,
  performance: {
    now: () => Number(process.hrtime.bigint()) / 1000000
  },
  window: {
    addEventListener() {}
  },
  world: {
    seedText: "SPATIAL-TEST",
    rngState: 1
  }
};

const source = [
  "js/core/namespace.js",
  "config.js",
  "const WORLD_WIDTH = 320; const WORLD_HEIGHT = 170;",
  "js/core/utils.js",
  "js/core/config.js",
  "js/core/world-grid.js",
  "js/systems/spatial.js"
].map((file) => {
  if (file.endsWith(".js")) {
    return fs.readFileSync(path.join(root, file), "utf8");
  }

  return file;
}).join("\n");

vm.runInNewContext(`${source}

function sorted(values) {
  return values.slice().sort();
}

function makeEntityId(index) {
  return "entity:" + index;
}

function naiveQuery(entities, x, y, radius) {
  var results = [];

  for (var i = 0; i < entities.length; i++) {
    if (PS.spatial.tileDistance(x, y, entities[i].x, entities[i].y) <= radius) {
      results.push(entities[i].id);
    }
  }

  return results;
}

assert.strictEqual(PS.config.spatial.chunkSize, CONFIG.SPATIAL_CHUNK_SIZE, "spatial chunk size should come from config");
assert.strictEqual(PS.spatial.getChunkSize(), 16, "default chunk size should be 16");

PS.spatial.clear();

var alpha = PS.spatial.insert("alpha", 15, 15);
var beta = PS.spatial.insert("beta", 16, 15);
var gamma = PS.spatial.insert("gamma", -1, 169);
var delta = PS.spatial.insert("delta", 319, 0);

assert.strictEqual(alpha.chunkKey, "0:0", "alpha should land in the first chunk");
assert.strictEqual(beta.chunkKey, "1:0", "beta should cross into the next x chunk");
assert.strictEqual(gamma.x, 319, "negative x should wrap to the final tile");
assert.strictEqual(gamma.y, 169, "y should clamp to the final row");
assert.deepStrictEqual(sorted(PS.spatial.queryChunk(0, 0)), ["alpha"], "queryChunk should return ids in the requested chunk");
assert.deepStrictEqual(sorted(PS.spatial.queryChunk(-1, 0)), ["delta"], "queryChunk should wrap x chunks");

assert.deepStrictEqual(sorted(PS.spatial.queryRadius(15, 15, 1)), ["alpha", "beta"], "radius query should cross chunk boundaries");
assert.deepStrictEqual(sorted(PS.spatial.queryRadius(0, 169, 1)), ["gamma"], "radius query should wrap across the world seam");

PS.spatial.move("alpha", 48, 48);
assert.deepStrictEqual(PS.spatial.queryChunk(0, 0), [], "move should remove ids from old chunks");
assert.deepStrictEqual(PS.spatial.queryChunk(3, 3), ["alpha"], "move should insert ids into new chunks");

assert.strictEqual(PS.spatial.remove("alpha"), true, "remove should report existing ids");
assert.strictEqual(PS.spatial.remove("alpha"), false, "remove should report missing ids");
assert.deepStrictEqual(PS.spatial.queryChunk(3, 3), [], "removed ids should not remain in chunks");
assert.strictEqual(PS.spatial.getStats().entities, 3, "stats should count indexed entities");

PS.config.spatial.chunkSize = 10;
PS.spatial.clear();
var resized = PS.spatial.insert("resized", 29, 29);
assert.strictEqual(resized.chunkKey, "2:2", "chunk coordinates should respect runtime chunk-size config");
PS.config.spatial.chunkSize = CONFIG.SPATIAL_CHUNK_SIZE;

PS.spatial.clear();

var benchmarkEntities = [];
for (var index = 0; index < 10000; index++) {
  var x = (index * 37) % WORLD_WIDTH;
  var y = (index * 53) % WORLD_HEIGHT;
  var id = makeEntityId(index);
  var entity = { id: id, x: x, y: y };

  benchmarkEntities.push(entity);
  PS.spatial.insert(id, x, y);
}

var queryX = 151;
var queryY = 82;
var queryRadius = 18;
var indexedStart = performance.now();
var indexedResults = [];

for (var indexedRun = 0; indexedRun < 200; indexedRun++) {
  indexedResults = PS.spatial.queryRadius(queryX, queryY, queryRadius);
}

var indexedMs = performance.now() - indexedStart;
var naiveStart = performance.now();
var naiveResults = [];

for (var naiveRun = 0; naiveRun < 200; naiveRun++) {
  naiveResults = naiveQuery(benchmarkEntities, queryX, queryY, queryRadius);
}

var naiveMs = performance.now() - naiveStart;

assert.deepStrictEqual(sorted(indexedResults), sorted(naiveResults), "indexed radius results should match naive scan");
assert.ok(indexedResults.length > 0, "benchmark should exercise non-empty query results");
assert.ok(indexedMs < naiveMs, "indexed query should be faster than naive scan in the benchmark");

console.log("spatial index checks passed", {
  entities: PS.spatial.getStats().entities,
  results: indexedResults.length,
  indexedMs: Number(indexedMs.toFixed(3)),
  naiveMs: Number(naiveMs.toFixed(3))
});
`, context);
