#!/usr/bin/env node
/**
 * ESM Migration v2: Migrate Pixeldarium from global-scope scripts to ES modules.
 * 
 * Improvements over v1:
 * - Analyzes cross-file dependencies and injects globals preamble
 * - Each consuming file gets `const varName = window.varName;` for each external global
 * - Each defining file gets `export` + `window.X = X;` assigns
 * 
 * Usage:
 *   node migrate-to-esm-v2.js            # Live migration
 *   node migrate-to-esm-v2.js --dry-run  # Preview changes
 *   node migrate-to-esm-v2.js --analyze  # Just analyze dependencies, no changes
 */

const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");
const ANALYZE_ONLY = process.argv.includes("--analyze");
const PROJECT_ROOT = path.resolve(__dirname);

// ─── Step 0: Read manifest ────────────────────────────────────────────────────
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

const SKIP_FILES = new Set([
  "js/core/loader.js",
  "js/core/loader-esm.js",
  "js/core/namespace.js"
]);

// ─── Step 1: Build global definitions map ─────────────────────────────────────
// For each file, find all top-level var/const/let declarations and function declarations
const definitions = {}; // { varName: scriptPath }
const fileDefinitions = {}; // { scriptPath: [varNames] }

// Built-in browser globals that should NOT be injected
const BROWSER_BUILTINS = new Set([
  "document", "window", "console", "Math", "JSON", "Date", "Array", "Object",
  "String", "Number", "Boolean", "RegExp", "Error", "TypeError", "RangeError",
  "Map", "Set", "WeakMap", "WeakSet", "Promise", "Symbol", "Proxy", "Reflect",
  "ArrayBuffer", "DataView", "Float32Array", "Float64Array", "Int8Array",
  "Int16Array", "Int32Array", "Uint8Array", "Uint16Array", "Uint32Array",
  "Uint8ClampedArray", "BigInt64Array", "BigUint64Array",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
  "requestAnimationFrame", "cancelAnimationFrame",
  "fetch", "URL", "URLSearchParams", "Headers", "Request", "Response",
  "performance", "navigator", "location", "history",
  "alert", "confirm", "prompt", "atob", "btoa",
  "TextEncoder", "TextDecoder", "Blob", "File", "FileReader",
  "FormData", "XMLHttpRequest", "AbortController", "AbortSignal",
  "Worker", "SharedWorker", "MessageChannel", "MessagePort",
  "WebSocket", "EventSource", "BroadcastChannel",
  "crypto", "SubtleCrypto", "CryptoKey",
  "Intl", "queueMicrotask", "structuredClone",
  "HTMLElement", "HTMLCanvasElement", "HTMLImageElement",
  "CanvasRenderingContext2D", "ImageData", "ImageBitmap",
  "OffscreenCanvas", "GPUDevice", "GPUAdapter", "GPUBuffer",
  "GPUTexture", "GPURenderPipeline", "GPUComputePipeline",
  "GPUCommandEncoder", "GPURenderPassEncoder", "GPUComputePassEncoder",
  "GPUBindGroup", "GPUBindGroupLayout", "GPUPipelineLayout",
  "GPUShaderModule", "GPUQueue", "GPUCanvasContext",
  "Event", "CustomEvent", "EventTarget", "MutationObserver",
  "ResizeObserver", "IntersectionObserver",
  "globalThis", "self", "undefined", "NaN", "Infinity",
  "isNaN", "isFinite", "parseInt", "parseFloat", "encodeURIComponent",
  "decodeURIComponent", "encodeURI", "decodeURI",
  "eval", "Function", "arguments", "this",
  // WebGPU/GPU-specific
  "GPUBufferUsage", "GPUTextureUsage", "GPUShaderStage",
  "GPUMapMode", "GPUColorWrite", "GPUTextureFormat",
  // IndexedDB
  "indexedDB", "IDBKeyRange",
  // Audio
  "AudioContext", "AudioBuffer", "GainNode", "OscillatorNode",
  // Common utility patterns used as bare identifiers
  "true", "false", "null",
]);

// PS namespace members to skip (they're accessed via PS.*)
const PS_NAMESPACE_SKIP = new Set(["PS"]);

