#!/usr/bin/env node
/**
 * ES Module Migration Script for Pixeldarium
 * 
 * Converts each JS file from global-scope script to ES module.
 * 
 * What it does per file:
 * 1. Removes "use strict"; (modules are strict by default)
 * 2. Converts bare `function foo()` to `export function foo()`
 *    AND adds `window.foo = foo;` for backward compat during transition
 * 3. Converts bare `var/const/let X = ...` to `export var/const/let X = ...`
 *    AND adds `window.X = X;` for globals like CONFIG, world
 * 4. Preserves all PS.* assignments (those work fine — PS is on window)
 * 
 * Usage: node migrate-to-esm.js [--dry-run] [--file path] [--layer core|sim|render|ui|all]
 */

const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");
const SINGLE_FILE = process.argv.find((a, i) => process.argv[i - 1] === "--file");
const LAYER = process.argv.find((a, i) => process.argv[i - 1] === "--layer") || "all";

const PROJECT_ROOT = path.resolve(__dirname);

// Files to skip entirely — will be rewritten manually
const SKIP_FILES = new Set([
  "js/core/loader.js",
  "js/core/namespace.js",
]);

// Files that use IIFE pattern and need special handling
const IIFE_FILES = new Set([
  // loader.js is already skipped
]);

// Known globals that should be attached to window during transition
const KNOWN_GLOBALS_TO_WINDOW = new Set([
  "CONFIG",
  "world",
]);

/**
 * Detect if a line is at true top-level scope (not inside a function/block)
 * Uses simple brace counting — good enough for this codebase's style
 */
function getTopLevelLines(lines) {
  const topLevel = new Set();
  let depth = 0;
  let inString = false;
  let stringChar = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Simple brace counting (ignoring strings and comments for speed)
    // This works because the codebase uses consistent formatting
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      const prev = j > 0 ? line[j - 1] : "";
      
      if (inString) {
        if (ch === stringChar && prev !== "\\") {
          inString = false;
        }
        continue;
      }
      
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = true;
        stringChar = ch;
        continue;
      }
      
      // Skip single-line comments
      if (ch === "/" && j + 1 < line.length && line[j + 1] === "/") {
        break;
      }
      
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
    
    // A line is top-level if depth was 0 at the START of the line
    if (depth - (line.match(/\{/g) || []).length + (line.match(/\}/g) || []).length <= 0) {
      topLevel.add(i);
    }
  }
  
  return topLevel;
}

/**
 * Process a single file
 */
