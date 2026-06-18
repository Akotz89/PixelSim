const { assert, fs, path, vm, root, read } = require("./helpers/world-context.js");

function collectJavaScriptFiles(dir, files) {
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach(function(entry) {
    const relativePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectJavaScriptFiles(relativePath, files);
    } else if (entry.isFile() && relativePath.endsWith(".js")) {
      files.push(relativePath);
    }
  });
}

const indexSource = read("index.html");
const namespaceSource = read("js/core/namespace.js");
const mainSource = read("js/main.js");
const manifestPath = "js/core/manifest.js";
assert.ok(fs.existsSync(path.join(root, manifestPath)), "script manifest should live in js/core/manifest.js");
const manifestSource = read(manifestPath);
const scriptSources = Array.from(indexSource.matchAll(/<script\s+(?:type="[^"]*"\s+)?src="([^"]+)"/g)).map(function(match) {
  return match[1];
});
const context = {
  window: {
    addEventListener: function() {}
  },
  Date: Date
};

context.window.window = context.window;
vm.createContext(context);
vm.runInContext(namespaceSource, context, { filename: "js/core/namespace.js" });

assert.deepStrictEqual(
  scriptSources,
  ["js/core/namespace.js", "js/core/loader-esm.js"],
  "index.html should bootstrap namespace and ESM loader only"
);
assert.ok(context.window.PS, "namespace should expose window.PS");
assert.ok(context.window.PS.core, "namespace should expose PS.core");
assert.strictEqual(context.window.PS.core.bootstrapScript, "js/core/namespace.js", "bootstrap script should identify namespace.js");
assert.ok(Array.isArray(context.window.PS.core.manifest), "PS.core.manifest should be an array");
assert.ok(/export\s+const\s+manifest\s*=/.test(manifestSource), "manifest.js should export the script manifest");
assert.ok(namespaceSource.indexOf("from \"./manifest.js\"") >= 0, "namespace.js should import the script manifest");
assert.ok(namespaceSource.indexOf("PS.core.manifest = [") === -1, "namespace.js should not own the manifest array");
assert.ok(/export\s+function\s+init\s*\(/.test(mainSource), "main.js should expose init as an ES module export");
assert.ok(mainSource.indexOf("PS.init") === -1, "main.js should not register init through the PS facade");
assert.ok(
  !context.window.PS.runtime.requiredFunctions.includes("PS.init"),
  "runtime health should not require the PS.init facade"
);
const manifest = Array.from(context.window.PS.core.manifest);
assert.ok(manifest.length > 100, "manifest should contain the current game script set");
assert.strictEqual(manifest[0], "config.js", "manifest should start after namespace bootstrap");
assert.strictEqual(manifest[manifest.length - 1], "js/main.js", "manifest should end at the game entry point");
assert.ok(!manifest.includes("js/core/namespace.js"), "manifest should not reload namespace.js");
assert.ok(!manifest.includes("js/core/loader.js"), "manifest should not reload loader.js");
assert.ok(indexSource.indexOf("js/legacy/") === -1, "index.html should not load legacy runtime scripts");
assert.ok(!fs.existsSync(path.join(root, "js/legacy")), "js/legacy should be removed after AZR-589 archive");
assert.ok(
  fs.existsSync(path.join(root, "archives/legacy-pre-foundation/manifest.json")),
  "legacy archive manifest should document the removed legacy inventory"
);

const seen = {};
const globalFunctions = {};
manifest.forEach(function(scriptPath) {
  assert.strictEqual(typeof scriptPath, "string", "manifest entries should be strings");
  assert.ok(scriptPath.length > 0, "manifest entries should not be empty");
  assert.strictEqual(seen[scriptPath], undefined, "manifest should not contain duplicate script " + scriptPath);
  seen[scriptPath] = true;
  assert.ok(scriptPath.indexOf("js/legacy/") === -1, "manifest should not include legacy runtime script " + scriptPath);
  assert.ok(fs.existsSync(path.join(root, scriptPath)), "manifest script should exist: " + scriptPath);

  if (scriptPath.endsWith(".js")) {
    Array.from(read(scriptPath).matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)).forEach(function(match) {
      const functionName = match[1];
      assert.strictEqual(
        globalFunctions[functionName],
        undefined,
        "top-level function " + functionName + " is declared in both " + globalFunctions[functionName] + " and " + scriptPath
      );
      globalFunctions[functionName] = scriptPath;
    });
  }
});

const strictModeFiles = [];
collectJavaScriptFiles("js", strictModeFiles);
// Manifest files are now ES modules (loaded via import()), which are strict by default.
// Only check non-manifest files (workers, loader, namespace) for explicit "use strict".
const manifestSet = new Set(manifest);
manifestSet.add("js/core/loader-esm.js");
strictModeFiles.forEach(function(file) {
  var normalizedPath = file.replace(/\\/g, "/");
  var isManifestFile = manifestSet.has(normalizedPath);
  if (!isManifestFile) {
    // Workers and other non-module files still need "use strict"
    assert.ok(read(file).startsWith("\"use strict\";"), file + " should start with strict mode (non-module file)");
  }
});

console.log("script manifest checks passed");
