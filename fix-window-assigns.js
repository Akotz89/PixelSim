#!/usr/bin/env node
/**
 * Fix script: Add missing window.* assignments for all exported vars.
 * 
 * The initial migration only added window.* for bare functions and known globals.
 * This script finds all `export const/var/let X = ...` without a corresponding
 * `window.X = X` and adds them.
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

let totalAdded = 0;
let filesFixed = 0;

for (const scriptPath of manifest) {
  if (SKIP_FILES.has(scriptPath)) continue;
  if (scriptPath.includes("workers/") || scriptPath.includes("wasm/")) continue;
  
  const absPath = path.join(PROJECT_ROOT, scriptPath);
  if (!fs.existsSync(absPath)) continue;
  
  const content = fs.readFileSync(absPath, "utf8");
  const lines = content.split("\n");
  
  // Find all exported vars/const/let
  const exportedVars = [];
  const exportVarRe = /^export\s+(const|var|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/;
  
  for (const line of lines) {
    const match = line.trim().match(exportVarRe);
    if (match) {
      exportedVars.push(match[2]);
    }
  }
  
  if (exportedVars.length === 0) continue;
  
  // Find which ones already have window.* assignments
  const existing = new Set();
  const windowRe = /^window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/;
  for (const line of lines) {
    const match = line.trim().match(windowRe);
    if (match) {
      existing.add(match[1]);
    }
  }
  
  // Find missing
  const missing = exportedVars.filter(name => !existing.has(name));
  
  if (missing.length === 0) continue;
  
  console.log(`${DRY_RUN ? "WOULD fix" : "Fixing"}: ${scriptPath} (+${missing.length} window assigns)`);
  for (const name of missing) {
    console.log(`  + window.${name} = ${name};`);
  }
  
  if (!DRY_RUN) {
    // Check if the file already has the backward-compat section
    const hasBCSection = content.includes("// --- ES Module Migration: backward-compat globals ---");
    
    let newContent;
    if (hasBCSection) {
      // Append to existing section
      const sectionLines = [];
      for (const name of missing) {
        sectionLines.push(`window.${name} = ${name};`);
      }
      newContent = content.trimEnd() + "\n" + sectionLines.join("\n") + "\n";
    } else {
      // Add new section
      const sectionLines = [
        "",
        "// --- ES Module Migration: backward-compat globals ---"
      ];
      for (const name of missing) {
        sectionLines.push(`window.${name} = ${name};`);
      }
      newContent = content.trimEnd() + "\n" + sectionLines.join("\n") + "\n";
    }
    
    fs.writeFileSync(absPath, newContent, "utf8");
  }
  
  totalAdded += missing.length;
  filesFixed++;
}

console.log(`\n=== Summary ===`);
console.log(`Files fixed: ${filesFixed}`);
console.log(`Window assigns added: ${totalAdded}`);
console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