function processFile(relPath) {
  const absPath = path.join(PROJECT_ROOT, relPath);
  
  if (!fs.existsSync(absPath)) {
    return { skipped: true, reason: "not found" };
  }
  
  if (SKIP_FILES.has(relPath)) {
    return { skipped: true, reason: "excluded" };
  }
  
  // Don't process workers
  if (relPath.includes("workers/")) {
    return { skipped: true, reason: "worker" };
  }
  
  // Don't process WASM glue
  if (relPath.includes("wasm/")) {
    return { skipped: true, reason: "wasm" };
  }
  
  const content = fs.readFileSync(absPath, "utf8");
  const lines = content.split("\n");
  const result = [];
  const exports = [];
  const windowAssignments = [];
  let modified = false;
  
  // Track brace depth for top-level detection
  let depth = 0;
  let inIIFE = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();
    
    // Calculate effective depth BEFORE this line's braces
    const prevDepth = depth;
    const opens = (trimmed.match(/\{/g) || []).length;
    const closes = (trimmed.match(/\}/g) || []).length;
    depth += opens - closes;
    if (depth < 0) depth = 0;
    
    // Detect IIFE start
    if (prevDepth === 0 && /^\(function\s*\(/.test(trimmed)) {
      inIIFE = true;
    }
    if (depth === 0 && inIIFE) {
      inIIFE = false;
    }
    
    const isTopLevel = prevDepth === 0 && !inIIFE;
    
    // 1. Remove "use strict" at top of file
    if (i < 3 && isTopLevel && /^"use strict";?\s*$/.test(trimmed)) {
      // Just skip the line entirely
      modified = true;
      continue;
    }
    
    // 2. Convert bare top-level function declarations
    if (isTopLevel && /^function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/.test(trimmed)) {
      const match = trimmed.match(/^function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      if (match) {
        const name = match[1];
        const indent = line.match(/^(\s*)/)[1];
        line = indent + "export " + trimmed;
        exports.push(name);
        // Add window assignment for backward compat
        windowAssignments.push(name);
        modified = true;
      }
    }
    
    // 3. Convert bare top-level var/const/let (but not PS.* assignments)
    if (isTopLevel && /^(var|const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/.test(trimmed) && !trimmed.startsWith("PS.")) {
      const match = trimmed.match(/^(var|const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      if (match) {
        const keyword = match[1];
        const name = match[2];
        const indent = line.match(/^(\s*)/)[1];
        line = indent + "export " + trimmed;
        exports.push(name);
        // All top-level vars must be on window during ESM transition
        // (other modules may reference them as bare globals)
        windowAssignments.push(name);
        modified = true;
      }
    }
    
    result.push(line);
  }
  
  // Append window assignments at the end of the file for backward compat
  if (windowAssignments.length > 0) {
    result.push("");
    result.push("// --- ES Module Migration: backward-compat globals ---");
    for (const name of windowAssignments) {
      result.push(`window.${name} = ${name};`);
    }
    modified = true;
  }
  
  if (!modified) {
    return { skipped: true, reason: "no changes needed" };
  }
  
  const newContent = result.join("\n");
  
  if (!DRY_RUN) {
    fs.writeFileSync(absPath, newContent, "utf8");
  }
  
  return {
    skipped: false,
    exports: exports,
    windowAssignments: windowAssignments,
    linesBefore: lines.length,
    linesAfter: result.length,
  };
}

// Main
function main() {
  console.log(`\n=== Pixeldarium ES Module Migration ===`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Layer: ${LAYER}\n`);

  // Read the manifest
  const namespaceContent = fs.readFileSync(
    path.join(PROJECT_ROOT, "js/core/namespace.js"), "utf8"
  );
  
  const manifestMatch = namespaceContent.match(/PS\.core\.manifest\s*=\s*\[([\s\S]*?)\];/);
  if (!manifestMatch) {
    console.error("ERROR: Could not find PS.core.manifest");
    process.exit(1);
  }
  
  const manifestStr = manifestMatch[1];
  const manifest = [];
  const pathRe = /"([^"]+)"/g;
  let m;
  while ((m = pathRe.exec(manifestStr)) !== null) {
    manifest.push(m[1]);
  }
  
  // Filter by layer
  const layerFilter = {
    core: p => p.startsWith("js/core/") || p === "config.js",
    sim: p => p.startsWith("js/sim/"),
    render: p => p.startsWith("js/render/"),
    ui: p => p.startsWith("js/ui/"),
    systems: p => p.startsWith("js/systems/"),
    assets: p => p.startsWith("js/assets/"),
    epochs: p => p.startsWith("js/epochs/") || p.startsWith("sim/configs/"),
    layers: p => p.startsWith("js/layers/"),
    debug: p => p.startsWith("js/debug/"),
    main: p => p.startsWith("js/main"),
    all: () => true,
  };
  
  const filter = layerFilter[LAYER] || layerFilter.all;
  const filtered = manifest.filter(filter);
  
  console.log(`Processing ${filtered.length} of ${manifest.length} files\n`);
  
  let processed = 0;
  let skipped = 0;
  let totalExports = 0;
  let totalWindowAssigns = 0;
  
  for (const scriptPath of filtered) {
    const result = processFile(scriptPath);
    
    if (result.skipped) {
      console.log(`  SKIP [${result.reason}] ${scriptPath}`);
      skipped++;
    } else {
      console.log(`  ${DRY_RUN ? "WOULD" : "DID"} process: ${scriptPath} (${result.exports.length} exports, ${result.windowAssignments.length} window assigns)`);
      for (const exp of result.exports) {
        console.log(`    export: ${exp}${result.windowAssignments.includes(exp) ? " → window." + exp : ""}`);
      }
      processed++;
      totalExports += result.exports.length;
      totalWindowAssigns += result.windowAssignments.length;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total exports: ${totalExports}`);
  console.log(`Window assigns (backward compat): ${totalWindowAssigns}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no files changed)" : "LIVE (files modified)"}`);
}

main();