for (const scriptPath of manifest) {
  if (SKIP_FILES.has(scriptPath)) continue;
  if (scriptPath.includes("workers/")) continue;

  const absPath = path.join(PROJECT_ROOT, scriptPath);
  if (!fs.existsSync(absPath)) continue;

  const content = fs.readFileSync(absPath, "utf8");
  const defs = [];

  // Match top-level function declarations
  const funcRe = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let match;
  while ((match = funcRe.exec(content)) !== null) {
    // Check it's actually at the top level (not inside a function body)
    // Simple heuristic: check indentation (0 or minimal)
    const lineStart = content.lastIndexOf("\n", match.index) + 1;
    const indent = match.index - lineStart;
    if (indent <= 0) {
      defs.push(match[1]);
    }
  }

  // Match top-level var/const/let declarations
  const varRe = /^(const|var|let)\s+([A-Za-z_$][\w$]*)\s*=/gm;
  while ((match = varRe.exec(content)) !== null) {
    const lineStart = content.lastIndexOf("\n", match.index) + 1;
    const indent = match.index - lineStart;
    if (indent <= 0) {
      defs.push(match[1 + 1]); // group 2
    }
  }

  // Match destructured const/let/var at top level
  // e.g., const { a, b } = something;
  const destructRe = /^(const|var|let)\s+\{\s*([^}]+)\}\s*=/gm;
  while ((match = destructRe.exec(content)) !== null) {
    const lineStart = content.lastIndexOf("\n", match.index) + 1;
    const indent = match.index - lineStart;
    if (indent <= 0) {
      const names = match[2].split(",").map(s => s.trim().split(":")[0].trim()).filter(Boolean);
      defs.push(...names);
    }
  }

  fileDefinitions[scriptPath] = [...new Set(defs)];
  for (const name of defs) {
    if (!definitions[name]) {
      definitions[name] = scriptPath;
    }
    // If already defined elsewhere, first definition wins (load order)
  }
}

// Also add config.js definitions
const configPath = path.join(PROJECT_ROOT, "config.js");
if (fs.existsSync(configPath)) {
  const content = fs.readFileSync(configPath, "utf8");
  const defs = [];
  const varRe = /^(const|var|let)\s+([A-Za-z_$][\w$]*)\s*=/gm;
  let match;
  while ((match = varRe.exec(content)) !== null) {
    defs.push(match[2]);
  }
  fileDefinitions["config.js"] = defs;
  for (const name of defs) {
    if (!definitions[name]) definitions[name] = "config.js";
  }
}

console.log(`\n=== Global Definitions Map ===`);
console.log(`Total unique globals: ${Object.keys(definitions).length}`);
console.log(`Files with definitions: ${Object.keys(fileDefinitions).length}`);

// ─── Step 2: Find bare identifier usages per file ─────────────────────────────
// For each file, find identifiers used that are NOT defined in that file
const fileNeeds = {}; // { scriptPath: { varName: definingFile } }

const allFiles = [...manifest, "config.js"].filter(p => !SKIP_FILES.has(p) && !p.includes("workers/"));

for (const scriptPath of allFiles) {
  const absPath = path.join(PROJECT_ROOT, scriptPath);
  if (!fs.existsSync(absPath)) continue;

  const content = fs.readFileSync(absPath, "utf8");
  const myDefs = new Set(fileDefinitions[scriptPath] || []);
  const needs = {};

  // Find all bare identifier usages (word boundaries)
  // We look for identifiers that appear as:
  // - Start of expression: `varName.prop`, `varName(`, `varName[`, `varName =`
  // - In expressions: `= varName`, `(varName`, `+ varName`, etc.
  // We use a simple approach: find all word-boundary identifiers
  const identRe = /\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
  let idMatch;
  const seen = new Set();

  while ((idMatch = identRe.exec(content)) !== null) {
    const name = idMatch[1];
    if (seen.has(name)) continue;
    seen.add(name);

    // Skip if defined in this file
    if (myDefs.has(name)) continue;

    // Skip browser builtins
    if (BROWSER_BUILTINS.has(name)) continue;

    // Skip PS namespace (accessed via PS.*)
    if (PS_NAMESPACE_SKIP.has(name)) continue;

    // Skip JS keywords
    if (isJSKeyword(name)) continue;

    // Skip if not in our definitions map
    if (!definitions[name]) continue;

    // Skip if the definition is from the same file
    if (definitions[name] === scriptPath) continue;

    needs[name] = definitions[name];
  }

  if (Object.keys(needs).length > 0) {
    fileNeeds[scriptPath] = needs;
  }
}

