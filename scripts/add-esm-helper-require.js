#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const TESTS_DIR = path.join(__dirname, "..", "tests");
const testFiles = fs.readdirSync(TESTS_DIR)
  .filter(f => f.endsWith(".test.js") && f !== "test-esm-helper.js")
  .map(f => path.join(TESTS_DIR, f));

let patched = 0;
for (const f of testFiles) {
  const content = fs.readFileSync(f, "utf8");

  // Only patch files that use vm
  if (!content.includes("vm.runInContext") &&
      !content.includes("vm.runInNewContext") &&
      !content.includes("vm.createContext")) continue;

  // Skip if already has the require
  if (content.includes("test-esm-helper")) continue;

  // Add require at the very beginning (before "use strict")
  const newContent = 'require("./test-esm-helper.js");\n' + content;
  fs.writeFileSync(f, newContent, "utf8");
  patched++;
  console.log(`Added require: ${path.basename(f)}`);
}

console.log(`\nPatched: ${patched} files`);
