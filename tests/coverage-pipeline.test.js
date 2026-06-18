const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const collectorPath = path.join(root, "scripts", "collect-browser-coverage.js");

assert.strictEqual(
  packageJson.scripts["test:coverage"],
  "node scripts/collect-browser-coverage.js",
  "test:coverage should run the browser coverage collector that can see Vite-loaded ESM modules"
);
assert.ok(fs.existsSync(collectorPath), "browser coverage collector should exist");

const collectorSource = fs.readFileSync(collectorPath, "utf8");

assert.ok(
  collectorSource.includes("startJSCoverage"),
  "collector should use Playwright JavaScript coverage"
);
assert.ok(
  collectorSource.includes("v8-to-istanbul"),
  "collector should convert V8 coverage into Istanbul coverage"
);
assert.ok(
  collectorSource.includes("coverage-final.json"),
  "collector should write coverage/coverage-final.json for Fallow"
);

console.log("coverage pipeline checks passed");
