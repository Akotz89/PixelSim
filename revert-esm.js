#!/usr/bin/env node
/**
 * Revert ESM migration: Remove export keywords and window.* backward-compat from all files.
 * Restore "use strict" at the top of each file.
 * 
 * Usage: node revert-esm.js [--dry-run]
 */

const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");
const PROJECT_ROOT = path.resolve(__dirname);

// Read manifest
const namespaceContent = fs.readFileSync(
  path.join(PROJECT_ROOT, "js/core/namespace.js"), "utf8"
);
const manifestMatch = namespaceContent.match(/PS\.core\.manifest\s*=\s*\[([\s\S]*?)\];/);
const manifestStr = manifestMatch[1];
const manifest = [];
const pathRe = /"([^"]+)"/g;
let m;
while ((m = pathRe.exec(manifestStr)) !== null) {
  manifest.push(m[1]);
}

const SKIP_FILES = new Set(["js/core/loader.js", "js/core/namespace.js"]);

let totalReverted = 0;

for (const scriptPath of manifest) {
  if (SKIP_FILES.has(scriptPath)) continue;
  if (scriptPath.includes("workers/") || scriptPath.includes("wasm/")) continue;

  const absPath = path.join(PROJECT_ROOT, scriptPath);
  if (!fs.existsSync(absPath)) continue;

  let content = fs.readFileSync(absPath, "utf8");
  let modified = false;

  // 1. Remove the backward-compat section at the end
  const bcMarker = "// --- ES Module Migration: backward-compat globals ---";
  const bcIndex = content.indexOf(bcMarker);
  if (bcIndex >= 0) {
    // Remove everything from the marker to the end of the file
    content = content.substring(0, bcIndex).trimEnd() + "\n";
    modified = true;
  }

  // 1b. Remove the globals preamble from v2 migration
  const preambleMarker = "// --- ESM Migration: globals from other modules ---";
  const preambleIndex = content.indexOf(preambleMarker);
  if (preambleIndex >= 0) {
    // Find the end of the preamble block (first blank line after marker)
    let endOfPreamble = content.indexOf("\n\n", preambleIndex);
    if (endOfPreamble >= 0) {
      content = content.substring(0, preambleIndex) + content.substring(endOfPreamble + 2);
    }
    modified = true;
  }

  // 2. Remove 'export ' prefix from function declarations
  content = content.replace(/^export function /gm, "function ");
  if (content !== fs.readFileSync(absPath, "utf8").substring(0, content.length)) {
    // Changed
  }
  
  // 3. Remove 'export ' prefix from var/const/let declarations
  content = content.replace(/^export (const|var|let) /gm, "$1 ");
  
  // 4. Restore "use strict" if missing
  if (!content.startsWith('"use strict"')) {
    content = '"use strict";\n' + content;
    modified = true;
  }

  // Check if anything changed
  const original = fs.readFileSync(absPath, "utf8");
  if (content === original) continue;

  if (!DRY_RUN) {
    fs.writeFileSync(absPath, content, "utf8");
  }

  console.log(`${DRY_RUN ? "WOULD revert" : "Reverted"}: ${scriptPath}`);
  totalReverted++;
}

// Also revert config.js (outside js/)
const configPath = path.join(PROJECT_ROOT, "config.js");
if (fs.existsSync(configPath)) {
  let content = fs.readFileSync(configPath, "utf8");
  const bcMarker = "// --- ES Module Migration: backward-compat globals ---";
  const bcIndex = content.indexOf(bcMarker);
  if (bcIndex >= 0) {
    content = content.substring(0, bcIndex).trimEnd() + "\n";
  }
  content = content.replace(/^export (const|var|let) /gm, "$1 ");
  const original = fs.readFileSync(configPath, "utf8");
  if (content !== original) {
    if (!DRY_RUN) {
      fs.writeFileSync(configPath, content, "utf8");
    }
    console.log(`${DRY_RUN ? "WOULD revert" : "Reverted"}: config.js`);
    totalReverted++;
  }
}

console.log(`\n=== Summary ===`);
console.log(`Reverted: ${totalReverted}`);
console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
