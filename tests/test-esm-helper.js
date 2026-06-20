"use strict";
/**
 * Test helper for ESM-migrated source files.
 * 
 * Monkey-patches vm.runInContext and vm.runInNewContext to:
 * 1. Convert named imports to safe context lookups
 * 2. Strip 'export' keywords (syntax error in non-module scripts)
 * 3. Ensure vm contexts have a `window` property
 */

const vm = require("vm");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
let manifestArrayLiteral = null;

function getManifestArrayLiteral() {
  if (manifestArrayLiteral) {
    return manifestArrayLiteral;
  }

  const source = fs.readFileSync(path.join(root, "js/core/manifest.js"), "utf8");
  const match = source.match(/export\s+const\s+manifest\s*=\s*(\[[\s\S]*?\n\]);/);

  if (!match) {
    throw new Error("Could not parse js/core/manifest.js for VM import shim");
  }

  manifestArrayLiteral = match[1];
  return manifestArrayLiteral;
}

/**
 * Strip ESM syntax from source code so it can run in a vm context.
 */
function prepareSourceForVM(source) {
  // Convert named imports to safe conditional context lookups. The test suites
  // load files into shared vm contexts, so imported bindings are usually already
  // present as globals or mocks on window.
  source = source.replace(
    /^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];\s*$/gm,
    function(match, importedNames, importPath) {
      return importedNames
        .split(",")
        .map(function(part) {
          var pieces = part.trim().split(/\s+as\s+/);
          var importedName = pieces[0] ? pieces[0].trim() : "";
          var localName = pieces[1] ? pieces[1].trim() : importedName;

          if (!localName) {
            return "";
          }

          if (/\/?manifest\.js$/.test(importPath) && importedName === "manifest") {
            return `var ${localName} = ${getManifestArrayLiteral()}`;
          }

          if (importedName === "assert") {
            return `try { if (typeof ${localName} === "undefined") { eval("var ${localName} = window.assert || (window.PS && window.PS.assert);"); } } catch(e) {}`;
          }

          return `try { if (typeof ${localName} === "undefined") { eval("var ${localName} = window.${importedName};"); } } catch(e) {}`;
        })
        .filter(Boolean)
        .join("\n");
    }
  );
  source = source.replace(/^import\s+["'][^"']+["'];\s*$/gm, "");

  // Strip 'export ' prefix from declarations (syntax error in non-module)
  source = source.replace(/^export function /gm, "function ");
  source = source.replace(/^export (const|var|let) ([A-Za-z_$][\w$]*)\s*=/gm, "var $2 =");
  source = source.replace(/^export\s+\{[^}]+\};\s*$/gm, "");
  source = source.replace(/^export default /gm, "");

  // Convert preamble `var X = window.X;` to safe conditional form
  // that won't conflict with existing const/let declarations in shared contexts.
  // Replace `var X = window.X;` with `if (typeof X === "undefined") { var X = window.X; }`
  // But since const/let can't be re-declared with var, we use a different approach:
  // Transform to try/catch to silently skip if already declared.
  source = source.replace(
    /^var ([A-Za-z_$][\w$]*) = window\.\1;$/gm,
    function(match, name) {
      // Use eval-based injection that won't throw on re-declaration
      return `try { if (typeof ${name} === "undefined") { eval("var ${name} = window.${name};"); } } catch(e) {}`;
    }
  );

  return source;
}

/**
 * Ensure vm context has a `window` property that mirrors the context itself.
 */
function ensureWindowContext(context) {
  if (!context.window) {
    context.window = context;
  }
}

// Monkey-patch vm to auto-strip ESM syntax
const _origRunInContext = vm.runInContext;
const _origRunInNewContext = vm.runInNewContext;

vm.runInContext = function(code, context, options) {
  if (typeof code === "string" && (code.includes("export ") || code.includes("import ") || code.includes("window."))) {
    code = prepareSourceForVM(code);
  }
  ensureWindowContext(context);
  return _origRunInContext.call(vm, code, context, options);
};

vm.runInNewContext = function(code, context, options) {
  if (typeof code === "string" && (code.includes("export ") || code.includes("import ") || code.includes("window."))) {
    code = prepareSourceForVM(code);
  }
  if (context) ensureWindowContext(context);
  return _origRunInNewContext.call(vm, code, context, options);
};

module.exports = { prepareSourceForVM, ensureWindowContext };
