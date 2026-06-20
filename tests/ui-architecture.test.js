const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

function lineCount(file) {
  return read(file).split(/\r?\n/).length;
}

const namespaceContext = {
  window: {
    addEventListener: function() {}
  },
  Date
};
namespaceContext.window.window = namespaceContext.window;
vm.createContext(namespaceContext);
vm.runInContext(read("js/core/namespace.js"), namespaceContext, { filename: "js/core/namespace.js" });

const manifest = namespaceContext.window.PS.core.manifest;
const uiFiles = fs.readdirSync(path.join(root, "js/ui"))
  .filter(function(file) {
    return file.endsWith(".js");
  })
  .map(function(file) {
    return "js/ui/" + file;
  })
  .sort();

uiFiles.forEach(function(file) {
  assert.ok(lineCount(file) <= 500, file + " should stay under 500 lines");
  assert.ok(manifest.includes(file), file + " should be loaded by the runtime manifest");
});

[
  "js/ui/inspect.js",
  "js/ui/camera-input.js",
  "js/ui/persistence-controls.js",
  "js/ui/interaction.js",
  "js/ui/controls.js",
  "js/ui/setup.js"
].forEach(function(file, index, orderedFiles) {
  if (index === 0) {
    return;
  }

  assert.ok(
    manifest.indexOf(orderedFiles[index - 1]) < manifest.indexOf(file),
    orderedFiles[index - 1] + " should load before " + file
  );
});

assert.ok(read("js/ui/interaction.js").indexOf("function registerSimulationInputActions") >= 0, "interaction should own input action registration");
assert.ok(read("js/ui/inspect.js").indexOf("function inspectTile") >= 0, "inspect module should own inspect selection");
assert.ok(read("js/ui/camera-input.js").indexOf("var planetDragState") >= 0, "camera input module should own drag state");
assert.ok(read("js/ui/persistence-controls.js").indexOf("function setPersistenceStatus") >= 0, "persistence controls module should own save status");
assert.ok(read("js/ui/summary.js").indexOf("body \" + traits.bodySize") >= 0, "summary should expose selected organism body traits");
assert.ok(read("js/ui/summary.js").indexOf("thermal \" + traits.thermalTolerance") >= 0, "summary should expose selected organism environmental traits");
assert.ok(read("js/ui/summary.js").indexOf("makeSummaryChip(\"Mind\"") >= 0, "trait summary should expose cognition trends");
assert.ok(read("js/ui/inspect-history.js").indexOf("formatOrganismTraits(organism)") >= 0, "inspect panel should use expanded organism trait formatter");
assert.ok(read("js/ui/inspect-history.js").indexOf("morphologyPreview") >= 0, "inspect panel should expose representative morphology preview");

const indexSource = read("index.html");
assert.strictEqual(indexSource.indexOf("js/legacy/"), -1, "index.html should not load legacy runtime scripts");
assert.strictEqual(manifest.filter(function(file) {
  return file.indexOf("js/legacy/") >= 0;
}).length, 0, "runtime manifest should not load legacy scripts");

const retiredNamePattern = new RegExp([
  "Pixel" + "Sim",
  "Pixel" + "sim",
  "pixel" + "sim",
  "Pixel " + "Sim"
].join("|"));
["index.html", "js/core/namespace.js"].concat(uiFiles).forEach(function(file) {
  assert.strictEqual(retiredNamePattern.test(read(file)), false, file + " should not use retired project naming");
});

const assessment = read("docs/legacy-ui-assessment.md");
assert.ok(assessment.indexOf("AZR-366") >= 0, "legacy UI assessment should reference AZR-366");
assert.ok(assessment.indexOf("js/ui/camera-input.js") >= 0, "legacy UI assessment should document camera input split");
assert.ok(assessment.indexOf("js/ui/persistence-controls.js") >= 0, "legacy UI assessment should document persistence controls split");

console.log("ui architecture checks passed", JSON.stringify({ files: uiFiles.length }));