function isJSKeyword(name) {
  const keywords = new Set([
    "break", "case", "catch", "continue", "debugger", "default", "delete",
    "do", "else", "finally", "for", "function", "if", "in", "instanceof",
    "new", "return", "switch", "throw", "try", "typeof", "var", "void",
    "while", "with", "class", "const", "enum", "export", "extends",
    "import", "super", "implements", "interface", "let", "package",
    "private", "protected", "public", "static", "yield", "async", "await",
    "of", "from", "as", "get", "set",
    // Common method/property names that aren't globals
    "length", "push", "pop", "shift", "unshift", "splice", "slice",
    "map", "filter", "reduce", "forEach", "find", "findIndex", "some",
    "every", "includes", "indexOf", "join", "sort", "reverse",
    "keys", "values", "entries", "toString", "valueOf", "constructor",
    "prototype", "hasOwnProperty", "call", "apply", "bind",
    "then", "catch", "resolve", "reject", "all", "race",
    "log", "warn", "error", "info", "debug", "assert", "trace",
    "floor", "ceil", "round", "abs", "min", "max", "pow", "sqrt",
    "sin", "cos", "tan", "atan2", "PI", "random", "sign",
    "stringify", "parse", "now", "freeze", "assign", "create",
    "defineProperty", "getOwnPropertyDescriptor",
    "getPrototypeOf", "setPrototypeOf",
    "name", "value", "type", "data", "width", "height", "x", "y",
    "r", "g", "b", "a", "id", "key", "index", "i", "j", "k", "n",
    "result", "ctx", "gl", "device", "queue", "context",
    "src", "dst", "msg", "err", "cb", "fn", "obj", "arr",
    "dt", "dx", "dy", "dz", "sx", "sy", "sw", "sh",
    "tx", "ty", "tw", "th", "u", "v", "w", "h",
    "left", "right", "top", "bottom", "start", "end",
    "item", "node", "el", "elem", "target", "source",
    "count", "total", "size", "offset", "stride",
    "config", "options", "params", "state", "props",
    "label", "text", "title", "detail", "summary",
  ]);
  return keywords.has(name);
}

console.log(`\n=== Cross-file Dependencies ===`);
let totalNeeds = 0;
for (const [file, needs] of Object.entries(fileNeeds)) {
  const count = Object.keys(needs).length;
  totalNeeds += count;
  if (ANALYZE_ONLY) {
    console.log(`  ${file}: needs ${count} globals from other files`);
    for (const [name, from] of Object.entries(needs)) {
      console.log(`    - ${name} (from ${from})`);
    }
  }
}
console.log(`\nTotal cross-file dependencies: ${totalNeeds} across ${Object.keys(fileNeeds).length} files`);

if (ANALYZE_ONLY) {
  process.exit(0);
}

// ─── Step 3: Apply migration ──────────────────────────────────────────────────
let totalModified = 0;

for (const scriptPath of allFiles) {
  const absPath = path.join(PROJECT_ROOT, scriptPath);
  if (!fs.existsSync(absPath)) continue;

  let content = fs.readFileSync(absPath, "utf8");
  let modified = false;

  // 3a. Remove "use strict" (modules are strict by default)
  if (content.startsWith('"use strict";')) {
    content = content.replace(/^"use strict";\s*\n?/, "");
    modified = true;
  }

  // 3b. Add export to top-level function declarations (BEFORE injecting preamble)
  content = content.replace(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm, function(match, name) {
    return "export function " + name + "(";
  });

  // 3c. Add export to top-level var/const/let (only at column 0, BEFORE preamble)
  content = content.replace(/^(const|var|let)\s+/gm, function(match, keyword, offset) {
    // Check if already prefixed with export
    const before = content.substring(Math.max(0, offset - 7), offset);
    if (before.endsWith("export ")) return match;

    // Check indentation
    const lineStart = content.lastIndexOf("\n", offset) + 1;
    const indent = offset - lineStart;
    if (indent > 0) return match;

    return "export " + keyword + " ";
  });

  // 3d. Inject globals preamble for cross-file dependencies (AFTER export processing)
  const needs = fileNeeds[scriptPath];
  if (needs && Object.keys(needs).length > 0) {
    const names = Object.keys(needs).sort();
    const preamble = "// --- ESM Migration: globals from other modules ---\n" +
      names.map(n => `var ${n} = window.${n};`).join("\n") +
      "\n\n";
    content = preamble + content;
    modified = true;
  }

  // 3e. Add window.* backward-compat assigns at the end
  const myDefs = fileDefinitions[scriptPath] || [];
  if (myDefs.length > 0) {
    const assigns = "\n// --- ES Module Migration: backward-compat globals ---\n" +
      myDefs.map(n => `window.${n} = ${n};`).join("\n") + "\n";
    content = content.trimEnd() + "\n" + assigns;
    modified = true;
  }

  if (!modified) continue;

  const original = fs.readFileSync(absPath, "utf8");
  if (content === original) continue;

  if (!DRY_RUN) {
    fs.writeFileSync(absPath, content, "utf8");
  }

  const needCount = needs ? Object.keys(needs).length : 0;
  const defCount = myDefs.length;
  console.log(`${DRY_RUN ? "WOULD migrate" : "Migrated"}: ${scriptPath} (${needCount} imports, ${defCount} exports)`);
  totalModified++;
}

console.log(`\n=== Migration Summary ===`);
console.log(`Files modified: ${totalModified}`);
console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
console.log(`\nNext steps:`);
console.log(`  1. Update index.html to use loader-esm.js`);
console.log(`  2. Update tests for ESM loading`);
console.log(`  3. Run 'npm test' to verify`);
console.log(`  4. Run 'npx fallow' to verify module graph analysis`);
