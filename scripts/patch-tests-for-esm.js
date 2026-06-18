#!/usr/bin/env node
/**
 * Patch test files to support ESM-migrated source files.
 *
 * This script updates test files that use vm.runInContext() or vm.runInNewContext()
 * to strip ESM syntax from source files before running them.
 *
 * Changes:
 * 1. Adds require("./test-esm-helper.js") import
 * 2. Wraps fs.readFileSync calls that feed into vm.run* with prepareSourceForVM()
 * 3. Ensures vm contexts have a `window` property
 */

const fs = require("fs");
const path = require("path");

const TESTS_DIR = path.join(__dirname, "..", "tests");
const DRY_RUN = process.argv.includes("--dry-run");

// Find all test files
const testFiles = fs.readdirSync(TESTS_DIR)
  .filter(f => f.endsWith(".test.js") && f !== "test-esm-helper.js")
  .map(f => path.join(TESTS_DIR, f));

let totalPatched = 0;

for (const testFile of testFiles) {
  let content = fs.readFileSync(testFile, "utf8");
  const basename = path.basename(testFile);
  let modified = false;

  // Check if this test loads game source files via vm
  const usesVM = content.includes("vm.runInContext") ||
                 content.includes("vm.runInNewContext") ||
                 content.includes("vm.createContext");

  if (!usesVM) continue;

  // Check if already patched
  if (content.includes("test-esm-helper")) continue;

  // Find if the test reads game source files (not test files)
  const readsGameFiles = content.includes('readFileSync') &&
    (content.includes('"js/') || content.includes("'js/") ||
     content.includes('"config.js') || content.includes("'config.js"));

  if (!readsGameFiles) continue;

  // Add helper require after existing requires
  const lastRequireMatch = content.match(/^const .+ = require\(.+\);$/gm);
  if (lastRequireMatch) {
    const lastRequire = lastRequireMatch[lastRequireMatch.length - 1];
    const insertPoint = content.lastIndexOf(lastRequire) + lastRequire.length;
    const helperRequire = '\nconst { prepareSourceForVM, ensureWindowContext } = require("./test-esm-helper.js");';
    content = content.substring(0, insertPoint) + helperRequire + content.substring(insertPoint);
    modified = true;
  }

  // Find the read() helper function and wrap it with prepareSourceForVM
  // Common patterns:
  //   function read(p) { return fs.readFileSync(...) }
  //   const read = ... => fs.readFileSync(...)
  const readFnMatch = content.match(/function read\([^)]*\)\s*\{[^}]*readFileSync[^}]*\}/);
  if (readFnMatch) {
    const original = readFnMatch[0];
    // Wrap the return value with prepareSourceForVM
    const patched = original.replace(
      /return (fs\.readFileSync\([^)]+,\s*"utf8"\))/,
      "return prepareSourceForVM($1)"
    );
    if (patched !== original) {
      content = content.replace(original, patched);
      modified = true;
    }
  }

  // Also handle inline readFileSync calls used with vm.run*
  // Pattern: vm.runInContext(fs.readFileSync(path, "utf8"), ...)
  content = content.replace(
    /vm\.(runInContext|runInNewContext)\(fs\.readFileSync\(([^,]+),\s*"utf8"\)/g,
    function(match, method, pathArg) {
      modified = true;
      return `vm.${method}(prepareSourceForVM(fs.readFileSync(${pathArg}, "utf8"))`;
    }
  );

  // Handle pattern: vm.runInContext(read(path), context, ...)
  // The read() function already wraps with prepareSourceForVM if we patched it above

  // Ensure window is in context - find context object creation
  // Common pattern: const context = { ... };  or  vm.createContext({...})
  // Add window after Date or after the context object creation
  if (content.includes("createContext")) {
    // Many patterns — let's inject ensureWindowContext after createContext calls
    content = content.replace(
      /vm\.createContext\(([^)]+)\);/g,
      function(match, arg) {
        modified = true;
        return match + "\nensureWindowContext(" + arg + ");";
      }
    );
  }

  if (!modified) continue;

  if (!DRY_RUN) {
    fs.writeFileSync(testFile, content, "utf8");
  }

  console.log(`${DRY_RUN ? "WOULD patch" : "Patched"}: ${basename}`);
  totalPatched++;
}

console.log(`\n=== Summary ===`);
console.log(`Patched: ${totalPatched} test files`);
console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
