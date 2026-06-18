require("./test-esm-helper.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const namespaceSource = fs.readFileSync(path.join(root, "js/core/namespace.js"), "utf8");
const context = { window: { addEventListener() {} } };

context.window.window = context.window;
vm.createContext(context);
vm.runInContext(namespaceSource, context, { filename: "js/core/namespace.js" });

const activeFiles = ["index.html"].concat(context.window.PS.core.manifest);
const canvas2dPattern = /getContext\(["']2d|OffscreenCanvas|drawImage|createImageData|putImageData|getImageData|Canvas2D|Canvas 2D|draw\w*To2d|To2d|copyBack|compatibilityCanvas|presentCompatibilityCanvas|\bctx\b|\btargetCtx\b/;
const violations = [];

activeFiles.forEach(function (file) {
  const fullPath = path.join(root, file);
  const source = fs.readFileSync(fullPath, "utf8");

  source.split(/\n/).forEach(function (line, index) {
    if (canvas2dPattern.test(line)) {
      violations.push(file + ":" + (index + 1) + ": " + line.trim());
    }
  });
});

assert.deepStrictEqual(violations, [], "active runtime must not load Canvas2D markers");

console.log("no Canvas2D runtime checks passed");
